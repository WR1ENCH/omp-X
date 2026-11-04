use omp_protocol::{HostEvent, SessionId, WorktreeId};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum FrontendEvent {
    SessionStarted { session_id: SessionId, worktree_id: WorktreeId },
    SessionExited { session_id: SessionId, code: Option<i32> },
    SessionError { session_id: SessionId, error: String },
    PromptQueued { session_id: SessionId, request_id: String },
    TokenStream { session_id: SessionId, request_id: String, delta: String },
    ToolCallRequested { session_id: SessionId, request_id: String, tool: String, args: serde_json::Value },
    ToolCallResult { session_id: SessionId, request_id: String, result: serde_json::Value },
    ApprovalRequested { session_id: SessionId, request_id: String, kind: String, details: serde_json::Value },
    DiffProposed { session_id: SessionId, request_id: String, diff: String },
    WorktreeListed { worktrees: Vec<omp_protocol::WorktreeInfo> },
    WorktreeCreated { worktree: omp_protocol::WorktreeInfo },
    WorktreeDeleted { worktree_id: WorktreeId },
    HostEvent { session_id: SessionId, event: HostEvent },
}

pub fn emit_event<R: tauri::Runtime>(app: &AppHandle<R>, event: FrontendEvent) -> Result<(), tauri::Error> {
    app.emit("omp://event", event)
}