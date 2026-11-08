# omp-X M2 阶段代码审查报告

- **审查对象**：M2 里程碑（`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md` Tasks 1–7）
- **基线**：M2 base commit `e39f845`；HEAD `c90759a`（Task 3）；Tasks 4–7 的全部实现位于工作区未提交改动
- **范围**：`crates/omp-tauri/**`、`crates/omp-host/**`（M2 改动）、`src/**`、`scripts/**`、Tauri/Vite/Playwright 配置、`package.json`、`Cargo.*`、`docs/`
- **方法**：5 个只读专项审查（后端、Transcript/虚拟滚动、壳层/Dock/主题、Composer/审批/快捷键/E2E）+ 1 个独立验收门禁执行；Lead 对跨面关键结论（Tauri 宏参数命名、codegen panic、store rid、withGlobalTauri 默认值、布局 grid、虚拟滚动实现）逐条复核
- **专项报告**：[backend.md](docs/reviews/m2/backend.md)、[transcript.md](docs/reviews/m2/transcript.md)、[shell-dock.md](docs/reviews/m2/shell-dock.md)、[composer-approval.md](docs/reviews/m2/composer-approval.md)、[verification.md](docs/reviews/m2/verification.md)
- **约束**：本次审查未修改任何源码/配置（`git diff` 总量与审查前一致：+13061/−1378）；唯一新增为 `review_m2.md` 与 `docs/reviews/m2/`
- **日期**：2026-11-07

## 总体判定

> **FAIL — M2 不具备验收条件，也不具备“全绿进入 M3”的条件。**

M2 交付的是一套**从未成功编译、从未端到端联调过**的 GUI 骨架：

- 7 个 Task 中 **Task 3 / Task 7 判定 FAIL**，其余 5 个仅 **PARTIAL**；
- 8 项验收门禁中仅 `npm test`（2 个 theme 用例）通过；`npm run build`、`npm run lint`、`npm run e2e`、`cargo test --workspace`、`cargo check -p omp-tauri` 全部失败；
- 前端从未创建会话（`spawn_session` 零调用），所有有状态 IPC 命令的参数形状与服务端不匹配——**“发消息 → agent 回复”这条主链路在代码层面就是断的**；
- 布局状态未共享 + 四栏布局没有真正生效，Task 2 的交互验收不成立；
- Transcript 存在流式不刷新、虚拟行错位、空闲渲染死循环等运行时缺陷。

各专项报告给出的 Critical 经**去重后归纳为 12 个阻断级根因（P0）**，见 §3。修复顺序建议见 §9。

## 1. 验收门禁结果

| # | 命令 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | `cargo test -p omp-protocol -p omp-host -p omp-gui` | ✅ EXIT 0 | 21 passed；但 host session 的 2 个集成测试在未装 shim 时静默 `return`（假绿），配合 `scripts/test-setup.sh` 才真跑 |
| 2 | `cargo test --workspace` / `cargo check -p omp-tauri` | ❌ EXIT 101 | 环境性：缺 glib-2.0/gdk-3.0/gio-2.0/gobject-2.0/webkit2gtk-4.1 的 pkg-config 开发文件（运行时 `.so` 存在） |
| 3 | `npm test` | ✅ EXIT 0 | 仅 `src/hooks/useTheme.test.ts`：1 file / 2 tests |
| 4 | `npm run build` | ❌ EXIT 1 | `ENOENT: mkdir '/home/wr1ench/crates'`（Vite outDir 越出仓库） |
| 5 | `npm run lint` | ❌ EXIT 1 | 21 errors / 3 warnings（react-hooks/refs 14 个） |
| 6 | `npm run e2e` | ❌ EXIT 1 | `Error: No tests found.`（脚本指向不存在的 `scripts/e2e_smoke.ts`） |
| 7 | `npx tauri build --debug` | ❌ EXIT 1 | 先撞 Gate 4 的构建 bug；`tauri info` 同时报 webkit2gtk-4.1/rsvg2 缺失 |
| 8 | git/仓库卫生 | ❌ | Tasks 4–7 无提交；`.gitignore` 仅 `/target`；`HEAD` 不含 `pty.rs`/`build.rs`/capabilities |

> 环境限制说明：本沙箱缺少 WebKitGTK 开发包，Rust GUI 链路无法本地构建，这不是代码缺陷；但即使补齐系统依赖，**P0-1 的 Tauri 配置问题仍会让 `omp-tauri` 在编译期 panic**（见下）。此外缓存显示 22:31 曾有过一次成功编译，说明当前 `target/` 状态与 HEAD/工作区不一致，审查以源码与锁定依赖源码为准。

