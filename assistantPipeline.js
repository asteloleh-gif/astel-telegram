const { AIProviderError } = require("./ai/openaiProvider");

function createAssistantPipeline({ skillRegistry, publisher, conversationStore, logger } = {}) {
  async function run(event) {
    const base = {
      traceId: event.traceId,
      conversationId: event.conversationId,
      messageId: event.messageId,
      userId: event.userId,
    };

    const skill = skillRegistry.resolve(event);
    if (!skill) {
      logger.warn({ ...base, reasonCode: "NO_SKILL" });
      return { action: "STOP", reasonCode: "NO_SKILL" };
    }

    let candidate;
    try {
      candidate = await skill.handle(event);
    } catch (err) {
      const reasonCode = err instanceof AIProviderError ? err.code : "SKILL_FAILED";
      logger.error({ ...base, reasonCode, extra: { skill: skill.id, error: err?.message || String(err) } });
      return { action: "STOP", reasonCode };
    }

    const published = await publisher.publish(event, candidate.text);
    if (published.published && candidate.rememberAssistant) {
      await conversationStore.append(event, {
        role: "assistant",
        text: candidate.text,
        messageId: published.result?.message_id != null ? String(published.result.message_id) : null,
      });
    }

    return {
      action: published.published ? "PUBLISHED" : "STOP",
      reasonCode: published.reasonCode,
      skill: skill.id,
    };
  }

  return { run };
}

module.exports = { createAssistantPipeline };
