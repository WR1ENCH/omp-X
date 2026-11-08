# M2 验收报告（verification lead）

- 项目：omp-X（`/home/wr1ench/omp-X`），审查对象：M2 计划 Tasks 1–7
- 计划：`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md`；设计：`docs/superpowers/specs/2026-11-01-omp-x-frontend-design.md` §7/§9
- 基线：`e39f845`（M2 base commit）；HEAD：`c90759a`
- 方式：只读源码；所有命令从仓库根执行，原始日志保存在 `target/verify/`（已被 `/target` 忽略）；未修改任何源码/配置；验证结束后无残留 vite/chromium/playwright 进程
- 执行时间：2026-11-07 23:33–23:52 (+08:00)

---

## 环境与限制

| 项 | 值 | 说明 |
|---|---|---|
| OS | Kali Linux 2026.2.0 x86_64（gnome on wayland，`DISPLAY=:0`） | 有显示，但 Tauri 窗口无法构建 |
| rustc / cargo | 1.96.0（workspace 要求 rust-version 1.90） | 满足 |
| node / npm | 24.16.0 / 11.16.0 | 满足 |
| omp | `~/.local/bin/omp`，`omp/18.4.3` | 真实二进制存在 |
| chromium | `/usr/bin/chromium` | 可用；Playwright 自带浏览器未安装（`~/.cache/ms-playwright` 为空） |
| pkg-config | 2.5.1 | `pkg-config --list-all` 中无 glib/webkit/gtk 项 |
| 运行库 | `libglib-2.0.so.0`、`libgtk-3.so.0`、`libwebkit2gtk-4.1.so.0` 均在 | 仅有运行时 `.so`，**无开发用 `.pc` 文件** |
| Tauri CLI | `@tauri-apps/cli` 2.12.4 / tauri 2.12.5 | `npx tauri info` 报 `webkit2gtk-4.1: not installed`、`rsvg2: not installed` |
| Playwright | 1.65.0 | 无 bundled browser；`playwright test` 会去找 `chromium_headless_shell-1254` |

结论：**`omp-tauri`/`omp-gui` 的 GUI 链路在本沙箱不可构建**（缺 glib-2.0/gdk-3.0/webkit2gtk-4.1 的 pkg-config 开发文件），属环境限制而非代码编译错误。`target/debug/deps` 里有 22:31 左右成功编译过的 `libglib/libgdk/libgtk` 缓存痕迹，但当前环境无法复现该构建（`PKG_CONFIG_PATH` 不可用）；本报告不依赖该缓存。

---

## 门禁结果

