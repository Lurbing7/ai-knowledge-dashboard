import { requestUrl } from "obsidian";
import type { DeepSeekTransport, TransportResponse } from "./deepseek-client";

export class ObsidianDeepSeekTransport implements DeepSeekTransport {
  async post(input: {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }): Promise<TransportResponse> {
    const response = await requestUrl({
      url: input.url,
      method: "POST",
      contentType: "application/json",
      headers: input.headers,
      body: JSON.stringify(input.body),
      throw: false
    });
    return { status: response.status, json: response.json };
  }
}
