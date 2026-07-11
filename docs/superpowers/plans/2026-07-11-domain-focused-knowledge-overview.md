# Domain 聚焦式知识领域概览实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 Dashboard 首页的 Inbox/Domain/Projects/Wiki 四卡概览替换为只浏览 Domain 直接子领域的聚焦式组件，并提供可记忆的选择、桌面覆盖侧栏和窄屏横向选择器。

**架构：** Vault 扫描层生成稳定、可测试的 `DomainSummary[]`，Dashboard 不自行扫描文件；独立的领域焦点 helper 负责默认选择与短标识规则，插件 controller 只持久化本地聚焦路径。视图消费快照并渲染领域选择栏和单一主体，CSS 通过容器查询与 hover 能力切换交互，不依赖物理分辨率或 Windows 缩放比例。

**技术栈：** TypeScript、Obsidian Plugin API、Vitest、CSS Container Queries、CSS `:has()` / `:focus-visible`、esbuild。

---

## 文件与职责

- 修改 `src/types.ts`：定义 `DomainSummary`，把领域摘要加入 `LocalSnapshot`，增加本地 `focusedDomainPath` 偏好。
- 修改 `src/data-sources.ts`：枚举 Domain 直接子目录，递归归组 Markdown 文件，生成最近三篇笔记和最近活动位置。
- 修改 `tests/data-sources.test.ts`：覆盖领域归组、排序、三篇上限、空领域和最近位置。
- 修改 `tests/action-context.test.ts`、`tests/dashboard-store.test.ts`：为新的快照字段补齐稳定 fixture，并证明领域详情不进入 DeepSeek context。
- 创建 `src/domain-focus.ts`：集中实现领域默认选择和收缩栏短标识，避免视图内散落选择逻辑。
- 创建 `tests/domain-focus.test.ts`：覆盖首次选择、恢复选择、失效回退和 Unicode 名称短标识。
- 修改 `src/settings.ts`、`tests/settings.test.ts`：迁移与规范化本地聚焦路径，不在 Settings UI 中暴露。
- 修改 `src/main.ts`：实现 `setFocusedDomainPath`，只保存本地设置，不刷新快照或触发 DeepSeek。
- 修改 `src/views/dashboard-view.ts`：渲染领域 rail、横向 tabs、聚焦主体、三篇最近笔记和 Knowledge Map 定位。
- 修改 `src/styles.css`：实现 54px→210px overlay、鼠标移出收缩、focus-visible、680px 容器降级和 980px 最大宽度。
- 修改 `tests/source-contract.test.ts`：锁定首页顺序、移除旧四卡、交互选择器、响应式和防粘住契约。
- 更新 `main.js`、`styles.css`：由正式构建生成并安装验证。

## 任务 1：生成可靠的 Domain 子领域摘要

**文件：**
- 修改：`src/types.ts`
- 修改：`src/data-sources.ts`
- 修改：`tests/data-sources.test.ts`
- 修改：`tests/action-context.test.ts`
- 修改：`tests/dashboard-store.test.ts`

- [x] **步骤 1：在数据测试中定义直接子领域、空领域和最近三篇的期望**

扩展测试用 `MemoryVaultReader`，允许显式提供直接文件夹：

```ts
constructor(
  private readonly files: Record<string, string>,
  private readonly mtimes: Record<string, number> = {},
  private readonly folders: string[] = []
) {}

async listFolders(path: string): Promise<string[]> {
  const prefix = `${path}/`;
  return this.folders.filter((folder) => folder.startsWith(prefix)
    && !folder.slice(prefix.length).includes("/"));
}
```

新增测试数据和断言：

