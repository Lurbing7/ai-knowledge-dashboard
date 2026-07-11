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

export interface TaskSummary {
  title: string;
  status: "todo" | "doing";
  kind: string;
}

export interface LocalSnapshot {
  counts: {
    inbox: number;
    domain: number;
    projects: number;
    wiki: number;
  };
  projectsSummary: string;
  healthSummary: string;
  tasks: TaskSummary[];
  userProfileSummary: string;
  issues: string[];
}

export interface ActionContext {
  sourceTypes: string[];
  statistics: LocalSnapshot["counts"];
  projects?: string;
  health?: string;
  tasks?: TaskSummary[];
  userProfile?: string;
}

export interface DashboardState {
  snapshot: LocalSnapshot | null;
  context: ActionContext | null;
  contextFingerprint: string;
  advice: AdviceState | null;
  loading: boolean;
  issues: string[];
}
