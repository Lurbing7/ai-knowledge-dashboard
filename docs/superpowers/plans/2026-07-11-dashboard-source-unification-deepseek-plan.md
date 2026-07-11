# Dashboard 源码统一与 DeepSeek 行动建议实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 统一 AI Knowledge Dashboard 源码与安装产物，保留固定 Dashboard 标签但恢复 Obsidian 默认启动逻辑，并用安全的 DeepSeek API 生成最多三条下一步行动建议。

**架构：** 插件核心拆成配置、数据源、状态 Store、行动上下文、DeepSeek 客户端和视图六个边界。Vault 事件只刷新本地状态并标记建议过期；用户明确点击后才构建有界上下文并调用 DeepSeek。仓库源码是唯一主版本，安装脚本构建后复制三个运行文件并校验哈希。

**技术栈：** TypeScript 5、Obsidian Plugin API、esbuild、Vitest、DeepSeek Chat Completions API、Obsidian SecretStorage。

---

## 目标文件结构

### 创建

- `src/types.ts`：设置、数据快照、行动上下文、行动建议和错误类型。
- `src/settings.ts`：最终默认设置、旧设置迁移和数据源规范化。
- `src/data-sources.ts`：有界读取 Projects、Health、Task Queue、统计和用户画像。
- `src/action-context.ts`：脱敏上下文、稳定序列化和指纹。
- `src/dashboard-store.ts`：本地快照、订阅、防抖刷新和建议过期状态。
- `src/deepseek-client.ts`：HTTP 传输、重试、错误码映射和 JSON 读取。
- `src/action-advisor.ts`：行动 Prompt、响应校验和生成协调。
- `src/views/dashboard-view.ts`：Dashboard 页面、建议状态和操作反馈。
- `tests/settings.test.ts`：设置默认值与迁移契约。
- `tests/data-sources.test.ts`：读取白名单和解析契约。
- `tests/action-context.test.ts`：脱敏与指纹契约。
- `tests/dashboard-store.test.ts`：刷新和过期状态契约。
- `tests/deepseek-client.test.ts`：请求、重试与错误契约。
- `tests/action-advisor.test.ts`：建议结构与优先级契约。
- `tests/dashboard-lifecycle.test.ts`：固定标签且不抢启动焦点的契约。
- `tests/source-contract.test.ts`：旧路径、CLI 和明文密钥回归契约。

### 修改

- `src/main.ts`：收敛为插件生命周期、依赖装配、命令和事件注册。
- `src/styles.css`：数据源状态、过期状态、建议卡和持久错误样式。
- `package.json` / `package-lock.json`：Vitest 和测试脚本。
- `manifest.json` / `versions.json`：版本、最低 Obsidian 版本和跨端声明。
- `scripts/install-local.mjs`：复制后校验运行文件哈希。
- `README.md`：最终目录、DeepSeek、隐私和使用方式。
- `docs/DEVELOPMENT_PLAN.md`：替换旧架构与旧路线。

### 删除或不再生成

- Claude Code / Codex CLI analyzer、子进程和检测 UI。
- `openOnStartup` 设置与 `onLayoutReady` 自动激活。
- `raw/`、`domain/project` 和硬编码行动指南。

---

### 任务 1：建立测试与源码契约

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`
- 创建：`tests/source-contract.test.ts`

- [ ] **步骤 1：安装 Vitest 并添加测试脚本**

运行：

```powershell
npm ci
npm install --save-dev vitest
```

将脚本调整为：

```json
{
  "test": "vitest run",
  "check": "tsc -noEmit -skipLibCheck && vitest run",
  "build": "npm run check && node esbuild.config.mjs production && node scripts/copy-styles.mjs"
}
```

- [ ] **步骤 2：编写失败的源码契约测试**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/main.ts", "utf8");

describe("final source contract", () => {
  it("does not activate the dashboard during layout restore", () => {
    expect(source).not.toContain("onLayoutReady");
    expect(source).not.toContain("openOnStartup");
  });

  it("does not retain legacy paths or local CLI analyzers", () => {
    expect(source).not.toMatch(/raw\/|domain\/project/);
    expect(source).not.toMatch(/ClaudeAnalyzer|CodexAnalyzer|child_process/);
  });
});
```