| # | 命令 | 结果 | 证据（关键输出） |
|---|---|---|---|
| 1 | `cargo test -p omp-protocol -p omp-host -p omp-gui` | **PASS（有水分）** EXIT=0 | 21 passed / 0 failed：omp_host lib 6、framing 8、session 2、omp_protocol inbound 5、omp_gui 0。但 session 的 2 个用例在未装 shim 时是**静默跳过**（见下） |
| 1b | 追加：`FAKE_OMP_FIXTURE=... PATH=$PWD/.test-shim:$PATH cargo test -p omp-host --test session -- --nocapture` | PASS EXIT=0 | 2 passed / 0.14s，说明用例逻辑本身有效，但标准门禁命令下它们不做真实断言 |
| 2 | `cargo test --workspace` | **FAIL（环境性）** EXIT=101 | `glib-sys v0.18.1`/`gdk-sys v0.18.2`/`gio-sys`/`gobject-sys` build script 失败：`Package 'glib-2.0' not found`、`gdk-3.0`、`gio-2.0`、`gobject-2.0` 全部缺 `.pc` |
| 2b | `cargo check -p omp-tauri` | FAIL（环境性）EXIT=101 | 同上，`pkg-config exited with status code 1`（`gdk-3.0 >= 3.22`） |
| 3 | `npm test` | **PASS** EXIT=0 | `Test Files 1 passed (1)`，`Tests 2 passed (2)`，仅 `src/hooks/useTheme.test.ts`；有 `act(...)` 警告 |
| 4 | `npm run build` | **FAIL** EXIT=1 | `tsc` 通过；`vite build` 转换 2040 modules 后：`ENOENT: no such file or directory, mkdir '/home/wr1ench/crates'` |
| 5 | `npm run lint` | **FAIL** EXIT=1 | `✖ 24 problems (21 errors, 3 warnings)`，分布见下表 |
| 6 | `npm run e2e` | **FAIL** EXIT=1 | `Error: No tests found.`（脚本路径 `scripts/e2e_smoke.ts` 不存在） |
| 6b | `npx playwright test scripts/e2e_smoke.spec.ts` | **FAIL** EXIT=1 | 1 failed / 3 did not run：`Executable doesn't exist at ~/.cache/ms-playwright/chromium_headless_shell-1254/...` |
| 6c | 用系统 Chromium 直接复现 spec 行为（`target/verify/probe*.mjs`） | **FAIL（逻辑上不可能通过）** | `hasTauri=false`；Ctrl+K 可聚焦 composer，但 Esc **不 blur**；Enter 发送后 `[data-role=assistant]` 数量 0；`window.i18n` 不存在、`[data-i18n]` 数量 0 |
| 7 | `npx tauri info` | EXIT=0（信息） | `webkit2gtk-4.1: not installed`、`rsvg2: not installed`、`frontendDist: ../../../src` |
| 7b | `npx tauri build --debug` | **FAIL** EXIT=1 | `beforeBuildCommand npm run build failed with exit code 1`（先撞 Gate 4 的 outDir 问题） |
| 8 | git/仓库卫生 | **FAIL** | 见「进程/仓库卫生问题」：Tasks 4–7 无提交，`.gitignore` 仅 `/target`，大量未跟踪产物 |

### Gate 1 细节：session 用例是"假绿"

`crates/omp-host/tests/session.rs` 在 `FAKE_OMP_FIXTURE` 未设置时直接 `return`（`tests/session.rs:28-30`、`66-68`），cargo 仍报 `test ... ok`：

```
skipping: fixture shim not installed (run scripts/test-setup.sh)
test fixture_round_produces_ready_then_session_settled ... ok
test prompt_round_trips_through_the_child ... ok
test result: ok. 2 passed; 0 failed; ... finished in 0.00s
```

即门禁命令 1 的 21 个"通过"里，2 个是空跑；真实断言需 `scripts/test-setup.sh`（该脚本与 `.test-shim/omp`、`crates/omp-host/tests/fixtures/` 均未提交）。

### Gate 4 根因与正确配置

- 根因：`vite.config.ts:20` `outDir: '../crates/omp-tauri/src'` 相对 **Vite project root（仓库根）** 解析 → `/home/wr1ench/crates/omp-tauri/src`（仓库外）；`emptyOutDir: true` 若目标存在还会清空目录。
- 连带问题：`crates/omp-tauri/tauri.conf.json` 的 `frontendDist: "../../../src"` 相对配置文件解析 → `/home/wr1ench/src`（既非仓库内也非构建输出）；**无 `build.devUrl`**（`npm run tauri dev` 无法连 Vite）；`bundle.icon` 指向 `crates/omp-tauri/icons/`，该目录不存在。
- 正确方向（仅建议，未修改）：构建产物统一到仓库根 `dist/`（Vite `outDir: 'dist'`），`tauri.conf.json` 改 `"frontendDist": "../../dist"`、新增 `"devUrl": "http://localhost:1420"`，并补 icons 或去掉无效 icon 项。

### Gate 5 明细（21 errors / 3 warnings）

`npx eslint src -f json` 汇总：

