# AI Knowledge Dashboard 源码统一与 DeepSeek 行动建议设计

## 背景

当前仓库源码、构建产物与知识库中已安装的插件不一致。仓库仍包含旧的 `raw/` 目录模型和硬编码行动指南；已安装版本则包含仓库无法追溯的本地 Claude Code / Codex CLI 分析能力。现有启动逻辑还会在 Obsidian 恢复布局后主动激活 Dashboard，改变用户原有的标签恢复与文章打开行为。

本轮改造要把仓库恢复为唯一源码主版本，使插件适配知识库最终目录，保留 Dashboard 固定标签但不抢占启动焦点，并使用 DeepSeek API 生成与现实优先级一致的下一步行动建议。

## 目标

1. 仓库 `src/` 是唯一可编辑源码；安装产物只能由构建生成。
2. Dashboard 作为固定标签长期存在，但启动时由 Obsidian 自己恢复最后活动标签。
3. Inbox、Domain、Projects、Wiki、Health、Task Queue 等数据源均可独立配置和关闭。
4. Vault 变化实时刷新本地统计，并在上下文变化时把 AI 建议标记为过期。
5. 移除本地 Claude Code / Codex CLI 集成，改用 DeepSeek API。
6. DeepSeek 最多生成三条有依据、可执行、可验收的下一步行动。
7. API Key 安全存储；Private 默认排除，用户画像只在明确授权后局部读取。

## 非目标

- 不让插件自动执行 AI 建议。
- 不自动创建、修改或完成 Task Queue 文件。
- 不把整个知识库或整个 Projects、Domain、Wiki 发送给 DeepSeek。
- 不读取用户画像之外的 Private 文件。
- 不恢复 `raw/`、`domain/project` 等旧目录回退。
- 不为一人公司或其他 Paused/Future 方向自动生成行动。
- 不把本轮改造成通用聊天插件、RAG 服务或自治 Agent。

## 关键决策

### 源码主版本

- `src/`、`manifest.json` 与 `src/styles.css` 是主版本。
- 根目录 `main.js`、`styles.css` 是可复现的构建产物。
- `.obsidian/plugins/ai-knowledge-dashboard/` 只是安装目标，不直接编辑。
- 安装后对三个运行文件执行哈希比对，保证仓库与安装目录一致。

### Dashboard 标签语义

- 插件加载时只注册视图、命令、设置和 Vault 事件，不调用 `revealLeaf`，也不创建 Dashboard。
- 用户通过 Ribbon 或命令首次打开时，插件创建新 Dashboard 标签并固定。
- 后续点击入口时优先显示已有 Dashboard，不创建重复标签。
- 用户手动关闭 Dashboard 后，再次点击入口才重新创建并固定。
- Obsidian 启动时完全沿用自身工作区恢复逻辑：最后活动文章仍是文章，最后活动 Dashboard 仍是 Dashboard。

### AI 执行器

- DeepSeek API 是本版本唯一 AI 执行器。
- 删除 Claude Code / Codex CLI 检测、选择、子进程与临时工作区代码。
- 默认模型为 `deepseek-v4-flash`，可选 `deepseek-v4-pro`。
- Vault 事件不自动调用模型；只有用户明确点击或执行命令才发起请求。

## 模块边界

```text
src/
├─ main.ts                 # 插件加载、命令、视图和事件注册
├─ settings.ts             # 设置类型、默认值、迁移和设置页
├─ data-sources.ts         # 配置数据源读取与确定性统计
├─ dashboard-store.ts      # 当前快照、订阅、过期状态和防抖刷新
├─ action-context.ts       # 有界、脱敏的 DeepSeek 上下文
├─ deepseek-client.ts      # 鉴权、HTTP、超时和错误转换
├─ action-advisor.ts       # Prompt、响应模型和结构校验
├─ types.ts                # 跨模块数据契约
└─ views/
   └─ dashboard-view.ts    # Dashboard 渲染与交互
```

拆分只服务本轮职责隔离，不引入 React、状态管理框架、后台服务或额外网络依赖。

## 配置模型

每个数据源采用 `{ enabled, path }`。路径为空等价于关闭。

