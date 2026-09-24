const { createTelegramAdapter } = require("../adapters/telegramAdapter");

const CREW_MANAGED_AGENTS = Object.freeze([
  Object.freeze({ id: "researcher", name: "Tommy the Googler", title: "Researcher", username: "astel_tommy_bot", requestId: 2101, emoji: "🕵️" }),
  Object.freeze({ id: "strategist", name: "George Big Brain", title: "Strategist", username: "astel_george_bot", requestId: 2102, emoji: "🧠" }),
  Object.freeze({ id: "copywriter", name: "Sergio Contentmaker", title: "Writer", username: "astel_sergio_bot", requestId: 2103, emoji: "✍️" }),
  Object.freeze({ id: "reviewer", name: "Hans QA", title: "Reviewer", username: "astel_hans_bot", requestId: 2104, emoji: "👷" }),
  Object.freeze({ id: "distribution-manager", name: "Luca Everywhere", title: "Distribution Manager", username: "astel_luca_bot", requestId: 2105, emoji: "🌍" }),
  Object.freeze({ id: "visual", name: "Yuki Pixel", title: "Visual", username: "astel_yuki_bot", requestId: 2106, emoji: "🎨" }),
  Object.freeze({ id: "analytics", name: "Edie Dataman", title: "Analytics", username: "astel_edie_bot", requestId: 2107, emoji: "📊" }),
  Object.freeze({ id: "router-parser", name: "Vasya Free Tier Hustler", title: "Router / Parser", username: "astel_vasya_bot", requestId: 2108, emoji: "🧩" }),
]);

