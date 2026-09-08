function createSystemSkill({ policy, conversationStore, redisClient, miniAppUrl = "" } = {}) {
  function canHandle(event) {
    const command = String(event?.text || "").trim().split(/\s+/)[0].toLowerCase();
    return ["/start", "/help", "/status", "/reset"].includes(command);
  }

  function miniAppReplyMarkup() {
    const url = String(miniAppUrl || "").trim().replace(/\/+$/, "");
    if (!url) return null;
    return {
      inline_keyboard: [[
        {
          text: "🚀 Открыть Astel App",
          web_app: { url },
        },
      ]],
    };
  }

  async function handle(event) {
    const command = String(event.text || "").trim().split(/\s+/)[0].toLowerCase();

    if (command === "/reset") {
      await conversationStore.clear(event);
      return { text: "Память текущего диалога очищена.", rememberAssistant: false };
    }

    if (command === "/status") {
      const memory = await conversationStore.read(event);
      const redisStatus = redisClient.health?.().connected ? "up" : "down";
      return {
        text: [
          "Astel Assistant ✅",
          `Chat AI: ${policy.openaiChatModel} (${policy.openaiChatReasoningEffort})`,
          `Power AI: ${policy.openaiPowerModel} (${policy.openaiPowerReasoningEffort})`,
          `Redis: ${redisStatus}`,
          `Memory: ${memory.length} messages`,
          `Mode: ${policy.botDryRun ? "DRY_RUN" : (policy.botEnabled ? "LIVE" : "DISABLED")}`,
        ].join("\n"),
        rememberAssistant: false,
      };
    }

    return {
      text: [
        "Astel Assistant готов.",
        `Обычный чат → ${policy.openaiChatModel} (экономный режим).`,
        "",
        "/think <задача> — усиленный AI",
        "/research <запрос> — свежий веб-ресерч",
        "/leads <что искать> — публичные B2B лиды",
        "/status — статус",
        "/reset — очистить память диалога",
        "/help — помощь",
      ].join("\n"),
      replyMarkup: miniAppReplyMarkup(),
      rememberAssistant: false,
    };
  }

  return { id: "system", canHandle, handle };
}

module.exports = { createSystemSkill };