- [ ] **步骤 3：运行测试确认当前实现失败**

运行：`npm test -- tests/source-contract.test.ts`

预期：关于 `onLayoutReady`、`openOnStartup` 或 `raw/` 的断言失败。

- [ ] **步骤 4：提交测试工具与失败契约**

```powershell
git add package.json package-lock.json tests/source-contract.test.ts
git commit -m "test: 建立 Dashboard 最终源码契约"
```

---

### 任务 2：实现最终设置与旧配置迁移

**文件：**
- 创建：`src/types.ts`
- 创建：`src/settings.ts`
- 创建：`tests/settings.test.ts`

- [ ] **步骤 1：编写设置迁移失败测试**

测试必须覆盖：最终默认路径、User Profile 通用默认关闭、空路径关闭，以及旧字段被移除。

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, migrateSettings } from "../src/settings";

describe("settings", () => {
  it("uses the final vault defaults", () => {
    expect(DEFAULT_SETTINGS.sources.inbox).toEqual({ enabled: true, path: "inbox" });
    expect(DEFAULT_SETTINGS.sources.domain.path).toBe("domain");
    expect(DEFAULT_SETTINGS.sources.projects.path).toBe("projects");
    expect(DEFAULT_SETTINGS.sources.health.path).toBe("wiki/HEALTH.md");
    expect(DEFAULT_SETTINGS.sources.taskQueue.path).toBe("inbox/tasks");
    expect(DEFAULT_SETTINGS.sources.userProfile).toEqual({ enabled: false, path: "private/用户画像.md" });
  });

  it("drops legacy startup and analyzer settings", () => {
    const migrated = migrateSettings({
      openOnStartup: true,
      selectedAnalyzer: "claude",
      latestAnalysis: { score: 50 },
      inboxFolder: "raw/inbox",
      sourcesFolder: "raw/sources"
    });
    expect(migrated).not.toHaveProperty("openOnStartup");
    expect(migrated).not.toHaveProperty("selectedAnalyzer");
    expect(migrated.sources.inbox.path).toBe("inbox");
    expect(migrated.sources.domain.path).toBe("domain");
  });
});
```

- [ ] **步骤 2：运行测试验证模块缺失**

运行：`npm test -- tests/settings.test.ts`

预期：FAIL，无法导入 `src/settings.ts`。

- [ ] **步骤 3：实现类型与设置迁移**

核心类型必须保持一致：

```ts
export interface DataSourceSetting {
  enabled: boolean;
  path: string;
}

export type AdvicePriority = "P0" | "P1" | "P2";
export type CollaborationMode = "learning" | "execution";

export interface ActionAdvice {
  priority: AdvicePriority;
  title: string;
  reason: string;
  sources: string[];
  estimate: string;
  acceptance: string;
  mode: CollaborationMode;
  aiHelp: string;
}

export interface AdviceState {
  actions: ActionAdvice[];
  generatedAt: number;
  contextFingerprint: string;
  status: "fresh" | "stale" | "error";
  errorMessage?: string;
}

