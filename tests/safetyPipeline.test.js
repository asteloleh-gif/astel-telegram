const test = require("node:test");
const assert = require("node:assert/strict");
const { runSafetyPipeline } = require("../safety/safetyPipeline");
const { createDedupeStore } = require("../safety/dedupeStore");
const { createReservationStore } = require("../safety/reservationStore");
const { createCooldownStore } = require("../safety/cooldownStore");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");
const { createFakeLogger } = require("./helpers/fakeLogger");

function buildStores(redis = createFakeRedisClient()) {
  return {
    dedupeStore: createDedupeStore({ redisClient: redis }),
    reservationStore: createReservationStore({ redisClient: redis }),
    cooldownStore: createCooldownStore({ redisClient: redis, windowSeconds: 20 }),
  };
}

function event(overrides = {}) {
  return {
    traceId: "trace-1",
    updateId: "update-1",
    conversationId: "chat:1",
    messageId: "msg:1",
    userId: "user:1",
    ...overrides,
  };
}

test("safetyPipeline: clean message reaches RESERVED_OK", async () => {
  const logger = createFakeLogger();
  const result = await runSafetyPipeline({ ...buildStores(), logger }, event());
  assert.deepEqual(result, { action: "SAFE_STOP", reasonCode: "RESERVED_OK" });
});

test("safetyPipeline: duplicate update stops at dedupe", async () => {
  const stores = buildStores();
  const logger = createFakeLogger();
  await runSafetyPipeline({ ...stores, logger }, event());
  const result = await runSafetyPipeline({ ...stores, logger }, event({ messageId: "msg:2" }));
  assert.deepEqual(result, { action: "STOP", reasonCode: "DUPLICATE_UPDATE" });
});

test("safetyPipeline: same source message with new update id stops at reservation", async () => {
  const stores = buildStores();
  const logger = createFakeLogger();
  await runSafetyPipeline({ ...stores, logger }, event());
  const result = await runSafetyPipeline({ ...stores, logger }, event({ updateId: "update-2" }));
  assert.deepEqual(result, { action: "STOP", reasonCode: "ALREADY_RESERVED" });
});

test("safetyPipeline: cooldown skip releases the new reservation", async () => {
  const stores = buildStores();
  const logger = createFakeLogger();
  await runSafetyPipeline({ ...stores, logger }, event());
  const result = await runSafetyPipeline({ ...stores, logger }, event({ updateId: "update-2", messageId: "msg:2" }));
  assert.deepEqual(result, { action: "STOP", reasonCode: "SKIPPED_COOLDOWN" });
  assert.equal(await stores.reservationStore.reserve("chat:1", "msg:2"), true);
});

test("safetyPipeline: Redis outage fails closed", async () => {
  const redis = createFakeRedisClient();
  redis.setDown(true);
  const logger = createFakeLogger();
  const result = await runSafetyPipeline({ ...buildStores(redis), logger }, event());
  assert.deepEqual(result, { action: "STOP", reasonCode: "REDIS_UNAVAILABLE" });
  assert.equal(logger.entries.at(-1).level, "critical");
});
