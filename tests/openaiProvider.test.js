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

test("openaiProvider: missing key fails before network", async () => {
  const provider = createOpenAIProvider({ apiKey: "", fetchImpl: async () => { throw new Error("should not call"); } });
  await assert.rejects(() => provider.generate({ instructions: "x", input: "y" }), err => err.code === "AI_NOT_CONFIGURED");
});
