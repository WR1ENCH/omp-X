//! Session actor: owns a child omp process, frames its stdout, and exposes
//! parsed protocol events plus a bounded outbound channel for prompts.
//!
//! The event channel is `tokio::sync::broadcast` so multiple consumers (the
//! Tauri emitter, a debug logger, a test) can each hold their own receiver
//! without the producer caring how many there are. Only the stdout/stderr
//! pumps hold the `Sender`; `SessionHandle` deliberately does not, so the
//! channel closes as soon as the child's stdio reaches EOF and a consumer
//! observing `recv()` sees `Closed`. The outbound channel is `mpsc` with a
//! small bound: callers use `try_send` so a full channel returns an error
//! instead of blocking the UI thread.

use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::framing::{LineSplitter, RawLine};
use anyhow::{Context, Result};
use omp_protocol::inbound::{AgentEvent, Inbound};
use serde_json::Value;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
    sync::{broadcast, mpsc},
};
use tracing::{error, info, warn};

/// Number of outbound messages buffered before backpressure kicks in.
const OUTBOUND_CAPACITY: usize = 32;

/// Number of events buffered per broadcast receiver. A slow consumer drops the
/// oldest events; the UI must not stall the producer.
const EVENT_CAPACITY: usize = 256;

/// A parsed line from the child's stdout.
#[derive(Debug, Clone)]
pub enum SessionEvent {
    /// A protocol frame that parsed into a known `Inbound` variant.
    Inbound(Inbound),
    /// A non-JSON line (child stderr noise leaked to stdout, or a banner).
    Noise(String),
    /// A frame larger than `max_frame_bytes`; `len` is the observed length.
    Oversized { len: usize },
}

/// Shared ownership of the child process.
///
/// `Session` is the primary owner; `SessionGuard` holds the same handle so a
/// dropped session (or a dropped last handle) terminates the process instead
/// of leaking it. `std::sync::Mutex` keeps `try_wait`/`kill` synchronous,
/// matching the lifecycle contract, and is only held for the duration of a
/// non-blocking syscall.
type SharedChild = Arc<std::sync::Mutex<Child>>;

/// Handle to a running session. Clone freely; the process is torn down when
/// the session and every handle are gone.
#[derive(Clone)]
pub struct SessionHandle {
    session_id: String,
    cwd: String,
    outbound: mpsc::Sender<OutboundMessage>,
    created_at: u64,
    _guard: Arc<SessionGuard>,
}

/// Kills the child when the last reference is dropped.
///
/// `kill_on_drop(true)` alone is not enough: the `Child` lives behind a shared
/// handle so `Session`/`SessionHandle` can expose synchronous lifecycle
/// queries, and the runtime only reaps a dropped `Child`. The guard makes the
/// teardown explicit and reachable.
pub struct SessionGuard {
    child: SharedChild,
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        let mut child = match self.child.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        // `start_kill` is the synchronous form of `Child::kill`; it never
        // blocks and is a no-op if the child already exited.
        let _ = child.start_kill();
        let _ = child.try_wait();
    }
}

/// A live agent session: the child process plus its outbound queue.
pub struct Session {
    child: SharedChild,
    session_id: String,
    cwd: String,
    outbound: mpsc::Sender<OutboundMessage>,
    created_at: u64,
    _guard: Arc<SessionGuard>,
}

/// Message written to the child's stdin.
#[derive(Debug, Clone)]
pub enum OutboundMessage {
    /// A user prompt, serialized as `{"type":"prompt","message":...}`.
    Prompt(String),
    /// An `extension_ui_response` for a pending `extension_ui_request`.
    UiResponse { id: String, value: Value },
    /// Raw bytes, used for control commands the caller already serialized.
    Raw(String),
}

impl OutboundMessage {
    pub fn to_json_line(&self) -> String {
        match self {
            OutboundMessage::Prompt(p) => {
                serde_json::json!({"type": "prompt", "message": p}).to_string()
            }
            OutboundMessage::UiResponse { id, value } => {
                serde_json::json!({"type": "extension_ui_response", "id": id, "value": value})
                    .to_string()
            }
            OutboundMessage::Raw(raw) => raw.clone(),
        }
    }
}

