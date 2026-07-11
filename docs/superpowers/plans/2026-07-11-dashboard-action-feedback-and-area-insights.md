# Dashboard 行动反馈与领域洞察实施计划

> **面向 AI 代理的工作者：** 使用 `executing-plans` 逐任务实现；所有行为变更先按 `test-driven-development` 验证红灯与绿灯。

**目标：** 为 DeepSeek 增加可配置 Thinking 与可靠 JSON 输出，为生成过程增加可见反馈，并让首页四类领域卡片展示数量、最近笔记和事实信号。

**架构：** Settings 管理模型推理选项，DeepSeekClient 只负责请求和严格响应解析，data-sources 统一生成本地领域摘要，DashboardView 只渲染状态与交互。最近笔记信息不进入 ActionContext。

**技术栈：** TypeScript、Obsidian Plugin API、Vitest、CSS、esbuild

---

## 文件职责

- 修改 `src/types.ts`：Thinking 设置、最近笔记、领域摘要类型。
- 修改 `src/settings.ts`、`src/settings-tab.ts`：默认值、迁移和设置界面。
- 修改 `src/main.ts`：将 Thinking 配置传给 DeepSeekClient。
- 修改 `src/action-advisor.ts`：完整 JSON 示例和简洁字段约束。
- 修改 `src/deepseek-client.ts`：Thinking 请求参数、输出预算、finish reason 和代码围栏解析。
- 修改 `src/data-sources.ts`：一次扫描生成 counts 与 area summaries。
- 修改 `src/views/dashboard-view.ts`：加载状态、计时器、领域卡片和 Wiki 页面。
- 修改 `src/styles.css`：加载动画、领域卡片、recent notes 和 reduced-motion。
- 修改相应 `tests/*.test.ts`：设置、客户端、数据和 UI 源码契约。

### 任务 1：Thinking 设置与迁移

**文件：**
- 修改：`tests/settings.test.ts`
- 修改：`src/types.ts`
- 修改：`src/settings.ts`
- 修改：`src/settings-tab.ts`

- [ ] **步骤 1：编写失败测试**

在 `tests/settings.test.ts` 断言默认值和迁移：

```ts
expect(DEFAULT_SETTINGS.deepseekThinkingEnabled).toBe(true);
expect(DEFAULT_SETTINGS.deepseekReasoningEffort).toBe("high");

expect(migrateSettings({
  deepseekThinkingEnabled: false,
  deepseekReasoningEffort: "max"
})).toMatchObject({
  deepseekThinkingEnabled: false,
  deepseekReasoningEffort: "max"
});

expect(migrateSettings({ deepseekReasoningEffort: "invalid" }))
  .toMatchObject({ deepseekThinkingEnabled: true, deepseekReasoningEffort: "high" });
```

- [ ] **步骤 2：运行红灯**

运行：`npm test -- tests/settings.test.ts`

预期：新设置字段不存在，测试失败。

- [ ] **步骤 3：实现最小设置支持**

在 `DashboardSettings` 增加：

```ts
deepseekThinkingEnabled: boolean;
deepseekReasoningEffort: "high" | "max";
```

默认使用 `true` 和 `high`；迁移仅接受布尔值与 `high|max`。在模型设置后增加 Toggle；开启时增加强度 Dropdown，关闭时隐藏但保留值。Toggle 变化后保存并调用 `display()`。

- [ ] **步骤 4：运行绿灯并提交**

运行：`npm test -- tests/settings.test.ts`

预期：该文件全部通过。

```bash
git add src/types.ts src/settings.ts src/settings-tab.ts tests/settings.test.ts
git commit -m "feat: 增加 DeepSeek Thinking 设置（任务 1/4）"
```

### 任务 2：DeepSeek 结构化输出可靠性

**文件：**
- 修改：`tests/deepseek-client.test.ts`
- 修改：`tests/action-advisor.test.ts`
- 修改：`src/deepseek-client.ts`
- 修改：`src/action-advisor.ts`
- 修改：`src/main.ts`

- [ ] **步骤 1：编写失败测试**

扩展 `GenerateActionsRequest` 测试三组请求：

```ts
expect(highBody).toMatchObject({
  thinking: { type: "enabled" },
  reasoning_effort: "high",
  max_tokens: 4800
});
expect(maxBody).toMatchObject({
  thinking: { type: "enabled" },
  reasoning_effort: "max",
  max_tokens: 8000
});
expect(disabledBody).toMatchObject({
  thinking: { type: "disabled" },
  max_tokens: 3200
});
expect(disabledBody).not.toHaveProperty("reasoning_effort");
```

