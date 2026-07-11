import type {
  AdviceState,
  DashboardSettings,
  DashboardSources,
  DataSourceSetting
} from "./types";

const source = (path: string, enabled = true): DataSourceSetting => ({ enabled, path });

export const DEFAULT_SETTINGS: DashboardSettings = {
  actionLimit: 3,
  deepseekModel: "deepseek-v4-flash",
  deepseekThinkingEnabled: true,
  deepseekReasoningEffort: "high",
  deepseekSecretName: "",
  sources: {
    inbox: source("inbox"),
    domain: source("domain"),
    projects: source("projects"),
    wiki: source("wiki"),
    health: source("wiki/HEALTH.md"),
    taskQueue: source("inbox/tasks"),
    assets: source("assets"),
    userProfile: source("private/用户画像.md", false)
  },
  latestAdvice: null
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}

export function normalizePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function normalizeDataSource(
  value: unknown,
  fallback: DataSourceSetting = { enabled: false, path: "" }
): DataSourceSetting {
  const candidate = asRecord(value);
  const candidatePath = "path" in candidate ? normalizePath(candidate.path) : fallback.path;
  const enabled = "enabled" in candidate ? candidate.enabled === true : fallback.enabled;
  return {
    enabled: enabled && candidatePath.length > 0,
    path: candidatePath
  };
}

function migrateSources(value: unknown): DashboardSources {
  const candidates = asRecord(value);
  return {
    inbox: normalizeDataSource(candidates.inbox, DEFAULT_SETTINGS.sources.inbox),
    domain: normalizeDataSource(candidates.domain, DEFAULT_SETTINGS.sources.domain),
    projects: normalizeDataSource(candidates.projects, DEFAULT_SETTINGS.sources.projects),
    wiki: normalizeDataSource(candidates.wiki, DEFAULT_SETTINGS.sources.wiki),
    health: normalizeDataSource(candidates.health, DEFAULT_SETTINGS.sources.health),
    taskQueue: normalizeDataSource(candidates.taskQueue, DEFAULT_SETTINGS.sources.taskQueue),
    assets: normalizeDataSource(candidates.assets, DEFAULT_SETTINGS.sources.assets),
    userProfile: normalizeDataSource(candidates.userProfile, DEFAULT_SETTINGS.sources.userProfile)
  };
}

function isAdviceState(value: unknown): value is AdviceState {
  const candidate = asRecord(value);
  return Array.isArray(candidate.actions)
    && typeof candidate.generatedAt === "number"
    && typeof candidate.contextFingerprint === "string"
    && (candidate.status === "fresh" || candidate.status === "stale" || candidate.status === "error");
}

export function migrateSettings(value: unknown): DashboardSettings {
  const candidate = asRecord(value);
  const actionLimit = typeof candidate.actionLimit === "number"
    ? Math.min(3, Math.max(1, Math.round(candidate.actionLimit)))
    : DEFAULT_SETTINGS.actionLimit;
  const deepseekModel = candidate.deepseekModel === "deepseek-v4-pro"
    ? "deepseek-v4-pro"
    : "deepseek-v4-flash";

  return {
    actionLimit,
    deepseekModel,
    deepseekThinkingEnabled: typeof candidate.deepseekThinkingEnabled === "boolean"
      ? candidate.deepseekThinkingEnabled
      : DEFAULT_SETTINGS.deepseekThinkingEnabled,
    deepseekReasoningEffort: candidate.deepseekReasoningEffort === "max" ? "max" : "high",
    deepseekSecretName: typeof candidate.deepseekSecretName === "string"
      ? candidate.deepseekSecretName.trim()
      : "",
    sources: migrateSources(candidate.sources),
    latestAdvice: isAdviceState(candidate.latestAdvice) ? candidate.latestAdvice : null
  };
}
