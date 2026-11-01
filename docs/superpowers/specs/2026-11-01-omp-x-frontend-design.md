# omp-X 前端设计（Tauri 2 + React，对标 Codex Desktop 终态）

日期：2026-11-01。上游蓝图：`omp-gui-blueprint.md`。本文档经逐步确认批准，覆盖 M2–M8 全部界面的终态设计；实现仍按蓝图里程碑分批。

## 0. 决策记录（对蓝图的修订）

用户确认推翻蓝图 §9 两条「不做」，本设计以下列决策取代相应蓝图章节：

| 蓝图原文 | 修订 | 理由 |
|---|---|---|
| §2 UI 层锁定 Rust + iced | **改：Tauri 2 + React**（Rust 壳 + 系统 webview） | 内置终端 + 网页预览要求应用内嵌浏览器能力；iced 无合规实现（wgpu 与 webview 合成器混排不可靠）。Tauri 保留 Rust 后端投资，包体 ~10–15MB |
| §9 不做内置终端 | **改：做**。xterm.js + Rust 侧 `portable-pty` 自桥 | 用户全量对标 Codex Desktop |
| §9 不引入 WebView/内嵌浏览器 | **改：引入**。Tauri wry webview | 同上，网页预览 tab 需要 |
| §5 iced 性能工程（shaping 缓存、块模型） | **语义保留、实现替换**：流式 rAF 合并、虚拟滚动、迟滞吸附不变；cosmic-text/syntect 缓存作废 | DOM 下 markdown/高亮/diff 免费 |
| §8 冷启动 <300ms、5000 消息 <150MB | **改：<1s、<300MB**。帧 p95 <8ms 保留 | web 栈下旧指标不现实，诚实下调 |
| §3 crate 表：`omp-render`/`omp-ui` | **删除**，新增 `omp-tauri`（壳）与 `src/`（React 前端） | iced 专用层 |

不变（100% 保留）：`omp-protocol` / `omp-host` / `omp-session` 三 crate、§0 协议事实、§4 主机层四件事、§7 安全约束、§6 里程碑顺序（M1 仍先行）、fixture 机制。

## 1. 已确认的产品决策

- **范围**：M2–M8 全部界面终态一次设计到位。
- **界面语言**：i18n 框架（i18next + JSON 资源），首版实装英文，`zh-CN.json` 随后。协议原文（审批 title、slash 命令描述等 omp 来源文本）不翻译。
- **主题**：双主题跟随系统，CSS variables token 层，设置可覆盖 light/dark/system。具体色值实现时用 better-colors 技能产出，对比度过 WCAG AA。
- **布局**：Codex Desktop 同构三栏（方案 1）。

## 2. 窗口骨架

```
┌────┬──────────────┬────────────────────────────┬──────────────────┐
│rail│  Sidebar     │  Thread 工作区              │  Right Dock      │
│48px│  240px       │  transcript + composer     │  360px 可折叠     │
└────┴──────────────┴────────────────────────────┴──────────────────┘
```

- 默认 1280×800，最小 960×600。Tauri 默认标题栏（不自绘，YAGNI）；`setTitle` 协议事件同步 thread 标题。
- 状态持久化（rail 选中项、sidebar 宽/折叠、dock tab/宽）：`tauri-plugin-store`，本地 JSON。
- **无多窗口 UX**（唯一例外：Preview fallback 独立 `WebviewWindow`，见 §4）；无顶层独立屏幕：Automations/Skills/Review/Settings 全是 sidebar 视图 + 中央区变体列表。

### Icon rail（48px）
新建对话 / 搜索 / 项目 / 自动化 / Skills / Review 队列 / 设置。图标 + i18n tooltip；Review 未处理项显示 badge 数。

### Sidebar（240px，可折叠，随 rail 切换内容）
- **项目视图**：项目 → thread 两级树。项目条目显示 worktree 数；thread 条目状态点：运行中=绿脉冲、待审批=黄、空闲=灰。右键：rename / delete / 外部编辑器打开 worktree / checkout worktree。
- **搜索视图**：全局搜索，匹配 thread 标题与历史消息，结果按项目分组。
- **自动化视图**：automation 列表（读本地 TOML），行显示 cron 人读化 + 上次运行结果 + 启用开关。
- **Skills 视图**：skill 列表 + 启用开关；点击在 dock 打开 SKILL.md 编辑。
- **Review 队列**：automation 产出列表，点开恢复会话。

