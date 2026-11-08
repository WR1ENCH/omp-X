# M2 Composer / 审批流 / 快捷键 / E2E 审查（Task 4、5、7）

审查者：composer-reviewer（只读审查）
审查日期：2026-11-07
基线：M2 base `e39f845`；被审对象为工作区中未提交的 Task 4–7 实现（`git status` 显示 `src/components/composer/`、`src/components/approval/`、`useComposer/useApproval/useShortcuts`、`scripts/e2e_smoke.spec.ts`、`playwright.config.ts` 等均为 untracked）。

## 审查范围

主审文件：

- `src/components/composer/{Composer,ModelSelector,SlashMenu,AttachmentButton}.tsx`
- `src/components/approval/{ApprovalModal,StatusBar,Toast}.tsx`
- `src/hooks/{useComposer,useApproval,useShortcuts}.ts`
- `src/types/{composer,approval}.ts`
- `src/main.tsx`、`src/App.tsx`
- `scripts/e2e_smoke.spec.ts`、`playwright.config.ts`、`scripts/deny_probe.sh`

为核对契约与集成，另读取：`crates/omp-tauri/src/{commands,events,lib}.rs`、`crates/omp-protocol/src/inbound.rs`、`crates/omp-host/src/session.rs`（响应序列化）、`src/hooks/useTranscript.ts`、`src/views/Layout.tsx`、`src/components/ThreadWorkspace.tsx`、`src/components/dock/DockTabs.tsx`、`src/hooks/useLayoutState.ts`、`src/components/{Sidebar,Rail,RightDock}.tsx`、`src/i18n/*`、`src/tokens.css`、`package.json`、`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md`、`docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md`、`review_m1.md`。

本次审查未修改任何源码/配置，唯一写入为本文件。按任务约定未执行 build/lint/test/e2e（由 verifier 执行 gate）；所引用的 gate 现状来自任务说明（`npm test` 仅 2 个 theme 测试；`npm run build` 因 vite outDir 失败；`npm run lint` 21 errors）。

## 验证证据

以下均为只读命令/源码交叉验证的结果。

1. **IPC 参数形状（C2 证据）**
   - `grep -rn "invoke(" src`：
     - `src/hooks/useComposer.ts:64` `invoke('send_prompt', { session_id: sessionId, prompt })`
     - `src/hooks/useComposer.ts:146` `invoke('abort', { session_id: sessionId })`
     - `src/hooks/useApproval.ts:32-36` `invoke('send_ui_response', { session_id, request_id, response })`
     - `src/hooks/useTranscript.ts:366` `invoke('send_prompt', { session_id: sid, prompt })`
   - 后端签名是单一结构体参数：`crates/omp-tauri/src/commands.rs:32-35`（`SendPromptArgs { session_id, prompt }`）、`:37-42`（`SendUiResponseArgs { session_id, request_id, response }`）、`:44-47`（`CloseSessionArgs { session_id }`）、`:222-234`（`send_prompt(state, args: SendPromptArgs)`）、`:236-248`、`:265-273`。
   - 本地 Tauri 宏源码确认默认参数命名：`~/.cargo/registry/.../tauri-macros-2.7.4/src/command/wrapper.rs:50` `argument_case: ArgumentCase::Camel`，且无 `#[tauri::command(rename_all = "snake_case")]`（`grep -rn "rename_all" crates/omp-tauri/src` 只命中 `events.rs:14` 的 serde）。
   - 结论：前端必须传 `{ args: { session_id, prompt } }`；当前平铺传入会因缺少必需键 `args` 被 invoke 直接拒绝。

2. **会话创建链路**
   - `grep -rn "spawn_session" src` 无结果；`grep -rn "spawn_session" crates/omp-tauri/src/lib.rs` 命中注册（`lib.rs:28`），后端实现 `commands.rs:181-220`。
   - `src/views/Layout.tsx:12` `useState<string | null>(null)`；`src/components/Sidebar.tsx:18-22` 为硬编码 `MOCK_SESSIONS`，`:46-49` 点击时把 mock id 传给 `onSessionSelect`。

3. **用户消息不进入 transcript**
   - `grep -rn "addUserMessage\|useTranscript(" src`：`useTranscript` 只在 `src/components/transcript/Transcript.tsx:19` 实例化并只解构 `{ state, setAnchorToBottom }`（`:19,46`）；`addUserMessage/sendPrompt` 定义于 `src/hooks/useTranscript.ts:334-369`，无外部调用者。

4. **审批请求入队范围**
   - `src/hooks/useApproval.ts:70-74` 对所有 `method` 无条件 `pendingRequests.set(id, ...)`；`:76-81` 只对非 notify/setStatus/setWidget/setTitle 设 30s 超时；`src/components/ThreadWorkspace.tsx:16` 取任意第一个 pending 交给 `ApprovalModal`；`src/components/approval/ApprovalModal.tsx:198-200` 对未知 method 只返回 `null` 内容，但 `:203-229` 仍渲染遮罩与 dialog。

