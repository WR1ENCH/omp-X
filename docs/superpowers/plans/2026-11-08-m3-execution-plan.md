# M3 执行计划 — 工具卡片 / 审批闭环 / 预览隔离 / 协议对齐 / 超时 / E2E

> **For agentic workers**: REQUIRED SUB-SKILL: use `subagent-driven-development` (Lead 派发)或 `executing-plans`(单 Agent 内联)。每个 Wave 内的任务写入域互不相交，可并行；Wave 间有依赖，必须等前一 Wave 全部 commit 后启动。
> **来源**: `docs/superpowers/plans/2026-11-07-m3-agent-tasks.md`(原始 M3 计划)+ `docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md` §3/§4/§9 + `omp-gui-blueprint.md` §0。
> **基线**: HEAD=`60f8300`(M2 全部 12 个 P0 已修复)。gates 全绿: `npm test` 72 passed / `npm run lint` 0 err 1 warn / `npm run build` OK / `npm run e2e` 5/5 / `cargo check -p omp-protocol -p omp-host -p omp-gui` OK。

---

## 0. 分析与重新定界(原始 M3 计划 vs 当前代码)

| 原任务 | 当前状态 | 本计划处理 |
|---|---|---|
| T1 结构化工具卡片 | **未开始**。`ToolCard.tsx`(101 行)仅图标 switch;无 `tools/` 目录、无路径识别、无 10KB 截断、无 dock 跳转 | Wave 1 Task 1 完整实现 |
| T2 真实审批流 | **大部分已由 M2 修复完成**:`useApproval.tsx` 已有 `respond()`→`send_ui_response`、失败保持 pending、session 切换清理 | 仅剩: bash `select` 强制完整命令展示 + 安全警告; modal 开启时 Composer 禁用 → Wave 1 Task 2 |
| T3 预览 webview | **大部分已完成**:`usePreview.ts`(335 行)已驱动 `WebviewWindow`(label `preview`);`capabilities/default.json` 已授权;**不存在** Rust `open_preview_window` 命令 | 删除"新建 Rust 命令"(冗余;沙箱无法编译 omp-tauri);保留: URL 白名单校验测试 + add_child spike 结论记录 + 隔离人工 gate → Wave 1 Task 3 |
| T4 协议对齐 | **部分完成**:`available_commands_update`(真实 wire 事件)→`FrontendEvent::AvailableCommands`→`omp:available-commands`→SlashMenu 已通。但 **`available_models` 无任何真实数据源**(`FrontendEvent::AvailableModels` 是死代码,fixtures 无该事件);**`set_model` 命令协议中不存在** | 不造 mock、不发明 IPC;ModelSelector 诚实空态;模型切换走 `/switch` 透传(fixture 中 omp 内建命令) → Wave 1 Task 4 |
| T5 审批超时 | 已有 120s 超时自动 cancel + session 清理(`APPROVAL_TIMEOUT_MS`, `useApproval.tsx:17`);无倒计时 UI、不可配置 | 倒计时 + 可配置(默认 60s)+ 默认值决策记录 → Wave 2 Task 5 |
| T6 e2e_m3 | 不存在;`e2e_smoke.spec.ts`(244 行)mock harness 仅有 spawn/send_prompt | 新建 `scripts/e2e_m3_smoke.spec.ts` + `npm run e2e-m3` → Wave 3 Task 6 |

**环境硬约束(决定上面的重新定界)**:
1. `omp` 二进制未安装 → 一切"真实 omp"验收降级为 mock-IPC 自动化 + 文末人工 gate 清单。
2. `cargo check -p omp-tauri` 在本沙箱失败(`glib-2.0`/webkit2gtk 缺失)→ 本计划**零 Rust 改动**;cargo 不在 PATH,需 `export PATH="$HOME/.cargo/bin:$PATH"`。
3. blueprint §0 只记载 `value:"Approve"` 编码;取消响应编码 `{cancelled:true}` 未获真实 omp 证实 → 保持现状(`useApproval.test.tsx:106` 已锁定),列入人工 gate,**禁止**在本计划内改动编码。

---

## Global Constraints