/// Spawn `omp --mode rpc-ui` and start pumping its stdio.
///
/// `cwd` is the directory the agent works in. `extra_args` lets callers pass
/// flags such as `--no-tools` without this crate parsing them. The returned
/// receiver is the only event handle; the pumps hold the matching `Sender`
/// clones, so `recv()` reports `Closed` once the child's stdio reaches EOF.
///
/// `OMP_BIN` overrides the executable for tests; production leaves it unset
/// and the child is resolved from `PATH`.
pub fn spawn(
    cwd: &str,
    extra_args: &[String],
) -> Result<(Session, broadcast::Receiver<SessionEvent>)> {
    let program = std::env::var("OMP_BIN").unwrap_or_else(|_| "omp".to_string());
    let mut cmd = Command::new(program);
    cmd.arg("--mode")
        .arg("rpc-ui")
        .args(extra_args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().context("spawn omp --mode rpc-ui")?;
    let mut stdin = child.stdin.take().context("child stdin not piped")?;
    let mut stdout = child.stdout.take().context("child stdout not piped")?;
    let mut stderr = child.stderr.take().context("child stderr not piped")?;

    let (outbound_tx, mut outbound_rx) = mpsc::channel::<OutboundMessage>(OUTBOUND_CAPACITY);
    let (event_tx, event_rx) = broadcast::channel::<SessionEvent>(EVENT_CAPACITY);

    let session_id = format!("sess-{}", uuid_suffix());
    let created_at = unix_now_secs();
    let child: SharedChild = Arc::new(std::sync::Mutex::new(child));
    let guard = Arc::new(SessionGuard {
        child: child.clone(),
    });

    // stdin pump: bounded channel -> child stdin. When `Session` drops, its
    // `outbound_tx` drops, the channel closes, and the pump shuts down stdin.
    tokio::spawn(async move {
        while let Some(msg) = outbound_rx.recv().await {
            let line = msg.to_json_line();
            let mut bytes = line.into_bytes();
            bytes.push(b'\n');
            if stdin.write_all(&bytes).await.is_err() {
                warn!("child stdin closed; dropping outbound writer");
                break;
            }
        }
        let _ = stdin.shutdown().await;
    });

    // stdout pump: frame JSONL, emit Inbound/Noise/Oversized. The advertised
    // `maxFrameBytes` raises the splitter limit in place so a frame buffered
    // across the upgrade is not lost.
    tokio::spawn({
        let event_tx = event_tx.clone();
        async move {
            let mut splitter = LineSplitter::new(1024);
            let mut buf = vec![0u8; 8192];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut max_frame = None;
                        for raw in splitter.push(&buf[..n]) {
                            let ev = match raw {
                                RawLine::Json(v) => {
                                    if max_frame.is_none() {
                                        if let Some(m) =
                                            v.get("maxFrameBytes").and_then(Value::as_u64)
                                        {
                                            max_frame = Some(m as usize);
                                        }
                                    }
                                    match Inbound::from_value(v) {
                                        Inbound::Unknown(raw) => SessionEvent::Noise(
                                            serde_json::to_string(&raw).unwrap_or_default(),
                                        ),
                                        other => SessionEvent::Inbound(other),
                                    }
                                }
                                RawLine::Noise(s) => SessionEvent::Noise(s),
                                RawLine::Oversized { len } => SessionEvent::Oversized { len },
                            };
                            // broadcast: no receivers is not an error.
                            let _ = event_tx.send(ev);
                        }
                        if let Some(m) = max_frame {
                            splitter.set_max_frame_bytes(m);
                        }
                    }
                    Err(e) => {
                        error!("stdout read error: {e}");
                        break;
                    }
                }
            }
        }
    });

    // stderr pump: forwarded as Noise so diagnostics survive without being
    // mistaken for protocol frames.
    tokio::spawn({
        let event_tx = event_tx.clone();
        async move {
            let mut buf = vec![0u8; 4096];
            loop {
                match stderr.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                        if !text.is_empty() {
                            let _ = event_tx.send(SessionEvent::Noise(text));
                        }
                    }
                    Err(e) => {
                        error!("stderr read error: {e}");
                        break;
                    }
                }
            }
        }
    });

    // Drop the original sender so the channel closes when both pumps exit.
    drop(event_tx);

    info!("spawned session {session_id} (omp --mode rpc-ui)");
    Ok((
        Session {
            child,
            session_id,
            cwd: cwd.to_string(),
            outbound: outbound_tx,
            created_at,
            _guard: guard,
        },
        event_rx,
    ))
}

impl Session {
    pub fn handle(&self) -> SessionHandle {
        SessionHandle {
            session_id: self.session_id.clone(),
            cwd: self.cwd.clone(),
            outbound: self.outbound.clone(),
            created_at: self.created_at,
            _guard: self._guard.clone(),
        }
    }

    pub fn id(&self) -> &str {
        &self.session_id
    }

    pub fn cwd(&self) -> &str {
        &self.cwd
    }

    pub fn created_at(&self) -> u64 {
        self.created_at
    }

    /// Non-blocking child status check; reaps the child if it has exited.
    pub fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        self.child
            .lock()
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "child mutex poisoned"))?
            .try_wait()
    }

    /// Ask the child to terminate. The caller is responsible for reaping via
    /// `try_wait` (or dropping the session).
    pub fn kill(&mut self) -> std::io::Result<()> {
        self.child
            .lock()
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "child mutex poisoned"))?
            .start_kill()
    }
}

impl SessionHandle {
    pub fn id(&self) -> &str {
        &self.session_id
    }

