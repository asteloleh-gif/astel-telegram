const test = require("node:test");
const assert = require("node:assert/strict");
const { createManagedCrewManager, CREW_MANAGED_AGENTS } = require("../telegram/managedCrewManager");
const { createRedisClient } = require("../safety/redisClient");
const { createFakeRedisClient } = require("./helpers/fakeRedisClient");

function createStore() {
  const byAgent = new Map();
  const byBot = new Map();
  return {
    async list() { return [...byAgent.values()]; },
    async get(agentId) { return byAgent.get(agentId) || null; },
    async findByBotUserId(botUserId) { return byBot.get(String(botUserId)) || null; },
    async upsert(input) {
      const row = {
        agentId: input.agentId,
        botUserId: String(input.botUserId),
        username: input.username,
        displayName: input.displayName,
        ownerUserId: input.ownerUserId == null ? null : String(input.ownerUserId),
      };
      byAgent.set(row.agentId, row);
      byBot.set(row.botUserId, row);
      return row;
    },
  };
}

async function fixture() {
  const fake = createFakeRedisClient();
  const redis = createRedisClient({ client: fake });
  await redis.connect();
  const telegramCalls = [];
  const apiCalls = [];
  const store = createStore();
  const telegramAdapter = {
    sendMessage: async input => {
      telegramCalls.push(input);
      return { message_id: telegramCalls.length };
    },
  };
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body || "{}");
    apiCalls.push({ url, body });
    const method = url.split("/").at(-1);
    if (method === "getManagedBotToken") {
      return new Response(JSON.stringify({ ok: true, result: "123:managed-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  const manager = createManagedCrewManager({
    managerToken: "manager-token",
    ownerUserId: "7",
    groupChatId: "-5283133914",
    store,
    redisClient: redis,
    telegramAdapter,
    fetchImpl,
    namespace: "test",
  });
  return { manager, store, telegramCalls, apiCalls };
}

test("/crewsetup prompts for the first missing managed bot", async () => {
  const { manager, telegramCalls } = await fixture();
  const event = {
    isOwner: true,
    chatType: "private",
    conversationId: "7",
    text: "/crewsetup",
  };
  assert.equal(manager.canHandleSetupCommand(event), true);
  await manager.handleSetupCommand(event);
  assert.equal(telegramCalls.length, 2);
  const prompt = telegramCalls[1];
  assert.match(prompt.text, /Tommy the Googler/);
  assert.match(prompt.replyMarkup.inline_keyboard[0][0].url, /t\.me\/newbot\/astelcore_bot\/astel_tommy_bot/);
  assert.match(prompt.replyMarkup.inline_keyboard[0][0].url, /name=Tommy%20the%20Googler/);
});

test("managed_bot update binds the pending agent and configures profile", async () => {
  const { manager, store, apiCalls, telegramCalls } = await fixture();
  await manager.handleSetupCommand({
    isOwner: true,
    chatType: "private",
    conversationId: "7",
    text: "/crewsetup",
  });
  const handled = await manager.handleRawUpdate({
    update_id: 99,
    managed_bot: {
      user: { id: 7 },
      bot: { id: 9001, username: "custom_tommy_bot", first_name: "Tommy" },
    },
  });
  assert.equal(handled, true);
  const record = await store.get("researcher");
  assert.equal(record.botUserId, "9001");
  assert.equal(record.username, "custom_tommy_bot");
  assert.ok(apiCalls.some(call => call.url.endsWith("/getManagedBotToken")));
  assert.ok(apiCalls.some(call => call.url.endsWith("/setMyName")));
  assert.ok(telegramCalls.some(call => /Tommy the Googler создан/.test(call.text)));
  assert.ok(telegramCalls.some(call => /George Big Brain/.test(call.text)));
});

test("sendAsAgent uses managed bot token and identity", async () => {
  const { manager, store, apiCalls } = await fixture();
  await store.upsert({
    agentId: "visual",
    botUserId: "9006",
    username: "astel_yuki_bot",
    displayName: "Yuki Pixel",
    ownerUserId: "7",
  });
  const sent = await manager.sendAsAgent({
    agentId: "visual",
    chatId: "-5283133914",
    text: "Yuki says hi",
    replyToMessageId: "42",
  });
  assert.equal(sent, true);
  assert.ok(apiCalls.some(call => call.url.includes("botmanager-token/getManagedBotToken")));
  assert.ok(apiCalls.some(call => call.url.includes("bot123:managed-token/sendMessage")));
});

test("managed roster excludes Kevin because astelcore is Kevin", () => {
  assert.equal(CREW_MANAGED_AGENTS.length, 8);
  assert.equal(CREW_MANAGED_AGENTS.some(agent => agent.id === "orchestrator"), false);
});


test("auto setup prompt is sent only once per day", async () => {
  const { manager, telegramCalls } = await fixture();
  const first = await manager.sendAutoSetupPromptOnce("7");
  const second = await manager.sendAutoSetupPromptOnce("7");
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(telegramCalls.length, 2);
});


test("routes direct reply back to the managed agent", async () => {
  const { manager, store } = await fixture();
  await store.upsert({
    agentId: "visual",
    botUserId: "9006",
    username: "astel_yuki_bot",
    displayName: "Yuki Pixel",
    ownerUserId: "7",
  });
  const routed = await manager.routeTextForEvent({
    text: "сделай еще вариант",
    parentUserId: "9006",
  });
  assert.equal(routed, "Yuki Pixel сделай еще вариант");
});

test("routes @managed_bot mention to its agent", async () => {
  const { manager, store } = await fixture();
  await store.upsert({
    agentId: "copywriter",
    botUserId: "9003",
    username: "astel_sergio_bot",
    displayName: "Sergio Contentmaker",
    ownerUserId: "7",
  });
  const routed = await manager.routeTextForEvent({
    text: "@astel_sergio_bot перепиши это",
  });
  assert.equal(routed, "Sergio Contentmaker перепиши это");
});


test("managed agent retries without reply target when Telegram cannot see replied message", async () => {
  const fake = createFakeRedisClient();
  const redis = createRedisClient({ client: fake });
  await redis.connect();
  const store = createStore();
  await store.upsert({
    agentId: "researcher",
    botUserId: "9001",
    username: "astel_tommy_bot",
    displayName: "Tommy the Googler",
    ownerUserId: "7",
  });

  const sendBodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body || "{}");
    const method = url.split("/").at(-1);
    if (method === "getManagedBotToken") {
      return new Response(JSON.stringify({ ok: true, result: "123:managed-token" }), { status: 200 });
    }
    if (method === "sendMessage") {
      sendBodies.push(body);
      if (body.reply_parameters) {
        return new Response(JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: message to be replied not found",
        }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };

  const manager = createManagedCrewManager({
    managerToken: "manager-token",
    ownerUserId: "7",
    groupChatId: "-5283133914",
    store,
    redisClient: redis,
    telegramAdapter: { sendMessage: async () => ({ message_id: 1 }) },
    fetchImpl,
    namespace: "test-fallback",
  });

  const sent = await manager.sendAsAgent({
    agentId: "researcher",
    chatId: "-5283133914",
    text: "ONLINE",
    replyToMessageId: "42",
  });

  assert.equal(sent, true);
  assert.equal(sendBodies.length, 2);
  assert.deepEqual(sendBodies[0].reply_parameters, { message_id: 42 });
  assert.equal(sendBodies[1].reply_parameters, undefined);
});
