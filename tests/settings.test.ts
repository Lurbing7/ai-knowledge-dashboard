import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, migrateSettings, normalizeDataSource } from "../src/settings";

describe("dashboard settings", () => {
  it("uses the final vault defaults", () => {
    expect(DEFAULT_SETTINGS.deepseekThinkingEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.deepseekReasoningEffort).toBe("high");
    expect(DEFAULT_SETTINGS.sources.inbox).toEqual({ enabled: true, path: "inbox" });
    expect(DEFAULT_SETTINGS.sources.domain).toEqual({ enabled: true, path: "domain" });
    expect(DEFAULT_SETTINGS.sources.projects).toEqual({ enabled: true, path: "projects" });
    expect(DEFAULT_SETTINGS.sources.wiki).toEqual({ enabled: true, path: "wiki" });
    expect(DEFAULT_SETTINGS.sources.health).toEqual({ enabled: true, path: "wiki/HEALTH.md" });
    expect(DEFAULT_SETTINGS.sources.taskQueue).toEqual({ enabled: true, path: "inbox/tasks" });
    expect(DEFAULT_SETTINGS.sources.assets).toEqual({ enabled: true, path: "assets" });
    expect(DEFAULT_SETTINGS.sources.userProfile).toEqual({
      enabled: false,
      path: "private/用户画像.md"
    });
  });

  it("drops legacy startup, analyzer and generated analysis fields", () => {
    const migrated = migrateSettings({
      openOnStartup: true,
      selectedAnalyzer: "claude",
      latestAnalysis: { score: 50 },
      inboxFolder: "raw/inbox",
      sourcesFolder: "raw/sources",
      assetsFolder: "raw/assets",
      wikiFolder: "wiki"
    });

    expect(migrated).not.toHaveProperty("openOnStartup");
    expect(migrated).not.toHaveProperty("selectedAnalyzer");
    expect(migrated).not.toHaveProperty("latestAnalysis");
    expect(migrated.sources.inbox.path).toBe("inbox");
    expect(migrated.sources.domain.path).toBe("domain");
    expect(migrated.sources.projects.path).toBe("projects");
    expect(migrated.sources.assets.path).toBe("assets");
  });

  it("preserves valid final settings and bounds the action limit", () => {
    const migrated = migrateSettings({
      actionLimit: 99,
      deepseekModel: "deepseek-v4-pro",
      deepseekThinkingEnabled: false,
      deepseekReasoningEffort: "max",
      deepseekSecretName: "deepseek-personal",
      sources: {
        inbox: { enabled: true, path: " capture\\inbox " },
        userProfile: { enabled: true, path: "private/profile.md" }
      }
    });

    expect(migrated.actionLimit).toBe(3);
    expect(migrated.deepseekModel).toBe("deepseek-v4-pro");
    expect(migrated.deepseekThinkingEnabled).toBe(false);
    expect(migrated.deepseekReasoningEffort).toBe("max");
    expect(migrated.deepseekSecretName).toBe("deepseek-personal");
    expect(migrated.sources.inbox).toEqual({ enabled: true, path: "capture/inbox" });
    expect(migrated.sources.userProfile).toEqual({ enabled: true, path: "private/profile.md" });
  });

  it("falls back to enabled high reasoning for legacy or invalid settings", () => {
    expect(migrateSettings({})).toMatchObject({
      deepseekThinkingEnabled: true,
      deepseekReasoningEffort: "high"
    });
    expect(migrateSettings({ deepseekReasoningEffort: "invalid" })).toMatchObject({
      deepseekThinkingEnabled: true,
      deepseekReasoningEffort: "high"
    });
  });

  it("treats an empty path as disabled", () => {
    expect(normalizeDataSource({ enabled: true, path: " / " })).toEqual({
      enabled: false,
      path: ""
    });
  });
});