### Right Dock（360px，可折叠，拖宽 280–640px）
tabs：Preview / Terminal / Diff / Worktree（+ Skills 编辑、`editor` 协议请求按需插入）。每个 thread 记住自己的 dock tab。`⌘\` 折叠。

## 3. Thread 视图

### Transcript（`@tanstack/virtual` 虚拟滚动）
- 块类型：user 消息 / thinking 折叠块（默认收起，流式时展开）/ assistant 正文 / 工具卡片 / system 事件行。
- Markdown：流式期纯文本，`message_end` 后一次性渲染（`markdown-it` 或流式专用库）。
- 工具卡片：`tool_execution_start/end` 驱动。折叠态=图标+一行摘要（命令/文件路径）；展开=参数 JSON + 输出前 10KB，其余「打开完整输出」→ dock 文件预览。状态：运行中 spinner / 成功 / 失败红。
- 滚动跟随迟滞：手动上滚立即解除吸附；回底部 24px 内重新吸附。
- Diff 组件（transcript 内嵌与 dock Diff tab 共用）：hunk 级虚拟化，`diff2html` 或自渲。

### Composer（底部常驻）
- 多行 textarea；Enter 发送，Shift+Enter 换行（设置可改）。
- 附件按钮：文件引用写进 prompt 文本（兼容 RPC 拒 `@file`，§0）。
- 模型选择器：数据来自 `available_models` 推送，无硬编码；切换命令名 M2 实测定。
- Slash 补全：输入 `/` 弹列表，数据源 `available_commands_update`（~92 条推送）；选择回填文本。
- 排队态：stdin bounded channel 满时显示「Queued (n)」（§4.4 语义）。
- 运行中 Enter 位变 Stop。

### 审批流（`extension_ui_request`，§0/§7）
- `select`/`confirm` → 居中模态：协议原文标题等宽高亮展示，Approve/Deny 两钮，**无「全部允许」**；`Esc`=Deny。
- `input` → 单行输入弹窗；`editor` → dock 全屏文本 tab，保存/取消回传。
- `notify` → 右上 toast；`setStatus`/`setWidget`/`setTitle` → composer 下方状态条；`set_editor_text` 按协议回传。
- 每请求绑定 `id`；会话结束/超时回 `cancelled`，防阻塞（§4.2）。

### 会话恢复（M4）
读 `--session-dir` 落盘历史，按 `seq` 排序重放为静态块。

## 4. Right Dock 四 tab

- **Preview**：网页预览。主路径 `window.add_child` 多 webview（Tauri `unstable` feature，**开工首日 spike 验证**）；fallback 独立 `WebviewWindow` + 「新窗口打开」钮。地址栏 + reload + 外部浏览器按钮。工具产出含 URL 时自动填充。
  - **IPC 隔离（硬约束）**：预览 webview 加载的是模型/工具给的**远端任意 URL**，必须与 app-origin webview 完全隔离：`dangerousRemoteDomainIpcAccess` 不配置（默认拒绝）、不注入任何 Tauri command、`initializationScript` 为空、`on_navigation` 仅放行 http(s)。预览页内容**永不**能触达 `omp-tauri` commands——否则任意网页 = 任意命令执行。预览与主窗的唯一通信通道是地址栏状态（主窗 → 预览单向）。
- **Terminal**：xterm.js + Rust `portable-pty` 自桥（Tauri command 开 PTY、event 推 output、command 收 input；参照 marc2332/tauri-terminal 模式；不用 tauri-plugin-pty，覆盖率 50%）。多 tab 多 shell；cwd 默认项目目录；只 spawn 用户 shell，不经会话内容（§7）。
- **Diff**：当前 thread 全部文件改动。文件列表 + hunk。「在外部编辑器打开」走 `tauri-plugin-opener`。worktree thread 显示 branch + checkout 钮（M7）。
- **Worktree**：项目 worktree 列表（路径/分支/关联 thread）、创建表单（分支名/基线）、checkout/删除带确认。复用 git 命令，不自研。M7 前空态文案。

## 5. Automations / Review / Skills（M8 界面）

- **Automations**：列表（名称/cron 人读化/关联项目/启用开关/上次运行状态）+ 创建编辑表单（名称/schedule/prompt 模板/项目/skills 多选/**approval 策略**）。定义存 `~/.omp/gui/automations.toml`（不建 DB）。到点 GUI 在专用后台 worktree spawn `omp --mode rpc-ui`，产出落 review 队列。界面显示运行态 + 跳转 thread。
- **后台运行审批策略（必须，防静默挂死）**：自动化 spawn **不传 `--no-ui`**——§0 实测它关闭 `extension_ui_request` 对话框，若传了 GUI 收不到任何请求，「按策略应答」成死代码，工具是否执行完全取决于 `--approval-mode` 的未实测语义。正确做法：保留请求通道，GUI 按 TOML `approval` 字段程序化应答——`deny`（默认，全部回 Deny）/ `bypass`（显式 opt-in 自动放行，界面标注风险）。应答历史记入 review 项（拒绝/放行随产出展示）。`--approval-mode` 实际 CLI 取值蓝图只实测过 `always-ask`，TOML 存的是**GUI 策略名**而非 CLI 值，两者映射 **M8 实机确认**。运行有超时（TOML 可配，默认 30min），超时 kill 并标记失败进队列。不设「等人审」模式——后台任务等人违背自动化语义。
- **Review 队列**：rail badge + 列表（automation 名/时间/摘要/新-已处理）。点开恢复会话 + 自动开 Diff tab。「标记已处理」清 badge。队列文件 `~/.omp/gui/review-queue.jsonl`。
- **Skills**：列表（名称/来源目录/启用态，读写 omp skill 目录标记，路径 M8 开工定）。dock 内 textarea 编辑 SKILL.md 写回；禁用=改标记不删目录。不做官方库下载（§10.2）。

## 6. 主题 / i18n / 快捷键

- **Token 层**：`--bg-base/-raised/-overlay`、`--fg-primary/-secondary/-muted`、`--accent`、`--diff-add/-del/-warn/-error`。`prefers-color-scheme` 监听 + 设置覆盖。xterm/diff 主题适配同套 token。
- **i18n**：i18next；`en.json`/`zh-CN.json`；无硬编码文案；协议原文不翻译。
- **快捷键**（对标 Codex 命令表 subset）：`⌘K` 命令面板；`⌘1–9` 跳 thread；`⌘⌥A` 下一个待审批；`⌃⇧M` 模型选择器；`⌘\` dock 折叠；`⌘B` sidebar 折叠；`Esc` 关弹窗。窗口内快捷键用 DOM `keydown` 处理器实现，**不用** `tauri-plugin-global-shortcut`（该插件注册 OS 级热键，会从其他应用偷走 ⌘K/⌘B 等）。

## 7. 性能架构（§8 重写）

- 流式：Rust 共享 buffer + 前端 rAF 每帧 drain 一次（§5.1 语义保留）。
- 虚拟滚动：`@tanstack/virtual`，变高估算+回填，插入锚定补偿。
- 内存：5000 消息虚拟化后 DOM 节点 <2000，目标 **<300MB**。
- 冷启动：**<1s**。滚动帧 p95 **<8ms @120Hz** 保留。
- 测量：DevTools tracing + Playwright 跑 fixture 回放断言（puffin 不适用）。
- Fixture 不变：5000 消息 + 3MB 工具输出 + 200 diff + 500 tok/s 录制流回放。

## 8. 代码布局

| 单元 | 内容 |
|---|---|
| `omp-protocol` / `omp-host` / `omp-session` | 原样保留（UI 无关） |
| `omp-tauri`（新增） | Tauri 壳：commands/events 桥、PTY、opener、store、审批超时 |
| `src/`（新增） | React + Vite：`views/`（sidebar 各视图）、`components/`（transcript/composer/dock/审批）、`hooks/`（事件流、虚拟化）、`i18n/`、`tokens.css` |
| ~~`omp-render` / ~~`omp-ui`~~ | 删除（iced 专用） |

## 9. 风险与验证门

| 风险 | 处置 |
|---|---|
| Tauri 多 webview `add_child` unstable API 变动 | 开工首日 spike；失败即 fallback `WebviewWindow`，接口层隔离 |
| Preview webview 加载远端任意 URL = 攻击面 | §4 IPC 隔离硬约束：零 command 注入、零 remote IPC、仅 http(s) 导航；CI 加断言「预览 webview 上 `window.__TAURI__` 不存在」 |
| Linux WebKitGTK 依赖碎片（Kali 实测环境） | M2 在本机先跑通；分发阶段（M6）再评估 AppImage 捆运行时 |
| i18n 框架引入时机 | M2 起即抽文案，避免后补 |
| 双主题对比度 | token 定稿时 better-colors 技能验证 AA |

## 10. 与蓝图里程碑的映射

M1（纯 CLI host）不变。M2 = 窗口骨架 + transcript 流式 + composer；M3 = 工具卡片 + 审批模态；M4 = 会话/模型/slash；M5 = markdown/diff 高亮（web 栈下工作量大减）；M6 = 三平台分发（WebKitGTK 决策点）；M7 = 编排视图 + worktree dock + diff 外开；M8 = Automations/Review/Skills。每阶段验收追加 §7 的新指标断言。
