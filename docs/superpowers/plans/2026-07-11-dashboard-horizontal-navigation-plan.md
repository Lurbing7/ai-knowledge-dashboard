# Dashboard 顶部横向导航实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 executing-plans 在当前专用 worktree 中逐任务实现。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 移除 Dashboard 左侧纵向导航，将 Dashboard 固定在顶部左侧、Settings 固定在顶部右侧，并让中间功能项可横向滚动。

**架构：** 仅修改 `DashboardView` 的导航 DOM 和 Dashboard 样式，不改变页面状态、Store 或 DeepSeek 数据流。使用源码契约测试锁定三段式导航结构、品牌删除和四个批准色值，再构建、安装并在 Obsidian 中验证真实布局与原有标签行为。

**技术栈：** TypeScript、Obsidian DOM API、CSS Grid/Flexbox、Vitest、esbuild

---

## 文件结构

- 修改 `tests/source-contract.test.ts`：加入横向导航 DOM、品牌移除和颜色值契约。
- 修改 `src/views/dashboard-view.ts`：将 `renderSidebar()` 替换为顶部三段式 `renderNavigation()`。
- 修改 `src/styles.css`：移除左侧网格列和品牌样式，增加固定两端与中间横向滚动样式，统一批准色值。
- 生成 `main.js`、`styles.css`：由生产构建产生最终运行文件。
- 更新 `README.md`：补充顶部横向导航行为。

### 任务 1：建立横向导航源码契约

**文件：**
- 修改：`tests/source-contract.test.ts`

- [ ] **步骤 1：编写失败测试**

在最终源码契约中加入：

```ts
it("uses a three-zone horizontal navigation", () => {
  expect(allSource).toContain("akd-top-nav");
  expect(allSource).toContain("akd-nav-home");
  expect(allSource).toContain("akd-nav-scroll");
  expect(allSource).toContain("akd-nav-settings");
  expect(allSource).not.toContain("akd-sidebar");
  expect(allSource).not.toContain("Knowledge OS");
});

it("uses the approved dashboard palette", () => {
  expect(allSource).toContain("#E1BEE7");
  expect(allSource).toContain("#F3E5F5");
  expect(allSource).toContain("#FFFFFF");
  expect(allSource).toContain("#BA68C8");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- tests/source-contract.test.ts`

预期：FAIL，旧源码仍包含 `akd-sidebar` 和 `Knowledge OS`，且缺少顶部导航类名。

### 任务 2：实现三段式顶部导航

**文件：**
- 修改：`src/views/dashboard-view.ts`
- 修改：`src/styles.css`

- [ ] **步骤 1：调整 Dashboard DOM**

将 `render()` 改为先渲染顶部导航，再渲染主内容：

```ts
const shell = container.createDiv({ cls: "akd-shell" });
this.renderNavigation(shell);
const main = shell.createEl("main", { cls: "akd-main" });
```

`renderNavigation()` 使用三个稳定区域：

```ts
const navigation = parent.createEl("nav", { cls: "akd-top-nav" });
renderPageButton(navigation, "dashboard", "Dashboard", "akd-nav-home");
const scroll = navigation.createDiv({ cls: "akd-nav-scroll" });
// Inbox、Projects、Knowledge Map、Health、Action Guide
const settings = navigation.createEl("button", {
  cls: "akd-nav-item akd-nav-settings",
  text: "Settings"
});
```

删除品牌节点和 `renderSidebar()`；页面切换与 Settings Notice 行为保持不变。

- [ ] **步骤 2：实现横向布局与颜色**

将 shell 由三列网格改为纵向容器：

```css
.akd-shell {
  display: flex;
  flex-direction: column;
  background: #F3E5F5;
}

.akd-top-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  background: #FFFFFF;
  border-bottom: 1px solid #E1BEE7;
}

.akd-nav-scroll {
  display: flex;
  min-width: 0;
  overflow-x: auto;
}

.akd-nav-home,
.akd-nav-settings {
  flex: none;
}
```

基础色值统一为：

```css
--akd-bg: #F3E5F5;
--akd-surface: #FFFFFF;
--akd-line: #E1BEE7;
--akd-purple: #BA68C8;
--akd-purple-soft: #F3E5F5;
```

Hero 使用 `#BA68C8` 到 `#E1BEE7` 的渐变，文字主体继续继承 Obsidian 主题色。

- [ ] **步骤 3：运行契约与全量检查**

运行：

```powershell
npm test -- tests/source-contract.test.ts
npm run check
git diff --check
```

预期：横向导航契约通过，全部测试通过，TypeScript 和 diff 检查无错误。

- [ ] **步骤 4：提交实现**

```powershell
git add tests/source-contract.test.ts src/views/dashboard-view.ts src/styles.css
git commit -m "feat: 将 Dashboard 导航调整为顶部横向布局"
```

### 任务 3：构建、安装与真实 UI 回归

**文件：**
- 修改：`README.md`
- 生成：`main.js`
- 生成：`styles.css`

- [ ] **步骤 1：更新 README**

说明 Dashboard 使用顶部三段式导航：Dashboard 固定左侧、Settings 固定右侧、中间功能项在窄窗口横向滚动。

- [ ] **步骤 2：生产构建并安装**

运行：

```powershell
npm run build
npm run install:notes
```

预期：35 项以上测试通过，安装脚本报告 `manifest.json`、`main.js`、`styles.css` 三个文件哈希一致。

- [ ] **步骤 3：执行 Obsidian 可见回归**

确认：

- Dashboard 顶部不再出现品牌块或左侧导航。
- Dashboard 固定在左端、Settings 固定在右端。
- 中间五个功能按钮横向排列；缩窄窗口时仅中间区域滚动。
- 主内容获得完整容器宽度，原左右内容分区没有被导航挤压。
- Dashboard 标签仍固定；关闭后从 Ribbon 重建；重启不抢当前文章焦点。

- [ ] **步骤 4：最终验证并提交交付文件**

运行：

```powershell
npm run check
npm run build
npm run install:notes
git diff --check
git status --short
```

提交 README、构建产物、安装脚本及既有 0.2.0 收尾文件：

```powershell
git add README.md docs/DEVELOPMENT_PLAN.md scripts/install-local.mjs tests/install-contract.test.ts main.js styles.css
git commit -m "docs: 完成 Dashboard 0.2.0 本地交付"
```
