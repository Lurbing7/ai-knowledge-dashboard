import { ItemView, TFolder, WorkspaceLeaf } from "obsidian";
import type { DashboardStore } from "../dashboard-store";
import type { AreaSummary, DashboardSettings, DashboardState, DataSourceSetting, RecentNote } from "../types";

export const DASHBOARD_VIEW_TYPE = "ai-knowledge-dashboard-view";

type DashboardPage = "dashboard" | "inbox" | "projects" | "knowledge" | "wiki" | "health" | "tasks";

const EMPTY_AREA: AreaSummary = {
  count: 0,
  recentNotes: [],
  signal: { tone: "neutral", text: "暂无笔记" }
};

function formatRelativeTime(mtime: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - mtime) / 1_000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export interface DashboardViewController {
  settings: DashboardSettings;
  store: DashboardStore;
  generateAdvice(includeUserProfile: boolean): Promise<void>;
  openSettings(): void;
}

export class DashboardView extends ItemView {
  private activePage: DashboardPage = "dashboard";
  private state: DashboardState;
  private unsubscribe: (() => void) | null = null;
  private includeUserProfile = true;
  private generating = false;
  private generationStartedAt = 0;
  private generationTimer: ReturnType<typeof setInterval> | null = null;

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
    this.stopGenerationTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("akd-view");
    const shell = container.createDiv({ cls: "akd-shell" });
    this.renderNavigation(shell);
    const main = shell.createEl("main", { cls: "akd-main" });
    if (this.activePage === "dashboard") this.renderDashboard(main);
    if (this.activePage === "inbox") this.renderFilePage(main, "Inbox", this.controller.settings.sources.inbox);
    if (this.activePage === "projects") this.renderFilePage(main, "Projects", this.controller.settings.sources.projects);
    if (this.activePage === "knowledge") this.renderKnowledge(main);
    if (this.activePage === "wiki") this.renderFilePage(main, "Wiki", this.controller.settings.sources.wiki);
    if (this.activePage === "health") this.renderHealth(main);
    if (this.activePage === "tasks") this.renderTasks(main);
  }

  private renderNavigation(parent: HTMLElement): void {
    const navigation = parent.createEl("nav", {
      cls: "akd-top-nav",
      attr: { "aria-label": "Dashboard navigation" }
    });
    const renderPageButton = (
      target: HTMLElement,
      page: DashboardPage,
      label: string,
      extraClass = ""
    ): void => {
      const classes = [
        "akd-nav-item",
        extraClass,
        page === this.activePage ? "is-active" : ""
      ].filter(Boolean).join(" ");
      const button = target.createEl("button", { cls: classes, text: label });
      button.addEventListener("click", () => {
        this.activePage = page;
        this.render();
      });
    };

    renderPageButton(navigation, "dashboard", "Dashboard", "akd-nav-home");
    const scroll = navigation.createDiv({ cls: "akd-nav-scroll" });
    const pages: Array<[DashboardPage, string]> = [
      ["tasks", "Action Guide"],
      ["projects", "Projects"],
      ["inbox", "Inbox"],
      ["knowledge", "Knowledge Map"],
      ["wiki", "Wiki"],
      ["health", "Health"]
    ];
    pages.forEach(([page, label]) => {
      renderPageButton(scroll, page, label);
    });
    const settings = navigation.createEl("button", {
      cls: "akd-nav-item akd-nav-settings",
      text: "Settings"
    });
    settings.addEventListener("click", () => this.controller.openSettings());
  }

  private renderDashboard(parent: HTMLElement): void {
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
      text: this.generating ? "生成中" : "生成下一步行动"
    });
    button.disabled = this.generating || !this.state.context;
    button.addEventListener("click", () => void this.generate());

    this.renderGenerationStatus(parent);
    this.renderAdvice(parent);

    const overview = parent.createDiv({ cls: "akd-overview-header" });
    overview.createEl("h2", { text: "知识领域概览" });
    overview.createEl("p", { text: "最近变化与当前规模" });

    const areas = this.state.snapshot?.areas;
    const stats = parent.createDiv({ cls: "akd-progress-cards" });
    this.renderAreaCard(stats, areas?.inbox ?? EMPTY_AREA, "Inbox", "inbox");
    this.renderAreaCard(stats, areas?.domain ?? EMPTY_AREA, "Domain", "knowledge");
    this.renderAreaCard(stats, areas?.projects ?? EMPTY_AREA, "Projects", "projects");
    this.renderAreaCard(stats, areas?.wiki ?? EMPTY_AREA, "Wiki", "wiki");
  }

  private async generate(): Promise<void> {
    if (this.generating) return;
    this.generating = true;
    this.generationStartedAt = Date.now();
    this.controller.store.clearGenerationError();
    this.render();
    this.generationTimer = setInterval(() => this.render(), 1_000);
    try {
      await this.controller.generateAdvice(this.includeUserProfile);
    } finally {
      this.generating = false;
      this.stopGenerationTimer();
      this.render();
    }
  }

  private stopGenerationTimer(): void {
    if (this.generationTimer) clearInterval(this.generationTimer);
    this.generationTimer = null;
  }

  private renderGenerationStatus(parent: HTMLElement): void {
    if (!this.generating) return;
    const status = parent.createDiv({ cls: "akd-generation-status", attr: { "aria-live": "polite" } });
    status.createSpan({ cls: "akd-spinner", attr: { "aria-hidden": "true" } });
    status.createSpan({
      text: this.controller.settings.deepseekThinkingEnabled
        ? "DeepSeek 正在思考并生成行动建议…"
        : "DeepSeek 正在生成行动建议…"
    });
    const elapsed = Math.max(0, Math.floor((Date.now() - this.generationStartedAt) / 1_000));
    status.createEl("small", { text: `已等待 ${elapsed} 秒` });
  }

  private renderAdvice(parent: HTMLElement): void {
    const advice = this.state.advice;
    if (!advice) {
      if (this.state.generationError) {
        parent.createDiv({ cls: "akd-message akd-advice-error", text: this.state.generationError });
        return;
      }
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
    this.renderGenerationStatus(parent);
    this.renderAdvice(parent);
  }

  private renderPageHeader(parent: HTMLElement, title: string, description: string): void {
    const header = parent.createDiv({ cls: "akd-page-header" });
    header.createEl("span", { text: "AI KNOWLEDGE DASHBOARD" });
    header.createEl("h1", { text: title });
    header.createEl("p", { text: description });
  }

  private renderAreaCard(
    parent: HTMLElement,
    area: AreaSummary,
    label: string,
    page: DashboardPage
  ): void {
    const card = parent.createDiv({ cls: "akd-progress-card akd-area-card" });
    const heading = card.createDiv({ cls: "akd-area-heading" });
    heading.createEl("span", { text: label });
    heading.createEl("strong", { text: String(area.count) });
    card.createDiv({
      cls: `akd-area-signal is-${area.signal.tone}`,
      text: area.signal.text
    });
    const notes = card.createDiv({ cls: "akd-recent-notes" });
    area.recentNotes.forEach((note) => this.renderRecentNote(notes, note));
    if (area.recentNotes.length === 0) notes.createEl("small", { text: "暂无最近笔记" });
    const all = card.createEl("button", { cls: "akd-area-link", text: "查看全部" });
    all.addEventListener("click", () => {
      this.activePage = page;
      this.render();
    });
  }

  private renderRecentNote(parent: HTMLElement, note: RecentNote): void {
    const button = parent.createEl("button", { cls: "akd-recent-note" });
    button.createSpan({ text: note.title });
    button.createEl("small", { text: formatRelativeTime(note.mtime) });
    button.addEventListener("click", () => {
      const file = this.app.vault.getFileByPath(note.path);
      if (file) void this.openFile(file);
    });
  }

  private async openFile(file: Parameters<WorkspaceLeaf["openFile"]>[0]): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    await this.app.workspace.revealLeaf(leaf);
  }
}