export interface DashboardSettings {
  actionLimit: number;
  deepseekModel: "deepseek-v4-flash" | "deepseek-v4-pro";
  deepseekSecretName: string;
  sources: {
    inbox: DataSourceSetting;
    domain: DataSourceSetting;
    projects: DataSourceSetting;
    wiki: DataSourceSetting;
    health: DataSourceSetting;
    taskQueue: DataSourceSetting;
    assets: DataSourceSetting;
    userProfile: DataSourceSetting;
  };
  latestAdvice: AdviceState | null;
}
```

`migrateSettings()` 必须新建最终对象，不把未知旧字段 spread 回结果；路径经过 trim、斜杠统一和空路径关闭处理。

- [ ] **步骤 4：运行设置测试并提交**

运行：`npm test -- tests/settings.test.ts`

预期：PASS。

```powershell
git add src/types.ts src/settings.ts tests/settings.test.ts
git commit -m "feat: 统一 Dashboard 最终设置模型"
```

---

### 任务 3：实现有界数据源读取与隐私白名单

**文件：**
- 创建：`src/data-sources.ts`
- 创建：`tests/data-sources.test.ts`

- [ ] **步骤 1：编写数据源失败测试**

使用内存 `VaultReader`，验证关闭的数据源不读取、缺失路径产生配置问题、用户画像只保留允许章节。

```ts
class MemoryVaultReader {
  constructor(private readonly files: Record<string, string>) {}
  async exists(path: string): Promise<boolean> { return path in this.files; }
  async read(path: string): Promise<string> { return this.files[path] ?? ""; }
  async listMarkdown(path: string) {
    return Object.keys(this.files)
      .filter((file) => file.startsWith(`${path}/`) && file.endsWith(".md"))
      .map((file) => ({ path: file, mtime: 1 }));
  }
}

const reader = new MemoryVaultReader({
  "private/用户画像.md": "# 用户画像\n## 当前阶段\n当前目标 A\n## 行动优先级\nP0 事项\n## 稳定画像\n不应发送的私人背景",
  "wiki/HEALTH.md": "# 健康报告\n## 结论\n可用\n## 维护信号\n无阻断",
  "inbox/tasks/todo/task.md": "---\nstatus: todo\nkind: structure\n---\n# 修复入口"
});

