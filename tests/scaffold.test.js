const test = require("node:test");
const assert = require("node:assert/strict");
const { createTelegramAdapter } = require("../adapters/telegramAdapter");
const { buildConversationKey, classifyTelegramMessage } = require("../router/telegramRouter");
const { trimMemory } = require("../memory/reconstructChatMemory");

test("normalizes Telegram message update", () => {
  const adapter = createTelegramAdapter({ token: "test-token" });
  const msg = adapter.normalizeUpdate({ update_id: 1, message: { message_id: 10, from: { id: 7, username: "leo" }, reply_to_message: { message_id: 9, from: { id: 9006, username: "astel_yuki_bot" } }, chat: { id: -100, type: "supergroup" }, text: "Hello" } });
  assert.equal(msg.platform, "telegram");
  assert.equal(msg.messageId, "10");
  assert.equal(msg.userId, "7");
  assert.equal(msg.chatId, "-100");
  assert.equal(msg.parentUserId, "9006");
  assert.equal(msg.parentUsername, "astel_yuki_bot");
});

test("conversation key isolates chat, thread, and user", () => {
  assert.equal(buildConversationKey({ chatId: "1", threadId: "22", userId: "7" }), "chat:1|thread:22|user:7");
});

test("router skips bot self messages", () => {
  const route = classifyTelegramMessage({ chatId: "1", messageId: "2", userId: "99", text: "hi" }, { botUserId: "99" });
  assert.equal(route.reason, "SELF_MESSAGE");
});

test("memory keeps newest messages within bound", () => {
  const out = trimMemory([{ text: "one", role: "user" }, { text: "two", role: "assistant" }, { text: "three", role: "user" }], { maxMessages: 2, maxTokens: 100 });
  assert.deepEqual(out.messages.map(x => x.text), ["two", "three"]);
});