- **不新增** npm / cargo 依赖。
- 前端 TS strict;新 UI 文案必须同时写入 `src/i18n/en.json` 与 `src/i18n/zh-CN.json`(M2 确立的 131/131 平价规则,新增后须保持 parity)。
- IPC 约定(M2 P0 遗产): 扁平 camelCase 参数;事件携带 session_id 信封。
- 禁止发明协议: 不虚构 `set_model`、不伪造 `available_models` 数据、不新增 Rust 命令。
- 每个任务以 commit 结束;测试禁止 skip(缺依赖须 panic)。commit message: `feat(m3): <task名> — <短描述>`。
- 验证命令(每任务末全跑): `npm test && npm run lint && npm run build && npm run e2e`。

---

## Wave 1(并行;写入域互不相交)

### Task 1: 结构化工具卡片
**Agent**: `task` | **依赖**: 无

**Files / Interfaces**:
- Consumes: `ToolCallBlock`/`ToolResultBlock`(`src/types/transcript.ts`, 含 `status: 'pending'|'running'|'completed'|'failed'`);`useLayoutState()` 的 `setDockTab(dockTab)` / `toggleDock()`(`src/hooks/useLayoutState.tsx:24-36`);`DockTab`(`src/types/layout.ts`)。
- `src/components/transcript/ToolCard.tsx`(改: 图标 switch → `ToolRendererMap[name]` 分发,未知工具回退 GenericCard)
- `src/components/transcript/tools/BashCard.tsx`(新: 命令高亮、结果复制、输出内路径可点击)
- `src/components/transcript/tools/FileCard.tsx`(新: 文件路径摘要 + 内容预览/跳转)
- `src/components/transcript/tools/GenericCard.tsx`(新: JSON/Text 回退)
- `src/lib/toolOutput.ts`(新: `extractFilePaths(text): string[]` + `truncateOutput(text, limit=10*1024): {text, truncated}`)
- `src/i18n/en.json` + `src/i18n/zh-CN.json`(新键: `tool.viewMore`、`tool.openFullOutput`、`tool.copy` 等)
- Produces: 折叠态=图标+一行摘要(命令/文件路径);展开=参数 JSON + 输出前 10KB + 「打开完整输出」→ RightDock Preview 页;bash 输出内路径 → 点击开 RightDock Diff/Preview。

**Steps**(TDD):
- [ ] 先写失败测试 `src/lib/toolOutput.test.ts`: 路径提取(绝对/相对/带 `:line:col`);>10KB 截断保留头部+截断标记
- [ ] 卡片渲染测试: 折叠一行摘要 / 展开 10KB + View More / 「打开完整输出」调用 `setDockTab('preview')`+`toggleDock()`
- [ ] dispatch 测试: `bash`→BashCard、`read|write|edit`→FileCard、未知→GenericCard 不崩溃
- [ ] 实现至全绿(`npm test`)
- [ ] gates: `npm run lint && npm run build && npm run e2e`
- [ ] commit `feat(m3): tool cards — dispatch, path links, 10KB truncation`

**验收**: `npm run dev` 触发 bash 工具→高亮命令+可点击路径; 未知工具→GenericCard 无崩溃; >10KB 输出截断+View More。

### Task 2: 审批安全展示 + Composer 禁用
**Agent**: `task` | **依赖**: 无(与 Task 1/3/4 写入域不相交)

**Files / Interfaces**:
- Consumes: `ApprovalRequest`(`src/types/approval.ts`: `method/title/options/extra`);`ThreadWorkspace` 的 `currentRequest`。
- `src/components/approval/ApprovalModal.tsx`(改: `method==='select'` 且工具为 bash 时, 命令块等宽字体完整渲染, **禁止截断/清洗/隐藏参数**; 加危险警告条)
- `src/components/ThreadWorkspace.tsx:52`(改: `<Composer sessionId={sessionId} disabled={!!currentRequest} />`)
- `src/components/composer/Composer.tsx:9`(改: `ComposerProps` 加 `disabled?: boolean`; 输入框/发送/停止按钮合并 `disabled || isRunning`)
- `src/i18n/en.json` + `zh-CN.json`(新键: `approval.bashWarning` 等)
- Produces: modal 开启期间 Composer 全禁用。

