import { Notice, Plugin } from "obsidian";
import { stableFingerprint } from "./action-context";
import { activateDashboard } from "./dashboard-lifecycle";
import { DashboardStore } from "./dashboard-store";
import { ObsidianVaultReader, collectLocalSnapshot } from "./data-sources";
import { DeepSeekClient } from "./deepseek-client";
import { ObsidianDeepSeekTransport } from "./obsidian-deepseek-transport";
import { openPluginSettings, type ObsidianSettingsHost } from "./open-plugin-settings";
import { migrateSettings, normalizePath } from "./settings";
import { DashboardSettingTab, type SettingsController } from "./settings-tab";
import type { ActionContext, DashboardSettings } from "./types";
import {
  DASHBOARD_VIEW_TYPE,
  DashboardView,
  type DashboardViewController
} from "./views/dashboard-view";

export default class AiKnowledgeDashboardPlugin extends Plugin
  implements SettingsController, DashboardViewController {
  settings!: DashboardSettings;
  store!: DashboardStore;
  private deepseekClient!: DeepSeekClient;
  private generationInProgress = false;

  async onload(): Promise<void> {
    this.settings = migrateSettings(await this.loadData());
    await this.saveData(this.settings);

    const reader = new ObsidianVaultReader(this.app);
    this.store = new DashboardStore(
      () => this.settings,
      () => collectLocalSnapshot(reader, this.settings),
      (advice) => {
        this.settings.latestAdvice = advice;
        void this.saveData(this.settings);
      }
    );
    this.deepseekClient = new DeepSeekClient(new ObsidianDeepSeekTransport());

    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("sparkles", "Open AI Knowledge Dashboard", () => {
      void this.activateDashboardView();
    });
    this.addCommand({
      id: "open-ai-knowledge-dashboard",
      name: "Open AI Knowledge Dashboard",
      callback: () => void this.activateDashboardView()
    });
    this.addCommand({
      id: "generate-next-actions",
      name: "Generate next actions with DeepSeek",
      callback: () => void this.generateAdvice(true)
    });
    this.addSettingTab(new DashboardSettingTab(this.app, this, this));

    this.registerEvent(this.app.vault.on("create", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.store.scheduleRefresh(oldPath);
      this.store.scheduleRefresh(file.path);
    }));

    await this.store.refresh();
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async activateDashboardView(): Promise<void> {
    await activateDashboard(this.app.workspace, DASHBOARD_VIEW_TYPE);
  }

  openSettings(): void {
    openPluginSettings(this.app as unknown as ObsidianSettingsHost, this.manifest.id);
  }

  async saveSettings(): Promise<void> {
    this.settings = migrateSettings(this.settings);
    await this.saveData(this.settings);
    await this.store.refresh();
  }

  async setFocusedDomainPath(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized || this.settings.focusedDomainPath === normalized) return;
    this.settings.focusedDomainPath = normalized;
    await this.saveData(this.settings);
  }

  async testDeepSeekConnection(): Promise<void> {
    const apiKey = this.getDeepSeekApiKey();
    await this.deepseekClient.testConnection({ apiKey, model: this.settings.deepseekModel });
  }

  async clearAdvice(): Promise<void> {
    this.store.clearAdvice();
    this.settings.latestAdvice = null;
    await this.saveData(this.settings);
  }

  async generateAdvice(includeUserProfile: boolean): Promise<void> {
    if (this.generationInProgress) {
      new Notice("DeepSeek generation is already in progress.");
      return;
    }
    this.generationInProgress = true;
    try {
      await this.store.refresh();
      if (!this.store.state.context) {
        throw new Error("没有可用于生成行动建议的上下文。");
      }
      const context = this.filterContext(this.store.state.context, includeUserProfile);
      const actions = await this.deepseekClient.generateActions({
        apiKey: this.getDeepSeekApiKey(),
        model: this.settings.deepseekModel,
        thinkingEnabled: this.settings.deepseekThinkingEnabled,
        reasoningEffort: this.settings.deepseekReasoningEffort,
        context
      });
      this.store.acceptAdvice(actions, stableFingerprint(this.store.state.context));
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek 行动建议生成失败。";
      this.store.setAdviceError(message);
      new Notice(message);
    } finally {
      this.generationInProgress = false;
    }
  }

  private getDeepSeekApiKey(): string {
    const secretName = this.settings.deepseekSecretName;
    if (!secretName) {
      throw new Error("请先在插件设置中选择 DeepSeek API Key Secret。");
    }
    const apiKey = this.app.secretStorage.getSecret(secretName);
    if (!apiKey) {
      throw new Error("选择的 DeepSeek Secret 不存在或内容为空。");
    }
    return apiKey;
  }

  private filterContext(context: ActionContext, includeUserProfile: boolean): ActionContext {
    if (includeUserProfile || !context.userProfile) {
      return context;
    }
    const { userProfile: _removed, ...safeContext } = context;
    return {
      ...safeContext,
      sourceTypes: context.sourceTypes.filter((source) => source !== "用户画像优先级")
    };
  }
}