增加响应测试：单一 ````json` 围栏成功；`finish_reason: "length"` 报“输出被截断”；JSON 前后解释文字仍报“无法解析”；错误不包含原始内容。提示词测试断言包含 `"actions"` JSON 样例和“只返回一个 JSON 对象”。

- [ ] **步骤 2：运行红灯**

运行：`npm test -- tests/deepseek-client.test.ts tests/action-advisor.test.ts`

预期：请求配置、finish reason、围栏和提示词测试失败。

- [ ] **步骤 3：实现最小客户端修复**

`GenerateActionsRequest` 增加：

```ts
thinkingEnabled: boolean;
reasoningEffort: "high" | "max";
```

建立 `buildGenerationOptions()` 返回三档参数。`extractCompletion()` 返回 `{ content, finishReason }`。`parseJson()` 先直接解析，再只接受完整匹配 `/^```(?:json)?\s*([\s\S]*?)\s*```$/i` 的单一围栏。`length` 在解析前报明确错误。`main.ts` 传入 Settings 值。提示词补完整最小 JSON 样例。

- [ ] **步骤 4：运行绿灯并提交**

运行：`npm test -- tests/deepseek-client.test.ts tests/action-advisor.test.ts`

预期：两文件全部通过。

```bash
git add src/deepseek-client.ts src/action-advisor.ts src/main.ts tests/deepseek-client.test.ts tests/action-advisor.test.ts
git commit -m "fix: 强化 DeepSeek Thinking 与 JSON 输出（任务 2/4）"
```

### 任务 3：领域摘要数据

**文件：**
- 修改：`tests/data-sources.test.ts`
- 修改：`tests/action-context.test.ts`
- 修改：`tests/dashboard-store.test.ts`
- 修改：`src/types.ts`
- 修改：`src/data-sources.ts`

- [ ] **步骤 1：编写失败测试**

固定 `now` 后构造四类文件，断言：

```ts
expect(snapshot.areas.inbox.recentNotes).toHaveLength(3);
expect(snapshot.areas.inbox.recentNotes.map(note => note.path)).toEqual([
  "inbox/new.md", "inbox/middle.md", "inbox/old.md"
]);
expect(snapshot.areas.inbox.signal.text).toBe("最近 7 天变化 2 篇");
expect(snapshot.areas.projects.signal.text).toContain("active-project");
expect(snapshot.areas.domain.signal.text).toContain("it");
expect(snapshot.areas.wiki.signal.text).toBe("Domain 有更晚更新");
```

在 action-context 测试断言序列化后的 context 不包含 `recentNotes`、`signal` 或笔记路径。更新 DashboardStore 测试快照以包含 areas。

- [ ] **步骤 2：运行红灯**

运行：`npm test -- tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts`

预期：`LocalSnapshot.areas` 不存在，测试或类型检查失败。

- [ ] **步骤 3：实现最小摘要收集**

新增：

```ts
interface RecentNote { title: string; path: string; mtime: number; }
interface AreaSignal { tone: "neutral" | "attention" | "healthy"; text: string; }
interface AreaSummary { count: number; recentNotes: RecentNote[]; signal: AreaSignal; }
```

`collectLocalSnapshot(reader, settings, now = Date.now())` 对四个目录各扫描一次，按 mtime 排序取 3 项，生成已批准的四类信号，同时从同一结果生成 counts。缺失/禁用返回空摘要。ActionContext 继续只读取 counts 与原批准摘要。

- [ ] **步骤 4：运行绿灯并提交**

运行：`npm test -- tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts`

预期：三文件全部通过。

```bash
git add src/types.ts src/data-sources.ts tests/data-sources.test.ts tests/action-context.test.ts tests/dashboard-store.test.ts
git commit -m "feat: 收集知识领域最近变化信号（任务 3/4）"
```

### 任务 4：Dashboard 加载反馈与领域卡片

**文件：**
- 修改：`tests/source-contract.test.ts`
- 修改：`src/views/dashboard-view.ts`
- 修改：`src/styles.css`
- 生成：`styles.css`

- [ ] **步骤 1：编写失败的 UI 契约测试**

在 `tests/source-contract.test.ts` 断言：

```ts
expect(dashboardViewSource).toContain("akd-generation-status");
expect(dashboardViewSource).toContain("akd-spinner");
expect(dashboardViewSource).toContain("正在思考并生成行动建议");
expect(dashboardViewSource).toContain("recentNotes");
expect(dashboardViewSource).toContain("查看全部");
expect(dashboardViewSource).toContain('["wiki", "Wiki"]');
expect(dashboardStyles).toContain("@keyframes akd-spin");
expect(dashboardStyles).toContain("prefers-reduced-motion: reduce");
```

- [ ] **步骤 2：运行红灯**

运行：`npm test -- tests/source-contract.test.ts`

预期：加载状态、卡片和动画契约不存在，测试失败。

- [ ] **步骤 3：实现加载状态**

生成开始时设置 `generating = true`、`generationStartedAt = Date.now()`、立即 `render()` 并启动每秒更新的 interval。Dashboard 和 Action Guide 在生成时渲染 spinner、对应 Thinking 文案和等待秒数。`finally` 清除 interval、状态并 render；`onClose` 同样清理。

首次失败没有历史建议时，从 issues 中独立显示错误，不同时渲染“尚未生成”。保持主插件层的重复请求保护。

- [ ] **步骤 4：实现领域卡片**

用 `snapshot.areas` 替换纯数字 stat 卡片。每张显示 count、signal、最多 3 篇 recent notes；笔记按钮调用现有 `openFile`，查看全部切换 activePage。增加 Wiki 页面和顶部 Wiki 导航。相对时间由纯函数格式化。

- [ ] **步骤 5：实现样式并运行绿灯**

增加 spinner、状态条、信号语气和 recent note 样式；使用现有薄荷/杏/红语义变量。为 reduced-motion 关闭动画。

运行：`npm test -- tests/source-contract.test.ts`

预期：该文件全部通过。

- [ ] **步骤 6：完整验证、安装和提交**

```bash
npm run check
npm run build
npm run install:notes
```

预期：TypeScript 与全部测试退出码 0；构建成功；安装脚本报告三个运行时文件哈希一致。

```bash
git add src/views/dashboard-view.ts src/styles.css styles.css main.js tests/source-contract.test.ts docs/superpowers/plans/2026-07-11-dashboard-action-feedback-and-area-insights.md
git commit -m "feat: 展示生成反馈与领域洞察（任务 4/4）"
```

### 收尾：创建新的 PR

- [ ] 重新运行 `npm run check`，确认工作区干净。
- [ ] 推送 `codex/dashboard-action-ux`。
- [ ] 创建以 `main` 为基础的新 Draft PR，摘要不包含 API Key、用户画像或私密知识库内容。
- [ ] 保留 worktree 供 PR 反馈迭代。
