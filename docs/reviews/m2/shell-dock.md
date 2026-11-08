# M2 壳层 / Right Dock / 主题 / i18n 审查（task-3）

- 审查对象：M2 窗口骨架（Rail + Sidebar + Thread + Right Dock）、Dock 四 tab、theme token、i18n 框架。
- 基线：M2 base `e39f845`；HEAD `c90759a`（Task 1–3 已提交）；工作树含 Task 4–7 未提交改动（`git status` 见下）。
- 审查方式：只读源码通读 + 后端/插件契约交叉核对 + 小脚本计算。**未修改任何源码/配置**；按分工未运行 `build/lint/test`（verifier 负责门禁），Tauri 桌面端无法在本机构建运行。

## 审查范围

| 文件 | 行数 | 归属 |
|---|---|---|
| `src/views/Layout.tsx` | 63 | Task 2（HEAD）+ Task 5 改动（工作树） |
| `src/components/Rail.tsx` / `Sidebar.tsx` / `RightDock.tsx` / `ThreadWorkspace.tsx` | 67 / 232 / 163 / 41 | Task 2（Sidebar/Rail 未改动；RightDock/ThreadWorkspace 工作树改动） |
| `src/components/dock/{PreviewTab,TerminalTab,DiffTab,WorktreeTab,DockTabs}.tsx` | 162 / 215 / 195 / 371 / 70 | Task 6（全部 untracked） |
| `src/hooks/{useLayoutState,useStore}.ts` | 95 / 43 | Task 2（HEAD，未改动） |
| `src/hooks/{usePreview,useTerminal,useDiff,useWorktree,useTheme}.ts` | 63 / 146 / 156 / 180 / 92 | Task 6/7（untracked） |
| `src/tokens.css` | 404 | Task 7（工作树改动） |
| `src/i18n/index.ts`、`en.json`、`zh-CN.json` | 63 / 170 / 170 | Task 7 |
| `src/types/layout.ts`、`src/types/dock.ts` | 35 / 67 | Task 2/6 |
| `crates/omp-tauri/tauri.conf.json`、`crates/omp-tauri/src/{pty.rs,commands.rs,events.rs}`、`tauri-plugin-store-2.5.0` 源码 | — | 仅用于前端↔后端契约核对（Rust 审查归后端 reviewer） |

## 验证证据

1. **仓库状态**：HEAD `c90759a` 包含 Task 1–3；工作树 `M src/views/Layout.tsx`、`M src/components/RightDock.tsx`、`M src/components/ThreadWorkspace.tsx`、`M src/tokens.css`、`M src/i18n/*.json`、`M src/main.tsx`、`M src/types/layout.ts`，Task 4–7 新增文件全部 `??`（`dock/`、`hooks/use*`、`i18n/index.ts` 等）。`Sidebar.tsx`/`Rail.tsx`/`useLayoutState.ts`/`useStore.ts` 属已提交 Task 2 代码，本次一并审查。
2. **源码通读**：上述 20 个文件全部逐行读过（非抽样）。
3. **OKLCH→sRGB 对比度脚本**（`node` 实现 Ottosson 矩阵 + 相对亮度，亮/暗各取 token 配对）：结果见 C6/Important-5，关键失败值：暗色 `--accent` on `--bg-base` = **4.24**、`--accent` on `--accent-muted` = **3.27**、dock 激活 tab（accent/10 叠加 elevated）≈ **3.94**；亮色 `--fg-muted` on `--bg-hover` = **4.45**；暗色 surface 层：elevated/base = **1.01**、hover/base = **1.03**、border/elevated = **1.14**（WCAG 1.4.11 要求 UI 组件视觉边界 ≥3:1）。
4. **i18n 校验脚本**：`en.json` 131 个叶子 key，`zh-CN.json` 131 个，`only en`/`only zh` 均为空；对 `src/**/*.ts(x)` 中静态 `t('...')` key 扫描，**0 个缺失 key**（i18n 资源本身完整，问题在硬编码与切换入口，见 Important-4）。
5. **插件契约核对**：`crates/omp-tauri/Cargo.toml:10` 锁定 `tauri-plugin-store = 2.5.0`；registry 源码 `tauri-plugin-store-2.5.0/src/lib.rs` 中 `plugin:store|get` 签名为 `get(app, rid: ResourceId, key) -> (Option<JsonValue>, bool)`，`set`/`save` 同样必须带 `rid`，`rid` 只能由 `plugin:store|load` 返回。前端三个持久化模块均未调用 `load`（`grep "plugin:store" src` 只有 get/set/save，见 C3）。
6. **后端 PTY 契约核对**：`crates/omp-tauri/src/pty.rs:131` 注释明确 "The frontend polls `pty_read`; no event channel is needed for PTY output"，`:209` 提供 `pty_read`；`:90` `pty_spawn` 参数为**单个** `args: PtySpawnArgs`（`:72`，字段 `shell/cols/rows/cwd`）；`events.rs` 只定义 `omp://event` 单通道，无 `pty://*` 事件（见 C4/C5）。
7. **交互/可访问性搜索**：`src` 中 `createContext|Provider` = 0（状态未共享，C2）；`pty_read` 在前端 = 0 引用；`WebviewWindow|add_child|initialization_script|on_navigation|dangerousRemoteDomainIpcAccess` 在 `crates/omp-tauri` = 0 处（C6）；`data-testid="sidebar"` 仅出现在 e2e（组件里没有）；`data-i18n` 仅出现在 e2e；`window.i18n` 从未赋值；`window size/position` 相关 API = 0 引用（见 I4）。
8. **测试现状**：`find src -name "*.test.*"` 只有 `src/hooks/useTheme.test.ts`；vitest 配置 `include: ['src/**/*.test.{ts,tsx}']`。`npm test` 覆盖不到 layout/store/dock 任一模块；`package.json:12` 的 e2e 脚本指向不存在的 `scripts/e2e_smoke.ts`（实际文件为 `scripts/e2e_smoke.spec.ts`）。
9. **跨模块备注（供 Lead 汇总，不在本报告结论内）**：`src/hooks/useApproval.ts:31` 以扁平 `{session_id, request_id, response}` 调用 `send_ui_response`，而后端 `commands.rs:237` 取 `args: SendUiResponseArgs`；同类 `invoke` 参数形状问题在 `worktree_*`（`useWorktree.ts:89` vs `commands.rs:282`）与 `pty_spawn` 重复出现，建议前端统一按 `{ args: {...} }` 传参。另 `useApproval` 的 30s 超时在 Layout 与 ThreadWorkspace 各注册一份（`Layout.tsx:13`、`ThreadWorkspace.tsx:14`），会重复回传。
10. **需运行时确认项（不作为 Critical）**：预览 iframe 内是否可触达 `window.__TAURI_INTERNALS__`；Tauri 下 `window.open` 是否另开窗口/被拦截；xterm 5.3 对 `var(--*)` 主题色的解析与主题切换是否重绘；`initI18n()` 未 await 时首帧 key 闪现的长度。