## 2. 问题规模

| 专项 | Critical | Important | Minor | 结论 |
|---|---|---|---|---|
| 后端（omp-tauri/omp-host/配置/安全） | 3 | 16 | 10 | FAIL |
| Transcript/虚拟滚动 | 4 | 11 | 9 | FAIL |
| 壳层/Dock/主题/i18n | 6 | 11 | 8 | FAIL |
| Composer/审批/快捷键/E2E | 4 | 18 | 12 | FAIL |
| 验收门禁 | — | — | — | 7/8 失败 |
| **去重后阻断级根因（P0）** | **12** | — | — | — |

## 3. 阻断级问题（P0，按依赖顺序）

### P0-1 构建/运行链路断裂：应用根本构建不起来

- `vite.config.ts:20`：`outDir: '../crates/omp-tauri/src'` 相对 **仓库根** 解析为 `/home/wr1ench/crates/...`（仓库外）→ `npm run build` ENOENT；若目标存在还会被 `emptyOutDir` 清空；若按作者意图相对 crate 解析，则会清空 Rust 源码目录。
- `crates/omp-tauri/tauri.conf.json:6-10`：`frontendDist: "../../../src"` 解析为 `/home/wr1ench/src`（不存在）。`tauri-codegen-2.7.4/src/context.rs:184-192` 在 debug 且无 `devUrl` 时会对不存在的 `frontendDist` **直接 panic**，而 `main.rs` 的 `generate_context!()` 在 `cargo check` 阶段展开。
- 同配置 `bundle.icon` 指向不存在的 `crates/omp-tauri/icons/`；无 `build.devUrl`，Tauri dev 无法加载 Vite（1420）。
- **影响**：Task 1 验收 `cargo check -p omp-tauri`、Task 7 验收 `cargo test --workspace` 不可能通过；**Tasks 4–7 的 Rust 代码从未被编译过**，这直接解释了后续大量契约错误为何没被发现。
- **修复**：Vite `outDir` 用仓库根 `dist/`；`tauri.conf` 加 `"devUrl": "http://localhost:1420"`、`"frontendDist": "../../dist"`；用 `cargo tauri icon` 生成并提交 icons；随后在有 WebKitGTK 开发包的机器上重跑 `cargo check/test`。

### P0-2 IPC 参数契约整体不匹配：所有有状态命令都会被拒

- Rust 所有有状态命令都是**单一结构体形参** `args: XxxArgs`：`commands.rs:32-69`（Args 定义）、`:185/:225/:239/:253/:268/:282/:296/:306/:320`（命令签名）、`pty.rs:90-94`；结构体内字段为 serde 默认 **snake_case**。
- Tauri 2 默认把形参名转 camelCase 并在 payload 中按该键查找（`tauri-macros-2.7.4/src/command/wrapper.rs:50`），因此 JS 必须发 `{ args: { session_id, prompt } }`。
- 前端全部发**扁平对象**：`useComposer.ts:64/146`、`useTranscript.ts:366`、`useApproval.ts:32-36`、`useWorktree.ts:89/109/132/154`（且字段为 `repoPath/baseBranch`）、`useTerminal.ts:41-45`。
- **影响**：`send_prompt`/`abort`/`send_ui_response`/`worktree_*`/`pty_spawn` 全部在 IPC 层被拒（`missing required key args` / 字段反序列化失败），到不了 handler。唯一匹配的是扁平签名的 `diff_compute`（`useDiff.ts:99`）与 `pty_write/resize/kill`。
- **修复**：二选一并写入契约文档：①命令改扁平形参（JS camelCase）；或 ②保留 `args` 包装 + `#[serde(rename_all = "camelCase")]`。补一条“Rust 命令签名 ↔ 前端 invoke 载荷”的契约测试。注意别破坏已正确的 `diff_compute`/`pty_write`。

### P0-3 前端从未创建会话：sessionId 来自 mock

- 全仓 `src/` **没有任何 `spawn_session` 调用**（后端实现是死代码：`commands.rs:181-220`）。
- `Layout.tsx:12` 初始 `sessionId = null`；`Sidebar.tsx:18-22/46-49` 使用硬编码 `MOCK_SESSIONS`，点击后把 `"1"/"2"/"3"` 当 session id 传上去。
- **影响**：`useComposer.sendPrompt` 在 null 时静默 return；即使选中 mock 会话，所有后端命令也返回 `unknown session`；审批事件流没有真实会话可挂靠；“真实 omp 跑一轮”的 Task 7 验收不可达。
- **修复**：新建会话 hook：`spawn_session(cwd, extra_args)` 拿后端返回 id；`sessionId` 只来自后端；mock 列表接入真实数据前不得驱动会话。

