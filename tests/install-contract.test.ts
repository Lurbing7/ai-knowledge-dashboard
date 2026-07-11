import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local install contract", () => {
  const source = readFileSync("scripts/install-local.mjs", "utf8");

  it("verifies every installed runtime file with SHA-256", () => {
    expect(source).toContain('createHash("sha256")');
    expect(source).toContain('"manifest.json"');
    expect(source).toContain('"main.js"');
    expect(source).toContain('"styles.css"');
    expect(source).toContain("Hash mismatch");
  });
});
