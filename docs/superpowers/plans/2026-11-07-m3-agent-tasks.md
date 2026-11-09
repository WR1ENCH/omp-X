# M3 — 工具卡片完善 + 真实审批流 + 预览增强（6 个任务）

> **来源**：`omp-gui-blueprint.md` §6, `2026-11-01-m2-agent-tasks.md` 结尾
> **目标**：将 M2 的骨架升级为具备真实交互能力的生产力界面，完成 `omp` 协议中 UI 请求的完整闭环。

---

## Task 1: 结构化工具卡片 (Enhanced Tool Cards)
**Agent**: `task` | **依赖**: M2 Task 3 | **产出**: 针对不同工具的渲染适配器 + 交互式结果页

**文件清单**:
```
/home/wr1ench/omp-X/src/components/transcript/ToolCard.tsx         # 升级：支持按 tool_name 分发渲染
/home/wr1ench/omp-X/src/components/transcript/tools/BashCard.tsx    # 新建：支持命令高亮、结果复制、路径跳转
/home/wr1ench/omp-X/src/components/transcript/tools/FileCard.tsx     # 新建：文件内容预览/编辑跳转
/home/wr1ench/omp-X/src/components/transcript/tools/GenericCard.tsx  # 新建：通用 JSON/Text 回退方案
/home/wr1ench/omp-X/src/types/transcript.ts                         # 更新：ToolExecution 状态类型
```

**核心逻辑**:
- **分发模式**: `ToolCard` $\to$ `ToolRendererMap[name]` $\to$ `SpecificCard`。
- **路径识别**: 自动识别 `bash` 输出中的文件路径 $\to$ 变为可点击链接 $\to$ 打开 RightDock-Diff/Preview。
- **结果截断**: 对超大工具输出执行前端截断，提供 "View More" 展开或跳转至 RightDock 详情页。

**验收**:
- `npm run dev` $\to$ 触发 `bash` 工具 $\to$ 看到高亮命令和可点击路径。
- 触发未知工具 $\to$ 正常显示 `GenericCard` 无崩溃。

---

## Task 2: 真实审批流闭环 (Real Approval Flow)
**Agent**: `task` | **依赖**: M2 Task 5 | **产出**: `extension_ui_request` $\to$ `extension_ui_response` 完整链路

**文件清单**:
```
/home/wr1ench/omp-X/src/hooks/useApproval.ts                      # 升级：实现真正发送 response 到 Rust 后端
/home/wr1ench/omp-X/crates/omp-tauri/src/commands.rs                # 升级：send_ui_response 确保正确路由到对应 Session
/home/wr1ench/omp-X/src/components/approval/ApprovalModal.tsx       # 升级：增加安全警告提示、详情展开
```

**核心逻辑**:
- **链路闭环**: UI 点击 "Approve" $\to$ `invoke('send_ui_response', {id, value: 'Approve'})` $\to$ `omp-host` 写入子进程 stdin $\to$ Agent 继续执行。
- **安全增强**: 针对 `bash` 工具的 `select` 请求，必须强制展示完整命令，禁止隐藏危险参数。
- **状态同步**: 审批模态框开启时，Composer 进入 `disabled` 状态，防止并发干扰。

**验收**:
- 运行 `omp --approval-mode=always-ask` $\to$ 触发文件修改 $\to$ 点击 Approve $\to$ 观察到 agent 继续执行修改。
- 点击 Deny $\to$ 观察到 agent 收到拒绝并停止/报错。

---

## Task 3: 预览窗格增强与 IPC 隔离 (Webview Spike)
**Agent**: `task` | **依赖**: M2 Task 6 | **产出**: 稳定且安全的 Webview 预览方案

**文件清单**:
```
/home/wr1ench/omp-X/src/hooks/usePreview.ts                        # 升级：实现 WebviewWindow 的动态创建/销毁
/home/wr1ench/omp-X/crates/omp-tauri/src/commands.rs               # 新建：open_preview_window (Tauri Window API)
/home/wr1ench/omp-X/src/components/dock/PreviewTab.tsx             # 升级：支持多页签/独立窗口切换
```

