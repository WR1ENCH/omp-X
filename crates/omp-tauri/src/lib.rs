mod commands;
mod events;

use tauri::{command, AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

pub use commands::*;
pub use events::*;

pub fn build<R: Runtime>() -> tauri::Builder<R> {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            spawn_session,
            send_prompt,
            send_ui_response,
            close_session,
            list_worktrees,
            create_worktree,
            delete_worktree,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = handle.store("layout.json");
            });
            Ok(())
        })
}