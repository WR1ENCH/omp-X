use anyhow::Result;
use omp_protocol::{HostConfig, SessionId, WorktreeId};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, State};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnSessionArgs {
    pub worktree_id: WorktreeId,
    pub config: HostConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendPromptArgs {
    pub session_id: SessionId,
    pub prompt: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendUiResponseArgs {
    pub session_id: SessionId,
    pub request_id: String,
    pub response: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloseSessionArgs {
    pub session_id: SessionId,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWorktreeArgs {
    pub path: String,
    pub base_branch: Option<String>,
}

#[command]
pub async fn spawn_session(
    app: AppHandle,
    args: SpawnSessionArgs,
) -> Result<SessionId, String> {
    let _ = app;
    let _ = args;
    todo!("implement session spawn via omp-host")
}

#[command]
pub async fn send_prompt(
    app: AppHandle,
    args: SendPromptArgs,
) -> Result<(), String> {
    let _ = app;
    let _ = args;
    todo!("implement prompt send via omp-host")
}

#[command]
pub async fn send_ui_response(
    app: AppHandle,
    args: SendUiResponseArgs,
) -> Result<(), String> {
    let _ = app;
    let _ = args;
    todo!("implement UI response send via omp-host")
}

#[command]
pub async fn close_session(
    app: AppHandle,
    args: CloseSessionArgs,
) -> Result<(), String> {
    let _ = app;
    let _ = args;
    todo!("implement session close via omp-host")
}

#[command]
pub async fn list_worktrees(app: AppHandle) -> Result<Vec<omp_protocol::WorktreeInfo>, String> {
    let _ = app;
    todo!("implement worktree listing via omp-host")
}

#[command]
pub async fn create_worktree(
    app: AppHandle,
    args: CreateWorktreeArgs,
) -> Result<omp_protocol::WorktreeInfo, String> {
    let _ = app;
    let _ = args;
    todo!("implement worktree creation via omp-host")
}

#[command]
pub async fn delete_worktree(
    app: AppHandle,
    worktree_id: WorktreeId,
) -> Result<(), String> {
    let _ = app;
    let _ = worktree_id;
    todo!("implement worktree deletion via omp-host")
}