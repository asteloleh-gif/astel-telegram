const test = require("node:test");
const assert = require("node:assert/strict");
const { createHyperCrewSkill, parseCrewCommand } = require("../skills/hyperCrewSkill");

test("crew command supports default and Battle Box projects", () => {
  assert.deepEqual(parseCrewCommand({ text: "/crew create launch plan" }), { projectId: "astel-business", objective: "create launch plan" });
  assert.deepEqual(parseCrewCommand({ text: "/crew battle find racing trends" }), { projectId: "battle-box", objective: "find racing trends" });
  assert.equal(parseCrewCommand({ text: "/research something" }), null);
});

test("crew skill creates an idempotent run and returns approval package", async () => {
  const calls = [];
  const client = {
    createRun: async input => { calls.push(input); return { id: "run-1" }; },
    startRun: async id => ({
      id,
      projectId: "astel-business",
      status: "AWAITING_APPROVAL",
      stages: [{}, {}, {}, {}, {}],
      usage: { totalTokens: 1234 },
      approval: { package: {
        draft: { variants: [{ platform: "threads", text: "Ready draft" }] },
        distributionPlan: { destinations: [{ platform: "threads" }] },
      } },
    }),
  };
  const skill = createHyperCrewSkill({ client, miniAppUrl: "https://assistant.example" });
  const result = await skill.handle({ text: "/crew launch", updateId: "42", conversationId: "7", messageId: "9", userId: "1" });
  assert.equal(calls[0].idempotencyKey, "telegram:42");
  assert.match(result.text, /AWAITING_APPROVAL/);
  assert.match(result.text, /Ready draft/);
  assert.match(result.replyMarkup.inline_keyboard[0][0].web_app.url, /crewRun=run-1/);
});
