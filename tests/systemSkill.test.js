const test = require("node:test");
const assert = require("node:assert/strict");
const { createSystemSkill } = require("../skills/systemSkill");

const policy = {
  openaiChatModel: "gpt-chat",
  openaiChatReasoningEffort: "low",
  openaiPowerModel: "gpt-power",
  openaiPowerReasoningEffort: "medium",
  botDryRun: false,
  botEnabled: true,
};

function createSkill(miniAppUrl) {
  return createSystemSkill({
    policy,
    miniAppUrl,
    conversationStore: {
      read: async () => [],
      clear: async () => {},
    },
    redisClient: {
      health: () => ({ connected: true }),
    },
  });
}

test("systemSkill: /start includes Telegram Mini App button", async () => {
  const skill = createSkill("https://astel.example/");
  const result = await skill.handle({ text: "/start" });
  assert.equal(result.replyMarkup.inline_keyboard[0][0].text, "🚀 Открыть Astel App");
  assert.deepEqual(result.replyMarkup.inline_keyboard[0][0].web_app, {
    url: "https://astel.example",
  });
});

test("systemSkill: omits Mini App button when URL is missing", async () => {
  const skill = createSkill("");
  const result = await skill.handle({ text: "/help" });
  assert.equal(result.replyMarkup, null);
});
