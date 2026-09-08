const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readSession, writeSession } = require("../src/sessionStore");

test("writes and reloads Telegram session from configured file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astel-tg-session-"));
  const file = path.join(dir, "telegram.session");
  const config = { session: "", sessionFile: file };
  try {
    assert.equal(readSession(config), "");
    writeSession(config, "session-value");
    assert.equal(readSession(config), "session-value");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("environment session takes precedence over file", () => {
  const config = { session: "env-session", sessionFile: "/not/used" };
  assert.equal(readSession(config), "env-session");
});
