import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import {
  collectLocalSnapshot,
  readHealthSummary,
  readTaskQueueSummary,
  readUserProfileSummary,
  type VaultReader
} from "../src/data-sources";

class MemoryVaultReader implements VaultReader {
  readonly reads: string[] = [];

  constructor(
    private readonly files: Record<string, string>,
    private readonly mtimes: Record<string, number> = {}
  ) {}

  async exists(path: string): Promise<boolean> {
    return path in this.files || Object.keys(this.files).some((file) => file.startsWith(`${path}/`));
  }

  async read(path: string): Promise<string> {
    this.reads.push(path);
    return this.files[path] ?? "";
  }

  async listMarkdown(path: string): Promise<Array<{ path: string; mtime: number }>> {
    return Object.keys(this.files)
      .filter((file) => file.startsWith(`${path}/`) && file.endsWith(".md"))
      .map((file, index) => ({ path: file, mtime: this.mtimes[file] ?? index + 1 }));
  }
}

const profile = `---
current_goal: 当前目标 A
last_verified: 2026-07-10
---
# 用户画像

## 稳定画像

不应发送的私人背景。

## 当前阶段

当前重点是可验证的现实目标。

## 行动优先级

| 优先级 | 当前事项 | 完成 / 停止条件 |
| --- | --- | --- |
| P0 | 完成关键准备 | 通过验收 |

## AI 协作偏好

最多给出三条行动并提供验收方式。

## 更新记录

不应发送的历史记录。
`;

describe("bounded data sources", () => {
  it("extracts only approved user profile fields and sections", async () => {
    const reader = new MemoryVaultReader({ "private/用户画像.md": profile });
    const summary = await readUserProfileSummary(reader, "private/用户画像.md");

    expect(summary).toContain("current_goal: 当前目标 A");
    expect(summary).toContain("last_verified: 2026-07-10");
    expect(summary).toContain("当前阶段");
    expect(summary).toContain("行动优先级");
    expect(summary).toContain("AI 协作偏好");
    expect(summary).not.toContain("稳定画像");
    expect(summary).not.toContain("更新记录");
    expect(summary).not.toContain("私人背景");
  });

  it("extracts only the health conclusion and maintenance signals", async () => {
    const reader = new MemoryVaultReader({
      "wiki/HEALTH.md": "# 健康报告\n## 结论\n当前可用。\n## 维护信号\n无阻断。\n## 历史详情\n不发送。"
    });

    const summary = await readHealthSummary(reader, "wiki/HEALTH.md");
    expect(summary).toContain("当前可用");
    expect(summary).toContain("无阻断");
    expect(summary).not.toContain("历史详情");
  });

  it("keeps only todo and doing task metadata", async () => {
    const reader = new MemoryVaultReader({
      "inbox/tasks/todo/a.md": "---\nstatus: todo\nkind: structure\n---\n# 修复入口\n私密正文",
      "inbox/tasks/doing/b.md": "---\nstatus: doing\nkind: link\n---\n# 检查链接\n详细正文",
      "inbox/tasks/done/c.md": "---\nstatus: done\nkind: archive\n---\n# 已完成"
    });

    const tasks = await readTaskQueueSummary(reader, "inbox/tasks");
    expect(tasks).toEqual([
      { title: "检查链接", status: "doing", kind: "link" },
      { title: "修复入口", status: "todo", kind: "structure" }
    ]);
  });

  it("does not read disabled sources and reports enabled missing paths", async () => {
    const reader = new MemoryVaultReader({
      "inbox/01.md": "# Inbox",
      "domain/it/01.md": "# Domain",
      "projects/00-行动看板.md": "# 行动看板\n下一步",
      "wiki/HEALTH.md": "# 健康报告\n## 结论\n可用",
      "private/用户画像.md": profile
    });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.sources.userProfile.enabled = false;
    settings.sources.wiki.path = "missing-wiki";

    const snapshot = await collectLocalSnapshot(reader, settings);

    expect(snapshot.counts.inbox).toBe(1);
    expect(snapshot.counts.domain).toBe(1);
    expect(snapshot.projectsSummary).toContain("下一步");
    expect(snapshot.issues).toContain("Wiki 路径不存在：missing-wiki");
    expect(reader.reads).not.toContain("private/用户画像.md");
  });

  it("builds recent notes and evidence-based signals for each area", async () => {
    const day = 24 * 60 * 60 * 1_000;
    const now = 20 * day;
    const files = {
      "inbox/new.md": "# New",
      "inbox/middle.md": "# Middle",
      "inbox/old.md": "# Old",
      "inbox/oldest.md": "# Oldest",
      "projects/active-project/current.md": "# Current",
      "projects/other/previous.md": "# Previous",
      "domain/it/java.md": "# Java",
      "wiki/java.md": "# Java Wiki",
      "wiki/HEALTH.md": "# Health"
    };
    const reader = new MemoryVaultReader(files, {
      "inbox/new.md": now - day,
      "inbox/middle.md": now - 6 * day,
      "inbox/old.md": now - 8 * day,
      "inbox/oldest.md": now - 12 * day,
      "projects/active-project/current.md": now - day,
      "projects/other/previous.md": now - 2 * day,
      "domain/it/java.md": now - day,
      "wiki/java.md": now - 3 * day,
      "wiki/HEALTH.md": now - 4 * day
    });

    const snapshot = await collectLocalSnapshot(reader, structuredClone(DEFAULT_SETTINGS), now);

    expect(snapshot.areas.inbox.recentNotes.map((note) => note.path)).toEqual([
      "inbox/new.md",
      "inbox/middle.md",
      "inbox/old.md"
    ]);
    expect(snapshot.areas.inbox.signal).toEqual({ tone: "attention", text: "最近 7 天变化 2 篇" });
    expect(snapshot.areas.projects.signal.text).toContain("active-project");
    expect(snapshot.areas.domain.signal.text).toContain("it");
    expect(snapshot.areas.domain.signal.text).toContain("java");
    expect(snapshot.areas.wiki.signal).toEqual({ tone: "attention", text: "Domain 有更晚更新" });
  });
});
