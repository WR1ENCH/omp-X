# M2 Task 3 审查：Transcript 流式渲染 + 虚拟滚动

- 审查对象：M2 base `e39f845`，Task 3 提交 `c90759a`，以及工作区未提交改动（Tasks 4–7）
- 审查方式：只读静态审查（未修改任何源码；未执行 build/lint/test，门禁归 verifier）
- 审查日期：2026-11-07

## 审查范围

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/hooks/useTranscript.ts` | 408 | 事件订阅、流式 buffer、消息状态机 |
| `src/hooks/useVirtualScroll.ts` | 124 | `@tanstack/react-virtual` 封装 |
| `src/components/transcript/Transcript.tsx` | 89 | 容器、行渲染、锚定 effect |
| `src/components/transcript/MessageBlock.tsx` | 81 | markdown 渲染 |
| `src/components/transcript/ThinkingBlock.tsx` | 37 | thinking 折叠块 |
| `src/components/transcript/ToolCard.tsx` | 98 | 工具卡片 |
| `src/components/transcript/SystemEventLine.tsx` | 64 | system 事件行 |
| `src/types/transcript.ts` | 100 | 块/消息类型与高度估算 |
| 集成 | — | `src/components/ThreadWorkspace.tsx`、`src/views/Layout.tsx`、`src/hooks/useComposer.ts`、`src/components/Sidebar.tsx` |
| 契约 | — | `crates/omp-tauri/src/events.rs`、`crates/omp-tauri/src/commands.rs`、`crates/omp-host/src/session.rs` |

对照文档：`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md`（Task 3，L114-142）、`docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md`（§3 Transcript、§7，L55-67/L100-107）。

## 验证证据

1. **代码静态审查**：逐文件 `read`/`nl -ba` 精读上述文件，行号即工作区当前内容。
2. **前后端契约对照**：
   - `events.rs:13-67` 的 `FrontendEvent` 变体 ⊆ `useTranscript.ts:11-48` 的 TS union 之外没有 `tool_execution_*`；TS 侧多出的 `tool_execution_start/end`（`useTranscript.ts:26-27`）在 Rust 侧不存在。
   - `commands.rs:89-178` `map_host_event` 把 `ToolExecutionStart/End` 映射为 `Noise`（L148-161），`AvailableModels` 变体只在 `events.rs:45` 声明、全仓无 emit 点。
   - `commands.rs:222-234` 的 `send_prompt(state, args: SendPromptArgs)`：用 `tauri-macros 2.7.4`（`wrapper.rs:480-520`，参数名转 lowerCamelCase 作为 IPC key）与 `tauri 2.12.5`（`src/ipc/command.rs:110-118`，"command ... missing required key ..."）核对，JS 必须传 `{ args: { session_id, prompt } }`；`useTranscript.ts:366`、`useComposer.ts:64` 均传 `{ session_id, prompt }`，必失败（`send_ui_response`/`abort`/`worktree_*`/`pty_spawn` 同模式）。
3. **依赖与第三方源码核对**：
   - `react@18.3.1`、`@tanstack/react-virtual@3.14.26`、`@tanstack/virtual-core@3.19.11`、`markdown-it@14.3.3`。
   - `virtual-core/dist/esm/index.js:725-757` 的 `getMeasurementOptions` 依赖不含 `estimateSize`；`:759-770` 的 `getMeasurements` 只依赖 measurementOptions + `itemSizeCacheVersion`；`itemSizeCache` 仅在 `resizeItem`（`:1027-1088`）写入。即自管测量不会使虚拟器重算。
   - `virtual-core` 已内置 `resizeItem` 后的滚动补偿（`applyScrollAdjustment`，`:1030-1095`），但本实现没有走该路径。
4. **实现物核查**：`grep requestAnimationFrame src/` 无结果（rAF 未实现）；`grep spawn_session src/` 仅 `lib.rs:28` 注册、前端无调用；`scripts/` 无 `transcript_smoke.ts`（只有 `e2e_smoke.spec.ts`/`capture_fixtures.sh`/`deny_probe.sh`/`test-setup.sh`）；`fixtures/` 只有后端用 `clean_round.jsonl`（无 5000 消息 fixture）；`npm test` 仅 `src/hooks/useTheme.test.ts`；`package.json:12` 的 `e2e` 指向不存在的 `scripts/e2e_smoke.ts`；`test-results/.last-run.json` 显示最近 Playwright 4 个用例失败（失败原因是浏览器未安装，非应用逻辑，不能作为行为证据）。
5. **运行时待确认项**（已在问题条目标注 `需运行时确认`）：DOM 层最终视觉/滚动症状、Layout 容器高度、Tauri 外链导航策略、React 19 升级后的 updater 双调用。

## 优点

1. **markdown XSS 面控制正确**：`MessageBlock.tsx:27-36` 显式 `html:false`；markdown-it 14.3.3 默认 `validateLink` 拒绝 `javascript:`/`vbscript:`/`file:`/`data:`（图片 `data:image` 例外），模型/工具输出经 `dangerouslySetInnerHTML`（`MessageBlock.tsx:66`）不会执行脚本。这是本次审查中唯一明确的 XSS 相关项，结论为**未发现 XSS**。
2. **吸附迟滞符合设计**：`useVirtualScroll.ts:96-107` 以 `scrollHeight - scrollTop - clientHeight < 24` 判定，手动上滚立即 `onScrollAway`，24px 内重新吸附，与设计 §3 "回底部 24px 内重新吸附"一致。
3. **文本/thinking 双通道分离**：`streamingBufferRef`（`useTranscript.ts:60`）按 `kind` 分流（L100-118），`flushStreamingBuffer` 按块类型分别追加（L85-93），结构上符合设计"thinking 与正文分离"。
4. **消息顺序与 id 稳定**：append-only、`message_start` 用后端 `message_id`（`useTranscript.ts:150`），块 id 用 UUID 稳定用于 React key（`Transcript.tsx:44,53-61`）；`pendingToolCalls` 用 `new Map(prev)` 不可变更新（L230,248-249）。
5. **组件职责清晰**：五种块类型各有独立渲染器，`types/transcript.ts` 有完整块模型与估算函数，`md-body` 样式落在 token 层（`tokens.css:341-400`），无 `@tailwindcss/typography` 硬依赖。
6. **虚拟器基础参数到位**：`count/estimateSize/overscan(5)/gap(8)/paddingStart/End`（`useVirtualScroll.ts:44-54`）与已安装的 react-virtual 3.14.26 API 兼容，`scrollToOffset(offset, {align})` 用法正确（`virtual-core` `:1282`）。

## 问题

### Critical

#### C1. 流式 flush 被逐 delta 重置的 16ms 计时器饿死；rAF 未实现
- 位置：`src/hooks/useTranscript.ts:49`、`:100-118`、`:176-180`；设计对照 `docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md:102`
- 问题：`appendStreamingChunk` 每收到一个 delta 就 `clearTimeout` 再 `setTimeout(..., 16)`（L109-115），是 debounce 而非 throttle/rAF；后端每 token 发一个 `MessageDelta`（`commands.rs:114-128` 逐事件 emit，无合并）。连续流中相邻 delta 间隔小于 16ms 时计时器永远被重置，缓冲内容一直不 flush。
- 影响：设计 §7 明确以 500 tok/s（2ms/事件）录制流回放为验收输入（design L107），该速率下整个生成过程 UI 不更新，直到 `message_end` 才一次性出现全文（L182-186）；低速率下也退化为尾沿 debounce，帧率不稳。同时设计要求的"前端 rAF 每帧 drain 一次"完全没有实现（`grep requestAnimationFrame src/` 无结果）。
- 修复建议：改为"首个 delta 后 `requestAnimationFrame` 调度一次 drain，drain 时取走整个 buffer"（或 rAF + 16ms 上限的节流），不要在每 chunk 上重置计时器；后台 tab 一并处理 rAF 暂停。

#### C2. 虚拟行坐标双重偏移：普通流布局上再叠加 `translateY(start)`
- 位置：`src/components/transcript/Transcript.tsx:43-47`、`:83-86`
- 问题：内层 `position:absolute` 包裹层（L84）中的行是**普通块级流布局**（`className={cn('w-full', ...)}`，无 `position:absolute`），却又用 `style={{ transform: translateY(start) }}`（L47）。行的最终 y = 前序兄弟行实际高度之和 + virtualizer 的绝对 `start`，即 `start` 被叠加了两次（第二次来自正常流位置）。
- 影响：第 2 行起出现"前一行高度"的额外间距，且逐行累加；行位置与 virtualizer 认定的窗口完全错位，滚动时行漂移/重叠/空白，虚拟滚动核心不可用。该行 `transform` 是工作区未提交改动（`git diff` 可见），提交版 `c90759a` 则完全按流式堆叠，同样不满足虚拟定位。
- 修复建议：行元素改为绝对定位 `position:absolute; top:0; left:0; right:0; transform: translateY(start)`（或用 `top`），父层保持 `position:relative`；同时给行加 `data-index` 供 `virtualizer.measureElement` 使用（见 C3）。

#### C3. 变高测量从未回填 virtualizer，滚动位置全按估算
- 位置：`src/hooks/useVirtualScroll.ts:30-42`、`:44-54`、`:84-94`；`src/components/transcript/Transcript.tsx:45`；`node_modules/@tanstack/virtual-core/dist/esm/index.js:725-770,1027-1088`
- 问题：`measureElement` 把真实高度写进自管 `Map<string, number>` state（L84-94），既没有调用 `virtualizer.measureElement`，也没有 `data-index`/`ref={virtualizer.measureElement}`；`estimateSize` 不在 `getMeasurementOptions` 依赖里，`itemSizeCacheVersion` 也不会因自管 Map 改变而递增（只有 `resizeItem` 会），因此 virtualizer 的 `getMeasurements()` 结果被 memo 住，测量值不会反映到 `start/size`。自管 Map 只影响 hook 自己的 `totalHeight`（L66-70）与下次 count 变化时的估算。
- 影响：所有行位置基于 `estimateMessageHeight`（`types/transcript.ts:90-101`，assistant 固定 120px，与实际高度无关）；5000 消息/长文本下滚动位置、窗口范围与真实 DOM 高度严重不符，滚动条长度跳变、到底不达、回滚位置漂移。设计 §7 要求的"变高估算 + **回填** + 插入锚定补偿"（design L103）只做了估算。
- 修复建议：删除自管高度 Map，直接 `ref={virtualizer.measureElement}` + `data-index`；`estimateSize` 只作估算；利用 virtual-core 内置 `resizeItem` 的滚动补偿（`applyScrollAdjustment`）实现"插入/高度变化锚定"。

#### C4. Prompt → 用户消息 → 流式链路断裂（三处独立断点）
- 位置：`src/hooks/useTranscript.ts:334-359`、`:361-369`、`:366`；`src/hooks/useComposer.ts:57-69`；`crates/omp-tauri/src/commands.rs:222-234`；`src/views/Layout.tsx:12`、`src/components/Sidebar.tsx:18-31`
- 问题：
  1. `useTranscript.addUserMessage`/`sendPrompt`（L334-369）没有任何消费者：`Transcript.tsx:19` 只解构 `state`/`setAnchorToBottom`，Composer 走 `useComposer.sendPrompt`（`useComposer.ts:57-69`）且从不向 transcript 追加 user block → 用户自己发的 prompt 永不出现在 transcript。
  2. `invoke('send_prompt', { session_id, prompt })`（`useTranscript.ts:366`、`useComposer.ts:64`）与 Rust 命令 `args: SendPromptArgs`（`commands.rs:222-226`）不匹配，Tauri 需要 `{ args: { ... } }`，调用必被拒（"missing required key args"）→ 前端 catch 后只 `console.error`（`useComposer.ts:65-67`）。
  3. 前端从未调用 `spawn_session`（`grep spawn_session src/` 仅 `lib.rs:28` 注册），`Layout.tsx:12` 的 `sessionId` 只能来自 `Sidebar.tsx:18-31` 的 mock id（`'1'/'2'/'3'`，与后端 `sess-*` 不同），即使修好 1/2 也 `unknown session`。
- 影响：端到端最小闭环（发 prompt → user 块 → assistant 流式 → settled）完全不成立；`useTranscript` 的 prompt 发送实现是死代码。
- 修复建议：由 Layout/线程层统一持有会话生命周期（spawn 后把真实 sessionId 下传）；prompt 发送后在同一状态源追加 user 块（或事件回显 user message_start）；修正 invoke 参数形状（`{ args: { session_id, prompt } }`，审批/终端/worktree 命令同样需要扫一遍）。

### Important

#### I1. ToolCard / `tool_execution_*` 全链路缺失，工具卡片是死代码
- 位置：`useTranscript.ts:211-260`（不可达 case）、`Transcript.tsx:57-59`、`ToolCard.tsx:50-98`、`events.rs:13-67`、`commands.rs:148-161`；计划 `2026-11-01-m2-agent-tasks.md:116,134`
- 问题：Rust `FrontendEvent` 无 `ToolExecution*` 变体，`map_host_event` 把 `ToolExecutionStart/End` 降级成 `Noise`（只有 `"tool start: name"` 文本）；因此 `useTranscript` 的 `tool_execution_start/end` 分支、`ToolCard`、`pendingToolCalls` 永远不会被驱动。
- 影响：计划 Task 3 要求的 tool-card 块类型（含运行中/成功/失败状态、参数 JSON、输出前 10KB）实际不存在；工具调用在 UI 上完全不可见。
- 修复建议：`events.rs` 增加 `ToolExecutionStart/End` 变体（含 `toolCallId/name/args/output/success`），`map_host_event` 直接映射；前端保留现有分支即可。

#### I2. 事件路由契约缺口：delta 无 `message_id`、所有事件无 `session_id`、`message_end` 不校验 id
- 位置：`events.rs:15-67`（无 session 字段）、`:28-31`（`MessageDelta` 仅 kind/delta）、`:72-77`（全局 `app.emit`）、`useTranscript.ts:176-180`、`:182-197`、`:315`
- 问题：delta 只能投递给"当前流式消息"（`flushStreamingBuffer` 用 `prev.currentStreamingMessageId`，L70-71）；后端拿到的 `message_id` 在 delta 阶段被丢弃（`commands.rs:114-128` 不转发）；`message_end` 也不比对 `event.message_id`，直接把**所有**消息的所有 assistant block 置 `streaming:false`（L189-191）。所有事件走单全局广播，前端 listener 不按 session 过滤。
- 影响：并行/交错消息（工具调用之间、多轮快速切换）会把 delta 写错消息或提前终止流；多会话（未来多线程/多窗口）互相串台；`message_end` 的全局副作用会破坏其他活跃消息。
- 修复建议：`MessageDelta` 增加 `message_id`（后端保留），前端按 id 定位；事件统一带 `session_id` 并在 listener 侧过滤；`message_end` 只收尾目标 id；`message_start` 若已有 current id，先收尾/入队。

#### I3. `sessionId` 切换不重置 transcript 状态
- 位置：`useTranscript.ts:51-58`、`:310-332`
- 问题：`useState` 初始 messages 只在挂载时创建；`sessionId` 变化只重建 listener（effect），既不清空 `messages`，也不清 `currentStreamingMessageId`/`streamingBufferRef`/`pendingToolCalls`。
- 影响：切线程后看到上一个会话的完整 transcript 并继续混入新会话事件；旧流式 buffer 会被 flush 进新会话消息；id/状态污染。
- 修复建议：`sessionId` 变化时 `setState(initial)` 并清空 buffer/计时器/pendingToolCalls（sessionId 放 key 上重挂亦可）。

#### I4. 异步 `listen` 与 cleanup 竞态，StrictMode/快速切换泄漏监听器
- 位置：`useTranscript.ts:310-332`
- 问题：`setup()` 内 `await listen(...)` 后再赋值 `unlistenRef.current`（L314-319）；cleanup（L323-331）只移除当时 ref 里的函数。若卸载发生在 `listen` resolve 之前，listener 随后注册却无人移除；StrictMode 双挂载下两次 setup 的 resolve 顺序不定，ref 只能保留一个，另一个永久泄漏（其闭包 `mounted=false` 会忽略事件，不会重复渲染，但监听器与闭包状态泄漏）。快速切会话会累积泄漏。
- 影响：dev StrictMode 及频繁切换会话时内存/监听器泄漏；极端情况下 cleanup 移错一个 listener。
- 修复建议：`const unlisten = await listen(...); if (!mounted) { unlisten(); return } unlistenRef.current = unlisten`，并给 `setup()` 加 `.catch`。

#### I5. 流式期每帧全量重跑 markdown，违反"`message_end` 后一次性渲染"
- 位置：`MessageBlock.tsx:38-43`、`:66`；`useTranscript.ts:68-98`；设计 §3（design L58）
- 问题：`MessageBlock` 对 `assistant`/`user` block 无条件 `md.render(block.content)`（L38-43），没有 `block.streaming` 分支；每次 flush 都重新解析全文并整体替换 `innerHTML`。
- 影响：长回答的解析/DOM 成本随内容长度×帧数增长（O(总长度²) 量级），500 tok/s 下直接卡顿；与设计"流式期纯文本、`message_end` 后一次性渲染"相悖；也扩大了 `dangerouslySetInnerHTML` 的高频替换面。
- 修复建议：`block.streaming` 时渲染 `<pre className="whitespace-pre-wrap">{content}</pre>`，`streaming:false` 后再 `md.render`；对 `MessageBlock` 加 `React.memo` 并把 markdown 实例提到模块级单例。

#### I6. 滚动跟随依赖不稳定回调，且无测量/插入锚定
- 位置：`Transcript.tsx:23-27`、`:32-36`；`useVirtualScroll.ts:79-82`、`:96-114`
- 问题：`onScrollToBottom`/`onScrollAway` 是每次渲染新建的内联箭头（`Transcript.tsx:25-26`）→ `scrollToBottom`/`handleScroll` 每次渲染换引用 → 锚定 effect 依赖 `scrollToBottom` 后**每次渲染都执行**，`anchorToBottom=true` 时每帧写一次 `scrollToOffset`。反向问题：真正的内容增长不改变 `messages.length`，若后续把依赖稳定化，流式新 token 将不再跟随。当前 dispatch 无插入/高度变化锚定补偿（见 C3）。
- 影响：当前"跟随"是靠不稳定的依赖巧合维持；每渲染一次程序化滚动会与用户滚动竞争，流式长回答时滚动抖动；滚动回看时高度变化导致视口漂移。
- 修复建议：把 scroll 回调 `useCallback` 稳定化；跟随用"流式时内容变化"信号（如 streaming message 的 contentVersion）驱动；依赖测量后的 virtualizer 锚定补偿。

#### I7. thinking 块：每条消息被强插空块，且永远无法展开
- 位置：`useTranscript.ts:120-136`、`:162-168`；`ThinkingBlock.tsx:11`、`:15`、`:23-26`、`:32`
- 问题：`message_start` 对**每条** assistant 消息调用 `ensureThinkingBlock` 强制前置一个 `content:''` 的 thinking 块（L120-136, 162-168），不判断是否真的会有 thinking delta；`ThinkingBlock` 用受控 `collapsed` state + `onClick preventDefault`（L23-26），但 `<details>` 从未设置 `open={!collapsed}`，preventDefault 又阻止了原生展开 → 点击只翻转图标和 `hidden` class，内容永远不可见。
- 影响：每条回答上方都有一个空"Thinking…"卡（噪声）；thinking 内容无法查看；设计要求的"流式时展开"也未实现（L11 初始永远 `collapsed:true`）。
- 修复建议：仅当收到首个 thinking delta 时创建 thinking 块（或 `message_start` 不预插）；用 `open={!collapsed}` + 受控 toggle（去掉 preventDefault），流式期默认展开、结束后收起。

#### I8. system/error/noise 帧没有 UI 落点，SystemEventLine 是死代码
- 位置：`useTranscript.ts:141-146`、`:295-301`；`SystemEventLine.tsx:45-64`
- 问题：`ready/agent_start/turn_start/prompt_result` 被显式忽略（L141-146），`noise` 直接 return（L295-297），`error` 仅 `console.error`（L299-301）；全仓没有任何代码创建 `type: 'system'` 块（`grep` 确认只有渲染端引用），因此 `SystemEventLine` 永远不会渲染。
- 影响：计划要求的 system 事件行（会话/轮次/错误）不存在；协议错误、oversized 帧（`commands.rs:92-94` 会发 `Error`）、后端 noise 对用户完全不可见，流式失败时无任何提示。
- 修复建议：`ready/agent_start/turn_start/error` 生成 system 块（`message` 用 `event.message`/简短文案）；`noise` 进调试日志面板；`prompt_result success=false` 显示错误行。

#### I9. `useTranscript` 返回的 `availableModels/availableCommands` 是失效 API
- 位置：`useTranscript.ts:63-64`、`:286-292`、`:385-386`；`events.rs:45`、`commands.rs:89-178`
- 问题：`availableModelsRef.current`/`availableCommandsRef.current` 在 render 期间读取（L385-386，eslint 报点），ref 变化不触发重渲染；且后端从不 emit `AvailableModels`（只有 enum 声明），`available_commands` 通过 DOM CustomEvent 另行广播（L291），与 hook 返回值双轨。
- 影响：任何按共享契约（计划 L307："`useTranscript` 由 Task 4/5/7 消费"）使用 `availableModels` 的消费者只能拿到空数组/陈旧快照；模型选择器数据链路实际为死路（跨区域影响 Task 4）。
- 修复建议：改用 `useState` 持有 models/commands 并在事件到达时 set；`AvailableModels` 需要后端 emit 源；删除无用的 ref 读取。

#### I10. Transcript 滚动容器没有有界高度（集成，跨 Task 2/7）
- 位置：`src/views/Layout.tsx:45-50`、`src/components/ThreadWorkspace.tsx:19-25`、`Transcript.tsx:76-78`
- 问题：Layout 的内层容器有 `gridTemplateColumns` 内联样式但 className 里没有 `grid`（`display:grid` 缺失），子元素按普通流堆叠；`ThreadWorkspace` 的 `<main>` 也没有 `h-full`。`Transcript` 的根 `h-full` 因此在"高度 auto"的父级里解析为内容高度，滚动容器 `clientHeight` 不受视口约束。`需运行时确认` 具体症状，但代码层面不存在有界高度。
- 影响：virtualizer 的 `getSize()` 可能等于内容高（视口失效 → 窗口范围覆盖全量 → DOM 暴涨，违背 <2000 目标）或为 0（不渲染任何行），两种都与虚拟滚动目标冲突；同时页面无法在 transcript 内部滚动。
- 修复建议：Layout 恢复 `grid`/`grid h-full`，`main` 加 `h-full min-h-0 flex-1`，Transcript 用 `flex-1 min-h-0`。

#### I11. 计划验收物全部缺失（5000 fixture / Playwright smoke / DOM 与内存证据）
- 位置：计划 `2026-11-01-m2-agent-tasks.md:134,138-139,330`；`scripts/`；`package.json:12`；`vitest.config.ts:10`；`fixtures/`；`test-results/.last-run.json`
- 问题：仓库不存在 `scripts/transcript_smoke.ts`、不存在 5000 消息回放 fixture（`fixtures/` 只有后端的 `clean_round.jsonl`，`crates/omp-host/tests/fixtures/` 同理）、没有任何 transcript 单测（`vitest` 只匹配 `src/**/*.test.{ts,tsx}`，现存仅 `useTheme.test.ts`），也没有 DOM<2000/<300MB 的测量脚本或记录。`npm run e2e`（`package.json:12`）指向不存在的 `scripts/e2e_smoke.ts`，最近一次 Playwright run 4 个用例失败（浏览器未安装，启动期失败）。
- 影响：Task 3 的两条验收（手动 fixture 回放、自动 smoke 断言）均无证据，<2000 DOM/ <300MB 无法判定；"虚拟滚动 + 流式"没有任何回归防线。
- 修复建议：补 5000 消息生成脚本（含 3MB 工具输出/500 tok/s 录制流）→ `scripts/transcript_smoke.ts` 断言 DOM 节点数、滚动跟随/吸附、`message_end` 后 markdown；修 `e2e` script 路径；给 `useTranscript`/`useVirtualScroll` 补 vitest（事件序列、StrictMode 挂载、buffer flush、会话切换）。

### Minor

1. **`flushStreamingBuffer` 在 setState updater 内读改 ref**（`useTranscript.ts:68-98`，L74-77）：updater 不纯。React 18.3.1 实测源码中 updater 每次更新只调用一次（eager state 路径复用，`react-dom.development.js:15839-15845,16662-16694`），当前不会丢文本；但 React 19 dev StrictMode 会双调用 updater（`需运行时确认`），届时会清空 buffer 导致丢失文本。建议先在 updater 外取走 buffer 再 setState。
2. **重复/死代码估算逻辑**：`useTranscript.ts:375-377` 的 `getTotalHeight` 无人消费，`:390-408` 的 `estimate/estimateBlock` 与 `types/transcript.ts:90-101` 的 `estimateMessageHeight` 重复且易漂移。
3. **ToolCard 双类型断言**：`ToolCard.tsx:50-56` 把同一 block 既 `as ToolCallBlock` 又 `as ToolResultBlock`，读取 `resultBlock.isError`/`resultBlock.result` 在 `tool-call` 上为 `undefined`；`tool-result` 块无任何生产者。类型不安全，修 I1 时一并收敛。
4. **每个 MessageBlock 新建一个 MarkdownIt 实例**（`MessageBlock.tsx:27-36`）：虚拟窗口内可同时挂几十个，移到模块级单例。
5. **a11y/空态**：`Transcript.tsx:77-81` 对高频流式更新使用 `aria-live="polite"`（屏幕阅读器播报风暴），`aria-label` 借用 `sidebar.sessions.title`；无 empty/loading 态（L75-89），空会话面板全空白。
6. **scroll 监听每渲染重建**（`useVirtualScroll.ts:96-114`，`handleScroll` 依赖不稳定回调）；`scrollToIndex`（`:72-77`）无消费者，`[data-role]` 仅 e2e 选择器使用，无跳转能力。
7. **CSP 为空 + 外链未处理**：`crates/omp-tauri/tauri.conf.json:28-30` `csp: null`，与 `dangerouslySetInnerHTML` 组合缺少纵深防御（当前 `html:false` 安全）；markdown/linkify 生成的外链未加 `target/rel` 或 `opener` 处理，点击行为未定义（`需运行时确认` 是否在 webview 内导航）。
8. **`pendingToolCalls` 只增不删**（`useTranscript.ts:230,248-249`），长会话内存增长；`message_end` 收尾影响所有消息的 assistant block（L189-191）属跨消息副作用。
9. **事件源失败无兜底**：`listen` 失败/`invoke` 拒绝都无 UI 提示（`useTranscript.ts:314-321`、`:361-369`），promise 未 catch，用户只看到无反应。

## 与 M2 计划/设计的偏差

| 设计要求 | 实际实现 | 结论 |
|---|---|---|
| 流式：Rust 共享 buffer + **前端 rAF 每帧 drain 一次**（design L102） | 16ms `setTimeout` debounce，无 rAF（`useTranscript.ts:49,100-118`） | 未实现（C1） |
| 流式期纯文本，`message_end` 后一次性 `markdown-it` 渲染（design L58） | 每次 flush 全量 markdown（`MessageBlock.tsx:38-43`） | 未实现（I5） |
| thinking 折叠块默认收起、**流式时展开**（design L56） | 每条消息强制空 thinking 块；从不展开；无法展开（`useTranscript.ts:120-136`、`ThinkingBlock.tsx:15-35`） | 未实现（I7） |
| 工具卡片由 `tool_execution_start/end` 驱动（design L57） | 后端映射成 `Noise`，前端分支不可达（`commands.rs:148-161`、`useTranscript.ts:211-260`） | 未实现（I1） |
| system 事件行（design L56、计划 L116） | 无任何 system 块生产者（`useTranscript.ts:141-146`） | 未实现（I8） |
| 虚拟滚动：`@tanstack/virtual`、变高估算 + **回填**、**插入锚定补偿**（design L103） | 估算在，测量未回填虚拟器，无锚定补偿（`useVirtualScroll.ts:30-94`） | 部分实现（C2/C3/I6） |
| 迟滞吸附：上滚立即解除，24px 内重新吸附（design L61） | `useVirtualScroll.ts:96-107` 已实现 | 符合（但跟随机制脆弱，I6） |
| 5000 消息 fixture 回放 DOM 节点 <2000、内存 <300MB（plan L134、design L104-107） | 无 fixture、无 smoke、无测量证据（见 I11） | 无证据 |
| Task 3 验收：`scripts/transcript_smoke.ts` Playwright smoke（plan L139） | 文件不存在；`npm run e2e` 指向不存在文件（`package.json:12`） | 未完成 |
| 块类型 user/assistant/thinking/tool-card/system 全部渲染且由事件驱动（plan L116） | 渲染器齐全，实际仅 assistant 有事件生产者；user 需死代码 API，tool/system 无驱动 | 部分实现（C4/I1/I8） |
| 共享契约 `useTranscript` 供 Task 4/5/7 消费（plan L307） | `addUserMessage/sendPrompt/availableModels/availableCommands` 均无有效消费者或失效（C4/I9） | 契约不成立 |

## 结论

**FAIL**

理由：4 个 Critical 直接击穿 Task 3 的核心目标——(1) 流式渲染在目标速率下不刷新；(2) 虚拟行坐标错误导致滚动布局不可用；(3) 变高测量未接入 virtualizer；(4) prompt→user 消息→流式的端到端链路断裂。另有 11 个 Important 覆盖 tool/system 块缺失、事件路由契约、会话隔离、StrictMode 泄漏、流式 markdown 性能与计划验收物缺失。

建议修复顺序（回归验证通过前不应标记 Task 3 完成）：
1. C4 + 会话生命周期（spawn/sessionId/invoke `{args}`）→ 打通最小闭环；
2. C1（rAF 节流）→ streaming 可观测；
3. C2 + C3 + I6（行绝对定位、`virtualizer.measureElement` + `data-index`、锚定）→ 虚拟滚动可用；
4. I1/I7/I8（tool-card、thinking、system 三块的真实事件源）；
5. I2/I3/I4（事件契约补 session_id/message_id、会话状态重置、listen 竞态）；
6. 补 I11 的 fixture + smoke + 单测，产出 DOM<2000/<300MB 的实测证据后再申请 PASS。