## 优点

- **i18n 资源完整**：`en.json`/`zh-CN.json` key 完全对齐（131/131），无静态 `t()` key 缺失；`i18n/index.ts` 的 `resources` 内联加载、`fallbackLng: 'en'`、语言按浏览器 `navigator.language` 兜底，思路正确。
- **token 体系设计方向正确**：OKLCH 单一色相 ramp、`:root` 亮色默认 + `[data-theme]` 覆盖 + `@media (prefers-color-scheme: dark)` 兜底（`tokens.css:15-103/105-171/173-241`）三层结构合理；xterm 与 diff 颜色统一走同一 token 层（`TerminalTab.tsx:25-45`、`DiffTab.tsx:18-19`）。
- **主要文本对比度达标**：亮色 `fg-primary/bg-base` 18.10、`fg-secondary` 9.21、`accent/bg-base` 6.12、`white/accent` 6.12、diff add/remove/change 7.7–7.9；暗色 `fg-primary/bg-base` 18.07、`fg-secondary` 7.83、diff 9.7–10.2、terminal 16 色 7.5–11.0，均过 AA。
- **Dock 尺寸约束集中在类型层**：`types/layout.ts:30-35` 定义 RAIL/SIDEBAR/DOCK/MIN/MAX 常量，`useLayoutState.ts:45-51` 与 `RightDock.tsx:46` 都做了 280–640 夹取。
- **纯浏览器可启动**：store/i18n/theme 的 Tauri invoke 均包在 try/catch 中并有默认值，`useTerminal` 有 web mock 分支（`useTerminal.ts:68-79`），Playwright 环境下应用不会白屏——这是 M2 e2e 能跑起来的前提。
- **基础 a11y 有意识**：Rail 按钮有 `aria-label/title/aria-pressed`（`Rail.tsx:56-59`），Dock 有 `role=tablist/tab/tabpanel` 与 `aria-selected`（`RightDock.tsx:101-140`），focus-visible ring 使用 token（`Rail.tsx:51`）。

## 问题

### Critical

**C1. 四栏布局根本没有生效，工作区被 Rail/Sidebar/RightDock 覆盖**
- 位置：`src/views/Layout.tsx:44-50`（外层 `div` 只有 `absolute inset-0 z-0`，`style` 设了 `gridTemplateColumns` 但没有 `grid`/`display:grid`，内联 grid 列在非 grid 容器上完全无效）；`src/components/Rail.tsx:36`、`src/components/Sidebar.tsx:171,195`、`src/components/RightDock.tsx:63,92` 全部是 `fixed` 定位，脱离文档流；`src/components/ThreadWorkspace.tsx:19-28` 的 `<main>` 没有任何 `margin-left/right`、`padding` 或 grid 区域。
- 问题：四个面板没有共享同一套布局机制——grid 列宽只是装饰，三个侧栏是 fixed 浮层，`<main>` 在绝对定位容器中按块级 100% 宽度铺满。结果 `main`（transcript/composer）左约 288px 被 rail+sidebar 盖住、右 360px 被 dock（`z-40`）盖住；`Layout` 计算出的 `railWidth/sidebarWidth/dockWidth` 只写进无效 style。
- 影响：核心三栏布局错位/内容被遮挡，Task 2 验收"三栏对齐"不成立；这是壳层的主故障（视觉上工作区仅剩中间一条）。
- 修复建议：二选一并保持单一机制：(a) 外层加 `grid`，四个面板改为 `static`/grid item 并删除各自 `fixed` 定位（推荐，匹配计划"CSS Grid 四列系统"）；(b) 保留 fixed 浮层，则 `<main>` 用 `padding-left: rail+sidebar`、`padding-right: dock` 并按折叠状态动态更新，同时去掉无效的 gridTemplateColumns。另补一条布局断言测试/手工验收清单。

**C2. `useLayoutState` 不是共享状态：5 个组件各自持有一份互不相干的 layout state**
- 位置：`src/hooks/useLayoutState.ts:5-17`（每次调用都 `useState(DEFAULT_LAYOUT_STATE)` + 独立 `useStore()` load）；调用点 `src/views/Layout.tsx:11`、`src/components/Rail.tsx:27`、`src/components/Sidebar.tsx:26`、`src/components/RightDock.tsx:33`、`src/hooks/useShortcuts.ts:53`；`src` 中无 `createContext/Provider`。
- 问题：Rail 点击 `setRailView` 只更新 Rail 自己那份 state，Sidebar 读的是它自己的 `railView`，永远不会变；Layout 的 `dockTab/setDockTab` 与 RightDock 的 `dockTab` 也是两份；每个实例各自 `load()/save()` 全量 state，切换一个视图会用其它实例的陈旧快照覆盖存储（例如 dock 宽度被 Rail 实例的默认值写回）。`useLayoutState.ts:61-75` 还在每个实例里注册一份 `keydown`，⌘B/⌘\ 会被 5 个实例+`useShortcuts` 同时处理。
- 影响：rail 切换 sidebar 内容（Task 2 核心验收）不可用；dock tab 记忆、折叠联动全部失效；持久化互相覆盖导致状态回退。
- 修复建议：抽 `LayoutProvider`（context + 单一 store）或改用 zustand/模块级 store，`useLayoutState` 只做订阅；键盘监听只注册一次（提到 provider 或 `useShortcuts`），并加 `isTypingTarget` 守卫。

