const REQUIRED_FIELDS = ["traceId", "reasonCode", "conversationId", "messageId", "userId"];

function createLogger({ service = "astel-telegram" } = {}) {
  function write(level, fields = {}) {
    const { extra, ...rest } = fields;
    const entry = { timestamp: new Date().toISOString(), service, level };

    for (const key of REQUIRED_FIELDS) {
      entry[key] = rest[key] !== undefined ? rest[key] : null;
    }
    if (extra && typeof extra === "object") entry.extra = extra;

    const line = JSON.stringify(entry);
    if (level === "error" || level === "critical") console.error(line);
    else console.log(line);
  }

  return {
    info: fields => write("info", fields),
    warn: fields => write("warn", fields),
    error: fields => write("error", fields),
    critical: fields => write("critical", fields),
  };
}

module.exports = { createLogger };
