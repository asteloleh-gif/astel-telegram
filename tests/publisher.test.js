const test = require("node:test");
const assert = require("node:assert/strict");
const { createTelegramPublisher } = require("../publisher/telegramPublisher");
const { createReservationStore, STATES } = require("../safety/reservationStore");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");
const { createFakeLogger } = require("./helpers/fakeLogger");

function event() {
  return { traceId: "t1", conversationId: "100", messageId: "10", userId: "7", threadId: null };
}

async function setup({ enabled = true, dryRun = false, sendMessage } = {}) {
  const redis = createFakeRedisClient();
  const reservationStore = createReservationStore({ redisClient: redis });
  await reservationStore.reserve("100", "10");
  const logger = createFakeLogger();
  const publisher = createTelegramPublisher({
    telegramAdapter: { sendMessage: sendMessage || (async () => ({ message_id: 99 })) },
    reservationStore,
    logger,
    policy: { botEnabled: enabled, botDryRun: dryRun, publicationTtlSeconds: 86400, reservationTtlSeconds: 300 },
  });
  return { redis, publisher };
}

test("publisher: live success marks PUBLISHED", async () => {
  const { redis, publisher } = await setup();
  const result = await publisher.publish(event(), "hello");
  assert.equal(result.published, true);
  assert.equal(await redis.get("astel:tg:v1:reservation:100:10"), STATES.PUBLISHED);
});

test("publisher: dry run never calls Telegram", async () => {
  let called = false;
  const { publisher } = await setup({ dryRun: true, sendMessage: async () => { called = true; } });
  const result = await publisher.publish(event(), "hello");
  assert.equal(result.reasonCode, "DRY_RUN_REPLY");
  assert.equal(called, false);
});

test("publisher: ambiguous send failure is locked as AMBIGUOUS", async () => {
  const error = new Error("timeout");
  error.ambiguous = true;
  const { redis, publisher } = await setup({ sendMessage: async () => { throw error; } });
  const result = await publisher.publish(event(), "hello");
  assert.equal(result.reasonCode, "PUBLISH_AMBIGUOUS");
  assert.equal(await redis.get("astel:tg:v1:reservation:100:10"), STATES.AMBIGUOUS);
});
