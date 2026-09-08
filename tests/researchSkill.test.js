const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchSkill } = require("../skills/researchSkill");
const { createFakeLogger } = require("./helpers/fakeLogger");

test("researchSkill: /leads invokes hosted web search with a hard tool-call cap", async () => {
  let call;
  const provider = {
    generate: async args => {
      call = args;
      return { text: "lead result", sources: ["https://example.com/source"], model: "fake", responseId: "r1" };
    },
  };
  const appended = [];
  const skill = createResearchSkill({
    provider,
    conversationStore: { append: async (_event, message) => appended.push(message) },
    logger: createFakeLogger(),
  });
  const event = { traceId: "t", conversationId: "c", messageId: "m", userId: "u", text: "/leads carbon parts buyers" };
  assert.equal(skill.canHandle(event), true);
  const result = await skill.handle(event);
  assert.equal(call.tools[0].type, "web_search_preview");
  assert.equal(call.maxToolCalls, 3);
  assert.match(result.text, /https:\/\/example.com\/source/);
  assert.equal(result.rememberAssistant, true);
  assert.equal(appended[0].role, "user");
});

test("researchSkill: empty query returns usage without calling provider", async () => {
  let called = false;
  const skill = createResearchSkill({
    provider: { generate: async () => { called = true; } },
    conversationStore: { append: async () => {} },
    logger: createFakeLogger(),
  });
  const result = await skill.handle({ text: "/research" });
  assert.equal(called, false);
  assert.equal(result.rememberAssistant, false);
  assert.match(result.text, /\/research/);
});
