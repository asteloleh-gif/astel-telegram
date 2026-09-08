const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyTelegramInitData } = require("../setup/telegramWebAppGuard");

function makeInitData({ botToken, userId, authDate = Math.floor(Date.now() / 1000) }) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AA-test");
  params.set("user", JSON.stringify({ id: userId, first_name: "Owner" }));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("accepts valid owner Telegram Mini App init data", () => {
  const botToken = "123456:test-token";
  const initData = makeInitData({ botToken, userId: 42 });
  const result = verifyTelegramInitData(initData, { botToken, ownerUserId: "42" });
  assert.equal(result.ok, true);
  assert.equal(String(result.user.id), "42");
});

test("rejects a different Telegram user", () => {
  const botToken = "123456:test-token";
  const initData = makeInitData({ botToken, userId: 99 });
  const result = verifyTelegramInitData(initData, { botToken, ownerUserId: "42" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "OWNER_ONLY");
});
