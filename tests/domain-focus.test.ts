import { describe, expect, it } from "vitest";
import { domainShortLabel, resolveFocusedDomain } from "../src/domain-focus";
import type { DomainSummary } from "../src/types";

const domains: DomainSummary[] = [
  { name: "ai", path: "domain/ai", count: 2, latestMtime: 20, recentLocation: "ai", recentNotes: [] },
  { name: "it", path: "domain/it", count: 3, latestMtime: 10, recentLocation: "it", recentNotes: [] }
];

describe("domain focus", () => {
  it("uses the newest domain initially and restores a valid preference", () => {
    expect(resolveFocusedDomain(domains)?.path).toBe("domain/ai");
    expect(resolveFocusedDomain(domains, "domain/it")?.path).toBe("domain/it");
  });

  it("falls back when the saved domain no longer exists", () => {
    expect(resolveFocusedDomain(domains, "domain/deleted")?.path).toBe("domain/ai");
    expect(resolveFocusedDomain([], "domain/it")).toBeNull();
  });

  it("builds stable compact labels", () => {
    expect(domainShortLabel("it")).toBe("IT");
    expect(domainShortLabel("AI")).toBe("AI");
    expect(domainShortLabel("finance")).toBe("F");
    expect(domainShortLabel("业务")).toBe("业务");
    expect(domainShortLabel("知识领域")).toBe("知");
  });
});
