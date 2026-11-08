//! Tauri command surface.
//!
//! Every command takes flat parameters (Tauri's default `ArgumentCase::Camel`
//! maps the camelCase JS keys straight onto these names) and returns a
//! camelCase-serializing type or `Result<_, String>`. The command set here is
//! mirrored by `build.rs`, `lib.rs` and `capabilities/default.json`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{command, AppHandle, State};
use tokio::sync::Mutex;

use omp_host::session::{Session, SessionEvent, SessionHandle};
use omp_protocol::inbound::{AgentEvent, AssistantMessageEvent, Inbound};

use crate::events::{emit_session_event, DeltaKind, FrontendEvent};

pub type SessionId = String;

/// Process-wide session registry.
pub struct AppState {
    /// Live sessions keyed by session id. `Arc` lets the per-session
    /// supervisor task share the map without borrowing `State`.
    pub sessions: Arc<Mutex<HashMap<SessionId, ManagedSession>>>,
    /// Set once at startup so commands that only receive `State` can still
    /// emit `session_closed`.
    app: std::sync::OnceLock<AppHandle<tauri::Wry>>,
}

/// A live session plus the handle the rest of the app uses to talk to it.
pub struct ManagedSession {
    pub handle: SessionHandle,
    pub session: Arc<Mutex<Session>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            app: std::sync::OnceLock::new(),
        }
    }
}

impl AppState {
    pub fn set_app(&self, app: AppHandle<tauri::Wry>) {
        let _ = self.app.set(app);
    }

