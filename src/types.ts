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
  deepseekThinkingEnabled: boolean;
  deepseekReasoningEffort: "high" | "max";
  deepseekSecretName: string;
  sources: DashboardSources;
  latestAdvice: AdviceState | null;
}

export interface TaskSummary {
  title: string;
  status: "todo" | "doing";
  kind: string;
}

export interface RecentNote {
  title: string;
  path: string;
  mtime: number;
}

export interface DomainSummary {
  name: string;
  path: string;
  count: number;
  latestMtime: number | null;
  recentLocation: string;
  recentNotes: RecentNote[];
}

export interface AreaSignal {
  tone: "neutral" | "attention" | "healthy";
  text: string;
}

export interface AreaSummary {
  count: number;
  recentNotes: RecentNote[];
  signal: AreaSignal;
}

export interface AreaSummaries {
  inbox: AreaSummary;
  domain: AreaSummary;
  projects: AreaSummary;
  wiki: AreaSummary;
}

export interface LocalSnapshot {
  counts: {
    inbox: number;
    domain: number;
    projects: number;
    wiki: number;
  };
  areas: AreaSummaries;
  domains: DomainSummary[];
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
  generationError?: string;
}