### P0-4 会话生命周期失效：Stop 杀不掉进程，退出留孤儿/僵尸

- `Session`（持有 `tokio::process::Child`）被 move 进 emitter 任务并永久持有（`commands.rs:198-211`）；该任务只会在 `rx.recv()` 返回 `Closed` 时结束，但 `SessionHandle` 自己持有 broadcast **Sender**（`session.rs:116-122`），因此永远等不到 Closed。
- `close_session` 只从 map 删除 `Arc<SessionHandle>`（`commands.rs:250-263`），`abort` 直接调用它（`:265-273`）；`SessionGuard` 是空 marker（`session.rs:43-58`），`kill_on_drop` 不可达。
- **影响**：Stop 后 omp 继续跑完整个 turn（继续调工具/改文件/产生费用）；子进程自然退出后 `Child` 永不 `wait` → 僵尸；pump 任务/fd 泄漏；`AppState.sessions` 只增不删；GUI 退出无 `RunEvent` 清理（`lib.rs:21-56`）→ 孤儿 `omp` 与 PTY shell。这是 `review_m1.md` Drop/reap 问题的**未完全回归**。
- **修复**：`SessionHandle` 持有可控终止原语（`Child` 所有权或 `close` Notify + `kill/wait().await`）；emitter 用 `tokio::select!` 监听关闭信号；退出时遍历 sessions/ptys 收尾；删除或真正实现 `SessionGuard`。

### P0-5 布局与布局状态：四栏未生效、组件各自为政

- `Layout.tsx:44-50` 只设置 `gridTemplateColumns` 内联样式，外层 `className="absolute inset-0 z-0"` **没有 `display:grid`**（Tailwind `grid` 类缺失）→ 计算样式为 block；而 `Rail`（`Rail.tsx:30-38`）、`Sidebar`（`Sidebar.tsx:171/195`）、`RightDock`（`RightDock.tsx:86-95`）全部 `fixed`，`ThreadWorkspace` 无左侧偏移、无 `h-full`。实测（verifier 探针）：`main` 高度仅 78px、composer 与 Sidebar 标题重叠、工作区被两侧面板覆盖。
- `useLayoutState` 有 **5 个互不相干的实例**：`Layout.tsx:11`、`Rail.tsx:27`、`Sidebar.tsx:26`、`RightDock.tsx:33`、`useShortcuts.ts:53`；每个实例各自 `useState` + 各自注册 ⌘B/⌘\ window keydown（`useLayoutState.ts:61-75`）+ 各自把**整份快照**写 store。实测：Rail 点击 worktrees 后 Sidebar 仍显示 Sessions；⌘B 只折叠 Sidebar 自己那份副本，Layout 栅格不变；快捷键与拖拽互相同步不到。
- **影响**：Task 2 的三栏布局/折叠/拖拽/持久化验收不成立；Task 7 快捷键依赖同一根因。
- **修复**：引入唯一 Layout Provider（Context + `useSyncExternalStore` 或 zustand），或把 state 提升到 `Layout` 用 props 下发；快捷键只在 Provider 注册一次；删除 hook 内部的重复 keydown。

### P0-6 桌面运行时判据与 store 持久化全部失效

- `tauri.conf.json` 未设 `app.withGlobalTauri`（默认 `false`，见 `tauri-utils-2.10.2/src/config.rs:5039`），但前端用 `'__TAURI__' in window` 判断桌面环境：`usePreview.ts:16`、`useTerminal.ts:30`、`useWorktree.ts:47/77`、`useDiff.ts:97` → **真实应用里恒为 false**：Terminal 使用 mock pid 9999、Preview 走 iframe、Worktree 走 `child_process`（webview 里不可用）、Diff 走浏览器分支。
- 三处持久化直接 `invoke('plugin:store|get/set/save')`，但 `tauri-plugin-store-2.5.0` 的 `get/set/save` **必须携带 `rid`**（`lib.rs:147-165/238-240`），`get` 返回 `(Option<JsonValue>, bool)` 元组；且前端未先 `plugin:store|load` 取 rid。`useStore.ts:15/31-32`、`useTheme.ts:26/45-46`、`i18n/index.ts:16/31-32` 全部会 invoke 失败并被 `catch` 吞掉。
- **影响**：布局/主题/语言持久化在真机上 100% 静默失败（Task 2 “刷新保持状态”不成立）；Terminal/Diff/Worktree/Preview 的 Tauri 分支永不执行。
- **修复**：统一用 `@tauri-apps/api/core` 的 `isTauri()` 或设置 `withGlobalTauri: true`（二选一并去掉浏览器 fallback）；store 改用 `Store.load()`/传 `rid`；删除无效的 `plugins.store.autoSave` 配置（store 2.5.0 无此结构）。

