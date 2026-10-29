const { miniAppUrl: buildMiniAppUrl } = require('../telegram/ownerNavigation');
function createSystemSkill({ policy, conversationStore, redisClient, miniAppUrl = "", videoWorkspaceEnabled = false } = {}) {
  const commandOf = event => String(event?.text || '').trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  function canHandle(event) {
    const command = commandOf(event);
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
    const command = commandOf(event);

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

    const replyMarkup = miniAppReplyMarkup();
    const videoUrl = videoWorkspaceEnabled && buildMiniAppUrl(miniAppUrl, { video: true });
    if (replyMarkup && videoUrl) replyMarkup.inline_keyboard.push([{ text: 'Видеочерновики и правки', web_app: { url: videoUrl } }]);
    return {
      text: [
        "Astel Assistant готов.",
        `Обычный чат → ${policy.openaiChatModel} (экономный режим).`,
        "",
        "/think <задача> — усиленный AI",
        "/research <запрос> — свежий веб-ресерч",
        "/leads <что искать> — публичные B2B лиды",
        "/crew <задача> — запустить всю AI-команду",
        ...(videoWorkspaceEnabled ? ['/video — видеочерновики и правки', '/canvas — очередь Canvas', '/distribution — статусы доставки'] : []),
        "/status — статус",
        "/reset — очистить память диалога",
        "/help — помощь",
      ].join("\n"),
      replyMarkup,
      rememberAssistant: false,
    };
  }

  return { id: "system", canHandle, handle };
}

module.exports = { createSystemSkill };
