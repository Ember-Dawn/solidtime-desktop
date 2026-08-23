# solidtime-desktop Fork Notes

本文记录本 fork 相对 upstream `solidtime-desktop` 的主要定制、关键设计决策、容易被后续修改破坏的行为，以及已经实际验证过的 Windows 11 x64 本地构建方式。

本文的目标不是替代 upstream README，也不是逐提交 changelog。它更像一份“当前状态 + AI/开发者接手指南”：未来继续升级、合并 upstream 或让其他 AI 修改代码时，应先看这里，再进入具体源码。

## 1. 当前基线

- upstream 基线：`solidtime-io/solidtime-desktop` 的 `v0.3.2`。
- upstream 基线 commit：`af4e5666cbd7e7b68f60b7ac3a85ed20e204787e`。
- 当前 fork 的 `main` 是在该 commit 之后继续叠加本仓库定制；核对时曾确认相对该基线为 ahead、behind 为 0。
- 当前 `package.json` 应用版本：`0.3.2-cyan.1`。
- 建议与该版本对应的 Git tag 名称：`v0.3.2-cyan.1`。本文只规定命名，不代表已经创建远程 tag / Release。
- 主要使用环境：Windows 11 x64。
- Mini Widget 重点适配了双 4K、多 DPI 显示器环境。

版本命名约定：在仍基于同一 upstream 版本时递增 `cyan.N`，例如 `v0.3.2-cyan.2`；以后同步到新的 upstream release 后，从新的基线重新开始，例如 `v0.3.3-cyan.1`。

> 注意：package version、Git tag 和 GitHub Release 是不同概念。AI / 自动化工具不得因为本文记录了建议 tag，就自动创建、移动或覆盖任何远程 tag / Release。

## 2. 当前主要定制

### 2.1 主窗口手动同步

主界面增加了手动 Sync 按钮，用于显式重新获取当前 active queries，而不是替换 Vue Query 原有的自动 refetch 行为。

当前语义：

- 点击 Sync：执行当前 active queries 的重新获取；
- 同步过程中按钮进入 busy / spinning 状态；
- Sync 按钮位于 Windows 顶部标题栏右侧，并与原生 `_ / □ / ×` 按钮保持同一水平布局；
- Tooltip 显示对应快捷键。

### 2.2 `Ctrl+R` 手动同步

Windows 主窗口将 `Ctrl+R` 作为“Sync now”快捷键：

- 拦截 Chromium / Electron 默认 reload；
- 不刷新 renderer 页面；
- 触发与 Sync 按钮相同的手动同步逻辑。

不要把它改回浏览器式页面 reload，除非明确重新设计快捷键。

### 2.3 主窗口与 Widget 的 focus 自动同步

主 renderer 使用 Vue Query `focusManager` 监听 Electron renderer 的 `window.focus` / `visibilitychange`。

当前主窗口查询策略的重要点：

- 普通 queries 有 stale window；
- `currentTimeEntry` 使用更积极的刷新策略，以便重新获得焦点后检测其他客户端（例如手机端）对当前计时器的修改。

Mini Widget 是独立 BrowserWindow、独立 Vue App、独立 QueryClient，因此也显式接入了 focusManager，而不是依赖默认浏览器行为偶然生效。

目标行为：

- 手机上修改/停止计时后，回到主窗口会自动检查更新；
- 手机上修改/停止计时后，重新点击 Widget 也会自动检查更新；
- 仍可用主窗口 Sync / `Ctrl+R` 做显式强制刷新。

### 2.4 Project / Task 排序

Project 和 Task 各自有独立的升序/降序设置，并持久化保存。

排序使用支持中英文和数字自然顺序的 `Intl.Collator`。排序辅助逻辑集中在：

```text
src/renderer/src/utils/listSorting.ts
```

不要在不同组件里重新写一套彼此不一致的字符串排序。

### 2.5 Mini Widget 双行布局

Mini Widget 当前是紧凑双行布局：

```text
Description
Project > Task
```

关键行为：

- Description 与 Project/Task 同时显示，不采用二选一 fallback；
- Project 保留颜色圆点；
- 实际 Description 使用正常文本颜色；
- `No Description` 使用弱化占位样式；
- Project/Task 使用清晰文本；
- 右侧 timer、break、start/stop 控件针对当前高度做了放大和间距调整。

当前 Mini Widget 高度为约 52 DIP。修改高度时要同时检查拖动、popup 定位和 mixed-DPI 行为。

### 2.6 停止计时后的 Widget 显示

停止计时后，Widget 显示 idle 状态，而不是继续把上一条 `lastTimeEntry` 显示在界面上：

