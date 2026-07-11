# Dashboard 行动生成反馈与领域洞察设计

## 背景与目标

现有 Dashboard 已能读取知识库统计、Projects 行动看板、Health、AI Task Queue 和经用户授权的画像摘要，并通过 DeepSeek 生成下一步行动。但当前存在两个直接影响使用的问题：

1. DeepSeek 返回成功响应后，插件可能因输出截断或字符串并非可直接 `JSON.parse` 而只显示笼统的“JSON 无法解析”。
2. 点击生成按钮后缺少持续、明确的加载反馈；首页的 Inbox、Domain、Projects、Wiki 也只有总数，无法帮助用户判断下一步该关注哪里。

本轮目标是让行动建议链路可靠、可解释，让生成过程有真实反馈，并将首页升级为轻量决策入口。它仍然不是文件管理器，也不为了丰富视觉而堆积信息。

## 范围

本轮包含：

- 提高 DeepSeek JSON 输出成功率，并区分输出截断、格式错误和字段校验错误。
- 在 Settings 中提供 DeepSeek Thinking 开关和 `high`、`max` 推理强度。
- 添加生成中的旋转指示器、状态文字和已等待时间。
- 将四个领域概览卡片升级为“数量 + 最近 3 篇 + 一条基于本地事实的关注信号”。
- 保持现有顶部导航、独立标签页打开笔记、SecretStorage 和用户画像授权逻辑不变。

本轮不包含：

- 流式展示或保存模型内部推理正文。
- 自动二次调用 DeepSeek 修复错误输出。
- 读取 Inbox 正文后让 AI 自动判断重要性。
- 在首页展示完整文件列表或直接编辑、移动、删除笔记。
- 将最近笔记标题默认发送给 DeepSeek。

## DeepSeek 输出可靠性

### 请求约束

行动建议请求继续使用 `response_format: { type: "json_object" }`，同时：

- 在 system prompt 中加入一份完整、最小的 JSON 输出样例，字段与 `ActionAdvice` 完全一致。
- 明确要求只返回一个 JSON 对象，不使用 Markdown 代码围栏，不添加解释文字。
- 根据 Settings 发送 `thinking: { type: "enabled" | "disabled" }`；启用时同时发送用户选择的 `reasoning_effort`。
- 根据 Thinking 配置设置输出预算：关闭为 3200、`high` 为 4800、`max` 为 8000，并要求每个最终文本字段简洁，降低推理过程挤占最终 JSON 或三条行动建议被截断的概率。

### 响应解析

响应提取层同时读取：

- `choices[0].message.content`
- `choices[0].finish_reason`

处理顺序：

1. 若 `finish_reason` 为 `length`，不尝试模糊修补，返回“DeepSeek 输出被截断，请重试”的明确错误。
2. 对内容执行 trim 后直接 `JSON.parse`。
3. 直接解析失败时，仅兼容“整段内容由一个 `json` 或无语言标记的 Markdown 代码围栏包裹”的情况；提取围栏内部后再次解析。
4. 不从任意说明文字中用首尾大括号猜测 JSON，避免接受含混或被拼接的结果。
5. JSON 成功解析后继续执行现有严格字段、数量、来源白名单和长度校验。

错误信息只包含失败类别，不保存或展示模型原始输出，也不包含 API Key、用户画像或知识库内容。

`reasoning_content` 不参与 JSON 解析，也不写入设置、缓存或界面。插件只解析 `message.content` 中的最终 JSON。

## Thinking 设置

`DashboardSettings` 新增：

- `deepseekThinkingEnabled: boolean`，默认 `true`。
- `deepseekReasoningEffort: "high" | "max"`，默认 `high`。

Settings 中在模型选择之后显示“启用 Thinking”开关。开关关闭时隐藏推理强度；开启时显示下拉框：

- `标准（high）`：日常行动建议默认值，兼顾速度、成本和分析能力。
- `最强（max）`：复杂规划时手动选择，明确提示耗时和 Token 消耗会增加。

关闭 Thinking 时仍保留上一次推理强度值，重新开启后恢复，不要求用户重复选择。旧版设置迁移后使用“开启 + high”，与用户期望一致。连接测试仍只验证密钥和模型，不发送知识库上下文，也不需要启用 Thinking。

## 生成中反馈

`DashboardView` 保留本地生成状态，但点击后立即重新渲染，使状态不依赖原按钮节点是否仍存在。

生成期间，在行动建议区域上方显示紧凑状态条：

- 薄荷绿旋转指示器。
- Thinking 开启时显示“DeepSeek 正在思考并生成行动建议…”，关闭时显示“DeepSeek 正在生成行动建议…”。
- 从 0 秒开始递增的等待时间。
- 生成按钮保持禁用并显示“生成中”。