### P0-7 Terminal 前后端契约三处断裂（即使修好 P0-6 也不可用）

- **参数**：`useTerminal.ts:41-45` 扁平 `{shell, cols, rows}` vs `pty.rs:90` 的 `args: PtySpawnArgs`（同 P0-2）。
- **写入**：`pty.rs:36-48` 每次 `pty_write` 都 `take_writer()`，portable-pty 0.9 只允许成功一次（`unix.rs:357-364`）→ 第二次按键起必然失败。
- **输出**：后端不 emit `pty://<pid>/data|exit`（`pty.rs:131-166` 只发 Noise 到 `omp://event`），前端却监听这两个事件（`useTerminal.ts:48-55`），且从不调用后端提供的 `pty_read`（`pty.rs:208`）→ xterm 永远空白、退出无通知。
- 附带：reader 在 async 任务里做阻塞 `std::io::Read`（`pty.rs:133-155`）；`from_utf8_lossy` 跨轮询截断多字节字符；缓冲溢出 `clear()` 丢光旧数据；`exited` 无人读；退出后 registry 不清理。
- **修复**：明确单一通道（推荐 spec §4 的 event push）：PTY reader 用 `spawn_blocking`，按块 emit `pty://<pid>/data`/`exit`，UTF-8 增量解码；writer 只 `take_writer()` 一次并长期复用；`pty_spawn` 传 `cwd`/`TERM`。

### P0-8 事件桥接缺口：工具卡片/模型选择器/结束通知全部拿不到数据

- **工具**：`commands.rs:148-161` 把 `ToolExecutionStart/End` 降级为 `FrontendEvent::Noise`（只保留 name）；`events.rs` 没有对应变体；前端 `useTranscript.ts:211-262` 的 `tool_execution_*` 分支与 `ToolCard.tsx`/`pendingToolCalls` 是死代码 → 工具卡片永远不出现（Task 3 的 tool-card 验收不成立）。
- **模型**：`events.rs:45-47` 声明 `AvailableModels` 但 `map_host_event` 从不构造，协议侧也没有 models 事件 → 模型选择器永远空（Task 4 偏离）。
- **结束/错误**：`Inbound::Response` 被直接丢弃（`commands.rs:171-172`）、`PromptResult` 的 status/data 丢失（`:137-141`）、无 `SessionClosed` 事件、`is_alive` 无人调用 → prompt 失败/会话崩溃对 UI 不可见，`isRunning` 卡死。
- **多会话**：事件不带 `session_id`（`events.rs:13-67`），`app.emit` 广播到所有 webview（`:72-77`）；M4 多会话会串台，未来 Preview `WebviewWindow` 存在泄漏风险。
- **可靠性**：broadcast `Lagged` 被 `while let Ok` 当成关闭（`commands.rs:204-210`）→ 消费者一落后就结束 emitter、进而 `kill_on_drop` 杀掉正在流式的会话；`maxFrameBytes` 升级时整体替换 `LineSplitter` 丢弃已缓冲半帧（`session.rs:147-178`），真实 18.8KB `available_commands_update` 可能被吞。
- **修复**：按计划补 `ToolExecutionStart/End`（id/name/input/success/output）；事件加 `session_id` 并 `emit_to("main", ...)`；`recv()` 区分 `Lagged/Closed`；`LineSplitter` 提供 `set_max_frame_bytes` 保留缓冲；补 `SessionClosed`/Response 事件。

### P0-9 Transcript：流式不刷新、虚拟行错位、空闲渲染死循环