5. **AvailableModels 永不发射**
   - `grep -rn "AvailableModels" crates/ src/`：仅 `crates/omp-tauri/src/events.rs:45-47` 声明变体与前端 `useComposer.ts:19,26` 使用；`commands.rs:89-178` 的 `map_host_event` 无该映射；`grep -rn "available_models" crates/omp-protocol crates/omp-host crates/omp-tauri` 无结果。

6. **重复 useApproval 实例**
   - `src/views/Layout.tsx:13` 与 `src/components/ThreadWorkspace.tsx:14` 各调用一次 `useApproval(sessionId)`；`Layout.tsx:18-28` 的 `handleEditorSave/handleEditorCancel/handleEditorChange` 均为空实现（注释称由 ThreadWorkspace 处理）。

7. **E2E 可执行性**
   - `package.json:12` `"e2e": "playwright test scripts/e2e_smoke.ts"`；`ls scripts/` 只有 `e2e_smoke.spec.ts`，无 `e2e_smoke.ts`。
   - `playwright.config.ts:10-15` 与 `:39-45` 各有一个顶层 `use` 键（重复键，后者静默覆盖前者）。
   - `grep -rn "data-testid\|data-i18n" src index.html`：无 `data-testid` 属性、无 `data-i18n` 属性；`grep -rn "window.i18n" src` 无结果（仅在 `scripts/e2e_smoke.spec.ts:148` 存在）。
   - `data-role="assistant"` 实际存在于 `src/components/transcript/MessageBlock.tsx:51`。
   - Vite dev server 端口 1420（`vite.config.ts:11-13`），与 E2E `page.goto('http://localhost:1420')`（`scripts/e2e_smoke.spec.ts:54`）一致。

8. **CSS token**：`grep -o -- '--[a-z-]*:' src/tokens.css` 有 `--warning-muted` 但**没有** `--warning`；`src/components/approval/Toast.tsx:50` 使用 `var(--warning)`。

9. **测试覆盖**：`ls src/hooks/*.test.ts` 仅 `useTheme.test.ts`；`useComposer/useApproval/useShortcuts` 无单测。

10. **deny_probe.sh CLI 兼容性**：本地 `~/.local/bin/omp --help`（v18.4.3）确认 `--mode rpc-ui`、`--cwd`、`--approval-mode always-ask` 均存在，脚本 flag 方向正确。

11. **UI 文案 key**：`src/i18n/en.json`/`zh-CN.json` 的 `composer/approval/status/toast/common` 分组齐全（含 `composer.queue`），但 `composer.queue` 在 `src/` 无引用（排队态未实现）。

## 优点

- Rust 侧单一事件通道设计清晰：`events.rs:1-8` 的契约注释与 `useTranscript.ts:11-12` 的注释一致；`FrontendEvent` 的 `tag = "type"` + snake_case 与前端 switch 分支对得上。
- 审批安全底线正确：全仓库不存在「全部允许 / Allow All」入口；`confirm` 的 Approve/Deny 明确分离（`ApprovalModal.tsx:89-116`）；协议原始 title 用 `font-mono` 展示（`ApprovalModal.tsx:222`）。
- `notify` 走 toast、默认 5s 自动消失（`useApproval.ts:44-52`），Toast 使用 portal + `aria-live="polite"`（`Toast.tsx:56-65`）；`setStatus/setWidget/setTitle` 状态条渲染完整（`StatusBar.tsx:18-51`）。
- 审批按请求 `id` 关联并按 id 清理超时（`useApproval.ts:15-42,117-122`）；`pendingRequests` 用 Map 支持多请求排队（`useApproval.ts:8,70-74`）。
- Composer 组件拆分合理，模型下拉完全由 `availableModels` 驱动、无硬编码列表（`useComposer.ts:19-28`；`ModelSelector.tsx:73-90`）；`/` 触发与选择回填逻辑存在（`Composer.tsx:40-46`；`useComposer.ts:99-108`）。
- `Shift+Enter` 换行成立——只拦截无 shift 的 Enter（`useComposer.ts:71-79`）。
- 新增 UI 文案全部走 `t()`，en/zh 资源均覆盖（`src/i18n/*.json`）。
- 后端 capability 只允许白名单命令（`crates/omp-tauri/capabilities/default.json`），`core:event:deny-emit` 等最小权限方向正确。
- `scripts/deny_probe.sh` 的「Deny select → 断言文件未变」思路正确，CLI flag 与真实 omp v18.4.3 匹配。

## 问题

### Critical