```ts
it("builds direct Domain summaries with stable activity ordering", async () => {
  const reader = new MemoryVaultReader({
    "domain/it/java/one.md": "# One",
    "domain/it/java/two.md": "# Two",
    "domain/it/db/three.md": "# Three",
    "domain/it/db/four.md": "# Four",
    "domain/ai/agent.md": "# Agent"
  }, {
    "domain/it/java/one.md": 40,
    "domain/it/java/two.md": 30,
    "domain/it/db/three.md": 20,
    "domain/it/db/four.md": 10,
    "domain/ai/agent.md": 50
  }, ["domain/it", "domain/ai", "domain/finance"]);

  const snapshot = await collectLocalSnapshot(reader, structuredClone(DEFAULT_SETTINGS));

  expect(snapshot.domains.map((domain) => domain.path)).toEqual([
    "domain/ai", "domain/it", "domain/finance"
  ]);
  expect(snapshot.domains[1]).toMatchObject({
    name: "it",
    count: 4,
    latestMtime: 40,
    recentLocation: "it / java"
  });
  expect(snapshot.domains[1].recentNotes.map((note) => note.path)).toEqual([
    "domain/it/java/one.md",
    "domain/it/java/two.md",
    "domain/it/db/three.md"
  ]);
  expect(snapshot.domains[2]).toMatchObject({ count: 0, latestMtime: null, recentNotes: [] });
});
```

在所有手写 `LocalSnapshot` fixture 中加入 `domains: []`。

- [x] **步骤 2：运行定向测试并确认类型或字段缺失失败**

运行：

```bash
npm test -- --run tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts
```

预期：FAIL，错误包含 `listFolders` 不属于 `VaultReader` 或 `domains` 不属于 `LocalSnapshot`。

- [x] **步骤 3：增加领域类型和 Vault 文件夹枚举接口**

在 `src/types.ts` 增加：

```ts
export interface DomainSummary {
  name: string;
  path: string;
  count: number;
  latestMtime: number | null;
  recentLocation: string;
  recentNotes: RecentNote[];
}

export interface LocalSnapshot {
  // 保留现有字段
  domains: DomainSummary[];
}
```

在 `VaultReader` 增加：

```ts
listFolders(path: string): Promise<string[]>;
```

把 `src/data-sources.ts` 的 Obsidian import 改为 `import { TFolder, type App } from "obsidian";`，并在 `ObsidianVaultReader` 中只返回直接子目录：

```ts
async listFolders(path: string): Promise<string[]> {
  const folder = this.app.vault.getFolderByPath(path);
  if (!(folder instanceof TFolder)) return [];
  return folder.children
    .filter((child): child is TFolder => child instanceof TFolder)
    .map((child) => child.path);
}
```

- [x] **步骤 4：实现领域归组、活动位置和稳定排序**

在 `src/data-sources.ts` 增加纯 helper：

```ts
function buildDomainSummary(folderPath: string, files: ListedNote[]): DomainSummary {
  const name = folderPath.split("/").pop() || folderPath;
  const owned = files.filter((file) => file.path.startsWith(`${folderPath}/`));
  const latest = recentNotes(owned);
  const relativeParts = latest[0]?.path.slice(folderPath.length + 1).split("/") ?? [];
  const parentParts = relativeParts.slice(0, -1);
  return {
    name,
    path: folderPath,
    count: owned.length,
    latestMtime: latest[0]?.mtime ?? null,
    recentLocation: [name, ...parentParts].join(" / "),
    recentNotes: latest
  };
}

async function buildDomainSummaries(
  reader: VaultReader,
  setting: DataSourceSetting,
  files: ListedNote[]
): Promise<DomainSummary[]> {
  if (!setting.enabled || !await reader.exists(setting.path)) return [];
  const folders = await reader.listFolders(setting.path);
  return folders.map((path) => buildDomainSummary(path, files))
    .sort((left, right) => (right.latestMtime ?? -1) - (left.latestMtime ?? -1)
      || left.name.localeCompare(right.name, "zh-Hans-CN"));
}
```

在 `collectLocalSnapshot` 中创建并返回：

```ts
const domains = await buildDomainSummaries(reader, settings.sources.domain, areaFiles.domain);
return { counts, areas, domains, projectsSummary, healthSummary, tasks, userProfileSummary, issues };
```

- [x] **步骤 5：证明领域详情不会进入 DeepSeek 上下文**

在 `tests/action-context.test.ts` 的 snapshot 放入一个带路径和标题的领域摘要，并断言：

```ts
const context = buildActionContext(snapshot);
const json = JSON.stringify(context);
expect(json).not.toContain("domain/it/private-note.md");
expect(json).not.toContain("DomainSummary");
```

- [x] **步骤 6：运行测试确认通过**

运行：

