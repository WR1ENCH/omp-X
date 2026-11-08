# Real-wire verification against oh-my-pi (omp v18.4.3)

The M2 review asked for one real `omp --mode rpc-ui` round. The environment
ships the real binary at `/home/wr1ench/.local/bin/omp` (oh-my-pi v18.4.3);
`~/.omp/agent/agent.db` is corrupt and the root filesystem is read-only, so
the probe runs with a writable `HOME` copy (`/home/wr1ench/omp-X/.fakehome`).

## Probes

- `scripts/real_omp_round.mjs` — raw wire capture: spawns
  `omp --mode rpc-ui`, sends `{"type":"prompt","message":...}` after `ready`,
  prints every frame.
- `crates/omp-host/examples/real_round.rs` — the same round through the
  production `omp_host::session::spawn()` path (framing, pumps, kill_on_drop):
  `OMP_BIN`/`PATH`/`HOME` set, then
  `cargo run -p omp-host --example real_round`.

## Observed wire (both probes agree)

```
ready{protocolVersion:1,supportedProtocolVersions:[1,2],maxFrameBytes:1048576,...}
extension_ui_request{method:"setWidget",widgetKey:"autoresearch"}     (pre-prompt)
response{command:"prompt",success:true}
thinking_level_changed{thinkingLevel,resolved,configured}
agent_start -> turn_start -> message_start(user) -> message_end(user)
message_start(assistant) -> message_update{thinking_start|thinking_delta|thinking_end}
                          -> message_update{text_start|text_delta|text_end}
message_end(assistant) -> turn_end
extension_ui_request{method:"setStatus",...}
agent_end{messages:[...]}
tool_execution_start{toolCallId,toolName,args,intent}                 (tool round)
tool_execution_update{toolCallId,toolName,args,partialResult}         (tool round)
tool_execution_end{toolCallId,toolName,result,isError}                (tool round)
prompt_result{agentInvoked:true,status:"completed",sessionSettled:true}
```

Round 1 reply text: `PONG`. Tool round reply text: `DONE`, and the bash tool
really wrote the probe file (`TOOL_OK` observed on disk).
`exit code: SIGKILL` after `session.kill()` proves the child is reaped.

## Findings fixed by this probe

1. `tool_execution_end` signals failure with `isError:true`, not a
   `status` string. `map_host_event` now reads `isError`/`is_error` and maps
   it to `status:"error"` (`unified_diff_*`-style regression tests
   `tool_execution_end_is_error_maps_to_error_status`,
   `tool_execution_end_without_status_defaults_to_ok`).
2. The turn ends inside `prompt_result{sessionSettled:true}`; no standalone
   `session_settled` frame is guaranteed. The flag is now carried end-to-end
   (Rust `FrontendEvent::PromptResult.session_settled` →
   `FrontendEvent` TS type → provider clears `isStreaming` and dispatches
   `omp:session-settled`).

## Deliberate non-fixes (contract-compatible leniency)

- `tool_execution_update` and `thinking_level_changed` are unknown to
  `Inbound::from_value` and arrive as `Noise`. The tool cards are driven by
  `tool_execution_start`/`tool_execution_end`, which the real wire does emit
  with exactly the type strings the protocol handles. Surfacing mid-flight
  tool progress is M3+ UI work, not a broken link.

## Acceptance gate results (with these fixes)

`cargo test -p omp-tauri --lib` 22 passed · `npx tsc --noEmit` 0 ·
`npx eslint src` 0 errors (1 TanStack-inherent warning) ·
`npx vitest run` 73 passed · `npm run build` ok · `npx playwright test` 5/5
(the protocol test now replays the real tool frames and asserts the tool
card renders `bash` + `Done`).
