const DEFAULT_MAX_MESSAGES = 8;
const DEFAULT_MAX_TOKENS = 1000;

function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  return Math.max(1, Math.ceil(value.length / 4));
}

function trimMemory(messages = [], { maxMessages = DEFAULT_MAX_MESSAGES, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const selected = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0 && selected.length < maxMessages; i -= 1) {
    const message = messages[i];
    const text = String(message?.text || "").trim();
    if (!text) continue;
    const tokens = estimateTokens(text);
    if (total + tokens > maxTokens) break;
    selected.push({ ...message, text, estimatedTokens: tokens });
    total += tokens;
  }
  return { messages: selected.reverse(), estimatedTokens: total };
}

module.exports = { DEFAULT_MAX_MESSAGES, DEFAULT_MAX_TOKENS, estimateTokens, trimMemory };