**C1. `notify` / `setStatus` / `setWidget` / `setTitle` 被塞进 pendingRequests，渲染成不可关闭的空模态并永久阻塞审批 UI。**
- 位置：`src/hooks/useApproval.ts:70-81`、`src/components/ThreadWorkspace.tsx:16,32-37`、`src/components/approval/ApprovalModal.tsx:198-200,203-229`。
- 问题：`useApproval` 对**所有** method 都执行 `pendingRequests.set(id, ...)`；但只有 4 种交互型 method 设 30s 超时（`:76-81`），状态型 method 永不删除。`ThreadWorkspace` 取第一个 pending 渲染 `ApprovalModal`，而 `content()` 对状态型 method 返回 `null`，于是渲染出「只有 header、无内容、无按钮」的 dialog；`handleDeny` 的 switch 也没有这些 case，点遮罩/Esc 都不会调用 `onRespond`。
- 影响：一次 `notify`/`setTitle`（omp rpc-ui 的常规请求）之后弹出一个无法关闭的空模态；且该请求永远占据 Map 首位，后续真正的 select/confirm 审批全部被它挡在后面，审批链路整体死锁，只能刷新窗口。需确认 omp 实际发这些请求的频率（协议层面 `inbound.rs:84-97` 明确存在这些 method，代码路径确定）。
- 修复建议：状态型 method 不进入 `pendingRequests`（直接写 toast/status/widget/title 独立 state）；或在处理完立即 `delete(id)`；`ApprovalModal` 只接受 `select|confirm|input|editor`；补充 `default` 分支的兜底响应。

**C2. `send_prompt` / `abort` / `send_ui_response` 的 invoke 参数形状与后端结构体参数不匹配，全部调用会被拒。**
- 位置：`src/hooks/useComposer.ts:64,146`、`src/hooks/useApproval.ts:32-36`、`src/hooks/useTranscript.ts:366`；后端 `crates/omp-tauri/src/commands.rs:32-47,222-248,265-273`。
- 问题：Tauri 2 默认 `argument_case = camelCase`（本地 tauri-macros 2.7.4 `wrapper.rs:50` 已核对），命令签名为 `args: SendPromptArgs`，因此前端必须传 `{ args: { session_id, prompt } }`；现在传的是平铺 `{ session_id, prompt }`，缺必需键 `args`，invoke 直接 reject（无 `rename_all = "snake_case"` 属性可绕过嵌套要求）。
- 影响：发送、停止、审批回传全部失败。叠加 `useComposer.ts:61` 先清空输入、`useApproval.ts:23-27` 先删 pending → **用户输入丢失、审批请求永久悬空**（agent 侧只能等自身超时）。这是 composer/approval 的核心链路，任务 4/5 验收不可能通过。
- 修复建议：前端全部改为 `{ args: { ... } }`（字段保持 snake_case）；或移除结构体包装、把命令参数直接声明为 `session_id/prompt`；补一条单测断言 invoke 载荷形状。

**C3. 前端从未调用 `spawn_session`；sessionId 来自 mock 数据，omp 会话实际不存在。**
- 位置：`src/views/Layout.tsx:12`（初始 null）、`src/components/Sidebar.tsx:18-22,46-49`（MOCK_SESSIONS + 点击回传 mock id）、后端 `commands.rs:181-220`（`spawn_session` 已实现但无调用者）。
- 影响：`useComposer.sendPrompt` 在 sessionId=null 时静默 return（`useComposer.ts:58`）；即使点了 mock 会话，id 也是 `"1"/"2"/"3"`，所有后端 session 命令返回 `unknown session`。加上 C2，composer→omp 端到端链路完全不可用；审批事件流也没有可挂靠的真实会话。
- 修复建议：新增 session hook（spawn 时传 cwd/args，拿返回 id），`sessionId` 只能来自后端；在 `ThreadWorkspace`/`Layout` 之上统一持有；mock 列表在真实列表接入前不应驱动 sessionId。

**C4. 用户自己的 prompt 不会出现在 transcript。**
- 位置：`src/hooks/useComposer.ts:57-69`（直接 invoke，不触碰 transcript）；`src/hooks/useTranscript.ts:334-369` 的 `addUserMessage/sendPrompt` 无任何外部调用；`src/components/transcript/Transcript.tsx:19,46` 只消费 `state`。
- 影响：按 Enter 后输入框清空、transcript 里没有用户消息，只有后续 assistant 流；用户无法确认自己的发送内容，也无法从 UI 判断发送是否成功。属于 composer 核心体验缺失。
- 修复建议：把 `useTranscript` 提升到 `ThreadWorkspace` 并通过 context/store 共享，`Composer` 发送时先 `addUserMessage(prompt)` 再 invoke；或引入独立 transcript store。

### Important

