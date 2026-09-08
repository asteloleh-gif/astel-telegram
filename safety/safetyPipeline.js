const { RedisUnavailableError } = require("./redisClient");

async function runSafetyPipeline({ dedupeStore, reservationStore, cooldownStore, logger }, event) {
  const base = {
    traceId: event.traceId,
    conversationId: event.conversationId,
    messageId: event.messageId,
    userId: event.userId,
  };

  const failClosed = (stage, err) => {
    logger.critical({ ...base, reasonCode: "REDIS_UNAVAILABLE", extra: { stage, error: err.message } });
    return { action: "STOP", reasonCode: "REDIS_UNAVAILABLE" };
  };

  let isNewUpdate;
  try {
    isNewUpdate = await dedupeStore.reserve(event.updateId);
  } catch (err) {
    if (err instanceof RedisUnavailableError) return failClosed("dedupe", err);
    throw err;
  }
  if (!isNewUpdate) {
    logger.info({ ...base, reasonCode: "DUPLICATE_UPDATE" });
    return { action: "STOP", reasonCode: "DUPLICATE_UPDATE" };
  }

  let gotReservation;
  try {
    gotReservation = await reservationStore.reserve(event.conversationId, event.messageId);
  } catch (err) {
    if (err instanceof RedisUnavailableError) return failClosed("reservation", err);
    throw err;
  }
  if (!gotReservation) {
    logger.info({ ...base, reasonCode: "ALREADY_RESERVED" });
    return { action: "STOP", reasonCode: "ALREADY_RESERVED" };
  }

  let onCooldown;
  try {
    onCooldown = await cooldownStore.check(event.conversationId, event.userId);
    if (onCooldown) await reservationStore.release(event.conversationId, event.messageId);
    else await cooldownStore.start(event.conversationId, event.userId);
  } catch (err) {
    if (err instanceof RedisUnavailableError) return failClosed("cooldown", err);
    throw err;
  }
  if (onCooldown) {
    logger.info({ ...base, reasonCode: "SKIPPED_COOLDOWN" });
    return { action: "STOP", reasonCode: "SKIPPED_COOLDOWN" };
  }

  logger.info({ ...base, reasonCode: "RESERVED_OK" });
  return { action: "SAFE_STOP", reasonCode: "RESERVED_OK" };
}

module.exports = { runSafetyPipeline };