- **流式饿死**：`useTranscript.ts:100-118` 每来一个 delta 就 `clearTimeout` 再设 16ms `setTimeout`；500 tok/s（design §7）下计时器永远不触发，整段生成期 UI 不刷新，直到 `message_end`。设计要求的 rAF 每帧 drain **全仓未实现**（仅 16ms 定时器）。
- **虚拟行双重偏移**：`Transcript.tsx:43-47` 的虚拟行是普通流布局，又叠加 `translateY(start)`；它位于 `Transcript.tsx:83-86` 的 absolute 包裹层内 → 行间距逐行累加、滚动区与内容错位。
- **变高测量无效**：`useVirtualScroll.ts:30-94` 自管 `measuredHeights`，但从未调用 `virtualizer.measureElement`/`resizeItem`；`virtual-core` 的 measurement 依赖不含 `estimateSize`（`node_modules/@tanstack/virtual-core/dist/esm/index.js:725-737`）→ 位置全按估算，滚动跳变。
- **空闲渲染死循环**：`Transcript.tsx:32-36` 的 effect 依赖每次渲染都新建的 `scrollToBottom`（依赖不稳定回调）→ verifier 在浏览器空闲状态即捕获 **189 条 React “Maximum update depth exceeded”**。
- **用户消息不显示**：`useComposer.sendPrompt` 直接 invoke，不调用 `useTranscript.addUserMessage`；`addUserMessage/sendPrompt`（`useTranscript.ts:334-369`）无任何消费者，用户 prompt 不会进入 transcript。
- **其他**：流式期每帧全量 markdown 重渲染（`MessageBlock.tsx:38-43`，违反“`message_end` 后一次性渲染”）；thinking 每条消息强插空块且无法展开；system/noise 无 UI 落点；session 切换不重置状态；StrictMode 下 listen 清理竞态；scroll 容器无有界高度（`main` 高度 78px）。
- **修复**：rAF/每帧 drain；虚拟行改 absolute 定位（或去掉 translateY 并让 virtualizer 控制 offset）；用 `virtualizer.measureElement` + `data-index`；稳定 effect 依赖；把 `useTranscript` 提升到 `ThreadWorkspace` 共享，Composer 发送时先追加用户消息；流式期纯文本、结束后 markdown。
- **正面**：XSS 未发现——`markdown-it html:false` + 默认 `validateLink` 已阻断 `javascript:`/`data:`（`MessageBlock.tsx:24-30`）；24px 迟滞吸附逻辑符合设计。

### P0-10 审批流：状态型请求死锁、双实例、editor 路径缺失

- **状态型请求污染 pending**：`useApproval.ts:70-81` 把 `notify/setStatus/setWidget/setTitle` 也塞进 `pendingRequests`，且不为它们设超时、处理完也不删除；`ThreadWorkspace.tsx:16/32-37` 取第一条 pending 渲染 `ApprovalModal`，而 `ApprovalModal.tsx:198-200` 对未知 method 返回空内容 → **一次 notify/setTitle 就产生一个不可关闭的空模态，并永久挡住后续 select/confirm 审批**（协议 `inbound.rs:84-97` 确认这些 method 存在）。
- **双实例**：`Layout.tsx:13` 与 `ThreadWorkspace.tsx:14` 各创建一个 `useApproval`，双监听、双 30s 定时器；用户在 UI 回答后，另一个实例仍会在 30s 后回传过期 `cancelled`。
- **editor 链路**：计划要求的 `InputModal.tsx`、`EditorTab.tsx` 不存在；editor 在模态与 dock 各出现一次，dock 的 Save/Cancel 是空实现（`Layout.tsx:18-28`、`DockTabs.tsx:39-67`），`set_editor_text` 全仓未实现 → spec 的 “editor → dock 全屏 tab，保存/取消回传” 未达成。
- **硬约束失效**：`Esc=Deny` 在焦点位于 composer 时不可靠（`useShortcuts.ts:159-161` 对输入域直接 return；`select` 无 `data-cancel`、模态不自动聚焦/无 focus trap）；审批按钮文案作为回传 value 被 i18n 翻译（`ApprovalModal.tsx:65-102`）；连续 input/editor 请求复用非受控 DOM 导致答案串台；Enter 无 IME 组字保护；超时硬编码 30s 不可配、会话结束不取消、respond 先删 pending 再 invoke（失败即丢失）。
- **正确项**：无“全部允许”、Approve/Deny 分离、协议 title 等宽展示、notify toast 5s、按 id 管理超时。
- **修复**：状态型 method 直接写独立 state/立即删除；审批状态提升为唯一 Provider；按 method 区分取消值（select→`"Deny"`、confirm→`false`，需与 omp 确认）；补 EditorTab 并接通回传；焦点陷阱 + Esc 在模态上处理；IME 保护；超时可配 + session_settled 清理。

### P0-11 命令正确性与安全：diff panic、worktree 语义错误、Preview/权限缺口

