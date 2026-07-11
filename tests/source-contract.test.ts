import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/main.ts", "utf8");

describe("final source contract", () => {
  it("does not activate the dashboard during layout restore", () => {
    expect(source).not.toContain("onLayoutReady");
    expect(source).not.toContain("openOnStartup");
  });

  it("does not retain legacy paths or local CLI analyzers", () => {
    expect(source).not.toMatch(/raw\/|domain\/project/);
    expect(source).not.toMatch(/ClaudeAnalyzer|CodexAnalyzer|child_process/);
  });
});
