function createAIChatSkill({ aiEngine, conversationStore, logger } = {}) {
  function canHandle(event) {
    return Boolean(String(event?.text || "").trim());
  }

  async function handle(event) {
    const history = await conversationStore.read(event);
    await conversationStore.append(event, {
      role: "user",
      text: event.text,
      messageId: event.messageId,
    });

    const generated = await aiEngine.generate({ history, text: event.text });
    logger.info({
      traceId: event.traceId,
      reasonCode: "AI_GENERATED",
      conversationId: event.conversationId,
      messageId: event.messageId,
      userId: event.userId,
      extra: {
        model: generated.model,
        responseId: generated.responseId,
        usage: generated.usage,
      },
    });

    return {
      text: generated.text,
      rememberAssistant: true,
      ai: generated,
    };
  }

  return { id: "ai-chat", canHandle, handle };
}

module.exports = { createAIChatSkill };
