//! PTY registry and the `omp://pty` event stream.
//!
//! The PTY reader runs on a dedicated OS thread: `portable-pty` exposes a
//! blocking `Read` handle and doing that inside a Tokio task would stall the
//! runtime. Output is buffered so a slow frontend can still drain it with
//! `pty_read`, but the canonical path is the `omp://pty` event channel.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::events::{emit_pty_event, PtyEvent};

/// Cap on buffered PTY output per process. When the cap is exceeded the
/// OLDEST bytes are dropped; the buffer is never cleared wholesale because a
/// frontend that is behind should still see a contiguous tail.
const MAX_BUFFERED_BYTES: usize = 1 << 20;

/// Whitelisted shell basenames. Anything else is rejected so a UI-supplied
/// value cannot launch an arbitrary binary.
const SHELL_WHITELIST: &[&str] = &[
    "bash",
    "sh",
    "zsh",
    "fish",
    "pwsh",
    "powershell.exe",
    "cmd.exe",
];

/// A live PTY process.
pub struct PtyEntry {
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub pid: u32,
    /// Cached writer handle. `portable-pty` allows `take_writer` exactly once,
    /// so it is taken at spawn time and reused for every `pty_write`.
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    /// Kill handle, split from the child so a blocked `wait` cannot prevent
    /// `pty_kill` from terminating the process.
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    /// Bytes not yet drained by the frontend.
    pub buffered: Arc<Mutex<Vec<u8>>>,
    pub exited: Arc<Mutex<bool>>,
}

impl PtyEntry {
    fn write(&self, data: &str) -> Result<(), String> {
        let mut guard = self
            .writer
            .lock()
            .map_err(|_| "pty writer mutex poisoned".to_string())?;
        let writer = guard
            .as_mut()
            .ok_or_else(|| "pty writer already taken".to_string())?;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("pty write: {e}"))?;
        writer.flush().map_err(|e| format!("pty flush: {e}"))
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let master = self
            .master
            .lock()
            .map_err(|_| "pty master mutex poisoned".to_string())?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("pty resize: {e}"))
    }

    fn kill(&self) -> Result<(), String> {
        let mut killer = self
            .killer
            .lock()
            .map_err(|_| "pty killer mutex poisoned".to_string())?;
        killer.kill().map_err(|e| format!("pty kill: {e}"))
    }
}

/// Process-wide registry of live PTYs.
#[derive(Clone, Default)]
pub struct PtyRegistry {
    pub ptys: Arc<Mutex<HashMap<u32, Arc<PtyEntry>>>>,
}

impl PtyRegistry {
    fn get(&self, pid: u32) -> Result<Arc<PtyEntry>, String> {
        let map = self
            .ptys
            .lock()
            .map_err(|_| "pty registry poisoned".to_string())?;
        map.get(&pid)
            .cloned()
            .ok_or_else(|| format!("unknown pty: {pid}"))
    }
}

/// Result of `pty_spawn`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnResult {
    pub pid: u32,
}

/// Result of `pty_read`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyReadResult {
    pub pid: u32,
    pub data: String,
    pub exited: bool,
}

/// Spawn a shell inside a PTY.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    shell: Option<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<PtySpawnResult, String> {
    let shell = validate_shell(shell.unwrap_or_else(default_shell).as_str())?;
    let cwd = match cwd {
        Some(cwd) => resolve_cwd(&cwd)?,
        None => std::env::current_dir()
            .map_err(|e| format!("current_dir: {e}"))?
            .to_string_lossy()
            .into_owned(),
    };

    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);
    // Minimal environment: never inherit the host's credential-bearing env.
    cmd.env_clear();
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env(
        "LANG",
        std::env::var("LANG").unwrap_or_else(|_| "C.UTF-8".to_string()),
    );

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn {shell}: {e}"))?;
    let pid = child
        .process_id()
        .ok_or_else(|| "spawn: child has no process id".to_string())?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take pty writer: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone pty reader: {e}"))?;
    let killer = child.clone_killer();

    let entry = Arc::new(PtyEntry {
        master: Mutex::new(pair.master),
        pid,
        writer: Arc::new(Mutex::new(Some(writer))),
        killer: Arc::new(Mutex::new(killer)),
        buffered: Arc::new(Mutex::new(Vec::new())),
        exited: Arc::new(Mutex::new(false)),
    });
    registry
        .ptys
        .lock()
        .map_err(|_| "pty registry poisoned".to_string())?
        .insert(pid, entry.clone());

    spawn_reader(
        app,
        pid,
        reader,
        child,
        entry.clone(),
        registry.ptys.clone(),
    );

    Ok(PtySpawnResult { pid })
}

