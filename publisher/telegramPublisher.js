function createTelegramPublisher({ telegramAdapter, reservationStore, logger, policy } = {}) {
  if (!telegramAdapter?.sendMessage) throw new Error("telegramPublisher requires telegramAdapter.sendMessage");
  if (!reservationStore) throw new Error("telegramPublisher requires reservationStore");

  async function publish(event, candidate) {
    const payload = typeof candidate === "string" ? { text: candidate } : (candidate || {});
    const text = String(payload.text || "");
    const replyMarkup = payload.replyMarkup || null;
    const base = {
      traceId: event.traceId,
      conversationId: event.conversationId,
      messageId: event.messageId,
      userId: event.userId,
    };

    if (!policy.botEnabled) {
      logger.info({ ...base, reasonCode: "BOT_DISABLED" });
      return { published: false, reasonCode: "BOT_DISABLED" };
    }
    if (policy.botDryRun) {
      logger.info({ ...base, reasonCode: "DRY_RUN_REPLY", extra: { text } });
      return { published: false, reasonCode: "DRY_RUN_REPLY" };
    }

    await reservationStore.setState(event.conversationId, event.messageId, reservationStore.STATES.PRE_PUBLISH_CHECK);
    await reservationStore.setState(event.conversationId, event.messageId, reservationStore.STATES.SEND);

    try {
      const result = await telegramAdapter.sendMessage({
        chatId: event.conversationId,
        text,
        replyToMessageId: event.messageId,
        threadId: event.threadId,
        replyMarkup,
      });
      await reservationStore.setState(
        event.conversationId,
        event.messageId,
        reservationStore.STATES.PUBLISHED,
        { ttlSeconds: policy.publicationTtlSeconds }
      );
      logger.info({ ...base, reasonCode: "PUBLISHED", extra: { telegramMessageId: result?.message_id || null } });
      return { published: true, reasonCode: "PUBLISHED", result };
    } catch (err) {
      const state = err?.ambiguous ? reservationStore.STATES.AMBIGUOUS : reservationStore.STATES.FAILED;
      await reservationStore.setState(
        event.conversationId,
        event.messageId,
        state,
        { ttlSeconds: err?.ambiguous ? policy.publicationTtlSeconds : policy.reservationTtlSeconds }
      );
      logger.error({
        ...base,
        reasonCode: err?.ambiguous ? "PUBLISH_AMBIGUOUS" : "PUBLISH_FAILED",
        extra: { error: err?.message || String(err) },
      });
      return { published: false, reasonCode: err?.ambiguous ? "PUBLISH_AMBIGUOUS" : "PUBLISH_FAILED" };
    }
  }

  return { publish };
}

module.exports = { createTelegramPublisher };
