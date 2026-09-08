function createAIChatSkill({ aiEngine, conversationStore, logger, policy } = {}) {
  function canHandle(event) {
    return Boolean(String(event?.text || "").trim());
  }

  function parse(event) {
    const raw = String(event?.text || "").trim();
    const isPower = /^\/think(?:\s|$)/i.test(raw);
    const text = isPower ? raw.replace(/^\/think\s*/i, "").trim() : raw;
    return { isPower, text };
  }

  async function handle(event) {
    const parsed = parse(event);
    if (parsed.isPower && !parsed.text) {
      return {
        text: "Использование: /think <сложная задача>",
        rememberAssistant: false,
      };
    }

    const history = await conversationStore.read(event);
    await conversationStore.append(event, {
      role: "user",
      text: parsed.text,
      messageId: event.messageId,
    });

    const model = parsed.isPower ? policy.openaiPowerModel : policy.openaiChatModel;
    const reasoningEffort = parsed.isPower
      ? policy.openaiPowerReasoningEffort
      : policy.openaiChatReasoningEffort;
    const maxOutputTokens = parsed.isPower
      ? policy.aiPowerMaxOutputTokens
      : policy.aiChatMaxOutputTokens;

    const generated = await aiEngine.generate({
      history,
      text: parsed.text,
      model,
      reasoningEffort,
      maxOutputTokens,
    });
    logger.info({
      traceId: event.traceId,
      reasonCode: parsed.isPower ? "AI_POWER_GENERATED" : "AI_CHAT_GENERATED",
      conversationId: event.conversationId,
      messageId: event.messageId,
      userId: event.userId,
      extra: {
        model: generated.model,
        mode: parsed.isPower ? "power" : "chat",
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

  return { id: "ai-chat", canHandle, handle, parse };
}

module.exports = { createAIChatSkill };
