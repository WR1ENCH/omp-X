fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "spawn_session",
                "send_prompt",
                "send_ui_response",
                "close_session",
                "abort",
                "list_sessions",
                "worktree_list",
                "worktree_create",
                "worktree_remove",
                "worktree_prune",
                "diff_compute",
                "pty_spawn",
                "pty_write",
                "pty_resize",
                "pty_kill",
                "pty_read",
            ]),
        ),
    )
    .expect("failed to run tauri-build")
}