**I1. `useApproval` 被实例化两次（Layout + ThreadWorkspace），存在两份 pending 与两个超时器，会在 30s 后回传过期 `cancelled`。**
- 位置：`src/views/Layout.tsx:13`、`src/components/ThreadWorkspace.tsx:14`；`src/hooks/useApproval.ts:70-81`；`Layout.tsx:18-28`。
- 问题：两个独立 listener 都会对同一 `omp:ui-request` 入队并各设 30s 定时器。用户通过 ThreadWorkspace 的模态回答后，Layout 实例仍在 30s 后对同一 id 调用 `send_ui_response(cancelled)`（host 侧重复 id 的处理需运行时确认）。另外 Layout 用自己那份 pending 驱动 editor dock，而 Save/Cancel 是空实现，dock 编辑器无法回传。
- 影响：协议层重复应答/竞态；editor 请求存在两套互斥 UI（模态 + dock），dock 侧不可用；两份 state 易分叉。
- 修复建议：审批状态提升为唯一 Provider/context（或 zustand store），只在 `ThreadWorkspace` 实例化一次；删除 `Layout` 的重复调用与 `Layout.tsx:39-41` 渲染期 `setDockTab`（React 反模式，且会让 editor tab 无法手动切走）。

**I2. `Esc = Deny` 在常见路径下失效。**
- 位置：`src/hooks/useShortcuts.ts:44-50,159-161,138-154`；`src/components/approval/ApprovalModal.tsx:52-60,66-86,89-116`。
- 问题：全局 keydown 在输入控件内直接 `return`（`:161`），所以 composer textarea 有焦点时 Esc 不会触发任何审批逻辑；`confirm` 分支靠全局 Esc 查找 `data-cancel` 按钮（`useShortcuts.ts:143-150`）才生效，而 `select` 分支既无 `data-cancel` 也无 close aria-label，全局 Esc 找不到可点按钮。`ApprovalModal` 自己的 `onKeyDown` 只对 dialog 内部焦点生效，`confirm/select` 打开时不移动焦点（没有 autoFocus），事件不会冒泡到 dialog。
- 影响：设计硬约束「`Esc`=Deny」（spec §3 审批流）在最常见的「焦点在 composer」场景不成立，用户只能鼠标点 Deny。
- 修复建议：审批打开时强制 focus 进 dialog（并做 focus trap），在 dialog 上监听 Escape；或全局 handler 对已打开的审批模态优先拦截（不因 typing target 跳过）；所有分支加 `data-cancel`。

**I3. 审批模态缺少焦点陷阱与完整 ARIA。**
- 位置：`src/components/approval/ApprovalModal.tsx:203-229`。
- 问题：只有 `role="dialog"`/`aria-modal="true"`，没有 `aria-labelledby`、没有打开时聚焦、没有 Tab 循环、背景未 `inert`/`aria-hidden`；`select/confirm` 无 autoFocus，焦点停留在触发按钮或 composer，键盘用户可 Tab 到遮罩之后的控件。
- 影响：键盘/屏幕阅读器可访问性不达标（spec 要求键盘可操作），也放大 I2 的 Esc 问题。
- 修复建议：mount 时聚焦 dialog（danger 按钮或第一个可操作项），trap Tab，关闭后 restore focus，补 `aria-labelledby`；背景内容 `inert`。

**I4. 连续的同类型输入请求会复用非受控 DOM，上一个答案残留。**
- 位置：`src/components/approval/ApprovalModal.tsx:122-132`（input）、`:162-173`（editor）。
- 问题：`ApprovalModal` 没有 `key={request.id}`，input/textarea 是非受控且无 `defaultValue`/value 同步；两个 input 请求依次到达时，同一 DOM 元素被复用，第二个请求会带着第一个请求的输入值，点 Save 就把旧值发给新请求。
- 影响：把上一次审批的答案（可能是路径/密钥类输入）错误提交给新请求，属数据完整性问题。
- 修复建议：`<ApprovalModal key={request.id} …/>` 或内容区加 key；改为受控 state 并在 request.id 变化时重置。

**I5. 输入/编辑器请求缺 IME 组字保护；editor 中 Enter 被当成「保存」，无法换行。**
- 位置：`src/hooks/useComposer.ts:71-79`；`src/components/approval/ApprovalModal.tsx:52-60,162-173`。
- 问题：Enter 判定没有 `e.nativeEvent.isComposing`/keyCode 229，中文输入法确认候选词时按 Enter 会直接发送 prompt / 直接保存审批输入；`ApprovalModal.tsx:56-59` 对 `editor` 也把 Enter 当保存并 `preventDefault`，编辑器文本框里无法输入换行。
- 影响：中文用户高频误发送；editor 审批多行文本不可编辑（内容被压成单行）。
- 修复建议：所有 Enter 逻辑先判 `isComposing`；editor 只在 `Ctrl/Cmd+Enter` 保存，普通 Enter 换行。

**I6. 模型选择器是死 UI：`available_models` 永不发射，选中值也从不参与 prompt。**
- 位置：`crates/omp-tauri/src/events.rs:45-47`（变体声明）、`commands.rs:89-178`（无映射）、`src/hooks/useComposer.ts:23-28,46-54`（只监听 window 自定义事件）、`:64,110-112`（modelId 只存本地）。
- 问题：后端 `FrontendEvent::AvailableModels` 没有构造点，协议侧也没有 `available_models` 解析（inbound.rs 只有 `available_commands_update`），前端 `useComposer` 的 `availableModels` 永远为空 → `ModelSelector` 永远 disabled；即使有数据，`modelId` 也从未随 `send_prompt` 或任何命令下发，切换无效果。
- 影响：计划 Task 4「模型选择器（available_models 推送驱动）」未达成；属于设计硬要求的偏离。
- 修复建议：在 Rust 侧从 omp 协议（或 model 列表命令的 response data）映射并 emit；M2 若只做展示，需明确标注并在 M4 接上切换命令。