- `No Description`；
- `No Project`；
- 不显示旧 Task；
- timer 显示 `00:00:00`；
- Start 按钮保留。

这只是“显示清空”。不要为了实现 idle UI 而删除内部 `lastTimeEntry`，因为恢复计时、break/resume、tray 等逻辑仍可能依赖它。

### 2.7 Description 内联编辑

普通正在运行的 work timer 支持直接在 Mini Widget 内编辑 Description：

- 仅 `isRunning && !isOnBreak` 时可编辑；
- Enter 保存；
- Esc 取消；
- blur 保存；
- 本地 current entry 先乐观更新，再执行服务器 mutation；
- mutation 失败时恢复之前状态。

停止状态或 break 状态下保持只读。

### 2.8 Description 历史建议

输入 Description 时可弹出历史建议列表。

当前设计：

- 使用独立、非 focusable 的 frameless BrowserWindow，避免 Description 输入框失去键盘焦点；
- 只有用户真正输入内容后才显示建议，不是单纯 focus 就弹出；
- 支持方向键、Enter、Esc 和鼠标；鼠标选择在 `mousedown` 阶段立即提交，避免非 focusable popup 在 Windows 上出现按下后 `click` 未可靠送达的问题；
- 建议数据来自最近一页 time entries，不是扫描全部历史数据库；
- UI 最多显示 12 条；
- 去重键是 `(description, project_id, task_id)`，所以相同 Description 在不同 Project/Task 下仍可分别出现；
- 历史建议保存的是一整套上下文，而不只是字符串。

选择一条历史建议时，会一起恢复：

```text
description + project_id + task_id
```

自由输入并直接 Enter 保存时，只更新 Description，不应无故改变当前 Project/Task。

### 2.9 Project / Task 联合 Picker

Project 和 Task 在 Mini Widget 中使用一个联合选择器。

它使用独立 frameless Electron BrowserWindow，而不是把普通 popover 塞在 52-DIP Widget 内，以避免被 Widget 边界裁切。

功能包括：

- 搜索 Project / Task；
- 展开/折叠 Project 下的 Tasks；
- Project 颜色圆点；
- Task 数量；
- `No Project`；
- 使用当前 Project/Task 排序设置。

数据一致性约束：

- 选择 Project 本身时，必须把旧 `task_id` 清空；
- 选择 Task 时，同时使用该 Task 所属的 `project_id`；
- 清除 Project 时同时清除 Task；
- 不允许形成“Project A + 属于 Project B 的 Task”这种组合。

### 2.10 Popup 视觉与定位

Description History popup 和 Project/Task Picker 当前统一为单层 popup 视觉：

- BrowserWindow 的可见区域就是 popup 本体；
- 不再采用“透明外层 padding + 内层 rounded card”的双框结构；
- 与 Widget 左边缘对齐；
- 宽度直接取当前 Widget 的实际 DIP bounds，不再让两个 popup 各自维护独立的固定宽度；
- 在 Windows mixed-DPI 环境中，popup 显示后再次应用一次当前 Widget 相对 bounds，使 Electron 在目标显示器上重新计算 native pixel 尺寸；
- 根据工作区空间自动选择显示在 Widget 上方或下方；
- Description History 高度根据结果数量自适应并设置最大高度。

以后调整 popup 样式时，避免重新引入“框中框”的视觉。

### 2.11 Mixed-DPI 双屏修复

Mini Widget 已针对 Windows 多显示器不同缩放比例处理过拖动问题，例如主屏 125%、副屏 150%。

关键设计：

- Electron BrowserWindow bounds 使用 DIP；
- 跨屏后需要重新应用固定 DIP 尺寸，让 Electron 用新显示器的 scaleFactor 重新计算 native pixel bounds；
- 不能在 Windows 正在 native drag 的过程中立即 `setBounds()`；
- 如果拖动时立即改 bounds，会重新计算鼠标抓取偏移，表现为 Widget 突然跳动；
- 当前采用约 180 ms 的 settle/debounce，等 move 事件停止后再应用 mixed-DPI 修复；
- 显示器变化时同步关闭 popup，避免 popup 留在旧坐标系中；
- Project/Task Picker 与 Description History popup 在新屏重新打开时，以 Widget 当前实际宽度为基准，并在显示后重应用一次 bounds，避免 125% / 150% 等 mixed-DPI 下 popup 看起来比 Widget 窄。

这是已经针对真实双 4K mixed-DPI 环境解决过的问题。除非有明确替代实现，不要删除 debounce，也不要把 Widget 逻辑改回每次 move 立即 `setBounds()`。popup 自身不是拖动目标，可以在显示后安全地重应用 bounds。

