# M1 Phase Code Review

## crates/omp-gui/src/main.rs — **PASS** (minor issues)

### Correctness
- CLI args well-structured, `required = true` on mandatory fields
- Event loop handles `Ready` → send prompt, `ExtensionUiRequest` → auto-deny, `SessionSettled` → exit when prompt provided
- Ctrl-C handling via `tokio::signal::ctrl_c()` works
- Clean shutdown calls `handle.kill().await`

### Issues
1. **Line 64**: `handle.outbound.send(prompt_msg).await` — if channel full (capacity 32), blocks indefinitely. Should use `try_send` or bounded send with timeout.
2. **Line 72-74**: Same issue for `extension_ui_response` send — blocks if channel full.
3. **Line 85-88**: `Err(_)` on broadcast recv treated as "channel closed" — correct (broadcast returns Err only when all senders dropped).
4. **Missing**: No stderr handling from child process (session.rs discards stderr with `_stderr`).

### Cargo.toml
- `tokio` features `fs` and `signal` added. `signal` is used (line 8, 96). `fs` is **not used** in main.rs — remove unless used elsewhere in omp-gui crate.

---

## crates/omp-host/src/session.rs — **PASS** (several issues)

### Correctness
- `SessionConfig` cleanly replaces ad-hoc spawn params
- `SessionHandle` with broadcast events, noise mpsc, outbound mpsc — good separation
- `LineSplitter` integration correct: dynamic `max_frame_bytes` update on `Ready` frame (lines 116-120)
- Oversized frame handling emits single `Oversized` event then discards tail — matches framing.rs logic
- `Drop::drop` calls `start_kill()` — non-blocking, correct
- Test updated to use new API

### Issues
1. **Line 92**: `let _stderr = child.stderr.take()…` — stderr **completely discarded**. Should at minimum forward to noise channel or log. Loss of diagnostics.

2. **Lines 148-161 (stdin task)**: On write/flush error, task breaks silently — no error propagation to caller. Outbound channel stays open but writer dead. Subsequent sends block forever (channel never closed). Should close outbound_tx on error or propagate error.

3. **Line 122**: `let _ = event_tx_clone.send(inbound);` — broadcast send ignores `Err` (no receivers). Fine for broadcast semantics but worth noting.

4. **Line 95**: `broadcast::channel(128)` — capacity 128. If consumer lags, events silently dropped (broadcast semantics). Acceptable for headless dumper but document.

5. **Line 97**: `OUTBOUND_CAPACITY = 32` — no backpressure. omp-gui sends can block indefinitely (see issue 1 above). Consider `try_send` + error or larger buffer.

6. **Line 119**: `splitter = LineSplitter::new(ready.max_frame_bytes as usize);` — `max_frame_bytes` is `u64`, cast to `usize` truncates on 32-bit. Fine for 64-bit targets but add `min(usize::MAX, ...)` or `try_into().unwrap_or(usize::MAX)`.

7. **Line 71**: `start_kill()` only initiates kill; process not reaped until `wait()` or `Child` drop. Drop calls `start_kill()` but doesn't await — zombie risk if `wait()` never called. Current Drop impl comment acknowledges this. Consider: in `Drop`, also spawn a detached task to `wait()`? Or document that caller MUST call `wait()` or `kill()`.

8. **Missing**: No stderr task. The `_stderr` is dropped immediately. At minimum:
   ```rust
   let mut stderr = child.stderr.take()…;
   tokio::spawn(async move { … read stderr → noise_tx … });
   ```

9. **Test** (`spawn_echo_session`): Only tests spawn succeeds. Doesn't verify events, noise, or cleanup. Weak but acceptable as smoke test.

---

## Verdict

| File | Status |
|------|--------|
| `crates/omp-gui/src/main.rs` | **Pass** — fix outbound send blocking, remove unused `fs` feature |
| `crates/omp-host/src/session.rs` | **Pass** — fix stderr discard, stdin task error propagation, `max_frame_bytes` cast, document Drop zombie risk |

All issues are **non-blocking** for M1 headless dumper. Fix before M2 or when integrating with real UI.