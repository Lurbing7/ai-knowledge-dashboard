import { describe, expect, it } from "vitest";
import { buildActionContext, stableFingerprint } from "../src/action-context";
import type { LocalSnapshot } from "../src/types";

const snapshot: LocalSnapshot = {
  counts: { inbox: 2, domain: 10, projects: 3, wiki: 5 },
  areas: {
    inbox: { count: 2, recentNotes: [{ title: "Secret", path: "inbox/private.md", mtime: 1 }], signal: { tone: "attention", text: "最近变化" } },
    domain: { count: 10, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } },
    projects: { count: 3, recentNotes: [], signal: { tone: "neutral", text: "暂无笔记" } },
    wiki: { count: 5, recentNotes: [], signal: { tone: "healthy", text: "Wiki 已覆盖最近时间点" } }
  },
  projectsSummary: "下一步：完成可验证交付。\n本地：C:\\develop\\secret\\note.md",
  healthSummary: "当前可用。\napi_key: should-not-leak",
  tasks: [{ title: "完成入口", status: "doing", kind: "project" }],
  userProfileSummary: "current_goal: 当前目标\n## 行动优先级\nP0 事项",
  issues: ["配置问题不发送给模型"]
};

describe("action context", () => {
  it("contains bounded summaries without absolute paths, credentials or local issues", () => {
    const context = buildActionContext(snapshot);
    const json = JSON.stringify(context);

    expect(context.sourceTypes).toEqual([
      "Projects 行动看板",
      "AI Task Queue",
      "Health 摘要",
      "用户画像优先级",
      "知识库统计"
    ]);
    expect(json).not.toContain("C:\\develop");
    expect(json).not.toContain("should-not-leak");
    expect(json).not.toContain("配置问题不发送给模型");
    expect(json).not.toContain("inbox/private.md");
    expect(json).not.toContain("recentNotes");
  });

  it("omits empty optional sources", () => {
    const context = buildActionContext({
      ...snapshot,
      projectsSummary: "",
      healthSummary: "",
      tasks: [],
      userProfileSummary: ""
    });

    expect(context.sourceTypes).toEqual(["知识库统计"]);
    expect(context).not.toHaveProperty("projects");
    expect(context).not.toHaveProperty("userProfile");
  });

  it("generates a stable fingerprint for equivalent objects", () => {
    const left = stableFingerprint({ b: 2, a: { d: 4, c: 3 } });
    const right = stableFingerprint({ a: { c: 3, d: 4 }, b: 2 });
    expect(left).toBe(right);
    expect(left).not.toBe(stableFingerprint({ a: { c: 9, d: 4 }, b: 2 }));
  });
});
