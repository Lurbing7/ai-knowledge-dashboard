import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepSeekClient,
  type DeepSeekTransport,
  type TransportResponse
} from "../src/deepseek-client";
import type { ActionContext } from "../src/types";

const context: ActionContext = {
  sourceTypes: ["Projects 行动看板", "知识库统计"],
  statistics: { inbox: 1, domain: 2, projects: 3, wiki: 4 },
  projects: "下一步行动"
};

const validActionsJson = JSON.stringify({
  actions: [{
    priority: "P0",
    title: "完成行动",
    reason: "服务目标",
    sources: ["Projects 行动看板"],
    estimate: "30 分钟",
    acceptance: "结果可验证",
    mode: "execution",
    aiHelp: "检查结果"
  }]
});

const completion = (content: string): unknown => ({
  choices: [{ message: { content } }]
});

class QueueTransport implements DeepSeekTransport {
  readonly calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];

  constructor(private readonly responses: TransportResponse[]) {}

  async post(input: { url: string; headers: Record<string, string>; body: unknown }): Promise<TransportResponse> {
    this.calls.push(input);
    const response = this.responses.shift();
    if (!response) {
      throw new Error("No queued response");
    }
    return response;
  }
}

describe("DeepSeekClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails with a readable error when the request times out", async () => {
    vi.useFakeTimers();
    const transport: DeepSeekTransport = {
      post: () => new Promise<TransportResponse>(() => undefined)
    };
    const client = new DeepSeekClient(transport, 1_000);

    const request = client.generateActions({
      apiKey: "test-secret",
      model: "deepseek-v4-flash",
      context
    });
    const assertion = expect(request).rejects.toThrow("超时");

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("tests the connection without sending knowledge context", async () => {
    const transport = new QueueTransport([{
      status: 200,
      json: completion('{"ok":true}')
    }]);
    const client = new DeepSeekClient(transport);

    await expect(client.testConnection({
      apiKey: "test-secret",
      model: "deepseek-v4-flash"
    })).resolves.toBeUndefined();

    const body = transport.calls[0].body as { messages: Array<{ content: string }> };
    expect(JSON.stringify(body)).not.toContain("Projects");
    expect(JSON.stringify(body)).not.toContain("用户画像");
  });

  it("sends an authenticated JSON Output request", async () => {
    const transport = new QueueTransport([{ status: 200, json: completion(validActionsJson) }]);
    const client = new DeepSeekClient(transport);

    const actions = await client.generateActions({
      apiKey: "test-secret",
      model: "deepseek-v4-flash",
      context
    });

    expect(actions).toHaveLength(1);
    expect(transport.calls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(transport.calls[0].headers.Authorization).toBe("Bearer test-secret");
    expect(transport.calls[0].body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      stream: false,
      max_tokens: 1600
    });
  });

  it("retries one empty response and returns validated actions", async () => {
    const transport = new QueueTransport([
      { status: 200, json: completion("") },
      { status: 200, json: completion(validActionsJson) }
    ]);
    const client = new DeepSeekClient(transport);

    const actions = await client.generateActions({
      apiKey: "test-secret",
      model: "deepseek-v4-flash",
      context
    });

    expect(actions).toHaveLength(1);
    expect(transport.calls).toHaveLength(2);
  });

  it.each([
    [401, "API Key"],
    [402, "余额"],
    [429, "限流"],
    [503, "服务"]
  ])("maps status %s to a readable error", async (status, text) => {
    const client = new DeepSeekClient(new QueueTransport([{ status, json: {} }]));
    await expect(client.generateActions({
      apiKey: "test-secret",
      model: "deepseek-v4-flash",
      context
    })).rejects.toThrow(text);
  });

  it("does not include the API key in errors", async () => {
    const client = new DeepSeekClient(new QueueTransport([{ status: 401, json: {} }]));
    await expect(client.generateActions({
      apiKey: "super-private-key",
      model: "deepseek-v4-flash",
      context
    })).rejects.not.toThrow("super-private-key");
  });
});
