const DEFAULT_INSTRUCTIONS = `You are Astel Assistant, a private AI assistant for the owner.
Be practical, concise, and action-oriented. Help with business, lead generation, sourcing,
content, software projects, research, and planning. Never pretend an external action was
completed unless a connected skill actually completed it. When a capability is unavailable,
say so clearly and suggest the next concrete step.`;

function createAIEngine({ provider, instructions = DEFAULT_INSTRUCTIONS } = {}) {
  if (!provider?.generate) throw new Error("createAIEngine requires a provider");

  function formatInput(history, currentText) {
    const lines = [];
    if (history?.length) {
      lines.push("Conversation history:");
      for (const item of history) {
        const label = item.role === "assistant" ? "ASSISTANT" : "USER";
        lines.push(`${label}: ${item.text}`);
      }
      lines.push("");
    }
    lines.push(`CURRENT USER MESSAGE: ${currentText}`);
    return lines.join("\n");
  }

  async function generate({
    history = [],
    text,
    model = null,
    reasoningEffort = null,
    maxOutputTokens = null,
  }) {
    return provider.generate({
      instructions,
      input: formatInput(history, text),
      model,
      reasoningEffort,
      maxOutputTokens,
    });
  }

  return { generate, formatInput };
}

module.exports = { createAIEngine, DEFAULT_INSTRUCTIONS };