function normalizeUsername(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function createManagedCrewManager({
  managerToken = process.env.TELEGRAM_BOT_TOKEN,
  ownerUserId = process.env.TELEGRAM_OWNER_ID,
  groupChatId = process.env.HYPER_CREW_TELEGRAM_CHAT_ID,
  store,
  redisClient,
  telegramAdapter,
  logger = console,
  fetchImpl = globalThis.fetch,
  namespace = process.env.REDIS_NAMESPACE || "astel:tg:v1",
  managerUsername = process.env.TELEGRAM_MANAGER_USERNAME || "astelcore_bot",
} = {}) {
  if (!store) throw new Error("Managed Crew Manager requires store");
  if (!redisClient) throw new Error("Managed Crew Manager requires redisClient");
  if (!telegramAdapter) throw new Error("Managed Crew Manager requires telegramAdapter");

  const pendingKey = `${namespace}:managed-crew:pending:${ownerUserId || "owner"}`;
  const autoPromptKey = `${namespace}:managed-crew:auto-prompt:v1`;
  const tokenCache = new Map();

  async function managerApi(method, body = {}) {
    if (!managerToken) throw new Error("TELEGRAM_BOT_TOKEN missing");
    const response = await fetchImpl(`https://api.telegram.org/bot${managerToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.description || `Telegram ${method} failed (${response.status})`);
    }
    return payload.result;
  }

  async function botApi(token, method, body = {}) {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.description || `Telegram managed bot ${method} failed (${response.status})`);
    }
    return payload.result;
  }

  async function getManagedToken(botUserId, { refresh = false } = {}) {
    const key = String(botUserId);
    if (!refresh && tokenCache.has(key)) return tokenCache.get(key);
    const token = await managerApi("getManagedBotToken", { user_id: Number(botUserId) });
    if (!token) throw new Error("MANAGED_BOT_TOKEN_EMPTY");
    tokenCache.set(key, token);
    return token;
  }

  async function configureManagedBot(record, agent) {
    const token = await getManagedToken(record.botUserId, { refresh: true });
    const description = `${agent.name} — ${agent.title} in Astel Hyper Crew. Managed by Kevin CEO / @astelcore_bot.`;
    const shortDescription = `${agent.title} · Astel Hyper Crew`;
    await botApi(token, "setMyName", { name: agent.name }).catch(error => logger?.warn?.({ reasonCode: "MANAGED_BOT_SET_NAME_FAILED", extra: { agentId: agent.id, error: error.message } }));
    await botApi(token, "setMyDescription", { description }).catch(error => logger?.warn?.({ reasonCode: "MANAGED_BOT_SET_DESCRIPTION_FAILED", extra: { agentId: agent.id, error: error.message } }));
    await botApi(token, "setMyShortDescription", { short_description: shortDescription }).catch(error => logger?.warn?.({ reasonCode: "MANAGED_BOT_SET_SHORT_DESCRIPTION_FAILED", extra: { agentId: agent.id, error: error.message } }));
    await botApi(token, "setMyCommands", {
      commands: [
        { command: "role", description: "Show this agent's role" },
        { command: "crew", description: "Open the Astel Crew workflow" },
      ],
    }).catch(error => logger?.warn?.({ reasonCode: "MANAGED_BOT_SET_COMMANDS_FAILED", extra: { agentId: agent.id, error: error.message } }));
    return record;
  }

  async function listStatus() {
    const records = await store.list();
    const byAgent = new Map(records.map(record => [record.agentId, record]));
    return CREW_MANAGED_AGENTS.map(agent => ({
      ...agent,
      bot: byAgent.get(agent.id) || null,
      ready: Boolean(byAgent.get(agent.id)),
    }));
  }

  async function nextMissing() {
    const status = await listStatus();
    return status.find(item => !item.ready) || null;
  }

  async function promptForAgent(chatId, agent) {
    await redisClient.set(pendingKey, agent.id, { EX: 3600 });
    return telegramAdapter.sendMessage({
      chatId,
      text: [
        `${agent.emoji} Создаём ${agent.name} — ${agent.title}.`,
        "",
        "Нажми большую кнопку Create ниже. Это нативный Telegram managed-bot request — без deep link.",
      ].join("\n"),
      replyMarkup: {
        keyboard: [[{
          text: `Create ${agent.name}`,
          request_managed_bot: {
            request_id: agent.requestId,
            suggested_name: agent.name,
            suggested_username: agent.username,
          },
        }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  async function sendSetupStatus(chatId) {
    const status = await listStatus();
    const lines = [
      "👔 Hyper Crew identities",
      "",
      "Kevin CEO — @astelcore_bot ✅",
      ...status.map(item => `${item.emoji} ${item.name} — ${item.bot?.username ? `@${item.bot.username} ✅` : "not created"}`),
    ];
    await telegramAdapter.sendMessage({ chatId, text: lines.join("\n") });
    const missing = status.find(item => !item.ready);
    if (missing) return promptForAgent(chatId, missing);
    await redisClient.del(pendingKey).catch(() => {});
    return telegramAdapter.sendMessage({
      chatId,
      text: [
        "✅ Все managed bots созданы.",
        "",
        "Добавь их в группу Hyper Crew по ссылкам ниже. После этого центральный router будет отвечать от имени нужного агента.",
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: status
          .filter(item => item.bot?.username)
          .map(item => [{ text: `${item.emoji} Add ${item.name}`, url: `https://t.me/${item.bot.username}?startgroup=true` }]),
      },
    });
  }

  function canHandleSetupCommand(event) {
    const text = String(event?.text || "").trim();
    return Boolean(event?.isOwner && event?.chatType === "private" && /^\/crewsetup(?:@\w+)?(?:\s|$)/i.test(text));
  }

  async function handleSetupCommand(event) {
    return sendSetupStatus(event.conversationId);
  }

  function extractManagedBot(update) {
    const fromManagedUpdate = update?.managed_bot;
    if (fromManagedUpdate?.bot?.id) {
      return {
        bot: fromManagedUpdate.bot,
        ownerId: fromManagedUpdate.user?.id || null,
      };
    }
    const created = update?.message?.managed_bot_created;
    if (created?.bot?.id) {
      return {
        bot: created.bot,
        ownerId: update?.message?.from?.id || null,
      };
    }
    return null;
  }

  function inferAgent(bot) {
    const username = normalizeUsername(bot?.username);
    if (!username) return null;
    return CREW_MANAGED_AGENTS.find(agent => normalizeUsername(agent.username) === username) || null;
  }

  async function handleRawUpdate(update) {
    const extracted = extractManagedBot(update);
    if (!extracted) return false;
    if (ownerUserId && extracted.ownerId && String(extracted.ownerId) !== String(ownerUserId)) {
      logger?.warn?.({ reasonCode: "MANAGED_BOT_OWNER_MISMATCH", extra: { ownerId: extracted.ownerId, botId: extracted.bot.id } });
      return true;
    }

    const existing = await store.findByBotUserId(extracted.bot.id);
    if (existing) return true;

    const pendingAgentId = await redisClient.get(pendingKey).catch(() => null);
    const agent = CREW_MANAGED_AGENTS.find(item => item.id === pendingAgentId) || inferAgent(extracted.bot);
    if (!agent) {
      logger?.warn?.({ reasonCode: "MANAGED_BOT_AGENT_UNRESOLVED", extra: { botId: extracted.bot.id, username: extracted.bot.username || null } });
      return true;
    }

    const record = await store.upsert({
      agentId: agent.id,
      botUserId: extracted.bot.id,
      username: extracted.bot.username || null,
      displayName: agent.name,
      ownerUserId: extracted.ownerId || ownerUserId || null,
    });
    await configureManagedBot(record, agent);
    await redisClient.del(pendingKey).catch(() => {});

    const ownerChatId = String(ownerUserId || extracted.ownerId || "");
    if (ownerChatId) {
      const username = record.username || extracted.bot.username || "";
      await telegramAdapter.sendMessage({
        chatId: ownerChatId,
        text: [
          `✅ ${agent.emoji} ${agent.name} создан.`,
          username ? `@${username}` : `Bot ID: ${record.botUserId}`,
          "",
          groupChatId ? "Добавь его в Hyper Crew, затем создай следующего." : "Создай следующего агента.",
        ].join("\n"),
        replyMarkup: username && groupChatId ? {
          inline_keyboard: [[{ text: `Add ${agent.name} to Hyper Crew`, url: `https://t.me/${username}?startgroup=true` }]],
        } : null,
      });
      const next = await nextMissing();
      if (next) await promptForAgent(ownerChatId, next);
      else await sendSetupStatus(ownerChatId);
    }

    logger?.info?.({
      reasonCode: "MANAGED_CREW_BOT_BOUND",
      extra: { agentId: agent.id, botUserId: record.botUserId, username: record.username || null },
    });
    return true;
  }

  async function sendAutoSetupPromptOnce(chatId) {
    const alreadySent = await redisClient.exists(autoPromptKey).catch(() => 0);
    if (alreadySent) return false;
    const missing = await nextMissing();
    if (!missing) return false;
    await sendSetupStatus(chatId);
    await redisClient.set(autoPromptKey, "1", { EX: 86400 }).catch(() => {});
    return true;
  }

  async function routeTextForEvent(event) {
    const original = String(event?.text || "").trim();
    if (!original) return original;

    if (event?.parentUserId) {
      const repliedBot = await store.findByBotUserId(event.parentUserId).catch(() => null);
      if (repliedBot) {
        const agent = CREW_MANAGED_AGENTS.find(item => item.id === repliedBot.agentId);
        if (agent) return `${agent.name} ${original}`;
      }
    }

    const records = await store.list().catch(() => []);
    const lower = original.toLowerCase();
    for (const record of records) {
      const username = normalizeUsername(record.username);
      if (!username) continue;
      const mention = `@${username}`;
      if (lower === mention || lower.startsWith(`${mention} `)) {
        const agent = CREW_MANAGED_AGENTS.find(item => item.id === record.agentId);
        if (!agent) continue;
        const rest = original.slice(mention.length).trim();
        return `${agent.name}${rest ? ` ${rest}` : ""}`;
      }
    }
    return original;
  }

  async function sendAsAgent({ agentId, chatId, text, dataUrl = null, replyToMessageId = null, threadId = null } = {}) {
    if (!agentId || agentId === "orchestrator") return false;
    const record = await store.get(agentId);
    if (!record) return false;

    let token;
    try {
      token = await getManagedToken(record.botUserId);
    } catch (error) {
      logger?.warn?.({ reasonCode: "MANAGED_BOT_TOKEN_FAILED", extra: { agentId, error: error.message } });
      return false;
    }

    let adapter = createTelegramAdapter({ token, fetchImpl });
    const send = async (replyId) => {
      if (dataUrl) {
        return adapter.sendPhoto({ chatId, dataUrl, caption: text, replyToMessageId: replyId, threadId });
      }
      return adapter.sendMessage({ chatId, text, replyToMessageId: replyId, threadId });
    };

    try {
      await send(replyToMessageId);
      return true;
    } catch (error) {
      const replyTargetMissing = Boolean(
        replyToMessageId
        && /message to be replied not found/i.test(String(error?.message || ""))
      );

      if (replyTargetMissing) {
        try {
          await send(null);
          logger?.info?.({
            reasonCode: "MANAGED_BOT_REPLY_FALLBACK_SENT",
            extra: { agentId, botUserId: record.botUserId },
          });
          return true;
        } catch (retryError) {
          error = retryError;
        }
      }

      tokenCache.delete(String(record.botUserId));
      logger?.warn?.({ reasonCode: "MANAGED_BOT_SEND_FAILED", extra: { agentId, error: error.message } });
      return false;
    }
  }

  return {
    canHandleSetupCommand,
    handleSetupCommand,
    handleRawUpdate,
    sendSetupStatus,
    sendAutoSetupPromptOnce,
    listStatus,
    routeTextForEvent,
    sendAsAgent,
    getManagedToken,
  };
}

module.exports = {
  CREW_MANAGED_AGENTS,
  createManagedCrewManager,
};