```bash
npm test -- --run tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts
```

预期：三个测试文件全部 PASS。

- [x] **步骤 7：提交领域数据层**

```bash
git add src/types.ts src/data-sources.ts tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts
git commit -m "feat: 生成 Domain 子领域摘要"
```

## 任务 2：持久化并解析当前聚焦领域

**文件：**
- 创建：`src/domain-focus.ts`
- 创建：`tests/domain-focus.test.ts`
- 修改：`src/types.ts`
- 修改：`src/settings.ts`
- 修改：`tests/settings.test.ts`
- 修改：`src/main.ts`
- 修改：`tests/source-contract.test.ts`

- [x] **步骤 1：为默认选择、失效回退和短标识编写失败测试**

创建 `tests/domain-focus.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { domainShortLabel, resolveFocusedDomain } from "../src/domain-focus";
import type { DomainSummary } from "../src/types";

const domains: DomainSummary[] = [
  { name: "ai", path: "domain/ai", count: 2, latestMtime: 20, recentLocation: "ai", recentNotes: [] },
  { name: "it", path: "domain/it", count: 3, latestMtime: 10, recentLocation: "it", recentNotes: [] }
];

describe("domain focus", () => {
  it("uses the newest domain initially and restores a valid preference", () => {
    expect(resolveFocusedDomain(domains)?.path).toBe("domain/ai");
    expect(resolveFocusedDomain(domains, "domain/it")?.path).toBe("domain/it");
  });

  it("falls back when the saved domain no longer exists", () => {
    expect(resolveFocusedDomain(domains, "domain/deleted")?.path).toBe("domain/ai");
    expect(resolveFocusedDomain([], "domain/it")).toBeNull();
  });

  it("builds stable compact labels", () => {
    expect(domainShortLabel("it")).toBe("IT");
    expect(domainShortLabel("AI")).toBe("AI");
    expect(domainShortLabel("finance")).toBe("F");
    expect(domainShortLabel("业务")).toBe("业务");
    expect(domainShortLabel("知识领域")).toBe("知");
  });
});
```

在 `tests/settings.test.ts` 增加路径规范化断言：

```ts
expect(migrateSettings({ focusedDomainPath: " domain\\it " }).focusedDomainPath)
  .toBe("domain/it");
expect(migrateSettings({ focusedDomainPath: " / " }).focusedDomainPath).toBeUndefined();
```

- [x] **步骤 2：运行定向测试确认模块和设置字段缺失**

运行：

```bash
npm test -- --run tests/domain-focus.test.ts tests/settings.test.ts
```

预期：FAIL，错误包含无法解析 `../src/domain-focus` 或 `focusedDomainPath` 缺失。

- [x] **步骤 3：实现纯领域焦点 helper**

创建 `src/domain-focus.ts`：

```ts
import type { DomainSummary } from "./types";

export function resolveFocusedDomain(
  domains: DomainSummary[],
  preferredPath?: string
): DomainSummary | null {
  return domains.find((domain) => domain.path === preferredPath) ?? domains[0] ?? null;
}

export function domainShortLabel(name: string): string {
  const characters = Array.from(name.trim());
  return (characters.length <= 3 ? characters.join("") : characters[0] ?? "?").toUpperCase();
}
```

- [x] **步骤 4：迁移本地聚焦路径**

在 `DashboardSettings` 增加：

```ts
focusedDomainPath?: string;
```

在 `migrateSettings` 返回值中增加：

```ts
focusedDomainPath: normalizePath(candidate.focusedDomainPath) || undefined,
```

不要在 `DashboardSettingTab` 中增加设置项。

- [x] **步骤 5：为 controller 增加最小持久化入口**

在 `DashboardViewController` 增加：

```ts
setFocusedDomainPath(path: string): Promise<void>;
```

在 `AiKnowledgeDashboardPlugin` 实现：

```ts
async setFocusedDomainPath(path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || this.settings.focusedDomainPath === normalized) return;
  this.settings.focusedDomainPath = normalized;
  await this.saveData(this.settings);
}
```

从 `./settings` 同时导入 `normalizePath`。此方法不调用 `store.refresh()`。

- [x] **步骤 6：锁定本地保存、不刷新和不进入 Settings UI 的源码契约**