**Steps**(TDD):
- [ ] 先写失败测试: 构造 title 含 `rm -rf / sudo …` 的 bash select 请求 → 断言完整字符串出现在渲染输出中(无截断)
- [ ] ThreadWorkspace 测试: `currentRequest` 非空 → Composer 收到 `disabled`
- [ ] Composer 测试: `disabled` 时输入框与按钮不可用
- [ ] 实现至绿; gates; commit `feat(m3): approval — full bash command + composer disable`

**验收**: bash select 请求展示完整命令+警告; modal 开时 Composer 禁用。

### Task 3: 预览隔离加固(瘦身版)
**Agent**: `task` | **依赖**: 无

**Files / Interfaces**:
- Consumes: `src/hooks/usePreview.ts` 现状(WebviewWindow label `preview`,关闭重建导航);`capabilities/default.json` 现状(已授 `core:webview:allow-create-webview-window`)。
- `src/hooks/usePreview.ts`(仅当缺校验时改: 抽 `assertSafePreviewUrl(url)` —— 仅放行 http/https)
- `src/hooks/usePreview.test.ts`(改: 新增断言)
- `docs/superpowers/notes/m3-add-child-spike.md`(新: add_child spike 结论 —— Tauri 不稳定 API,本沙箱无法编译验证,决策=保留 WebviewWindow fallback,升级条件=CI Tauri 机器实测)
- Produces: URL 白名单单测; 隔离决策记录。**不建** Rust `open_preview_window`(冗余且沙箱无法编译)。

**Steps**(TDD):
- [ ] 先写失败测试: `tauri://`、`file://`、`javascript:`、非 http(s) URL 被 `assertSafePreviewUrl` 拒绝
- [ ] 实现至绿; gates; commit `feat(m3): preview — http(s)-only URL guard + add_child spike note`

**验收**: 隔离规则(设计稿 §4/§9)由单元测试 + 文末人工 gate(`window.__TAURI__ undefined` 真机断言)覆盖。

### Task 4: 协议对齐瘦身版(模型/命令)
**Agent**: `task` | **依赖**: 无

**Files / Interfaces**:
- Consumes: window CustomEvents `omp:available-models` / `omp:available-commands`(`useTranscript.tsx:488-499` 转发;真实 wire 事件 `available_commands_update` 经 `crates/omp-protocol/src/inbound.rs:124` 解析)。
- `src/components/composer/ModelSelector.tsx`(改: 无数据时诚实空态「暂不可用」,**禁止 mock 数据**)
- `src/components/composer/SlashMenu.tsx`(改: 确认 `/model`、`/switch` 由 `omp:available-commands` 实时驱动)
- `src/hooks/useComposer.ts`(改: 移除任何 mock 填充;保留监听;`/switch [model]` 作为普通 prompt 文本透传,由 omp 内建命令处理)
- `src/i18n/en.json` + `zh-CN.json`(新键: `model.unavailable` 等)
- Produces: 空态 UI;/switch 透传。**禁止**: 虚构 `set_model` IPC、伪造 `available_models` 事件。

**Steps**(TDD):
- [ ] 先写失败测试: 无 models 事件 → ModelSelector 渲染空态文案;发 `omp:available-commands` 事件 → SlashMenu 出现 `/switch`
- [ ] `/switch x` 输入 → 断言以原始文本发送(不拦截、不改写)
- [ ] 实现至绿; gates; commit `feat(m3): protocol — honest model empty state + /switch passthrough`

**验收**: 无数据源时不展示假模型;/switch 文本直达后端。

---

## Wave 2(依赖 Task 2 的 ApprovalModal 改动)

### Task 5: 超时倒计时 + 可配置
**Agent**: `task` | **依赖**: Task 2(同文件域,串行)

**Files / Interfaces**:
- Consumes: `APPROVAL_TIMEOUT_MS`(`src/hooks/useApproval.tsx:17`,现 120_000);timeout `setTimeout`(:203-206);`respond()`(:164)。
- `src/hooks/useApproval.tsx`(改: 超时从 settings/useStore 读,默认 **60_000**;暴露 per-request deadline/remainingMs 给 context)
- `src/components/approval/ApprovalModal.tsx`(改: 倒计时显示;归零自动 cancelled)
- `src/i18n/en.json` + `zh-CN.json`(新键: `approval.countdown`)
- Produces: 倒计时 UI;可配置超时。
- **默认值决策**: 计划要求 30–60s;设计稿 §3 提 30s 但无实证;omp 不可用无法实测 → 取 60s(计划上限,给人审危险操作留足时间);真实 omp 到达后实测校准(人工 gate)。

