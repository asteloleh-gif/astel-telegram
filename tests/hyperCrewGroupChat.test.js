const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isHyperCrewGroupChat,
  handleHyperCrewGroupChat,
  formatCrewReply,
} = require("../skills/hyperCrewGroupChat");

function event(overrides = {}) {
  return {
    traceId: "trace-1",
    updateId: "1",
    conversationId: "-5283133914",
    messageId: "84",
    userId: "1110654813",
    threadId: null,
    text: "Юки сделай обложку",
    isOwner: true,
    ...overrides,
  };
}

test("detects owner messages in configured Hyper Crew group", () => {
  assert.equal(isHyperCrewGroupChat(event(), { chatId: "-5283133914" }), true);
  assert.equal(isHyperCrewGroupChat(event({ conversationId: "123" }), { chatId: "-5283133914" }), false);
  assert.equal(isHyperCrewGroupChat(event({ isOwner: false }), { chatId: "-5283133914" }), false);
  assert.equal(isHyperCrewGroupChat(event({ text: "/crew test" }), { chatId: "-5283133914" }), false);
});

test("formats named agent response", () => {
  const text = formatCrewReply({
    target: { id: "visual", name: "Yuki Pixel", title: "Visual" },
    reply: "Готово.",
  });
  assert.match(text, /Yuki Pixel/);
  assert.match(text, /Готово/);
});

test("routes text reply through Hyper Crew and Telegram", async () => {
  const calls = { chat: [], sendMessage: [], append: [] };
  const history = [{ role: "user", text: "старый контекст" }];
  const result = await handleHyperCrewGroupChat({
    event: event({ text: "Серёга перепиши это" }),
    client: {
      chat: async input => {
        calls.chat.push(input);
        return {
          target: { id: "copywriter", name: "Sergio Contentmaker", title: "Writer" },
          reply: "Новый текст",
          artifacts: [],
        };
      },
    },
    conversationStore: {
      read: async () => history,
      append: async (_event, item) => { calls.append.push(item); },
    },
    telegramAdapter: {
      sendMessage: async input => { calls.sendMessage.push(input); return { message_id: 99 }; },
      sendPhoto: async () => { throw new Error("unexpected photo"); },
    },
    projectId: "astel-business",
  });

  assert.equal(result.target.id, "copywriter");
  assert.equal(calls.chat[0].projectId, "astel-business");
  assert.equal(calls.chat[0].history.length, 1);
  assert.equal(calls.sendMessage[0].chatId, "-5283133914");
  assert.equal(calls.sendMessage[0].replyToMessageId, "84");
  assert.match(calls.sendMessage[0].text, /Sergio Contentmaker/);
  assert.equal(calls.append.length, 2);
});

test("sends Yuki image artifact as Telegram photo", async () => {
  const calls = { sendPhoto: [] };
  await handleHyperCrewGroupChat({
    event: event(),
    client: {
      chat: async () => ({
        target: { id: "visual", name: "Yuki Pixel", title: "Visual" },
        reply: "Вот вариант.",
        artifacts: [{ type: "image", dataUrl: "data:image/png;base64,ZmFrZQ==" }],
      }),
    },
    conversationStore: {
      read: async () => [],
      append: async () => {},
    },
    telegramAdapter: {
      sendMessage: async () => { throw new Error("unexpected text"); },
      sendPhoto: async input => { calls.sendPhoto.push(input); return { message_id: 100 }; },
    },
  });
  assert.equal(calls.sendPhoto.length, 1);
  assert.equal(calls.sendPhoto[0].chatId, "-5283133914");
  assert.match(calls.sendPhoto[0].caption, /Yuki Pixel/);
});


test("uses managed agent identity before falling back to Kevin", async () => {
  const calls = { managed: [], fallback: [] };
  await handleHyperCrewGroupChat({
    event: event({ text: "Серёга перепиши" }),
    client: {
      chat: async () => ({
        target: { id: "copywriter", name: "Sergio Contentmaker", title: "Writer" },
        reply: "Готово",
        artifacts: [],
      }),
    },
    conversationStore: {
      read: async () => [],
      append: async () => {},
    },
    telegramAdapter: {
      sendMessage: async input => { calls.fallback.push(input); },
      sendPhoto: async input => { calls.fallback.push(input); },
    },
    managedBotManager: {
      sendAsAgent: async input => { calls.managed.push(input); return true; },
    },
  });
  assert.equal(calls.managed.length, 1);
  assert.equal(calls.managed[0].agentId, "copywriter");
  assert.equal(calls.fallback.length, 0);
});


test("passes manager-routed text into Hyper Crew", async () => {
  const calls = [];
  await handleHyperCrewGroupChat({
    event: event({ text: "сделай еще вариант", parentUserId: "9006" }),
    client: {
      chat: async input => {
        calls.push(input);
        return {
          target: { id: "visual", name: "Yuki Pixel", title: "Visual" },
          reply: "Ок",
          artifacts: [],
        };
      },
    },
    conversationStore: { read: async () => [], append: async () => {} },
    telegramAdapter: { sendMessage: async () => {}, sendPhoto: async () => {} },
    managedBotManager: {
      routeTextForEvent: async () => "Yuki Pixel сделай еще вариант",
      sendAsAgent: async () => true,
    },
  });
  assert.equal(calls[0].text, "Yuki Pixel сделай еще вариант");
});