**I7. 排队态 "Queued (n)" 未实现，运行中无法输入。**
- 位置：`src/components/composer/Composer.tsx:92`（`disabled={state.isRunning}`）、`:104-111` 无 Queue 渲染；`src/hooks/useComposer.ts` 无队列数据；`src/i18n/en.json` 的 `composer.queue` key 无引用。
- 问题：计划 Task 4 要求 stdin bounded channel 满时显示 "Queued (n)"（`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md:165`）；当前运行中 textarea 直接 disabled，无法编辑/排队，Enter 也不会入队。
- 影响：与设计 §3 Composer 的排队态不符；运行中用户完全无法准备下一条消息。
- 修复建议：运行中允许输入与提交，前端维护队列计数并在 Composer 展示 `Queued (n)`（后端 bounded channel 满的信号可从 `send_prompt` 的 response/错误映射）；至少在 M2 提供本地队列。

**I8. Stop 语义会直接销毁会话，UI 未重建 session，下一次发送静默失败。**
- 位置：`src/hooks/useComposer.ts:143-151`；后端 `crates/omp-tauri/src/commands.rs:265-273`（`abort` = `close_session`）、`:250-263`（remove handle，drop 时 kill 子进程）。
- 问题：点击 Stop 只是把 `isRunning` 置 false，但后端已删除 session、杀死子进程；composer 重新可用后再次发送必然是 `unknown session`（且 C2 下连错误都到不了后端）。
- 影响：Stop 之后 composer 变成「能输入但永远发不出去」的僵尸状态，用户无任何提示。
- 修复建议：`abort` 后由前端重建 session（重新 spawn 并更新 sessionId），或在 UI 上明确显示「会话已结束」并禁用 composer；错误统一 toast。

**I9. 审批超时/取消不完整：30s 不可配、会话结束不取消、取消载荷形状未对齐协议、respond 先删后调。**
- 位置：`src/hooks/useApproval.ts:76-81`（硬编码 30000）、`:58-115`（无 session 生命周期监听）、`:35`（`response: {cancelled: true}`）、`:23-37`（先 delete pending 再 await invoke）；协议侧 `crates/omp-protocol/src/inbound.rs:148-150`、`crates/omp-host/src/session.rs:83`（host 把 value 原样放进 `extension_ui_response.value`）。
- 问题：任务要求「默认 30s，可配」「会话结束/超时回 cancelled」；当前超时不可配、`session_settled`/`abort`/`close_session` 都不取消挂起审批；取消时把 `{cancelled:true}` 作为 `value` 下发，与 `select` 期望的选项字符串 / `confirm` 期望的布尔语义不一致（omp 对这个 value 的解释需运行时确认）；invoke 失败时请求已被删除，永远不会重试。
- 影响：agent 可能被一个它不认识的 value 卡住或按错误语义继续；窗口关闭/会话结束后模态残留；invoke 一失败审批就永久丢失。
- 修复建议：timeout 做成参数/常量可配并监听 `omp:session-settled` 清理全部 pending；取消值按 method 发协议认可值（select→"Deny"/confirm→false）；先 await invoke 成功再删除 pending（或失败回滚并 toast）。

**I10. 快捷键矩阵与设计 §6 不符（⌘K/⌘1–9/⌘⌥A/⌃⇧M）。**
- 位置：`src/hooks/useShortcuts.ts:61-69`（⌘K 只是 focus composer）、`:70-111`（⌘1–7 映射 7 个 rail 视图）、`:112-118`（⌘⌥A 切 agents）、`:119-125`（⌃⇧M 切 sessions）。
- 问题：设计 §6（`specs/...:98`）要求：⌘K 命令面板、⌘1–9 跳 thread、⌘⌥A 下一个待审批、⌃⇧M 模型选择器；仓库中也没有任何 command palette 组件（`grep -rni palette src` 无匹配）。
- 影响：Task 7「快捷键」验收不成立；M2 的 4 个组合键行为与规格完全不同层。
- 修复建议：按 spec 重绑；命令面板与 thread 跳转依赖后续数据源，可先留清晰 TODO/disable，但不要用错误动作替代（当前会误导 QA）。

