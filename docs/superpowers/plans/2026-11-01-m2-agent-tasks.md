# M2 — Tauri 骨架 + React 流式 Transcript + Composer（7 个可并行/串行任务）

> **来源**：`docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md`（§0–§4, §6–§7, §10 M2 映射）
> **用途**：每个 Task 独立可派发给 `task` subagent；产物为单个 crate/模块 + 对应测试全绿 + git commit。

---

## Task 1: `omp-tauri` Crate 脚手架 + Tauri 2 配置

**Agent**: `task` | **依赖**: M1 全绿 | **产出**: `omp-tauri` crate 编译通过，`tauri.conf.json`、Vite + React + TS 入口可跑

**文件清单**（全部新建）:
```
/home/wr1ench/omp-X/Cargo.toml                          # + omp-tauri member
/home/wr1ench/omp-X/crates/omp-tauri/Cargo.toml
/home/wr1ench/omp-X/crates/omp-tauri/src/lib.rs
/home/wr1ench/omp-X/crates/omp-tauri/src/commands.rs
/home/wr1ench/omp-X/crates/omp-tauri/src/events.rs
/home/wr1ench/omp-X/crates/omp-tauri/tauri.conf.json
/home/wr1ench/omp-X/src/main.tsx                        # React 入口
/home/wr1ench/omp-X/src/App.tsx
/home/wr1ench/omp-X/src/vite-env.d.ts
/home/wr1ench/omp-X/src/i18n/en.json
/home/wr1ench/omp-X/src/i18n/zh-CN.json
/home/wr1ench/omp-X/src/tokens.css                      # CSS variable token 层
/home/wr1ench/omp-X/package.json
/home/wr1ench/omp-X/tsconfig.json
/home/wr1ench/omp-X/vite.config.ts
/home/wr1ench/omp-X/index.html
```

**核心接口**（Rust → 前端）:
```rust
// commands.rs
#[tauri::command]
async fn spawn_session(config: SessionConfig) -> Result<SessionHandle, String>;
#[tauri::command]
async fn send_prompt(handle: SessionHandle, text: String) -> Result<(), String>;
#[tauri::command]
async fn send_ui_response(handle: SessionHandle, id: String, action: UiResponse) -> Result<(), String>;
#[tauri::command]
async fn close_session(handle: SessionHandle) -> Result<(), String>;
#[tauri::command]
async fn list_worktrees(project: String) -> Result<Vec<WorktreeInfo>, String>;
#[tauri::command]
async fn create_worktree(project: String, branch: String, base: String) -> Result<WorktreeInfo, String>;
#[tauri::command]
async fn delete_worktree(path: String) -> Result<(), String>;

// events.rs — 前端订阅的事件流
#[derive(Serialize, Clone)]
#[serde(tag = "type")]
enum FrontendEvent {
    Ready { protocol_version: u32 },
    AgentStart,
    TurnStart,
    MessageStart { role: String },
    MessageUpdate { delta: String },
    MessageEnd,
    ToolExecutionStart { id: String, name: String, input: Value },
    ToolExecutionEnd { id: String, success: bool, output: Value },
    UiRequest { id: String, request: UiRequest },
    PromptResult { success: bool, data: Option<Value> },
    SessionSettled,
    Error { message: String },
}
```

**验收**:
```bash
cargo check -p omp-tauri                    # 编译通过
cd /home/wr1ench/omp-X && npm install       # 依赖装好
npm run dev                                 # Vite dev server 起来，浏览器打开 Tauri 窗口显示 "omp-X M2"
git add Cargo.toml crates/omp-tauri/ src/ package.json tsconfig.json vite.config.ts index.html
git commit -m "chore: M2 Task 1 omp-tauri scaffold + React entry"
```

---

## Task 2: 窗口骨架 + 三栏布局（Rail + Sidebar + Thread + Right Dock）

