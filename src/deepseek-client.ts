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

function extractContent(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "";
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() : "";
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("DeepSeek 返回的 JSON 无法解析，请重试。");
  }
}

export class DeepSeekClient {
  constructor(private readonly transport: DeepSeekTransport) {}

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
        max_tokens: 1600
      }
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: TransportResponse;
      try {
        response = await this.transport.post(input);
      } catch (error) {
        const message = error instanceof Error ? error.message.split(apiKey).join("[redacted]") : "网络请求失败";
        throw new Error(`DeepSeek 网络请求失败：${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw errorForStatus(response.status);
      }
      const content = extractContent(response.json);
      if (content) {
        return parseActionAdvice(parseJson(content), request.context.sourceTypes);
      }
    }
    throw new Error("DeepSeek 连续返回空内容，请稍后重试。");
  }
}
