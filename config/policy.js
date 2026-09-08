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
    openaiModel: readString("OPENAI_MODEL", "gpt-5.6-terra"),
    openaiReasoningEffort: readString("OPENAI_REASONING_EFFORT", "medium"),
    aiTimeoutMs: readInt("AI_TIMEOUT_MS", 45000, 1000),
    aiMaxOutputTokens: readInt("AI_MAX_OUTPUT_TOKENS", 1600, 64),
    botEnabled: readBool("BOT_ENABLED", false),
    botDryRun: readBool("BOT_DRY_RUN", true),
  });
}

module.exports = { loadPolicy };
