# M1 — omp host 子代理执行拆解（6 个可并行/串行任务）

> **来源**：`docs/superpowers/plans/2026-11-01-m1-host.md`（TDD 6 任务）
> **用途**：每个 Task 独立可派发给 `task` subagent；产物为单个 crate 或脚本 + 对应测试全绿 + git commit。

---

## Task 1: Workspace 脚手架 + rsproxy 镜像

**Agent**: `task` | **依赖**: 无 | **产出**: 5 个 crate 编译通过

**文件清单**（全部新建）:
```
/home/wr1ench/omp-X/Cargo.toml                          # workspace
/home/wr1ench/omp-X/.cargo/config.toml                  # rsproxy sparse index
/home/wr1ench/omp-X/crates/omp-protocol/Cargo.toml
/home/wr1ench/omp-X/crates/omp-protocol/src/lib.rs
/home/wr1ench/omp-X/crates/omp-host/Cargo.toml
/home/wr1ench/omp-X/crates/omp-host/src/lib.rs
/home/wr1ench/omp-X/crates/omp-gui/Cargo.toml
/home/wr1ench/omp-X/crates/omp-gui/src/main.rs
```

**验收**:
```bash
cargo check --workspace  # 全绿，无 warning
git add -A && git commit -m "chore: M1 Task 1 workspace + rsproxy"
```

---

## Task 2: 真实协议帧采集

**Agent**: `task` | **依赖**: Task 1 | **产出**: `fixtures/clean_round.jsonl`（≥8 行完整一轮）

**文件清单**:
```
/home/wr1ench/omp-X/scripts/capture_fixtures.sh         # 可执行
/home/wr1ench/omp-X/fixtures/clean_round.jsonl          # 运行生成
```

**脚本要求**（见原计划）：
- `omp --no-tools --no-extensions -p "Reply with exactly one word: hello" --json 2>/dev/null`
- `grep '^{' | jq -c . > fixtures/clean_round.jsonl`
- 必含：ready → agent_start → turn_start → message_start → message_update* → message_end → turn_end → agent_end → prompt_result → session_settled

**验收**:
```bash
bash scripts/capture_fixtures.sh
wc -l fixtures/clean_round.jsonl  # >= 8
head -1 fixtures/clean_round.jsonl | jq .type  # "ready"
git add fixtures/ scripts/ && git commit -m "fixture: M1 Task 2 protocol capture"
```

---

## Task 3: `omp-host::framing` 切帧与噪声旁路

**Agent**: `task` | **依赖**: Task 1 | **产出**: `crates/omp-host/src/framing.rs` + 单测全绿

**文件清单**:
```
/home/wr1ench/omp-X/crates/omp-host/src/framing.rs
/home/wr1ench/omp-X/crates/omp-host/tests/framing.rs
```

**核心接口**（按原计划不变）:
```rust
pub struct LineSplitter { /* 1MiB 硬限 */ }
pub enum RawLine { Json(Value), Noise(String), Oversized { len: usize } }
impl LineSplitter { pub fn push(&mut self, chunk: &[u8]) -> Vec<RawLine> }
```

**测试点**（6 个）：噪声前置、完整 JSON 行、跨 chunk 重组、空行丢弃、超限 `Oversized`、1MiB 硬限错误。

**验收**:
```bash
cargo test -p omp-host --test framing  # 6 passed
git add crates/omp-host/ && git commit -m "feat(omp-host): M1 Task 3 framing"
```

---

## Task 4: `omp-protocol::inbound` 宽容类型系统

**Agent**: `task` | **依赖**: Task 1, Task 2（fixture） | **产出**: `crates/omp-protocol/src/inbound.rs` + 单测全绿

**文件清单**:
```
/home/wr1ench/omp-X/crates/omp-protocol/src/inbound.rs
/home/wr1ench/omp-X/crates/omp-protocol/src/lib.rs          # + pub mod inbound;
-/home/wr1ench/omp-X/crates/omp-protocol/tests/inbound.rs
```

**核心接口**:
```rust
pub enum Inbound { Ready(Ready), Response(Response), ExtensionUiRequest(...), Event(AgentEvent), Unknown(Value) }
pub fn Inbound::from_value(Value) -> Inbound          # 宽进：不 panic，未知落 Unknown/Raw
pub fn extension_ui_response(id: &str, value: Value) -> String
```
所有公共类型需 `#[derive(Debug, Clone)]`（broadcast channel 要求）。

**测试点**（5 个）：fixture 全行不 panic、ready 结构化、ui_request extra 字段保留、未知 type 落 Unknown、应答序列化符合 §0。

**验收**:
```bash
cargo test -p omp-protocol --test inbound  # 5 passed
git add crates/omp-protocol/ && git commit -m "feat(omp-protocol): M1 Task 4 inbound types"
```

---

## Task 5: `omp-host::session` 子进程 Actor

**Agent**: `task` | **依赖**: Task 1, Task 3, Task 4 | **产出**: `session.rs` + 假子进程 fixture + 单测全绿

