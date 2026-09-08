function loadPolicy(env = process.env) {
  const readInt = (name, fallback, min = 0) => {
    const raw = env[name];
    if (raw == null || raw === "") return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  };
  const readBool = (name, fallback) => {
    const raw = env[name];
    if (raw == null || raw === "") return fallback;
    return String(raw).toLowerCase() === "true";
  };
  const readString = (name, fallback = "") => {
    const raw = env[name];
    return raw == null || raw === "" ? fallback : raw;
  };

  const powerModel = readString("OPENAI_POWER_MODEL", readString("OPENAI_MODEL", "gpt-5.6-terra"));
  const chatModel = readString("OPENAI_CHAT_MODEL", "gpt-5.6-luna");
  const powerReasoning = readString(
    "OPENAI_POWER_REASONING_EFFORT",
    readString("OPENAI_REASONING_EFFORT", "medium")
  );
  const chatReasoning = readString("OPENAI_CHAT_REASONING_EFFORT", "low");
  const powerMaxOutput = readInt("AI_POWER_MAX_OUTPUT_TOKENS", readInt("AI_MAX_OUTPUT_TOKENS", 1600, 64), 64);
  const chatMaxOutput = readInt("AI_CHAT_MAX_OUTPUT_TOKENS", 700, 64);

  return Object.freeze({
    ownerUserId: readString("TELEGRAM_OWNER_ID", ""),
    normalReplyLimit: readInt("NORMAL_REPLY_LIMIT", 3, 1),
    cooldownSeconds: readInt("COOLDOWN_SECONDS", 2, 0),
    conversationResetHours: readInt("CONVERSATION_RESET_HOURS", 24, 1),
    globalDailyLimit: readInt("GLOBAL_DAILY_LIMIT", 50, 1),
    redisRequired: readBool("REDIS_REQUIRED", true),
    humanLockTtlHours: readInt("HUMAN_LOCK_TTL_HOURS", 24, 1),
    redisNamespace: readString("REDIS_NAMESPACE", "astel:tg:v1"),
    dedupeTtlSeconds: readInt("DEDUPE_TTL_SECONDS", 86400, 1),
    reservationTtlSeconds: readInt("RESERVATION_TTL_SECONDS", 300, 1),
    publicationTtlSeconds: readInt("PUBLICATION_TTL_SECONDS", 86400, 60),
    redisConnectTimeoutMs: readInt("REDIS_CONNECT_TIMEOUT_MS", 5000, 1),
    healthHeartbeatTtlSeconds: readInt("HEALTH_HEARTBEAT_TTL_SECONDS", 30, 1),
    memoryMaxMessages: readInt("MEMORY_MAX_MESSAGES", 12, 2),
    memoryMaxTokens: readInt("MEMORY_MAX_TOKENS", 3000, 256),
    aiProvider: readString("AI_PROVIDER", "openai"),
    // Backward-compatible aliases point to the power tier.
    openaiModel: powerModel,
    openaiReasoningEffort: powerReasoning,
    aiMaxOutputTokens: powerMaxOutput,
    openaiChatModel: chatModel,
    openaiPowerModel: powerModel,
    openaiChatReasoningEffort: chatReasoning,
    openaiPowerReasoningEffort: powerReasoning,
    aiChatMaxOutputTokens: chatMaxOutput,
    aiPowerMaxOutputTokens: powerMaxOutput,
    aiTimeoutMs: readInt("AI_TIMEOUT_MS", 45000, 1000),
    botEnabled: readBool("BOT_ENABLED", false),
    botDryRun: readBool("BOT_DRY_RUN", true),
  });
}

module.exports = { loadPolicy };