**I11. 布局状态多实例 + 快捷键重复注册，导致状态回退/写入竞争。**
- 位置：`src/hooks/useLayoutState.ts:61-75`（每个实例都注册 ⌘B/⌘\ 的 window keydown）、`useLayoutState()` 的调用点：`Layout.tsx:11`、`RightDock.tsx:33`、`Rail.tsx:27`、`Sidebar.tsx:26`、`useShortcuts.ts:53` 共 5 个实例。
- 问题：5 个实例各持一份 `LayoutState` 副本且各自写 store。典型场景：Rail 切到 worktrees（Rail 实例写 store）后按 ⌘B，Layout 实例以自己旧的 `state` 回写 `{ ...旧state, sidebarCollapsed: !... }`，把 `railView` 回退到 sessions；`useShortcuts` 的 ⌘B/⌘\ 与 `useLayoutState` 自身的 handler 又各执行一次。
- 影响：⌘B/⌘\ 行为不确定、其他 pane 状态被旧快照覆盖（具体可见症状需运行时确认）。跨 Task 2/7 边界，但直接决定快捷键正确性。
- 修复建议：layout state 提升为单例（context + useSyncExternalStore 或 zustand），快捷键只在一处注册；删除 `useLayoutState` 内的 keydown 处理。

**I12. E2E 无法变绿，且即使能跑也不构成真实覆盖。**
- 位置：`package.json:12`、`scripts/e2e_smoke.spec.ts:6-41,54,65-153`、`playwright.config.ts:10-15,39-45`。
- 问题分项：
  1. **文件不存在**：`npm run e2e` 指向 `scripts/e2e_smoke.ts`，磁盘上只有 `scripts/e2e_smoke.spec.ts` → Playwright 直接判「No tests found」。（`playwright.config.ts:4` 的 `testDir: './scripts'` + 默认 testMatch 本来能匹配 `.spec.ts`，是 script 显式路径把路走死。）
  2. **无法触达 Tauri IPC**：测试用普通 Chromium 打开 Vite 页面（`:54`），没有注入 `window.__TAURI_INTERNALS__`；`invoke/listen` 不可用，`useTranscript` 的 `omp://event` 监听只在 sessionId 非空时创建（`useTranscript.ts:311-332`），而前端从不 spawn session（C3）——`startOmpProcess()` 起的 omp 子进程与网页之间没有任何桥（`:6-41`）。「发 prompt → 断言 assistant」的流程永远等不到事件。
  3. **选择器/断言失真**：`[data-testid="sidebar"]` 不存在（全仓无 data-testid），`sidebar.isVisible()` 为 false → `:101-110` 的宽度断言整段被跳过；`.animate-spin` 用 `toBeHidden`（Playwright 对「节点不存在」也判通过）→ `:85` 恒真；theme 测试自己写 `document.documentElement.dataset.theme` 再断言等于自己写的值（`:115-143`）→ 恒真；language 测试查 `window.i18n`/`[data-i18n]`（`:145-153`），代码中两者都不存在 → 恒假；`Escape` 失焦断言与 `useShortcuts.ts:159-161` 的输入域 return 冲突 → 恒假。
- 影响：Task 7 验收命令之一 `npm run e2e` 不可执行；修复路径后测试仍为「假绿/假红」，无法验证 M2 的协议链路。
- 修复建议：文件改名并同步 `package.json`/计划；E2E 改走 Tauri WebDriver（tauri-driver）或浏览器内注入 fake IPC mock；断言改为可观测的业务行为（发送后用户消息出现、assistant 文本增长、审批按钮点击后请求消失），删除恒真断言。

**I13. `playwright.config.ts` 顶层 `use` 键重复，配置被静默覆盖。**
- 位置：`playwright.config.ts:10-15` 与 `:39-45`。
- 问题：对象字面量重复键，后者覆盖前者，`baseURL/trace/screenshot/video` 全部丢失，且不会报错（该文件不在 tsconfig include 内，tsc 也不检查）。
- 影响：失败无 trace/截图，排查成本上升；`baseURL` 失效依赖测试里硬编码 URL。
- 修复建议：合并为单个 `use`，把 chromium executablePath 放进 projects。

**I14. `scripts/deny_probe.sh` 不是可判定的自动断言，且只处理 select。**
- 位置：`scripts/deny_probe.sh:23-42`（只匹配 `"method":"select"`）、`:49-60`（只打印，无退出码断言）、`package.json:12`（gate 只跑 Playwright）。
- 问题：脚本核心安全断言是人工看 `target.txt` 是否仍为 ORIGINAL，没有 `if/grep -q ORIGINAL` 的失败退出；若工具被执行脚本仍返回 0。若 omp 发的是 confirm/input/editor 类请求，脚本不会应答，只会空转 180s；依赖 `jq/mkfifo/tail -f` 未声明；未被 npm scripts/CI 调用。
- 影响：作为「Deny 后文件未变」的安全验证不可信（假绿），M3 审批验证容易踩空。
- 修复建议：加显式断言与 exit 1/timeout；覆盖所有 method 或收到未知 method 时也回 Deny；补依赖检查；接入 CI 或明确标注「人工脚本」。