**核心逻辑**:
- **隔离验证**: 确保预览页面无法通过 `window.__TAURI__` 调用敏感指令（严格配置 `capabilities`）。
- **动态加载**: 实现 `open_preview(url)` $\to$ 在 RightDock 或新独立窗口打开 $\to$ 同步加载状态。
- **上下文传递**: 允许从 Transcript 的 ToolCard 一键将文件/URL 推送到预览窗格。

**验收**:
- 打开外部 URL $\to$ 确认页面可加载 $\to$ 尝试在控制台运行 `window.__TAURI__` $\to$ 返回 `undefined`。

---

## Task 4: 协议事件真实对齐 (Protocol Alignment)
**Agent**: `task` | **依赖**: M2 Task 4 | **产出**: 模型/命令列表由后端实时驱动

**文件清单**:
```
/home/wr1ench/omp-X/src/hooks/useComposer.ts                       # 升级：监听 available_models / available_commands_update
/home/wr1ench/omp-X/src/components/composer/ModelSelector.tsx       # 升级：移除 Mock 数据，使用实时事件流
/home/wr1ench/omp-X/src/components/composer/SlashMenu.tsx          # 升级：实时更新 slash 命令列表
```

**核心逻辑**:
- **事件驱动**: 启动 Session $\to$ 捕获 `available_models` $\to$ 更新 ModelSelector 下拉列表。
- **动态命令**: 捕获 `available_commands_update` $\to$ 刷新 SlashMenu 候选词。
- **同步机制**: 确保在模型切换后，正确向后端发送 `set_model` 指令（若协议支持）。

**验收**:
- 启动应用 $\to$ 检查模型下拉列表是否与当前 `omp` 配置的可用模型一致。
- 输入 `/` $\to$ 检查命令列表是否包含最新的 `omp` 内部命令。

---

## Task 5: 审批超时与生命周期管理
**Agent**: `task` | **依赖**: Task 2 | **产出**: 防止 Agent 永久阻塞的超时机制

**文件清单**:
```
/home/wr1ench/omp-X/src/hooks/useApproval.ts                       # 新建：Timer 管理，超时自动回传 'cancelled'
/home/wr1ench/omp-X/src/components/approval/ApprovalModal.tsx      # 升级：增加倒计时显示
```

**核心逻辑**:
- **自动回传**: 每个 `UiRequest` 附带 30s-60s 定时器 $\to$ 到期未操作 $\to$ 自动发送 `cancelled` $\to$ 释放 Agent 阻塞。
- **会话清理**: 当 Session 关闭时，立即销毁所有挂起的审批模态框。

**验收**:
- 触发审批 $\to$ 等待超时 $\to$ 观察到模态框自动关闭 $\to$ Agent 收到 cancelled 并反应。

---

## Task 6: M3 端到端 Smoke Test (Tooling & Approval)
**Agent**: `task` | **依赖**: Task 1-5 | **产出**: 覆盖完整 Tool-Approval-Preview 链路的 E2E 测试

**文件清单**:
```
/home/wr1ench/omp-X/scripts/e2e_m3_smoke.ts                        # 新建：Playwright 脚本
```

**测试用例**:
1. **链路 A**: 发送 prompt $\to$ Agent 调用 `bash` $\to$ 弹出审批 $\to$ 点击 Approve $\to$ 结果显示在 ToolCard $\to$ 点击路径 $\to$ 打开 Preview。
2. **链路 B**: 发送 prompt $\to$ 弹出审批 $\to$ 点击 Deny $\to$ 断言 Agent 停止执行。
3. **链路 C**: 触发审批 $\to$ 等待超时 $\to$ 断言自动 cancelled。

**验收**:
- `npm run e2e-m3` 全绿。

---

## 执行顺序与并行策略

| 阶段 | 任务 | 可并行 |
|---|---|---|
| 1 | Task 1 (Cards) | 与 Task 4 (Alignment) 并行 |
| 2 | Task 2 (Approval) | 依赖 Task 1 |
| 3 | Task 3 (Preview) | 与 Task 2 并行 |
| 4 | Task 5 (Timeout) | 依赖 Task 2 |
| 5 | Task 6 (Smoke) | 依赖全部完成 |

**推荐派发**: `(Task 1, Task 4)` $\to$ `(Task 2, Task 3)` $\to$ `Task 5` $\to$ `Task 6`。
