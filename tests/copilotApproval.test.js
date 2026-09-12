const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");
const { createApprovalQueue } = require("../copilot/approvalQueue");
const { createApprovalController } = require("../copilot/approvalController");

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

const input = { account: "ru", postId: "123", language: "ru", text: "Черновик" };
test("immutable draft versions are content-addressed; languages are unrestricted", async () => {
  const queue = createApprovalQueue({ redis: createFakeRedisClient() });
  const first = await queue.submit(input);
  const again = await queue.submit({ ...input, text: "Other" });
  assert.equal(again.created, true);
  assert.equal(again.draft.text, "Other");
  assert.notEqual(again.draft.id, first.draft.id);
  assert.notEqual((await queue.submit({ ...input, account: "cn", language: "zh-CN" })).draft.id, first.draft.id);
});
test("draft keeps only an HTTPS Threads permalink", async () => {
  const queue = createApprovalQueue({ redis: createFakeRedisClient() });
  const accepted = await queue.submit({ ...input, permalink: "https://www.threads.com/@maker/post/abc" });
  assert.equal(accepted.draft.permalink, "https://www.threads.com/@maker/post/abc");
  const rejected = await queue.submit({ ...input, postId: "124", permalink: "https://example.com/steal" });
  assert.equal(rejected.draft.permalink, "");
});
test("simultaneous conflicting clicks produce only one terminal decision", async () => {
  const queue = createApprovalQueue({ redis: createFakeRedisClient() });
  const { draft } = await queue.submit(input);
  const results = await Promise.all([queue.decide(draft.id, "approved", "7"), queue.decide(draft.id, "skipped", "7")]);
  assert.equal(results.filter(r => r.status === "already_decided").length, 1);
  assert.equal((await queue.decision(draft.id)).textHash.length, 64);
});
test("expired drafts cannot be approved and Redis failure stops decisions", async () => {
  let now = 1000;
  const redis = createFakeRedisClient();
  const queue = createApprovalQueue({ redis, clock: () => now, ttlSeconds: 1 });
  const { draft } = await queue.submit(input);
  now += 2000;
  assert.equal((await queue.decide(draft.id, "approved", "7")).status, "expired");
  redis.setDown(true);
  await assert.rejects(queue.decide(draft.id, "approved", "7"));
});
test("callbacks require owner in private chat and explicit activation", async () => {
  const redis = createFakeRedisClient();
  const queue = createApprovalQueue({ redis });
  const { draft } = await queue.submit(input);
  const env = { TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "secret", COPILOT_APPROVAL_ENABLED: "true", BOT_ENABLED: "true", BOT_DRY_RUN: "false" };
  const acknowledgments = [];
  const telegram = { async answerCallbackQuery(value) { acknowledgments.push(value); } };
  const controller = createApprovalController({ redis, telegram, env });
  const update = user => ({ callback_query: { id: "click", from: { id: user }, message: { chat: { id: 7, type: "private" } }, data: `cp:a:${draft.id}` } });
  await controller.handle(update(99));
  assert.equal(await queue.decision(draft.id), null);
  await createApprovalController({ redis, telegram, env: { ...env, COPILOT_APPROVAL_ENABLED: "false" } }).handle(update(7));
  assert.equal(await queue.decision(draft.id), null);
  await controller.handle(update(7));
  assert.equal((await queue.decision(draft.id)).action, "approved");
  assert.equal(acknowledgments.length, 1);
});

test("edit creates a new immutable version and supersedes the old buttons", async () => {
  const redis = createFakeRedisClient();
  const queue = createApprovalQueue({ redis });
  const { draft } = await queue.submit(input);
  assert.equal((await queue.beginEdit(draft.id, "7")).status, "editing");
  const revised = await queue.revise("7", "Исправленный текст");
  assert.equal(revised.status, "revised");
  assert.notEqual(revised.draft.id, draft.id);
  assert.equal((await queue.decision(draft.id)).action, "superseded");
  assert.equal((await queue.decide(draft.id, "approved", "7")).status, "already_decided");
  assert.equal((await queue.decide(revised.draft.id, "approved", "7")).status, "approved");
});

test("direct editor revision creates a new immutable version", async () => {
  const queue = createApprovalQueue({ redis: createFakeRedisClient() });
  const { draft } = await queue.submit(input);
  const revised = await queue.reviseById(draft.id, "7", "Версия из Mini App");
  assert.equal(revised.status, "revised");
  assert.equal(revised.draft.text, "Версия из Mini App");
  assert.equal((await queue.decision(draft.id)).replacementId, revised.draft.id);
});

