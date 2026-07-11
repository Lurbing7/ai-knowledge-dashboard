import { ItemView, Notice, TFolder, WorkspaceLeaf } from "obsidian";
import type { DashboardStore } from "../dashboard-store";
import type { DashboardSettings, DashboardState, DataSourceSetting } from "../types";

export const DASHBOARD_VIEW_TYPE = "ai-knowledge-dashboard-view";

type DashboardPage = "dashboard" | "inbox" | "projects" | "knowledge" | "health" | "tasks";

export interface DashboardViewController {
  settings: DashboardSettings;
  store: DashboardStore;
  generateAdvice(includeUserProfile: boolean): Promise<void>;
}

export class DashboardView extends ItemView {
  private activePage: DashboardPage = "dashboard";
  private state: DashboardState;
  private unsubscribe: (() => void) | null = null;
  private includeUserProfile = true;
  private generating = false;

  constructor(leaf: WorkspaceLeaf, private readonly controller: DashboardViewController) {
    super(leaf);
    this.state = controller.store.state;
  }

  getViewType(): string { return DASHBOARD_VIEW_TYPE; }
  getDisplayText(): string { return "AI Knowledge Dashboard"; }
  getIcon(): string { return "sparkles"; }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.controller.store.subscribe((state) => {
      this.state = state;
      this.render();
    });
    await this.controller.store.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("akd-view");
    const shell = container.createDiv({ cls: "akd-shell" });
    this.renderSidebar(shell);
    const main = shell.createEl("main", { cls: "akd-main" });
    if (this.activePage === "dashboard") this.renderDashboard(main);
    if (this.activePage === "inbox") this.renderFilePage(main, "Inbox", this.controller.settings.sources.inbox);
    if (this.activePage === "projects") this.renderFilePage(main, "Projects", this.controller.settings.sources.projects);
    if (this.activePage === "knowledge") this.renderKnowledge(main);
    if (this.activePage === "health") this.renderHealth(main);
    if (this.activePage === "tasks") this.renderTasks(main);
  }

  private renderSidebar(parent: HTMLElement): void {
    const sidebar = parent.createEl("aside", { cls: "akd-sidebar" });
    const brand = sidebar.createDiv({ cls: "akd-brand" });
    brand.createDiv({ cls: "akd-logo", text: "AI" });
    brand.createEl("strong", { text: "Knowledge OS" });
    const pages: Array<[DashboardPage, string]> = [
      ["dashboard", "Dashboard"],
      ["inbox", "Inbox"],
      ["projects", "Projects"],
      ["knowledge", "Knowledge Map"],
      ["health", "Health"],
      ["tasks", "Action Guide"]
    ];
    const nav = sidebar.createDiv({ cls: "akd-nav" });
    pages.forEach(([page, label]) => {
      const button = nav.createEl("button", {
        cls: page === this.activePage ? "akd-nav-item is-active" : "akd-nav-item",
        text: label
      });
      button.addEventListener("click", () => {
        this.activePage = page;
        this.render();
      });
    });
    const settings = sidebar.createEl("button", { cls: "akd-nav-item", text: "Settings" });
    settings.addEventListener("click", () => new Notice(
      "Open Settings → Community plugins → AI Knowledge Dashboard."
    ));
  }

  private renderDashboard(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "akd-hero" });
    header.createEl("span", { text: "NEXT ACTIONS" });
    header.createEl("h1", { text: "AI Knowledge Dashboard" });
    header.createEl("p", { text: "本地状态由 Vault 事件刷新；只有你点击后才调用 DeepSeek。" });

    const counts = this.state.snapshot?.counts ?? { inbox: 0, domain: 0, projects: 0, wiki: 0 };
    const stats = parent.createDiv({ cls: "akd-progress-cards" });
    this.renderStat(stats, counts.inbox, "Inbox");
    this.renderStat(stats, counts.domain, "Domain");
    this.renderStat(stats, counts.projects, "Projects");
    this.renderStat(stats, counts.wiki, "Wiki");

    if (this.state.issues.length > 0) {
      const issues = parent.createDiv({ cls: "akd-message akd-message-error" });
      issues.createEl("strong", { text: "Configuration or refresh issue" });
      const list = issues.createEl("ul");
      this.state.issues.forEach((issue) => list.createEl("li", { text: issue }));
    }

    const controls = parent.createDiv({ cls: "akd-ai-controls" });
    controls.createEl("h2", { text: "下一步行动建议" });
    const sources = this.state.context?.sourceTypes ?? [];
    controls.createEl("p", { text: `本次数据类型：${sources.join("、") || "尚无可用数据"}` });
    const hasProfile = sources.includes("用户画像优先级");
    if (hasProfile) {
      const label = controls.createEl("label", { cls: "akd-profile-consent" });
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = this.includeUserProfile;
      checkbox.addEventListener("change", () => { this.includeUserProfile = checkbox.checked; });
      label.appendText(" 本次包含经过筛选的用户画像优先级");
    }
    const button = controls.createEl("button", {
      text: this.generating ? "Generating…" : "生成下一步行动"
    });
    button.disabled = this.generating || !this.state.context;
    button.addEventListener("click", () => void this.generate(button));

    this.renderAdvice(parent);
  }

  private async generate(button: HTMLButtonElement): Promise<void> {
    if (this.generating) return;
    this.generating = true;
    button.disabled = true;
    button.setText("Generating…");
    try {
      await this.controller.generateAdvice(this.includeUserProfile);
    } finally {
      this.generating = false;
      this.render();
    }
  }

  private renderAdvice(parent: HTMLElement): void {
    const advice = this.state.advice;
    if (!advice) {
      parent.createDiv({ cls: "akd-message", text: "尚未生成行动建议。" });
      return;
    }
    const status = parent.createDiv({
      cls: `akd-message akd-advice-${advice.status}`,
      text: advice.status === "stale"
        ? "相关数据已经变化，这些建议可能已过期。"
        : advice.status === "error"
          ? `更新失败：${advice.errorMessage ?? "未知错误"}（保留上次成功建议）`
          : `生成于 ${new Date(advice.generatedAt).toLocaleString()}`
    });
    status.dataset.status = advice.status;
    const grid = parent.createDiv({ cls: "akd-guide-grid" });
    advice.actions.slice(0, this.controller.settings.actionLimit).forEach((item) => {
      const card = grid.createDiv({ cls: "akd-guide-card" });
      card.createEl("span", { cls: "akd-pill", text: `${item.priority} · ${item.estimate}` });
      card.createEl("h3", { text: item.title });
      card.createEl("p", { text: item.reason });
      card.createEl("strong", { text: `验收：${item.acceptance}` });
      card.createEl("small", { text: `${item.mode === "learning" ? "学习模式" : "执行模式"} · AI：${item.aiHelp}` });
      const tags = card.createDiv({ cls: "akd-tags" });
      item.sources.forEach((source) => tags.createEl("span", { text: source }));
    });
  }

  private renderFilePage(parent: HTMLElement, title: string, source: DataSourceSetting): void {
    this.renderPageHeader(parent, title, source.enabled ? source.path : "未配置");
    if (!source.enabled) {
      parent.createDiv({ cls: "akd-message", text: `${title} 数据源未启用。` });
      return;
    }
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${source.path}/`))
      .sort((left, right) => right.stat.mtime - left.stat.mtime)
      .slice(0, 12);
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    files.forEach((file) => {
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("h3", { text: file.basename });
      card.createEl("p", { text: file.path });
      const button = card.createEl("button", { text: "Open note" });
      button.addEventListener("click", () => void this.openFile(file));
    });
    if (files.length === 0) grid.createDiv({ cls: "akd-message", text: "没有可显示的 Markdown 文件。" });
  }

  private renderKnowledge(parent: HTMLElement): void {
    const source = this.controller.settings.sources.domain;
    this.renderPageHeader(parent, "Knowledge Map", source.enabled ? source.path : "未配置");
    if (!source.enabled) {
      parent.createDiv({ cls: "akd-message", text: "Domain 数据源未启用。" });
      return;
    }
    const folder = this.app.vault.getFolderByPath(source.path);
    if (!(folder instanceof TFolder)) {
      parent.createDiv({ cls: "akd-message akd-message-error", text: `Domain 路径不存在：${source.path}` });
      return;
    }
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    folder.children.filter((child): child is TFolder => child instanceof TFolder).forEach((child) => {
      const count = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${child.path}/`)).length;
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("h3", { text: child.name });
      card.createEl("p", { text: `${count} notes` });
    });
  }

  private renderHealth(parent: HTMLElement): void {
    this.renderPageHeader(parent, "Health", this.controller.settings.sources.health.path);
    const summary = this.state.snapshot?.healthSummary;
    parent.createEl("pre", {
      cls: "akd-health-summary",
      text: summary || "Health 数据源未启用、缺失或没有可解析内容。"
    });
  }

  private renderTasks(parent: HTMLElement): void {
    this.renderPageHeader(parent, "Action Guide", "AI Task Queue 与最后生成的行动建议");
    const tasks = this.state.snapshot?.tasks ?? [];
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    tasks.forEach((task) => {
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("span", { cls: "akd-pill", text: `${task.status} · ${task.kind}` });
      card.createEl("h3", { text: task.title });
    });
    if (tasks.length === 0) grid.createDiv({ cls: "akd-message", text: "当前没有 todo / doing AI 维护任务。" });
    this.renderAdvice(parent);
  }

  private renderPageHeader(parent: HTMLElement, title: string, description: string): void {
    const header = parent.createDiv({ cls: "akd-page-header" });
    header.createEl("span", { text: "AI KNOWLEDGE DASHBOARD" });
    header.createEl("h1", { text: title });
    header.createEl("p", { text: description });
  }

  private renderStat(parent: HTMLElement, value: number, label: string): void {
    const card = parent.createDiv({ cls: "akd-progress-card" });
    card.createEl("strong", { text: String(value) });
    card.createEl("span", { text: label });
  }

  private async openFile(file: Parameters<WorkspaceLeaf["openFile"]>[0]): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    await this.app.workspace.revealLeaf(leaf);
  }
}