- **`diff_compute` panic**：`commands.rs:340-390` 的自研 diff 在 old/new 一侧行先耗尽时仍切片 `old_lines[oi..oi+1]`（`:371-372`）→ 越界 panic（node 复刻：`a\nb\nc` → `a\nb\nc\nd` 必现）；异步命令 panic 后 invoke 可能永不 resolve，Diff tab 永久 loading。输出也非标准 unified diff（无上下文、hunk 计数口径错误），`diff2html` 无法正确解析。
- **worktree**：`worktree_create` argv 为 `worktree add <path> <branch>`，**缺 `-b`**（`commands.rs:295-303`），无法创建新分支；后端返回结构化 JSON 数组，前端却按 porcelain 文本 `split('\n\n')` 解析（`useWorktree.ts:5-46/89`）→ 列表必空；无路径 canonicalize/`--` 防护（`-` 开头可被 git 当选项、可写到仓库外）；`force` 删除无 dirty 检查（数据丢失风险）；`git_output` 无超时/输出上限（`:421-433`）。
- **Preview**：浏览器 fallback 用 `<iframe sandbox=...>`；Tauri 分支直接显示 “tauriOnly” 占位（`PreviewTab.tsx:120-123`）→ 真实应用预览不可用。没有 `WebviewWindow`、没有 `on_navigation` 白名单、没有 “预览页 `window.__TAURI__` 不存在” 的断言。**当前隔离成立**（未配置 `dangerousRemoteDomainIpcAccess`，capability 仅 `main`，远端内容在 iframe 内），但 spec §4/§9 的硬约束与 CI 断言未实现/未验证。
- **安全硬化**：主窗 `csp: null`（`tauri.conf.json:28-30`）；`pty_spawn` 的 shell/cwd 完全由 webview 决定并继承全部环境变量（含凭据）；`spawn_session` 的 `cwd`/`extra_args` 无校验。当前威胁模型依赖“前端代码可信”，一旦出现 DOM-XSS/供应链问题即可直接任意命令执行——与设计 §9 的防御纵深预期不符。
- **修复**：用 `similar` 等成熟 crate 生成标准 unified diff 并限制输入大小；worktree 改 `git worktree add -b <branch> -- <path> <base>`，前后端统一 JSON 契约，canonicalize + `--` + dirty 检查；补 Preview `WebviewWindow` + 导航白名单 + 隔离断言；主窗加 CSP；PTY shell 由后端决定、cwd 限定项目根、环境变量白名单。

### P0-12 测试、E2E、提交与仓库卫生

- **E2E 不可运行且断言失真**：`package.json:12` 指向不存在的 `scripts/e2e_smoke.ts`（实为 `.spec.ts`）→ `npm run e2e` 直接 `No tests found`；`playwright.config.ts` 顶层 `use` 键重复导致配置被静默覆盖；spec 用普通 Chromium 打开 Vite 页面，**没有 Tauri IPC**，且 `spawn('omp')` 与页面无任何桥 → `[data-role=assistant]` 永远不出现；`[data-testid=sidebar]`/`data-i18n`/`window.i18n` 均不存在；`.animate-spin` 的 `toBeHidden`、theme 自写自断、language 恒假等断言无意义。
- **前端测试缺口**：仅 2 个 theme 测试；`useTranscript`/`useVirtualScroll`/`useComposer`/`useApproval`/`useShortcuts` 零测试；无 5000 消息 fixture、无 `scripts/transcript_smoke.ts`、无 DOM<2000 / 内存<300MB 任何证据。
- **Rust 测试不可信**：host 集成测试未装 shim 时静默 skip（`tests/session.rs:22-31,64-68`）；`prompt_round_trips_through_the_child` 实际从未发送 prompt；fixture 用 `"text"` 字段而真实协议/mapper 用 `"delta"`；`fake_omp.sh` 的 `tail -f /dev/null` 不会被清理；omp-tauri 无命令/事件集成测试。
- **Lint**：21 errors / 3 warnings（`react-hooks/refs` 14 个，集中在 PreviewTab/TerminalTab/useTranscript）。
- **提交/卫生**：Tasks 4–7 的 13k+ 行改动全部未提交；Task 1+2 被压成一个提交（违反“每 Task 一提交”）；`.gitignore` 仅 `/target`，`node_modules/`（322MB）、`playwright-report/`、`.test-shim/`、`crates/omp-tauri/gen/`、`permissions/autogenerated/` 全部未忽略；HEAD 不含 `pty.rs`/`build.rs`/capabilities → **全新 clone 不可复现 M2**。
- **修复**：重写 E2E（Tauri WebDriver 或浏览器内 fake IPC，断言业务行为）；补关键 hook 单测与 5000 消息 fixture/性能断言；测试缺依赖时必须 `panic!` 而不是 skip；把真实抓包 fixture 纳入版本控制；补提交、修 `.gitignore`、删 `src/i18n.ts` 删除状态（已被 `src/i18n/index.ts` 取代）。

## 4. M2 任务符合度矩阵

