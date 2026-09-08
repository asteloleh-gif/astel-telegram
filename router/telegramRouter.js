function buildConversationKey(message) {
  if (!message?.chatId) return null;
  const scope = message.threadId ? `thread:${message.threadId}` : "main";
  return `chat:${message.chatId}|${scope}|user:${message.userId || message.username || "unknown"}`;
}

function classifyTelegramMessage(message, { botUserId = null } = {}) {
  if (!message) return { action: "SKIP", reason: "NO_MESSAGE" };
  if (!message.chatId || !message.messageId) return { action: "SKIP", reason: "INVALID_MESSAGE" };
  if (botUserId && message.userId && String(message.userId) === String(botUserId)) {
    return { action: "SKIP", reason: "SELF_MESSAGE" };
  }
  if (!String(message.text || "").trim()) return { action: "SKIP", reason: "EMPTY_TEXT" };
  return {
    action: "REPLY",
    reason: message.parentId ? "DIRECT_REPLY" : "CHAT_MESSAGE",
    conversationKey: buildConversationKey(message),
  };
}

function buildNormalizedEvent(message, { ownerUserId = null } = {}) {
  if (!message) return null;
  return {
    platform: message.platform || "telegram",
    traceId: message.traceId || null,
    updateId: message.updateId || null,
    userId: message.userId || null,
    username: message.username || null,
    conversationId: message.chatId || null,
    messageId: message.messageId || null,
    parentId: message.parentId || null,
    threadId: message.threadId || null,
    text: message.text || "",
    isOwner: Boolean(ownerUserId && message.userId && String(ownerUserId) === String(message.userId)),
  };
}

module.exports = { buildConversationKey, classifyTelegramMessage, buildNormalizedEvent };