    pub fn app(&self) -> Option<&AppHandle<tauri::Wry>> {
        self.app.get()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnSessionResult {
    pub session_id: SessionId,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: SessionId,
    pub cwd: String,
    pub alive: bool,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    #[serde(serialize_with = "serialize_opt_or_empty")]
    pub branch: Option<String>,
    #[serde(serialize_with = "serialize_opt_or_empty")]
    pub commit: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    pub prunable: bool,
}

/// The frontend types `branch`/`commit` as `string`; absent values serialize
/// as the empty string rather than `null`.
fn serialize_opt_or_empty<S>(value: &Option<String>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(value.as_deref().unwrap_or(""))
}

fn empty_worktree_info() -> WorktreeInfo {
    WorktreeInfo {
        path: String::new(),
        branch: None,
        commit: None,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
    }
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------

fn pick_string(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(Value::as_str) {
            return Some(s.to_string());
        }
    }
    None
}

fn pick_value(value: &Value, keys: &[&str]) -> Option<Value> {
    for key in keys {
        if let Some(v) = value.get(*key) {
            if !v.is_null() {
                return Some(v.clone());
            }
        }
    }
    None
}

/// The real wire signals tool failure with `isError` rather than a `status`
/// string, so a missing status must not read as success.
fn pick_failed(value: &Value) -> bool {
    if let Some(b) = value.get("isError").and_then(Value::as_bool) {
        return b;
    }
    if let Some(s) = value.get("is_error").and_then(Value::as_bool) {
        return s;
    }
    false
}

fn map_agent_event(event: AgentEvent) -> Option<FrontendEvent> {
    match event {
        AgentEvent::AgentStart(_) => Some(FrontendEvent::AgentStart),
        AgentEvent::TurnStart(_) => Some(FrontendEvent::TurnStart),
        AgentEvent::MessageStart(v) => Some(FrontendEvent::MessageStart {
            role: v
                .get("message")
                .and_then(|m| m.get("role"))
                .and_then(Value::as_str)
                .unwrap_or("assistant")
                .to_string(),
            message_id: pick_string(&v, &["messageId", "message_id"]),
        }),
        AgentEvent::MessageUpdate { event } => {
            let (kind, delta) = match &event {
                AssistantMessageEvent::TextDelta(v) => {
                    (DeltaKind::Text, pick_string(v, &["delta", "text"]))
                }
                AssistantMessageEvent::ThinkingDelta(v) => {
                    (DeltaKind::Thinking, pick_string(v, &["delta", "thinking"]))
                }
                _ => (DeltaKind::Text, None),
            };
            delta.map(|delta| FrontendEvent::MessageDelta { kind, delta })
        }
        AgentEvent::MessageEnd(v) => Some(FrontendEvent::MessageEnd {
            message_id: pick_string(&v, &["messageId", "message_id"]),
        }),
        AgentEvent::TurnEnd(_) => Some(FrontendEvent::TurnEnd),
        AgentEvent::AgentEnd(_) => Some(FrontendEvent::AgentEnd),
        AgentEvent::PromptResult(v) => Some(FrontendEvent::PromptResult {
            success: v.get("status").and_then(Value::as_str) != Some("failed"),
            status: pick_string(&v, &["status"]),
            data: v.get("data").cloned(),
            session_settled: v
                .get("sessionSettled")
                .and_then(Value::as_bool)
                .unwrap_or_default(),
        }),
        AgentEvent::SessionSettled(_) => Some(FrontendEvent::SessionSettled),
        AgentEvent::AvailableCommandsUpdate { commands } => {
            Some(FrontendEvent::AvailableCommands { commands })
        }
        AgentEvent::ToolExecutionStart(v) => Some(FrontendEvent::ToolExecutionStart {
            tool_call_id: pick_string(&v, &["toolCallId", "tool_call_id", "id"])
                .unwrap_or_default(),
            name: pick_string(&v, &["name", "toolName", "tool_name", "tool", "title"])
                .unwrap_or_else(|| "unknown".to_string()),
            args: pick_value(&v, &["args", "input", "arguments"]),
        }),
        AgentEvent::ToolExecutionEnd(v) => Some(FrontendEvent::ToolExecutionEnd {
            tool_call_id: pick_string(&v, &["toolCallId", "tool_call_id", "id"])
                .unwrap_or_default(),
            name: pick_string(&v, &["name", "toolName", "tool_name", "tool", "title"])
                .unwrap_or_else(|| "unknown".to_string()),
            status: if pick_failed(&v) {
                "error".to_string()
            } else {
                pick_string(&v, &["status"]).unwrap_or_else(|| "ok".to_string())
            },
            result: pick_value(&v, &["result", "output", "data"]),
            error: pick_string(&v, &["error"]),
        }),
        AgentEvent::Raw(_) => None,
    }
}

fn map_host_event(event: SessionEvent) -> Option<FrontendEvent> {
    match event {
        SessionEvent::Noise(text) => Some(FrontendEvent::Noise { text }),
        SessionEvent::Oversized { len } => Some(FrontendEvent::Error {
            message: format!("frame exceeded the protocol limit ({len} bytes)"),
        }),
        SessionEvent::Inbound(Inbound::Ready(ready)) => Some(FrontendEvent::Ready {
            protocol_version: ready.protocol_version,
            max_frame_bytes: (ready.max_frame_bytes != 0).then_some(ready.max_frame_bytes),
        }),
        SessionEvent::Inbound(Inbound::Response(response)) => Some(FrontendEvent::Response {
            command: response.command,
            success: response.success,
            data: response.data,
            error: response.error,
        }),
        SessionEvent::Inbound(Inbound::ExtensionUiRequest(request)) => {
            Some(FrontendEvent::UiRequest {
                id: request.id,
                method: request.method,
                title: request.title,
                options: request.options,
                extra: request.extra,
            })
        }
        SessionEvent::Inbound(Inbound::Event(event)) => map_agent_event(event),
        SessionEvent::Inbound(Inbound::Unknown(raw)) => Some(FrontendEvent::Noise {
            text: serde_json::to_string(&raw).unwrap_or_default(),
        }),
    }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/// Resolve and validate the working directory for a new session.
///
/// `~` expands to `$HOME`; an empty string falls back to the process's
/// current directory. The result is canonicalized so the frontend sees a
/// stable absolute path.
fn resolve_cwd(cwd: &str) -> Result<String, String> {
    let raw = cwd.trim();
    let expanded = if raw.is_empty() {
        std::env::current_dir()
            .map_err(|e| format!("cannot determine current directory: {e}"))?
            .to_string_lossy()
            .into_owned()
    } else if raw == "~" || raw.starts_with("~/") {
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
        format!("{home}{}", &raw[1..])
    } else {
        raw.to_string()
    };
    let path = PathBuf::from(&expanded);
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("cwd {}: {e}", expanded))?;
    if !canonical.is_dir() {
        return Err(format!("cwd is not a directory: {}", canonical.display()));
    }
    Ok(canonical.to_string_lossy().into_owned())
}

#[command]
pub async fn spawn_session(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    extra_args: Option<Vec<String>>,
) -> Result<SpawnSessionResult, String> {
    let cwd = resolve_cwd(&cwd)?;
    let (session, events) = omp_host::session::spawn(&cwd, extra_args.as_deref().unwrap_or(&[]))
        .map_err(|e| format!("spawn failed: {e:#}"))?;

    let session_id = session.id().to_string();
    let session_cwd = session.cwd().to_string();
    let handle = session.handle();
    let session = Arc::new(Mutex::new(session));

    state.set_app(app.clone());
    state.sessions.lock().await.insert(
        session_id.clone(),
        ManagedSession {
            handle,
            session: session.clone(),
        },
    );

    tokio::spawn(run_session(
        app,
        state.sessions.clone(),
        session_id.clone(),
        session,
        events,
    ));

    Ok(SpawnSessionResult {
        session_id,
        cwd: session_cwd,
    })
}

/// Forwards protocol events and reaps the child until it exits.
///
/// The broadcast receiver is the only event handle the Tauri side holds; the
/// channel closes when the child's stdio reaches EOF. A `Lagged` error is
/// logged and skipped (never treated as closure), and once the channel closes
/// the task keeps polling `try_wait` so an exited child still produces a
/// `session_closed` event.
async fn run_session(
    app: AppHandle,
    sessions: Arc<Mutex<HashMap<SessionId, ManagedSession>>>,
    session_id: SessionId,
    session: Arc<Mutex<Session>>,
    mut events: tokio::sync::broadcast::Receiver<SessionEvent>,
) {
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut recv_open = true;

    loop {
        tokio::select! {
            biased;
            event = events.recv(), if recv_open => {
                match event {
                    Ok(event) => {
                        if let Some(frontend) = map_host_event(event) {
                            if let Err(e) = emit_session_event(&app, &session_id, frontend) {
                                tracing::warn!("emit for session {session_id} failed: {e}");
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("session {session_id} emitter lagged by {n} events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        tracing::debug!("session {session_id} event channel closed");
                        recv_open = false;
                    }
                }
            }
            _ = tick.tick() => {
                let status = {
                    let mut guard = session.lock().await;
                    guard.try_wait()
                };
                match status {
                    Ok(Some(status)) => {
                        let code = status.code();
                        let removed = sessions.lock().await.remove(&session_id).is_some();
                        if removed {
                            if let Err(e) = emit_session_event(
                                &app,
                                &session_id,
                                FrontendEvent::SessionClosed { code, reason: None },
                            ) {
                                tracing::warn!("emit session_closed for {session_id}: {e}");
                            }
                        }
                        return;
                    }
                    Ok(None) => {}
                    Err(e) => tracing::warn!("try_wait for session {session_id}: {e}"),
                }
            }
        }
    }
}

/// Kill the child and reap it, bounded to two seconds.
async fn terminate_session(session: &Arc<Mutex<Session>>) {
    {
        let mut guard = session.lock().await;
        if let Err(e) = guard.kill() {
            tracing::warn!("kill session failed: {e}");
            return;
        }
    }

    let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
    loop {
        let status = {
            let mut guard = session.lock().await;
            guard.try_wait()
        };
        match status {
            Ok(Some(_)) => return,
            Ok(None) => {}
            Err(e) => {
                tracing::warn!("reap after kill failed: {e}");
                return;
            }
        }
        if tokio::time::Instant::now() >= deadline {
            tracing::warn!("session did not exit within 2s; guard will kill on drop");
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn emit_session_closed(state: &AppState, session_id: &str, code: Option<i32>) {
    if let Some(app) = state.app() {
        if let Err(e) = emit_session_event(
            app,
            session_id,
            FrontendEvent::SessionClosed { code, reason: None },
        ) {
            tracing::warn!("emit session_closed for {session_id}: {e}");
        }
    }
}

#[command]
pub async fn send_prompt(
    state: State<'_, AppState>,
    session_id: String,
    prompt: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let managed = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown session: {session_id}"))?;
    managed
        .handle
        .send_prompt(&prompt)
        .map_err(|e| format!("cannot send prompt: {e:?}"))
}

#[command]
pub async fn send_ui_response(
    state: State<'_, AppState>,
    session_id: String,
    request_id: String,
    response: Value,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let managed = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown session: {session_id}"))?;
    managed
        .handle
        .send_ui_response(&request_id, response)
        .map_err(|e| format!("cannot send ui response: {e:?}"))
}

#[command]
pub async fn close_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let managed = {
        let mut sessions = state.sessions.lock().await;
        sessions.remove(&session_id)
    };
    match managed {
        Some(managed) => {
            terminate_session(&managed.session).await;
            emit_session_closed(&state, &session_id, None);
            Ok(())
        }
        // Already reaped by the supervisor, which emitted `session_closed`.
        None => Ok(()),
    }
}

#[command]
pub async fn abort(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    close_session(state, session_id).await
}

#[command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let sessions = state.sessions.lock().await;
    let mut infos = Vec::with_capacity(sessions.len());
    for (id, managed) in sessions.iter() {
        let mut guard = managed.session.lock().await;
        let alive = !matches!(guard.try_wait(), Ok(Some(_)));
        infos.push(SessionInfo {
            id: id.clone(),
            cwd: guard.cwd().to_string(),
            alive,
            created_at: guard.created_at(),
        });
    }
    Ok(infos)
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

/// Validate an existing directory, returning its canonical path.
fn canonical_dir(path: &str, label: &str) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err(format!("{label} must be an absolute path: {path}"));
    }
    let canonical = raw
        .canonicalize()
        .map_err(|e| format!("{label} {}: {e}", path))?;
    if !canonical.is_dir() {
        return Err(format!(
            "{label} is not a directory: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

/// Validate a not-yet-existing worktree path: absolute, no `..` escape, and
/// the parent must already exist so the result is canonicalized.
fn validate_new_path(path: &str) -> Result<PathBuf, String> {
    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err(format!("worktree path must be absolute: {path}"));
    }
    if raw
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!("worktree path must not contain `..`: {path}"));
    }
    let parent = raw
        .parent()
        .ok_or_else(|| format!("invalid worktree path: {path}"))?;
    let name = raw
        .file_name()
        .ok_or_else(|| format!("invalid worktree path: {path}"))?;
    let parent = parent
        .canonicalize()
        .map_err(|e| format!("worktree parent {}: {e}", parent.display()))?;
    Ok(parent.join(name))
}

fn validate_branch(branch: &str) -> Result<(), String> {
    if branch.is_empty() {
        return Err("branch must not be empty".to_string());
    }
    if branch.starts_with('-') {
        return Err(format!("branch must not start with `-`: {branch}"));
    }
    let invalid = branch.contains("..")
        || branch.contains(char::is_whitespace)
        || branch.contains('~')
        || branch.contains('^')
        || branch.contains(':')
        || branch.contains('?')
        || branch.contains('*')
        || branch.contains('[')
        || branch.contains('\\')
        || branch.contains("@{")
        || branch.contains("//")
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with(".lock")
        || branch == "@";
    if invalid {
        return Err(format!("invalid branch name: {branch}"));
    }
    Ok(())
}

#[command]
pub async fn worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let repo = canonical_dir(&repo_path, "repo_path")?;
    let args = vec![
        "worktree".to_string(),
        "list".to_string(),
        "--porcelain".to_string(),
    ];
    let output = git_output(&repo, &args).await?;
    Ok(parse_worktree_list(&output))
}

#[command]
pub async fn worktree_create(
    repo_path: String,
    path: String,
    branch: String,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    let repo = canonical_dir(&repo_path, "repo_path")?;
    let worktree_path = validate_new_path(&path)?;
    validate_branch(&branch)?;
    if let Some(base) = &base_branch {
        validate_branch(base)?;
    }

    let mut args = vec![
        "worktree".to_string(),
        "add".to_string(),
        "-b".to_string(),
        branch,
        "--".to_string(),
        worktree_path.to_string_lossy().into_owned(),
    ];
    if let Some(base) = base_branch {
        args.push(base);
    }
    git_output(&repo, &args).await?;

    // Enrich the created entry with the commit/branch git recorded.
    let created = worktree_path.to_string_lossy().into_owned();
    let listed = worktree_list(repo_path).await?;
    Ok(listed
        .into_iter()
        .find(|info| {
            info.path == created
                || Path::new(&info.path)
                    .canonicalize()
                    .map(|p| p == worktree_path)
                    .unwrap_or(false)
        })
        .unwrap_or_else(|| WorktreeInfo {
            path: created,
            branch: None,
            commit: None,
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
        }))
}

#[command]
pub async fn worktree_remove(repo_path: String, path: String, force: bool) -> Result<(), String> {
    let repo = canonical_dir(&repo_path, "repo_path")?;
    let worktree = canonical_dir(&path, "worktree path")?;

    if !force {
        let status = git_output(
            &worktree,
            &["status".to_string(), "--porcelain".to_string()],
        )
        .await?;
        if !status.trim().is_empty() {
            return Err(format!(
                "worktree {} has uncommitted changes; use force to remove",
                worktree.display()
            ));
        }
    }

    let mut args = vec!["worktree".to_string(), "remove".to_string()];
    if force {
        args.push("--force".to_string());
    }
    args.push("--".to_string());
    args.push(worktree.to_string_lossy().into_owned());
    git_output(&repo, &args).await?;
    Ok(())
}

#[command]
pub async fn worktree_prune(repo_path: String) -> Result<(), String> {
    let repo = canonical_dir(&repo_path, "repo_path")?;
    let args = vec!["worktree".to_string(), "prune".to_string()];
    git_output(&repo, &args).await?;
    Ok(())
}

fn parse_worktree_list(output: &str) -> Vec<WorktreeInfo> {
    let mut out = Vec::new();
    let mut current = empty_worktree_info();
    let mut started = false;

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            if started {
                out.push(std::mem::replace(&mut current, empty_worktree_info()));
            }
            started = true;
            current.path = rest.trim().to_string();
        } else if !started {
            continue;
        } else if let Some(rest) = line.strip_prefix("HEAD ") {
            current.commit = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("branch ") {
            current.branch = Some(rest.trim().to_string());
        } else if line == "bare" {
            current.bare = true;
        } else if line == "detached" {
            current.detached = true;
        } else if line.starts_with("locked") {
            current.locked = true;
        } else if line.starts_with("prunable") {
            current.prunable = true;
        }
    }

    if started {
        out.push(current);
    }
    out
}

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

const GIT_TIMEOUT: Duration = Duration::from_secs(10);
const GIT_OUTPUT_CAP: usize = 4 * 1024 * 1024;

async fn read_capped<R: tokio::io::AsyncRead + Unpin>(reader: &mut R, cap: usize) -> Vec<u8> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        match tokio::io::AsyncReadExt::read(reader, &mut chunk).await {
            Ok(0) => break,
            Ok(n) => {
                let remaining = cap.saturating_sub(buf.len());
                if n <= remaining {
                    buf.extend_from_slice(&chunk[..n]);
                } else {
                    buf.extend_from_slice(&chunk[..remaining]);
                    break;
                }
            }
            Err(_) => break,
        }
    }
    buf
}

/// Run `git` in `repo`, capping output at 4 MiB and the runtime at 10s.
async fn git_output(repo: &Path, args: &[String]) -> Result<String, String> {
    let label = args.join(" ");
    let mut cmd = tokio::process::Command::new("git");
    cmd.args(args)
        .current_dir(repo)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("git {label}: {e}"))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("git {label}: stdout not piped"))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("git {label}: stderr not piped"))?;

    let out = tokio::spawn(async move { read_capped(&mut stdout, GIT_OUTPUT_CAP).await });
    let err = tokio::spawn(async move { read_capped(&mut stderr, GIT_OUTPUT_CAP).await });

    let status = tokio::time::timeout(GIT_TIMEOUT, child.wait())
        .await
        .map_err(|_| format!("git {label} timed out after 10s"))?
        .map_err(|e| format!("git {label}: {e}"))?;

    let stdout = out
        .await
        .map_err(|e| format!("git {label} stdout reader: {e}"))?;
    let stderr = err
        .await
        .map_err(|e| format!("git {label} stderr reader: {e}"))?;

    if !status.success() {
        let message = String::from_utf8_lossy(&stderr).trim().to_string();
        return Err(if message.is_empty() {
            format!("git {label} failed with status {status}")
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&stdout).into_owned())
}