**I15. 计划 Task 5 文件缺失、editor 职责错位。**
- 位置：计划 `docs/superpowers/plans/2026-11-01-m2-agent-tasks.md:184-198`；实际 `src/components/approval/` 只有 `ApprovalModal/StatusBar/Toast`（无 `InputModal.tsx`、`EditorTab.tsx`）；editor 实现散在 `ApprovalModal.tsx:157-196` 与 `DockTabs.tsx:39-67`；`Layout.tsx:18-28` 的 dock 保存/取消是空实现。
- 问题：input 内联进 ApprovalModal 尚可接受；但 editor 同时以模态 + dock tab 出现，dock 的 Save/Cancel 无回传，`editorValue` 只作 `defaultValue` 且 `onEditorChange` 是空实现，dock 编辑器无法提交/同步。
- 影响：spec「`editor` → dock 全屏文本 tab，保存/取消回传」未达成；editor 实际只能通过模态回答（按钮可用），dock 是死 UI。
- 修复建议：按计划拆出 `EditorTab.tsx`，把 editor 请求路由到 dock 并接通 `onEditorChange/Save/Cancel`（回传走 I1 统一后的 respond）；ApprovalModal 不再渲染 editor。

**I16. 前端单测缺口：composer/approval/shortcuts 零测试。**
- 位置：`src/hooks/` 仅 `useTheme.test.ts`；`package.json:11`。
- 问题：本轮新增的 Enter/IME、时间/取消、双实例去重、快捷键组合等逻辑没有任何自动化测试；`npm test` 只覆盖主题（任务说明亦确认 2 个 theme 测试）。Task 7 的「前端单测全绿」名不副实。
- 修复建议：为 `useComposer`（Enter/Shift+Enter/IME/参数形状）、`useApproval`（入队范围/超时/去重/取消载荷）、`useShortcuts`（组合键匹配/typing 域/重复注册）补 hook 测试。

**I17. 发送失败/无会话时无任何用户可见反馈。**
- 位置：`src/hooks/useComposer.ts:57-69`（无 sessionId 静默 return；catch 只 `console.error`）。
- 影响：用户按 Enter 后毫无反应，无法区分「没发出去」与「agent 没回」；叠加 C2/C3 时尤其致命。
- 修复建议：接入 `addToast('error', ...)` 并把失败时清空的输入恢复。

**I18. `select` 的协议值被 i18n 翻译。**
- 位置：`src/components/approval/ApprovalModal.tsx:65,70-83,102`。
- 问题：当请求没有 `options` 时，回退用 `t('approval.approve')`/`t('approval.deny')` 作为按钮文案**同时**作为回传 value；中文环境下会把「批准/拒绝」发给 omp。
- 影响：协议值必须是 omp 可识别的固定值（如 `"Approve"`/`"Deny"` 或 options 原值），本地化文案会破坏审批语义（需运行时确认 omp 是否会发无 options 的 select）。
- 修复建议：回退 value 用固定协议常量，仅显示层用 `t()`。

### Minor

1. **title 重复渲染**：`ApprovalModal.tsx:68`（select 正文）与 `:92`（confirm 正文）重复显示 header（`:222`）已展示的 title。
2. **遮罩点击即 Deny**：`ApprovalModal.tsx:206` 整个遮罩 `onClick={handleDeny}`，误点空白就拒绝请求，建议仅显式按钮/Esc。
3. **`--warning` token 缺失**：`Toast.tsx:50` 使用 `var(--warning)`，`src/tokens.css` 只定义 `--warning-muted`，warning toast 边框/文字颜色失效。
4. **textarea 不自动增高**：`Composer.tsx:93-101` 固定 `min-h-[44px]`/`rows=1`/`resize-none`，多行输入只能内部滚动，与「多行 textarea」体验不符。
5. **附件处理粗糙**：`useComposer.ts:114-134` 的 `path: file.name` 并非真实路径，prompt 里只追加 `@name`；`removeAttachment`（`:136-141`）不移除文本里的 `@name`；无大小/数量限制；每次点击新建 file input 且不清理。
6. **slash 菜单体验**：`handleBlur` 100ms 延迟关闭（`Composer.tsx:49-53`）偶发点击落空；`useComposer.ts:153-159` 与 `SlashMenu.tsx:19-23` 双重过滤；`selectSlashCommand` 用 `/\/\w*$/` 替换全文末尾（`:99-108`）在多词场景可能替换错位置；`handleSlashInput` 返回但从未使用（死代码）。
7. **无输入历史**（↑/↓ 召回）：Composer 无相关实现（spec 未强制，M4 可补）。
8. **toast 定时器未清理**：`useApproval.ts:49-51` 的 `setTimeout` 在卸载时未清除；status/widget 无 TTL/清除机制。
9. **类型与协议不一致**：`types/approval.ts:10-14` 的 `ApprovalResponse.cancelled` 从未被发送/使用；实际下发的是 `value = {cancelled:true}`（见 I9）。
10. **状态条位置与标题同步**：`ThreadWorkspace.tsx:30-31` 把 StatusBar 放在 Composer 之上，spec 要求 composer 下方；`setTitle` 只显示在状态条（`StatusBar.tsx:28-35`），未同步窗口标题（spec §2「`setTitle` 协议事件同步 thread 标题」）。
11. **全局 id 查询脆弱**：`ApprovalModal.tsx:25,30` 用 `document.querySelector('#approval-input'/'#approval-editor')` 取值，双实例/多模态时可能取错节点；建议用 ref 或受控 state。
12. **M3 预埋缺失**：M3 计划（`docs/superpowers/plans/2026-11-07-m3-agent-tasks.md:44`）要求审批打开时 Composer disabled，当前 Composer 不感知 pending approval（M2 不强制，但建议尽早接入统一审批 state）。