**C3. `tauri-plugin-store` IPC 调用形状错误，三处持久化（layout/theme/i18n）在 Tauri 下全部静默失败**
- 位置：`src/hooks/useStore.ts:15`（`invoke('plugin:store|get', { key })`）、`:31-32`（`plugin:store|set` / `plugin:store|save`）；`src/hooks/useTheme.ts:26,45-46`；`src/i18n/index.ts:16,31-32`。全仓库无 `plugin:store|load`（`grep` 0 命中）。`routes` 无 store 初始化。
- 问题：锁定版本 `tauri-plugin-store 2.5.0` 的 `get` 需要 `rid: ResourceId`（`lib.rs:126-146`，返回值是 `(Option<JsonValue>, bool)` 二元组），`set`/`save` 同样需要 `rid`（`lib.rs:238-242`），而 `rid` 只能从 `plugin:store|load` 获得。当前调用缺 `rid` → Tauri 命令参数反序列化直接报错；错误被 `catch` 吞掉 → 始终返回 `DEFAULT_LAYOUT_STATE`/系统主题/浏览器语言。即使补上 rid，`get` 返回的是二元组而非字符串，`JSON.parse(stored)`（`useStore.ts:17`、`useTheme.ts:28`、`i18n/index.ts:18`）仍会失败。
- 影响：刷新/重开应用后 rail 选中项、sidebar 宽/折叠、dock tab/宽、主题、语言全部丢失；`tauri.conf.json:36-38` 的 `plugins.store.autoSave` 也不会被触发。Task 2/7 的"刷新保持状态"验收不成立（属核心持久化流程损坏）。
- 修复建议：封装一个 `persist.ts`：启动时 `invoke('plugin:store|load', { path: 'layout.json' })` 拿 rid（resource 释放用 `plugin:store|close`/`removeResource`），之后 get/set/save 都带 `rid`；解析 `get` 返回的 `[value, exists]` 元组；或直接引入 `@tauri-apps/plugin-store` JS 包走官方封装。补 `useStore.test.ts`（mock invoke 校验参数形状）。

**C4. Tauri 运行时检测全部失效：`'__TAURI__' in window` 在本项目恒为 false，Terminal/Preview/Diff/Worktree 全走浏览器分支**
- 位置：`src/hooks/usePreview.ts:16`、`src/hooks/useTerminal.ts:30`、`src/hooks/useWorktree.ts:47,77`、`src/hooks/useDiff.ts:97`；`crates/omp-tauri/tauri.conf.json` 未配置 `app.withGlobalTauri`（Tauri 2 默认 false，见 `app.windows` 段 9-33 行）。
- 问题：`window.__TAURI__` 只在 `withGlobalTauri: true` 时注入；默认配置下真实 Tauri 应用里该判断为 false。因此真机行为是：Terminal 进入 mock（`pid 9999`，`useTerminal.ts:68-79`，不 spawn PTY）、Preview 永远渲染远端 iframe（不是 `PreviewTab.tsx:120-123` 的 Tauri 分支）、Diff 用 npm `diff` 而非 `diff_compute`、Worktree 走 Node `child_process` 路径（浏览器环境直接抛错）。
- 影响：Task 6 验收"Terminal 连本地 shell / Preview 隔离"在真机上无法达成，且 web-mock 掩盖了所有后端契约错误（见 C5），使 e2e 在纯浏览器下"看起来正常"。
- 修复建议：统一用 `@tauri-apps/api/core` 的 `isTauri()`（Tauri 2 提供）或 `'__TAURI_INTERNALS__' in window` 判定，抽到一个 `isTauri.ts` 并全量替换；若要保留 `__TAURI__`，必须在 `tauri.conf.json` 的 `app.withGlobalTauri` 显式置 true（不推荐，扩大攻击面）。

**C5. Terminal 前后端契约断裂，即使修好 C4 也拿不到任何输出**
- 位置：`src/hooks/useTerminal.ts:41-45`（`invoke('pty_spawn', { shell, cols, rows })`）vs `crates/omp-tauri/src/pty.rs:90`（命令签名为 `pty_spawn(app, registry, args: PtySpawnArgs)`，前端必须传 `{ args: { shell, cols, rows } }`，`:72-79`）；`useTerminal.ts:48,52` 监听 `pty://<pid>/data`、`pty://<pid>/exit`，但 `pty.rs:131` 明确"no event channel is needed for PTY output"（输出只进 buffer 等 `pty_read` 轮询），`events.rs` 只有 `omp://event` 单通道（退出只发 `Noise`，`pty.rs:160-168`）；前端 `grep pty_read` = 0 引用。
- 问题：三处契约不一致同时存在——spawn 参数结构错、事件名后端从未 emit、后端提供的 `pty_read` 轮询前端从未调用。任何一处都足以让终端永远空白。
- 影响：Terminal tab 功能 100% 不可用（Task 6 验收失败）；错误会被 `useTerminal.ts:80-82` 捕获成 error state，用户看到"Terminal error"但无输出。
- 修复建议：二选一并对齐后端：① 前端按 `pty.rs:209-219` 实现 `pty_read` 轮询（rAF/`setInterval` 每帧 drain，读到空串退避）；② 后端改为 `emit` `pty://<pid>/data` 事件（需后端 reviewer 确认方向）。同时 spawn 传 `{ args: {...} }`，并用 `pty_read` 返回的 `{pid,data}` 形状解析。补契约测试（前端 mock invoke 断言参数名）。

