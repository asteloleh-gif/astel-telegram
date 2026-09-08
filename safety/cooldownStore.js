const DEFAULT_NAMESPACE = "astel:tg:v1";
const DEFAULT_WINDOW_SECONDS = 20;

function createCooldownStore({ redisClient, namespace = DEFAULT_NAMESPACE, windowSeconds = DEFAULT_WINDOW_SECONDS } = {}) {
  if (!redisClient) throw new Error("createCooldownStore requires a redisClient");
  const key = (conversationId, userId) => `${namespace}:cooldown:${conversationId}:${userId}`;

  async function check(conversationId, userId) {
    if (!conversationId || !userId) throw new Error("cooldownStore.check requires conversationId and userId");
    return (await redisClient.exists(key(conversationId, userId))) === 1;
  }

  async function start(conversationId, userId) {
    if (!conversationId || !userId) throw new Error("cooldownStore.start requires conversationId and userId");
    await redisClient.set(key(conversationId, userId), String(Date.now()), { EX: windowSeconds });
  }

  return { check, start };
}

module.exports = { createCooldownStore, DEFAULT_NAMESPACE, DEFAULT_WINDOW_SECONDS };
