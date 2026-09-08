class AIProviderError extends Error {
  constructor(message, { code = "AI_PROVIDER_ERROR", status = null } = {}) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.status = status;
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractResponseSources(data) {
  const urls = [];
  const add = value => {
    if (typeof value === "string" && /^https?:\/\//i.test(value) && !urls.includes(value)) urls.push(value);
  };

  for (const item of data?.output || []) {
    for (const source of item?.action?.sources || []) add(source?.url || source);
    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        add(annotation?.url);
        add(annotation?.url_citation?.url);
      }
    }
  }
  return urls;
}

function createOpenAIProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = "gpt-5.6-terra",
  reasoningEffort = "medium",
  timeoutMs = 45000,
  maxOutputTokens = 1600,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function generate({
    instructions,
    input,
    tools = null,
    include = null,
    maxToolCalls = null,
    model: requestModel = null,
    reasoningEffort: requestReasoningEffort = null,
    maxOutputTokens: requestMaxOutputTokens = null,
  }) {
    if (!apiKey) throw new AIProviderError("OPENAI_API_KEY missing", { code: "AI_NOT_CONFIGURED" });

    const resolvedModel = requestModel || model;
    const resolvedReasoningEffort = requestReasoningEffort || reasoningEffort;
    const resolvedMaxOutputTokens = Number.isInteger(requestMaxOutputTokens) && requestMaxOutputTokens > 0
      ? requestMaxOutputTokens
      : maxOutputTokens;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      const body = {
        model: resolvedModel,
        instructions,
        input,
        reasoning: { effort: resolvedReasoningEffort },
        max_output_tokens: resolvedMaxOutputTokens,
      };
      if (Array.isArray(tools) && tools.length) body.tools = tools;
      if (Array.isArray(include) && include.length) body.include = include;
      if (Number.isInteger(maxToolCalls) && maxToolCalls > 0) body.max_tool_calls = maxToolCalls;

      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw new AIProviderError("OpenAI request timed out", { code: "AI_TIMEOUT" });
      throw new AIProviderError(err?.message || "OpenAI network error", { code: "AI_NETWORK_ERROR" });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AIProviderError(data?.error?.message || `OpenAI request failed (${response.status})`, {
        code: "AI_HTTP_ERROR",
        status: response.status,
      });
    }

    const text = extractResponseText(data);
    if (!text) throw new AIProviderError("OpenAI returned no text", { code: "AI_EMPTY_RESPONSE" });

    return {
      text,
      sources: extractResponseSources(data),
      model: data?.model || resolvedModel,
      responseId: data?.id || null,
      usage: data?.usage || null,
    };
  }

  return { generate };
}

module.exports = { createOpenAIProvider, AIProviderError, extractResponseText, extractResponseSources };