// ---------------------------------------------------------------------------
// Unified diff
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DiffOp {
    Equal,
    Delete,
    Insert,
}

/// Bound on the LCS table size (cells of `u32`). Larger inputs fall back to a
/// full replacement rather than exhausting memory.
const MAX_DIFF_CELLS: usize = 64_000_000;
const DIFF_CONTEXT: usize = 3;

fn diff_ops(old: &[&str], new: &[&str]) -> Vec<DiffOp> {
    let n = old.len();
    let m = new.len();
    if n == 0 {
        return vec![DiffOp::Insert; m];
    }
    if m == 0 {
        return vec![DiffOp::Delete; n];
    }

    let cells = (n + 1).saturating_mul(m + 1);
    if cells > MAX_DIFF_CELLS {
        let mut ops = Vec::with_capacity(n + m);
        ops.extend(std::iter::repeat(DiffOp::Delete).take(n));
        ops.extend(std::iter::repeat(DiffOp::Insert).take(m));
        return ops;
    }

    // dp[i * stride + j] = LCS length of old[i..] and new[j..].
    let stride = m + 1;
    let mut dp = vec![0u32; cells];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i * stride + j] = if old[i] == new[j] {
                dp[(i + 1) * stride + (j + 1)] + 1
            } else {
                dp[(i + 1) * stride + j].max(dp[i * stride + (j + 1)])
            };
        }
    }

    let mut ops = Vec::with_capacity(n + m);
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if old[i] == new[j] {
            ops.push(DiffOp::Equal);
            i += 1;
            j += 1;
        } else if dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)] {
            ops.push(DiffOp::Delete);
            i += 1;
        } else {
            ops.push(DiffOp::Insert);
            j += 1;
        }
    }
    ops.extend(std::iter::repeat(DiffOp::Delete).take(n - i));
    ops.extend(std::iter::repeat(DiffOp::Insert).take(m - j));
    ops
}