### 2.12 Widget Start / Stop 语义

Widget 的普通 Start / Stop 与 tray 的 Continue 现在有明确区分：

- Widget Stop 只停止当前计时，不应调用 `showMainWindow()`，因此主窗口保持原来的隐藏/后台状态；
- Widget 普通 Start 明确创建一个新的空白 work entry，不继承上一条 entry 的 Description / Project / Task；
- tray 的 `Continue` 仍保留“继续上一条 entry”的语义；
- break 后的 Resume 仍恢复 break 前的 work entry；
- `lastTimeEntry` 继续作为内部恢复状态保留，不能因为 Widget Start 要空白就删除它。

当前实现通过 IPC 区分 Widget 的 blank start 与 tray 的 continue。修改这一链路时，要同时检查 `MiniControls.vue`、mini preload、main-process 转发和 `App.vue` 的接收逻辑，避免只改一侧。

## 3. 主要相关源码

以下文件是当前 fork 定制的高相关区域。继续修改前应优先检查这些文件之间的关系。

```text
src/main/miniWindow.ts
src/main/mainWindow.ts
src/preload/main.ts
src/preload/mini.ts
src/preload/interface.d.ts
src/renderer/src/mini.ts
src/renderer/src/components/MiniControls.vue
src/renderer/src/components/ProjectTaskPicker.vue
src/renderer/src/components/DescriptionSuggestions.vue
src/renderer/src/components/MainTimeEntryTable.vue
src/renderer/src/utils/listSorting.ts
src/renderer/src/main.ts
src/renderer/src/App.vue
src/renderer/src/utils/useTimer.ts
```

职责概览：

- `src/main/miniWindow.ts`：Mini Widget BrowserWindow、两个 popup BrowserWindow、窗口尺寸/位置、mixed-DPI 和相关 IPC；
- `src/main/mainWindow.ts`：主窗口 IPC 转发，包括 Widget / tray 的 timer 事件；
- `src/preload/main.ts` / `src/preload/mini.ts` / `interface.d.ts`：主窗口、Mini / popup IPC bridge 与类型；
- `src/renderer/src/mini.ts`：Mini renderer QueryClient、focusManager 和应用入口；
- `MiniControls.vue`：Widget 主 UI、Description 编辑、历史建议、Project/Task 选择、timer 控件；
- `ProjectTaskPicker.vue`：联合 Project/Task popup；
- `DescriptionSuggestions.vue`：历史 Description + Project/Task 上下文 popup；
- `MainTimeEntryTable.vue`：主 Time Tracker 数据查询、手动同步相关逻辑及 timer 主页面行为；
- `listSorting.ts`：Project / Task 排序；
- `main.ts`：主 renderer QueryClient / focusManager；
- `App.vue`：主窗口顶栏、全局应用壳层、timer 全局事件，并区分 Widget blank start 与 tray continue；
- `useTimer.ts`：`startTimer`、`continueLastTimer`、stop、break/resume 等共享 timer 语义。

## 4. 不要轻易破坏的行为

后续升级或合并 upstream 时，至少逐项检查：

1. 不要让停止后的 Widget 再次显示旧 `lastTimeEntry`，但也不要删除内部 `lastTimeEntry`。
2. 不要在跨 mixed-DPI 显示器拖动过程中立即反复 `setBounds()`。
3. 不要删除约 180 ms 的 display-metrics settle 逻辑，除非替代实现已经在 mixed-DPI Windows 上验证。
4. 不要把 Project 和 Task 的更新拆成可能产生非法组合的两个独立状态。
5. 选择历史 Description 建议时，要保持“Description + Project + Task 一起恢复”的语义。
6. Description History popup 必须保持不抢 Description 输入框焦点，同时鼠标左键必须能够直接选择建议项。
7. Project/Task picker 和 Description History popup 不要重新塞回 52-DIP Widget 内部造成裁切；二者宽度应继续跟随 Widget 当前实际 bounds，并保持 mixed-DPI 显示后重校准。
8. `Ctrl+R` 在主应用内是 Sync，不是 renderer reload。
9. Widget 是独立 QueryClient，不能假设主窗口的 focus 配置会自动作用于 Widget。
10. 修改 title bar 时要注意 Windows 原生 `_ / □ / ×` 区域，不要靠容易漂移的绝对定位重新制造错位。
11. Widget Stop 不应主动显示主窗口；Widget 普通 Start 必须保持空白新建，而 tray Continue 才恢复上一条 entry。

## 5. Windows 11 x64 本地构建

### 5.1 开发运行（dev）