it("extracts only approved user profile sections", async () => {
  const result = await readUserProfileSummary(reader, "private/用户画像.md");
  expect(result).toContain("当前阶段");
  expect(result).toContain("行动优先级");
  expect(result).not.toContain("稳定画像");
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- tests/data-sources.test.ts`

预期：FAIL，读取器和解析函数不存在。

- [ ] **步骤 3：实现读取端口与解析器**

```ts
export interface VaultReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  listMarkdown(path: string): Promise<Array<{ path: string; mtime: number }>>;
}
```

实现以下确定性函数：

- `readHealthSummary()`：只取“结论”和“维护信号”。
- `readTaskQueueSummary()`：只取 todo / doing 的标题、status、kind。
- `readProjectActionSummary()`：只读 `<projects>/00-行动看板.md`。
- `readUserProfileSummary()`：只取当前阶段、行动优先级、AI 协作偏好，并从 frontmatter 取目标和核验日期。
- `collectLocalSnapshot()`：统计启用目录，返回 `issues` 而不是旧路径回退。
- `ObsidianVaultReader`：使用 `Vault.getAbstractFileByPath()`、`Vault.cachedRead()` 和 `Vault.getMarkdownFiles()` 实现上述端口，供 `main.ts` 注入。

- [ ] **步骤 4：运行测试并提交**

运行：`npm test -- tests/data-sources.test.ts`

预期：PASS。

```powershell
git add src/data-sources.ts tests/data-sources.test.ts
git commit -m "feat: 添加有界知识库数据源读取"
```

---

### 任务 4：实现脱敏上下文、指纹与事件刷新 Store

**文件：**
- 创建：`src/action-context.ts`
- 创建：`src/dashboard-store.ts`
- 创建：`tests/action-context.test.ts`
- 创建：`tests/dashboard-store.test.ts`

- [ ] **步骤 1：编写上下文与 Store 失败测试**

```ts
it("never includes absolute paths or disabled source content", () => {
  const context = buildActionContext(snapshot, settings);
  const json = JSON.stringify(context);
  expect(json).not.toContain("C:\\develop");
  expect(json).not.toContain("credentials");
});

it("marks advice stale only when the context fingerprint changes", async () => {
  const store = new DashboardStore(loader);
  await store.refresh();
  store.acceptAdvice(advice, store.state.contextFingerprint);
  await store.refresh();
  expect(store.state.adviceStatus).toBe("fresh");
  loader.snapshot.projectsSummary = "changed";
  await store.refresh();
  expect(store.state.adviceStatus).toBe("stale");
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- tests/action-context.test.ts tests/dashboard-store.test.ts`

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现上下文与 Store**

`buildActionContext()` 只组装任务 3 的摘要；`stableFingerprint()` 对键排序后的 JSON 执行确定性哈希。`DashboardStore` 暴露：

```ts
subscribe(listener: (state: DashboardState) => void): () => void;
refresh(): Promise<void>;
scheduleRefresh(changedPath: string): void;
acceptAdvice(actions: ActionAdvice[], fingerprint: string): void;
setAdviceError(message: string): void;
clearAdvice(): void;
```

`scheduleRefresh()` 只响应启用路径，使用 500ms 防抖；失败更新 `issues`，不清空上次成功建议。

- [ ] **步骤 4：运行测试并提交**

运行：`npm test -- tests/action-context.test.ts tests/dashboard-store.test.ts`

预期：PASS。

```powershell
git add src/action-context.ts src/dashboard-store.ts tests/action-context.test.ts tests/dashboard-store.test.ts
git commit -m "feat: 添加 Dashboard 事件刷新与建议过期状态"
```

---

### 任务 5：实现 DeepSeek 客户端与行动建议校验

**文件：**
- 创建：`src/deepseek-client.ts`
- 创建：`src/action-advisor.ts`
- 创建：`tests/deepseek-client.test.ts`
- 创建：`tests/action-advisor.test.ts`

- [ ] **步骤 1：编写 DeepSeek 失败测试**

测试注入 `DeepSeekTransport`，不访问真实网络：

```ts
const completion = (content: string) => ({
  choices: [{ message: { content } }]
});

class QueueTransport implements DeepSeekTransport {
  readonly calls: unknown[] = [];
  constructor(private readonly responses: Array<{ status: number; json: unknown }>) {}
  async post(input: unknown) {
    this.calls.push(input);
    const response = this.responses.shift();
    if (!response) throw new Error("No queued response");
    return response;
  }
}

it("retries one empty JSON response and returns validated actions", async () => {
  const transport = new QueueTransport([
    { status: 200, json: completion("") },
    { status: 200, json: completion(validActionsJson) }
  ]);
  const client = new DeepSeekClient(transport);
  const result = await client.generate(request);
  expect(result.actions).toHaveLength(1);
  expect(transport.calls).toHaveLength(2);
});

it.each([[401, "API Key"], [402, "余额"], [429, "限流"], [503, "服务"]])(
  "maps status %s to a readable error",
  async (status, text) => {
    await expect(clientForStatus(status).generate(request)).rejects.toThrow(text);
  }
);
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- tests/deepseek-client.test.ts tests/action-advisor.test.ts`

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现传输、Prompt 与校验**

```ts
export interface DeepSeekTransport {
  post(input: {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<{ status: number; json: unknown }>;
}
```

请求体固定包含：

```ts
{
  model,
  messages: [
    { role: "system", content: ACTION_ADVISOR_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(context) }
  ],
  response_format: { type: "json_object" },
  stream: false,
  max_tokens: 1600
}
```

`parseActionAdvice()` 强制 1—3 项、P0/P1/P2、learning/execution、非空字段、来源属于实际上下文。Prompt 明确排除 Paused/Future，Maintenance 仅在阻断现实目标时允许。

- [ ] **步骤 4：运行测试并提交**

运行：`npm test -- tests/deepseek-client.test.ts tests/action-advisor.test.ts`

预期：PASS。

```powershell
git add src/deepseek-client.ts src/action-advisor.ts tests/deepseek-client.test.ts tests/action-advisor.test.ts
git commit -m "feat: 接入 DeepSeek 下一步行动建议"
```

---

### 任务 6：修复 Dashboard 固定标签与启动恢复

**文件：**
- 修改：`src/main.ts`
- 创建：`tests/dashboard-lifecycle.test.ts`
- 修改：`tests/source-contract.test.ts`

- [ ] **步骤 1：编写生命周期失败测试**

使用 Vitest mock `obsidian`，验证 onload 不调用激活、手动打开会固定、已有标签不重复。

```ts
it("does not open or reveal the dashboard during plugin load", async () => {
  const plugin = createPluginHarness();
  await plugin.onload();
  expect(plugin.workspace.getLeaf).not.toHaveBeenCalled();
  expect(plugin.workspace.revealLeaf).not.toHaveBeenCalled();
});

it("creates and pins one dashboard only on explicit activation", async () => {
  const plugin = createPluginHarness();
  await plugin.activateDashboardView();
  expect(plugin.workspace.getLeaf).toHaveBeenCalledWith("tab");
  expect(plugin.leaf.setPinned).toHaveBeenCalledWith(true);
  await plugin.activateDashboardView();
  expect(plugin.workspace.getLeaf).toHaveBeenCalledTimes(1);
});
```

- [ ] **步骤 2：运行测试确认旧生命周期失败**

运行：`npm test -- tests/dashboard-lifecycle.test.ts tests/source-contract.test.ts`

预期：FAIL，旧代码仍在 onLayoutReady 激活且未固定新标签。

- [ ] **步骤 3：重写插件生命周期和依赖装配**

`onload()` 必须：加载迁移设置、创建 Store、注册 View/Ribbon/Command/SettingTab、注册四类 Vault 事件；不得创建或 reveal Dashboard。

显式激活逻辑：

```ts
async activateDashboardView(): Promise<void> {
  const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
  if (existing) {
    await this.app.workspace.revealLeaf(existing);
    return;
  }
  const leaf = this.app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
  leaf.setPinned(true);
  await this.app.workspace.revealLeaf(leaf);
}
```

- [ ] **步骤 4：运行生命周期测试与完整检查并提交**

运行：`npm run check`

预期：全部测试通过，TypeScript 无错误。

```powershell
git add src/main.ts tests/dashboard-lifecycle.test.ts tests/source-contract.test.ts
git commit -m "fix: 保留固定 Dashboard 且恢复默认启动逻辑"
```

---

### 任务 7：集成设置页、SecretStorage 与 Dashboard UI

**文件：**
- 修改：`src/settings.ts`
- 创建：`src/views/dashboard-view.ts`
- 修改：`src/styles.css`
- 修改：`src/main.ts`
- 修改：`manifest.json`
- 修改：`versions.json`
- 测试：`tests/source-contract.test.ts`

- [ ] **步骤 1：扩展源码契约测试**

断言：

```ts
import { readFileSync } from "node:fs";

const allSource = [
  "src/main.ts",
  "src/settings.ts",
  "src/deepseek-client.ts",
  "src/views/dashboard-view.ts"
].map((path) => readFileSync(path, "utf8")).join("\n");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as {
  minAppVersion: string;
  isDesktopOnly: boolean;
};

expect(allSource).toContain("SecretComponent");
expect(allSource).toContain("secretStorage");
expect(allSource).toContain("deepseek-v4-flash");
expect(allSource).not.toMatch(/selectedAnalyzer|latestAnalysis|buildActionGuides/);
expect(manifest.minAppVersion).toBe("1.11.4");
expect(manifest.isDesktopOnly).toBe(false);
```

- [ ] **步骤 2：运行测试确认 UI 尚未集成**

运行：`npm test -- tests/source-contract.test.ts`

预期：FAIL，SecretStorage、最终 manifest 或新视图尚未出现。

- [ ] **步骤 3：实现设置页**

每个数据源渲染 Toggle + Text；路径清空时自动关闭。DeepSeek 区域提供 SecretComponent、模型下拉、测试连接、用户画像授权开关和清除建议缓存。通用默认的 User Profile 仍为关闭；本地授权状态通过普通布尔设置持久化，API Key 值只从 `app.secretStorage` 读取。

同时在 `deepseek-client.ts` 增加 `ObsidianDeepSeekTransport`，内部使用 `requestUrl()`，只把 SecretStorage 返回的密钥放入当前请求的 Authorization header，不写回设置或日志。

- [ ] **步骤 4：实现 Dashboard UI**

Dashboard 订阅 Store，并展示：确定性统计、配置问题、最后建议、生成时间、fresh/stale/error 状态、发送数据类型预览、生成/重试按钮。失败必须有页面内持久错误；旧建议不得被清空。

- [ ] **步骤 5：运行完整检查并提交**

运行：`npm run check`

预期：全部测试通过。

```powershell
git add src/settings.ts src/views/dashboard-view.ts src/styles.css src/main.ts manifest.json versions.json tests/source-contract.test.ts
git commit -m "feat: 完成可配置 Dashboard 与安全密钥设置"
```

---

### 任务 8：构建、安装、文档与真实回归

**文件：**
- 修改：`scripts/install-local.mjs`
- 修改：`README.md`
- 修改：`docs/DEVELOPMENT_PLAN.md`
- 生成：`main.js`
- 生成：`styles.css`

- [ ] **步骤 1：为安装脚本加入哈希校验**

复制完成后，用 `createHash("sha256")` 分别比较仓库和安装目录的 `manifest.json`、`main.js`、`styles.css`；任一不一致时抛出错误并以非零状态退出。

- [ ] **步骤 2：更新 README 与开发计划**

文档必须说明：最终目录默认值、每个数据源可关闭、Dashboard 固定但不强制启动、DeepSeek SecretStorage、外部数据发送边界、手动生成建议、错误处理和本地安装步骤。删除旧 `raw/`、本地 CLI 和硬编码行动指南描述。

- [ ] **步骤 3：运行全量自动验证**

运行：

```powershell
npm run check
npm run build
npm run install:notes
git diff --check
```

预期：全部命令退出码 0，安装脚本报告三个文件哈希一致。

- [ ] **步骤 4：执行 Obsidian 手动回归**

按规格依次验证：文章 A 重启恢复、原生文件列表替换文章、Dashboard 不抢焦点、入口复用固定标签、关闭后重建固定标签、数据源变化刷新、建议过期、Secret 测试连接、DeepSeek 生成最多三条建议、错误持续显示。

- [ ] **步骤 5：检查敏感信息与最终差异**

运行：

```powershell
rg -n "sk-[A-Za-z0-9]|DEEPSEEK_API_KEY|api[_-]?key\s*[:=]" . --glob '!package-lock.json' --glob '!docs/superpowers/**'
git status --short
git diff --stat HEAD~1
```

预期：没有真实密钥；只包含计划内源码、测试、文档和构建产物。

- [ ] **步骤 6：提交交付结果**

```powershell
git add README.md docs/DEVELOPMENT_PLAN.md scripts/install-local.mjs main.js styles.css
git commit -m "docs: 完成 Dashboard DeepSeek 版本交付说明"
```

---

## 最终验证清单

- [ ] `npm run check` 通过。
- [ ] `npm run build` 通过。
- [ ] `npm run install:notes` 通过并确认三个哈希一致。
- [ ] `git diff --check` 无错误。
- [ ] 仓库中无 API Key。
- [ ] 启动标签回归按规格通过。
- [ ] DeepSeek 测试连接与行动建议生成通过。
- [ ] 安装目录运行文件与仓库一致。
- [ ] README 与开发计划不包含旧目录或 CLI 架构。