| 数据源 | 默认路径 | 通用默认 | 用途 |
|---|---|---:|---|
| Inbox | `inbox` | 开启 | 数量与待整理状态 |
| Domain | `domain` | 开启 | 知识领域统计 |
| Projects | `projects` | 开启 | 行动看板与项目入口摘要 |
| Wiki | `wiki` | 开启 | Wiki 数量与编译状态 |
| Health | `wiki/HEALTH.md` | 开启 | 健康结论与维护信号 |
| AI Task Queue | `inbox/tasks` | 开启 | todo / doing 任务摘要 |
| Assets | `assets` | 开启 | 附件排除目录 |
| User Profile | `private/用户画像.md` | 关闭 | 经授权的目标与优先级摘要 |

当前用户已经授权本地安装启用 User Profile。产品通用默认仍为关闭；迁移或首次启用时必须保留显式同意状态。

配置行为：

- 关闭：不读取、不监听、不统计、不发送。
- 空路径：规范化为关闭。
- 开启且路径不存在：显示配置错误，不回退到旧目录。
- 修改设置：立即重建本地快照，并重新判断建议是否过期。

旧设置迁移时删除 `openOnStartup`、`selectedAnalyzer`、`latestAnalysis` 及旧目录默认值。旧健康评分不迁移为行动建议。

## 本地刷新与状态驱动

插件注册 Vault 的 create、modify、delete、rename 事件。事件先判断路径是否命中已启用数据源，再经过 500ms 防抖刷新相关状态。

```text
Vault 事件
  → 命中已启用数据源？
    → 否：忽略
    → 是：刷新确定性快照
      → AI 上下文指纹变化？
        → 否：保留建议为最新
        → 是：保留旧建议并标记为过期
```

Dashboard 打开时始终执行一次完整本地刷新。Dashboard 关闭时，插件仍维护轻量快照与过期状态，但不创建 UI，也不调用 AI。

## DeepSeek 上下文

第一版只允许以下输入：

- `projects/00-行动看板.md` 的行动摘要；
- Task Queue 中 todo / doing 文件的标题、类型和状态；
- Health 的结论与维护信号；
- Inbox、Domain、Wiki 的数量统计；
- 用户画像中筛选后的当前目标、P0/P1/P2、完成或停止条件、AI 协作偏好和核验日期。

禁止输入：

- API Key；
- Windows 绝对路径；
- 整个 Projects、Domain、Wiki 或 Private 正文；
- 简历、联系方式、账号、凭据和私密链接；
- 未启用或未授权数据源；
- 与本次行动选择无关的用户画像章节。

请求前界面显示本次包含的数据类型，不显示或记录 API Key。用户可以临时取消本次用户画像输入。

## DeepSeek 请求

- 使用 `POST https://api.deepseek.com/chat/completions`。
- 通过 Obsidian `requestUrl` 发起请求，避免依赖浏览器 CORS 行为。
- API Key 通过 Bearer 鉴权。
- 使用 JSON Output，并在 Prompt 中明确要求 JSON 和示例结构。
- 同一时刻最多存在一个生成请求；按钮在请求期间显示进度并阻止重复提交。
- JSON 空内容允许自动重试一次；其他失败由用户决定是否重试。
- 测试连接只验证密钥和模型，不发送知识库上下文。

API Key 使用 Obsidian `SecretStorage` / `SecretComponent`。插件数据只保存 Secret 名称，不保存密钥值。`minAppVersion` 提高到 `1.11.4`；移除 Node / Electron 依赖后，将 `isDesktopOnly` 设为 `false`。

参考：

- DeepSeek API：<https://api-docs.deepseek.com/>
- DeepSeek JSON Output：<https://api-docs.deepseek.com/guides/json_mode>
- DeepSeek 错误码：<https://api-docs.deepseek.com/quick_start/error_codes>
- Obsidian SecretStorage：<https://docs.obsidian.md/plugins/guides/secret-storage>

## 行动建议契约

响应最多包含三条行动：

```json
{
  "actions": [
    {
      "priority": "P0",
      "title": "具体的下一步行动",
      "reason": "为什么现在做",
      "sources": ["Projects 行动看板"],
      "estimate": "30 分钟",
      "acceptance": "可观察的完成标准",
      "mode": "learning",
      "aiHelp": "AI 可以提供的帮助"
    }
  ]
}
```