/// Minimal, correct unified diff with three lines of context.
///
/// The algorithm is a straight LCS dynamic program; it never indexes past
/// either side, so exhausted inputs simply produce trailing insertions or
/// deletions.
fn compute_unified_diff(old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let ops = diff_ops(&old_lines, &new_lines);

    // positions[k] is the (old, new) line index just before op k.
    let mut positions = Vec::with_capacity(ops.len() + 1);
    let (mut old_no, mut new_no) = (0usize, 0usize);
    for op in &ops {
        positions.push((old_no, new_no));
        match op {
            DiffOp::Equal => {
                old_no += 1;
                new_no += 1;
            }
            DiffOp::Delete => old_no += 1,
            DiffOp::Insert => new_no += 1,
        }
    }
    positions.push((old_no, new_no));

    let changed: Vec<usize> = ops
        .iter()
        .enumerate()
        .filter(|(_, op)| !matches!(op, DiffOp::Equal))
        .map(|(index, _)| index)
        .collect();
    if changed.is_empty() {
        return String::new();
    }

    // Merge changes whose equal-line gap is within twice the context window.
    let mut hunks: Vec<(usize, usize)> = Vec::new();
    let mut start = changed[0];
    let mut end = changed[0] + 1;
    for &index in &changed[1..] {
        if index - end <= 2 * DIFF_CONTEXT {
            end = index + 1;
        } else {
            hunks.push((start, end));
            start = index;
            end = index + 1;
        }
    }
    hunks.push((start, end));

    let mut out = String::new();
    for (hunk_start, hunk_end) in hunks {
        let ctx_start = hunk_start.saturating_sub(DIFF_CONTEXT);
        let ctx_end = (hunk_end + DIFF_CONTEXT).min(ops.len());
        let (old_start, new_start) = positions[ctx_start];

        let mut old_count = 0usize;
        let mut new_count = 0usize;
        for op in &ops[ctx_start..ctx_end] {
            match op {
                DiffOp::Equal => {
                    old_count += 1;
                    new_count += 1;
                }
                DiffOp::Delete => old_count += 1,
                DiffOp::Insert => new_count += 1,
            }
        }

        let old_header_start = if old_count == 0 {
            old_start
        } else {
            old_start + 1
        };
        let new_header_start = if new_count == 0 {
            new_start
        } else {
            new_start + 1
        };
        out.push_str(&format!(
            "@@ -{old_header_start},{old_count} +{new_header_start},{new_count} @@\n"
        ));

        for (offset, op) in ops[ctx_start..ctx_end].iter().enumerate() {
            let (old_index, new_index) = positions[ctx_start + offset];
            match op {
                DiffOp::Equal => {
                    out.push(' ');
                    out.push_str(old_lines[old_index]);
                }
                DiffOp::Delete => {
                    out.push('-');
                    out.push_str(old_lines[old_index]);
                }
                DiffOp::Insert => {
                    out.push('+');
                    out.push_str(new_lines[new_index]);
                }
            }
            out.push('\n');
        }
    }
    out
}