| Task | 结论 | 核心证据 |
|---|---|---|
| 1 `omp-tauri` 脚手架 + Tauri/Vite 配置 | **PARTIAL** | 文件齐全但与 Task 2 合并提交；`cargo check -p omp-tauri` 因配置 panic（P0-1）不可能通过；无 “omp-X M2” 文案；无 devUrl |
| 2 三栏布局 + 持久化 + 折叠/拖拽 | **PARTIAL** | 面板能渲染；但缺 `display:grid`、工作区被覆盖；Rail 点击不切 Sidebar；持久化因 store 契约失效；窗口尺寸/位置持久化未实现 |
| 3 Transcript 虚拟滚动 + 流式 | **FAIL** | 文件齐全且已提交，但流式饿死/虚拟行错位/测量无效/空闲渲染死循环；无 fixture、无 transcript smoke、无 DOM/内存证据 |
| 4 Composer/模型/Slash/排队态/Stop | **PARTIAL** | Enter/Shift+Enter/附件/Slash 可用；模型选择器无数据源；Queued(n) 未实现；Stop 会销毁会话不重建；无提交 |
| 5 审批/Ttoast/状态条 | **PARTIAL** | toast/状态条/30s 超时存在；状态型 method 死锁、双实例、InputModal/EditorTab 缺失、set_editor_text 未实现、Esc=Deny 不可靠；无提交 |
| 6 Right Dock 四 tab/Preview/Terminal/Diff/Worktree | **PARTIAL** | tab 可切；Tauri 下 Preview 是占位、Terminal 三处断链、Diff 会 panic、Worktree 语义/契约错误；隔离断言缺失；无提交 |
| 7 主题/i18n/快捷键/E2E | **FAIL** | i18n 131/131 key 对齐、双主题 token 齐全，但快捷键矩阵与 spec 不符、语言/主题切换 UI 不可达、暗色 accent 对比度 4.24:1 未达 AA、无 contrast 报告、e2e 不可运行、真实 omp 一轮不可达 |

## 5. 关键偏离（计划/设计 → 实际）

| 计划/设计要求 | 实际 |
|---|---|
| 每 Task 一个 commit + 验收命令全绿 | Tasks 4–7 无提交；门禁 7/8 失败 |
| `cargo test --workspace` / `npm test` / `npm run e2e` 全绿 | 前两项失败/空洞，e2e 不存在 |
| 5000 消息 fixture + `scripts/transcript_smoke.ts` + DOM<2000 | 全部缺失 |
| `scripts/e2e_smoke.ts` 真实事件序列 | 文件名不符；浏览器无 IPC；断言恒真/恒假 |
| 默认窗 1280×800、最小 960×600 | 1400×900 / 最小 1000×650；无窗口位置持久化 |
| 模型选择器来自 `available_models`，无硬编码 | 事件永不发射，选择器恒空且选择不下发 |
| 排队态 “Queued (n)” | 未实现，运行中 textarea 直接 disabled |
| `input` 单行弹窗、`editor` dock 全屏 tab、`set_editor_text` | InputModal/EditorTab 缺失；editor dock 无回传；set_editor_text 无实现 |
| Preview `WebviewWindow` + IPC 隔离硬约束 + CI 断言 | Tauri 下 “tauriOnly” 占位；无导航白名单/隔离断言（当前 iframe 隔离成立） |
| 快捷键 ⌘K 命令面板 / ⌘1–9 跳 thread / ⌘⌥A 待审批 / ⌃⇧M 模型 | ⌘K 聚焦 composer；⌘1–7 切 rail；⌘⌥A 切 agents；⌃⇧M 切 sessions |
| 流式 rAF 每帧 drain；`message_end` 后一次性 markdown | 16ms 防抖（会被逐 delta 重置）；流式期每帧全量 markdown |
| better-colors 验证 WCAG AA | 无报告；暗色 `--accent` 于 `--bg-base` = 4.24:1（未达 4.5） |
| SessionConfig/SessionHandle 等共享契约 | `FrontendEvent` 与计划/TS 三份契约已漂移（tool/model 事件缺失） |

## 6. M1 审查回归

| review_m1 问题 | 结论 | 证据 |
|---|---|---|
| stderr 被丢弃 | ✅ 已修复 | `session.rs:109,190-212` 独立 stderr pump → Noise |
| 出站阻塞 UI | ✅ 已修复 | `session.rs:253-281` 全部 `try_send` + 类型化错误 |
| `max_frame_bytes as usize` 截断 | ❌ 未修复 | `session.rs:160` 仍是 `as usize` |
| Drop/reap、僵尸风险 | ⚠️ 仍存在，且新增泄漏 | `Session` 被 emitter 任务永久持有，`close_session` 杀不掉（P0-4） |
| session 测试只测 spawn | ⚠️ 改善但门禁下空跑 | 新增 5 单测 + 2 集成测试，未装 shim 时静默 skip |
| omp-gui `main.rs` 问题 | 不适用 | 现为 placeholder `exit(1)`、0 测试 |

