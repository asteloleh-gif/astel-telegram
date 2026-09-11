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
    env: { COPILOT_APPROVAL_ENABLED: "true", TELEGRAM_OWNER_ID: "7", TELEGRAM_WEBHOOK_SECRET: "webhook-secret", COPILOT_ACCOUNT_KEYS_JSON: JSON.stringify({ ru: "x".repeat(32) }) },
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
    const loop = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-copilot-account": "ru", authorization: `Bearer ${"x".repeat(32)}` }, body: JSON.stringify({ ...input, postId: "124" }) });
    assert.equal(loop.status, 429);
    assert.equal(loop.headers.get("retry-after"), "10");
    assert.equal(sent.length, 1);
  } finally { server.close(); }
});
