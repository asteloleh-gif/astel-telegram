const { RedisUnavailableError } = require("../../safety/redisClient");

function createFakeRedisClient() {
  const store = new Map();
  let down = false;

  const isExpired = entry => entry.expiresAt != null && entry.expiresAt <= Date.now();
  const assertUp = () => {
    if (down) throw new RedisUnavailableError("fake redis is down");
  };

  async function set(key, value, options = {}) {
    assertUp();
    const existing = store.get(key);
    const alive = existing && !isExpired(existing);
    if (options.NX && alive) return null;
    if (options.XX && !alive) return null;
    const ttl = options.EX;
    store.set(key, { value: String(value), expiresAt: ttl != null ? Date.now() + ttl * 1000 : null });
    return "OK";
  }

  async function get(key) {
    assertUp();
    const entry = store.get(key);
    return !entry || isExpired(entry) ? null : entry.value;
  }

  async function exists(key) {
    assertUp();
    const entry = store.get(key);
    return entry && !isExpired(entry) ? 1 : 0;
  }

  async function del(key) {
    assertUp();
    return store.delete(key) ? 1 : 0;
  }

  async function ping() {
    assertUp();
    return "PONG";
  }

  async function checkHeartbeat(key, ttlSeconds = 30) {
    try {
      const value = String(Date.now());
      await set(key, value, { EX: ttlSeconds });
      return (await get(key)) === value;
    } catch {
      return false;
    }
  }

  return {
    set, get, exists, del, ping, checkHeartbeat,
    isReady: () => !down,
    health: () => ({ connected: !down, lastError: down ? "forced down" : null }),
    setDown(value) { down = value; },
    expireNow(key) {
      const entry = store.get(key);
      if (entry) entry.expiresAt = Date.now() - 1;
    },
  };
}

module.exports = { createFakeRedisClient };
