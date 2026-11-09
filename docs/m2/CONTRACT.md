# M2 修复契约（唯一事实来源）

所有并行修复必须严格遵守本文件。改动接口前必须先改本文件并通知 Lead。

## 0. 目标

修复 `review_m2.md` 中 12 个 P0 根因，使：

1. `cargo check -p omp-protocol -p omp-host` 通过；
2. `npx tsc --noEmit` 通过（除已知第三方类型问题）；
3. `npm run build`、`npm test`、`npm run lint` 通过；
4. 主链路可运行：spawn_session → send_prompt → 后端事件 → transcript 流式渲染 → tool 卡片；
5. 退出/Stop 真正杀掉子进程并清理。

## 1. 文件所有权（写权限）

| 区域 | 所有者 | 范围 |
|---|---|---|
| Rust 全部 | `backend` | `crates/**`、`.test-shim/**` |
| 会话/审批/Composer 竖切 | `fe-session` | `src/hooks/useSession.ts`、`src/hooks/useComposer.ts`、`src/hooks/useApproval.tsx`、`src/components/composer/**`、`src/components/approval/**`、`src/components/ThreadWorkspace.tsx`、`src/components/Sidebar.tsx` |
| Transcript 竖切 | `fe-transcript` | `src/hooks/useTranscript.tsx`、`src/hooks/useVirtualScroll.ts`、`src/components/transcript/**` |
| 壳层/主题/布局 | `fe-shell` | `src/hooks/useLayoutState.tsx`、`src/hooks/useStore.ts`、`src/hooks/useTheme.ts`、`src/hooks/useShortcuts.ts`、`src/lib/tauri.ts`、`src/lib/store.ts`、`src/components/Rail.tsx`、`src/components/RightDock.tsx`、`src/views/Layout.tsx`、`src/App.tsx`、`src/main.tsx`、`src/i18n/**`、`src/tokens.css` |
| Dock 竖切 | `fe-dock` | `src/hooks/useTerminal.ts`、`src/hooks/usePreview.ts`、`src/hooks/useDiff.ts`、`src/hooks/useWorktree.ts`、`src/components/dock/**` |
| 契约/配置/类型/集成 | `lead` | `docs/m2/**`、`src/types/**`、`src/lib/utils.ts`、`vite.config.ts`、`crates/omp-tauri/tauri.conf.json`、`package.json`、`playwright.config.ts`、`eslint.config.js`、`vitest.config.ts`、`.gitignore`、`scripts/**`、`index.html`、根 `Cargo.toml` |

不要修改别人负责的文件。需要接口变更 → 发消息给对应所有者 + Lead，由 Lead 更新本文件。

## 2. IPC 契约（Tauri command）

规则：**不要**用 `args: XxxArgs` 包装（Tauri 2 会把外层参数名 camelCase，前端平铺对象会 IPC 层失败）。
所有 command 参数平铺；JS 端一律传 camelCase；`State`/`AppHandle` 不参与 JS 参数。
返回 `Result<T, String>`（错误字符串可直接显示）。

```rust
// crates/omp-tauri/src/commands.rs
#[tauri::command]
async fn spawn_session(app: AppHandle, state: State<'_, AppState>, cwd: String, extra_args: Option<Vec<String>>) -> Result<SpawnSessionResult, String>;
#[tauri::command]
async fn send_prompt(state: State<'_, AppState>, session_id: String, prompt: String) -> Result<(), String>;
#[tauri::command]
async fn send_ui_response(state: State<'_, AppState>, session_id: String, request_id: String, response: serde_json::Value) -> Result<(), String>;
#[tauri::command]
async fn close_session(state: State<'_, AppState>, session_id: String) -> Result<(), String>;
#[tauri::command]
async fn abort(state: State<'_, AppState>, session_id: String) -> Result<(), String>;
#[tauri::command]
async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String>; // 替代 list_worktrees 桩
#[tauri::command]
async fn worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String>;
#[tauri::command]
async fn worktree_create(repo_path: String, path: String, branch: String, base_branch: Option<String>) -> Result<WorktreeInfo, String>;
#[tauri::command]
async fn worktree_remove(repo_path: String, path: String, force: bool) -> Result<(), String>;
#[tauri::command]
async fn worktree_prune(repo_path: String) -> Result<(), String>;
#[tauri::command]
async fn diff_compute(old_content: String, new_content: String) -> Result<String, String>; // unified diff text
#[tauri::command]
async fn pty_spawn(app: AppHandle, registry: State<'_, PtyRegistry>, shell: Option<String>, cwd: Option<String>, cols: u16, rows: u16) -> Result<PtySpawnResult, String>;
#[tauri::command]
async fn pty_write(registry: State<'_, PtyRegistry>, pid: u32, data: String) -> Result<(), String>;
#[tauri::command]
async fn pty_resize(registry: State<'_, PtyRegistry>, pid: u32, cols: u16, rows: u16) -> Result<(), String>;
#[tauri::command]
async fn pty_kill(registry: State<'_, PtyRegistry>, pid: u32) -> Result<(), String>;
#[tauri::command]
async fn pty_read(registry: State<'_, PtyRegistry>, pid: u32) -> Result<PtyReadResult, String>; // 兜底（事件丢失时）
```