#[command]
pub async fn diff_compute(old_content: String, new_content: String) -> Result<String, String> {
    Ok(compute_unified_diff(&old_content, &new_content))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unified_diff_marks_added_and_removed_lines() {
        let diff = compute_unified_diff("a\nb\nc\n", "a\nx\nc\n");
        assert!(diff.contains("-b"), "expected removed line, got {diff}");
        assert!(diff.contains("+x"), "expected added line, got {diff}");
        assert!(
            diff.contains("@@ -1,3 +1,3 @@"),
            "expected hunk header, got {diff}"
        );
    }

    #[test]
    fn unified_diff_of_identical_input_is_empty() {
        assert_eq!(compute_unified_diff("a\nb\n", "a\nb\n"), "");
        assert_eq!(compute_unified_diff("", ""), "");
    }

    /// Regression: the old implementation panicked when the old side was
    /// exhausted while the new side still had lines.
    #[test]
    fn unified_diff_appended_line_does_not_panic() {
        let diff = compute_unified_diff("a\nb\nc\n", "a\nb\nc\nd\n");
        assert_eq!(diff, "@@ -1,3 +1,4 @@\n a\n b\n c\n+d\n");
    }

    #[test]
    fn unified_diff_removed_line_does_not_panic() {
        let diff = compute_unified_diff("a\nb\nc\nd\n", "a\nb\nc\n");
        assert_eq!(diff, "@@ -1,4 +1,3 @@\n a\n b\n c\n-d\n");
    }

    #[test]
    fn unified_diff_insertion_into_empty_input_has_zero_old_count() {
        let diff = compute_unified_diff("", "a\n");
        assert_eq!(diff, "@@ -0,0 +1,1 @@\n+a\n");
    }

    #[test]
    fn unified_diff_insertion_at_start_keeps_context() {
        let diff = compute_unified_diff("b\nc\n", "a\nb\nc\n");
        assert_eq!(diff, "@@ -1,2 +1,3 @@\n+a\n b\n c\n");
    }

    #[test]
    fn unified_diff_of_disjoint_input_is_full_replacement() {
        let diff = compute_unified_diff("a\nb\n", "x\ny\n");
        assert!(diff.contains("-a") && diff.contains("-b"));
        assert!(diff.contains("+x") && diff.contains("+y"));
    }

    /// The real wire signals tool failure with `isError`, not a status string.
    #[test]
    fn tool_execution_end_is_error_maps_to_error_status() {
        let event = AgentEvent::ToolExecutionEnd(serde_json::json!({
            "toolCallId": "call_1",
            "toolName": "bash",
            "isError": true,
            "result": { "content": [{ "type": "text", "text": "boom" }] }
        }));
        match map_host_event(SessionEvent::Inbound(Inbound::Event(event))) {
            Some(FrontendEvent::ToolExecutionEnd { status, tool_call_id, .. }) => {
                assert_eq!(status, "error");
                assert_eq!(tool_call_id, "call_1");
            }
            other => panic!("expected ToolExecutionEnd, got {other:?}"),
        }
    }

    /// A successful real-wire end frame (no status field) must read as ok.
    #[test]
    fn tool_execution_end_without_status_defaults_to_ok() {
        let event = AgentEvent::ToolExecutionEnd(serde_json::json!({
            "toolCallId": "call_2",
            "toolName": "bash",
            "isError": false,
            "result": { "content": [] }
        }));
        match map_host_event(SessionEvent::Inbound(Inbound::Event(event))) {
            Some(FrontendEvent::ToolExecutionEnd { status, .. }) => {
                assert_eq!(status, "ok");
            }
            other => panic!("expected ToolExecutionEnd, got {other:?}"),
        }
    }

    /// The real wire ends a turn with prompt_result.sessionSettled and may not
    /// emit a standalone session_settled frame; the flag must survive mapping.
    #[test]
    fn prompt_result_carries_session_settled() {
        let event = AgentEvent::PromptResult(serde_json::json!({
            "agentInvoked": true,
            "status": "completed",
            "sessionSettled": true,
            "type": "prompt_result"
        }));
        match map_host_event(SessionEvent::Inbound(Inbound::Event(event))) {
            Some(FrontendEvent::PromptResult { success, status, session_settled, .. }) => {
                assert!(success, "completed must map to success");
                assert_eq!(status.as_deref(), Some("completed"));
                assert!(session_settled);
            }
            other => panic!("expected PromptResult, got {other:?}"),
        }
    }

    #[test]
    fn worktree_porcelain_is_parsed_into_objects() {
        let parsed = parse_worktree_list(
            "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\ndetached\nworktree /wt2\nHEAD def\ndetached\n",
        );
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].path, "/repo");
        assert_eq!(parsed[0].branch.as_deref(), Some("refs/heads/main"));
        assert_eq!(parsed[0].commit.as_deref(), Some("abc"));
        assert!(parsed[1].detached);
    }

    #[test]
    fn worktree_porcelain_keeps_locked_and_prunable() {
        let parsed = parse_worktree_list(
            "worktree /repo\nHEAD abc\nbranch refs/heads/main\nlocked\nprunable\n",
        );
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].locked);
        assert!(parsed[0].prunable);
    }

    #[test]
    fn worktree_info_serializes_absent_branch_and_commit_as_empty_strings() {
        let info = empty_worktree_info();
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["branch"], "");
        assert_eq!(json["commit"], "");
    }

    #[test]
    fn branch_validation_rejects_dangerous_names() {
        assert!(validate_branch("feature/x").is_ok());
        assert!(validate_branch("").is_err());
        assert!(validate_branch("-x").is_err());
        assert!(validate_branch("a..b").is_err());
        assert!(validate_branch("a b").is_err());
        assert!(validate_branch("a~b").is_err());
        assert!(validate_branch("@{x").is_err());
    }

    #[test]
    fn new_path_validation_rejects_parent_escape() {
        assert!(validate_new_path("/tmp/ok").is_ok());
        assert!(validate_new_path("relative/path").is_err());
        assert!(validate_new_path("/tmp/../etc").is_err());
    }

    /// Apply a unified diff produced by [`compute_unified_diff`] to `old`.
    ///
    /// Mirrors what the frontend's diff parser does: hunk headers carry the
    /// 1-based old-side start (0-based when the count is zero), and body lines
    /// are ` ` (context), `-` (old only), `+` (new only).
    fn apply_unified_diff(old: &str, diff: &str) -> String {
        if diff.is_empty() {
            return old.to_string();
        }
        let old_lines: Vec<&str> = old.lines().collect();
        let mut out: Vec<String> = Vec::new();
        let mut old_idx = 0usize;
        let mut lines = diff.lines().peekable();
        while let Some(header) = lines.next() {
            if !header.starts_with("@@") {
                continue;
            }
            let rest = header.trim_start_matches("@@").trim();
            let mut parts = rest.split_whitespace();
            let old_spec = parts
                .next()
                .expect("hunk header old spec")
                .trim_start_matches('-');
            let _new_spec = parts.next().expect("hunk header new spec");
            let mut spec = old_spec.splitn(2, ',');
            let start: usize = spec
                .next()
                .expect("old start")
                .parse()
                .expect("old start int");
            let count: usize = spec
                .next()
                .map(|c| c.parse().expect("old count"))
                .unwrap_or(1);
            let hunk_idx = if count == 0 { start } else { start - 1 };
            assert!(hunk_idx >= old_idx, "hunks overlap or go backwards");
            while old_idx < hunk_idx {
                out.push(old_lines[old_idx].to_string());
                old_idx += 1;
            }
            while let Some(body) = lines.peek() {
                if body.starts_with("@@") {
                    break;
                }
                let body = lines.next().expect("peeked body");
                let mut chars = body.chars();
                match chars.next() {
                    Some(' ') => {
                        out.push(chars.as_str().to_string());
                        old_idx += 1;
                    }
                    Some('-') => {
                        old_idx += 1;
                    }
                    Some('+') => {
                        out.push(chars.as_str().to_string());
                    }
                    _ => {}
                }
            }
        }
        while old_idx < old_lines.len() {
            out.push(old_lines[old_idx].to_string());
            old_idx += 1;
        }
        out.join("\n")
    }

    proptest::proptest! {
        #[test]
        fn diff_applies_back_to_new(
            old_lines in proptest::collection::vec("[a-z]{0,6}", 0..20),
            new_lines in proptest::collection::vec("[a-z]{0,6}", 0..20),
        ) {
            let old = old_lines.join("\n");
            let new = new_lines.join("\n");
            let diff = compute_unified_diff(&old, &new);
            let applied = apply_unified_diff(&old, &diff);
            let expected = new.lines().collect::<Vec<_>>().join("\n");
            proptest::prop_assert_eq!(applied, expected);
        }

        #[test]
        fn diff_of_identical_input_is_empty(s in ".*") {
            proptest::prop_assert_eq!(compute_unified_diff(&s, &s), "");
        }
    }
}
