import { describe, expect, it } from "vitest";
import { ACTION_ADVISOR_SYSTEM_PROMPT, parseActionAdvice } from "../src/action-advisor";

const validAction = {
  priority: "P0",
  title: "完成当前行动",
  reason: "它直接服务当前目标",
  sources: ["Projects 行动看板"],
  estimate: "30 分钟",
  acceptance: "形成可验证结果",
  mode: "execution",
  aiHelp: "检查结果并指出遗漏"
};

describe("action advice validation", () => {
  it("accepts one to three actions and orders them by priority", () => {
    const parsed = parseActionAdvice({
      actions: [
        { ...validAction, priority: "P2", title: "P2 行动" },
        { ...validAction, priority: "P0", title: "P0 行动" },
        { ...validAction, priority: "P1", title: "P1 行动" }
      ]
    }, ["Projects 行动看板"]);

    expect(parsed.map((item) => item.priority)).toEqual(["P0", "P1", "P2"]);
  });

  it("rejects sources that were not supplied to the model", () => {
    expect(() => parseActionAdvice({
      actions: [{ ...validAction, sources: ["完整 Private"] }]
    }, ["Projects 行动看板"])).toThrow("未知来源");
  });

  it("deduplicates repeated allowed sources before enforcing the limit", () => {
    const parsed = parseActionAdvice({
      actions: [{ ...validAction, sources: Array(6).fill("Projects 行动看板") }]
    }, ["Projects 行动看板"]);

    expect(parsed[0].sources).toEqual(["Projects 行动看板"]);
  });

  it("rejects more than five distinct allowed sources", () => {
    const sources = ["来源 1", "来源 2", "来源 3", "来源 4", "来源 5", "来源 6"];

    expect(() => parseActionAdvice({
      actions: [{ ...validAction, sources }]
    }, sources)).toThrow("1 到 5 项");
  });

  it("rejects unknown sources after normalization", () => {
    expect(() => parseActionAdvice({
      actions: [{ ...validAction, sources: [" Projects 行动看板 ", "未知来源"] }]
    }, ["Projects 行动看板"])).toThrow("未知来源");
  });

  it("rejects empty, oversized and malformed action lists", () => {
    expect(() => parseActionAdvice({ actions: [] }, [])).toThrow("1 到 3 条");
    expect(() => parseActionAdvice({ actions: Array(4).fill(validAction) }, ["Projects 行动看板"]))
      .toThrow("1 到 3 条");
    expect(() => parseActionAdvice({ actions: [{ ...validAction, priority: "Maintenance" }] }, ["Projects 行动看板"]))
      .toThrow("优先级");
  });

  it("instructs the model to return JSON and respect the learning boundary", () => {
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("JSON");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("最多 3 条");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("Paused/Future");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("学习模式");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("context.sourceTypes");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("唯一子集");
    expect(ACTION_ADVISOR_SYSTEM_PROMPT).toContain("最多 5 项");
  });
});
