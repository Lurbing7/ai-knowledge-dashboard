import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readTypeScriptTree(path: string): string {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? readTypeScriptTree(join(path, entry.name))
      : entry.name.endsWith(".ts")
        ? readFileSync(join(path, entry.name), "utf8")
        : "")
    .join("\n");
}

const mainSource = readFileSync("src/main.ts", "utf8");
const allSource = readTypeScriptTree("src");
const dashboardViewSource = readFileSync("src/views/dashboard-view.ts", "utf8");
const dashboardStyles = readFileSync("src/styles.css", "utf8");
const settingsTabSource = readFileSync("src/settings-tab.ts", "utf8");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as {
  minAppVersion: string;
  isDesktopOnly: boolean;
};

describe("final source contract", () => {
  it("does not activate the dashboard during layout restore", () => {
    expect(mainSource).not.toContain("onLayoutReady");
    expect(mainSource).not.toContain("openOnStartup");
  });

  it("does not retain legacy paths, hard-coded actions or local CLI analyzers", () => {
    expect(allSource).not.toMatch(/raw\/|domain\/project/);
    expect(allSource).not.toMatch(/ClaudeAnalyzer|CodexAnalyzer|child_process|selectedAnalyzer|latestAnalysis/);
    expect(allSource).not.toContain("buildActionGuides");
  });

  it("uses DeepSeek, requestUrl and Obsidian secret storage", () => {
    expect(allSource).toContain("deepseek-v4-flash");
    expect(allSource).toContain("requestUrl");
    expect(allSource).toContain("SecretComponent");
    expect(allSource).toContain("secretStorage");
  });

  it("declares the SecretStorage-compatible cross-platform manifest", () => {
    expect(manifest.minAppVersion).toBe("1.11.4");
    expect(manifest.isDesktopOnly).toBe(false);
  });

  it("uses a three-zone horizontal navigation", () => {
    expect(dashboardViewSource).toContain("akd-top-nav");
    expect(dashboardViewSource).toContain("akd-nav-home");
    expect(dashboardViewSource).toContain("akd-nav-scroll");
    expect(dashboardViewSource).toContain("akd-nav-settings");
    expect(dashboardViewSource).not.toContain("akd-sidebar");
    expect(dashboardViewSource).not.toContain("Knowledge OS");
  });

  it("keeps action guidance first and removes the decorative dashboard hero", () => {
    const actionGuide = dashboardViewSource.indexOf('["tasks", "Action Guide"]');
    const projects = dashboardViewSource.indexOf('["projects", "Projects"]');
    const inbox = dashboardViewSource.indexOf('["inbox", "Inbox"]');
    const actionControls = dashboardViewSource.indexOf('cls: "akd-ai-controls"');
    const domainOverview = dashboardViewSource.indexOf('cls: "akd-domain-overview"');

    expect(actionGuide).toBeGreaterThan(-1);
    expect(actionGuide).toBeLessThan(projects);
    expect(projects).toBeLessThan(inbox);
    expect(actionControls).toBeLessThan(domainOverview);
    expect(dashboardViewSource).not.toContain("akd-hero");
    expect(dashboardStyles).not.toContain(".akd-hero");
  });

  it("renders a focused Domain browser after action guidance", () => {
    expect(dashboardViewSource).toContain("akd-domain-rail");
    expect(dashboardViewSource).toContain("akd-domain-tabs");
    expect(dashboardViewSource).toContain("akd-domain-focus");
    expect(dashboardViewSource).toContain("最近 3 篇笔记");
    expect(dashboardViewSource).toContain("进入 ${domain.name} 领域 →");
    expect(dashboardViewSource).toContain('"aria-pressed"');
    expect(dashboardViewSource).toContain("is-focused-domain");
    expect(dashboardViewSource).not.toContain("renderAreaCard");
    expect(dashboardViewSource).not.toContain("akd-progress-cards");
    expect(dashboardViewSource).toContain('attr: { title: note.title }');
    expect(dashboardViewSource).toContain('cls: "akd-recent-note-title"');
  });

  it("renders the Health summary as Obsidian Markdown and links to its source", () => {
    expect(dashboardViewSource).toContain("MarkdownRenderer");
    expect(dashboardViewSource).toContain("MarkdownRenderer.render");
    expect(dashboardViewSource).toContain("打开 Health 原文");
    expect(dashboardViewSource).toContain("akd-health-content");
    expect(dashboardViewSource).not.toContain('createEl("pre"');
    expect(dashboardViewSource).not.toContain("akd-health-summary");
    expect(dashboardStyles).toContain(".akd-health-content");
    expect(dashboardStyles).not.toContain(".akd-health-summary");
  });

  it("opens plugin settings instead of showing an instruction notice", () => {
    expect(dashboardViewSource).toContain("controller.openSettings");
    expect(dashboardViewSource).not.toContain("Open Settings → Community plugins");
  });

  it("persists the focused Domain as a local hidden preference", () => {
    expect(mainSource).toContain("async setFocusedDomainPath(path: string)");
    expect(mainSource).toContain("this.settings.focusedDomainPath = normalized");
    expect(mainSource).toContain("await this.saveData(this.settings)");
    expect(settingsTabSource).not.toContain("focusedDomainPath");
  });

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

  it("shows generation feedback and keeps the global Wiki navigation", () => {
    expect(dashboardViewSource).toContain("akd-generation-status");
    expect(dashboardViewSource).toContain("akd-spinner");
    expect(dashboardViewSource).toContain("正在思考并生成行动建议");
    expect(dashboardViewSource).toContain('["wiki", "Wiki"]');
    expect(dashboardStyles).toContain("@keyframes akd-spin");
    expect(dashboardStyles).toContain("prefers-reduced-motion: reduce");
  });
});