| 文件 | E | W | 规则 |
|---|---|---|---|
| `src/components/dock/PreviewTab.tsx` | 6 | 1 | react-hooks/refs ×5、react-hooks/immutability ×1、exhaustive-deps ×1 |
| `src/components/dock/TerminalTab.tsx` | 4 | 0 | react-hooks/refs ×4 |
| `src/hooks/useTranscript.ts` | 4 | 0 | react-hooks/refs ×4 |
| `src/hooks/useShortcuts.ts` | 3 | 0 | react-hooks/refs、set-state-in-effect、no-extra-semi |
| `src/components/composer/SlashMenu.tsx` | 1 | 0 | react-hooks/set-state-in-effect |
| `src/components/dock/DockTabs.tsx` | 1 | 0 | @typescript-eslint/no-empty-object-type |
| `src/components/transcript/Transcript.tsx` | 1 | 0 | no-case-declarations |
| `src/hooks/usePreview.ts` | 1 | 0 | no-self-assign |
| `src/hooks/useApproval.ts` | 0 | 1 | exhaustive-deps |
| `src/hooks/useVirtualScroll.ts` | 0 | 1 | react-hooks/incompatible-library |
| **合计** | **21** | **3** | |

### Gate 6 细节：e2e 为什么不可能通过

1. **路径不匹配**：`package.json` `"e2e": "playwright test scripts/e2e_smoke.ts"`，实际文件是 `scripts/e2e_smoke.spec.ts`（计划文里也写的 `.ts`）。`npx playwright test --list` 能列出 4 个用例（`e2e_smoke.spec.ts:65/90/115/145`），但 `npm run e2e` 报 `No tests found`。另：`playwright.config.ts` 有**重复的 `use` 键**（后写覆盖前写），`tsconfig.json` `include: ["src"]` 不检查该配置。
2. **浏览器缺失**：直接跑 spec 时 Playwright 去找 bundled `chromium_headless_shell-1254`，未安装；项目虽在 `use.executablePath` 指定 `/usr/bin/chromium`，实际启动仍未使用它。
3. **即使浏览器可用也过不了**：spec 用普通 Chromium 打开 `http://localhost:1420`，该页面**没有 Tauri IPC**（`__TAURI__` 不存在），且 spec 里 `spawn('omp', ...)` 启动的进程与页面之间**没有任何连接**；应用侧也从未调用 `spawn_session`（全仓库 `src/` 无此调用，见 Task 1/7 矩阵）。
4. 逐断言复现（系统 Chromium，`target/verify/probe.mjs` / `probe3.mjs`）：
   - `textarea[placeholder*="message"]` 存在（`"Type your message..."`），Ctrl+K 聚焦成功；
   - Esc 后 `document.activeElement` 仍是 TEXTAREA（`useShortcuts.ts:161` 的 `isTypingTarget` 直接 return）→ spec 的 `not.toBeFocused()` 必失败；
   - 发送后 `[data-role="assistant"]` = 0 → `protocol event sequence` 必失败；
   - `window.i18n` false、`[data-i18n]` = 0 → `language switching` 必失败；
   - `[data-testid="sidebar"]` = 0（该断言被 `if` 跳过，属测试自身规避）；
   - 仅 `theme switching` 可能"通过"（它只手动改 `data-theme` 再断言，不验证应用逻辑）。

---

## M2 任务符合度矩阵