状态条不展示内部推理文本，也不伪造“正在分析用户画像”“正在检查项目”等无法从非流式 API 证实的阶段。请求成功或失败后停止计时器并移除状态条。切换 Dashboard 内部页面不会发起重复请求；回到 Dashboard 或 Action Guide 时仍能看到进行中状态。

CSS 动画遵守 `prefers-reduced-motion: reduce`：关闭旋转，只保留静态指示器和文字。

## 领域概览卡片

### 数据模型

本地快照新增四个 `AreaSummary`：Inbox、Domain、Projects、Wiki。每项包含：

- `count`：该数据源中的 Markdown 文件总数。
- `recentNotes`：按修改时间倒序的最多 3 项，仅包含标题、Vault 路径和修改时间。
- `signal`：一条由路径和时间戳确定的事实信号，包含文案与 `neutral`、`attention` 或 `healthy` 语气。

数据统一由 `data-sources.ts` 收集，使首页渲染和测试不再直接重复查询 Vault。数据源未启用或路径不存在时返回空摘要，并沿用现有 issues 提示。

### 信号定义

第一版不使用 AI 推断，避免把不确定判断包装成事实：

- Inbox：显示最近 7 天发生变化的笔记数量；大于 0 时为 attention，否则 neutral。
- Projects：显示最近发生变化的项目一级目录；没有子目录归属时显示最近笔记名称。
- Domain：显示最近沉淀的一级知识领域和笔记名称。
- Wiki：比较 Domain 与 Wiki 的最新修改时间；Domain 更新更晚时显示“Domain 有更晚更新”，否则显示“Wiki 已覆盖最近时间点”。这只是时间信号，不宣称内容已经完成语义同步。

所有相对时间使用本地时间计算。不存在笔记时显示“暂无笔记”。

### 卡片交互

首页继续保留四张卡片，但每张卡片包含：

- 顶部：领域名称与总数。
- 中部：关注信号。
- 底部：最多 3 篇最近笔记，显示标题和相对修改时间。

点击最近笔记使用新的 Obsidian 标签页打开。点击卡片的“查看全部”进入现有对应页面：Inbox、Projects、Knowledge Map；Wiki 新增只读最近文件页面或复用通用文件页。卡片不直接执行整理、移动或删除操作。

最近笔记和信号只用于本地界面，不自动加入 DeepSeek 上下文。AI 请求仍使用经过边界控制的 `ActionContext`。

## 状态与错误呈现

- 配置或目录刷新问题继续进入 `issues`，与 AI 请求错误分开显示。
- DeepSeek 错误写入 advice error 状态；如果存在上次成功建议，继续保留并标记过期。
- 首次生成失败且没有历史建议时，显示明确错误卡片，不再同时显示容易误解的“尚未生成”。
- JSON 格式错误提示用户重试，并说明插件没有保存原始模型内容。

## 测试策略

### DeepSeek 客户端

- 默认请求开启 Thinking、使用 `reasoning_effort: high` 和 `max_tokens: 4800`。
- Thinking 关闭时发送 disabled、不发送 reasoning effort，并使用 `max_tokens: 3200`。
- `max` 强度请求使用 `reasoning_effort: max` 和 `max_tokens: 8000`。
- 合法 JSON 直接解析。
- 单一 JSON 代码围栏能够解析。
- `finish_reason: length` 返回截断错误。
- JSON 前后带解释文字仍被拒绝。
- API Key 和原始响应不进入错误信息。
- 现有空响应重试、HTTP 状态映射和来源白名单测试继续通过。

### 本地数据

- 四类摘要正确统计数量并返回最近 3 篇。
- 信号严格按时间和一级目录生成。
- 禁用、缺失和空目录产生稳定结果。
- 最近笔记不会进入 `ActionContext`。

### UI 契约

- Settings 能切换 Thinking；强度选项仅在开启时显示，旧设置迁移为“开启 + high”。
- 点击生成后立即出现加载状态，结束后清理计时器。
- 加载文字准确反映当前 Thinking 是否开启，但不展示内部推理内容。
- 加载期间不能重复提交。
- 首页卡片包含数量、信号、最近笔记和“查看全部”。
- 打开笔记继续使用新标签页。
- reduced-motion 样式存在。

## 验收标准

- 使用 DeepSeek JSON Output 时，完整合法响应能够通过；代码围栏可容错，截断和附加说明得到明确错误。
- 用户可以在 Settings 中启停 Thinking，并在开启时选择 `high` 或 `max`；默认值为开启和 `high`。
- 用户点击生成后立即看到与 Thinking 设置一致的旋转指示器、生成中文字和等待秒数，且不会产生重复请求。
- 首页四个领域不再只有数字，每张卡片都能提供最近变化和一条可验证信号。
- 最近笔记内容和标题不会因首页增强而被自动发送给 DeepSeek。
- 全部自动化测试、TypeScript 检查、生产构建、本地安装和运行时文件哈希校验通过。
- 本轮使用新分支并创建新的 PR，不继续更新已经合并的 PR #1。
