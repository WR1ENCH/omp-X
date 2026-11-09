//! Tauri application wiring.
//!
//! `build()` is the single place that registers commands, plugins, and the
//! capabilities directory. The frontend calls commands by name; the ACL in
//! `capabilities/` is what makes those calls legal in Tauri 2 — without it every
//! `invoke` is rejected before reaching the handler.

mod commands;
mod events;
mod pty;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

pub use commands::*;
pub use events::*;
pub use pty::*;

/// Concrete builder for the desktop runtime. `MockRuntime` tests use
/// `tauri::test::mock_builder` instead of this function.
pub fn build() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(commands::AppState::default())
        .manage(pty::PtyRegistry::default())
        .invoke_handler(tauri::generate_handler![
            // session lifecycle
            commands::spawn_session,
            commands::send_prompt,
            commands::send_ui_response,
            commands::close_session,
            commands::abort,
            commands::list_sessions,
            // worktrees
            commands::worktree_list,
            commands::worktree_create,
            commands::worktree_remove,
            commands::worktree_prune,
            // diff + terminal
            commands::diff_compute,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_read,
        ])
        .setup(|app| {
            // Commands that only receive `State<AppState>` (close_session,
            // abort) still need to push `session_closed`, so remember the app
            // handle in the shared state.
            app.state::<commands::AppState>()
                .set_app(app.handle().clone());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Touch the store so tauri-plugin-store creates the file on
                // first run; `get` is a no-op until the UI writes a value.
                let _ = handle.store("layout.json");
            });
            Ok(())
        })
}

#[cfg(test)]
mod tests {
    #[test]
    fn builder_registers_commands() {
        // Building the concrete Wry builder exercises the command registration
        // and ACL resolution; a panic here means a command name drifted.
        let _ = crate::build();
    }
}
