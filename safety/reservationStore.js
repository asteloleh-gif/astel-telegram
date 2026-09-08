const DEFAULT_NAMESPACE = "astel:tg:v1";
const DEFAULT_TTL_SECONDS = 300;

const STATES = Object.freeze({
  RESERVED: "RESERVED",
  AI_GENERATE: "AI_GENERATE",
  PRE_PUBLISH_CHECK: "PRE_PUBLISH_CHECK",
  SEND: "SEND",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  AMBIGUOUS: "AMBIGUOUS",
});

function createReservationStore({ redisClient, namespace = DEFAULT_NAMESPACE, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!redisClient) throw new Error("createReservationStore requires a redisClient");
  const key = (conversationId, messageId) => `${namespace}:reservation:${conversationId}:${messageId}`;

  async function reserve(conversationId, messageId) {
    if (!conversationId || !messageId) throw new Error("reservationStore.reserve requires conversationId and messageId");
    const result = await redisClient.set(key(conversationId, messageId), STATES.RESERVED, { NX: true, EX: ttlSeconds });
    return result === "OK";
  }

  async function setState(conversationId, messageId, state, { ttlSeconds: stateTtlSeconds = ttlSeconds } = {}) {
    if (!Object.values(STATES).includes(state)) throw new Error(`reservationStore.setState: unknown state "${state}"`);
    await redisClient.set(key(conversationId, messageId), state, { XX: true, EX: stateTtlSeconds });
  }

  async function release(conversationId, messageId) {
    if (!conversationId || !messageId) throw new Error("reservationStore.release requires conversationId and messageId");
    await redisClient.del(key(conversationId, messageId));
  }

  return { reserve, setState, release, STATES };
}

module.exports = { createReservationStore, STATES, DEFAULT_NAMESPACE, DEFAULT_TTL_SECONDS };