| Task | 计划验收 | 结论 | 核心证据 |
|---|---|---|---|
| 1 | crate 脚手架 + tauri.conf + Vite/React 入口；`cargo check -p omp-tauri`；窗口显示 "omp-X M2" | **PARTIAL** | 文件齐全且已提交（`12ef948`，但**与 Task 2 合并为同一提交**）；`cargo check -p omp-tauri` 环境性失败；`npm run dev` 可起（HTTP 200）但界面无 "omp-X M2"（全仓库 grep 无该字符串，`index.html`/窗口标题为 `omp-X`）；`tauri.conf.json` 无 `devUrl`、`frontendDist` 解析到仓库外、icons 缺失 |
| 2 | 三栏布局 + 持久化 + 折叠/拖拽 | **PARTIAL** | 文件齐全（`12ef948`）；Rail/Sidebar/RightDock 渲染（截图 `target/verify/page-layout-full.png`）；Ctrl+B 折叠有效（240→48）；dock tab 可切换。**但**：`Layout.tsx:46-48` 外层容器只有 `gridTemplateColumns` 样式、**没有 `display:grid`** → 计算样式 `display:block`，`main` 高仅 78px、composer 矩形 y=13 与 Sidebar 标题重叠；`useLayoutState` 是纯局部 `useState`（无 context/store），Rail 点击 **不切换 Sidebar 内容**（probe：点击 worktrees 后 Sidebar 仍显示 Sessions）；`tauri-plugin-store` 持久化在无 Tauri 环境不可验证；`useLayoutState`/`useShortcuts` 各自向 window 注册同类快捷键，存在重复监听 |
| 3 | 虚拟滚动/流式/吸附；fixture 回放 DOM<2000、内存<300MB；`scripts/transcript_smoke.ts` | **FAIL** | 8 个实现文件齐全且已提交（`c90759a`），`@tanstack/virtual`、rAF 16ms 合并、24px 迟滞都在；但浏览器加载后**空闲状态即产生 189 条 React `Maximum update depth exceeded`**（`Transcript.tsx:33` 的 effect + `useVirtualScroll` 每次渲染重建的 `scrollToBottom`/`onScrollToBottom` 形成更新环）；`scripts/transcript_smoke.ts` 不存在；`fixtures/` 只有 `clean_round.jsonl`，无 5000 消息 fixture；DOM<2000 / <300MB 无任何测量证据 |
| 4 | Composer/模型选择器/Slash/附件/排队态/Stop | **PARTIAL** | 6 个文件齐全；Enter/Shift+Enter、附件、Slash 菜单（数据源 `available_commands_update` 已接通）可用；**模型选择器无数据源**：`events.rs:45` 的 `AvailableModels` 变体从未被 `map_host_event` 产生，`omp-protocol` 也无 `AvailableModels*` 事件（fixture 中同样没有）；"Queued (n)" 未实现（仅 i18n 有 `queue` 文案）；Stop 走 `abort`（关闭会话）而非计划中 M4 才补的 `cancel`；无提交 |
| 5 | 审批 select/confirm/input/editor + toast/status + 30s 超时 cancelled | **PARTIAL** | `ApprovalModal.tsx`/`Toast.tsx`/`StatusBar.tsx`/`useApproval.ts` 存在；30s 超时 + `cancelled` 回传已实现（`useApproval.ts:76-80`；`respond(..., cancelled)`）；**`InputModal.tsx`、`EditorTab.tsx` 缺失**（input/editor 内联在 ApprovalModal，editor tab 是普通 dock 宽度而非"全屏"）；`set_editor_text` 无任何实现（grep 为空）；`select` 直接渲染协议全部 options 而非严格 Approve/Deny；`Layout` 与 `ThreadWorkspace` 各自调用 `useApproval` → 双份监听/双份 30s 定时器；无提交 |
| 6 | 四 tab + Preview IPC 隔离 + Terminal + Diff + Worktree | **PARTIAL** | 10 个文件齐全，5 个 tab 可切换；xterm + `pty.rs`（PTY spawn/write/resize/kill/read）与 `useTerminal` 接通；Diff/Worktree 有实现（`useDiff`/`useWorktree`，后者在 Tauri 下走 invoke）。**Preview 在 Tauri 下直接显示 "tauriOnly" 占位**（`PreviewTab.tsx:120-123`），即真实应用里预览不可用；无 `WebviewWindow`；浏览器 fallback 用 `<iframe sandbox="allow-scripts allow-same-origin ...">` 加载远端 URL；**无任何 "预览页 `window.__TAURI__` 不存在" 的断言/测试**（grep `__TAURI__` 只有特性探测）；`tauri.conf.json` 无 `dangerousRemoteDomainIpcAccess`（这点符合隔离要求）；无提交 |
| 7 | 双主题 token + i18n + 快捷键 + 全门禁绿 + 真实 omp 一轮 | **FAIL** | `tokens.css` 双主题齐全；`i18n/en.json` 与 `zh-CN.json` 131/131 key 完全对齐；`useTheme`/`useShortcuts`/`types/theme` 存在。**但** `scripts/e2e_smoke.ts` 不存在；`tokens.css:12` 声称有 `docs/contrast-report.md`，该文件不存在（无 better-colors AA 证据）；本报告实测对比度：暗色 `--accent` 文本于 `--bg-base` = **4.24:1 < 4.5**（普通字号不达 AA），其余主要 token 对 4.85–18.1 达标；快捷键语义偏离设计（⌘1–9 映射 rail 视图而非 thread；⌘⌥A 只是切 agents 视图；⌘K 是聚焦 composer，设计 §6 为命令面板）；**前端从未调用 `spawn_session`**（mock sessions `'1'/'2'/'3'` + `send_prompt` 必报 unknown session），真实 omp 一轮无法跑通；门禁 1/2/4/5/6 均非全绿；无提交 |