**Steps**(TDD):
- [ ] 先写失败测试: 配置 500ms 超时 → 到时自动发 `{cancelled:true}`(沿用 `useApproval.test.tsx:106` 编码,**不得改编码**)
- [ ] ApprovalModal 测试: 倒计时渲染(秒数递减)
- [ ] 实现至绿; gates; commit `feat(m3): approval — countdown + configurable timeout default 60s`

**验收**: modal 显示倒计时;超时自动 cancel;session 切换清理不变。

> **L1 解决 (2026-11-08)**: `InputModal` 亦获倒计时（同款 `requestDeadlines` + 250ms tick + belt-and-braces 效果），新增 `src/components/approval/InputModal.test.tsx` 3 个测试全绿。执行计划 T5 文件清单原仅列 `ApprovalModal.tsx`，现实现覆盖全部非 `editor` method，消除用户可见静默取消。

> **L2 决策 (2026-11-08)**: 「可配置」保持 store-file 语义（`settings.json` → `approvalTimeoutMs`，数字/有限/>0），计划文字已明确只要求「从 settings/useStore 读」。本记录已把 key 显式记录在完成记录与计划中，满足最低可发现性；应用内设置项留待后续需求决定。

---


## Wave 3(依赖 Wave 1+2 全部完成)

### Task 6: e2e_m3_smoke
**Agent**: `task` | **依赖**: Task 1/2/5

**Files / Interfaces**:
- Consumes: `scripts/e2e_smoke.spec.ts` 的 mock harness(`MOCK_SCRIPT` 模式: `spawn_session`/`send_prompt` 等,browser 模式 mock `window.__TAURI_INTERNALS__`)。
- `scripts/e2e_m3_smoke.spec.ts`(新): 扩展 mock 增加 `tool_execution_start/end`、`ui_request`(select/bash)、`extension_ui_response` 断言
- `package.json`(改: `scripts.e2e-m3`)
- Produces: 三条流程:
  - **A** approve → ToolCard 渲染(命令高亮/路径链接)→ 「打开完整输出」开 Preview
  - **B** deny → 会话停止
  - **C** timeout(mocks 时钟)→ `{cancelled:true}` 响应 + 清理

**Steps**(TDD):
- [ ] 先写 failing spec A/B/C(跑 `npm run e2e-m3` 确认红)
- [ ] 补 mock/组件至全绿
- [ ] gates + `npm run e2e-m3`; commit `test(m3): e2e smoke — approve/deny/timeout flows`

**验收**: `npm run e2e-m3` 3/3 绿。

---

## Wave 4: 总验证 + 评审

- [ ] 全量 gates: `npm test && npm run lint && npm run build && npm run e2e && npm run e2e-m3 && export PATH="$HOME/.cargo/bin:$PATH" && cargo check -p omp-protocol -p omp-host -p omp-gui`
- [ ] `requesting-code-review` skill 评审;修复至绿
- [ ] 更新 `review_m2.md` 同级产物: M3 完成记录 + 人工 gate 勾选表

## 人工 gate(本沙箱无法自动化,真实 omp / Tauri 机器上执行)

1. `omp --approval-mode=always-ask` 真实往返: approve→agent 继续 / deny→停止(Task 2 验收)。
2. 取消响应编码 `{cancelled:true}` vs omp 期望(blueprint §0 仅示 `value:"Approve"`)。
3. 真机 preview webview 内 `window.__TAURI__ === undefined`(设计稿 §4 硬约束)。
4. 超时默认值实测校准(60s vs omp 自身超时)。
5. `window.add_child` 升级决策(spike 结论已记录,升级需 Tauri 真机)。

---

## Self-review(写计划时已核对)

- 无占位符;每任务含 Files/Interfaces(Consumes/Produces)、TDD 红→绿步骤、commit 步骤。
- Wave 内写入域不相交(T1 transcript/tools + lib; T2 approval+Composer; T3 usePreview; T4 composer)→ 可安全并行。
- 环境约束已转化为计划边界(零 Rust 改动、mock e2e、人工 gate 清单)。
- 与原始 M3 计划的三处偏差(Rust 命令删除 / T4 瘦身 / T5 默认值)均在 §0 给出证据与理由。