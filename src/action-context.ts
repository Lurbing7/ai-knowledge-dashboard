import type { ActionContext, LocalSnapshot } from "./types";

const SENSITIVE_LINE = /(?:api[_ -]?key|password|token|secret|密钥|密码|凭据)/i;
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/][^\s\])}"']+/g;

function sanitizeText(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !SENSITIVE_LINE.test(line))
    .join("\n")
    .replace(WINDOWS_ABSOLUTE_PATH, "[local-path]")
    .trim();
}

export function buildActionContext(snapshot: LocalSnapshot): ActionContext {
  const context: ActionContext = {
    sourceTypes: [],
    statistics: snapshot.counts
  };
  const projects = sanitizeText(snapshot.projectsSummary);
  if (projects) {
    context.projects = projects;
    context.sourceTypes.push("Projects 行动看板");
  }
  if (snapshot.tasks.length > 0) {
    context.tasks = snapshot.tasks.map((task) => ({ ...task }));
    context.sourceTypes.push("AI Task Queue");
  }
  const health = sanitizeText(snapshot.healthSummary);
  if (health) {
    context.health = health;
    context.sourceTypes.push("Health 摘要");
  }
  const userProfile = sanitizeText(snapshot.userProfileSummary);
  if (userProfile) {
    context.userProfile = userProfile;
    context.sourceTypes.push("用户画像优先级");
  }
  context.sourceTypes.push("知识库统计");
  return context;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function stableFingerprint(value: unknown): string {
  const input = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