在 `tests/source-contract.test.ts` 增加：

```ts
expect(mainSource).toContain("async setFocusedDomainPath(path: string)");
expect(mainSource).toContain("this.settings.focusedDomainPath = normalized");
expect(mainSource).toContain("await this.saveData(this.settings)");
expect(readFileSync("src/settings-tab.ts", "utf8")).not.toContain("focusedDomainPath");
```

- [x] **步骤 7：运行测试确认通过**

运行：

```bash
npm test -- --run tests/domain-focus.test.ts tests/settings.test.ts tests/source-contract.test.ts
```

预期：三个测试文件全部 PASS。

- [x] **步骤 8：提交聚焦状态逻辑**

```bash
git add src/domain-focus.ts tests/domain-focus.test.ts src/types.ts src/settings.ts tests/settings.test.ts src/main.ts src/views/dashboard-view.ts tests/source-contract.test.ts
git commit -m "feat: 记忆 Dashboard 聚焦领域"
```

## 任务 3：用聚焦式领域浏览器替换首页四卡概览

**文件：**
- 修改：`src/views/dashboard-view.ts`
- 修改：`tests/source-contract.test.ts`

- [x] **步骤 1：把旧四卡契约改为领域浏览器契约**

删除 `tests/source-contract.test.ts` 中对 `akd-progress-cards`、两列卡片和“查看 →”的要求，增加：

```ts
it("renders a focused Domain browser after action guidance", () => {
  const actionControls = dashboardViewSource.indexOf('cls: "akd-ai-controls"');
  const domainOverview = dashboardViewSource.indexOf('cls: "akd-domain-overview"');
  expect(actionControls).toBeLessThan(domainOverview);
  expect(dashboardViewSource).toContain("akd-domain-rail");
  expect(dashboardViewSource).toContain("akd-domain-tabs");
  expect(dashboardViewSource).toContain("akd-domain-focus");
  expect(dashboardViewSource).toContain("最近 3 篇笔记");
  expect(dashboardViewSource).toContain("进入领域");
  expect(dashboardViewSource).not.toContain("renderAreaCard");
  expect(dashboardViewSource).not.toContain("akd-progress-cards");
});
```

增加源码契约，要求 `aria-pressed`、完整标题 `title` 和 Knowledge Map 当前领域样式存在。

- [x] **步骤 2：运行源码契约确认失败**

运行：

```bash
npm test -- --run tests/source-contract.test.ts
```

预期：FAIL，缺少 `akd-domain-overview`，且仍包含 `renderAreaCard`。

- [x] **步骤 3：接入聚焦状态并渲染空状态**

在 `DashboardView` 增加：

```ts
private focusedDomainPath = this.controller.settings.focusedDomainPath;
private focusedKnowledgePath: string | null = null;
```

在 `renderDashboard` 保持行动建议之后调用：

```ts
this.renderDomainOverview(parent);
```

`renderDomainOverview` 先处理：Domain 未启用、路径问题已在 issues 中、没有直接子目录三种状态。领域为空时显示：

```ts
parent.createDiv({ cls: "akd-message", text: "Domain 下暂无知识领域。" });
```

- [x] **步骤 4：渲染桌面 rail 和窄屏 tabs**

使用同一组领域生成两个选择入口，避免两套状态：

```ts
const focused = resolveFocusedDomain(domains, this.focusedDomainPath);
if (!focused) return;
if (focused.path !== this.focusedDomainPath) {
  this.focusedDomainPath = focused.path;
  void this.controller.setFocusedDomainPath(focused.path);
}

const overview = parent.createDiv({ cls: "akd-domain-overview" });
const rail = overview.createEl("nav", {
  cls: "akd-domain-rail",
  attr: { "aria-label": "知识领域" }
});
const tabs = overview.createDiv({ cls: "akd-domain-tabs" });
domains.forEach((domain) => {
  this.renderDomainSelector(rail, domain, focused.path, false);
  this.renderDomainSelector(tabs, domain, focused.path, true);
});
this.renderFocusedDomain(overview, focused);
```

领域按钮设置 `title: domain.name`、`aria-pressed`，点击时只修改当前 path、调用 controller 保存并重新渲染。

