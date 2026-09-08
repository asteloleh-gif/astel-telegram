const test = require("node:test");
const assert = require("node:assert/strict");
const { createAIChatSkill } = require("../skills/aiChatSkill");
const { createFakeLogger } = require("./helpers/fakeLogger");

function makePolicy() {
  return {
    openaiChatModel: "gpt-5.6-luna",
    openaiPowerModel: "gpt-5.6-terra",
    openaiChatReasoningEffort: "low",
    openaiPowerReasoningEffort: "medium",
    aiChatMaxOutputTokens: 700,
    aiPowerMaxOutputTokens: 1600,
  };
}

function makeStore() {
  return {
    read: async () => [],
    append: async () => {},
  };
}

test("aiChatSkill: normal chat uses Luna cost tier", async () => {
  let call;
  const skill = createAIChatSkill({
    aiEngine: {
      generate: async args => {
        call = args;
        return { text: "ok", model: args.model, usage: null, responseId: "r1" };
      },
    },
    conversationStore: makeStore(),
    logger: createFakeLogger(),
    policy: makePolicy(),
  });

  const result = await skill.handle({ traceId: "t", conversationId: "c", messageId: "m", userId: "u", text: "привет" });
  assert.equal(call.model, "gpt-5.6-luna");
  assert.equal(call.reasoningEffort, "low");
  assert.equal(call.maxOutputTokens, 700);
  assert.equal(result.text, "ok");
});

test("aiChatSkill: /think uses Terra power tier and strips command", async () => {
  let call;
  const skill = createAIChatSkill({
    aiEngine: {
      generate: async args => {
        call = args;
        return { text: "deep", model: args.model, usage: null, responseId: "r2" };
      },
    },
    conversationStore: makeStore(),
    logger: createFakeLogger(),
    policy: makePolicy(),
  });

  const result = await skill.handle({ traceId: "t", conversationId: "c", messageId: "m", userId: "u", text: "/think спроектируй архитектуру" });
  assert.equal(call.model, "gpt-5.6-terra");
  assert.equal(call.reasoningEffort, "medium");
  assert.equal(call.maxOutputTokens, 1600);
  assert.equal(call.text, "спроектируй архитектуру");
  assert.equal(result.text, "deep");
});

test("aiChatSkill: bare /think returns usage without AI call", async () => {
  let called = false;
  const skill = createAIChatSkill({
    aiEngine: { generate: async () => { called = true; } },
    conversationStore: makeStore(),
    logger: createFakeLogger(),
    policy: makePolicy(),
  });

  const result = await skill.handle({ text: "/think" });
  assert.equal(called, false);
  assert.equal(result.rememberAssistant, false);
  assert.match(result.text, /\/think/);
});
