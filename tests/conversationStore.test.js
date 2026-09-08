const test = require("node:test");
const assert = require("node:assert/strict");
const { createConversationStore } = require("../memory/conversationStore");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");

function event(overrides = {}) {
  return { conversationId: "100", userId: "7", threadId: null, ...overrides };
}

test("conversationStore: appends and reads ordered history", async () => {
  const redis = createFakeRedisClient();
  const store = createConversationStore({ redisClient: redis, maxMessages: 10, maxTokens: 1000 });
  await store.append(event(), { role: "user", text: "hello", messageId: "1" });
  await store.append(event(), { role: "assistant", text: "hi", messageId: "2" });
  const history = await store.read(event());
  assert.deepEqual(history.map(x => [x.role, x.text]), [["user", "hello"], ["assistant", "hi"]]);
});

test("conversationStore: trims old messages", async () => {
  const redis = createFakeRedisClient();
  const store = createConversationStore({ redisClient: redis, maxMessages: 2, maxTokens: 1000 });
  await store.append(event(), { role: "user", text: "one" });
  await store.append(event(), { role: "assistant", text: "two" });
  await store.append(event(), { role: "user", text: "three" });
  const history = await store.read(event());
  assert.deepEqual(history.map(x => x.text), ["two", "three"]);
});

test("conversationStore: thread scopes are independent", async () => {
  const redis = createFakeRedisClient();
  const store = createConversationStore({ redisClient: redis });
  await store.append(event({ threadId: "10" }), { role: "user", text: "thread-a" });
  await store.append(event({ threadId: "11" }), { role: "user", text: "thread-b" });
  assert.equal((await store.read(event({ threadId: "10" })))[0].text, "thread-a");
  assert.equal((await store.read(event({ threadId: "11" })))[0].text, "thread-b");
});

test("conversationStore: clear removes current conversation scope", async () => {
  const redis = createFakeRedisClient();
  const store = createConversationStore({ redisClient: redis });
  await store.append(event(), { role: "user", text: "hello" });
  await store.clear(event());
  assert.deepEqual(await store.read(event()), []);
});