**C6. Preview 的 IPC 隔离硬约束未实现：没有独立 WebviewWindow，远端页面被直接 iframe 嵌进主 webview，且无任何隔离配置/断言**
- 位置：`src/hooks/usePreview.ts:18-26`（纯 iframe ref 改 `src`）、`src/components/dock/PreviewTab.tsx:125-133`（`<iframe src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals">`）、`PreviewTab.tsx:9`（默认远端 `https://example.com`）；`crates/omp-tauri` 中 `WebviewWindow|add_child|initialization_script|on_navigation|dangerousRemoteDomainIpcAccess` 均 0 命中；`tauri.conf.json:28-30` `csp: null`；全仓库无"预览窗口 `window.__TAURI__` 不存在"的断言/测试。
- 问题：设计 §4/计划 Task 6 的硬约束要求 Preview 走独立 `WebviewWindow`（M2 稳定 API）+ 零 command 注入 + `on_navigation` 仅放行 http(s) + 初始化脚本为空 + CI 断言 `window.__TAURI__` 不存在。当前实现是主窗口内远程 iframe：没有独立窗口、没有导航白名单（`PreviewTab.tsx:12-19` 只做 `https://` 前缀补全，未校验最终 scheme）、没有隔离断言；`sandbox` 同时给 `allow-scripts` 与 `allow-same-origin` 本身也是高风险组合。**主 webview 是否把 IPC 注入子 frame（即 iframe 内能否触达 `window.__TAURI_INTERNALS__.invoke`）需运行时确认**；但无论结论如何，"架构级隔离 + 断言"这一 M2 硬约束均未交付。另外 `withGlobalTauri:false` 下 `window.__TAURI__` 恒不存在，设计里"断言 `__TAURI__` 不存在"在隔离性上既不充分也会假绿。
- 影响：Preview 的安全性只剩 CSP（当前还是 null）与 iframe sandbox 两层，设计要求的隔离边界不存在；攻击面（模型/工具给出的任意 URL）直接放进 app webview。Task 6 验收"Preview 加载 example.com 无 `__TAURI__`"不可信。
- 修复建议：实现 `preview_open`/`preview_navigate` 等 Rust command 创建独立 `WebviewWindow`（`initialization_script` 不注入、`on_navigation` 仅 http/https、不配置 `dangerousRemoteDomainIpcAccess`），主窗只通过 command 单向传地址；在 preview webview 内执行断言（如 Rust 侧 `eval` 检查 `__TAURI_INTERNALS__`/`__TAURI__` 并回报）并入 e2e；至少把当前 iframe 路径标注为 M2 临时降级并加 `sandbox` 收紧（去掉 `allow-same-origin`，若要脚本则接受 opaque origin）。此条建议在 M3 开工 spike 前作为阻塞项。

### Important

**I1. xterm 生命周期错误：每次 render 销毁重建终端、切换 tab 杀 shell、unlisten 泄漏、无 ResizeObserver**
- 位置：`src/components/dock/TerminalTab.tsx:18-83`（`useEffect` 依赖 `[terminal]`，而 `useTerminal()` 每次 render 返回新对象字面量 `useTerminal.ts:136-143` → effect 每次 render 都 cleanup+重建 `new Terminal`）；`TerminalTab.tsx:77-82` cleanup；`useTerminal.ts:85-95` `disconnect` 只 `kill` 不 `unlistenData/unlistenExit`；`useTerminal.ts:129-134` 挂载即 `connect()`（StrictMode 下双执行，`ptyRef` 在 await 期间为空会 spawn 两个 PTY）；`TerminalTab.tsx:85-89` 仅在 `terminal.cols/rows` 变化时 fit，无 `ResizeObserver`（拖 dock 宽度/窗口 resize 不会 refit，xterm 与 PTY 尺寸错位）。
- 影响：`connected/pid` 等任一 state 变化都会重建终端并清空 scrollback；切出 Dock tab（`RightDock.tsx:136-147` 只渲染当前 tab）会卸载 TerminalTab → `disconnect()` kill 掉 shell，切回重开新 shell（用户 shell 状态丢失）；每次 connect 的 `listen` 在 kill 后不注销 → 监听器泄漏。
- 修复建议：effect 依赖改为 `[]`（hook 返回的函数用 ref 稳定化）；xterm 只创建一次，theme/尺寸变化走更新而非重建；用 `ResizeObserver` + `fitAddon.fit()` 并 `pty_resize`；`disconnect`/unmount 中 `unlistenData/unlistenExit`；多 shell 使用"每个 tab 一个持久 PTY + 隐藏而非卸载"（或至少把 PTY 生命周期提到 dock 层）。

**I2. 拖拽手柄不可用/不可键盘操作，且拖拽期间逐像素写 store**
- 位置：`src/components/Sidebar.tsx:205-228`（手柄是 flex-col 的最后一个子元素，只有 `w-1`、`minWidth/maxWidth`，**没有高度** → 实际 0 高不可点击；`role="separator" tabIndex={0}` 但无 `onKeyDown`；`mousemove/mouseup` 监听无 unmount 清理）；`src/components/RightDock.tsx:150-160`（手柄放在 flex-col 末尾而非左缘，`w-1 h-full` 布局语义错误，同样无键盘处理）；`RightDock.tsx:43-57` + `useLayoutState.ts:45-51`（每次 mousemove `setDockWidth` → `persist` → 立即 `plugin:store|set`+`save`，无 debounce）。
- 影响：Sidebar 无法用鼠标调整宽度（手柄不可见）；两个 `role="separator"` 对键盘用户完全无效（WCAG 2.1.1）；拖动 dock 每像素一次 IPC 写存储，与 C2 的多实例覆盖叠加会放大写入竞态。
- 修复建议：手柄绝对定位到面板边缘（dock: `absolute left-0 inset-y-0 w-1`；sidebar: `h-full w-1`），加 `onKeyDown` 处理 ←/→（±8px，Home/End 到 min/max，`aria-valuenow/min/max`），pointer capture + 卸载清理；拖拽期间只改本地 state，`mouseup` 后（或 150–200ms debounce）再落盘。

