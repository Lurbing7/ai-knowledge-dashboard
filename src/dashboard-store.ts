import { buildActionContext, stableFingerprint } from "./action-context";
import type {
  ActionAdvice,
  AdviceState,
  DashboardSettings,
  DashboardState,
  LocalSnapshot
} from "./types";

type Listener = (state: DashboardState) => void;
type SettingsProvider = () => DashboardSettings;
type SnapshotLoader = () => Promise<LocalSnapshot>;
type AdviceListener = (advice: AdviceState | null) => void;

export function isPathRelevant(path: string, settings: DashboardSettings): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return Object.values(settings.sources).some((source) => source.enabled
    && (normalized === source.path || normalized.startsWith(`${source.path}/`)));
}

export class DashboardStore {
  state: DashboardState;
  private readonly listeners = new Set<Listener>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getSettings: SettingsProvider,
    private readonly loadSnapshot: SnapshotLoader,
    private readonly onAdviceChanged: AdviceListener = () => undefined
  ) {
    this.state = {
      snapshot: null,
      context: null,
      contextFingerprint: "",
      advice: getSettings().latestAdvice,
      loading: false,
      issues: [],
      generationError: undefined
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    this.state = { ...this.state, loading: true };
    this.notify();
    try {
      const snapshot = await this.loadSnapshot();
      const context = buildActionContext(snapshot);
      const contextFingerprint = stableFingerprint(context);
      let advice = this.state.advice;
      if (advice && advice.contextFingerprint !== contextFingerprint) {
        advice = { ...advice, status: "stale", errorMessage: undefined };
      } else if (advice?.status === "stale") {
        advice = { ...advice, status: "fresh", errorMessage: undefined };
      }
      this.state = {
        snapshot,
        context,
        contextFingerprint,
        advice,
        loading: false,
        issues: snapshot.issues
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "知识库数据刷新失败";
      this.state = { ...this.state, loading: false, issues: [message] };
    }
    this.notify();
  }

  scheduleRefresh(changedPath: string): void {
    if (!isPathRelevant(changedPath, this.getSettings())) {
      return;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 500);
  }

  acceptAdvice(actions: ActionAdvice[], contextFingerprint: string): void {
    const advice: AdviceState = {
      actions,
      contextFingerprint,
      generatedAt: Date.now(),
      status: "fresh"
    };
    this.state = { ...this.state, advice, generationError: undefined };
    this.onAdviceChanged(advice);
    this.notify();
  }

  setAdviceError(message: string): void {
    if (this.state.advice) {
      const advice: AdviceState = {
        ...this.state.advice,
        status: "error",
        errorMessage: message
      };
      this.state = { ...this.state, advice, generationError: undefined };
      this.onAdviceChanged(advice);
    } else {
      this.state = { ...this.state, generationError: message };
    }
    this.notify();
  }

  clearAdvice(): void {
    this.state = { ...this.state, advice: null, generationError: undefined };
    this.onAdviceChanged(null);
    this.notify();
  }

  clearGenerationError(): void {
    if (!this.state.generationError) return;
    this.state = { ...this.state, generationError: undefined };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
