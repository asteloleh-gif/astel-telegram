const { TelegramClient, Api } = require("teleproto");
const { StringSession } = require("teleproto/sessions");
const { writeSession } = require("./sessionStore");

function errorCode(error) {
  return error?.errorMessage || error?.message || String(error || "TELEGRAM_AUTH_FAILED");
}

function createSetupAuth(config, { onSessionSaved } = {}) {
  let pending = null;

  function credentials() {
    if (!config.apiId || !config.apiHash) throw new Error("TELEGRAM_API_NOT_CONFIGURED");
    return { apiId: config.apiId, apiHash: config.apiHash };
  }

  async function reset() {
    if (pending?.client) await pending.client.disconnect().catch(() => null);
    pending = null;
  }

  async function begin(phone) {
    const phoneNumber = String(phone || "").trim();
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) throw new Error("PHONE_INVALID");

    await reset();
    const creds = credentials();
    const client = new TelegramClient(new StringSession(""), creds.apiId, creds.apiHash, {
      connectionRetries: config.connectionRetries,
    });
    await client.connect();
    const sent = await client.sendCode(creds, phoneNumber);

    pending = {
      client,
      phoneNumber,
      phoneCodeHash: sent.phoneCodeHash,
      startedAt: Date.now(),
      needsPassword: false,
    };

    return {
      ok: true,
      step: "code",
      viaApp: Boolean(sent.isCodeViaApp),
      phoneMasked: `${phoneNumber.slice(0, 3)}•••${phoneNumber.slice(-2)}`,
    };
  }

  async function finalize() {
    if (!pending?.client) throw new Error("AUTH_NOT_STARTED");
    const me = await pending.client.getMe();
    const session = pending.client.session.save();
    writeSession(config, session);
    if (onSessionSaved) await onSessionSaved(session);

    const account = {
      id: me?.id != null ? String(me.id) : null,
      username: me?.username || null,
      firstName: me?.firstName || null,
    };
    await reset();
    return { ok: true, step: "done", account };
  }

  async function verifyCode(code) {
    if (!pending?.client) throw new Error("AUTH_NOT_STARTED");
    const value = String(code || "").replace(/\s+/g, "");
    if (!value) throw new Error("PHONE_CODE_REQUIRED");

    try {
      const result = await pending.client.invoke(new Api.auth.SignIn({
        phoneNumber: pending.phoneNumber,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: value,
      }));

      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error("ACCOUNT_SIGNUP_REQUIRED");
      }
      return await finalize();
    } catch (error) {
      const codeValue = errorCode(error);
      if (codeValue === "SESSION_PASSWORD_NEEDED") {
        pending.needsPassword = true;
        return { ok: true, step: "password", needsPassword: true };
      }
      throw new Error(codeValue);
    }
  }

  async function verifyPassword(password) {
    if (!pending?.client || !pending.needsPassword) throw new Error("PASSWORD_NOT_REQUESTED");
    const value = String(password || "");
    if (!value) throw new Error("PASSWORD_REQUIRED");

    const creds = credentials();
    try {
      await pending.client.signInWithPassword(creds, {
        password: async () => value,
        onError: async (error) => { throw error; },
      });
      return await finalize();
    } catch (error) {
      throw new Error(errorCode(error));
    }
  }

  function status() {
    return {
      active: Boolean(pending),
      step: pending ? (pending.needsPassword ? "password" : "code") : null,
      ageSeconds: pending ? Math.floor((Date.now() - pending.startedAt) / 1000) : null,
    };
  }

  return { begin, verifyCode, verifyPassword, status, reset };
}

module.exports = { createSetupAuth, errorCode };