**I3. "每个 thread 记住自己的 dock tab"未实现，且切 tab 会丢 Preview URL / Terminal 会话**
- 位置：`src/hooks/useLayoutState.ts:40-43`（`dockTab` 是全局单值，`LayoutState` 无 sessionId 维度，`types/layout.ts:5-12`）；`src/components/RightDock.tsx:136-148` 只渲染当前 tab；`src/components/dock/PreviewTab.tsx:9` URL 是组件内 `useState` 初值 `https://example.com`。
- 影响：设计 §2/§4 明确"每个 thread 记住自己的 dock tab"，当前切换会话会继承上一个 thread 的 tab；切换 tab 后 Preview 回到 example.com、Terminal 被 kill（见 I1），dock 的"记忆"只剩 tab id 且无法按 thread 恢复。
- 修复建议：`LayoutState` 增加 `dockTabBySession: Record<string, DockTab>`（或独立 `sessionLayout`），由当前 `sessionId` 读写；Preview URL、Terminal 会话按 session 存放；tab 内容用 `display:none` 保留而非卸载（配合 I1）。

**I4. 窗口尺寸/位置持久化未实现（计划 Task 2 明确要求）**
- 位置：计划 `docs/superpowers/plans/2026-11-01-m2-agent-tasks.md:101` 要求持久化 "window size/position"；`src` 中 `innerSize|outerPosition|setSize|onResized` = 0 引用，`crates/omp-tauri` 无 window-state 逻辑/插件。
- 影响：重启后窗口回到 `tauri.conf.json:15-18` 的 1400×900 并居中，用户调整的窗口几何丢失；Task 2 验收缺口。
- 修复建议：引入 `tauri-plugin-window-state`（Rust 侧注册即可）或前端在 `onResized/onMoved` 后写入 store；与 C3 的 store 修复一起做。

**I5. Dock tab 数量/editor tab 与设计不符；自动切换在 render 阶段 setState 且不生效；editor 保存/取消是空实现**
- 位置：`src/components/RightDock.tsx:9-15`（常驻 5 个 tab，含 `editor`；设计 §2/§4 为 4 tab + editor 协议请求"按需插入"）；`src/views/Layout.tsx:38-41`（在 render 期间调用 `setDockTab`——React 渲染阶段副作用/告警；且因 C2 只改 Layout 自己的实例，`RightDock` 的 tab 不会切换）；`Layout.tsx:18-28`（`handleEditorSave/Cancel/Change` 全是空函数 + 注释"Handled by ..."）；`src/components/dock/DockTabs.tsx:45-50`（`defaultValue={editorValue}` 非受控，后续 editor 请求文本变化不更新）。
- 影响：editor tab 永远存在（空 tab 占位），协议 `editor` 请求到达时不会自动打开；点 Save/Cancel 不回传 `set_editor_text`/响应，请求只能等 30s 超时被 cancelled（依赖 `useApproval` 的定时器）；`defaultValue` 导致多请求串文本。
- 修复建议：`editor` tab 按 `pendingRequests` 动态插入并在请求结束时移除；自动切换放进 `useEffect`（并落到共享 layout state）；实现 Save→`respond(id, {text})`、Cancel→`respond(id, cancelled)`；textarea 改受控。

**I6. i18n：多处用户可见文案硬编码；语言切换/主题切换在 UI 上完全不可达**
- 位置（硬编码）：`src/views/Layout.tsx:33` "Loading layout..."；`src/main.tsx:21` "Loading theme..."；`src/components/ThreadWorkspace.tsx:27` `aria-label="Thread workspace"`；`src/components/dock/DockTabs.tsx:43,47,56,62`（"Editor"/"Editor content"/"Cancel"/"Save"）；`src/components/dock/DiffTab.tsx:55,59,120`（"added, removed"/"lines hidden"/"hunks"）；`src/components/Sidebar.tsx:225` `aria-label="Resize sidebar"`；`Sidebar.tsx:18-22` mock 会话标题。切换入口：`changeLanguage`（`i18n/index.ts:56-60`）与 `useTheme().setTheme`（`useTheme.ts:52-61`）全仓库**无调用点**（`grep` 只有定义），Settings sidebar 只是无行为的按钮（`Sidebar.tsx:102-121`）。
- 影响：设计 §6 要求"无硬编码文案"、"设置可覆盖 light/dark/system"；当前语言、主题在 UI 上无法切换（只能手改 `data-theme` 或浏览器语言），Task 7 验收不成立；中英混排会出现在同一界面。
- 修复建议：补齐剩余 `t()` key（含 aria-label/空态/编辑器按钮）；在 Settings 视图实现 Appearance/Language 两组控件，接 `setTheme`/`changeLanguage` 并在两处都 await 持久化；把 `tokens.css:12` 注释引用的 `docs/contrast-report.md` 一并补上。

