use serde_json::Value;

#[derive(Debug, PartialEq)]
pub enum RawLine {
    Json(Value),
    Noise(String),
    Oversized { len: usize },
}

pub struct LineSplitter {
    buf: Vec<u8>,
    max_frame_bytes: usize,
    /// True while swallowing the tail of an oversized frame whose cap was
    /// crossed before its terminating `\n` arrived. Everything up to and
    /// including that `\n` belongs to the frame; nothing may be re-emitted.
    discarding: bool,
}

impl LineSplitter {
    pub fn new(max_frame_bytes: usize) -> Self {
        Self {
            buf: Vec::new(),
            max_frame_bytes,
            discarding: false,
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> Vec<RawLine> {
        let mut results = Vec::new();

        if self.discarding {
            // Rest of an oversized frame: swallow up to and including its \n.
            match chunk.iter().position(|&b| b == b'\n') {
                Some(nl) => {
                    self.buf.extend_from_slice(&chunk[nl + 1..]);
                    self.discarding = false;
                }
                None => return results, // whole chunk is oversized-frame tail
            }
        } else {
            self.buf.extend_from_slice(chunk);
        }

        while let Some(newline_pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line_bytes = self.buf.drain(..=newline_pos).collect::<Vec<u8>>();

            // Frame limit applies to content bytes; the trailing \n is framing,
            // not payload (plan: maxFrameBytes bounds the JSON frame).
            let content_len = line_bytes.len() - 1;
            if content_len > self.max_frame_bytes {
                // A complete line is a complete oversized frame; its \n already
                // consumed, so bytes after it are a fresh frame. No discard state.
                results.push(RawLine::Oversized { len: line_bytes.len() });
                continue;
            }

            // Strip trailing \r for CRLF tolerance.
            let mut content = &line_bytes[..content_len];
            if content.last() == Some(&b'\r') {
                content = &content[..content.len() - 1];
            }

            match serde_json::from_slice::<Value>(content) {
                Ok(v) => results.push(RawLine::Json(v)),
                Err(_) => results.push(RawLine::Noise(String::from_utf8_lossy(content).into_owned())),
            }
        }

        // Partial frame without newline crossed the cap: emit ONE Oversized.
        // The frame continues until its terminating \n; enter discarding so
        // subsequent chunks neither re-emit (one frame -> N events) nor
        // surface as spurious Noise when that \n arrives.
        if !self.discarding && self.buf.len() > self.max_frame_bytes {
            let oversized_len = self.buf.len();
            self.buf.clear();
            self.discarding = true;
            results.push(RawLine::Oversized { len: oversized_len });
        }

        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_json() {
        let mut s = LineSplitter::new(1024);
        let out = s.push(b"{\"type\":\"ready\"}\n");
        assert_eq!(out.len(), 1);
        assert!(matches!(out[0], RawLine::Json(_)));
    }
}
