/* AI Knowledge Dashboard */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AiKnowledgeDashboardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/action-context.ts
var SENSITIVE_LINE = /(?:api[_ -]?key|password|token|secret|密钥|密码|凭据)/i;
var WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/][^\s\])}"']+/g;
function sanitizeText(value) {
  return value.split(/\r?\n/).filter((line) => !SENSITIVE_LINE.test(line)).join("\n").replace(WINDOWS_ABSOLUTE_PATH, "[local-path]").trim();
}
function buildActionContext(snapshot) {
  const context = {
    sourceTypes: [],
    statistics: snapshot.counts
  };
  const projects = sanitizeText(snapshot.projectsSummary);
  if (projects) {
    context.projects = projects;
    context.sourceTypes.push("Projects \u884C\u52A8\u770B\u677F");
  }
  if (snapshot.tasks.length > 0) {
    context.tasks = snapshot.tasks.map((task) => ({ ...task }));
    context.sourceTypes.push("AI Task Queue");
  }
  const health = sanitizeText(snapshot.healthSummary);
  if (health) {
    context.health = health;
    context.sourceTypes.push("Health \u6458\u8981");
  }
  const userProfile = sanitizeText(snapshot.userProfileSummary);
  if (userProfile) {
    context.userProfile = userProfile;
    context.sourceTypes.push("\u7528\u6237\u753B\u50CF\u4F18\u5148\u7EA7");
  }
  context.sourceTypes.push("\u77E5\u8BC6\u5E93\u7EDF\u8BA1");
  return context;
}
function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}
function stableFingerprint(value) {
  const input = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// src/dashboard-lifecycle.ts
async function activateDashboard(workspace, viewType) {
  const existing = workspace.getLeavesOfType(viewType)[0];
  if (existing) {
    await workspace.revealLeaf(existing);
    return;
  }
  const leaf = workspace.getLeaf("tab");
  await leaf.setViewState({ type: viewType, active: true });
  leaf.setPinned(true);
  await workspace.revealLeaf(leaf);
}

// src/dashboard-store.ts
function isPathRelevant(path, settings) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return Object.values(settings.sources).some((source2) => source2.enabled && (normalized === source2.path || normalized.startsWith(`${source2.path}/`)));
}
var DashboardStore = class {
  constructor(getSettings, loadSnapshot, onAdviceChanged = () => void 0) {
    this.getSettings = getSettings;
    this.loadSnapshot = loadSnapshot;
    this.onAdviceChanged = onAdviceChanged;
    this.listeners = /* @__PURE__ */ new Set();
    this.refreshTimer = null;
    this.state = {
      snapshot: null,
      context: null,
      contextFingerprint: "",
      advice: getSettings().latestAdvice,
      loading: false,
      issues: [],
      generationError: void 0
    };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  async refresh() {
    this.state = { ...this.state, loading: true };
    this.notify();
    try {
      const snapshot = await this.loadSnapshot();
      const context = buildActionContext(snapshot);
      const contextFingerprint = stableFingerprint(context);
      let advice = this.state.advice;
      if (advice && advice.contextFingerprint !== contextFingerprint) {
        advice = { ...advice, status: "stale", errorMessage: void 0 };
      } else if ((advice == null ? void 0 : advice.status) === "stale") {
        advice = { ...advice, status: "fresh", errorMessage: void 0 };
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
      const message = error instanceof Error ? error.message : "\u77E5\u8BC6\u5E93\u6570\u636E\u5237\u65B0\u5931\u8D25";
      this.state = { ...this.state, loading: false, issues: [message] };
    }
    this.notify();
  }
  scheduleRefresh(changedPath) {
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
  acceptAdvice(actions, contextFingerprint) {
    const advice = {
      actions,
      contextFingerprint,
      generatedAt: Date.now(),
      status: "fresh"
    };
    this.state = { ...this.state, advice, generationError: void 0 };
    this.onAdviceChanged(advice);
    this.notify();
  }
  setAdviceError(message) {
    if (this.state.advice) {
      const advice = {
        ...this.state.advice,
        status: "error",
        errorMessage: message
      };
      this.state = { ...this.state, advice, generationError: void 0 };
      this.onAdviceChanged(advice);
    } else {
      this.state = { ...this.state, generationError: message };
    }
    this.notify();
  }
  clearAdvice() {
    this.state = { ...this.state, advice: null, generationError: void 0 };
    this.onAdviceChanged(null);
    this.notify();
  }
  clearGenerationError() {
    if (!this.state.generationError) return;
    this.state = { ...this.state, generationError: void 0 };
    this.notify();
  }
  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
};

// src/data-sources.ts
var ObsidianVaultReader = class {
  constructor(app) {
    this.app = app;
  }
  async exists(path) {
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }
  async read(path) {
    const target = this.app.vault.getFileByPath(path);
    if (!target || target.extension !== "md") {
      throw new Error(`Markdown \u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${path}`);
    }
    return this.app.vault.cachedRead(target);
  }
  async listMarkdown(path) {
    const prefix = `${path}/`;
    return this.app.vault.getMarkdownFiles().filter((file) => file.path === path || file.path.startsWith(prefix)).map((file) => ({ path: file.path, mtime: file.stat.mtime }));
  }
};
var MAX_SUMMARY_LENGTH = 12e3;
function truncate(value) {
  const trimmed = value.trim();
  return trimmed.length <= MAX_SUMMARY_LENGTH ? trimmed : `${trimmed.slice(0, MAX_SUMMARY_LENGTH)}
[\u5185\u5BB9\u5DF2\u622A\u65AD]`;
}
function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {};
  }
  const result = {};
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
function extractLevelTwoSection(markdown, heading) {
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
async function readUserProfileSummary(reader, path) {
  const markdown = await reader.read(path);
  const frontmatter = parseFrontmatter(markdown);
  const metadata = ["current_goal", "last_verified", "next_review"].filter((key) => frontmatter[key]).map((key) => `${key}: ${frontmatter[key]}`);
  const sections = ["\u5F53\u524D\u9636\u6BB5", "\u884C\u52A8\u4F18\u5148\u7EA7", "AI \u534F\u4F5C\u504F\u597D"].map((heading) => extractLevelTwoSection(markdown, heading)).filter(Boolean);
  return truncate([...metadata, ...sections].join("\n\n"));
}
async function readHealthSummary(reader, path) {
  const markdown = await reader.read(path);
  return truncate(["\u7ED3\u8BBA", "\u7EF4\u62A4\u4FE1\u53F7"].map((heading) => extractLevelTwoSection(markdown, heading)).filter(Boolean).join("\n\n"));
}
function readTitle(markdown, path) {
  var _a;
  const heading = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return (heading == null ? void 0 : heading.replace(/^#\s+/, "").trim()) || ((_a = path.split("/").pop()) == null ? void 0 : _a.replace(/\.md$/i, "")) || "\u672A\u547D\u540D\u4EFB\u52A1";
}
async function readTaskQueueSummary(reader, path) {
  const files = await reader.listMarkdown(path);
  const tasks = [];
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
  const order = { doing: 0, todo: 1 };
  return tasks.sort((left, right) => order[left.status] - order[right.status] || left.title.localeCompare(right.title, "zh-Hans-CN"));
}
async function listSource(reader, setting, label, issues) {
  if (!setting.enabled) {
    return [];
  }
  if (!await reader.exists(setting.path)) {
    issues.push(`${label} \u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${setting.path}`);
    return [];
  }
  return reader.listMarkdown(setting.path);
}
function noteTitle(path) {
  var _a;
  return ((_a = path.split("/").pop()) == null ? void 0 : _a.replace(/\.md$/i, "")) || "\u672A\u547D\u540D\u7B14\u8BB0";
}
function recentNotes(files) {
  return [...files].sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path)).slice(0, 3).map((file) => ({ ...file, title: noteTitle(file.path) }));
}
function emptySignal() {
  return { tone: "neutral", text: "\u6682\u65E0\u7B14\u8BB0" };
}
function topLevel(path, root) {
  const relative = path.slice(root.length).replace(/^\/+/, "");
  const parts = relative.split("/");
  return parts.length > 1 ? parts[0] : noteTitle(path);
}
function areaSummary(files, signal) {
  return { count: files.length, recentNotes: recentNotes(files), signal };
}
function buildAreas(files, settings, now) {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1e3;
  const inboxChanges = files.inbox.filter((file) => file.mtime >= weekAgo).length;
  const projectLatest = recentNotes(files.projects)[0];
  const domainLatest = recentNotes(files.domain)[0];
  const wikiLatest = recentNotes(files.wiki)[0];
  return {
    inbox: areaSummary(files.inbox, files.inbox.length === 0 ? emptySignal() : {
      tone: inboxChanges > 0 ? "attention" : "neutral",
      text: `\u6700\u8FD1 7 \u5929\u53D8\u5316 ${inboxChanges} \u7BC7`
    }),
    projects: areaSummary(files.projects, projectLatest ? {
      tone: "neutral",
      text: `\u6700\u8FD1\u6D3B\u8DC3\uFF1A${topLevel(projectLatest.path, settings.sources.projects.path)}`
    } : emptySignal()),
    domain: areaSummary(files.domain, domainLatest ? {
      tone: "neutral",
      text: `\u6700\u8FD1\u6C89\u6DC0\uFF1A${topLevel(domainLatest.path, settings.sources.domain.path)} / ${domainLatest.title}`
    } : emptySignal()),
    wiki: areaSummary(files.wiki, wikiLatest ? domainLatest && domainLatest.mtime > wikiLatest.mtime ? { tone: "attention", text: "Domain \u6709\u66F4\u665A\u66F4\u65B0" } : { tone: "healthy", text: "Wiki \u5DF2\u8986\u76D6\u6700\u8FD1\u65F6\u95F4\u70B9" } : emptySignal())
  };
}
async function readEnabledFile(reader, setting, label, issues, read) {
  if (!setting.enabled) {
    return "";
  }
  if (!await reader.exists(setting.path)) {
    issues.push(`${label} \u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${setting.path}`);
    return "";
  }
  return read(reader, setting.path);
}
async function collectLocalSnapshot(reader, settings, now = Date.now()) {
  const issues = [];
  const areaFiles = {
    inbox: await listSource(reader, settings.sources.inbox, "Inbox", issues),
    domain: await listSource(reader, settings.sources.domain, "Domain", issues),
    projects: await listSource(reader, settings.sources.projects, "Projects", issues),
    wiki: await listSource(reader, settings.sources.wiki, "Wiki", issues)
  };
  const counts = {
    inbox: areaFiles.inbox.length,
    domain: areaFiles.domain.length,
    projects: areaFiles.projects.length,
    wiki: areaFiles.wiki.length
  };
  const areas = buildAreas(areaFiles, settings, now);
  let projectsSummary = "";
  if (settings.sources.projects.enabled && await reader.exists(settings.sources.projects.path)) {
    const actionPath = `${settings.sources.projects.path}/00-\u884C\u52A8\u770B\u677F.md`;
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
  let tasks = [];
  if (settings.sources.taskQueue.enabled) {
    if (await reader.exists(settings.sources.taskQueue.path)) {
      tasks = await readTaskQueueSummary(reader, settings.sources.taskQueue.path);
    } else {
      issues.push(`AI Task Queue \u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${settings.sources.taskQueue.path}`);
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
    areas,
    projectsSummary,
    healthSummary,
    tasks,
    userProfileSummary,
    issues
  };
}

// src/action-advisor.ts
var ACTION_ADVISOR_SYSTEM_PROMPT = `\u4F60\u662F\u4E2A\u4EBA\u77E5\u8BC6\u5E93\u7684\u4E0B\u4E00\u6B65\u884C\u52A8\u6559\u7EC3\u3002
\u53EA\u4F7F\u7528\u7528\u6237\u63D0\u4F9B\u7684 JSON \u4E0A\u4E0B\u6587\uFF0C\u53EA\u8FD4\u56DE\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u4F7F\u7528 Markdown \u4EE3\u7801\u56F4\u680F\uFF0C\u4E0D\u6DFB\u52A0\u89E3\u91CA\u6587\u5B57\uFF0C\u4E0D\u5F97\u8865\u5145\u4E0A\u4E0B\u6587\u4E4B\u5916\u7684\u4E8B\u5B9E\u3002
actions \u5FC5\u987B\u4E3A 1 \u5230\u6700\u591A 3 \u6761\uFF0C\u6BCF\u6761\u5305\u542B priority\u3001title\u3001reason\u3001sources\u3001estimate\u3001acceptance\u3001mode\u3001aiHelp\u3002
\u6BCF\u6761 sources \u5FC5\u987B\u662F context.sourceTypes \u7684\u552F\u4E00\u5B50\u96C6\uFF0C\u6700\u591A 5 \u9879\uFF0C\u4E0D\u5F97\u91CD\u590D\u6216\u7F16\u9020\u6765\u6E90\u3002
priority \u53EA\u5141\u8BB8 P0\u3001P1\u3001P2\uFF0C\u6309 P0\u3001P1\u3001P2 \u6392\u5E8F\uFF1BPaused/Future \u4E0D\u5F97\u751F\u6210\u884C\u52A8\u3002
Maintenance \u53EA\u6709\u5728\u76F4\u63A5\u963B\u585E\u73B0\u5B9E\u76EE\u6807\u65F6\u624D\u80FD\u5EFA\u8BAE\uFF0C\u4E14\u4E0D\u80FD\u4F5C\u4E3A priority \u503C\u3002
\u6280\u672F\u5B66\u4E60\u548C\u9762\u8BD5\u8BAD\u7EC3\u4F7F\u7528 learning\uFF08\u5B66\u4E60\u6A21\u5F0F\uFF09\uFF0C\u673A\u68B0\u7EF4\u62A4\u548C\u660E\u786E\u4EA4\u4ED8\u4F7F\u7528 execution\uFF08\u6267\u884C\u6A21\u5F0F\uFF09\u3002
\u884C\u52A8\u5FC5\u987B\u5177\u4F53\u3001\u7B80\u6D01\u3001\u53EF\u6267\u884C\u3001\u53EF\u9A8C\u6536\uFF0C\u4E0D\u4EE5\u589E\u52A0\u7B14\u8BB0\u6570\u91CF\u4F5C\u4E3A\u6210\u529F\u6807\u51C6\u3002
JSON \u8F93\u51FA\u6837\u4F8B\uFF1A
{"actions":[{"priority":"P0","title":"\u5B8C\u6210\u5F53\u524D\u884C\u52A8","reason":"\u76F4\u63A5\u670D\u52A1\u5F53\u524D\u76EE\u6807","sources":["Projects \u884C\u52A8\u770B\u677F"],"estimate":"30 \u5206\u949F","acceptance":"\u5F62\u6210\u53EF\u9A8C\u8BC1\u7ED3\u679C","mode":"execution","aiHelp":"\u68C0\u67E5\u7ED3\u679C\u5E76\u6307\u51FA\u9057\u6F0F"}]}`;
var PRIORITIES = ["P0", "P1", "P2"];
var MODES = ["learning", "execution"];
var PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 };
function asRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}
function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`\u884C\u52A8\u5EFA\u8BAE\u5B57\u6BB5\u65E0\u6548\uFF1A${field}`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`\u884C\u52A8\u5EFA\u8BAE\u5B57\u6BB5\u8FC7\u957F\uFF1A${field}`);
  }
  return text;
}
function parseSources(value, allowedSources) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("\u884C\u52A8\u5EFA\u8BAE\u6765\u6E90\u5FC5\u987B\u4E3A 1 \u5230 5 \u9879");
  }
  const sources = [...new Set(value.map((source2) => requiredText(source2, "sources", 100)))];
  if (sources.length > 5) {
    throw new Error("\u884C\u52A8\u5EFA\u8BAE\u6765\u6E90\u5FC5\u987B\u4E3A 1 \u5230 5 \u9879");
  }
  return sources.map((text) => {
    if (!allowedSources.has(text)) {
      throw new Error(`\u884C\u52A8\u5EFA\u8BAE\u5F15\u7528\u4E86\u672A\u77E5\u6765\u6E90\uFF1A${text}`);
    }
    return text;
  });
}
function parseActionAdvice(value, allowedSourceNames) {
  const candidate = asRecord(value, "DeepSeek \u8FD4\u56DE\u7684\u884C\u52A8\u5EFA\u8BAE\u4E0D\u662F JSON \u5BF9\u8C61");
  if (!Array.isArray(candidate.actions) || candidate.actions.length < 1 || candidate.actions.length > 3) {
    throw new Error("DeepSeek \u5FC5\u987B\u8FD4\u56DE 1 \u5230 3 \u6761\u884C\u52A8\u5EFA\u8BAE");
  }
  const allowedSources = new Set(allowedSourceNames);
  return candidate.actions.map((item) => {
    const action = asRecord(item, "\u884C\u52A8\u5EFA\u8BAE\u9879\u5FC5\u987B\u662F\u5BF9\u8C61");
    if (!PRIORITIES.includes(action.priority)) {
      throw new Error("\u884C\u52A8\u5EFA\u8BAE\u4F18\u5148\u7EA7\u53EA\u5141\u8BB8 P0\u3001P1\u3001P2");
    }
    if (!MODES.includes(action.mode)) {
      throw new Error("\u884C\u52A8\u5EFA\u8BAE\u534F\u4F5C\u6A21\u5F0F\u53EA\u5141\u8BB8 learning \u6216 execution");
    }
    return {
      priority: action.priority,
      title: requiredText(action.title, "title", 160),
      reason: requiredText(action.reason, "reason", 1e3),
      sources: parseSources(action.sources, allowedSources),
      estimate: requiredText(action.estimate, "estimate", 100),
      acceptance: requiredText(action.acceptance, "acceptance", 800),
      mode: action.mode,
      aiHelp: requiredText(action.aiHelp, "aiHelp", 800)
    };
  }).sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]);
}

