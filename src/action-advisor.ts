import type { ActionAdvice, AdvicePriority, CollaborationMode } from "./types";

export const ACTION_ADVISOR_SYSTEM_PROMPT = `你是个人知识库的下一步行动教练。
只使用用户提供的 JSON 上下文，只返回一个 JSON 对象，不使用 Markdown 代码围栏，不添加解释文字，不得补充上下文之外的事实。
actions 必须为 1 到最多 3 条，每条包含 priority、title、reason、sources、estimate、acceptance、mode、aiHelp。
每条 sources 必须是 context.sourceTypes 的唯一子集，最多 5 项，不得重复或编造来源。
priority 只允许 P0、P1、P2，按 P0、P1、P2 排序；Paused/Future 不得生成行动。
Maintenance 只有在直接阻塞现实目标时才能建议，且不能作为 priority 值。
技术学习和面试训练使用 learning（学习模式），机械维护和明确交付使用 execution（执行模式）。
行动必须具体、简洁、可执行、可验收，不以增加笔记数量作为成功标准。
JSON 输出样例：
{"actions":[{"priority":"P0","title":"完成当前行动","reason":"直接服务当前目标","sources":["Projects 行动看板"],"estimate":"30 分钟","acceptance":"形成可验证结果","mode":"execution","aiHelp":"检查结果并指出遗漏"}]}`;

const PRIORITIES: AdvicePriority[] = ["P0", "P1", "P2"];
const MODES: CollaborationMode[] = ["learning", "execution"];
const PRIORITY_ORDER: Record<AdvicePriority, number> = { P0: 0, P1: 1, P2: 2 };

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`行动建议字段无效：${field}`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`行动建议字段过长：${field}`);
  }
  return text;
}

function parseSources(value: unknown, allowedSources: Set<string>): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("行动建议来源必须为 1 到 5 项");
  }

  const sources = [...new Set(value.map(source => requiredText(source, "sources", 100)))];
  if (sources.length > 5) {
    throw new Error("行动建议来源必须为 1 到 5 项");
  }

  return sources.map(text => {
    if (!allowedSources.has(text)) {
      throw new Error(`行动建议引用了未知来源：${text}`);
    }
    return text;
  });
}

export function parseActionAdvice(value: unknown, allowedSourceNames: string[]): ActionAdvice[] {
  const candidate = asRecord(value, "DeepSeek 返回的行动建议不是 JSON 对象");
  if (!Array.isArray(candidate.actions) || candidate.actions.length < 1 || candidate.actions.length > 3) {
    throw new Error("DeepSeek 必须返回 1 到 3 条行动建议");
  }
  const allowedSources = new Set(allowedSourceNames);
  return candidate.actions.map((item) => {
    const action = asRecord(item, "行动建议项必须是对象");
    if (!PRIORITIES.includes(action.priority as AdvicePriority)) {
      throw new Error("行动建议优先级只允许 P0、P1、P2");
    }
    if (!MODES.includes(action.mode as CollaborationMode)) {
      throw new Error("行动建议协作模式只允许 learning 或 execution");
    }
    return {
      priority: action.priority as AdvicePriority,
      title: requiredText(action.title, "title", 160),
      reason: requiredText(action.reason, "reason", 1_000),
      sources: parseSources(action.sources, allowedSources),
      estimate: requiredText(action.estimate, "estimate", 100),
      acceptance: requiredText(action.acceptance, "acceptance", 800),
      mode: action.mode as CollaborationMode,
      aiHelp: requiredText(action.aiHelp, "aiHelp", 800)
    };
  }).sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]);
}
