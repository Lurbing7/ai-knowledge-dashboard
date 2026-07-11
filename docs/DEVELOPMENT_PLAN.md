# AI Knowledge Dashboard 开发计划

## 当前定位

插件是知识库的行动入口，不是第二套知识库，也不负责自动扩张目录或生成大量维护任务。它应优先服务现实目标：学习成长、面试准备、项目交付和可复用知识沉淀。

当前 0.2.0 架构已经收敛为：

```text
Vault 有界数据源
  -> 本地快照与指纹
  -> Dashboard 状态（统计 / Health / Task Queue）
  -> 用户手动确认
  -> DeepSeek 生成最多三条行动
  -> 执行、学习或回到笔记
```

## 已完成

- `src/` 作为唯一源码，构建产物由仓库源码生成。
- 数据源统一为 `{ enabled, path }`，空路径等同于关闭。
- 默认适配 `inbox / domain / projects / wiki / private / assets` 最终结构。
- User Profile 默认关闭，并使用章节与 frontmatter 白名单。
- Vault 事件防抖刷新本地状态，内容改变后将旧 AI 建议标为过期。
- DeepSeek 使用 Obsidian `requestUrl`，无本地子进程分析器依赖。
- API Key 使用 Obsidian `SecretStorage`，连接测试不发送知识上下文。
- 行动建议经过结构、优先级、协作模式与来源校验，最多保留三条。
- Dashboard 标签固定，但插件加载时不创建、不 reveal、不抢焦点。
- 安装脚本复制并校验三个运行文件的 SHA-256。

## 设计边界

- 不在 Vault 事件中自动调用 AI。
- 不发送完整笔记、敏感目录内容、绝对路径、凭据或错误详情。
- 不为 Paused/Future 目标生成行动；Maintenance 仅在阻断现实目标时出现。
- 不恢复历史目录回退路径。
- 不重新引入本地进程分析器、硬编码行动指南或“启动时打开 Dashboard”。
- 不用 Dashboard 替代 Obsidian 的文章浏览和标签页行为。

## 后续候选工作

只有当真实使用暴露问题时再进入下一轮，优先级如下：

1. 根据一段时间的实际建议质量，调整 Prompt 与上下文摘要，而不是增加更多数据源。
2. 为行动增加“已完成 / 不适用 / 延后”反馈，用事实评估建议是否促进了学习或交付。
3. 在不扩大隐私面的前提下，加入行动到 Projects 或学习队列的明确写入操作。
4. 若 Dashboard 变复杂，再评估组件化 UI；当前继续使用原生 DOM + CSS。

任何新模块都必须先回答：它服务哪个现实目标、是否减少维护负担、输入输出是什么、何时停止。

## 发布门槛

每次交付至少执行：

```powershell
npm run check
npm run build
npm run install:notes
git diff --check
```

并人工确认：

- 重启仍恢复原文章，Dashboard 不抢焦点。
- 点击入口只复用或新建一个固定 Dashboard 标签。
- 文件列表仍按 Obsidian 默认方式替换普通文章标签。
- 数据源关闭后不读取，变化后本地状态刷新且建议变为过期。
- Secret 连接测试、DeepSeek 生成和页面内错误展示符合预期。
- 仓库与安装目录的 `manifest.json`、`main.js`、`styles.css` 哈希一致。