// src/deepseek-client.ts
var DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
function errorForStatus(status) {
  switch (status) {
    case 400:
    case 422:
      return new Error("DeepSeek \u8BF7\u6C42\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u7248\u672C\u548C\u6A21\u578B\u8BBE\u7F6E\u3002");
    case 401:
      return new Error("DeepSeek API Key \u65E0\u6548\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u91CD\u65B0\u9009\u62E9\u5BC6\u94A5\u3002");
    case 402:
      return new Error("DeepSeek \u8D26\u6237\u4F59\u989D\u4E0D\u8DB3\uFF0C\u8BF7\u5145\u503C\u540E\u91CD\u8BD5\u3002");
    case 429:
      return new Error("DeepSeek \u8BF7\u6C42\u88AB\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    default:
      return status >= 500 ? new Error("DeepSeek \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002") : new Error(`DeepSeek \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${status}\uFF09\u3002`);
  }
}
function extractCompletion(value) {
  if (!value || typeof value !== "object") {
    return { content: "", finishReason: "" };
  }
  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { content: "", finishReason: "" };
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return { content: "", finishReason: "" };
  }
  const message = first.message;
  if (!message || typeof message !== "object") {
    return { content: "", finishReason: "" };
  }
  const content = message.content;
  const finishReason = first.finish_reason;
  return {
    content: typeof content === "string" ? content.trim() : "",
    finishReason: typeof finishReason === "string" ? finishReason : ""
  };
}
function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch (e2) {
      }
    }
    throw new Error("DeepSeek \u8FD4\u56DE\u7684 JSON \u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u91CD\u8BD5\u3002");
  }
}
function generationOptions(request) {
  if (!request.thinkingEnabled) {
    return { thinking: { type: "disabled" }, max_tokens: 3200 };
  }
  return {
    thinking: { type: "enabled" },
    reasoning_effort: request.reasoningEffort,
    max_tokens: request.reasoningEffort === "max" ? 8e3 : 4800
  };
}
var DeepSeekClient = class {
  constructor(transport, timeoutMs = 6e4) {
    this.transport = transport;
    this.timeoutMs = timeoutMs;
  }
  post(input) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002")),
        this.timeoutMs
      );
      this.transport.post(input).then(
        (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }
  async testConnection(request) {
    const apiKey = request.apiKey.trim();
    if (!apiKey) {
      throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E DeepSeek API Key\u3002");
    }
    let response;
    try {
      response = await this.post({
        url: DEEPSEEK_CHAT_URL,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: {
          model: request.model,
          messages: [{
            role: "user",
            content: '\u8BF7\u53EA\u8FD4\u56DE JSON\uFF1A{"ok":true}\u3002\u8FD9\u662F\u8FDE\u63A5\u6D4B\u8BD5\uFF0C\u4E0D\u5305\u542B\u4EFB\u4F55\u77E5\u8BC6\u5E93\u4E0A\u4E0B\u6587\u3002'
          }],
          response_format: { type: "json_object" },
          stream: false,
          max_tokens: 32
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.split(apiKey).join("[redacted]") : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25";
      throw new Error(`DeepSeek \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A${message}`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status);
    }
    const result = parseJson(extractCompletion(response.json).content);
    if (!result || typeof result !== "object" || result.ok !== true) {
      throw new Error("DeepSeek \u8FDE\u63A5\u6D4B\u8BD5\u8FD4\u56DE\u4E86\u65E0\u6548\u7ED3\u679C\u3002");
    }
  }
  async generateActions(request) {
    const apiKey = request.apiKey.trim();
    if (!apiKey) {
      throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E DeepSeek API Key\u3002");
    }
    const input = {
      url: DEEPSEEK_CHAT_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: {
        model: request.model,
        messages: [
          { role: "system", content: ACTION_ADVISOR_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(request.context) }
        ],
        response_format: { type: "json_object" },
        stream: false,
        ...generationOptions(request)
      }
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await this.post(input);
      } catch (error) {
        const message = error instanceof Error ? error.message.split(apiKey).join("[redacted]") : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25";
        throw new Error(`DeepSeek \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw errorForStatus(response.status);
      }
      const completion = extractCompletion(response.json);
      if (completion.finishReason === "length") {
        throw new Error("DeepSeek \u8F93\u51FA\u88AB\u622A\u65AD\uFF0C\u8BF7\u964D\u4F4E\u63A8\u7406\u5F3A\u5EA6\u6216\u91CD\u8BD5\u3002");
      }
      const content = completion.content;
      if (content) {
        return parseActionAdvice(parseJson(content), request.context.sourceTypes);
      }
    }
    throw new Error("DeepSeek \u8FDE\u7EED\u8FD4\u56DE\u7A7A\u5185\u5BB9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
  }
};

// src/obsidian-deepseek-transport.ts
var import_obsidian = require("obsidian");
var ObsidianDeepSeekTransport = class {
  async post(input) {
    const response = await (0, import_obsidian.requestUrl)({
      url: input.url,
      method: "POST",
      contentType: "application/json",
      headers: input.headers,
      body: JSON.stringify(input.body),
      throw: false
    });
    return { status: response.status, json: response.json };
  }
};

// src/open-plugin-settings.ts
function openPluginSettings(host, pluginId) {
  host.setting.open();
  host.setting.openTabById(pluginId);
}

// src/settings.ts
var source = (path, enabled = true) => ({ enabled, path });
var DEFAULT_SETTINGS = {
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
    userProfile: source("private/\u7528\u6237\u753B\u50CF.md", false)
  },
  latestAdvice: null
};
function asRecord2(value) {
  return value !== null && typeof value === "object" ? value : {};
}
function normalizePath(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function normalizeDataSource(value, fallback = { enabled: false, path: "" }) {
  const candidate = asRecord2(value);
  const candidatePath = "path" in candidate ? normalizePath(candidate.path) : fallback.path;
  const enabled = "enabled" in candidate ? candidate.enabled === true : fallback.enabled;
  return {
    enabled: enabled && candidatePath.length > 0,
    path: candidatePath
  };
}
function migrateSources(value) {
  const candidates = asRecord2(value);
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
function isAdviceState(value) {
  const candidate = asRecord2(value);
  return Array.isArray(candidate.actions) && typeof candidate.generatedAt === "number" && typeof candidate.contextFingerprint === "string" && (candidate.status === "fresh" || candidate.status === "stale" || candidate.status === "error");
}
function migrateSettings(value) {
  const candidate = asRecord2(value);
  const actionLimit = typeof candidate.actionLimit === "number" ? Math.min(3, Math.max(1, Math.round(candidate.actionLimit))) : DEFAULT_SETTINGS.actionLimit;
  const deepseekModel = candidate.deepseekModel === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  return {
    actionLimit,
    deepseekModel,
    deepseekThinkingEnabled: typeof candidate.deepseekThinkingEnabled === "boolean" ? candidate.deepseekThinkingEnabled : DEFAULT_SETTINGS.deepseekThinkingEnabled,
    deepseekReasoningEffort: candidate.deepseekReasoningEffort === "max" ? "max" : "high",
    deepseekSecretName: typeof candidate.deepseekSecretName === "string" ? candidate.deepseekSecretName.trim() : "",
    sources: migrateSources(candidate.sources),
    latestAdvice: isAdviceState(candidate.latestAdvice) ? candidate.latestAdvice : null
  };
}

// src/settings-tab.ts
var import_obsidian2 = require("obsidian");
var SOURCE_LABELS = [
  { key: "inbox", name: "Inbox", description: "\u4E34\u65F6\u8F93\u5165\u3001\u7F51\u9875\u526A\u85CF\u548C\u8349\u7A3F\u76EE\u5F55\u3002" },
  { key: "domain", name: "Domain", description: "\u53EF\u590D\u7528\u77E5\u8BC6\u76EE\u5F55\uFF0C\u53EA\u7EDF\u8BA1\u6570\u91CF\u3002" },
  { key: "projects", name: "Projects", description: "\u9879\u76EE\u76EE\u5F55\uFF0C\u8BFB\u53D6\u6839\u76EE\u5F55\u884C\u52A8\u770B\u677F\u6458\u8981\u3002" },
  { key: "wiki", name: "Wiki", description: "Wiki \u6295\u5F71\u76EE\u5F55\uFF0C\u53EA\u7EDF\u8BA1\u6570\u91CF\u3002" },
  { key: "health", name: "Health report", description: "\u8BFB\u53D6\u7ED3\u8BBA\u548C\u7EF4\u62A4\u4FE1\u53F7\u3002" },
  { key: "taskQueue", name: "AI Task Queue", description: "\u8BFB\u53D6 todo / doing \u4EFB\u52A1\u6458\u8981\u3002" },
  { key: "assets", name: "Assets", description: "\u9644\u4EF6\u6392\u9664\u76EE\u5F55\uFF0C\u4E0D\u53D1\u9001\u5185\u5BB9\u3002" },
  { key: "userProfile", name: "User Profile", description: "\u654F\u611F\u6570\u636E\u6E90\uFF1B\u53EA\u63D0\u53D6\u76EE\u6807\u3001\u4F18\u5148\u7EA7\u548C\u534F\u4F5C\u504F\u597D\u3002" }
];
var DashboardSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, controller, plugin) {
    super(app, plugin);
    this.controller = controller;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Knowledge Dashboard" });
    new import_obsidian2.Setting(containerEl).setName("DeepSeek API Key").setDesc("\u5BC6\u94A5\u4FDD\u5B58\u5728 Obsidian SecretStorage\uFF0C\u63D2\u4EF6\u8BBE\u7F6E\u53EA\u8BB0\u5F55 Secret \u540D\u79F0\u3002").addComponent((element) => new import_obsidian2.SecretComponent(this.app, element).setValue(this.controller.settings.deepseekSecretName).onChange(async (value) => {
      this.controller.settings.deepseekSecretName = value;
      await this.controller.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("DeepSeek model").setDesc("Flash \u9002\u5408\u65E5\u5E38\u884C\u52A8\u5EFA\u8BAE\uFF1BPro \u9002\u5408\u9700\u8981\u66F4\u5F3A\u63A8\u7406\u7684\u573A\u666F\u3002").addDropdown((dropdown) => dropdown.addOption("deepseek-v4-flash", "DeepSeek V4 Flash").addOption("deepseek-v4-pro", "DeepSeek V4 Pro").setValue(this.controller.settings.deepseekModel).onChange(async (value) => {
      this.controller.settings.deepseekModel = value === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
      await this.controller.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Enable DeepSeek Thinking").setDesc("\u5F00\u542F\u540E\u8BA9 DeepSeek \u5148\u63A8\u7406\u518D\u751F\u6210\u884C\u52A8\u5EFA\u8BAE\uFF1B\u54CD\u5E94\u65F6\u95F4\u548C Token \u6D88\u8017\u4F1A\u589E\u52A0\u3002").addToggle((toggle) => toggle.setValue(this.controller.settings.deepseekThinkingEnabled).onChange(async (value) => {
      this.controller.settings.deepseekThinkingEnabled = value;
      await this.controller.saveSettings();
      this.display();
    }));
    if (this.controller.settings.deepseekThinkingEnabled) {
      new import_obsidian2.Setting(containerEl).setName("Thinking effort").setDesc("\u6807\u51C6\u9002\u5408\u65E5\u5E38\u5EFA\u8BAE\uFF1B\u6700\u5F3A\u9002\u5408\u590D\u6742\u89C4\u5212\uFF0C\u5E76\u4F1A\u4F7F\u7528\u66F4\u591A\u65F6\u95F4\u548C Token\u3002").addDropdown((dropdown) => dropdown.addOption("high", "\u6807\u51C6\uFF08high\uFF09").addOption("max", "\u6700\u5F3A\uFF08max\uFF09").setValue(this.controller.settings.deepseekReasoningEffort).onChange(async (value) => {
        this.controller.settings.deepseekReasoningEffort = value === "max" ? "max" : "high";
        await this.controller.saveSettings();
      }));
    }
    new import_obsidian2.Setting(containerEl).setName("Test DeepSeek connection").setDesc("\u53EA\u6D4B\u8BD5\u5BC6\u94A5\u548C\u6A21\u578B\uFF0C\u4E0D\u53D1\u9001\u77E5\u8BC6\u5E93\u4E0A\u4E0B\u6587\u3002").addButton((button) => button.setButtonText("Test").onClick(async () => {
      button.setDisabled(true).setButtonText("Testing\u2026");
      try {
        await this.controller.testDeepSeekConnection();
        new import_obsidian2.Notice("DeepSeek connection succeeded.");
      } catch (error) {
        new import_obsidian2.Notice(error instanceof Error ? error.message : "DeepSeek connection failed.");
      } finally {
        button.setDisabled(false).setButtonText("Test");
      }
    }));
    new import_obsidian2.Setting(containerEl).setName("Action limit").setDesc("Dashboard \u6700\u591A\u5C55\u793A 1\u20143 \u6761\u884C\u52A8\u5EFA\u8BAE\u3002").addSlider((slider) => slider.setLimits(1, 3, 1).setValue(this.controller.settings.actionLimit).setDynamicTooltip().onChange(async (value) => {
      this.controller.settings.actionLimit = value;
      await this.controller.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Data sources" });
    containerEl.createEl("p", {
      text: "\u5173\u95ED\u6216\u6E05\u7A7A\u8DEF\u5F84\u540E\uFF0C\u8BE5\u6570\u636E\u6E90\u4E0D\u4F1A\u88AB\u8BFB\u53D6\u3001\u76D1\u542C\u3001\u7EDF\u8BA1\u6216\u53D1\u9001\u7ED9 DeepSeek\u3002"
    });
    SOURCE_LABELS.forEach((item) => this.renderDataSource(
      containerEl,
      item.name,
      item.description,
      this.controller.settings.sources[item.key]
    ));
    new import_obsidian2.Setting(containerEl).setName("Clear AI advice cache").setDesc("\u6E05\u9664\u672C\u5730\u4FDD\u5B58\u7684\u884C\u52A8\u5EFA\u8BAE\uFF0C\u4E0D\u4FEE\u6539\u77E5\u8BC6\u5E93\u4EFB\u52A1\u6587\u4EF6\u3002").addButton((button) => button.setWarning().setButtonText("Clear").onClick(async () => {
      await this.controller.clearAdvice();
      new import_obsidian2.Notice("AI advice cache cleared.");
    }));
  }
  renderDataSource(parent, name, description, source2) {
    const setting = new import_obsidian2.Setting(parent).setName(name).setDesc(description);
    setting.addToggle((toggle) => toggle.setValue(source2.enabled).onChange(async (value) => {
      source2.enabled = value && source2.path.trim().length > 0;
      await this.controller.saveSettings();
      this.display();
    }));
    setting.addText((text) => text.setPlaceholder("Disabled when empty").setValue(source2.path).onChange(async (value) => {
      source2.path = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      source2.enabled = source2.path.length > 0 && source2.enabled;
      await this.controller.saveSettings();
    }));
  }
};

// src/views/dashboard-view.ts
var import_obsidian3 = require("obsidian");
var DASHBOARD_VIEW_TYPE = "ai-knowledge-dashboard-view";
var EMPTY_AREA = {
  count: 0,
  recentNotes: [],
  signal: { tone: "neutral", text: "\u6682\u65E0\u7B14\u8BB0" }
};
function formatRelativeTime(mtime, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - mtime) / 1e3));
  if (seconds < 60) return "\u521A\u521A";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
  return `${Math.floor(hours / 24)} \u5929\u524D`;
}
var DashboardView = class extends import_obsidian3.ItemView {
  constructor(leaf, controller) {
    super(leaf);
    this.controller = controller;
    this.activePage = "dashboard";
    this.unsubscribe = null;
    this.includeUserProfile = true;
    this.generating = false;
    this.generationStartedAt = 0;
    this.generationTimer = null;
    this.state = controller.store.state;
  }
  getViewType() {
    return DASHBOARD_VIEW_TYPE;
  }
  getDisplayText() {
    return "AI Knowledge Dashboard";
  }
  getIcon() {
    return "sparkles";
  }
  async onOpen() {
    this.unsubscribe = this.controller.store.subscribe((state) => {
      this.state = state;
      this.render();
    });
    await this.controller.store.refresh();
  }
  async onClose() {
    var _a;
    this.stopGenerationTimer();
    (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
    this.unsubscribe = null;
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("akd-view");
    const shell = container.createDiv({ cls: "akd-shell" });
    this.renderNavigation(shell);
    const main = shell.createEl("main", { cls: "akd-main" });
    if (this.activePage === "dashboard") this.renderDashboard(main);
    if (this.activePage === "inbox") this.renderFilePage(main, "Inbox", this.controller.settings.sources.inbox);
    if (this.activePage === "projects") this.renderFilePage(main, "Projects", this.controller.settings.sources.projects);
    if (this.activePage === "knowledge") this.renderKnowledge(main);
    if (this.activePage === "wiki") this.renderFilePage(main, "Wiki", this.controller.settings.sources.wiki);
    if (this.activePage === "health") this.renderHealth(main);
    if (this.activePage === "tasks") this.renderTasks(main);
  }
  renderNavigation(parent) {
    const navigation = parent.createEl("nav", {
      cls: "akd-top-nav",
      attr: { "aria-label": "Dashboard navigation" }
    });
    const renderPageButton = (target, page, label, extraClass = "") => {
      const classes = [
        "akd-nav-item",
        extraClass,
        page === this.activePage ? "is-active" : ""
      ].filter(Boolean).join(" ");
      const button = target.createEl("button", { cls: classes, text: label });
      button.addEventListener("click", () => {
        this.activePage = page;
        this.render();
      });
    };
    renderPageButton(navigation, "dashboard", "Dashboard", "akd-nav-home");
    const scroll = navigation.createDiv({ cls: "akd-nav-scroll" });
    const pages = [
      ["tasks", "Action Guide"],
      ["projects", "Projects"],
      ["inbox", "Inbox"],
      ["knowledge", "Knowledge Map"],
      ["wiki", "Wiki"],
      ["health", "Health"]
    ];
    pages.forEach(([page, label]) => {
      renderPageButton(scroll, page, label);
    });
    const settings = navigation.createEl("button", {
      cls: "akd-nav-item akd-nav-settings",
      text: "Settings"
    });
    settings.addEventListener("click", () => this.controller.openSettings());
  }
  renderDashboard(parent) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (this.state.issues.length > 0) {
      const issues = parent.createDiv({ cls: "akd-message akd-message-error" });
      issues.createEl("strong", { text: "Configuration or refresh issue" });
      const list = issues.createEl("ul");
      this.state.issues.forEach((issue) => list.createEl("li", { text: issue }));
    }
    const controls = parent.createDiv({ cls: "akd-ai-controls" });
    controls.createEl("h2", { text: "\u4E0B\u4E00\u6B65\u884C\u52A8\u5EFA\u8BAE" });
    const sources = (_b = (_a = this.state.context) == null ? void 0 : _a.sourceTypes) != null ? _b : [];
    controls.createEl("p", { text: `\u672C\u6B21\u6570\u636E\u7C7B\u578B\uFF1A${sources.join("\u3001") || "\u5C1A\u65E0\u53EF\u7528\u6570\u636E"}` });
    const hasProfile = sources.includes("\u7528\u6237\u753B\u50CF\u4F18\u5148\u7EA7");
    if (hasProfile) {
      const label = controls.createEl("label", { cls: "akd-profile-consent" });
      const checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = this.includeUserProfile;
      checkbox.addEventListener("change", () => {
        this.includeUserProfile = checkbox.checked;
      });
      label.appendText(" \u672C\u6B21\u5305\u542B\u7ECF\u8FC7\u7B5B\u9009\u7684\u7528\u6237\u753B\u50CF\u4F18\u5148\u7EA7");
    }
    const button = controls.createEl("button", {
      text: this.generating ? "\u751F\u6210\u4E2D" : "\u751F\u6210\u4E0B\u4E00\u6B65\u884C\u52A8"
    });
    button.disabled = this.generating || !this.state.context;
    button.addEventListener("click", () => void this.generate());
    this.renderGenerationStatus(parent);
    this.renderAdvice(parent);
    const overview = parent.createDiv({ cls: "akd-overview-header" });
    overview.createEl("h2", { text: "\u77E5\u8BC6\u9886\u57DF\u6982\u89C8" });
    overview.createEl("p", { text: "\u6700\u8FD1\u53D8\u5316\u4E0E\u5F53\u524D\u89C4\u6A21" });
    const areas = (_c = this.state.snapshot) == null ? void 0 : _c.areas;
    const stats = parent.createDiv({ cls: "akd-progress-cards" });
    this.renderAreaCard(stats, (_d = areas == null ? void 0 : areas.inbox) != null ? _d : EMPTY_AREA, "Inbox", "inbox");
    this.renderAreaCard(stats, (_e = areas == null ? void 0 : areas.domain) != null ? _e : EMPTY_AREA, "Domain", "knowledge");
    this.renderAreaCard(stats, (_f = areas == null ? void 0 : areas.projects) != null ? _f : EMPTY_AREA, "Projects", "projects");
    this.renderAreaCard(stats, (_g = areas == null ? void 0 : areas.wiki) != null ? _g : EMPTY_AREA, "Wiki", "wiki");
  }
  async generate() {
    if (this.generating) return;
    this.generating = true;
    this.generationStartedAt = Date.now();
    this.controller.store.clearGenerationError();
    this.render();
    this.generationTimer = setInterval(() => this.render(), 1e3);
    try {
      await this.controller.generateAdvice(this.includeUserProfile);
    } finally {
      this.generating = false;
      this.stopGenerationTimer();
      this.render();
    }
  }
  stopGenerationTimer() {
    if (this.generationTimer) clearInterval(this.generationTimer);
    this.generationTimer = null;
  }
  renderGenerationStatus(parent) {
    if (!this.generating) return;
    const status = parent.createDiv({ cls: "akd-generation-status", attr: { "aria-live": "polite" } });
    status.createSpan({ cls: "akd-spinner", attr: { "aria-hidden": "true" } });
    status.createSpan({
      text: this.controller.settings.deepseekThinkingEnabled ? "DeepSeek \u6B63\u5728\u601D\u8003\u5E76\u751F\u6210\u884C\u52A8\u5EFA\u8BAE\u2026" : "DeepSeek \u6B63\u5728\u751F\u6210\u884C\u52A8\u5EFA\u8BAE\u2026"
    });
    const elapsed = Math.max(0, Math.floor((Date.now() - this.generationStartedAt) / 1e3));
    status.createEl("small", { text: `\u5DF2\u7B49\u5F85 ${elapsed} \u79D2` });
  }
  renderAdvice(parent) {
    var _a;
    const advice = this.state.advice;
    if (!advice) {
      if (this.state.generationError) {
        parent.createDiv({ cls: "akd-message akd-advice-error", text: this.state.generationError });
        return;
      }
      parent.createDiv({ cls: "akd-message", text: "\u5C1A\u672A\u751F\u6210\u884C\u52A8\u5EFA\u8BAE\u3002" });
      return;
    }
    const status = parent.createDiv({
      cls: `akd-message akd-advice-${advice.status}`,
      text: advice.status === "stale" ? "\u76F8\u5173\u6570\u636E\u5DF2\u7ECF\u53D8\u5316\uFF0C\u8FD9\u4E9B\u5EFA\u8BAE\u53EF\u80FD\u5DF2\u8FC7\u671F\u3002" : advice.status === "error" ? `\u66F4\u65B0\u5931\u8D25\uFF1A${(_a = advice.errorMessage) != null ? _a : "\u672A\u77E5\u9519\u8BEF"}\uFF08\u4FDD\u7559\u4E0A\u6B21\u6210\u529F\u5EFA\u8BAE\uFF09` : `\u751F\u6210\u4E8E ${new Date(advice.generatedAt).toLocaleString()}`
    });
    status.dataset.status = advice.status;
    const grid = parent.createDiv({ cls: "akd-guide-grid" });
    advice.actions.slice(0, this.controller.settings.actionLimit).forEach((item) => {
      const card = grid.createDiv({ cls: "akd-guide-card" });
      card.createEl("span", { cls: "akd-pill", text: `${item.priority} \xB7 ${item.estimate}` });
      card.createEl("h3", { text: item.title });
      card.createEl("p", { text: item.reason });
      card.createEl("strong", { text: `\u9A8C\u6536\uFF1A${item.acceptance}` });
      card.createEl("small", { text: `${item.mode === "learning" ? "\u5B66\u4E60\u6A21\u5F0F" : "\u6267\u884C\u6A21\u5F0F"} \xB7 AI\uFF1A${item.aiHelp}` });
      const tags = card.createDiv({ cls: "akd-tags" });
      item.sources.forEach((source2) => tags.createEl("span", { text: source2 }));
    });
  }
  renderFilePage(parent, title, source2) {
    this.renderPageHeader(parent, title, source2.enabled ? source2.path : "\u672A\u914D\u7F6E");
    if (!source2.enabled) {
      parent.createDiv({ cls: "akd-message", text: `${title} \u6570\u636E\u6E90\u672A\u542F\u7528\u3002` });
      return;
    }
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${source2.path}/`)).sort((left, right) => right.stat.mtime - left.stat.mtime).slice(0, 12);
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    files.forEach((file) => {
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("h3", { text: file.basename });
      card.createEl("p", { text: file.path });
      const button = card.createEl("button", { text: "Open note" });
      button.addEventListener("click", () => void this.openFile(file));
    });
    if (files.length === 0) grid.createDiv({ cls: "akd-message", text: "\u6CA1\u6709\u53EF\u663E\u793A\u7684 Markdown \u6587\u4EF6\u3002" });
  }
  renderKnowledge(parent) {
    const source2 = this.controller.settings.sources.domain;
    this.renderPageHeader(parent, "Knowledge Map", source2.enabled ? source2.path : "\u672A\u914D\u7F6E");
    if (!source2.enabled) {
      parent.createDiv({ cls: "akd-message", text: "Domain \u6570\u636E\u6E90\u672A\u542F\u7528\u3002" });
      return;
    }
    const folder = this.app.vault.getFolderByPath(source2.path);
    if (!(folder instanceof import_obsidian3.TFolder)) {
      parent.createDiv({ cls: "akd-message akd-message-error", text: `Domain \u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${source2.path}` });
      return;
    }
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    folder.children.filter((child) => child instanceof import_obsidian3.TFolder).forEach((child) => {
      const count = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${child.path}/`)).length;
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("h3", { text: child.name });
      card.createEl("p", { text: `${count} notes` });
    });
  }
  renderHealth(parent) {
    var _a;
    const source2 = this.controller.settings.sources.health;
    this.renderPageHeader(parent, "Health", source2.enabled ? source2.path : "\u672A\u914D\u7F6E");
    if (!source2.enabled) {
      parent.createDiv({ cls: "akd-message", text: "Health \u6570\u636E\u6E90\u672A\u542F\u7528\u3002" });
      return;
    }
    const summary = (_a = this.state.snapshot) == null ? void 0 : _a.healthSummary;
    if (summary) {
      const content = parent.createDiv({ cls: "akd-health-content markdown-rendered" });
      void import_obsidian3.MarkdownRenderer.render(this.app, summary, content, source2.path, this);
    } else {
      parent.createDiv({ cls: "akd-message", text: "Health \u6570\u636E\u6E90\u7F3A\u5931\u6216\u6CA1\u6709\u53EF\u89E3\u6790\u5185\u5BB9\u3002" });
    }
    const file = this.app.vault.getFileByPath(source2.path);
    if (file) {
      const openSource = parent.createEl("button", {
        cls: "akd-health-source",
        text: "\u6253\u5F00 Health \u539F\u6587"
      });
      openSource.addEventListener("click", () => void this.openFile(file));
    }
  }
  renderTasks(parent) {
    var _a, _b;
    this.renderPageHeader(parent, "Action Guide", "AI Task Queue \u4E0E\u6700\u540E\u751F\u6210\u7684\u884C\u52A8\u5EFA\u8BAE");
    const tasks = (_b = (_a = this.state.snapshot) == null ? void 0 : _a.tasks) != null ? _b : [];
    const grid = parent.createDiv({ cls: "akd-page-grid" });
    tasks.forEach((task) => {
      const card = grid.createDiv({ cls: "akd-map-card" });
      card.createEl("span", { cls: "akd-pill", text: `${task.status} \xB7 ${task.kind}` });
      card.createEl("h3", { text: task.title });
    });
    if (tasks.length === 0) grid.createDiv({ cls: "akd-message", text: "\u5F53\u524D\u6CA1\u6709 todo / doing AI \u7EF4\u62A4\u4EFB\u52A1\u3002" });
    this.renderGenerationStatus(parent);
    this.renderAdvice(parent);
  }
  renderPageHeader(parent, title, description) {
    const header = parent.createDiv({ cls: "akd-page-header" });
    header.createEl("span", { text: "AI KNOWLEDGE DASHBOARD" });
    header.createEl("h1", { text: title });
    header.createEl("p", { text: description });
  }
  renderAreaCard(parent, area, label, page) {
    const card = parent.createDiv({ cls: "akd-progress-card akd-area-card" });
    const heading = card.createDiv({ cls: "akd-area-heading" });
    const title = heading.createDiv({ cls: "akd-area-title" });
    title.createEl("span", { text: label });
    title.createEl("strong", { text: String(area.count) });
    const all = heading.createEl("button", { cls: "akd-area-link", text: "\u67E5\u770B \u2192" });
    all.addEventListener("click", () => {
      this.activePage = page;
      this.render();
    });
    card.createDiv({
      cls: `akd-area-signal is-${area.signal.tone}`,
      text: area.signal.text
    });
    const notes = card.createDiv({ cls: "akd-recent-notes" });
    area.recentNotes.forEach((note) => this.renderRecentNote(notes, note));
    if (area.recentNotes.length === 0) notes.createEl("small", { text: "\u6682\u65E0\u6700\u8FD1\u7B14\u8BB0" });
  }
  renderRecentNote(parent, note) {
    const button = parent.createEl("button", {
      cls: "akd-recent-note",
      attr: { title: note.title }
    });
    button.createSpan({ cls: "akd-recent-note-title", text: note.title });
    button.createEl("small", { text: formatRelativeTime(note.mtime) });
    button.addEventListener("click", () => {
      const file = this.app.vault.getFileByPath(note.path);
      if (file) void this.openFile(file);
    });
  }
  async openFile(file) {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    await this.app.workspace.revealLeaf(leaf);
  }
};

// src/main.ts
var AiKnowledgeDashboardPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.generationInProgress = false;
  }
  async onload() {
    this.settings = migrateSettings(await this.loadData());
    await this.saveData(this.settings);
    const reader = new ObsidianVaultReader(this.app);
    this.store = new DashboardStore(
      () => this.settings,
      () => collectLocalSnapshot(reader, this.settings),
      (advice) => {
        this.settings.latestAdvice = advice;
        void this.saveData(this.settings);
      }
    );
    this.deepseekClient = new DeepSeekClient(new ObsidianDeepSeekTransport());
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("sparkles", "Open AI Knowledge Dashboard", () => {
      void this.activateDashboardView();
    });
    this.addCommand({
      id: "open-ai-knowledge-dashboard",
      name: "Open AI Knowledge Dashboard",
      callback: () => void this.activateDashboardView()
    });
    this.addCommand({
      id: "generate-next-actions",
      name: "Generate next actions with DeepSeek",
      callback: () => void this.generateAdvice(true)
    });
    this.addSettingTab(new DashboardSettingTab(this.app, this, this));
    this.registerEvent(this.app.vault.on("create", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.store.scheduleRefresh(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.store.scheduleRefresh(oldPath);
      this.store.scheduleRefresh(file.path);
    }));
    await this.store.refresh();
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }
  async activateDashboardView() {
    await activateDashboard(this.app.workspace, DASHBOARD_VIEW_TYPE);
  }
  openSettings() {
    openPluginSettings(this.app, this.manifest.id);
  }
  async saveSettings() {
    this.settings = migrateSettings(this.settings);
    await this.saveData(this.settings);
    await this.store.refresh();
  }
  async testDeepSeekConnection() {
    const apiKey = this.getDeepSeekApiKey();
    await this.deepseekClient.testConnection({ apiKey, model: this.settings.deepseekModel });
  }
  async clearAdvice() {
    this.store.clearAdvice();
    this.settings.latestAdvice = null;
    await this.saveData(this.settings);
  }
  async generateAdvice(includeUserProfile) {
    if (this.generationInProgress) {
      new import_obsidian4.Notice("DeepSeek generation is already in progress.");
      return;
    }
    this.generationInProgress = true;
    try {
      await this.store.refresh();
      if (!this.store.state.context) {
        throw new Error("\u6CA1\u6709\u53EF\u7528\u4E8E\u751F\u6210\u884C\u52A8\u5EFA\u8BAE\u7684\u4E0A\u4E0B\u6587\u3002");
      }
      const context = this.filterContext(this.store.state.context, includeUserProfile);
      const actions = await this.deepseekClient.generateActions({
        apiKey: this.getDeepSeekApiKey(),
        model: this.settings.deepseekModel,
        thinkingEnabled: this.settings.deepseekThinkingEnabled,
        reasoningEffort: this.settings.deepseekReasoningEffort,
        context
      });
      this.store.acceptAdvice(actions, stableFingerprint(this.store.state.context));
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek \u884C\u52A8\u5EFA\u8BAE\u751F\u6210\u5931\u8D25\u3002";
      this.store.setAdviceError(message);
      new import_obsidian4.Notice(message);
    } finally {
      this.generationInProgress = false;
    }
  }
  getDeepSeekApiKey() {
    const secretName = this.settings.deepseekSecretName;
    if (!secretName) {
      throw new Error("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u9009\u62E9 DeepSeek API Key Secret\u3002");
    }
    const apiKey = this.app.secretStorage.getSecret(secretName);
    if (!apiKey) {
      throw new Error("\u9009\u62E9\u7684 DeepSeek Secret \u4E0D\u5B58\u5728\u6216\u5185\u5BB9\u4E3A\u7A7A\u3002");
    }
    return apiKey;
  }
  filterContext(context, includeUserProfile) {
    if (includeUserProfile || !context.userProfile) {
      return context;
    }
    const { userProfile: _removed, ...safeContext } = context;
    return {
      ...safeContext,
      sourceTypes: context.sourceTypes.filter((source2) => source2 !== "\u7528\u6237\u753B\u50CF\u4F18\u5148\u7EA7")
    };
  }
};