**I7. WCAG 对比度存在失败项（暗色 accent 系、亮色 muted on hover、暗色 surface/border 边界）**
- 位置：`src/tokens.css:116-119`（dark `--accent`/`--accent-muted`）、`:22-24`（light `--fg-muted`）、`:106-109`（dark surface ramp）、`:121-122`（dark border）；使用点：`Rail.tsx:52-54`（激活项 `bg-accent-muted text-accent`）、`RightDock.tsx:109-111`（激活 tab `bg-accent/10 text-accent`）、`tokens.css:271-273`（`a { color: var(--accent) }`）、`DiffTab.tsx:54,58-59`（`text-fg-muted` on `bg-hover`）。
- 计算值（OKLCH→sRGB，WCAG 2.x）：暗色 `accent` on `bg-base` **4.24**（<4.5）；`accent` on `accent-muted` **3.27**；dock 激活 tab 实际叠加色上 **3.94**；亮色 `fg-muted` on `bg-hover` **4.45**；暗色 surface 层 `bg-elevated/bg-base` **1.01**、`bg-hover/bg-base` **1.03**、`--border` 对 `bg-elevated` **1.14**（WCAG 1.4.11 要求 UI 组件边界 ≥3:1，输入框/地址栏边框、面板细分全靠 border）。
- 影响：暗色主题下激活态/链接/侧栏激活项文字不达 AA；暗色下面板层次几乎不可辨（elevated/base 仅 1% 亮度差）；Task 7 "better-colors 验证 AA"未达成。
- 修复建议：暗色把 accent 提亮到 ≥4.5 对 base（约 L 0.62–0.65），或激活文字改用 `--fg-primary`；亮色 `--fg-muted` 降到 L≈0.53 或仅用于非 hover 背景；暗色 surface 把 elevated/hover 拉开（例如 0.10/0.16），border 提到 ≥3:1（对输入类控件至少 `--border-strong`）；产出 `docs/contrast-report.md` 并在 CI 加对比度断言脚本。

**I8. 测试缺口与失效的 e2e 断言**
- 位置：仅 `src/hooks/useTheme.test.ts`；`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md:324-334` 的 Task 2/6/7 验收依赖 e2e/单测；`package.json:12` `"e2e": "playwright test scripts/e2e_smoke.ts"` 但实际文件是 `scripts/e2e_smoke.spec.ts`（脚本指向不存在文件）；`scripts/e2e_smoke.spec.ts:101` 用 `[data-testid="sidebar"]`，而 `src/components/Sidebar.tsx` 没有该属性（该断言被 `if` 静默跳过，⌘B 实际未测）；`:143-150` 的 i18n 断言检查 `window.i18n` 或 `[data-i18n]`，两者均不存在（`i18n/index.ts` 未挂 window，组件无 data-i18n）→ 测试必失败；`:120-141` 的主题测试只是手动改 `data-theme`，未覆盖 `useTheme`。
- 影响：M2 的壳层/持久化/主题/i18n 没有任何自动化回归；e2e 命令本身不可执行，Task 7 验收"workspace 全测试绿 + e2e"不成立。
- 修复建议：补 `useLayoutState`/`useStore`（断言 IPC 参数形状）/`usePreview`/`useTerminal`（mock invoke/listen，断言 spawn args 与 pty_read）单测；修正 e2e 脚本路径、给 Sidebar 加 `data-testid="sidebar"`、i18n 断言改为检查实际渲染文案（中英切换后 `textContent` 变化），并加"Preview webview 无 Tauri 符号"的隔离断言。

**I9. Preview 交互大量死代码：后退/前进恒禁用、loading/error 状态永不成立、导航无 scheme 白名单**
- 位置：`src/hooks/usePreview.ts:18-44`（`canGoBack/canGoForward` 初始 false 后再无更新 → `PreviewTab.tsx:40,54` 两个按钮永远 disabled；`navigate` 里 `loading` 立即被置 false（`:22`）、`error` 无任何 setter（state 初值后不再写）；`goBack/goForward` 对跨域 iframe 的 `contentWindow.history` 访问可能抛 SecurityError（因按钮禁用暂未触发，需运行时确认））；`PreviewTab.tsx:12-19`（只做前缀补全，未校验最终 URL scheme/host；`:106` 外部按钮用 `window.open` 而非 `tauri-plugin-opener`，Tauri 下行为需运行时确认）。
- 影响：预览地址栏/刷新/外部按钮可用，但 loading/error 覆盖层是死 UI，后退/前进永远不可用；导航约束没有实现为可验证的白名单（URL 规范化也不完整，如大小写/协议相对 URL）。
- 修复建议：用 iframe `onLoad` 驱动 loading、`onerror`/超时驱动 error；跨域 iframe 无法读 history → 自己维护历史栈（数组 + index）；导航前 `new URL()` 校验 `protocol ∈ {http:,https:}` 后拒绝其它；外部打开改用 `@tauri-apps/plugin-opener`（若采用）。

**I10. Diff 的"hunk 虚拟化"是假实现，且 Diff tab 永远为空态**
- 位置：`src/hooks/useDiff.ts:139-146`（`if (hunks.length <= 100) return hunks; return hunks`——两分支完全相同，`VIRTUALIZATION_THRESHOLD` 无作用）；`src/components/dock/DiffTab.tsx:180`（只 `slice(0, 50)` 渲染，超出部分只显示"还有 N 个 hunk"，无滚动加载）；`computeDiff`（`useDiff.ts:91`）全仓库**无调用者** → `hunks` 永远空，`DiffTab.tsx:170` 空态恒显示；`diff2html` 在 `package.json` 依赖但 `grep` 0 引用（自渲允许，但装了不用）；`DiffTab.tsx:23` ``bg-${bgColor}`` 会生成 `bg-var(--diff-add-bg)` 这类无效 Tailwind 类（内联 style 兜底，属噪声）。
- 影响：Task 6 允许 Diff 为 stub/空态，但"虚拟化 stub"实际是 `return` 原数组 + 50 条截断的假象，后续接真实 diff 时会误导性能评估；`DiffTab` 无法被任何路径填充数据。
- 修复建议：明确标注 stub（或删除 `VIRTUALIZATION_THRESHOLD` 死分支），用 `@tanstack/react-virtual`（已依赖）实现 hunk 级虚拟化；接 `<file>`/`tool_execution` 事件调用 `computeDiff`；删除 `bg-${}` 动态类；`diff2html` 要么用要么从依赖移除。