**Agent**: `task` | **依赖**: Task 1 | **产出**: 完整三栏布局、状态持久化（`tauri-plugin-store`）、响应式折叠/拖拽

**文件清单**:
```
/home/wr1ench/omp-X/src/views/Layout.tsx
/home/wr1ench/omp-X/src/components/Rail.tsx
/home/wr1ench/omp-X/src/components/Sidebar.tsx
/home/wr1ench/omp-X/src/components/ThreadWorkspace.tsx
/home/wr1ench/omp-X/src/components/RightDock.tsx
/home/wr1ench/omp-X/src/hooks/useLayoutState.ts
/home/wr1ench/omp-X/src/hooks/useStore.ts
/home/wr1ench/omp-X/src/types/layout.ts
```

**UI 规格**（对标蓝图 §2 / 设计 §2–§3）:
- Rail: 48px，7 图标 + tooltip（新建/搜索/项目/自动化/Skills/Review/设置）
- Sidebar: 240px，可折叠（`⌘B`），随 Rail 切换视图（项目/搜索/自动化/Skills/Review）
- ThreadWorkspace: transcript + composer（后续 Task 填充）
- RightDock: 360px 可折叠（`⌘\`），拖拽 280–640px，Tabs: Preview/Terminal/Diff/Worktree
- `tauri-plugin-store` 持久化：rail 选中、sidebar 宽/折叠、dock tab/宽、window size/position
- **无多窗口**（Preview fallback 另开 `WebviewWindow` 留 M4）

**验收**:
```bash
npm run dev
# 视觉：三栏对齐、rail 切换 sidebar 内容、sidebar 折叠/展开、dock 折叠/拖拽、刷新保持状态
git add src/views/Layout.tsx src/components/Rail.tsx src/components/Sidebar.tsx src/components/ThreadWorkspace.tsx src/components/RightDock.tsx src/hooks/useLayoutState.ts src/hooks/useStore.ts src/types/layout.ts
git commit -m "feat(omp-tauri): M2 Task 2 window skeleton three-column layout"
```

---

## Task 3: Transcript 虚拟滚动 + 流式渲染管线

**Agent**: `task` | **依赖**: Task 1, Task 2 | **产出**: `@tanstack/virtual` 虚拟列表、流式 rAF 合并、块类型渲染（user/assistant/thinking/tool-card/system）、迟滞吸附

**文件清单**:
```
/home/wr1ench/omp-X/src/components/transcript/Transcript.tsx
/home/wr1ench/omp-X/src/components/transcript/MessageBlock.tsx
/home/wr1ench/omp-X/src/components/transcript/ThinkingBlock.tsx
/home/wr1ench/omp-X/src/components/transcript/ToolCard.tsx
/home/wr1ench/omp-X/src/components/transcript/SystemEventLine.tsx
/home/wr1ench/omp-X/src/hooks/useTranscript.ts
/home/wr1ench/omp-X/src/hooks/useVirtualScroll.ts
/home/wr1ench/omp-X/src/types/transcript.ts
```

**核心逻辑**:
- `useTranscript`：维护 `Message[]`，Rust 事件 `FrontendEvent` → 追加/更新块；流式期纯文本累积，`message_end` 后一次性 `markdown-it` 渲染
- `useVirtualScroll`：`@tanstack/virtual` 变高估算 + 回填，插入锚定补偿
- 迟滞吸附：手动上滚立即解除；回底部 24px 内重新吸附
- 5000 消息 fixture 回放 DOM 节点 <2000

**验收**:
```bash
# 手动：npm run dev → 窗口粘贴 5000 行 fixture（scripts 可生成） → 滚动流畅、吸附正确、内存 <300MB
# 自动：新增 Playwright smoke（scripts/transcript_smoke.ts）回放 fixture 断言
git add src/components/transcript/ src/hooks/useTranscript.ts src/hooks/useVirtualScroll.ts src/types/transcript.ts
git commit -m "feat(omp-tauri): M2 Task 3 transcript virtual scroll + streaming"
```

---

## Task 4: Composer 底部常驻 + 模型选择器 + Slash 补全

**Agent**: `task` | **依赖**: Task 1, Task 2 | **产出**: 多行 textarea、Enter/Shift+Enter、附件按钮、模型选择器（`available_models` 推送驱动）、Slash 补全（`available_commands_update`）、排队态/Stop 按钮

**文件清单**:
```
/home/wr1ench/omp-X/src/components/composer/Composer.tsx
/home/wr1ench/omp-X/src/components/composer/ModelSelector.tsx
/home/wr1ench/omp-X/src/components/composer/SlashMenu.tsx
/home/wr1ench/omp-X/src/components/composer/AttachmentButton.tsx
/home/wr1ench/omp-X/src/hooks/useComposer.ts
/home/wr1ench/omp-X/src/types/composer.ts
```

**行为细节**（设计 §3 Composer）:
- Enter 发送，Shift+Enter 换行（设置可改，留 M4）
- 附件：文件引用写进 prompt 文本（兼容 RPC 拒 `@file`）
- 模型选择器：数据源 `available_models` 事件，无硬编码
- Slash 补全：`/` 触发，数据源 `available_commands_update`（~92 条），选择回填
- 排队态：stdin bounded channel 满显示 "Queued (n)"
- 运行中 Enter 位变 Stop → 发 `cancel`（协议暂无，M4 补）

**验收**:
```bash
npm run dev
# 视觉：输入/换行/附件/模型下拉/Slash 菜单/排队态/Stop 切换均正常
git add src/components/composer/ src/hooks/useComposer.ts src/types/composer.ts
git commit -m "feat(omp-tauri): M2 Task 4 composer model selector slash completion"
```

---

## Task 5: 审批模态 + Toast + 状态条（extension_ui_request）

**Agent**: `task` | **依赖**: Task 1, Task 3 | **产出**: `select`/`confirm` 居中模态、`input` 单行弹窗、`editor` dock 全屏 tab、`notify` toast、`setStatus`/`setWidget`/`setTitle` 状态条、超时/取消回 `cancelled`

**文件清单**:
```
/home/wr1ench/omp-X/src/components/approval/ApprovalModal.tsx
/home/wr1ench/omp-X/src/components/approval/InputModal.tsx
/home/wr1ench/omp-X/src/components/approval/EditorTab.tsx
/home/wr1ench/omp-X/src/components/approval/Toast.tsx
/home/wr1ench/omp-X/src/components/approval/StatusBar.tsx
/home/wr1ench/omp-X/src/hooks/useApproval.ts
/home/wr1ench/omp-X/src/types/approval.ts
```

**硬约束**（设计 §3 审批流 / §7 安全）:
- `select`/`confirm`：标题等宽高亮，**无「全部允许」**，Approve/Deny 两钮，`Esc`=Deny
- `input`：单行输入弹窗，保存/取消回传
- `editor`：RightDock 新增全屏文本 tab，保存/取消回传 `set_editor_text`
- `notify`：右上 toast，自动消失 5s
- `setStatus`/`setWidget`/`setTitle`：composer 下方状态条
- 每请求绑定 `id`；会话结束/超时（默认 30s，可配）回 `cancelled`，防阻塞

**验收**:
```bash
# 手动：npm run dev → 模拟发 UiRequest 事件 → 模态/弹窗/Tab/Toast/状态条全出现、回传正确
git add src/components/approval/ src/hooks/useApproval.ts src/types/approval.ts
git commit -m "feat(omp-tauri): M2 Task 5 approval modals toast status bar"
```

---

## Task 6: Right Dock 四 Tab 骨架（Preview/Terminal/Diff/Worktree）

**Agent**: `task` | **依赖**: Task 1, Task 2 | **产出**: 四 tab 占位 + 基础框架、Preview IPC 隔离硬约束、Terminal xterm.js + portable-pty 桥接 stub、Diff hunk 虚拟化 stub、Worktree 列表/创建表单 stub

**文件清单**:
```
/home/wr1ench/omp-X/src/components/dock/PreviewTab.tsx
/home/wr1ench/omp-X/src/components/dock/TerminalTab.tsx
/home/wr1ench/omp-X/src/components/dock/DiffTab.tsx
/home/wr1ench/omp-X/src/components/dock/WorktreeTab.tsx
/home/wr1ench/omp-X/src/components/dock/DockTabs.tsx
/home/wr1ench/omp-X/src/hooks/usePreview.ts
/home/wr1ench/omp-X/src/hooks/useTerminal.ts
/home/wr1ench/omp-X/src/hooks/useDiff.ts
/home/wr1ench/omp-X/src/hooks/useWorktree.ts
/home/wr1ench/omp-X/src/types/dock.ts
```

**关键细节**（设计 §4）:
- **Preview**：主路径 `WebviewWindow`（M2 先用稳定 API，`add_child` unstable 留 M3 spike）；**IPC 隔离**：不配置 `dangerousRemoteDomainIpcAccess`、不注入 command、初始化脚本为空、`on_navigation` 仅放行 http(s)；断言 `window.__TAURI__` 不存在
- **Terminal**：xterm.js + Rust `portable-pty` command（开 PTY / 读写 / resize）；多 tab 多 shell；cwd=项目目录
- **Diff**：文件列表 + hunk 虚拟化（`diff2html` 或自渲）；「外部编辑器打开」`tauri-plugin-opener`
- **Worktree**：列表（路径/分支/关联 thread）、创建表单（分支名/基线）、checkout/删除确认；复用 git CLI

**验收**:
```bash
npm run dev
# 视觉：四 tab 切换、Preview 加载 example.com 无 __TAURI__、Terminal 连本地 shell、Diff 空态、Worktree 空态
git add src/components/dock/ src/hooks/usePreview.ts src/hooks/useTerminal.ts src/hooks/useDiff.ts src/hooks/useWorktree.ts src/types/dock.ts
git commit -m "feat(omp-tauri): M2 Task 6 right dock four tabs skeleton"
```

---

## Task 7: 主题 Token + i18n 框架 + 快捷键 + 端到端 Smoke

**Agent**: `task` | **依赖**: Task 2–6 全部 | **产出**: CSS variable 双主题、i18next 双语、DOM 快捷键、workspace 全测试绿 + 真实 omp 一轮跑通

**文件清单**:
```
/home/wr1ench/omp-X/src/tokens.css            # 完善：--bg-base/-raised/-overlay, --fg-*, --accent, --diff-*
/home/wr1ench/omp-X/src/i18n/index.ts         # i18next 初始化、资源加载、语言切换
/home/wr1ench/omp-X/src/hooks/useTheme.ts
/home/wr1ench/omp-X/src/hooks/useShortcuts.ts
/home/wr1ench/omp-X/src/types/theme.ts
/home/wr1ench/omp-X/scripts/e2e_smoke.ts      # Playwright：启动 Tauri → spawn omp → 发 prompt → 断言事件序列
```

**核心项**:
- 双主题：`prefers-color-scheme` 监听 + 设置覆盖（light/dark/system）；xterm/diff 同套 token
- i18n：`en.json`/`zh-CN.json` 覆盖所有 UI 文案；协议原文不翻译
- 快捷键：DOM `keydown`（不用 `tauri-plugin-global-shortcut`）；`⌘K`/`⌘1–9`/`⌘⌥A`/`⌃⇧M`/`⌘\`/`⌘B`/`Esc`
- **better-colors** 技能验证 token 对比度过 WCAG AA
- E2E：`omp --mode rpc-ui --no-tools --no-extensions` 跑通 Ready → AgentStart → … → SessionSettled

**验收**:
```bash
cargo test --workspace                           # Rust 全绿
npm run test                                     # 前端单测全绿
npm run e2e                                      # Playwright smoke 通过
# 对比度报告：better-colors 输出 AA 通过
git add src/tokens.css src/i18n/ src/hooks/useTheme.ts src/hooks/useShortcuts.ts src/types/theme.ts scripts/e2e_smoke.ts
git commit -m "feat(omp-tauri): M2 Task 7 theme i18n shortcuts e2e smoke"
```

---

## 执行顺序与并行策略

| 阶段 | 任务 | 可并行 |
|------|------|--------|
| 1 | Task 1 | — |
| 2 | Task 2 | —（依赖 Task 1 窗口上下文） |
| 3 | Task 3 | 与 Task 4 并行（仅依赖 Task 1, 2） |
| 4 | Task 4 | 与 Task 3 并行 |
| 5 | Task 5 | 与 Task 6 并行（依赖 Task 1, 3） |
| 6 | Task 6 | 与 Task 5 并行（依赖 Task 1, 2） |
| 7 | Task 7 | 依赖 Task 2–6 全部完成 |

**推荐派发顺序**:
```
1. Task 1
2. Task 2（等 Task 1）
3. Task 3 + Task 4 并发（等 Task 1, 2）
4. Task 5 + Task 6 并发（等 Task 1, 2, 3）
5. Task 7（等 Task 2–6 全绿）
```

---

## 共享契约（禁止各 Task 私自更改）

| 符号 | 定义位置 | 消费者 |
|------|----------|--------|
| `FrontendEvent` enum | Task 1 `events.rs` | Task 3, 4, 5, 6, 7 |
| `SessionConfig/SessionHandle` | Task 1 `commands.rs` | Task 3, 4, 7 |
| `UiRequest/UiResponse` | Task 1 `commands.rs` | Task 5 |
| `useTranscript` hook | Task 3 | Task 4, 5, 7 |
| `useLayoutState` hook | Task 2 | Task 3, 4, 5, 6, 7 |
| `tokens.css` 变量名 | Task 7 | 所有 UI Task |
| `i18n.t` key 命名 | Task 7 | 所有 UI Task |

---

## 已知决策点（子代理遇到即止步等待主线程确认）

1. **Preview `add_child` vs `WebviewWindow`**：M2 先用稳定 `WebviewWindow`；`add_child` unstable spike 留 M3 开工首日。
2. **`available_models` / `available_commands_update` 真实事件名**：Task 4/7 smoke 会暴露；按 fixture 改正。
3. **审批超时默认值**：设计写 30s；真实 omp 可能更长/更短，M3 实测定。
4. **Linux WebKitGTK 依赖**：M2 本机先跑通；分发阶段（M6）再评估 AppImage 捆运行时。
5. **`negotiate_protocol` v2**：M2 不协商（默认 v1）；需要时再加。

---

## 验收总览

| Task | 命令 | 期望 |
|------|------|------|
| 1 | `cargo check -p omp-tauri && npm run dev` | 编译通过 + 窗口起来显示 M2 |
| 2 | `npm run dev` | 三栏布局、折叠/拖拽、状态持久化 |
| 3 | `npm run dev` + fixture 回放 | 虚拟滚动流畅、吸附正确、DOM <2000、内存 <300MB |
| 4 | `npm run dev` | Composer 全功能、模型/Slash 数据驱动 |
| 5 | `npm run dev` + 模拟 UiRequest | 模态/弹窗/Tab/Toast/状态条全链路回传 |
| 6 | `npm run dev` | 四 tab 切换、Preview 隔离、Terminal 连 shell |
| 7 | `cargo test --workspace && npm run test && npm run e2e` | 全绿 + 真实 omp 一轮跑通 + WCAG AA |

M2 全绿 → 出 M3 计划（工具卡片完善 + `add_child` spike + 真实审批流 + 模型/Slash 真实事件对齐）。