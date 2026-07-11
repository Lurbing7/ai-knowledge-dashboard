# 侧栏优先 Dashboard 体验实施计划

> **目标：** 让 Dashboard 在 Obsidian 左右侧栏常开的窄内容区中仍可快速回答“下一步做什么”，并消除无信息 Hero、标题截断、Health 原始 Markdown 等体验问题。

## 约束

- 不改变 DeepSeek API、推理开关、设置存储与隐私边界。
- Dashboard 内容优先级为：行动建议、领域概览、维护信息。
- 响应式判断基于 Dashboard 内容容器宽度，而不是应用窗口宽度。
- Health 只展示现有摘要，不额外读取或暴露私人笔记。

## Task 1：行动优先的页面结构与导航

**Files:**
- Modify: `tests/source-contract.test.ts`
- Modify: `src/views/dashboard-view.ts`
- Modify: `src/styles.css`

1. 在 `tests/source-contract.test.ts` 增加契约：导航顺序为 Dashboard、Action Guide、Projects、Inbox、Knowledge Map、Wiki、Health、Settings；源码不再包含 `akd-hero`；Dashboard 中 AI 控件与行动建议在领域卡片之前创建。
2. 运行 `npm test -- --run tests/source-contract.test.ts`，确认新增契约先失败。
3. 调整 `dashboard-view.ts`：重排导航，把 AI 控件、生成状态与行动建议移到领域概览之前，删除 Hero DOM，并为领域卡片增加明确的小节标题。
4. 删除 Hero CSS，补充概览标题的轻量样式。
5. 再次运行定向测试，确认通过。

## Task 2：适配左右侧栏常开的领域卡片

**Files:**
- Modify: `tests/source-contract.test.ts`
- Modify: `src/views/dashboard-view.ts`
- Modify: `src/styles.css`

1. 增加契约：`.akd-main` 建立 inline-size container；领域卡片默认两列，在容器不超过 760px 时变一列；不再存在四列布局。
2. 增加契约：最近笔记标题保留 `title` 属性，允许两行与任意位置换行；“查看 →”位于卡片标题区并清除按钮默认边框、阴影和最小尺寸。
3. 运行定向测试，确认新增契约失败。
4. 修改 `renderAreaCard` 与 `renderRecentNote` 的 DOM：查看入口移到标题行；标题与时间改为上下布局；完整标题保留在原生 tooltip 中。
5. 修改 CSS：默认两列、容器窄于 760px 单列，移除固定四列与卡片最小高度；为标题、时间和链接按钮补齐窄布局样式。
6. 再次运行定向测试，确认通过。

## Task 3：用 Obsidian Markdown 渲染 Health 摘要

**Files:**
- Modify: `tests/source-contract.test.ts`
- Modify: `src/views/dashboard-view.ts`
- Modify: `src/styles.css`

1. 增加契约：使用 `MarkdownRenderer.render`；不再创建 `<pre class="akd-health-summary">`；页面包含“打开 Health 原文”入口。
2. 运行定向测试，确认新增契约失败。
3. 从 `obsidian` 导入 `MarkdownRenderer`，把现有 Health 摘要渲染到独立内容容器，并使用配置的 Health 文件路径作为 sourcePath。
4. 添加“打开 Health 原文”链接；文件存在时使用已有 `openFile` 逻辑在新标签打开，不存在时保留明确提示。
5. 用普通面板样式替代原始 `<pre>` 样式。
6. 再次运行定向测试，确认通过。

## Task 4：完整验证、安装与交付

**Files:**
- Verify: `src/views/dashboard-view.ts`
- Verify: `src/styles.css`
- Verify: `tests/source-contract.test.ts`
- Generated/install: `main.js`, `styles.css`, `manifest.json`

1. 运行 `npm run check` 与 `npm run build`，保存通过结果。
2. 检查 `git diff --check`、`git status --short` 与关键源码差异，确保没有 `data.json`、密钥或无关文件。
3. 运行 `npm run install:notes`，核对插件仓库构建产物与知识库插件目录文件哈希一致。
4. 在 Obsidian 左右侧栏打开的使用方式下检查：行动建议在首屏；领域卡片随中间容器变成两列或一列；长标题可读；Health 已渲染；原文入口可用。
5. 提交实现代码，推送 `codex/sidebar-first-dashboard`，创建新的 Draft PR，并在 PR 中只描述非敏感 UX 与验证结果。

## 停止条件

- 所有新增契约、完整测试、类型检查与构建均通过。
- 安装目录与构建产物一致。
- 未修改 DeepSeek 配置结构，未提交本地设置或用户私人数据。
