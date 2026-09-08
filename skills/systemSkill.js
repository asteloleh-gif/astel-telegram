function createSystemSkill({ policy, conversationStore, redisClient } = {}) {
  function canHandle(event) {
    const command = String(event?.text || "").trim().split(/\s+/)[0].toLowerCase();
    return ["/start", "/help", "/status", "/reset"].includes(command);
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
          `AI: ${policy.openaiModel}`,
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
        "Пиши обычным сообщением — отвечу через AI.",
        "",
        "/research <запрос> — свежий веб-ресерч",
        "/leads <что искать> — публичные B2B лиды",
        "/status — статус",
        "/reset — очистить память диалога",
        "/help — помощь",
      ].join("\n"),
      rememberAssistant: false,
    };
  }

  return { id: "system", canHandle, handle };
}

module.exports = { createSystemSkill };
