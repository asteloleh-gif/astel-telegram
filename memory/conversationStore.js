const { trimMemory } = require("./reconstructChatMemory");

function createConversationStore({ redisClient, namespace = "astel:tg:v1", ttlSeconds = 86400, maxMessages = 12, maxTokens = 3000 } = {}) {
  if (!redisClient) throw new Error("createConversationStore requires a redisClient");

  const scope = event => event?.threadId ? `thread:${event.threadId}` : "main";
  const keyFor = event => {
    if (!event?.conversationId || !event?.userId) throw new Error("conversationStore requires conversationId and userId");
    return `${namespace}:memory:${event.conversationId}:${scope(event)}:${event.userId}`;
  };

  async function read(event) {
    const raw = await redisClient.get(keyFor(event));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.messages) ? parsed.messages : [];
    } catch (_err) {
      return [];
    }
  }

  async function write(event, messages) {
    const trimmed = trimMemory(messages, { maxMessages, maxTokens });
    const payload = {
      updatedAt: new Date().toISOString(),
      messages: trimmed.messages.map(({ estimatedTokens, ...message }) => message),
    };
    await redisClient.set(keyFor(event), JSON.stringify(payload), { EX: ttlSeconds });
    return payload.messages;
  }

  async function append(event, message) {
    const messages = await read(event);
    messages.push({
      role: message.role,
      text: String(message.text || "").trim(),
      timestamp: message.timestamp || new Date().toISOString(),
      messageId: message.messageId || null,
    });
    return write(event, messages);
  }

  async function clear(event) {
    await redisClient.del(keyFor(event));
    return true;
  }

  return { read, append, clear, keyFor };
}

module.exports = { createConversationStore };