    pub fn cwd(&self) -> &str {
        &self.cwd
    }

    pub fn created_at(&self) -> u64 {
        self.created_at
    }

    /// Queue a prompt. Returns `Err` when the session is gone or the channel
    /// is full, so callers can surface a message rather than hang.
    pub fn send_prompt(&self, prompt: &str) -> Result<(), SessionSendError> {
        self.outbound
            .try_send(OutboundMessage::Prompt(prompt.to_string()))
            .map_err(|e| match e {
                mpsc::error::TrySendError::Full(_) => SessionSendError::QueueFull,
                mpsc::error::TrySendError::Closed(_) => SessionSendError::Closed,
            })
    }

    pub fn send_ui_response(&self, id: &str, value: Value) -> Result<(), SessionSendError> {
        self.outbound
            .try_send(OutboundMessage::UiResponse {
                id: id.to_string(),
                value,
            })
            .map_err(|e| match e {
                mpsc::error::TrySendError::Full(_) => SessionSendError::QueueFull,
                mpsc::error::TrySendError::Closed(_) => SessionSendError::Closed,
            })
    }

    pub fn send_raw(&self, line: String) -> Result<(), SessionSendError> {
        self.outbound
            .try_send(OutboundMessage::Raw(line))
            .map_err(|e| match e {
                mpsc::error::TrySendError::Full(_) => SessionSendError::QueueFull,
                mpsc::error::TrySendError::Closed(_) => SessionSendError::Closed,
            })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SessionSendError {
    #[error("session outbound queue is full")]
    QueueFull,
    #[error("session is closed")]
    Closed,
}

fn unix_now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Cheap unique suffix without pulling in a uuid dependency. A monotonic
/// counter keeps concurrent spawns distinct even when the clock resolution is
/// coarse; the pid and time keep ids distinct across processes.
fn uuid_suffix() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let pid = std::process::id() as u64;
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed) as u64;
    nanos ^ (pid << 32) ^ seq.wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

/// Extract the assistant-facing text delta from an `AgentEvent`.
///
/// The protocol nests the real payload under `assistantMessageEvent`; the
/// delta text lives at `.delta`. Thinking deltas are surfaced separately so the
/// UI can render them collapsed.
pub fn assistant_delta(event: &AgentEvent) -> Option<(AssistantDeltaKind, String)> {
    match event {
        AgentEvent::MessageUpdate { event } => match event {
            omp_protocol::inbound::AssistantMessageEvent::TextDelta(v) => v
                .get("delta")
                .and_then(Value::as_str)
                .map(|d| (AssistantDeltaKind::Text, d.to_string())),
            omp_protocol::inbound::AssistantMessageEvent::ThinkingDelta(v) => v
                .get("delta")
                .and_then(Value::as_str)
                .map(|d| (AssistantDeltaKind::Thinking, d.to_string())),
            _ => None,
        },
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssistantDeltaKind {
    Text,
    Thinking,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outbound_prompt_serializes_to_protocol_shape() {
        let line = OutboundMessage::Prompt("hello".into()).to_json_line();
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["type"], "prompt");
        assert_eq!(v["message"], "hello");
    }

    #[test]
    fn outbound_ui_response_serializes_to_protocol_shape() {
        let line = OutboundMessage::UiResponse {
            id: "abc".into(),
            value: Value::String("Approve".into()),
        }
        .to_json_line();
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["type"], "extension_ui_response");
        assert_eq!(v["id"], "abc");
        assert_eq!(v["value"], "Approve");
    }

    #[test]
    fn text_delta_is_extracted() {
        let v: Value = serde_json::from_str(
            r#"{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}"#,
        )
        .unwrap();
        let inbound = Inbound::from_value(v);
        let Inbound::Event(event) = &inbound else {
            panic!("expected Inbound::Event, got {inbound:?}");
        };
        assert_eq!(
            assistant_delta(event),
            Some((AssistantDeltaKind::Text, "hi".to_string()))
        );
    }

    #[test]
    fn thinking_delta_is_classified_separately() {
        let v: Value = serde_json::from_str(
            r#"{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"hmm"}}"#,
        )
        .unwrap();
        let inbound = Inbound::from_value(v);
        let Inbound::Event(event) = &inbound else {
            panic!("expected Inbound::Event, got {inbound:?}");
        };
        assert_eq!(
            assistant_delta(event),
            Some((AssistantDeltaKind::Thinking, "hmm".to_string()))
        );
    }

    #[test]
    fn non_delta_events_have_no_assistant_delta() {
        let v: Value = serde_json::from_str(r#"{"type":"session_settled"}"#).unwrap();
        let inbound = Inbound::from_value(v);
        let Inbound::Event(event) = &inbound else {
            panic!("expected Inbound::Event, got {inbound:?}");
        };
        assert_eq!(assistant_delta(event), None);
    }
}