校验规则：

- `actions` 为 1—3 项；
- priority 仅允许 P0、P1、P2；
- mode 仅允许 learning、execution；
- 每个文本字段非空并设合理长度上限；
- sources 只能引用本次实际输入的数据源；
- P0/P1 优先于 P2 与 Maintenance；
- Paused/Future 不生成行动；
- Maintenance 只有在阻塞现实目标时才能出现；
- 不虚构完成状态、项目证据或外部事实。

成功结果保存生成时间与上下文指纹。AI 建议属于本地敏感插件状态，不进入 Wiki，也不自动写入 Task Queue。设置页提供清除建议缓存功能。

## 错误处理

错误持续显示在 Dashboard 内，不只使用短暂 Notice：

| 场景 | 行为 |
|---|---|
| API Key 缺失 | 引导到设置页 |
| 401 | 提示密钥无效 |
| 402 | 提示余额不足 |
| 429 | 提示限流，保留旧建议 |
| 网络超时 / 5xx | 提示稍后重试 |
| 空 JSON | 自动重试一次 |
| JSON 不合格 | 显示响应格式错误，不覆盖旧建议 |
| 配置路径不存在 | 标明具体数据源配置错误 |
| 用户画像解析失败 | 跳过本次画像并要求用户确认，不扩大读取范围 |

任何失败都保留上一次成功建议并标记“更新失败”。Prompt、API Key 和完整响应不得写入日志。

## 测试策略

### 单元测试

- 旧设置迁移与最终默认路径；
- 数据源启用、关闭、空路径和错误路径；
- Private 默认排除和用户画像字段白名单；
- Health、Task Queue 与行动看板解析；
- Vault 事件路径过滤和 500ms 防抖；
- 上下文规范化、脱敏与指纹；
- DeepSeek 请求体、响应解析、空内容重试和错误映射；
- 行动建议数量、优先级、来源与字段限制；
- 失败时保留最后成功状态。

### 视图与生命周期测试

- 插件 onload 不创建或激活 Dashboard；
- 手动打开创建并固定新 Dashboard；
- 已有 Dashboard 时只 reveal，不重复创建；
- 手动关闭后重新创建并固定；
- Dashboard 关闭时本地刷新仍有效；
- Dashboard 打开时完整刷新并订阅 Store。

### 构建与安装测试

- `npm ci` 与类型检查通过；
- 自动化测试通过；
- `npm run build` 生成可加载产物；
- `npm run install:notes` 后仓库与安装目录三个运行文件哈希一致；
- Git 不包含 API Key、插件本地状态或 Obsidian 工作区文件。

### 手动 Obsidian 回归

1. 打开文章 A。
2. 手动打开并固定 Dashboard。
3. 切回文章 A 后关闭 Obsidian。
4. 重启后仍显示文章 A。
5. 从原生文件列表打开文章 B，保持 Obsidian 默认标签复用。
6. Dashboard 固定标签仍存在但未抢焦点。
7. 点击插件入口切换到已有 Dashboard，不产生重复标签。
8. 关闭 Dashboard 后点击入口，重新创建并固定。
9. 修改配置数据源，确认本地状态刷新且 AI 建议变为过期。
10. 配置 Secret、测试连接并成功生成最多三条行动建议。

## 完成标准

- 仓库源码、构建产物和安装产物可相互验证且完全一致。
- Dashboard 固定存在但不改变 Obsidian 默认启动焦点和文章标签行为。
- 最终目录均可配置，关闭或空路径即不检查。
- 本地统计、Health 与 Task Queue 由 Vault 事件刷新。
- DeepSeek 是唯一 AI 执行器，API Key 不进入明文插件数据。
- 生成结果最多三条，具有依据、耗时、验收方式和协作模式。
- 用户画像只在授权后按字段白名单读取。
- 自动化测试、构建安装检查和真实 Obsidian 回归全部通过。
- README 与开发计划不再描述旧目录、硬编码行动或本地 CLI。

## 停止条件

达到上述完成标准后停止。本轮不继续实现 AI 自动执行、自动写任务、多模型切换、全库 RAG、聊天历史、定时自动调用或 UI 框架迁移；这些能力只有在真实使用暴露明确需求时再单独设计。
