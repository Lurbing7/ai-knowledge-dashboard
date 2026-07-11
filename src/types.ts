export interface DataSourceSetting {
  enabled: boolean;
  path: string;
}

export type AdvicePriority = "P0" | "P1" | "P2";
export type CollaborationMode = "learning" | "execution";
export type AdviceStatus = "fresh" | "stale" | "error";

export interface ActionAdvice {
  priority: AdvicePriority;
  title: string;
  reason: string;
  sources: string[];
  estimate: string;
  acceptance: string;
  mode: CollaborationMode;
  aiHelp: string;
}

export interface AdviceState {
  actions: ActionAdvice[];
  generatedAt: number;
  contextFingerprint: string;
  status: AdviceStatus;
  errorMessage?: string;
}

export interface DashboardSources {
  inbox: DataSourceSetting;
  domain: DataSourceSetting;
  projects: DataSourceSetting;
  wiki: DataSourceSetting;
  health: DataSourceSetting;
  taskQueue: DataSourceSetting;
  assets: DataSourceSetting;
  userProfile: DataSourceSetting;
}

export interface DashboardSettings {
  actionLimit: number;
  deepseekModel: "deepseek-v4-flash" | "deepseek-v4-pro";
  deepseekSecretName: string;
  sources: DashboardSources;
  latestAdvice: AdviceState | null;
}
