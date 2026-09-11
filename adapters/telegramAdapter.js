const crypto = require("crypto");

class TelegramPublishError extends Error {
  constructor(message, { code = null, ambiguous = false } = {}) {
    super(message);
    this.name = "TelegramPublishError";
    this.code = code;
    this.ambiguous = ambiguous;
  }
}

function createTelegramAdapter({
  token = process.env.TELEGRAM_BOT_TOKEN,
  requestTimeoutMs = 15000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const apiBase = token ? `https://api.telegram.org/bot${token}` : null;

  function normalizeUpdate(update) {
    const message = update?.message || update?.edited_message || update?.channel_post || null;
    if (!message) return null;
    const from = message.from || {};
    const chat = message.chat || {};
    return {
      platform: "telegram",
      traceId: crypto.randomUUID(),
      updateId: update?.update_id != null ? String(update.update_id) : null,
      messageId: message.message_id != null ? String(message.message_id) : null,
      parentId: message.reply_to_message?.message_id != null ? String(message.reply_to_message.message_id) : null,
      userId: from.id != null ? String(from.id) : null,
      username: from.username || null,
      chatId: chat.id != null ? String(chat.id) : null,
      chatType: chat.type || null,
      threadId: message.message_thread_id != null ? String(message.message_thread_id) : null,
      text: message.text || message.caption || "",
      raw: update,
    };
  }

  async function request(method, body, { ambiguousOnNetworkError = false } = {}) {
    if (!apiBase) throw new TelegramPublishError("TELEGRAM_BOT_TOKEN missing", { ambiguous: false });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    let res;
    try {
      res = await fetchImpl(`${apiBase}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: controller.signal,
      });
    } catch (err) {
      throw new TelegramPublishError(
        err?.name === "AbortError" ? `Telegram ${method} timed out` : (err?.message || `Telegram ${method} network error`),
        { ambiguous: ambiguousOnNetworkError }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new TelegramPublishError(data?.description || `Telegram ${method} failed: ${res.status}`, {
        code: data?.error_code || res.status,
        ambiguous: false,
      });
    }
    return data.result;
  }

  async function sendMessage({ chatId, text, replyToMessageId = null, threadId = null, replyMarkup = null }) {
    const body = { chat_id: chatId, text };
    if (replyToMessageId) body.reply_parameters = { message_id: Number(replyToMessageId) };
    if (threadId) body.message_thread_id = Number(threadId);
    if (replyMarkup) body.reply_markup = replyMarkup;
    return request("sendMessage", body, { ambiguousOnNetworkError: true });
  }

  async function setWebhook({ url, secretToken = null }) {
    if (!url) throw new Error("setWebhook requires url");
    const body = {
      url,
      allowed_updates: ["message", "edited_message", "callback_query"],
      drop_pending_updates: false,
    };
    if (secretToken) body.secret_token = secretToken;
    return request("setWebhook", body);
  }

  async function getMe() {
    return request("getMe", {});
  }

  async function answerCallbackQuery({ callbackQueryId, text }) {
    return request("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  return { normalizeUpdate, sendMessage, setWebhook, getMe, answerCallbackQuery };
}

module.exports = { createTelegramAdapter, TelegramPublishError };
