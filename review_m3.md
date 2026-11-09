# omp-X M3 阶段完成记录（代码审查 + 人工 gate 勾选表）

- **审查对象**：M3 里程碑。原始计划 `docs/superpowers/plans/2026-11-07-m3-agent-tasks.md` Tasks 1–6；执行计划 `docs/superpowers/plans/2026-11-08-m3-execution-plan.md`。
- **基线**：base `7b48182`（== `master`）；HEAD `7fba92c`；共 8 个提交，30 files / +2132 −58。
- **范围**：`src/**`（transcript/tools、approval、composer、hooks、i18n、lib）、`scripts/e2e_m3_smoke.spec.ts`、`package.json`、`docs/`。
- **方法**：subagent-driven-development 逐任务 TDD（红→绿）+ 6 个只读任务评审 + 1 个整分支只读评审（`7b48182..7fba92c`）；Lead 对跨任务集成点与关键结论逐条复核。过程台账（gitignored）：`.superpowers/sdd/2026-11-08-m3-execution-plan/`。
- **约束**：零 Rust 改动（cargo 仅作回归门禁）；不新增 npm/cargo 依赖；i18n en/zh key parity；禁止发明协议；每任务一提交。
- **日期**：2026-11-08

## 总体判定

> **WITH FIXES — 六个任务全部交付、门禁全绿；2 个 Important 均为「计划范围缺口」而非实现缺陷，需人工决策后方可合入。**

功能层面 M3 已完整交付：结构化工具卡片、审批安全展示 + Composer 禁用、预览 http(s) 隔离、协议对齐（诚实空态）、超时倒计时 + 可配置默认、三条 e2e 流程。整分支评审给出 0 Critical；2 个 Important 均由评审自己标注为「implementation matches the plan's file list / Files-Interfaces literally」，即实现与计划文字一致，缺口在计划的范围界定。

## 1. 验收门禁结果

| # | 命令 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | `npm test` | ✅ EXIT 0 | 138/138 passed（20 files） |
| 2 | `npm run lint` | ✅ EXIT 0 | 0 errors；1 warning（tanstack，M2 起 pre-existing，非 M3 引入） |
| 3 | `npm run build` | ✅ EXIT 0 | 构建成功；chunk-size warning（pre-existing） |
| 4 | `npm run e2e` | ✅ EXIT 0 | 8/8（5 smoke + 3 m3；playwright 默认 glob 收录新 spec） |
| 5 | `npm run e2e-m3` | ✅ EXIT 0 | 3/3（approve / deny / timeout，timeout 用 mock 时钟） |
| 6 | `cargo check -p omp-protocol -p omp-host -p omp-gui` | ✅ EXIT 0 | 33.40s；零 Rust 改动，回归-only。环境 `CARGO_HOME=/tmp/cargo-home-m3 CARGO_TARGET_DIR=/tmp/cargo-target-m3`（沙箱 `~/.cargo` 只读） |

> `cargo check -p omp-tauri` 仍受环境限制（缺 glib-2.0/WebKitGTK-4.1 开发文件），与 M2 结论一致；M3 未改 Rust，故不影响。

## 2. 提交清单

| commit | 类型 | 内容 | 规模 |
|---|---|---|---|
| `7047f9f` | feat(m3) | protocol — 诚实 model 空态 + `/switch` 透传 | 4 files +94 −1 |
| `2c65f59` | chore(m3) | 预置 W1 任务命名空间 i18n key（tool/model/approval） | 2 files +20 |
| `85f38a0` | docs(m3) | M3 执行计划 | 1 file +184 |
| `b154b8f` | feat(m3) | approval — 完整 bash 命令展示 + Composer 禁用 | 6 files +356 −7 |
| `a4d6a20` | feat(m3) | preview — http(s)-only URL 守卫 + add_child spike note | 3 files +73 −1 |
| `d49240e` | feat(m3) | tool cards — dispatch / 路径链接 / 10KB 截断 | 12 files +818 −47 |
| `2549004` | feat(m3) | approval — 倒计时 + 可配置超时默认 60s | 4 files +250 −31 |
| `7fba92c` | test(m3) | e2e smoke — approve/deny/timeout 三流程 | 5 files +368 −2 |

## 3. 任务符合度矩阵

