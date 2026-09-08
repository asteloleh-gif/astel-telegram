const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantPipeline } = require("../assistantPipeline");
const { createFakeLogger } = require("./helpers/fakeLogger");

function event() {
  return { traceId: "t", conversationId: "c", messageId: "m", userId: "u", text: "hello" };
}

test("assistantPipeline: commits assistant memory only after confirmed publish", async () => {
  const calls = [];
  const pipeline = createAssistantPipeline({
    skillRegistry: { resolve: () => ({ id: "chat", handle: async () => ({ text: "answer", rememberAssistant: true }) }) },
    publisher: { publish: async () => ({ published: true, reasonCode: "PUBLISHED", result: { message_id: 9 } }) },
    conversationStore: { append: async (_event, msg) => calls.push(msg) },
    logger: createFakeLogger(),
  });
  const result = await pipeline.run(event());
  assert.equal(result.action, "PUBLISHED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role, "assistant");
});

test("assistantPipeline: failed publish does not commit assistant memory", async () => {
  const calls = [];
  const pipeline = createAssistantPipeline({
    skillRegistry: { resolve: () => ({ id: "chat", handle: async () => ({ text: "answer", rememberAssistant: true }) }) },
    publisher: { publish: async () => ({ published: false, reasonCode: "PUBLISH_FAILED" }) },
    conversationStore: { append: async (_event, msg) => calls.push(msg) },
    logger: createFakeLogger(),
  });
  const result = await pipeline.run(event());
  assert.equal(result.action, "STOP");
  assert.equal(calls.length, 0);
});
