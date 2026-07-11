# AI Knowledge Dashboard

面向个人 Obsidian 知识库的行动仪表盘。它汇总本地知识库状态，并在用户明确点击后调用 DeepSeek，生成最多 3 条可执行的下一步建议。

这个插件的目标不是让知识库“看起来更复杂”，而是帮助用户判断现在应该学习、交付或整理什么。

## 核心行为

- Dashboard 使用独立且固定的标签页；只有点击 Ribbon 或执行命令时才创建/显示。
- 功能导航位于页面顶部：Dashboard 固定在左侧，Settings 固定在右侧，中间功能项在窄窗口中横向滚动，为下方左右分区保留完整宽度。
- 插件启动时不会抢占当前文章，也不会改变 Obsidian 原生工作区恢复和文件列表替换标签的逻辑。
- Vault 文件变化只刷新本地统计、Health、AI Task Queue，并把旧建议标为过期；不会自动调用 AI。
- DeepSeek 只在用户点击“生成下一步行动”后调用，响应被严格限制为 1–3 条行动。
- API Key 通过 Obsidian `SecretStorage` 保存，不写入插件 `data.json`、日志或仓库。
- 错误会保留在 Dashboard 内，上一批有效建议不会因一次失败而消失。

## 默认知识库结构

每个数据源都可单独启用和修改路径。路径为空或关闭后，该数据源不会被扫描。

| 数据源 | 默认路径 | 用途 |
|---|---|---|
| Inbox | `inbox` | 临时输入数量 |
| Domain | `domain` | 可复用知识数量 |
| Projects | `projects` | 项目数量与 `00-行动看板.md` 摘要 |
| Wiki | `wiki` | 编译知识数量 |
| Health | `wiki/HEALTH.md` | 仅提取“结论”“维护信号” |
| AI Task Queue | `inbox/tasks` | 仅提取 todo/doing 的标题、状态、类型 |
| Assets | `assets` | 附件数量 |
| User Profile | `private/用户画像.md` | 默认关闭；仅提取批准的目标、阶段、优先级和 AI 协作偏好 |

项目默认值适配 `C:\develop\notes` 当前结构，但设置页可用于其他 Vault。

## DeepSeek 与隐私边界

插件直接请求 DeepSeek Chat Completions API，支持：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

发送内容仅由已启用数据源的有界摘要组成，不发送完整笔记、绝对路径、凭据行或配置错误详情。User Profile 默认关闭；即使启用，也只提取白名单字段，并且可在单次生成前取消勾选。

连接测试只发送通用的 `{"ok":true}` 请求，不携带知识库上下文。网络超时、无效 Key、余额不足、限流、服务异常与无效 JSON 都会显示为可读错误。

## 使用方法

1. 在 Obsidian 设置中打开 `AI Knowledge Dashboard`。
2. 在 DeepSeek 区域选择或创建 Secret，并输入 API Key。
3. 按需调整数据源开关和路径；建议仅在明确需要时启用 User Profile。
4. 点击左侧 Ribbon 图标或运行 `Open AI Knowledge Dashboard`。
5. 在 Action Guide 中预览将发送的数据类型，再点击“生成下一步行动”。

Dashboard 会保持固定，但不会被设为 Obsidian 的默认启动页。

## 开发与本地安装

```powershell
npm ci
npm run check
npm run build
npm run install:notes
```

`npm run build` 会先执行 TypeScript 与 Vitest 检查，再生成 `main.js` 和根目录 `styles.css`。安装脚本只复制以下运行文件到 `C:\develop\notes\.obsidian\plugins\ai-knowledge-dashboard\`，并逐个校验 SHA-256：

- `manifest.json`
- `main.js`
- `styles.css`

安装脚本不会覆盖插件 `data.json`，API Key 也不在该文件中。

## 源码边界

`src/` 是唯一源码主体；根目录 `main.js` 与 `styles.css` 是构建产物。旧目录假设、硬编码行动卡、本地进程分析器和启动自动打开设置均已移除。

License: MIT