| Task | 结论 | commit | 评审 | 核心证据 |
|---|---|---|---|---|
| T1 结构化工具卡片 | ✅ DONE | `d49240e` | APPROVED | dispatch + GENERIC_RENDERER 兜底；BashCard/FileCard/GenericCard；`extractFilePaths` + 10KB 截断；ensure-open dock 语义（仅 collapsed 时 toggle） |
| T2 审批安全展示 + Composer 禁用 | ✅ DONE | `b154b8f` | APPROVED | `extractBashCommand`（extra 优先、title 解析兜底、绝不截断）；`role=alert` 危险条；Composer `disabled` 联动 |
| T3 预览隔离加固 | ✅ DONE | `a4d6a20` | APPROVED | `assertSafePreviewUrl` 纯函数（http/https only）；add_child 升级结论落 spike note；未新增 Rust 命令 |
| T4 协议对齐瘦身版 | ✅ DONE | `7047f9f` | APPROVED | ModelSelector 诚实空态（禁 mock）；`/switch` 作为普通 prompt 透传；未发明 IPC |
| T5 超时倒计时 + 可配置 | ✅ DONE | `2549004` | APPROVED | 默认 60s（`APPROVAL_TIMEOUT_MS`）；`requestDeadlines` + 250ms tick；超时自动 cancel；session 切换/unmount 清理 |
| T6 e2e_m3_smoke | ✅ DONE | `7fba92c` | APPROVED | 三流程 A/B/C；断言真实 wire 帧（`extension_ui_response`、`{cancelled:true}`）、dock 切换、路径路由、Composer 复用 |

## 4. 关键偏离（计划 → 实际，均已在执行计划 §0 给出证据与理由）

| 计划/设计要求 | 实际 | 理由 |
|---|---|---|
| T3 新建 Rust `open_preview_window` 命令 | 删除，改前端 `assertSafePreviewUrl` + spike note | `usePreview.ts` 已驱动 WebviewWindow；Rust 命令冗余且本沙箱无法编译验证 |
| T4 `available_models` 事件 + `set_model` 命令 | 均不存在，改诚实空态 + `/switch` 透传 | 协议侧 `AvailableModels` 是死代码，fixtures 无该事件；禁止发明 IPC |
| T5 超时默认 30s（设计稿） | 60s 可配置 | omp 二进制不可用无法实测；取计划区间上限，真实 omp 到达后校准 |
| T5 倒计时仅 `ApprovalModal.tsx`（计划文件清单） | `input` 请求无倒计时 | **缺口 L1**，见 §5 |
| T5 「可配置」仅要求从 settings 读（计划文字） | 无应用内写入入口 | **缺口 L2**，见 §5 |

## 5. 已知限制与决策项

### L1（Important，计划范围缺口）input 请求 60s 静默超时，无倒计时

- **现象**：`scheduleTimeout`（`src/hooks/useApproval.tsx:329`）对所有非 `editor` 的 pending method 生效，`input` 请求会在 60s 后被自动 cancel；但倒计时 UI 只加在 `SelectOrConfirmModal`（`src/components/approval/ApprovalModal.tsx:185-192`），`src/components/approval/InputModal.tsx` 从不调用 `useApproval()`，用户正在输入时弹窗会静默消失。
- **性质**：执行计划 T5 文件清单只列 `ApprovalModal.tsx`，故实现与计划文字一致；缺口在计划范围界定（原始计划写的是「每个 UiRequest 附带 30s-60s 定时器」，未区分 modal）。
- **可选处理**：① 在 `InputModal` 复用同一倒计时（读 `requestDeadlines`）；② 显式把 `input` 排除出缩短窗口并记录决策；③ 修订计划使范围显式化。
- **状态**：⚠️ **待人工决策**（ask_user_question 无应答者，未擅自扩范围）。

### L2（Important，计划范围缺口）「可配置超时」无应用内写入入口

- **现象**：`approvalTimeoutMs` 只从 `settings.json` 经 `storeGet` 读取（`src/hooks/useApproval.tsx:18-19`、`:146-160`），应用内无任何写入方（全仓唯一写入点是测试的 localStorage mock）。
- **性质**：执行计划 T5 的 Files/Interfaces 只要求「从 settings/useStore 读」，实现与计划文字一致；「可配置」在计划文字中未定义是否必须应用内可达。
- **处理**：本记录已把 key 显式记录为 **`settings.json` → `approvalTimeoutMs`**（数字、有限、> 0），满足最低可发现性；是否补应用内设置项 **待人工决策**。