test("unchanged edit leaves the original approval buttons valid", async () => {
  const queue = createApprovalQueue({ redis: createFakeRedisClient() });
  const { draft } = await queue.submit(input);
  await queue.beginEdit(draft.id, "7");
  assert.equal((await queue.revise("7", `  ${input.text}  `)).status, "unchanged");
  assert.equal((await queue.decide(draft.id, "approved", "7")).status, "approved");
});

test("draft endpoint authenticates the producer account and sends three owner actions", async () => {
  const sent = [];
  const telegram = { async sendMessage(value) { sent.push(value); } };
  const app = express();
  app.use(express.json());
  createApprovalController({
    redis: createFakeRedisClient(), telegram,
    env: { COPILOT_APPROVAL_ENABLED: "true", TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "webhook-secret", PUBLIC_BASE_URL: "https://astel.example", COPILOT_ACCOUNT_KEYS_JSON: JSON.stringify({ ru: "x".repeat(32) }) },
  }).mount(app);
  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}/api/copilot/drafts`;
  try {
    const unauthorized = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-copilot-account": "ru", authorization: `Bearer ${"x".repeat(32)}` }, body: JSON.stringify(input) });
    assert.equal(authorized.status, 201);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].replyMarkup.inline_keyboard[0].map(item => item.text), ["Одобрить", "Изменить", "Пропустить"]);
    assert.match(sent[0].replyMarkup.inline_keyboard[0][1].web_app.url, /^https:\/\/astel\.example\/\?copilotDraft=/);
    const loop = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-copilot-account": "ru", authorization: `Bearer ${"x".repeat(32)}` }, body: JSON.stringify({ ...input, postId: "124" }) });
    assert.equal(loop.status, 429);
    assert.equal(loop.headers.get("retry-after"), "10");
    assert.equal(sent.length, 1);
  } finally { server.close(); }
});

test("producer can send a compact cycle report to the owner", async () => {
  const sent = [];
  const app = express();
  app.use(express.json());
  createApprovalController({
    redis: createFakeRedisClient(),
    telegram: { async sendMessage(value) { sent.push(value); } },
    env: { COPILOT_APPROVAL_ENABLED: "true", TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "secret", COPILOT_ACCOUNT_KEYS_JSON: JSON.stringify({ ru: "x".repeat(32) }) },
  }).mount(app);
  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}/api/copilot/reports`;
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-copilot-account": "ru", authorization: `Bearer ${"x".repeat(32)}` }, body: JSON.stringify({ status: "ok", scanned: 20, fresh: 5, eligible: 2, evaluated: 2, submitted: 1, aiTokens: 430, aiCostMicrousd: 172 }) });
    assert.equal(response.status, 201);
    assert.match(sent[0].text, /Copilot · RU/);
    assert.match(sent[0].text, /Просмотрено: 20/);
    assert.match(sent[0].text, /GPT: 430 токенов · ≈ \$0\.0002/);
  } finally { server.close(); }
});

test("owner Mini App can load and revise a draft, then receives a new card", async () => {
  const redis = createFakeRedisClient();
  const sent = [];
  const controller = createApprovalController({
    redis,
    telegram: { async sendMessage(value) { sent.push(value); } },
    env: { COPILOT_APPROVAL_ENABLED: "true", TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "secret", PUBLIC_BASE_URL: "https://astel.example" },
  });
  const queue = createApprovalQueue({ redis });
  const { draft } = await queue.submit(input);
  const app = express();
  app.use(express.json());
  controller.mount(app, { webAppGuard: (req, _res, next) => { req.telegramMiniAppUser = { id: 7 }; next(); } });
  const server = await listen(app);
  const url = `http://127.0.0.1:${server.address().port}/api/copilot/editor/${draft.id}`;
  try {
    const loaded = await fetch(url);
    assert.equal(loaded.status, 200);
    assert.equal((await loaded.json()).draft.text, input.text);
    const saved = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Новый интерактивный ответ" }) });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).status, "revised");
    assert.equal(sent.length, 1);
    assert.equal((await queue.decision(draft.id)).action, "superseded");
  } finally { server.close(); }
});

test("safe test card exercises Telegram approval without producer submission", async () => {
  const sent = [];
  const controller = createApprovalController({
    redis: createFakeRedisClient(),
    telegram: { async sendMessage(value) { sent.push(value); } },
    env: { COPILOT_APPROVAL_ENABLED: "true", TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "secret" },
  });
  const result = await controller.sendTest();
  assert.equal(result.status, "sent");
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /ТЕСТОВЫЙ ПОСТ/);
  assert.deepEqual(sent[0].replyMarkup.inline_keyboard[0].map(item => item.text), ["Одобрить", "Изменить", "Пропустить"]);
});