## 7. 做得好的地方

- **事件契约设计**：单通道 `omp://event` + serde `tag="type"`/snake_case，Rust 枚举与 TS 镜像注释清晰（`events.rs:1-8`、`useTranscript.ts:11-47`）。
- **协议解析健壮**：未知 type/字段降级 `Unknown/Raw` 不 panic；分帧器处理 `maxFrameBytes`/超长帧/CRLF，有单测。
- **安全底线**：审批无“全部允许”；协议 title 等宽原样展示；无 `dangerousRemoteDomainIpcAccess`；capability 只授予 `main` 且逐命令白名单；markdown `html:false` 阻断 XSS。
- **M1 回归**：stderr 转发、`try_send` 非阻塞发送已修好。
- **基础组件质量**：i18n en/zh 131/131 完全对齐；tokens 双主题覆盖 spec 所需变量；24px 迟滞吸附语义正确；PTY 用 `portable-pty` 自桥方向正确；`diff_compute`/`pty_write` 的扁平参数契约与前端一致。
- **审查一致性**：5 个独立专项报告对核心根因（IPC 契约、无 spawn、生命周期、状态不共享）交叉印证，未出现互相矛盾的结论。

## 8. 修复路线图（建议）

### 第 0 批：先让应用“能编译、能启动”（P0）
1. 修构建链：Vite `outDir: 'dist'`；`tauri.conf` 加 `devUrl`、`frontendDist: "../../dist"`、补 icons；修 `withGlobalTauri`/`isTauri()`。
2. 统一 IPC 契约（推荐扁平形参 + camelCase，或 `args` + `rename_all`），补契约测试；修 `spawn_session` 调用与真实会话 id。
3. 恢复编译后跑 `cargo check -p omp-tauri` + `cargo test --workspace`，把暴露出的 Rust 编译/类型错误一次性清掉。

### 第 1 批：打通主链路与桌面能力（P0）
4. 会话生命周期：`close/abort` kill+wait、`SessionClosed` 事件、退出清理。
5. 事件桥接：tool/model/response/session_id；`Lagged` 处理；`LineSplitter` 保留缓冲。
6. PTY：单一 event 通道 + writer 复用 + 非阻塞 reader + UTF-8 增量解码。
7. 布局：`display:grid` + 唯一 Layout Provider；快捷键只注册一次。
8. Transcript：rAF drain、虚拟行定位/`measureElement`、effect 依赖稳定、用户消息入 transcript、流式 markdown 延后。
9. 审批：状态型 method 移出 pending、唯一 Provider、editor 路由回传、Esc/焦点/IME/取消值。

### 第 2 批：正确性、安全与验收证据（P1/P2）
10. `diff_compute` 换成熟实现 + 输入上限；worktree 语法/契约/路径防护。
11. Preview `WebviewWindow` + 隔离断言；主窗 CSP；PTY/spawn 参数收敛与最小环境。
12. 快捷键矩阵、语言/主题切换入口、硬编码文案、对比度 AA、`--warning` token。
13. 测试：5000 fixture + transcript 性能断言 + hook 单测 + 契约测试；重写 E2E；测试缺依赖时失败而非 skip。
14. 流程：按 Task 补提交、修 `.gitignore`、清理未跟踪生成物，然后重跑全部门禁。

### 复验清单（修复后必须重新执行）
```bash
cargo check -p omp-tauri            # 需 WebKitGTK 开发包环境
cargo test --workspace
npm test
npm run build
npm run lint
npm run e2e                         # 重写后的真实 Tauri E2E
npx tauri build --debug
git status --short                  # 期望无未跟踪源码/生成物噪音
```
另需补：真实 `omp --mode rpc-ui` 一轮（spawn → prompt → stream → tool → session settled），以及 5000 消息 fixture 的 DOM<2000 / 内存<300MB / 滚动帧耗时报告。

## 9. 结论

M2 的**代码结构与契约意识**（单通道事件、协议容错、审批安全底线、i18n 对齐）方向正确，但当前交付物在**构建、IPC、会话生命周期、布局状态、事件桥接、Transcript、审批、E2E** 八个层面同时断裂，属于“写完了但没有任何一条主链路被真正跑通”的状态。建议按 §8 的第 0/1 批修复后重新执行完整门禁与真实 omp 联调，再评估能否进入 M3。

**判定：FAIL（不可合入、不可作为 M3 的绿色基线）。**
