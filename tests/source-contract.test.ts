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

  it("uses the approved dashboard palette", () => {
    expect(dashboardStyles).toContain("#E1BEE7");
    expect(dashboardStyles).toContain("#F3E5F5");
    expect(dashboardStyles).toContain("#FFFFFF");
    expect(dashboardStyles).toContain("#BA68C8");
  });
});
