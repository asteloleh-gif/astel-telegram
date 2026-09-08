const { createClient } = require("redis");

function createHumanLockStore({ redisUrl = process.env.REDIS_URL, namespace = "astel:telegram", ttlSeconds = 24 * 60 * 60 } = {}) {
  let client = null;
  let ready = false;
  let lastError = null;
  const keySafe = v => encodeURIComponent(String(v || ""));
  const lockKey = conversationKey => `${namespace}:human-lock:${keySafe(conversationKey)}`;

  async function init() {
    if (!redisUrl) throw new Error("REDIS_URL missing for human lock store");
    client = createClient({ url: redisUrl });
    client.on("error", err => { ready = false; lastError = err?.message || String(err); });
    client.on("ready", () => { ready = true; lastError = null; });
    client.on("end", () => { ready = false; });
    await client.connect();
    await client.ping();
    ready = true;
    return true;
  }

  async function lock(conversationKey) {
    if (!client || !ready) throw new Error("Human lock store unavailable");
    if (!conversationKey) return false;
    await client.set(lockKey(conversationKey), "1", { EX: ttlSeconds });
    return true;
  }

  async function isLocked(conversationKey) {
    if (!client || !ready) throw new Error("Human lock store unavailable");
    if (!conversationKey) return false;
    return (await client.exists(lockKey(conversationKey))) === 1;
  }

  async function quit() { if (client?.isOpen) await client.quit(); ready = false; }
  return { init, lock, isLocked, quit, health: () => ({ connected: ready, lastError, ttlSeconds }) };
}

module.exports = { createHumanLockStore };
