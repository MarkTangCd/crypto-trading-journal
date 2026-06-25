import {
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  ProviderError,
} from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const REQUEST_TIMEOUT_MS = 60_000;

interface DeepseekChoice {
  message?: { role?: string; content?: string };
}
interface DeepseekResponse {
  choices?: DeepseekChoice[];
}

function toOpenAIMessages(messages: ChatMessage[]) {
  return messages.map(message => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.name,
      };
    }
    return { role: message.role, content: message.content };
  });
}

export const deepseekProvider: ChatProvider = {
  id: "deepseek",
  defaultModel: DEFAULT_MODEL,

  async chat(req, { apiKey, baseUrl }) {
    if (!apiKey) {
      throw new ProviderError(
        "AUTH",
        "未配置 deepseek api key。请到 Settings 填写。"
      );
    }

    const url = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: req.model || DEFAULT_MODEL,
      messages: toOpenAIMessages(req.messages),
      stream: false,
    };
    if (typeof req.temperature === "number") {
      body.temperature = req.temperature;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(
        "NETWORK",
        "无法连接 deepseek。请检查网络或代理配置。",
        error
      );
    }

    if (!response.ok) {
      // Drain the body so the socket can close cleanly, then map to a typed
      // ProviderError — never surface the upstream payload to the caller.
      const upstreamText = await response.text().catch(() => "");
      const mapped = mapHttpStatus(response.status, upstreamText);
      throw mapped;
    }

    let parsed: DeepseekResponse;
    try {
      parsed = (await response.json()) as DeepseekResponse;
    } catch (error) {
      throw new ProviderError(
        "INVALID_RESPONSE",
        "deepseek 返回的响应不是合法的 JSON。",
        error
      );
    }

    const choice = parsed.choices?.[0]?.message;
    if (!choice || typeof choice.content !== "string") {
      throw new ProviderError(
        "INVALID_RESPONSE",
        "deepseek 返回为空，请稍后重试。"
      );
    }

    return {
      role: "assistant",
      content: choice.content,
    };
  },
};

function mapHttpStatus(status: number, upstreamText: string): ProviderError {
  // Don't echo upstream payload to the UI — keep it for server logs only.
  console.warn(
    `[ReviewAgent] deepseek upstream ${status}: ${upstreamText.slice(0, 200)}`
  );

  if (status === 401 || status === 403) {
    return new ProviderError(
      "AUTH",
      "deepseek api key 无效，请到 Settings 重新填写。"
    );
  }
  if (status === 429) {
    return new ProviderError("RATE_LIMIT", "deepseek 接口限流，请稍后再试。");
  }
  return new ProviderError(
    "UPSTREAM",
    `deepseek 接口异常（状态码 ${status}）。`
  );
}