### 交付物存在性（按计划清单核对）

- 缺失：`scripts/transcript_smoke.ts`（Task 3）、`src/components/approval/InputModal.tsx`、`src/components/approval/EditorTab.tsx`（Task 5）、`scripts/e2e_smoke.ts`（Task 7，实为 `.spec.ts`）、`docs/contrast-report.md`（tokens.css 引用）、`crates/omp-tauri/icons/`（tauri.conf 引用）。
- 其余计划所列文件均存在；`crates/omp-tauri/src/main.rs`、`build.rs`、`pty.rs` 等为计划外新增（合理）。
- 提交覆盖：Task 1+2 → `12ef948`（一条提交承载两个 Task）；Task 3 → `c90759a`；**Task 4–7 全部未提交**（工作区 22 modified + 42 untracked，`+13061/-1378`）。

---

## review_m1 问题回归检查

`review_m1.md`（未提交）针对 M1 的 session.rs / omp-gui main.rs 提了 11 项。

| # | review_m1 问题 | 回归结论 | 证据 |
|---|---|---|---|
| 1 | stderr 被 `_stderr` 丢弃 | **已修复** | `crates/omp-host/src/session.rs:190-210` 新增 stderr pump，转 `SessionEvent::Noise` |
| 2 | stdin pump 写失败静默、后续发送可能永久阻塞 | **部分修复** | 写失败会 `warn!` 并 break（`session.rs:124-138`）；`send_*` 改为 `try_send`（`session.rs:249-281`）避免阻塞；但 writer 死后 `outbound_tx` 仍在 handle 中，后续调用最终得到 `QueueFull` 而非 `Closed`，错误未向上传播 |
| 3 | `max_frame_bytes as usize` 截断风险 | **未修复** | `session.rs:160` 仍是 `max_frame = Some(m as usize);`（无 `min`/`try_into`）。64 位平台无实际截断，风险低 |
| 4 | Drop 只 `start_kill`、无 reap / zombie 风险 | **部分修复，仍有泄漏** | 已设 `kill_on_drop(true)`（`session.rs:104`），但 `Session` 被 move 进 detached task（`crates/omp-tauri/src/commands.rs:198-217`）且永不 drop；`close_session` 只从 map 移除 `Arc<SessionHandle>`（`commands.rs:251-261`），task 持有的 `Session`/sender 使 `rx.recv()` 永不返回 Closed → 子进程不会被杀、task 永久存活；无显式 `wait()`（`session.rs:223` 的 `wait` 无调用方）。原先 `Drop` 实现已被移除 |
| 5 | omp-gui `send().await` 可阻塞、`fs` feature 未用 | **不适用/代码已变** | `crates/omp-gui/src/main.rs` 现为占位程序：`eprintln!("omp-gui M1 placeholder..."); exit(1)`，0 测试；review_m1 对 main.rs 的结论已无法对上当前代码 |
| 6 | session 测试只测 spawn 成功 | **已改善但门禁下空跑** | 新增 5 个单测 + 2 个集成测试；但集成测试在标准 `cargo test` 下静默 skip（见 Gate 1 细节） |

---

## 进程/仓库卫生问题