/// Write to a PTY's stdin.
#[tauri::command]
pub fn pty_write(registry: State<'_, PtyRegistry>, pid: u32, data: String) -> Result<(), String> {
    registry.get(pid)?.write(&data)
}

/// Resize a PTY.
#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    pid: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.get(pid)?.resize(cols, rows)
}

/// Terminate a PTY process.
#[tauri::command]
pub fn pty_kill(registry: State<'_, PtyRegistry>, pid: u32) -> Result<(), String> {
    registry.get(pid)?.kill()
}

/// Drain buffered PTY output. The `omp://pty` channel is the primary path;
/// this command exists for frontends that poll.
#[tauri::command]
pub fn pty_read(registry: State<'_, PtyRegistry>, pid: u32) -> Result<PtyReadResult, String> {
    let entry = registry.get(pid)?;
    let exited = *entry
        .exited
        .lock()
        .map_err(|_| "pty exit flag poisoned".to_string())?;
    let mut buffered = entry
        .buffered
        .lock()
        .map_err(|_| "pty buffer poisoned".to_string())?;
    let data = String::from_utf8_lossy(&buffered).into_owned();
    // Clear exactly the bytes we are returning.
    buffered.clear();
    Ok(PtyReadResult { pid, data, exited })
}

/// Run the blocking read loop on a dedicated thread.
fn spawn_reader(
    app: AppHandle,
    pid: u32,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
    entry: Arc<PtyEntry>,
    ptys: Arc<Mutex<HashMap<u32, Arc<PtyEntry>>>>,
) {
    std::thread::spawn(move || {
        let mut decoder = IncrementalUtf8::default();
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = decoder.feed(&buf[..n]);
                    if text.is_empty() {
                        continue;
                    }
                    let _ = emit_pty_event(
                        &app,
                        PtyEvent::Data {
                            pid,
                            data: text.clone(),
                        },
                    );
                    let mut buffered = match entry.buffered.lock() {
                        Ok(g) => g,
                        Err(e) => e.into_inner(),
                    };
                    buffered.extend_from_slice(text.as_bytes());
                    if buffered.len() > MAX_BUFFERED_BYTES {
                        // Drop the OLDEST bytes, never the whole buffer.
                        let excess = buffered.len() - MAX_BUFFERED_BYTES;
                        buffered.drain(..excess);
                    }
                }
                Err(_) => break,
            }
        }

        let code = child.wait().ok().map(|status| status.exit_code() as i32);
        if let Ok(mut exited) = entry.exited.lock() {
            *exited = true;
        }
        if let Ok(mut map) = ptys.lock() {
            map.remove(&pid);
        }
        let _ = emit_pty_event(&app, PtyEvent::Exit { pid, code });
    });
}

/// Incremental UTF-8 decoder: multibyte sequences split across reads are held
/// back until the remaining bytes arrive, so a chunk boundary never produces a
/// replacement character in the middle of a codepoint.
#[derive(Default)]
struct IncrementalUtf8 {
    pending: Vec<u8>,
}

