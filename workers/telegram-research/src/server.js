const express = require("express");
const { loadConfig } = require("./config");
const { createTelegramResearchClient } = require("./telegramClient");

function createApp({ env = process.env } = {}) {
  const config = loadConfig(env);
  const telegram = createTelegramResearchClient(config);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/", (_req, res) => {
    res.json({
      service: "astel-telegram-research-worker",
      version: "0.1.0",
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
      version: "0.1.0",
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

  return { app, config, telegram };
}

async function start() {
  const { app, config, telegram } = createApp();
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
    await telegram.disconnect();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) start();

module.exports = { createApp, start };