1. **提交缺失（计划硬性要求）**：计划规定"每个 Task 一个 commit"；实际只到 Task 3，**Tasks 4–7 的 13061 行改动全部停留在工作区**（HEAD `c90759a` 不包含 pty.rs、审批、dock、i18n/index.ts、主题等 M2 代码）。HEAD 无法复现 M2 现状。
2. **Task 1+2 合并提交**：`12ef948 "feat: M2 Task 1+2 ..."` 违反"每 Task 一提交"；Task 3 提交信息与计划一致。
3. **`.gitignore` 只有 `/target`**：`node_modules/`（322MB）、`playwright-report/`（512K）、`.test-shim/`、`crates/omp-tauri/gen/`（352K schemas）、`crates/omp-tauri/permissions/autogenerated/`、以及 `test-results/`（本次验证已清理）等生成物均未忽略，`git status` 噪声很大；`gen/`、`permissions/autogenerated/` 属构建生成物，应 ignore（或明确纳管）。
4. 未跟踪但仍属工程资产的：`AGENTS.md`、`review_m1.md`、`docs/superpowers/plans/2026-11-01-m2-agent-tasks.md`、`docs/superpowers/plans/2026-11-07-m3-agent-tasks.md`、`eslint.config.js`、`playwright.config.ts`、`vitest.config.ts`、`tailwind.config.js`、`postcss.config.js`、`scripts/e2e_smoke.spec.ts`、`scripts/test-setup.sh`、`scripts/deny_probe.sh`、`.test-shim/`；`src/i18n.ts` 处于已删除未提交状态（被 `src/i18n/index.ts` 取代）。
5. **进程卫生**：验证期间启动的 Vite dev server / Playwright / Chromium 均已用 `fuser -k 1420/tcp` 等方式清理；结束时 `pgrep -af "vite|chromium|playwright"` 无残留；未触碰真实 `omp` 进程（e2e spec 的 `omp` 子进程未实际拉起）。
6. 验证产物：`target/verify/`（各门禁日志、`gate6d_probe.json`、`page-layout-full.png`、lint JSON、探针脚本）位于 `/target` 忽略区内，可复查。

---

## 结论

**M2 未达验收标准（整体 FAIL，不可进入 M3 全绿门禁）。**

- 门禁 8 项中：仅 `npm test` 真正通过；Rust 三 crate 单测通过但含 2 个空跑用例；`cargo test --workspace`、`cargo check/build -p omp-tauri`、`npm run build`、`npm run lint`、`npm run e2e` 全部失败（其中 workspace/tauri 失败确认为环境性，build/e2e/lint 为代码/配置缺陷）。
- Task 判定：Task 1/2/4/5/6 PARTIAL，Task 3/7 FAIL。计划中依赖"每个 Task 单独 commit + 验收命令全绿"的流程约束未满足（Tasks 4–7 无提交）。
- 阻塞性问题（Top 3）：
  1. **应用跑不起来**：`vite.config.ts:20` outDir 指向仓库外（`/home/wr1ench/crates`），`tauri.conf.json` 缺 `devUrl`、`frontendDist` 指向 `/home/wr1ench/src`、icons 目录缺失；叠加沙箱缺 webkit2gtk-4.1/glib 开发文件，`cargo check/build -p omp-tauri` 与 `npm run tauri dev/build` 均不可用。
  2. **端到端链路不存在**：前端无 `spawn_session` 调用（mock sessions），`available_models`/`set_editor_text` 事件/命令未实现，Preview 在 Tauri 下是 "tauriOnly" 占位；真实 `omp` 一轮无法跑通。
  3. **质量证据缺失 + 已知运行时缺陷**：无 `transcript_smoke`/5000-message fixture/DOM<2000/<300MB 证据；浏览器空闲即 189 条 React "Maximum update depth exceeded"（Transcript/useVirtualScroll 更新环）；lint 21 errors；e2e spec 路径与实现双重不匹配且逻辑上不可能通过。

建议（不在本次范围、未执行）：先修 vite/tauri 配置与 `display:grid`、`useLayoutState` 全局化、Transcript 更新环与 lint；补齐 `spawn_session`/事件映射/Preview 与 e2e/性能证据；按计划为 Task 4–7 补提交后重跑本报告全部门禁。
