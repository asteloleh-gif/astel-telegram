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

  return Object.freeze({
    normalReplyLimit: readInt("NORMAL_REPLY_LIMIT", 3, 1),
    cooldownSeconds: readInt("COOLDOWN_SECONDS", 20, 0),
    conversationResetHours: readInt("CONVERSATION_RESET_HOURS", 24, 1),
    globalDailyLimit: readInt("GLOBAL_DAILY_LIMIT", 50, 1),
    redisRequired: readBool("REDIS_REQUIRED", true),
    humanLockTtlHours: readInt("HUMAN_LOCK_TTL_HOURS", 24, 1),
  });
}

module.exports = { loadPolicy };
