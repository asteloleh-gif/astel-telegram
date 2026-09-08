const fs = require("node:fs");
const path = require("node:path");

function readSession(config) {
  const envSession = String(config.session || "").trim();
  if (envSession) return envSession;

  const file = String(config.sessionFile || "").trim();
  if (!file) return "";

  try {
    return String(fs.readFileSync(file, "utf8") || "").trim();
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function writeSession(config, session) {
  const value = String(session || "").trim();
  if (!value) throw new Error("TELEGRAM_SESSION_EMPTY");

  const file = String(config.sessionFile || "").trim();
  if (!file) throw new Error("TELEGRAM_SESSION_FILE_NOT_CONFIGURED");

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return file;
}

module.exports = { readSession, writeSession };
