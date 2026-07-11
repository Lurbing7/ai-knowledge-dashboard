import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardStore, isPathRelevant } from "../src/dashboard-store";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { ActionAdvice, LocalSnapshot } from "../src/types";

const advice: ActionAdvice = {
  priority: "P0",
  title: "完成当前行动",
  reason: "服务当前目标",
  sources: ["Projects 行动看板"],
  estimate: "30 分钟",
  acceptance: "结果可验证",
  mode: "execution",
  aiHelp: "检查结果"
};

function createSnapshot(projectsSummary = "第一版"): LocalSnapshot {
  return {
    counts: { inbox: 1, domain: 2, projects: 3, wiki: 4 },
    areas: {
      inbox: { count: 1, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } },
      domain: { count: 2, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } },
      projects: { count: 3, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } },
      wiki: { count: 4, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } }
    },
    projectsSummary,
    healthSummary: "可用",
    tasks: [],
    userProfileSummary: "",
    issues: []
  };
}

describe("DashboardStore", () => {
  beforeEach(() => vi.useRealTimers());

  it("keeps accepted advice fresh until the context changes", async () => {
    let snapshot = createSnapshot();
    const store = new DashboardStore(() => structuredClone(DEFAULT_SETTINGS), async () => snapshot);

    await store.refresh();
    store.acceptAdvice([advice], store.state.contextFingerprint);
    await store.refresh();
    expect(store.state.advice?.status).toBe("fresh");

    snapshot = createSnapshot("第二版");
    await store.refresh();
    expect(store.state.advice?.status).toBe("stale");
    expect(store.state.advice?.actions).toEqual([advice]);
  });

  it("retains the last advice when generation fails", async () => {
    const store = new DashboardStore(
      () => structuredClone(DEFAULT_SETTINGS),
      async () => createSnapshot()
    );
    await store.refresh();
    store.acceptAdvice([advice], store.state.contextFingerprint);
    store.setAdviceError("网络超时");

    expect(store.state.advice?.actions).toEqual([advice]);
    expect(store.state.advice?.status).toBe("error");
    expect(store.state.advice?.errorMessage).toBe("网络超时");
  });

  it("debounces relevant paths and ignores disabled sources", async () => {
    vi.useFakeTimers();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.sources.inbox.enabled = false;
    const loader = vi.fn(async () => createSnapshot());
    const store = new DashboardStore(() => settings, loader);

    store.scheduleRefresh("inbox/01.md");
    store.scheduleRefresh("projects/a.md");
    store.scheduleRefresh("projects/b.md");
    await vi.advanceTimersByTimeAsync(499);
    expect(loader).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("isPathRelevant", () => {
  it("matches enabled folders and exact files only", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    expect(isPathRelevant("projects/a.md", settings)).toBe(true);
    expect(isPathRelevant("wiki/HEALTH.md", settings)).toBe(true);
    settings.sources.projects.enabled = false;
    expect(isPathRelevant("projects/a.md", settings)).toBe(false);
    expect(isPathRelevant("private/credentials/key.md", settings)).toBe(false);
  });
});
