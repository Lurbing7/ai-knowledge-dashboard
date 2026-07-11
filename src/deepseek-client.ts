import { ACTION_ADVISOR_SYSTEM_PROMPT, parseActionAdvice } from "./action-advisor";
import type { ActionAdvice, ActionContext } from "./types";

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";

export interface TransportResponse {
  status: number;
  json: unknown;
}

export interface DeepSeekTransport {
  post(input: {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<TransportResponse>;
}

export interface GenerateActionsRequest {
  apiKey: string;
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  thinkingEnabled: boolean;
  reasoningEffort: "high" | "max";
  context: ActionContext;
}

function errorForStatus(status: number): Error {
  switch (status) {
    case 400:
    case 422:
      return new Error("DeepSeek 请求格式无效，请检查插件版本和模型设置。");
    case 401:
      return new Error("DeepSeek API Key 无效，请在设置中重新选择密钥。");
    case 402:
      return new Error("DeepSeek 账户余额不足，请充值后重试。");
    case 429:
      return new Error("DeepSeek 请求被限流，请稍后重试。");
    default:
      return status >= 500
        ? new Error("DeepSeek 服务暂时不可用，请稍后重试。")
        : new Error(`DeepSeek 请求失败（HTTP ${status}）。`);
  }
}

interface CompletionContent {
  content: string;
  finishReason: string;
}

function extractCompletion(value: unknown): CompletionContent {
  if (!value || typeof value !== "object") {
    return { content: "", finishReason: "" };
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { content: "", finishReason: "" };
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return { content: "", finishReason: "" };
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return { content: "", finishReason: "" };
  }
  const content = (message as { content?: unknown }).content;
  const finishReason = (first as { finish_reason?: unknown }).finish_reason;
  return {
    content: typeof content === "string" ? content.trim() : "",
    finishReason: typeof finishReason === "string" ? finishReason : ""
  };
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // Use the same safe error below without exposing model content.
      }
    }
    throw new Error("DeepSeek 返回的 JSON 无法解析，请重试。");
  }
}

function generationOptions(request: GenerateActionsRequest): Record<string, unknown> {
  if (!request.thinkingEnabled) {
    return { thinking: { type: "disabled" }, max_tokens: 3200 };
  }
  return {
    thinking: { type: "enabled" },
    reasoning_effort: request.reasoningEffort,
    max_tokens: request.reasoningEffort === "max" ? 8000 : 4800
  };
}

export class DeepSeekClient {
  constructor(
    private readonly transport: DeepSeekTransport,
    private readonly timeoutMs = 60_000
  ) {}

  private post(input: Parameters<DeepSeekTransport["post"]>[0]): Promise<TransportResponse> {
    return new Promise<TransportResponse>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("请求超时，请检查网络后重试。")),
        this.timeoutMs
      );
      this.transport.post(input).then(
        response => {
          clearTimeout(timeout);
          resolve(response);
        },
        error => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }

  async testConnection(request: {
    apiKey: string;
    model: "deepseek-v4-flash" | "deepseek-v4-pro";
  }): Promise<void> {
    const apiKey = request.apiKey.trim();
    if (!apiKey) {
      throw new Error("请先在设置中配置 DeepSeek API Key。");
    }
    let response: TransportResponse;
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
            content: "请只返回 JSON：{\"ok\":true}。这是连接测试，不包含任何知识库上下文。"
          }],
          response_format: { type: "json_object" },
          stream: false,
          max_tokens: 32
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.split(apiKey).join("[redacted]") : "网络请求失败";
      throw new Error(`DeepSeek 网络请求失败：${message}`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status);
    }
    const result = parseJson(extractCompletion(response.json).content);
    if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
      throw new Error("DeepSeek 连接测试返回了无效结果。");
    }
  }

  async generateActions(request: GenerateActionsRequest): Promise<ActionAdvice[]> {
    const apiKey = request.apiKey.trim();
    if (!apiKey) {
      throw new Error("请先在设置中配置 DeepSeek API Key。");
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
      let response: TransportResponse;
      try {
        response = await this.post(input);
      } catch (error) {
        const message = error instanceof Error ? error.message.split(apiKey).join("[redacted]") : "网络请求失败";
        throw new Error(`DeepSeek 网络请求失败：${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw errorForStatus(response.status);
      }
      const completion = extractCompletion(response.json);
      if (completion.finishReason === "length") {
        throw new Error("DeepSeek 输出被截断，请降低推理强度或重试。");
      }
      const content = completion.content;
      if (content) {
        return parseActionAdvice(parseJson(content), request.context.sourceTypes);
      }
    }
    throw new Error("DeepSeek 连续返回空内容，请稍后重试。");
  }
}
