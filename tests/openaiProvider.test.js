const test = require("node:test");
const assert = require("node:assert/strict");
const { createOpenAIProvider, extractResponseText } = require("../ai/openaiProvider");

test("openaiProvider: extracts output_text from raw Responses API output", () => {
  const text = extractResponseText({ output: [{ content: [{ type: "output_text", text: "hello" }] }] });
  assert.equal(text, "hello");
});

test("openaiProvider: calls Responses API with configured model", async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "resp_1", model: "gpt-test", output: [{ content: [{ type: "output_text", text: "done" }] }] }),
    };
  };
  const provider = createOpenAIProvider({ apiKey: "test", model: "gpt-test", fetchImpl: fakeFetch });
  const result = await provider.generate({ instructions: "system", input: "hello" });
  assert.equal(result.text, "done");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "gpt-test");
  assert.equal(body.input, "hello");
});

test("openaiProvider: per-request model, reasoning and output budget override defaults", async () => {
  let body;
  const provider = createOpenAIProvider({
    apiKey: "test",
    model: "gpt-default",
    reasoningEffort: "medium",
    maxOutputTokens: 1600,
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "resp_2", model: body.model, output: [{ content: [{ type: "output_text", text: "ok" }] }] }),
      };
    },
  });

  const result = await provider.generate({
    instructions: "system",
    input: "hello",
    model: "gpt-cheap",
    reasoningEffort: "low",
    maxOutputTokens: 700,
  });

  assert.equal(body.model, "gpt-cheap");
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.max_output_tokens, 700);
  assert.equal(result.model, "gpt-cheap");
});

test("openaiProvider: missing key fails before network", async () => {
  const provider = createOpenAIProvider({ apiKey: "", fetchImpl: async () => { throw new Error("should not call"); } });
  await assert.rejects(() => provider.generate({ instructions: "x", input: "y" }), err => err.code === "AI_NOT_CONFIGURED");
});