- [x] **步骤 5：渲染三篇最近笔记与进入领域行为**

聚焦主体使用现有 `renderRecentNote` 打开新标签，并明确空状态：

```ts
focus.createEl("p", { cls: "akd-domain-recent-label", text: "最近 3 篇笔记" });
if (domain.recentNotes.length === 0) {
  focus.createDiv({ cls: "akd-domain-empty", text: "暂无 Markdown 笔记。" });
} else {
  const notes = focus.createDiv({ cls: "akd-domain-recent-notes" });
  domain.recentNotes.forEach((note) => this.renderRecentNote(notes, note));
}
const enter = focus.createEl("button", {
  cls: "akd-enter-domain",
  text: `进入 ${domain.name} 领域 →`
});
enter.addEventListener("click", () => {
  this.focusedKnowledgePath = domain.path;
  this.activePage = "knowledge";
  this.render();
});
```

删除 `EMPTY_AREA`、`renderAreaCard` 及不再使用的 `AreaSummary` import。

- [x] **步骤 6：让 Knowledge Map 标记并定位当前领域**

在 `renderKnowledge` 创建每张卡片时设置：

```ts
card.dataset.domainPath = child.path;
if (child.path === this.focusedKnowledgePath) {
  card.addClass("is-focused-domain");
  requestAnimationFrame(() => card.scrollIntoView({ block: "nearest" }));
}
```

- [x] **步骤 7：运行契约与完整类型检查**

运行：

```bash
npm test -- --run tests/source-contract.test.ts
npm run check
```

预期：源码契约 PASS；TypeScript 与全部测试 PASS。

- [x] **步骤 8：提交领域视图结构**

```bash
git add src/views/dashboard-view.ts tests/source-contract.test.ts
git commit -m "feat: 用聚焦领域浏览器替换首页概览"
```

## 任务 4：实现 overlay rail 与多屏响应式样式

**文件：**
- 修改：`src/styles.css`
- 修改：`tests/source-contract.test.ts`

- [x] **步骤 1：为精确尺寸、防粘住和响应式写失败契约**

在 `tests/source-contract.test.ts` 增加：

```ts
it("uses an overlay Domain rail without sticky mouse focus", () => {
  expect(dashboardStyles).toContain("grid-template-columns: 54px minmax(0, 1fr)");
  expect(dashboardStyles).toContain("width: 54px");
  expect(dashboardStyles).toContain("width: 210px");
  expect(dashboardStyles).toContain("position: absolute");
  expect(dashboardStyles).toContain(":has(.akd-domain-button:focus-visible)");
  expect(dashboardStyles).not.toContain(".akd-domain-rail:focus-within");
  expect(dashboardStyles).toContain("transition: width 160ms");
  expect(dashboardStyles).toContain("max-width: 980px");
  expect(dashboardStyles).toContain("@container (max-width: 679px)");
  expect(dashboardStyles).toContain("@media (hover: none)");
});
```

- [x] **步骤 2：运行契约确认样式缺失**

运行：

```bash
npm test -- --run tests/source-contract.test.ts
```

预期：FAIL，缺少 54px/210px overlay rail 和 679px container 规则。

- [x] **步骤 3：替换旧领域卡片样式**

删除 `.akd-progress-cards`、`.akd-progress-card`、`.akd-area-*` 规则，新增核心布局：

```css
.akd-domain-overview {
  container-type: inline-size;
  position: relative;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  width: 100%;
  max-width: 980px;
  min-height: 360px;
  overflow: hidden;
}

.akd-domain-rail {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 2;
  width: 54px;
  overflow: hidden;
  transition: width 160ms ease, box-shadow 160ms ease;
}

.akd-domain-rail:hover,
.akd-domain-rail:has(.akd-domain-button:focus-visible) {
  width: 210px;
}

.akd-domain-focus {
  grid-column: 2;
  min-width: 0;
}
```

按钮清除 Obsidian 默认 `appearance`、边框、阴影和最小尺寸。选中按钮使用 `aria-pressed="true"` 对应类或属性样式。

- [x] **步骤 4：增加窄容器与无 hover 降级**

