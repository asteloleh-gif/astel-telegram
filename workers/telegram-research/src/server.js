const express = require("express");
const { loadConfig } = require("./config");
const { createTelegramResearchClient } = require("./telegramClient");
const { createSetupAuth } = require("./setupAuth");

function createApp({ env = process.env } = {}) {
  const config = loadConfig(env);
  const telegram = createTelegramResearchClient(config);
  const setupAuth = createSetupAuth(config, {
    onSessionSaved: async () => telegram.disconnect(),
  });
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/", (_req, res) => {
    res.json({
      service: "astel-telegram-research-worker",
      version: "0.2.0",
      mode: "read-only",
    });
  });

  app.get("/health", async (_req, res) => {
    const state = await telegram.status();
    const ready = Boolean(state.configured && state.connected && state.authorized);
    res.status(200).json({
      ok: true,
      ready,
      service: "astel-telegram-research-worker",
      version: "0.2.0",
      readOnly: true,
      telegram: {
        configured: state.configured,
        connected: state.connected,
        authorized: state.authorized,
        account: state.account,
      },
      sourcesConfigured: config.sources.length,
    });
  });

  app.use((req, res, next) => {
    if (!config.workerApiKey) return next();
    const provided = req.get("x-astel-worker-key") || "";
    if (provided !== config.workerApiKey) return res.status(401).json({ error: "UNAUTHORIZED" });
    next();
  });

  app.get("/setup/status", async (_req, res) => {
    const state = await telegram.status();
    res.json({
      ok: true,
      ready: Boolean(state.configured && state.connected && state.authorized),
      telegram: {
        configured: state.configured,
        connected: state.connected,
        authorized: state.authorized,
        account: state.account,
      },
      auth: setupAuth.status(),
      persistentSession: Boolean(config.sessionFile || config.session),
    });
  });

  app.post("/setup/begin", async (req, res) => {
    try {
      res.json(await setupAuth.begin(req.body?.phone));
    } catch (error) {
      res.status(400).json({ error: error?.message || "TELEGRAM_AUTH_BEGIN_FAILED" });
    }
  });

  app.post("/setup/code", async (req, res) => {
    try {
      res.json(await setupAuth.verifyCode(req.body?.code));
    } catch (error) {
      res.status(400).json({ error: error?.message || "TELEGRAM_AUTH_CODE_FAILED" });
    }
  });

  app.post("/setup/password", async (req, res) => {
    try {
      res.json(await setupAuth.verifyPassword(req.body?.password));
    } catch (error) {
      res.status(400).json({ error: error?.message || "TELEGRAM_AUTH_PASSWORD_FAILED" });
    }
  });

  app.post("/setup/reset", async (_req, res) => {
    await setupAuth.reset();
    res.json({ ok: true });
  });

  app.get("/sources", (_req, res) => {
    res.json({ count: config.sources.length, sources: config.sources });
  });

  app.post("/search", async (req, res) => {
    try {
      const query = String(req.body?.query || "").trim();
      const periodHours = Number(req.body?.periodHours || 168);
      const limit = Number(req.body?.limit || 20);
      const sources = Array.isArray(req.body?.sources)
        ? req.body.sources.map((item) => String(item).trim()).filter(Boolean)
        : null;

      const result = await telegram.search({ query, periodHours, limit, sources });
      res.json(result);
    } catch (error) {
      const code = error?.message || "SEARCH_FAILED";
      const status = [
        "TELEGRAM_SESSION_MISSING",
        "TELEGRAM_SESSION_UNAUTHORIZED",
        "TELEGRAM_NOT_AUTHORIZED",
      ].includes(code) ? 503 : 400;
      res.status(status).json({ error: code });
    }
  });

  return { app, config, telegram, setupAuth };
}

async function start() {
  const { app, config, telegram, setupAuth } = createApp();
  const server = app.listen(config.port, () => {
    console.log(JSON.stringify({
      event: "WORKER_STARTED",
      port: config.port,
      readOnly: true,
      sourcesConfigured: config.sources.length,
    }));
  });

  telegram.connect()
    .then((state) => console.log(JSON.stringify({ event: "TELEGRAM_STATE", ...state })))
    .catch((error) => console.error(JSON.stringify({ event: "TELEGRAM_CONNECT_FAILED", error: error?.message || String(error) })));

  const shutdown = async () => {
    await setupAuth.reset().catch(() => null);
    await telegram.disconnect();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) start();

module.exports = { createApp, start };
