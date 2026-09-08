class RedisUnavailableError extends Error {
  constructor(message) {
    super(message || "Redis is unavailable");
    this.name = "RedisUnavailableError";
  }
}

function createRedisClient({ url = process.env.REDIS_URL, connectTimeoutMs = 5000, client = null } = {}) {
  let redis = client;
  let ready = false;
  let lastError = null;

  async function connect() {
    if (redis) {
      ready = true;
      return true;
    }
    if (!url) throw new RedisUnavailableError("REDIS_URL missing");

    const { createClient } = require("redis");
    redis = createClient({ url, socket: { connectTimeout: connectTimeoutMs } });
    redis.on("error", err => {
      ready = false;
      lastError = err?.message || String(err);
    });
    redis.on("ready", () => {
      ready = true;
      lastError = null;
    });
    redis.on("end", () => { ready = false; });

    try {
      if (!redis.isOpen) await redis.connect();
      await redis.ping();
    } catch (err) {
      ready = false;
      lastError = err?.message || String(err);
      throw new RedisUnavailableError(lastError);
    }

    ready = true;
    return true;
  }

  function assertReady() {
    if (!redis || !ready) throw new RedisUnavailableError(lastError || "Redis client not ready");
  }

  async function runOrFailClosed(fn) {
    assertReady();
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RedisUnavailableError) throw err;
      ready = false;
      lastError = err?.message || String(err);
      throw new RedisUnavailableError(lastError);
    }
  }

  async function set(key, value, options) { return runOrFailClosed(() => redis.set(key, value, options)); }
  async function get(key) { return runOrFailClosed(() => redis.get(key)); }
  async function exists(key) { return runOrFailClosed(() => redis.exists(key)); }
  async function del(key) { return runOrFailClosed(() => redis.del(key)); }
  async function ping() { return runOrFailClosed(() => redis.ping()); }

  async function checkHeartbeat(key, ttlSeconds = 30) {
    try {
      const value = String(Date.now());
      await set(key, value, { EX: ttlSeconds });
      const readBack = await get(key);
      return readBack === value;
    } catch (_err) {
      return false;
    }
  }

  async function quit() {
    if (redis?.isOpen) await redis.quit();
    ready = false;
  }

  function health() { return { connected: ready, lastError }; }

  return { connect, set, get, exists, del, ping, checkHeartbeat, quit, health, isReady: () => ready };
}

module.exports = { createRedisClient, RedisUnavailableError };