### L3（Minor）zh-CN 工具状态值为英文

- `src/i18n/zh-CN.json:189-191` 的 `tool.statusRunning/statusFailed/statusDone` 值为 `Running/Failed/Done`。key parity 成立（186/186），但中文界面下状态 chip 显示英文；T6 e2e 断言字面量 `Done` 因此是 locale 依赖的。
- **状态**：登记为后续打磨项（可翻译为 运行中/失败/完成，并把 e2e 断言改为 `t('tool.statusDone')`）。

### L4（Minor）`remainingMs` 未按计划接口暴露

- 计划 T5 写「暴露 per-request deadline/remainingMs 给 context」；实际 context 暴露 `requestDeadlines: Map<string, number>` + `approvalTimeoutMs`，由 modal 自行计算剩余秒数。功能等价，但接口与计划文字不一致。
- **状态**：已登记；如需严格对齐可补 `remainingMs` 或修订计划文字。

### 已停放的评审 Minor（不阻断 M3，建议后续统一收口）

- **T1**：`truncate`/View-More 块在 BashCard/FileCard/GenericCard 三处重复（可抽共享组件）；`extractFilePaths` 作用于截断后文本，10KB 边界可能产生半截路径按钮；`copy()` 在 `writeText` settle 前置 Copied 且吞异常；`String(block.result ?? '')` 对对象得到 `[object Object]`（应用 `formatToolResult(block.result, true)`）；`toolOutput.ts:30` 裸 `example.com/x` 命中相对分支（已接受取舍）。
- **T5**：`respond()` 存在重复发送竞态（`useApproval.tsx:201-227`，pending 在 `await invokeRequired` 后才删），第二次 respond 在 IPC 窗口内会发出重复 `{cancelled:true}`；测试用 `toHaveBeenCalledWith` 而非 exactly-once。影响低。
- **T6**：`scripts/e2e_m3_smoke.spec.ts:55-224` 与 `e2e_smoke.spec.ts:12-155` 的 mock harness 重复约 100 行；spec 在 `tsconfig.json` include 之外，不被 build/lint 类型检查；flow B 断言 deny 后永久 `Running` spinner；parity 断言只查 `en.json`。
- **Pre-existing（非 M3 引入，勿单独「修复」）**：`src/hooks/useTranscript.tsx` 的 `pendingToolCalls` 在工具完成后不删除，会随会话增长；M3 的 tool-result 参数依赖该保留行为（`src/components/transcript/Transcript.tsx:84-85`），若清理必须同时改参数来源。

## 6. 人工 gate 勾选表（本沙箱无法自动化，需在真实 omp / Tauri 机器执行）

| # | gate | 状态 | 说明 |
|---|---|---|---|
| 1 | `omp --approval-mode=always-ask` 真实往返：approve → agent 继续 / deny → 停止 | ☐ | Task 2 验收 |
| 2 | 取消响应编码 `{cancelled:true}` vs omp 期望 | ☐ | blueprint §0 仅示 `value:"Approve"`；编码已被测试锁定，禁止改动 |
| 3 | 真机 preview webview 内 `window.__TAURI__ === undefined` | ☐ | 设计稿 §4 硬约束 |
| 4 | 超时默认值实测校准（60s vs omp 自身超时） | ☐ | 现为计划区间上限，待实测 |
| 5 | `window.add_child` 升级决策 | ☐ | spike 结论已记录（`docs/superpowers/notes/m3-add-child-spike.md`），升级需 Tauri 真机 |

## 7. 结论

M3 六个任务全部交付，逐任务 TDD + 评审 + 提交，全量门禁（含 cargo 回归）在 HEAD `7fba92c` 全绿。整分支评审 0 Critical，2 个 Important 均为计划范围缺口（L1/L2），实现与计划文字一致。**建议：人工先就 L1/L2 作出范围决策（修复 / 排除 / 修计划），再合入；L3 及停放 Minor 走后续打磨批次。**

**判定：WITH FIXES（功能完整；2 个计划范围缺口待人工决策）。**
