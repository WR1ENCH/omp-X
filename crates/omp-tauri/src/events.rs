//! Frontend event shapes and the two push channels.
//!
//! Every agent event is wrapped in a [`SessionEnvelope`] carrying the owning
//! session id, and pushed to the main webview on `omp://event`. Raw PTY output
//! travels on `omp://pty` via [`PtyEvent`].

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, EventTarget};

/// Channel carrying agent lifecycle events to the main webview.
pub const EVENT_CHANNEL: &str = "omp://event";

/// Channel carrying raw PTY output / exit events.
pub const PTY_CHANNEL: &str = "omp://pty";

/// Label of the single webview window the backend pushes events to.
const MAIN_WINDOW_LABEL: &str = "main";

/// Kind of assistant message delta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeltaKind {
    Text,
    Thinking,
}

/// A model advertised by the agent protocol.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A single event delivered to the frontend.
///
/// The wire form is `{"type": "snake_case_variant", ...camelCaseFields}` so
/// the TypeScript union in `src/types/ipc.ts` can discriminate on `type`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum FrontendEvent {
    Ready {
        protocol_version: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_frame_bytes: Option<u64>,
    },
    AgentStart,
    TurnStart,
    MessageStart {
        role: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message_id: Option<String>,
    },
    MessageDelta {
        kind: DeltaKind,
        delta: String,
    },
    MessageEnd {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message_id: Option<String>,
    },
    TurnEnd,
    AgentEnd,
    PromptResult {
        #[serde(default)]
        success: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        status: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        data: Option<Value>,
    },
    AvailableCommands {
        commands: Vec<Value>,
    },
    AvailableModels {
        models: Vec<ModelInfo>,
    },
    ToolExecutionStart {
        tool_call_id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        args: Option<Value>,
    },
    ToolExecutionEnd {
        tool_call_id: String,
        name: String,
        status: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    UiRequest {
        id: String,
        method: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        options: Option<Vec<String>>,
        #[serde(default)]
        extra: serde_json::Map<String, Value>,
    },
    SessionSettled,
    SessionClosed {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        code: Option<i32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    /// Reply to a command the agent issued (`Inbound::Response`).
    Response {
        command: String,
        success: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        data: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Noise {
        text: String,
    },
    Error {
        message: String,
    },
}

/// Envelope wrapping every event so the frontend can route by session.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEnvelope {
    pub session_id: String,
    pub event: FrontendEvent,
}

/// Raw PTY byte stream or process exit.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum PtyEvent {
    Data {
        pid: u32,
        data: String,
    },
    Exit {
        pid: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        code: Option<i32>,
    },
}

/// Push an agent event to the main webview, tagged with its session.
pub fn emit_session_event<R: tauri::Runtime>(
    app: &AppHandle<R>,
    session_id: &str,
    event: FrontendEvent,
) -> Result<(), tauri::Error> {
    app.emit_to(
        EventTarget::webview_window(MAIN_WINDOW_LABEL),
        EVENT_CHANNEL,
        SessionEnvelope {
            session_id: session_id.to_string(),
            event,
        },
    )
}

/// Push a PTY data/exit event to the main webview.
pub fn emit_pty_event<R: tauri::Runtime>(
    app: &AppHandle<R>,
    event: PtyEvent,
) -> Result<(), tauri::Error> {
    app.emit_to(
        EventTarget::webview_window(MAIN_WINDOW_LABEL),
        PTY_CHANNEL,
        event,
    )
}