## 与 M2 计划/设计的偏差

| 任务 | 计划/设计要求 | 实际 | 判定 |
|---|---|---|---|
| Task 4 | Enter 发送 / Shift+Enter 换行（plan:161） | 成立，但缺 IME 保护（I5） | 部分达成 |
| Task 4 | 附件写进 prompt 文本（plan:162） | 仅 `@文件名`，无真实路径（Minor 5） | 部分达成 |
| Task 4 | 模型选择器来自 `available_models`，无硬编码（plan:163） | 无硬编码，但事件永不发射、选择不下发（I6） | 未达成 |
| Task 4 | Slash 补全来自 `available_commands_update`，选择回填（plan:164） | 数据源已接，但菜单抢焦点导致无法继续过滤（Minor 6） | 部分达成 |
| Task 4 | 排队态 "Queued (n)"（plan:165、spec §3） | 未实现，运行中 textarea disabled（I7） | 未达成 |
| Task 4 | 运行中 Enter 位变 Stop（plan:166、spec §3） | 成立，但 Stop 未实现 cancel、会销毁会话（I8） | 部分达成 |
| Task 5 | select/confirm 居中模态、标题等宽高亮、Approve/Deny、无「全部允许」、Esc=Deny（plan:193-194、spec §3） | 无「全部允许」✓；标题等宽✓；Esc=Deny 不可靠（I2）；select 渲染全部选项而非 Approve/Deny 两钮 | 部分达成 |
| Task 5 | input 单行弹窗（plan:195） | 内联在 ApprovalModal 可接受，但缺 `InputModal.tsx`，状态串台（I4） | 部分达成 |
| Task 5 | editor → dock 全屏文本 tab，保存/取消回传（plan:196、spec §3） | 缺 `EditorTab.tsx`；editor 以模态为主，dock 保存/取消为空实现（I15） | 未达成 |
| Task 5 | notify toast 5s（plan:197） | 成立（useApproval:44-52） | 达成 |
| Task 5 | setStatus/setWidget/setTitle → composer 下方状态条（plan:198） | 渲染成立，但状态型请求污染 pending 导致空模态死锁（C1）；位置在 composer 上方 | 部分达成 |
| Task 5 | 每请求绑定 id；会话结束/超时（默认 30s，可配）回 cancelled（plan:199） | id 绑定✓；超时硬编码、会话结束不清理、取消值形状不符（I9） | 部分达成 |
| Task 7 | 快捷键 ⌘K/⌘1–9/⌘⌥A/⌃⇧M/⌘\ /⌘B/Esc（plan:261、spec §6） | ⌘\ /⌘B 存在但多实例重复；其余 4 项动作错误（I10/I11） | 未达成 |
| Task 7 | E2E：`scripts/e2e_smoke.ts` 跑通 Ready→…→SessionSettled（plan:255,263） | 文件名为 `.spec.ts` 且 script 指向不存在的 `.ts`；浏览器无 IPC；断言恒真/恒假（I12） | 未达成 |
| Task 7 | DOM keydown、不用 global-shortcut（spec §6） | 符合（useShortcuts 用 window keydown） | 达成 |

## 结论

**FAIL**

理由：

1. 存在 4 个 Critical：审批状态型请求造成空模态死锁（C1）、session 类命令 IPC 载荷形状错误导致发送/审批回传全部被拒（C2）、前端从未 spawn 会话且 sessionId 来自 mock（C3）、用户 prompt 不进入 transcript（C4）——composer 与审批两条主链路都无法端到端工作。
2. Task 7 的验收命令 `npm run e2e` 因文件名/路径不一致直接不可运行；即使修复，当前 spec 用普通 Chromium 无法触达 Tauri IPC，且多条断言恒真，不能作为验收依据。
3. Task 5 的 `editor` dock 路径、超时可配/会话结束取消、`Esc=Deny` 硬约束、Task 4 的排队态与模型选择器均未按要求交付。
4. 修复建议优先级：C2 → C3 → C1 → C4 → I1/I2 → I12/I8 → I6/I7/I10 → 其余 Important/Minor。C2/C3 属于「一行级接线」，修复后需重新执行 Task 4/5/7 验收与 `npm run e2e`（改名后）。