返回类型（serialize camelCase）：

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpawnSessionResult { session_id: String, cwd: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo { id: String, cwd: String, alive: bool, created_at: u64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeInfo { path: String, branch: Option<String>, commit: Option<String>, bare: bool, detached: bool, locked: bool, prunable: bool }
// 字段与 src/types/dock.ts 的 WorktreeInfo 对齐（branch/commit 在前端为 string，后端用空串兜底）

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PtySpawnResult { pid: u32 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyReadResult { pid: u32, data: String, exited: bool }
```

前端调用（严格一致）：

```ts
invoke<SpawnSessionResult>('spawn_session', { cwd, extraArgs: extraArgs ?? [] })
invoke('send_prompt', { sessionId, prompt })
invoke('send_ui_response', { sessionId, requestId, response })
invoke('close_session', { sessionId })
invoke('abort', { sessionId })
invoke<SessionInfo[]>('list_sessions')
invoke<WorktreeInfo[]>('worktree_list', { repoPath })
invoke<WorktreeInfo>('worktree_create', { repoPath, path, branch, baseBranch })
invoke('worktree_remove', { repoPath, path, force })
invoke('worktree_prune', { repoPath })
invoke<string>('diff_compute', { oldContent, newContent }) // unified diff text
invoke<PtySpawnResult>('pty_spawn', { shell, cwd, cols, rows })
invoke('pty_write', { pid, data })
invoke('pty_resize', { pid, cols, rows })
invoke('pty_kill', { pid })
invoke<PtyReadResult>('pty_read', { pid })
```

`build.rs` 的 `commands([...])`、`lib.rs` 的 `generate_handler![...]`、`capabilities/default.json` 的 permission 列表三者必须完全一致，且与上表一致（`list_worktrees` 删除，`list_sessions` 新增）。

## 3. 事件契约

### 3.1 会话事件

通道 `omp://event`（常量 `EVENT_CHANNEL`），payload 为信封：

```rust
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionEnvelope { pub session_id: String, pub event: FrontendEvent }
```

`FrontendEvent` 必须是 `#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]`。

变体（与 `src/types/ipc.ts` 一一对应）：

| type | 字段 |
|---|---|
| `ready` | `protocolVersion: number`, `maxFrameBytes?: number` |
| `agent_start` | — |
| `turn_start` | — |
| `message_start` | `role: string`, `messageId?: string` |
| `message_delta` | `kind: 'text' \| 'thinking'`, `delta: string` |
| `message_end` | `messageId?: string` |
| `turn_end` | — |
| `agent_end` | — |
| `prompt_result` | `success: boolean`, `status?: string`, `data?: unknown` |
| `available_commands` | `commands: SlashCommand[]` |
| `available_models` | `models: ModelInfo[]` |
| `tool_execution_start` | `toolCallId: string`, `name: string`, `args?: unknown` |
| `tool_execution_end` | `toolCallId: string`, `name: string`, `status: 'ok' \| 'error'`, `result?: unknown`, `error?: string` |
| `ui_request` | `id: string`, `method: string`, `title?: string`, `options?: string[]`, `extra: Record<string, unknown>` |
| `session_settled` | — |
| `session_closed` | `code?: number`, `reason?: string` |
| `noise` | `text: string` |
| `error` | `message: string` |

映射必须修补：

- `ToolExecutionStart/End` → 真事件（不再是 Noise）。字段从 payload 尝试读 `toolCallId`/`toolCall_id`/`id` 与 `name`/`toolName`/`tool`，容错。
- `Inbound::Response` → `FrontendEvent::Response{command, success, data, error}`（新增变体，前端可忽略但不得丢弃）。
- `PromptResult` → 保真：`success`、`status` 从 payload `status` 读取，`data` 整体透传。
- `AvailableModels` → 由 `ready`/`available_models` 事件构造；若协议无此事件，构造空数组并**不**发假事件。前端必须有空态。
- 广播 `Lagged(n)`：跳过并继续，**不得**当 Closed 结束会话。
- `LineSplitter` 升级 maxFrameBytes：保留已有缓冲，不得重建丢数据（改为 `LineSplitter::set_max_frame_bytes(&mut self, n)`）。
- 发射：`app.emit_to(EventTarget::webview_window("main"), EVENT_CHANNEL, envelope)` 或 `emit` + 前端按 `sessionId` 过滤；**每个事件必须带 session_id**。

### 3.2 PTY 事件

通道 `omp://pty`，payload：

```rust
#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum PtyEvent {
    Data { pid: u32, data: String },
    Exit { pid: u32, code: Option<i32> },
}
```

后端在 reader pump 中按块发射 `Data`（UTF-8 增量解码，不切断多字节序列）；进程退出时发射 `Exit` 并从 registry 移除。前端 `useTerminal` 监听一次该通道并按 pid 分发；`pty_read` 仅作兜底。

## 4. 类型文件（Lead 已写入，视为只读）

- `src/types/ipc.ts` — IPC 返回类型 + `FrontendEvent`/`SessionEnvelope`/`PtyEvent`。
- `src/types/session.ts` — `SessionSummary`、`SessionStatus`。
- 既有 `src/types/{layout,transcript,approval,composer,dock,theme}.ts`：所有者可在**不破坏其他区域**的前提下扩充，但需在完成消息里列出新增导出。

## 5. 前端 Provider / Hook 契约

### 5.1 布局状态（唯一实例）

`src/hooks/useLayoutState.tsx`：

```tsx
export function LayoutStateProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useLayoutState(): LayoutStateApi
// LayoutStateApi: { state: LayoutState, ready: boolean, railWidth, sidebarWidth, dockWidth,
//   setRailView, toggleSidebar, toggleDock, setDockTab, setDockWidth, setSidebarWidth }
```

- 全局唯一 `useState` + 唯一持久化；**不得**在 hook 内再注册 `window` keydown。
- 快捷键统一由 `useShortcuts()` 在 `App` 顶层注册一次（依赖 `useLayoutState()`）。
- 必须用 `React.useSyncExternalStore` 或 context；禁止多个 `useState` 副本。

### 5.2 会话（全局唯一状态）

`src/hooks/useSession.ts` + `src/lib/sessionStore.ts`：

```ts
export interface SessionApi {
  sessions: SessionSummary[]
  activeSessionId: string | null
  activeSession: SessionSummary | null
  ready: boolean
  error: string | null
  spawnSession(cwd?: string, extraArgs?: string[]): Promise<string>   // 返回新 sessionId
  closeSession(id?: string): Promise<void>
  selectSession(id: string | null): void
  refreshSessions(): Promise<void>
}
export function useSession(): SessionApi
```

- 启动时 `list_sessions()`；为空则自动 `spawn_session(默认 cwd)`；**禁止** mock 会话。
- `closeSession` 调 `close_session` 并清理 store。

### 5.3 Transcript（唯一实例，Provider）

`src/hooks/useTranscript.tsx`：

```tsx
export function TranscriptProvider({ sessionId, children }): JSX.Element // sessionId: string | null
export function useTranscript(): {
  messages: Message[]
  isStreaming: boolean
  anchorToBottom: boolean
  pendingToolCalls: Map<string, ToolCallState>
  setAnchorToBottom(v: boolean): void
  addUserMessage(text: string): void
  reset(): void
}
```

- Provider 内唯一 `listen('omp://event')`；按信封 `sessionId` 过滤；sessionId 变化时 `reset()`。
- 流式增量：**rAF 批量合并**（每帧最多 flush 一次），禁止"每 delta 重置 16ms 定时器"式饥饿。
- `tool_execution_start/end` 驱动 tool 卡片状态。

### 5.4 审批（唯一实例，Provider）

`src/hooks/useApproval.tsx`：

```tsx
export function ApprovalProvider({ sessionId, children }): JSX.Element
export function useApproval(): {
  pendingRequests: Map<string, ApprovalRequest>   // 仅 select/confirm/input/editor
  toasts: Toast[]
  statusItems: StatusItem[]
  widgetItems: WidgetItem[]
  titleItem: string | null
  respond(id: string, value: unknown, cancelled?: boolean): Promise<void>
  dismissToast(id: string): void
}
```

- `notify/setStatus/setWidget/setTitle` **绝不**进 `pendingRequests`。
- 响应值：`confirm → true/false`；`select → options[i] 原始字符串`（不是 i18n 标签）；`input/editor → string`；取消 → `{ cancelled: true }`。
- 超时：`APPROVAL_TIMEOUT_MS = 120_000`；超时 → `respond(id, null, true)`；`editor` 不超时。
- Esc → deny；`data-cancel` 按钮为拒绝；模态必须有焦点陷阱，且 Esc 不受 `isTypingTarget` 影响。
- `respond` 先 `invoke` 成功后再移除 pending。

### 5.5 Composer

`useComposer(sessionId)` 保持现有导出，但：

- `sendPrompt` 必须 `useTranscript().addUserMessage(value)`，然后 `invoke('send_prompt', { sessionId, prompt })`；失败回滚输入并显示错误。
- `stop` → `invoke('abort', { sessionId })`，并本地置 `isRunning=false`（后端会发 `session_closed`/`session_settled`）。
- 运行状态唯一来源：`useTranscript().isStreaming`（不得各自维护）。

### 5.6 Tauri 环境与 store（唯一检测）

`src/lib/tauri.ts`：

```ts
export function isTauri(): boolean            // __TAURI_INTERNALS__ || __TAURI__
export async function invokeSafe<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null>
```

`src/lib/store.ts`（tauri-plugin-store 正确协议）：

```ts
export async function storeLoad(path: string): Promise<void>          // plugin:store|load -> rid
export async function storeGet<T>(path: string, key: string): Promise<T | null>  // plugin:store|get {rid,key} -> [value, exists]
export async function storeSet<T>(path: string, key: string, value: T): Promise<void> // 值不 stringify
export async function storeSave(path: string): Promise<void>
```

- `get` 返回元组 `[value, exists]`；必须 `plugin:store|load` 先取 rid 并缓存。
- `tauri.conf.json` 设 `app.withGlobalTauri: true`；`plugins.store` 里删除非法 `autoSave`。
- 浏览器模式（无 Tauri）：`localStorage` 等价实现，不得静默失败；错误要 `console.error`。

### 5.7 Dock

- `useTerminal`：`pty_spawn` 用契约 payload；监听 `omp://pty` 按 pid 分发；`pty_read` 兜底轮询 250ms；卸载时 `pty_kill`。
- `usePreview`：Tauri 分支用 `WebviewWindow`（`@tauri-apps/api/webviewWindow`）创建 `preview` 窗口，仅允许 `http/https`；非 Tauri 用 `<iframe sandbox>`；导航前校验 `new URL()` 协议。
- `useDiff`：仅用 `diff_compute` + 内置降级（不得依赖未安装的 `diff` 包）。
- `useWorktree`：只用 `worktree_*` 返回的 JSON 数组，删除 porcelain 文本解析。

## 6. Rust 行为契约

### 6.1 会话生命周期（P0-4）

```rust
pub struct SessionHandle { /* 不再持有 broadcast::Sender */ }
pub struct Session { /* owns tokio::process::Child */ }

impl Session {
    pub fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>>;
    pub fn kill(&mut self) -> std::io::Result<()>;
    pub fn id(&self) -> &str;
}
pub fn spawn(cwd: &str, extra_args: &[String]) -> anyhow::Result<(Session, broadcast::Receiver<SessionEvent>)>;
```

- `broadcast::Sender` 只被 stdout/stderr pump 持有 → EOF 后 `recv()` 必然 `Closed`。
- `close_session`/`abort`：从 map 取出、`kill().await`、等待退出（≤2s 超时），发 `session_closed`。
- 会话退出后由 monitor 清理 map 并广播 `session_closed`。
- `AppState.sessions: Mutex<HashMap<String, ManagedSession>>`，`ManagedSession { handle: SessionHandle, session: Arc<tokio::sync::Mutex<Session>> }`。
- 不得有 `while let Ok(ev) = rx.recv().await`（Lagged 会终止）；用 `loop { match rx.recv().await { Ok, Err(Lagged)=>continue, Err(Closed)=>break } }`。

### 6.2 diff / worktree（P0-11）

- `compute_unified_diff` 禁止索引越界；任意输入（含一方耗尽）不 panic；补 `a,b,c` vs `a,b,c,d` 单测与 proptest。
- `worktree_create` argv：`["worktree","add","-b",branch,path,base_branch?]`；先校验 `repo_path`/`path` 为绝对路径并 canonicalize，拒绝 `..` 逃逸；git 调用带 `--` 分隔。
- `worktree_list` 解析 `--porcelain` 后**返回结构化数组**。
- `git_output`：`tokio::time::timeout(10s)` + 输出上限 4 MiB。
- `worktree_remove` 前检查 `git status --porcelain` 非空则拒绝（除非 `force`）。

### 6.3 PTY（P0-7）

- `PtyEntry` 缓存 `Box<dyn Write + Send>`（`take_writer()` 只调用一次），`write` 复用。
- reader 用 `spawn_blocking`/专用线程，禁止在 async 任务里阻塞读。
- UTF-8 增量解码；缓冲上限 1 MiB 时保留最新数据（丢弃最旧，不整段清空）。
- reader/exit 通过 `omp://pty` 发事件；退出后从 registry 移除。
- `shell` 白名单（basename ∈ {bash, sh, zsh, fish, pwsh, powershell.exe, cmd.exe}），`cwd` 必须存在且为目录；env 只保留最小集合。

## 7. 构建链（P0-1）

- `vite.config.ts`：`build.outDir = 'dist'`、`emptyOutDir: true`、`server.port 1420`、`clearScreen:false`、`envPrefix`。
- `tauri.conf.json`：`build.frontendDist = "../../dist"`、`build.devUrl = "http://localhost:1420"`、`beforeDevCommand = "npm run dev"`、`beforeBuildCommand = "npm run build"`；`app.withGlobalTauri: true`；`app.security.csp` 设为显式策略（禁止 `null`）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420; font-src 'self' data:; frame-src http: https:`。
- `bundle.icon` 使用 `crates/omp-tauri/icons/` 下实际存在的文件；缺失则生成 32/128/256 PNG + icon.ico/icns，或从 `bundle.icon` 移除不存在的条目并保留 `active:false`？→ **必须提供真实图标文件**（脚本生成 PNG，ico/icns 用 `tauri icon` 若可用，否则只保留 PNG + 平台默认）。
- `package.json`：`e2e: "playwright test"`；新增 `typecheck: "tsc --noEmit"`。
- `playwright.config.ts`：删除重复 `use`；e2e 用 `scripts/e2e_smoke.spec.ts`。
- `.gitignore`：`/target`、`node_modules`、`dist`、`playwright-report`、`test-results`、`.agents/`。

## 8. 验收命令（每个 agent 完成前必跑）

```bash
npx tsc --noEmit                                   # 前端类型
cargo check -p omp-protocol -p omp-host            # Rust（omp-tauri 需系统 WebKit，本机不可编译）
npx vitest run <自己负责的测试>                     # 单测
npx eslint <自己负责的文件>                         # lint 自己的文件
```

报告中必须附：命令、退出码、关键输出行。禁止"应该可以"式结论。

## 9. 纪律

- 不改与本任务无关的设计；不引入新依赖（除非 Lead 同意）。
- 不吞异常：`catch {}` 必须至少 `console.error` 或返回错误状态。
- 不留 `TODO`/占位实现（`() => null` 的 editor tab 必须实现）。
- 所有用户可见文案走 i18n（`en.json` / `zh-CN.json` 同步加 key）。
- 每完成一块立刻 `team_task_update` complete，并向 Lead 汇报：改动文件、命令证据、遗留风险。
