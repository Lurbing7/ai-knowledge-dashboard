import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  SecretComponent,
  Setting
} from "obsidian";
import type { DashboardSettings, DashboardSources, DataSourceSetting } from "./types";

export interface SettingsController {
  settings: DashboardSettings;
  saveSettings(): Promise<void>;
  testDeepSeekConnection(): Promise<void>;
  clearAdvice(): Promise<void>;
}

const SOURCE_LABELS: Array<{
  key: keyof DashboardSources;
  name: string;
  description: string;
}> = [
  { key: "inbox", name: "Inbox", description: "临时输入、网页剪藏和草稿目录。" },
  { key: "domain", name: "Domain", description: "可复用知识目录，只统计数量。" },
  { key: "projects", name: "Projects", description: "项目目录，读取根目录行动看板摘要。" },
  { key: "wiki", name: "Wiki", description: "Wiki 投影目录，只统计数量。" },
  { key: "health", name: "Health report", description: "读取结论和维护信号。" },
  { key: "taskQueue", name: "AI Task Queue", description: "读取 todo / doing 任务摘要。" },
  { key: "assets", name: "Assets", description: "附件排除目录，不发送内容。" },
  { key: "userProfile", name: "User Profile", description: "敏感数据源；只提取目标、优先级和协作偏好。" }
];

export class DashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly controller: SettingsController, plugin: Plugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Knowledge Dashboard" });

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("密钥保存在 Obsidian SecretStorage，插件设置只记录 Secret 名称。")
      .addComponent((element) => new SecretComponent(this.app, element)
        .setValue(this.controller.settings.deepseekSecretName)
        .onChange(async (value) => {
          this.controller.settings.deepseekSecretName = value;
          await this.controller.saveSettings();
        }));

    new Setting(containerEl)
      .setName("DeepSeek model")
      .setDesc("Flash 适合日常行动建议；Pro 适合需要更强推理的场景。")
      .addDropdown((dropdown) => dropdown
        .addOption("deepseek-v4-flash", "DeepSeek V4 Flash")
        .addOption("deepseek-v4-pro", "DeepSeek V4 Pro")
        .setValue(this.controller.settings.deepseekModel)
        .onChange(async (value) => {
          this.controller.settings.deepseekModel = value === "deepseek-v4-pro"
            ? "deepseek-v4-pro"
            : "deepseek-v4-flash";
          await this.controller.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Enable DeepSeek Thinking")
      .setDesc("开启后让 DeepSeek 先推理再生成行动建议；响应时间和 Token 消耗会增加。")
      .addToggle((toggle) => toggle
        .setValue(this.controller.settings.deepseekThinkingEnabled)
        .onChange(async (value) => {
          this.controller.settings.deepseekThinkingEnabled = value;
          await this.controller.saveSettings();
          this.display();
        }));

    if (this.controller.settings.deepseekThinkingEnabled) {
      new Setting(containerEl)
        .setName("Thinking effort")
        .setDesc("标准适合日常建议；最强适合复杂规划，并会使用更多时间和 Token。")
        .addDropdown((dropdown) => dropdown
          .addOption("high", "标准（high）")
          .addOption("max", "最强（max）")
          .setValue(this.controller.settings.deepseekReasoningEffort)
          .onChange(async (value) => {
            this.controller.settings.deepseekReasoningEffort = value === "max" ? "max" : "high";
            await this.controller.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName("Test DeepSeek connection")
      .setDesc("只测试密钥和模型，不发送知识库上下文。")
      .addButton((button) => button.setButtonText("Test").onClick(async () => {
        button.setDisabled(true).setButtonText("Testing…");
        try {
          await this.controller.testDeepSeekConnection();
          new Notice("DeepSeek connection succeeded.");
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "DeepSeek connection failed.");
        } finally {
          button.setDisabled(false).setButtonText("Test");
        }
      }));

    new Setting(containerEl)
      .setName("Action limit")
      .setDesc("Dashboard 最多展示 1—3 条行动建议。")
      .addSlider((slider) => slider
        .setLimits(1, 3, 1)
        .setValue(this.controller.settings.actionLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.controller.settings.actionLimit = value;
          await this.controller.saveSettings();
        }));

    containerEl.createEl("h3", { text: "Data sources" });
    containerEl.createEl("p", {
      text: "关闭或清空路径后，该数据源不会被读取、监听、统计或发送给 DeepSeek。"
    });
    SOURCE_LABELS.forEach((item) => this.renderDataSource(
      containerEl,
      item.name,
      item.description,
      this.controller.settings.sources[item.key]
    ));

    new Setting(containerEl)
      .setName("Clear AI advice cache")
      .setDesc("清除本地保存的行动建议，不修改知识库任务文件。")
      .addButton((button) => button.setWarning().setButtonText("Clear").onClick(async () => {
        await this.controller.clearAdvice();
        new Notice("AI advice cache cleared.");
      }));
  }

  private renderDataSource(
    parent: HTMLElement,
    name: string,
    description: string,
    source: DataSourceSetting
  ): void {
    const setting = new Setting(parent).setName(name).setDesc(description);
    setting.addToggle((toggle) => toggle.setValue(source.enabled).onChange(async (value) => {
      source.enabled = value && source.path.trim().length > 0;
      await this.controller.saveSettings();
      this.display();
    }));
    setting.addText((text) => text
      .setPlaceholder("Disabled when empty")
      .setValue(source.path)
      .onChange(async (value) => {
        source.path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        source.enabled = source.path.length > 0 && source.enabled;
        await this.controller.saveSettings();
      }));
  }
}
