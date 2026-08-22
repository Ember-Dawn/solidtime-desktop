# AGENTS.md

本文件用于约束在本 fork 中工作的 AI / 自动化开发代理。开始分析或修改源码前，必须先阅读仓库根目录的 [`FORK_NOTES.md`](./FORK_NOTES.md)。

## 1. 先理解 fork，再修改

- 本仓库不是未经修改的 upstream `solidtime-desktop`；已经包含一组针对 Windows、Mini Widget、同步体验和列表排序的定制。
- 不要因为 upstream 的原实现不同，就自动把当前行为“恢复”为 upstream。
- 修改相关功能前，先阅读 `FORK_NOTES.md` 中对应的“当前定制”“关键设计决策”和“不要轻易破坏的行为”。
- 如果代码与 `FORK_NOTES.md` 明显不一致，应先确认代码当前状态，再决定是更新代码还是更新文档，不要凭文档覆盖源码事实。

## 2. 修改原则

- 优先对完整原文件做最小范围修改，不无故重写无关部分。
- 修改跨窗口、同步、计时器、Project/Task、Description 或 mixed-DPI 逻辑时，要检查相关联的 main / preload / renderer 边界，避免只改一侧造成状态不一致。
- 保持现有 Project/Task 一致性约束：Project 改变时不能留下属于旧 Project 的 Task。
- 保持 `lastTimeEntry` 作为内部恢复/续计时状态，不要仅为了清空停止状态下的 Widget 显示而删除它。
- Windows mixed-DPI 相关逻辑属于已解决的兼容性问题，除非有明确替代方案，不要删除或改成立即在拖动过程中 `setBounds()`。

## 3. 验证

源码修改后至少优先执行：

```powershell
npm run typecheck
```

需要运行开发版时：

```powershell
npm run dev
```

Windows 11 x64 本地安装包的已验证构建方式请严格参考 `FORK_NOTES.md` 的“Windows 11 x64 本地构建”章节，不要默认改回仓库当前较新的 `electron-builder` 打包路径。

## 4. 文档同步

如果后续修改改变了以下任一内容，应同步更新 `FORK_NOTES.md`：

- fork 新增或删除的用户可见功能；
- Mini Widget 的尺寸、布局、弹窗、同步或 mixed-DPI 行为；
- 主窗口同步和快捷键行为；
- Project/Task/Description 的数据一致性约束；
- Windows x64 构建流程、固定工具版本或已知构建问题；
- 关键源码文件职责或升级时必须检查的兼容点。
