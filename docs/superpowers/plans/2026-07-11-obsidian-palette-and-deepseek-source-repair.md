# Obsidian 融合配色与 DeepSeek 来源修复实施计划

> **面向 AI 代理的工作者：** 使用 `executing-plans` 逐任务实现本计划；每项代码行为先按 `test-driven-development` 验证红灯与绿灯。

**目标：** 修复 DeepSeek 因重复来源而拒绝有效行动建议的问题，并将 Dashboard 调整为克制、适配 Obsidian 明暗主题的薄荷绿配色。

**架构：** 保持现有 Dashboard 布局和 DeepSeek 请求链路不变。解析层负责将来源字符串规范化、去重后再执行数量与白名单校验；样式层以 Obsidian 主题变量作为表面和文字基底，仅用四个批准色值表达强调、悬停、提醒和错误状态。

**技术栈：** TypeScript、Obsidian Plugin API、Vitest、CSS、esbuild

---

## 文件职责

- 修改 `src/action-advisor.ts`：约束模型来源输出，并实现来源清洗、去重、数量及白名单校验。
- 修改 `tests/action-advisor.test.ts`：覆盖重复来源、超量唯一来源、未知来源和提示词约束。
- 修改 `src/styles.css`：以 Obsidian 主题变量为基底应用批准色板，并补充明暗主题安全样式。
- 修改 `tests/source-contract.test.ts`：锁定新色板、主题变量和禁止旧色板的样式契约。
- 生成 `styles.css`、`main.js`：由构建脚本生成运行时文件，不手工修改。
- 安装到 `C:/develop/notes/.obsidian/plugins/ai-knowledge-dashboard/`：由安装脚本复制并校验哈希。

### 任务 1：修复 DeepSeek 来源解析契约

**文件：**
- 修改：`tests/action-advisor.test.ts`
- 修改：`src/action-advisor.ts`

- [x] **步骤 1：编写失败测试**

在 `tests/action-advisor.test.ts` 增加四类断言：

```ts
it("deduplicates repeated allowed sources before enforcing the limit", () => {
  const parsed = parseActionAdvice({
    actions: [{ ...validAction, sources: Array(6).fill("Projects 行动看板") }]
  }, ["Projects 行动看板"]);

  expect(parsed[0].sources).toEqual(["Projects 行动看板"]);
});

it("rejects more than five distinct allowed sources", () => {
  const sources = ["来源 1", "来源 2", "来源 3", "来源 4", "来源 5", "来源 6"];
  expect(() => parseActionAdvice({
    actions: [{ ...validAction, sources }]
  }, sources)).toThrow("1 到 5 项");
});

it("rejects unknown sources after normalization", () => {
  expect(() => parseActionAdvice({
    actions: [{ ...validAction, sources: [" Projects 行动看板 ", "未知来源"] }]
  }, ["Projects 行动看板"])).toThrow("未知来源");
});

it("requires a unique subset of context source types", () => {
  expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("context.sourceTypes");
  expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("唯一子集");
  expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("最多 5 项");
});
```

- [x] **步骤 2：运行定向测试确认红灯**

运行：`npm test -- tests/action-advisor.test.ts`

预期：重复来源测试因当前代码在去重前拒绝 6 项而失败；提示词约束测试因缺少新约束而失败。

- [x] **步骤 3：实现最小修复**

在系统提示词中明确 `sources` 必须是 `context.sourceTypes` 的唯一子集且最多 5 项。将 `parseSources` 调整为：验证数组非空；逐项调用 `requiredText` 清洗；用 `Set` 保序去重；对去重结果执行 1–5 项限制；最后逐项执行白名单校验并返回。

- [x] **步骤 4：运行定向测试确认绿灯**

运行：`npm test -- tests/action-advisor.test.ts`

预期：该文件全部测试通过。

- [x] **步骤 5：提交任务 1**