依赖已经安装时，在仓库根目录运行：

```powershell
Set-Location E:\github\solidtime-desktop
npm run dev
```

如果希望先做一次类型检查再启动开发版：

```powershell
Set-Location E:\github\solidtime-desktop
npm run typecheck
npm run dev
```

开发版只用于调试，不生成 NSIS 安装包。若已安装的 production solidtime 正在运行，单实例锁可能阻止 dev 实例启动，此时应先完全退出已安装版本。

### 5.2 目标

当前实际验证的本地构建目标是：

- Windows 11；
- x64；
- 只生成 NSIS 安装版 `.exe`；
- 不生成 ARM64 / macOS / Linux；
- 不上传、不发布 GitHub Release。

### 5.3 已验证成功的两步构建

在仓库根目录：

```powershell
Set-Location E:\github\solidtime-desktop
npm run build
```

该步骤会先执行 typecheck，然后执行 Electron/Vite production build。

代码构建成功后，使用固定的 `electron-builder 26.0.3`，并且显式只读取仓库根目录的 `electron-builder.yml`：

```powershell
npx --yes electron-builder@26.0.3 --config electron-builder.yml --win nsis --x64 --publish never
```

当前已实际验证该命令可以完成：

- `better-sqlite3` x64 native rebuild；
- Electron win32-x64 packaging；
- NSIS installer 构建；
- 最终返回 PowerShell 提示符且无 error。

最终主要安装包：

```text
E:\github\solidtime-desktop\dist\solidtime-setup-x64.exe
```

还可能生成：

```text
E:\github\solidtime-desktop\dist\solidtime-setup-x64.exe.blockmap
E:\github\solidtime-desktop\dist\win-unpacked\
```

如果只是本机安装，主要需要 `solidtime-setup-x64.exe`。

### 5.4 为什么不直接使用当前默认 electron-builder

仓库依赖范围允许安装较新的 `electron-builder`。本机实际运行时曾使用到 `electron-builder 26.8.1`，打包长时间停在：

```text
searching for node modules  pm=npm searchDir=E:\github\solidtime-desktop
```

在此之前 typecheck、Vite build、native dependency rebuild 和 Electron 下载均可正常完成，但 node module scanning 长时间没有继续。

将安装包生成阶段固定为：

```text
electron-builder 26.0.3
```

后，已实际快速越过该扫描阶段。因此当前 Windows x64 本地个人构建优先使用 26.0.3，而不是直接依赖仓库安装到的较新 builder。

这是一条“本地已验证 workaround”，不是要求修改 upstream 的正式跨平台发布配置。未来升级 Electron / npm / electron-builder 后可以重新验证是否仍需要固定版本。

### 5.5 为什么必须显式使用 `--config electron-builder.yml`

`package.json` 的 `build` 配置当前包含：

```text
afterSign: electron-builder-notarize
```

直接执行：

```powershell
npx --yes electron-builder@26.0.3 --win nsis --x64 --publish never
```

虽然能越过 node module scanning，但 Windows packaging 后会尝试解析 `electron-builder-notarize`，并出现类似：

```text
Cannot find module 'E:\github\solidtime-desktop\electron-builder-notarize'
```

该 hook 与本地 Windows NSIS 构建目标无关。

也不要用以下方式试图在 CLI 里“设为 null”：

```text
-c.afterSign=null
-c.afterSign=
--config.afterSign=null
```

在当前 `electron-builder 26.0.3` / CLI 解析下，这些写法分别被当成配置文件名或字符串模块名，已经实际出现过：

```text
ENOENT ... .afterSign=null
Cannot find module 'E:\github\solidtime-desktop\null'
```

当前验证成功的做法是直接：

```powershell
--config electron-builder.yml
```

因为 `electron-builder.yml` 已包含 Windows / NSIS / artifactName 等正式配置，但不包含 `package.json` 中的 `afterSign` hook。

因此完整命令保持为：

```powershell
npx --yes electron-builder@26.0.3 --config electron-builder.yml --win nsis --x64 --publish never
```

### 5.6 `min-release-age` npm warning

仓库 `.npmrc` 当前包含：

```text
min-release-age=7
```

使用当前 npm 时可能重复看到：

```text
npm warn Unknown env config "min-release-age". This will stop working in the next major version of npm.
npm warn Unknown project config "min-release-age". This will stop working in the next major version of npm.
```

在当前已验证构建中，这只是 warning，不是 `searching for node modules` 卡顿或 NSIS 构建失败的直接原因。

未来升级 npm 时需要重新确认该配置是否仍受支持；不要为了消除 warning 在没有确认语义的情况下随意删除它。

