const crypto = require("node:crypto");

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function verifyTelegramInitData(initData, { botToken, ownerUserId, maxAgeSeconds = 900 } = {}) {
  const raw = String(initData || "");
  if (!raw || !botToken || !ownerUserId) return { ok: false, reason: "MINI_APP_AUTH_MISSING" };

  const params = new URLSearchParams(raw);
  const hash = params.get("hash") || "";
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(hash, expected)) return { ok: false, reason: "MINI_APP_AUTH_INVALID" };

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > maxAgeSeconds || authDate - now > 60) {
    return { ok: false, reason: "MINI_APP_AUTH_EXPIRED" };
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch (_error) {
    return { ok: false, reason: "MINI_APP_USER_INVALID" };
  }

  if (String(user?.id || "") !== String(ownerUserId)) {
    return { ok: false, reason: "OWNER_ONLY" };
  }

  return { ok: true, user };
}

function createTelegramWebAppGuard({ botToken, ownerUserId, maxAgeSeconds } = {}) {
  return function telegramWebAppGuard(req, res, next) {
    const result = verifyTelegramInitData(req.get("x-telegram-init-data"), {
      botToken,
      ownerUserId,
      maxAgeSeconds,
    });
    if (!result.ok) return res.status(401).json({ error: result.reason });
    req.telegramMiniAppUser = result.user;
    next();
  };
}

module.exports = { verifyTelegramInitData, createTelegramWebAppGuard };
