import type { App } from "obsidian";
import type {
  DashboardSettings,
  DataSourceSetting,
  LocalSnapshot,
  TaskSummary
} from "./types";

export interface VaultReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  listMarkdown(path: string): Promise<Array<{ path: string; mtime: number }>>;
}

export class ObsidianVaultReader implements VaultReader {
  constructor(private readonly app: App) {}

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  async read(path: string): Promise<string> {
    const target = this.app.vault.getFileByPath(path);
    if (!target || target.extension !== "md") {
      throw new Error(`Markdown 文件不存在：${path}`);
    }
    return this.app.vault.cachedRead(target);
  }

  async listMarkdown(path: string): Promise<Array<{ path: string; mtime: number }>> {
    const prefix = `${path}/`;
    return this.app.vault.getMarkdownFiles()
      .filter((file) => file.path === path || file.path.startsWith(prefix))
      .map((file) => ({ path: file.path, mtime: file.stat.mtime }));
  }
}

const MAX_SUMMARY_LENGTH = 12_000;

function truncate(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= MAX_SUMMARY_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MAX_SUMMARY_LENGTH)}\n[内容已截断]`;
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

function extractLevelTwoSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    return "";
  }
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) {
    end += 1;
  }
  return lines.slice(start, end).join("\n").trim();
}

export async function readUserProfileSummary(reader: VaultReader, path: string): Promise<string> {
  const markdown = await reader.read(path);
  const frontmatter = parseFrontmatter(markdown);
  const metadata = ["current_goal", "last_verified", "next_review"]
    .filter((key) => frontmatter[key])
    .map((key) => `${key}: ${frontmatter[key]}`);
  const sections = ["当前阶段", "行动优先级", "AI 协作偏好"]
    .map((heading) => extractLevelTwoSection(markdown, heading))
    .filter(Boolean);
  return truncate([...metadata, ...sections].join("\n\n"));
}

export async function readHealthSummary(reader: VaultReader, path: string): Promise<string> {
  const markdown = await reader.read(path);
  return truncate(["结论", "维护信号"]
    .map((heading) => extractLevelTwoSection(markdown, heading))
    .filter(Boolean)
    .join("\n\n"));
}

function readTitle(markdown: string, path: string): string {
  const heading = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim()
    || path.split("/").pop()?.replace(/\.md$/i, "")
    || "未命名任务";
}

export async function readTaskQueueSummary(reader: VaultReader, path: string): Promise<TaskSummary[]> {
  const files = await reader.listMarkdown(path);
  const tasks: TaskSummary[] = [];
  for (const file of files) {
    const markdown = await reader.read(file.path);
    const frontmatter = parseFrontmatter(markdown);
    if (frontmatter.status !== "todo" && frontmatter.status !== "doing") {
      continue;
    }
    tasks.push({
      title: readTitle(markdown, file.path),
      status: frontmatter.status,
      kind: frontmatter.kind || "unspecified"
    });
  }
  const order = { doing: 0, todo: 1 } as const;
  return tasks.sort((left, right) => order[left.status] - order[right.status]
    || left.title.localeCompare(right.title, "zh-Hans-CN"));
}

async function countSource(
  reader: VaultReader,
  setting: DataSourceSetting,
  label: string,
  issues: string[]
): Promise<number> {
  if (!setting.enabled) {
    return 0;
  }
  if (!await reader.exists(setting.path)) {
    issues.push(`${label} 路径不存在：${setting.path}`);
    return 0;
  }
  return (await reader.listMarkdown(setting.path)).length;
}

async function readEnabledFile(
  reader: VaultReader,
  setting: DataSourceSetting,
  label: string,
  issues: string[],
  read: (reader: VaultReader, path: string) => Promise<string>
): Promise<string> {
  if (!setting.enabled) {
    return "";
  }
  if (!await reader.exists(setting.path)) {
    issues.push(`${label} 路径不存在：${setting.path}`);
    return "";
  }
  return read(reader, setting.path);
}

export async function collectLocalSnapshot(
  reader: VaultReader,
  settings: DashboardSettings
): Promise<LocalSnapshot> {
  const issues: string[] = [];
  const counts = {
    inbox: await countSource(reader, settings.sources.inbox, "Inbox", issues),
    domain: await countSource(reader, settings.sources.domain, "Domain", issues),
    projects: await countSource(reader, settings.sources.projects, "Projects", issues),
    wiki: await countSource(reader, settings.sources.wiki, "Wiki", issues)
  };

  let projectsSummary = "";
  if (settings.sources.projects.enabled && await reader.exists(settings.sources.projects.path)) {
    const actionPath = `${settings.sources.projects.path}/00-行动看板.md`;
    if (await reader.exists(actionPath)) {
      projectsSummary = truncate(await reader.read(actionPath));
    }
  }

  const healthSummary = await readEnabledFile(
    reader,
    settings.sources.health,
    "Health",
    issues,
    readHealthSummary
  );

  let tasks: TaskSummary[] = [];
  if (settings.sources.taskQueue.enabled) {
    if (await reader.exists(settings.sources.taskQueue.path)) {
      tasks = await readTaskQueueSummary(reader, settings.sources.taskQueue.path);
    } else {
      issues.push(`AI Task Queue 路径不存在：${settings.sources.taskQueue.path}`);
    }
  }

  const userProfileSummary = await readEnabledFile(
    reader,
    settings.sources.userProfile,
    "User Profile",
    issues,
    readUserProfileSummary
  );

  return {
    counts,
    projectsSummary,
    healthSummary,
    tasks,
    userProfileSummary,
    issues
  };
}