**文件清单**:
```
/home/wr1ench/omp-X/crates/omp-host/src/session.rs
/home/wr1ench/omp-X/crates/omp-host/src/lib.rs                # + pub mod session;
-/home/wr1ench/omp-X/crates/omp-host/tests/fixtures/fake_omp.sh
/home/wr1ench/omp-X/crates/omp-host/tests/session.rs
```

**核心接口**:
```rust
pub struct SessionConfig { omp_path, cwd, extra_args }
pub struct SessionHandle { events: broadcast::Receiver<Inbound>, noise: mpsc::Receiver<String>, outbound: mpsc::Sender<String>, child }
pub async fn spawn_session(cfg: SessionConfig) -> io::Result<SessionHandle>
pub const OUTBOUND_CAPACITY: usize = 32
// Drop -> child.start_kill(); kill_on_drop(true)
```

**测试点**（3 个）：事件顺序与 fake_omp 输出一致、Drop 杀子进程、outbound 背压不静默丢包。

**验收**:
```bash
cargo test -p omp-host --test session  # 3 passed
git add crates/omp-host/ && git commit -m "feat(omp-host): M1 Task 5 session actor"
```

---

## Task 6: `omp-gui` CLI 入口 + 真实 omp 端到端 Smoke（M1 验收）

**Agent**: `task` | **依赖**: Task 1, Task 4, Task 5 | **产出**: 可运行 `omp-gui` + 真实 omp 跑通一轮

**文件清单**:
```
/home/wr1ench/omp-X/crates/omp-gui/Cargo.toml     # + anyhow, serde_json
/home/wr1ench/omp-X/crates/omp-gui/src/main.rs
```

**CLI 契约**:
```
omp-gui --omp-path <PATH> --dir <DIR> [--prompt <TEXT>] [--extra-arg <ARG>...]
```
行为：spawn → 打印事件 → `select`/`confirm` 自动 Deny（安全默认） → 有 `--prompt` 则发送并等 `session_settled` 退出。

**验收**:
```bash
cargo test --workspace                           # 全绿
cargo run -q -p omp-gui -- --omp-path omp --dir /tmp --prompt "Reply with exactly one word: hello" --extra-arg --no-tools --extra-arg --no-extensions
# stdout: Ready → AgentStart → ... → TextDelta* → AgentEnd → PromptResult → session_settled → exit 0
# 再跑一次去掉 --no-extensions：允许 noise / ui_request auto-Deny 行，仍走到 session_settled 不挂死
git add crates/omp-gui/ && git commit -m "feat(omp-gui): M1 Task 6 CLI + smoke"
```

---

## 执行顺序与并行策略

| 阶段 | 任务 | 可并行 |
|------|------|--------|
| 1 | Task 1 | — |
| 2 | Task 2 | —（需真实 omp 可执行文件） |
| 3 | Task 3 | 与 Task 4 并行（仅依赖 Task 1） |
| 4 | Task 4 | 与 Task 3 并行（需 Task 2 fixture） |
| 5 | Task 5 | 依赖 Task 3+4 完成 |
| 6 | Task 6 | 依赖 Task 4+5 完成 |

**推荐派发顺序**：
```
1. Task 1
2. Task 2（等 Task 1）
3. Task 3 + Task 4 并发（等 Task 1, Task 2）
4. Task 5（等 Task 3, Task 4）
5. Task 6（等 Task 4, Task 5）
```

---

## 共享契约（禁止各 Task 私自更改）

| 符号 | 定义位置 | 消费者 |
|------|----------|--------|
| `LineSplitter::push` | Task 3 | Task 5 |
| `RawLine::{Json,Noise,Oversized}` | Task 3 | Task 5 |
| `Inbound::from_value` | Task 4 | Task 5, Task 6 |
| `extension_ui_response` | Task 4 | Task 6 |
| `SessionConfig/SessionHandle/spawn_session` | Task 5 | Task 6 |
| `OUTBOUND_CAPACITY=32` | Task 5 | — |

---

## 已知决策点（子代理遇到即止步等待主线程确认）

1. `maxReassembledFrameBytes` 64 MiB 重装：Task 3 先只做 1 MiB 单帧上限；需要时再加。
2. `send_prompt` 真实命令名：Task 6 smoke 会暴露 `Unknown command`，届时按 fixture 改正。
3. `negotiate_protocol` v2：M1 不协商（默认 v1）；M2 需要时再加。

---

## 验收总览

| Task | 命令 | 期望 |
|------|------|------|
| 1 | `cargo check --workspace` | 编译通过 |
| 2 | `bash scripts/capture_fixtures.sh` | fixtures/clean_round.jsonl ≥8 行 |
| 3 | `cargo test -p omp-host --test framing` | 6 passed |
| 4 | `cargo test -p omp-protocol --test inbound` | 5 passed |
| 5 | `cargo test -p omp-host --test session` | 3 passed |
| 6 | `cargo test --workspace && cargo run ...` | 全绿 + 真实 omp 一轮跑通 |

M1 全绿 → 出 M2 计划（Tauri 骨架 + React 流式 transcript + composer）。