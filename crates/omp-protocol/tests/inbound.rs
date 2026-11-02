use omp_protocol::inbound::Inbound;
use std::fs;

fn clean_fixture_lines() -> Vec<serde_json::Value> {
    // cargo test 的 cwd 是 crate 目录（crates/omp-protocol），fixture 在 workspace 根
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fixtures/clean_round.jsonl");
    fs::read_to_string(path)
        .expect("fixture missing; run scripts/capture_fixtures.sh first (Task 2)")
        .lines()
        .filter(|l| l.trim_start().starts_with('{'))
        .map(|l| serde_json::from_str(l).expect("fixture line must be valid JSON"))
        .collect()
}

#[test]
fn every_clean_fixture_line_parses_without_panic() {
    let lines = clean_fixture_lines();
    assert!(lines.len() >= 8, "expected a full turn, got {} lines", lines.len());
    for v in lines {
        let _ = Inbound::from_value(v); // 形状漂移落 Unknown，不 panic
    }
}

#[test]
fn ready_handshake_parses_structured() {
    let v: serde_json::Value = serde_json::from_str(
        r#"{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],
            "maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}"#,
    )
    .unwrap();
    match Inbound::from_value(v) {
        Inbound::Ready(r) => {
            assert_eq!(r.protocol_version, 1);
            assert_eq!(r.max_frame_bytes, 1_048_576);
        }
        other => panic!("expected Ready, got {other:?}"),
    }
}

#[test]
fn ui_request_parses_with_extra_fields_preserved() {
    let v: serde_json::Value = serde_json::from_str(
        r#"{"type":"extension_ui_request","id":"15bc9b33","method":"select",
            "title":"Allow tool: bash\nCommand: echo hi","options":["Approve","Deny"],
            "someFutureField":42}"#,
    )
    .unwrap();
    match Inbound::from_value(v) {
        Inbound::ExtensionUiRequest(r) => {
            assert_eq!(r.id, "15bc9b33");
            assert_eq!(r.method, "select");
            assert_eq!(r.options.as_deref(), Some(&["Approve".to_string(), "Deny".to_string()][..]));
            assert_eq!(r.extra.get("someFutureField").unwrap(), &serde_json::json!(42));
        }
        other => panic!("expected ExtensionUiRequest, got {other:?}"),
    }
}

#[test]
fn unknown_type_falls_to_unknown_variant() {
    let v = serde_json::json!({"type":"holodeck_invoke","payload":{"x":1}});
    match Inbound::from_value(v) {
        Inbound::Unknown(raw) => assert_eq!(raw["type"], "holodeck_invoke"),
        other => panic!("expected Unknown, got {other:?}"),
    }
}

#[test]
fn extension_ui_response_serializes_as_specified() {
    // 应答格式（§0）：{"type":"extension_ui_response","id":"…","value":"Approve"}
    let resp = omp_protocol::inbound::extension_ui_response("15bc9b33", serde_json::json!("Approve"));
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["type"], "extension_ui_response");
    assert_eq!(v["id"], "15bc9b33");
    assert_eq!(v["value"], "Approve");
}