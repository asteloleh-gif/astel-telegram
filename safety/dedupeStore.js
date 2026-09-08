const DEFAULT_NAMESPACE = "astel:tg:v1";
const DEFAULT_TTL_SECONDS = 86400;

function createDedupeStore({ redisClient, namespace = DEFAULT_NAMESPACE, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!redisClient) throw new Error("createDedupeStore requires a redisClient");
  const key = updateId => `${namespace}:dedupe:${updateId}`;

  async function reserve(updateId) {
    if (!updateId) throw new Error("dedupeStore.reserve requires an updateId");
    const result = await redisClient.set(key(updateId), "1", { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  return { reserve };
}

module.exports = { createDedupeStore, DEFAULT_NAMESPACE, DEFAULT_TTL_SECONDS };