**I11. Worktree tab 是"永远空态"的假 stub：未传 repoPath，所有操作静默 no-op；删除无确认；浏览器路径引入 Node 模块；invoke 参数形状与后端 struct 不符**
- 位置：`src/components/dock/WorktreeTab.tsx:241` `useWorktree()` 未传 `repoPath`；`src/hooks/useWorktree.ts:80,102,125,147` 全部 `if (!repoPath) return` → refresh/create/remove/prune 静默返回，`loading/error` 永远 false/null，UI 恒显示 `WorktreeTab.tsx:340-353` 的空态；`WorktreeTab.tsx:96-103` 删除按钮无确认弹窗（设计 §4 要求"删除带确认"，且会 `git worktree remove` 落盘操作）；`useWorktree.ts:46-67` 在浏览器分支 `await import('child_process')`（Vite 下会被 externalize，纯浏览器一旦走到即报错）；`useWorktree.ts:89,109,132,154` 以扁平 `{repoPath,...}` invoke，而后端 `commands.rs:282-326` 的命令取单个 `args: WorktreeArgs/CreateWorktreeArgs/RemoveWorktreeArgs`。
- 影响：Task 6 允许 Worktree 为 stub（空态），但当前 UI 的刷新/新建/删除全部"看起来成功实则无动作"，删除也没有确认与失败反馈；接真实实现时会同时踩参数形状与 Node 模块两个坑。
- 修复建议：M2 内至少让 stub 显式（禁用按钮 + "M2 未接线"提示）或从 `App` 传入项目路径；删除加确认对话框并检查 `error`；移除 `child_process` 分支（浏览器无法执行 git）；invoke 改为 `{ args: { repoPath,... } }` 或把后端命令改成扁平参数（与后端 reviewer 对齐，`pty_spawn` 同问题）。

### Minor

**M1. Rail/Sidebar 的 ARIA 语义错误**：`Rail.tsx:39` 与 `Sidebar.tsx:175,199` 把导航区 `aria-label` 设为 `t('rail.sessions')`（"Sessions"）；`Rail.tsx:58` 在 `role="toolbar"` 内用 `role="tab"` 且无 `tablist/aria-controls`。建议：nav 用"Main navigation"，容器与子项角色统一（`tablist`+`tab`+`aria-controls`，或全部普通 button + `aria-current`）。

**M2. Dock tablist 键盘/ARIA 不完整**：`RightDock.tsx:101-140` 无 roving tabindex 与 ←/→ 键导航；`aria-controls`（`:115`）对未激活 tab 指向不存在的 panel id（只有当前 panel 渲染）。建议加方向键切换与统一渲染所有 panel（`hidden`）。

**M3. Dock tab 图标语义错误且 meta 重复**：`RightDock.tsx:9-15` 用 `Maximize2` 表示 Preview、`Minimize2` 表示 Terminal、`X` 表示 Diff、`ChevronRight` 表示 Worktree（均为占位错配）；`DockTabs.tsx:22-28` 的 `DOCK_TAB_META` 有正确图标名但无人使用，两份定义已漂移。建议统一从 meta 渲染（`GitCompare/FolderGit2/Edit3`），删除重复表。

**M4. 无效 Tailwind 类与交互细节**：`RightDock.tsx:65,94` `transition-width` 不是 Tailwind 类（应为 `transition-[width]`）；`Sidebar.tsx:183` 折叠态用 `ChevronLeft` 表示"展开"方向相反；展开态没有折叠按钮（只能 ⌘B，可发现性差）；`RightDock.tsx:46` 的 280/640 魔法数与 `types/layout.ts:34-35` 常量重复（应引用常量）；无窄窗策略（最小窗口 1000px 时 rail+sidebar+dock 占 648px，主区 <360px，无自动折叠）。

**M5. xterm 主题与依赖版本（需运行时确认）**：`TerminalTab.tsx:25-45` 把 `var(--*)` 字符串直接塞进 xterm `theme`——xterm 内部颜色解析/最小对比度计算可能无法解析 CSS 变量；主题切换时不会重建或 `options.theme=` 更新终端，暗/亮切换后终端配色是否跟随需运行时确认。另 `xterm@5.3`（旧包名）与 `@xterm/addon-fit@0.11`（面向 `@xterm/xterm` 5.5）混用，建议统一到 `@xterm/xterm`。

**M6. token 命名与设计 §6 不一致/缺项**：设计要求的 `--bg-raised`、`--bg-overlay`、`--diff-add/-del/-warn/-error` 均不存在（现有 `--bg-elevated`、`--diff-add-bg/-fg`、`--diff-remove-*`、`--diff-change-*`、`--fg-warning`、`--fg-danger`）。功能等价但未对齐设计契约（且计划把 `tokens.css` 变量名列为共享契约，`m2-agent-tasks.md:309`），会阻碍后续 Task 统一引用。建议在 adapt 前重命名或加别名映射。

**M7. i18n 初始化细节**：`i18n/index.ts:49-52` 传了 `detection: {order: [], caches: []}` 但项目并未安装 `i18next-browser-languagedetector`，该配置是死配置；`main.tsx:11-13` 不 await `initI18n()`，组件可能在 init 前渲染出裸 key（react-i18next 在 init 的 `languageChanged` 后会重渲染，闪现长度需运行时确认），且 init 失败只 `console.error` 无降级 UI。建议移除 detection 配置或安装 detector，并把 i18n 也纳入 `ThemeInitializer` 式门控（或 `await init` 后再 `createRoot`）。

**M8. 状态/常量冗余**：`Layout.tsx:11` 让 Layout 读 `railWidth/sidebarWidth/dockWidth` 仅为写无效 style；`types/layout.ts:33` `DOCK_WIDTH`、`useLayoutState.ts:81` `workspaceFlex` 无消费者；`Sidebar.tsx:18-22` mock 会话标题硬编码英文（用户可见，需换成 fixture 或 t()); `Layout.tsx:18-28` 三个空 handler 增加维护噪声。

## 与 M2 计划/设计的偏差

