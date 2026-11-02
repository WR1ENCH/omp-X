use omp_host::framing::{LineSplitter, RawLine};

#[test]
fn valid_json_line_parses() {
    let mut s = LineSplitter::new(1024);
    let out = s.push(b"{\"type\":\"ready\",\"protocolVersion\":1}\n");
    assert_eq!(out.len(), 1);
    match &out[0] {
        RawLine::Json(v) => assert_eq!(v["protocolVersion"], 1),
        other => panic!("expected Json, got {other:?}"),
    }
}

#[test]
fn non_json_line_becomes_noise_not_panic() {
    let mut s = LineSplitter::new(1024);
    let out = s.push(
        b"[wecombot] \xe4\xbc\x81\xe4\xb8\x9a\xe5\xbe\xae\xe4\xbf\xa1\xe6\x9c\xba\xe5\x99\xa8\xe4\xba\xba\xe5\xb7\xb2\xe8\xbf\x9e\xe6\x8e\xa5\n",
    );
    assert_eq!(out.len(), 1);
    match &out[0] {
        RawLine::Noise(line) => assert!(line.starts_with("[wecombot]")),
        other => panic!("expected Noise, got {other:?}"),
    }
}

#[test]
fn frame_split_across_chunks_reassembles() {
    let mut s = LineSplitter::new(1024);
    assert!(s.push(b"{\"type\":\"resp").is_empty());
    let out = s.push(b"onse\",\"success\":true}\n");
    assert_eq!(out.len(), 1);
    match &out[0] {
        RawLine::Json(v) => assert_eq!(v["success"], true),
        other => panic!("expected Json, got {other:?}"),
    }
}

#[test]
fn frame_exceeding_cap_is_oversized_and_buffer_drops() {
    let mut s = LineSplitter::new(16);
    let out = s.push(b"0123456789ABCDEF"); // 16 bytes, no newline
    assert!(out.is_empty()); // continue buffering
    let out = s.push(b"X"); // 17th byte exceeds limit
    assert_eq!(out.len(), 1);
    assert_eq!(out[0], RawLine::Oversized { len: 17 });
    // The oversized frame's tail is swallowed until its \n; a line after the
    // \n parses normally and is not polluted by discarded bytes.
    let out = s.push(b"tail\n{\"a\":1}\n");
    assert_eq!(out.len(), 1);
    assert!(matches!(out[0], RawLine::Json(_)));
}

#[test]
fn multiple_lines_in_one_chunk() {
    let mut s = LineSplitter::new(1024);
    let out = s.push(b"noise line\n{\"a\":1}\n{\"b\":2}\n");
    assert_eq!(out.len(), 3);
    assert!(matches!(out[0], RawLine::Noise(_)));
    assert!(matches!(out[1], RawLine::Json(_)));
    assert!(matches!(out[2], RawLine::Json(_)));
}

#[test]
fn newline_not_counted_against_frame_limit() {
    // Frame limit applies to content; the trailing \n is framing (1 MiB frame
    // + \n = 1,048,577 bytes must NOT be flagged oversized).
    let mut s = LineSplitter::new(16);
    let content = "x".repeat(16);
    let out = s.push(format!("{content}\n").as_bytes());
    assert_eq!(out.len(), 1);
    assert!(matches!(out[0], RawLine::Noise(_)), "16 content bytes + \\n must stay within a 16-byte limit");
}

#[test]
fn crlf_line_parses_as_json() {
    let mut s = LineSplitter::new(1024);
    let out = s.push(b"{\"type\":\"ready\"}\r\n");
    assert_eq!(out.len(), 1);
    match &out[0] {
        RawLine::Json(v) => assert_eq!(v["type"], "ready"),
        other => panic!("expected Json, got {other:?}"),
    }
}

#[test]
fn oversized_frame_emits_once_then_tail_is_not_reclassified() {
    let mut s = LineSplitter::new(8);
    // Oversized frame split across chunks, cap crossed before its \n arrives.
    let out = s.push(b"0123456789"); // 10 content bytes > 8, no newline
    assert_eq!(out, vec![RawLine::Oversized { len: 10 }]);
    // Subsequent bytes of the same frame must be swallowed, not re-emitted
    // (one frame -> N events), nor surface as Noise at the terminating \n.
    let out = s.push(b"tail\n");
    assert!(out.is_empty());
    // A real subsequent line parses normally.
    let out = s.push(b"{\"a\":1}\n");
    assert_eq!(out.len(), 1);
    assert!(matches!(out[0], RawLine::Json(_)));
}