impl IncrementalUtf8 {
    fn feed(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            let (valid_up_to, error_len) = match std::str::from_utf8(&self.pending) {
                Ok(_) => (self.pending.len(), None),
                Err(e) => (e.valid_up_to(), e.error_len()),
            };
            if valid_up_to > 0 {
                // The prefix is valid UTF-8 by construction.
                out.push_str(std::str::from_utf8(&self.pending[..valid_up_to]).unwrap());
                self.pending.drain(..valid_up_to);
            }
            if self.pending.is_empty() {
                break;
            }
            match error_len {
                // Truncated multibyte sequence at the end: keep it for the
                // next feed.
                None => break,
                Some(n) => {
                    let n = n.min(self.pending.len());
                    self.pending.drain(..n);
                }
            }
        }
        out
    }
}

fn default_shell() -> String {
    if cfg!(windows) {
        return "cmd.exe".to_string();
    }
    if let Ok(shell) = std::env::var("SHELL") {
        let basename = shell_basename(&shell);
        if SHELL_WHITELIST.contains(&basename) {
            return shell;
        }
    }
    for candidate in ["/bin/bash", "/bin/zsh", "/bin/sh", "/usr/bin/fish"] {
        if Path::new(candidate).is_file() {
            return candidate.to_string();
        }
    }
    "sh".to_string()
}

fn shell_basename(shell: &str) -> &str {
    Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(shell)
}

fn validate_shell(shell: &str) -> Result<String, String> {
    let basename = shell_basename(shell);
    if SHELL_WHITELIST.contains(&basename) {
        Ok(shell.to_string())
    } else {
        Err(format!(
            "shell not allowed: {shell} (allowed: {})",
            SHELL_WHITELIST.join(", ")
        ))
    }
}

fn resolve_cwd(cwd: &str) -> Result<String, String> {
    let trimmed = cwd.trim();
    let expanded = if trimmed == "~" || trimmed.starts_with("~/") {
        let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
        format!("{home}{}", &trimmed[1..])
    } else {
        trimmed.to_string()
    };
    let path = Path::new(&expanded);
    if !path.is_absolute() {
        return Err(format!("pty cwd must be absolute: {cwd}"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("pty cwd {cwd}: {e}"))?;
    if !canonical.is_dir() {
        return Err(format!(
            "pty cwd is not a directory: {}",
            canonical.display()
        ));
    }
    Ok(canonical.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_starts_empty() {
        let registry = PtyRegistry::default();
        let map = registry.ptys.lock().unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn shell_whitelist_accepts_basenames() {
        assert!(validate_shell("/bin/bash").is_ok());
        assert!(validate_shell("sh").is_ok());
        assert!(validate_shell("cmd.exe").is_ok());
        assert!(validate_shell("/usr/bin/nu").is_err());
        assert!(validate_shell("/bin/bash; rm -rf /").is_err());
        #[cfg(windows)]
        assert!(validate_shell(r"C:\Windows\System32\cmd.exe").is_ok());
    }

    #[test]
    fn decoder_never_splits_multibyte_sequences() {
        let mut decoder = IncrementalUtf8::default();
        // "你" is E4 BD A0; feed it one byte at a time.
        assert_eq!(decoder.feed(&[0xE4]), "");
        assert_eq!(decoder.feed(&[0xBD]), "");
        assert_eq!(decoder.feed(&[0xA0]), "你");
        assert_eq!(decoder.feed(&[0xE4, 0xBD]), "");
        assert_eq!(decoder.feed(&[0xA0]), "你");
        // Mixed ASCII and multibyte in one chunk.
        assert_eq!(decoder.feed("ok 好".as_bytes()), "ok 好");
    }

    #[test]
    fn decoder_drops_invalid_bytes_without_stalling() {
        let mut decoder = IncrementalUtf8::default();
        assert_eq!(decoder.feed(&[0xFF, b'a']), "a");
        assert_eq!(decoder.feed(&[0xC3]), "");
        // 0xC3 followed by "(" is an invalid sequence; the bad byte is dropped
        // and the valid one is emitted.
        assert_eq!(decoder.feed(&[0x28]), "(");
    }
}
