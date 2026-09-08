function parseSources(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^https?:\/\/(?:www\.)?t\.me\//i, "@"))
    .map((item) => (item.startsWith("@") ? item : `@${item}`));
}

function loadConfig(env = process.env) {
  const apiId = Number(env.TELEGRAM_API_ID || 0);
  const apiHash = String(env.TELEGRAM_API_HASH || "").trim();
  const session = String(env.TELEGRAM_SESSION || "").trim();
  const sessionFile = String(env.TELEGRAM_SESSION_FILE || "").trim();
  const sources = parseSources(env.TELEGRAM_SOURCES);

  return {
    port: Number(env.PORT || 3000),
    apiId: Number.isFinite(apiId) ? apiId : 0,
    apiHash,
    session,
    sessionFile,
    sources,
    workerApiKey: String(env.WORKER_API_KEY || "").trim(),
    maxSourcesPerSearch: Math.max(1, Math.min(50, Number(env.MAX_SOURCES_PER_SEARCH || 30))),
    maxResults: Math.max(1, Math.min(100, Number(env.MAX_RESULTS || 50))),
    connectionRetries: Math.max(1, Math.min(20, Number(env.TELEGRAM_CONNECTION_RETRIES || 5))),
  };
}

module.exports = { loadConfig, parseSources };