```css
.akd-domain-tabs { display: none; }

@container (max-width: 679px) {
  .akd-domain-overview { display: block; }
  .akd-domain-rail { display: none; }
  .akd-domain-tabs { display: flex; overflow-x: auto; }
}

@media (hover: none) {
  .akd-domain-overview { display: block; }
  .akd-domain-rail { display: none; }
  .akd-domain-tabs { display: flex; overflow-x: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .akd-domain-rail { transition: none; }
}
```

最近笔记标题保留两行 clamp，时间在窄容器下换到下一行；大屏不增加笔记数量。

- [x] **步骤 5：增加 Knowledge Map 聚焦样式**

```css
.akd-map-card.is-focused-domain {
  border: 2px solid var(--akd-accent);
  background: var(--akd-accent-soft);
}
```

- [x] **步骤 6：运行契约与完整检查**

运行：

```bash
npm test -- --run tests/source-contract.test.ts
npm run check
git diff --check
```

预期：源码契约和全部测试 PASS，`git diff --check` 无错误。

- [x] **步骤 7：提交响应式交互样式**

```bash
git add src/styles.css tests/source-contract.test.ts
git commit -m "feat: 实现覆盖式 Domain 领域栏"
```

## 任务 5：构建、安装与更新 Draft PR

**文件：**
- 更新：`main.js`
- 更新：`styles.css`
- 验证：`manifest.json`
- 安装：`C:\develop\notes\.obsidian\plugins\ai-knowledge-dashboard\main.js`
- 安装：`C:\develop\notes\.obsidian\plugins\ai-knowledge-dashboard\styles.css`
- 安装：`C:\develop\notes\.obsidian\plugins\ai-knowledge-dashboard\manifest.json`

- [x] **步骤 1：执行完整验证与生产构建**

```bash
npm run check
npm run build
git diff --check
```

预期：TypeScript、全部 Vitest 测试和 esbuild 生产构建通过。

- [x] **步骤 2：检查交付范围**

```bash
git status --short
git diff --stat
git diff --name-only
```

预期：只包含本计划列出的源码、测试、文档和构建产物；不得出现 `data.json`、API Key、用户画像或知识库私人文件。

- [x] **步骤 3：安装并校验运行文件**

```bash
npm run install:notes
```

分别对仓库与 `C:\develop\notes\.obsidian\plugins\ai-knowledge-dashboard` 中的 `main.js`、`styles.css`、`manifest.json` 执行 `Get-FileHash`；预期三个文件均完全一致。

- [x] **步骤 4：在真实 Obsidian 布局中手动验收**

保持 Obsidian 原生左右侧栏打开，重新加载插件后验证：

1. Action Guide 和行动建议仍在知识领域之前。
2. 首页不再显示 Inbox、Projects、Wiki 四卡概览。
3. 领域栏默认 54px，悬停覆盖展开，鼠标移出收缩，主体不重排。
4. 鼠标点击领域后不会粘住；Tab 键焦点仍能看到完整领域名。
5. 领域主体固定显示三篇最近笔记，笔记和进入领域入口可用。
6. 缩窄中间内容区后出现横向选择器；恢复宽度后回到领域栏。
7. 重开 Dashboard 后恢复上次领域选择。

- [x] **步骤 5：提交构建产物**

```bash
git add main.js styles.css
git commit -m "build: 更新聚焦领域概览产物"
```

- [ ] **步骤 6：推送并更新现有 Draft PR #3**

```bash
git push origin codex/sidebar-first-dashboard
gh pr view 3 --json number,state,isDraft,url,headRefName
```

预期：PR #3 仍为 OPEN Draft，head 为 `codex/sidebar-first-dashboard`，包含本计划新增提交。

## 最终停止条件

- 首页领域概览只展示 Domain 直接子领域，不再混入 Inbox、Projects、Wiki。
- 领域摘要、默认焦点、持久化、overlay、鼠标移出、键盘焦点和窄屏降级均有自动化测试。
- 聚焦主体始终只展示三篇最近笔记，不根据屏幕大小改变信息集合。
- DeepSeek context 不包含领域路径、最近笔记或聚焦偏好。
- 完整测试、构建、安装哈希和真实 Obsidian 验收均通过。
- Draft PR #3 已更新且不包含本地设置或私人内容。