### 5.7 判断构建是否成功

成功日志中会出现类似：

```text
packaging       platform=win32 arch=x64
building        target=nsis file=dist\solidtime-setup-x64.exe archs=x64
signing with signtool.exe  path=dist\solidtime-setup-x64.exe
building block map  blockMapFile=dist\solidtime-setup-x64.exe.blockmap
```

并且命令正常返回 PowerShell 提示符，没有 error stack。

可检查：

```powershell
Get-Item E:\github\solidtime-desktop\dist\solidtime-setup-x64.exe
```

### 5.8 日常重复构建

依赖已经安装、只是修改 Vue / TypeScript 源码时，不需要每次重新 `npm install`。

推荐：

```powershell
Set-Location E:\github\solidtime-desktop
npm run build
npx --yes electron-builder@26.0.3 --config electron-builder.yml --win nsis --x64 --publish never
```

如果只是开发调试，不需要生成安装包：

```powershell
npm run typecheck
npm run dev
```

### 5.9 修改源码后不要只重新打包旧 `out/`

本机曾实际遇到过：源码已经正确修改，但安装新生成的 EXE 后，Widget 仍表现为旧行为，例如：

- 点击 Widget Stop 仍弹出主窗口；
- 点击 Widget Start 仍继承上一条 entry。

检查仓库源码后确认修改已经存在，最终原因是只重新执行了 `electron-builder` 打包命令，而没有先重新执行 production build。`electron-builder` 会打包现有 `out/`，不会替代 `npm run build` 去重新编译刚修改的 Vue / TypeScript 源码。

因此源码有变化时必须保持两步顺序：

```powershell
npm run build
npx --yes electron-builder@26.0.3 --config electron-builder.yml --win nsis --x64 --publish never
```

如果怀疑旧产物被复用，可先完全退出 solidtime / Electron 进程，再清理 `out` 和 `dist` 后重建：

```powershell
Get-Process solidtime,electron -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .\out -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
npm run build
npx --yes electron-builder@26.0.3 --config electron-builder.yml --win nsis --x64 --publish never
```

如果出现“源码看起来已经修好，但安装包行为完全没变化”，优先检查：

1. 是否在应用修改后重新执行过 `npm run build`；
2. `out/renderer`、`out/preload`、`out/main` 是否确实是本次源码生成的；
3. 是否重新打包了新的 `dist\solidtime-setup-x64.exe`；
4. 安装/测试前是否仍有旧 `solidtime.exe` 进程在运行。

## 6. Upstream 升级检查清单

以后同步 upstream 或升级依赖时，不要只看编译是否通过。至少检查：

- `src/main/miniWindow.ts` 是否有 upstream 窗口尺寸、shape、DPI 或 popup 管理变化；
- Vue Query / `focusManager` API 是否变化，主窗口和 Mini Widget 是否仍分别正确 refetch；
- `useTimer` / `currentTimeEntry` / `lastTimeEntry` 语义是否变化；
- Project / Task API 是否改变 ID 或关联字段；
- `TimeTrackerStartStop` 等 `@solidtime/ui` 组件 props / events 是否变化；
- Electron major version 是否改变 Windows BrowserWindow mixed-DPI 行为；
- `electron-builder` 是否已经修复当前 npm dependency scanning 问题；
- `package.json` 的 `afterSign` / notarization 配置是否仍然存在，以及 Windows 本地 build 是否仍需 `--config electron-builder.yml`；
- `.npmrc` 的 `min-release-age` 是否被当前 npm 正式支持；
- Win11 x64 NSIS 安装包能否正常安装、启动、显示 Widget、跨屏拖动并完成同步；
- Description History 是否仍可用鼠标左键和键盘选择，且鼠标操作不会抢走 Description 输入焦点；
- Project/Task Picker 与 Description History 在不同 DPI 显示器上是否仍与 Widget 等宽；
- 当前 fork 是否仍基于文档记录的 upstream release / commit；若升级基线，应同步更新 `0.3.x-cyan.N` 版本与建议 tag 命名；
- 修改源码后是否先重新生成 `out/` 再打包，避免把旧 renderer / preload / main 产物重新封装进新的 EXE；
- Widget Stop 是否保持主窗口隐藏，Widget 普通 Start 是否仍为空白新建，tray Continue 是否仍恢复上一条 entry。

## 7. 文档维护规则

以后新增 fork-specific 功能时，优先更新本文的“当前主要定制”和“不要轻易破坏的行为”，而不是只在文末追加流水账。

如果构建 workaround 失效，也应直接更新“Windows 11 x64 本地构建”章节，使这里始终描述当前可复现的推荐流程。