| # | 设计/计划要求 | 出处 | 现状 | 判定 |
|---|---|---|---|---|
| D1 | 默认窗口 1280×800，最小 960×600 | spec §2 | `tauri.conf.json:15-18` 为 1400×900 / 1000×650 | 未实现，需改配置（并与布局最小宽度验证一起验收） |
| D2 | Rail 48px，7 图标：新建对话/搜索/项目/自动化/Skills/Review 队列/设置；Review 未处理 badge | spec §2, plan Task 2 | `Rail.tsx:15-23` 为 sessions/worktrees/agents/tools/settings/help/debug；无 badge | 未实现（壳层导航语义整体偏移） |
| D3 | Sidebar 240px，随 rail 切换视图：项目/搜索/自动化/Skills/Review | spec §2, plan Task 2 | `Sidebar.tsx:30-161` 视图集合与 D2 一致偏移，且为 mock 空态；rail 切换因 C2 实际不联动 | 未实现 |
| D4 | 每个 thread 记住自己的 dock tab | spec §2/§4 | `useLayoutState.ts:40-43` 全局单值 | 未实现（I3） |
| D5 | 持久化 rail/sidebar/dock + **window size/position** | plan Task 2:101 | layout/theme/i18n store 调用形状错误（C3）；window 尺寸无任何实现（I4） | 未实现 |
| D6 | Dock 四 tab（Preview/Terminal/Diff/Worktree）+ editor 按需插入 | spec §4 | 常驻 5 个 tab（`RightDock.tsx:9-15`）；editor 不按需、保存无回传（I5） | 偏差 |
| D7 | Preview 主路径独立 `WebviewWindow`；IPC 隔离硬约束 + `__TAURI__` 不存在断言 | spec §4/§9, plan Task 6:229 | iframe 内嵌主 webview，零隔离配置/断言（C6） | **严重偏差（阻塞项）** |
| D8 | Terminal：command 开 PTY、event 推 output、command 收 input；多 tab 多 shell；cwd=项目目录 | spec §4, plan Task 6:230 | 后端实现为 `pty_read` 轮询（pty.rs:131），前端监听不存在的事件、不轮询、不带 cwd、spawn 参数形状错（C5）；单实例、切 tab 即 kill（I1） | 未实现且前后端方向不一致 |
| D9 | Diff：文件列表 + hunk 虚拟化（diff2html 或自渲）；外部编辑器打开 | plan Task 6:231 | 无数据源调用、假虚拟化、diff2html 未用、无外部编辑器入口（I10）；M2 允许 stub | 允许 stub，但需标注并清理死代码 |
| D10 | Worktree：列表/创建表单/checkout/删除确认；复用 git | plan Task 6:232 | 无 repoPath → 全 no-op；删除无确认；Node `child_process`；invoke 形状错（I11）；M2 允许 stub | 允许 stub，但当前 UI 会误导 |
| D11 | i18n 无硬编码文案；主题设置可覆盖 light/dark/system | spec §6, plan Task 7:259-262 | 硬编码 8 处 + 无切换 UI（I6）；主题 hook 存在但无入口（I6） | 未实现 |
| D12 | better-colors 验证 token 对比度 AA + 对比度报告产物 | spec §9, plan Task 7:262,270 | 无报告（`tokens.css:12` 引用的 `docs/contrast-report.md` 不存在）；暗色 accent 系 3.27–4.24、surface 1.01–1.14（I7） | 未达成 |
| D13 | `npm run e2e`（Playwright smoke，启动 Tauri→omp→断言事件序列）；workspace 全测试绿 | plan Task 7:255,263-268 | e2e 脚本路径错、断言引用不存在选择器/全局；单测仅 useTheme（I8） | 未达成（verifier 会覆盖门禁，但断言本身已失效） |
| D14 | 快捷键 ⌘1–9 跳 thread、⌘K 命令面板、⌘⌥A 下一个待审批、⌃⇧M 模型选择器 | spec §6, plan Task 7:261 | **跨模块备注**：`useShortcuts.ts:71-136` 中 ⌘1–7 切 rail、⌃⇧M 切 sessions、⌘⌥A 切 agents、⌘K 聚焦 composer；与设计语义不符（快捷键归 Task 7，供 Lead 汇总） | 偏差（非本报告结论主项） |

## 结论

**FAIL**。

壳层（M2 的核心交付）在四个维度上不可用：布局机制自相矛盾导致工作区被侧栏覆盖（C1）；layout 状态未共享导致 rail/sidebar/dock 联动失效（C2）；`tauri-plugin-store` 调用形状错误导致布局/主题/i18n 三处持久化在真机全部静默失败（C3）；`isTauri` 检测与 PTY 契约双重断裂导致 Terminal 功能为假、Preview 的 IPC 隔离硬约束未实现（C4/C5/C6）。这些均属"核心布局/持久化流程损坏"与"Preview 隔离缺失"，按审查规则判 Critical，因此不给 PASS WITH FIXES。

M2 允许的 stub 只有 Diff 空态、Worktree 空态、Preview 的 WebviewWindow 改造（计划 Task 6 明示）；除此之外，建议把 C1–C6 作为 M2 收口阻塞项，Important 项（尤其 I1/I2/I6/I7/I8）在 M3 开工前修完。修复优先级建议：

1. C1（布局改用真正 grid / 或 main 偏移）→ C2（LayoutProvider 单实例 + 单次键盘注册）。
2. C3（`plugin:store|load` 拿 rid 的持久化封装，含 layout/theme/i18n）+ I4（窗口几何）。
3. C4（统一 `isTauri()` 判定）+ C5（PTY 契约对齐：轮询 `pty_read` 或后端 emit）。
4. C6（Preview 独立 WebviewWindow + 隔离断言）——建议与 M3 `add_child` spike 合并为安全门。
5. I6/I7/I8（i18n 入口与硬编码、对比度、测试/e2e 断言）。