```bash
git add src/action-advisor.ts tests/action-advisor.test.ts
git commit -m "fix: 容忍 DeepSeek 重复行动来源（任务 1/2）"
```

### 任务 2：应用 Obsidian 融合色板并完成安装验证

**文件：**
- 修改：`tests/source-contract.test.ts`
- 修改：`src/styles.css`
- 生成：`styles.css`
- 生成：`main.js`

- [x] **步骤 1：编写失败的样式契约测试**

将旧色板测试替换为以下契约：

```ts
it("uses the restrained Obsidian-integrated dashboard palette", () => {
  expect(dashboardStyles).toContain("#5CCEC4");
  expect(dashboardStyles).toContain("#8AE7DC");
  expect(dashboardStyles).toContain("#FFE0CA");
  expect(dashboardStyles).toContain("#FFB8B8");
  expect(dashboardStyles).toContain("var(--background-primary)");
  expect(dashboardStyles).toContain("var(--background-secondary)");
  expect(dashboardStyles).toContain("var(--background-modifier-border)");
  expect(dashboardStyles).not.toContain("#BA68C8");
  expect(dashboardStyles).not.toContain("#E1BEE7");
});
```

- [x] **步骤 2：运行定向测试确认红灯**

运行：`npm test -- tests/source-contract.test.ts`

预期：新批准色值不存在且旧紫色仍存在，测试失败。

- [x] **步骤 3：实现克制的主题适配样式**

在 `.akd-view` 中定义语义变量：

```css
--akd-bg: var(--background-primary);
--akd-surface: var(--background-primary);
--akd-surface-muted: var(--background-secondary);
--akd-ink: var(--text-normal);
--akd-muted: var(--text-muted);
--akd-line: var(--background-modifier-border);
--akd-accent: #5CCEC4;
--akd-accent-soft: color-mix(in srgb, #8AE7DC 20%, transparent);
--akd-warning: #FFE0CA;
--akd-danger: #FFB8B8;
```

页面和卡片继承 Obsidian 表面色；导航选中态、悬停、标签、圆环和关键指标使用薄荷绿；Hero 使用 `#5CCEC4` 到 `#8AE7DC` 的低对比渐变并保持深色文字可读；警告/过期状态使用杏色边框或透明底；错误状态使用浅红色边框或透明底。移除紫色色值、硬编码白色卡片和蓝色标签。增加 `.theme-dark .akd-view` 覆盖，让强调背景保持透明、边框可辨识。

- [x] **步骤 4：运行定向测试确认绿灯**

运行：`npm test -- tests/source-contract.test.ts`

预期：该文件全部测试通过。

- [x] **步骤 5：执行完整验证与安装**

依次运行：

```bash
npm run check
npm run build
npm run install:notes
```

预期：TypeScript 检查和全部 Vitest 测试退出码为 0；构建生成 `main.js`、`styles.css`；安装脚本报告 3 个运行时文件哈希一致。

再运行：

```powershell
Get-FileHash main.js, styles.css, manifest.json
Get-FileHash C:/develop/notes/.obsidian/plugins/ai-knowledge-dashboard/main.js, C:/develop/notes/.obsidian/plugins/ai-knowledge-dashboard/styles.css, C:/develop/notes/.obsidian/plugins/ai-knowledge-dashboard/manifest.json
```

预期：源码构建产物与已安装三个文件的 SHA256 分别一致。

- [x] **步骤 6：提交任务 2 并推送现有 PR 分支**

```bash
git add src/styles.css styles.css tests/source-contract.test.ts main.js docs/superpowers/plans/2026-07-11-obsidian-palette-and-deepseek-source-repair.md
git commit -m "style: 融合 Obsidian 主题与薄荷色板（任务 2/2）"
git push origin codex/dashboard-unification-deepseek
```

预期：工作区干净，本地分支与远端同步，现有 Draft PR #1 自动包含本轮修复。
