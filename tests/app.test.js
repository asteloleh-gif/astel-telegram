const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../server");
const { createRedisClient } = require("../safety/redisClient");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");
const { createFakeLogger } = require("./helpers/fakeLogger");

function listen(app) {
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}
function baseUrl(server) { return `http://127.0.0.1:${server.address().port}`; }
function telegramUpdate({ updateId, messageId, chatId = 100, userId = 7, text = "hello" } = {}) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      from: { id: userId, username: "leo" },
      chat: { id: chatId, type: "private" },
      text,
    },
  };
}
function env(overrides = {}) {
  return {
    TELEGRAM_OWNER_ID: "7",
    TELEGRAM_BOT_TOKEN: "test-token",
    OPENAI_API_KEY: "test-key",
    BOT_ENABLED: "false",
    BOT_DRY_RUN: "true",
    ...overrides,
  };
}

async function post(server, update) {
  return fetch(`${baseUrl(server)}/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
}

test("app: /health reports Redis up and exposes assistant metadata", async () => {
  const fakeRedis = createFakeRedisClient();
  const wrapped = createRedisClient({ client: fakeRedis });
  await wrapped.connect();
  const { app } = createApp({ redisClient: wrapped, logger: createFakeLogger(), env: env() });
  const server = await listen(app);
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.redisStatus, "up");
    assert.equal(body.product, "Astel Assistant");
    assert.equal(body.version, "0.4.0");
    assert.equal(body.aiModels.chat, "gpt-5.6-luna");
    assert.equal(body.aiModels.power, "gpt-5.6-terra");
    assert.ok(body.skills.includes("ai-chat"));
    assert.ok(body.skills.includes("research"));
  } finally { server.close(); }
});

test("app: /health returns 503 when Redis is down", async () => {
  const fakeRedis = createFakeRedisClient();
  fakeRedis.setDown(true);
  const wrapped = createRedisClient({ client: fakeRedis });
  const { app } = createApp({ redisClient: wrapped, logger: createFakeLogger(), env: env() });
  const server = await listen(app);
  try {
    const res = await fetch(`${baseUrl(server)}/health`);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.redisStatus, "down");
  } finally { server.close(); }
});

test("app: owner message clears safety then enters assistant pipeline", async () => {
  const fakeRedis = createFakeRedisClient();
  const wrapped = createRedisClient({ client: fakeRedis });
  await wrapped.connect();
  const logger = createFakeLogger();
  const calls = [];
  const assistantPipeline = { run: async event => { calls.push(event); return { action: "STOP" }; } };
  const { app } = createApp({ redisClient: wrapped, logger, assistantPipeline, env: env() });
  const server = await listen(app);
  try {
    const res = await post(server, telegramUpdate({ updateId: 1, messageId: 10 }));
    assert.equal(res.status, 200);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].isOwner, true);
    assert.ok(logger.entries.some(x => x.reasonCode === "RESERVED_OK"));
  } finally { server.close(); }
});

test("app: non-owner is rejected before safety/assistant execution", async () => {
  const fakeRedis = createFakeRedisClient();
  const wrapped = createRedisClient({ client: fakeRedis });
  await wrapped.connect();
  const logger = createFakeLogger();
  let called = false;
  const assistantPipeline = { run: async () => { called = true; } };
  const { app } = createApp({ redisClient: wrapped, logger, assistantPipeline, env: env() });
  const server = await listen(app);
  try {
    await post(server, telegramUpdate({ updateId: 2, messageId: 11, userId: 999 }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(called, false);
    assert.equal(logger.entries.at(-1).reasonCode, "UNAUTHORIZED_USER");
  } finally { server.close(); }
});

test("app: retried webhook is rejected by dedupe", async () => {
  const fakeRedis = createFakeRedisClient();
  const wrapped = createRedisClient({ client: fakeRedis });
  await wrapped.connect();
  const logger = createFakeLogger();
  const assistantPipeline = { run: async () => ({ action: "STOP" }) };
  const { app } = createApp({ redisClient: wrapped, logger, assistantPipeline, env: env() });
  const server = await listen(app);
  try {
    const update = telegramUpdate({ updateId: 42, messageId: 100 });
    await post(server, update);
    await new Promise(resolve => setTimeout(resolve, 20));
    await post(server, update);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(logger.entries.at(-1).reasonCode, "DUPLICATE_UPDATE");
  } finally { server.close(); }
});
