const fetch = require("node-fetch");

function createTelegramAdapter({ token = process.env.TELEGRAM_BOT_TOKEN } = {}) {
  const apiBase = token ? `https://api.telegram.org/bot${token}` : null;

  function normalizeUpdate(update) {
    const message = update?.message || update?.edited_message || update?.channel_post || null;
    if (!message) return null;
    const from = message.from || {};
    const chat = message.chat || {};
    return {
      platform: "telegram",
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

  async function sendMessage({ chatId, text, replyToMessageId = null, threadId = null }) {
    if (!apiBase) throw new Error("TELEGRAM_BOT_TOKEN missing");
    const body = { chat_id: chatId, text };
    if (replyToMessageId) body.reply_parameters = { message_id: Number(replyToMessageId) };
    if (threadId) body.message_thread_id = Number(threadId);
    const res = await fetch(`${apiBase}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const error = new Error(`Telegram sendMessage failed: ${res.status}`);
      error.code = data?.error_code || res.status;
      throw error;
    }
    return data.result;
  }

  return { normalizeUpdate, sendMessage };
}

module.exports = { createTelegramAdapter };
