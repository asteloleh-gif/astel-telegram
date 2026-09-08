require("dotenv").config();
const express = require("express");
const path = require("path");
const { createTelegramAdapter } = require("./adapters/telegramAdapter");
const { classifyTelegramMessage, buildNormalizedEvent } = require("./router/telegramRouter");
const { loadPolicy } = require("./config/policy");
const { createLogger } = require("./logging/logger");
const { createRedisClient } = require("./safety/redisClient");
const { createDedupeStore } = require("./safety/dedupeStore");
const { createReservationStore } = require("./safety/reservationStore");
const { createCooldownStore } = require("./safety/cooldownStore");
const { runSafetyPipeline } = require("./safety/safetyPipeline");
const { checkOwner } = require("./safety/ownerGuard");
const { createConversationStore } = require("./memory/conversationStore");
const { createOpenAIProvider } = require("./ai/openaiProvider");
const { createAIEngine } = require("./ai/aiEngine");
const { createTelegramPublisher } = require("./publisher/telegramPublisher");
const { createSystemSkill } = require("./skills/systemSkill");
const { createResearchSkill } = require("./skills/researchSkill");
const { createAIChatSkill } = require("./skills/aiChatSkill");
const { createSkillRegistry } = require("./skills/skillRegistry");
const { createAssistantPipeline } = require("./assistantPipeline");
const { createTelegramWebAppGuard } = require("./setup/telegramWebAppGuard");
const { createTelegramResearchProxy } = require("./setup/telegramResearchProxy");
const { planTelegramQueries, runTelegramAiSearch } = require("./research/telegramAiSearch");

function createApp({
  telegramAdapter,
  redisClient,
  dedupeStore,
  reservationStore,
  cooldownStore,
  conversationStore,
  aiProvider,
  aiEngine,
  publisher,
  skillRegistry,
  assistantPipeline,
  logger,
  env = process.env,
} = {}) {
  const policy = loadPolicy(env);
  const log = logger || createLogger();
  const telegram = telegramAdapter || createTelegramAdapter({ token: env.TELEGRAM_BOT_TOKEN });

  const redis = redisClient || createRedisClient({
    url: env.REDIS_URL,
    connectTimeoutMs: policy.redisConnectTimeoutMs,
  });
  const dedupe = dedupeStore || createDedupeStore({
    redisClient: redis,
    namespace: policy.redisNamespace,
    ttlSeconds: policy.dedupeTtlSeconds,
  });
  const reservation = reservationStore || createReservationStore({
    redisClient: redis,
    namespace: policy.redisNamespace,
    ttlSeconds: policy.reservationTtlSeconds,
  });
  const cooldown = cooldownStore || createCooldownStore({
    redisClient: redis,
    namespace: policy.redisNamespace,
    windowSeconds: policy.cooldownSeconds,
  });
  const memory = conversationStore || createConversationStore({
    redisClient: redis,
    namespace: policy.redisNamespace,
    ttlSeconds: policy.conversationResetHours * 3600,
    maxMessages: policy.memoryMaxMessages,
    maxTokens: policy.memoryMaxTokens,
  });

  const provider = aiProvider || createOpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    model: policy.openaiPowerModel,
    reasoningEffort: policy.openaiPowerReasoningEffort,
    timeoutMs: policy.aiTimeoutMs,
    maxOutputTokens: policy.aiPowerMaxOutputTokens,
  });
  const engine = aiEngine || createAIEngine({ provider });
  const telegramPublisher = publisher || createTelegramPublisher({
    telegramAdapter: telegram,
    reservationStore: reservation,
    logger: log,
    policy,
  });
  const skills = skillRegistry || createSkillRegistry([
    createSystemSkill({
      policy,
      conversationStore: memory,
      redisClient: redis,
      miniAppUrl: env.MINI_APP_URL || env.PUBLIC_BASE_URL || "",
    }),
    createResearchSkill({ provider, conversationStore: memory, logger: log, policy }),
    createAIChatSkill({ aiEngine: engine, conversationStore: memory, logger: log, policy }),
  ]);
  const assistant = assistantPipeline || createAssistantPipeline({
    skillRegistry: skills,
    publisher: telegramPublisher,
    conversationStore: memory,
    logger: log,
  });

  const telegramResearch = createTelegramResearchProxy({
    baseUrl: env.TELEGRAM_RESEARCH_WORKER_URL,
    workerApiKey: env.TELEGRAM_RESEARCH_WORKER_KEY,
    timeoutMs: Number(env.TELEGRAM_RESEARCH_WORKER_TIMEOUT_MS || 15000),
  });
  const telegramSetupGuard = createTelegramWebAppGuard({
    botToken: env.TELEGRAM_BOT_TOKEN,
    ownerUserId: policy.ownerUserId,
    maxAgeSeconds: Number(env.MINI_APP_AUTH_MAX_AGE_SECONDS || 900),
  });

  const heartbeatKey = `${policy.redisNamespace}:health:heartbeat`;
  const app = express();
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const redisUp = await redis.checkHeartbeat(heartbeatKey, policy.healthHeartbeatTtlSeconds);
    const configured = Boolean(policy.ownerUserId && env.TELEGRAM_BOT_TOKEN && env.OPENAI_API_KEY);
    res.status(redisUp ? 200 : 503).json({
      ok: redisUp,
      service: "astel-telegram",
      product: "Astel Assistant",
      version: "0.3.1",
      configured,
      botEnabled: policy.botEnabled,
      dryRun: policy.botDryRun,
      redisStatus: redisUp ? "up" : "down",
      aiProvider: policy.aiProvider,
      aiModels: {
        chat: policy.openaiChatModel,
        power: policy.openaiPowerModel,
      },
      skills: skills.list(),
    });
  });

  async function runTelegramSetupAction(res, action) {
    try {
      return res.json(await action());
    } catch (error) {
      const status = Number(error?.status || 502);
      return res.status(status >= 400 && status < 600 ? status : 502).json({
        error: error?.message || "TELEGRAM_RESEARCH_SETUP_FAILED",
      });
    }
  }

  app.get("/api/telegram-research/setup/status", telegramSetupGuard, async (_req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.status());
  });

  app.post("/api/telegram-research/setup/begin", telegramSetupGuard, async (req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.begin(req.body?.phone));
  });

  app.post("/api/telegram-research/setup/code", telegramSetupGuard, async (req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.code(req.body?.code));
  });

  app.post("/api/telegram-research/setup/password", telegramSetupGuard, async (req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.password(req.body?.password));
  });

  app.post("/api/telegram-research/setup/reset", telegramSetupGuard, async (_req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.reset());
  });

  app.get("/api/telegram-research/sources", telegramSetupGuard, async (_req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.listSources());
  });

  app.post("/api/telegram-research/sources", telegramSetupGuard, async (req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.addSource(req.body?.source));
  });

  app.delete("/api/telegram-research/sources/:source", telegramSetupGuard, async (req, res) => {
    await runTelegramSetupAction(res, () => telegramResearch.deleteSource(req.params.source));
  });

  app.get("/api/telegram-research/dialogs", telegramSetupGuard, async (req, res) => {
    const requestedLimit = Number(req.query?.limit || 120);
    const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 120));
    await runTelegramSetupAction(res, () => telegramResearch.listDialogs({ limit }));
  });

  app.post("/api/telegram-research/search", telegramSetupGuard, async (req, res) => {
    const query = String(req.body?.query || "").trim();
    if (!query) return res.status(400).json({ error: "SEARCH_QUERY_REQUIRED" });

    const requestedPeriodHours = Number(req.body?.periodHours || 168);
    const requestedLimit = Number(req.body?.limit || 20);
    const periodHours = Math.max(1, Math.min(24 * 365, Number.isFinite(requestedPeriodHours) ? requestedPeriodHours : 168));
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const sources = Array.isArray(req.body?.sources)
      ? req.body.sources.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 50)
      : undefined;

    await runTelegramSetupAction(res, () => telegramResearch.search({ query, periodHours, limit, sources }));
  });

  app.post("/api/telegram-research/ai-search", telegramSetupGuard, async (req, res) => {
    const goal = String(req.body?.goal || "").trim();
    if (!goal) return res.status(400).json({ error: "AI_SEARCH_GOAL_REQUIRED" });
    if (goal.length > 500) return res.status(400).json({ error: "AI_SEARCH_GOAL_TOO_LONG" });

    const requestedPeriodHours = Number(req.body?.periodHours || 168);
    const requestedLimit = Number(req.body?.limit || 30);
    const periodHours = Math.max(1, Math.min(24 * 365, Number.isFinite(requestedPeriodHours) ? requestedPeriodHours : 168));
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 30));
    const languages = Array.isArray(req.body?.languages) ? req.body.languages.slice(0, 6) : ["auto"];
    const preview = Boolean(req.body?.preview);

    if (preview) {
      await runTelegramSetupAction(res, () => planTelegramQueries({
        provider,
        goal,
        languages,
        model: policy.openaiChatModel,
      }));
      return;
    }

    await runTelegramSetupAction(res, () => runTelegramAiSearch({
      provider,
      telegramResearch,
      goal,
      languages,
      periodHours,
      limit,
      model: policy.openaiChatModel,
    }));
  });

  app.post("/telegram/webhook", async (req, res) => {
    const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET || "";
    const receivedSecret = req.get("x-telegram-bot-api-secret-token") || "";
    if (expectedSecret && receivedSecret !== expectedSecret) {
      log.warn({
        traceId: null,
        reasonCode: "WEBHOOK_SECRET_INVALID",
        conversationId: null,
        messageId: null,
        userId: null,
      });
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    try {
      const message = telegram.normalizeUpdate(req.body);
      if (!message) {
        log.warn({
          traceId: null,
          reasonCode: "NORMALIZATION_FAILED",
          conversationId: null,
          messageId: null,
          userId: null,
        });
        return;
      }

      const route = classifyTelegramMessage(message, { botUserId: env.TELEGRAM_BOT_USER_ID || null });
      const event = buildNormalizedEvent(message, { ownerUserId: policy.ownerUserId });

      if (route.action !== "REPLY") {
        log.info({
          traceId: event.traceId,
          reasonCode: route.reason,
          conversationId: event.conversationId,
          messageId: event.messageId,
          userId: event.userId,
        });
        return;
      }

      const owner = checkOwner(event, policy.ownerUserId);
      if (!owner.allowed) {
        log.warn({
          traceId: event.traceId,
          reasonCode: owner.reasonCode,
          conversationId: event.conversationId,
          messageId: event.messageId,
          userId: event.userId,
        });
        return;
      }

      const safetyResult = await runSafetyPipeline(
        { dedupeStore: dedupe, reservationStore: reservation, cooldownStore: cooldown, logger: log },
        event
      );
      if (safetyResult.action !== "SAFE_STOP") return;

      await assistant.run(event);
    } catch (error) {
      log.error({
        traceId: null,
        reasonCode: "UNCAUGHT_WEBHOOK_ERROR",
        conversationId: null,
        messageId: null,
        userId: null,
        extra: { error: error?.message || String(error) },
      });
    }
  });

  return {
    app,
    policy,
    logger: log,
    telegramAdapter: telegram,
    redisClient: redis,
    dedupeStore: dedupe,
    reservationStore: reservation,
    cooldownStore: cooldown,
    conversationStore: memory,
    aiEngine: engine,
    publisher: telegramPublisher,
    skillRegistry: skills,
    assistantPipeline: assistant,
    telegramResearch,
  };
}

async function start() {
  const { app, logger, redisClient, telegramAdapter } = createApp();

  try {
    await redisClient.connect();
  } catch (err) {
    logger.critical({
      traceId: null,
      reasonCode: "REDIS_UNAVAILABLE",
      conversationId: null,
      messageId: null,
      userId: null,
      extra: { stage: "startup", error: err.message },
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, async () => {
    logger.info({
      traceId: null,
      reasonCode: "SERVER_STARTED",
      conversationId: null,
      messageId: null,
      userId: null,
      extra: { port },
    });

    const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (process.env.TELEGRAM_BOT_TOKEN && publicBaseUrl) {
      try {
        const bot = await telegramAdapter.getMe();
        logger.info({
          traceId: null,
          reasonCode: "TELEGRAM_BOT_READY",
          conversationId: null,
          messageId: null,
          userId: null,
          extra: { botId: bot?.id || null, username: bot?.username || null },
        });
        const webhookUrl = `${publicBaseUrl}/telegram/webhook`;
        await telegramAdapter.setWebhook({
          url: webhookUrl,
          secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || null,
        });
        logger.info({
          traceId: null,
          reasonCode: "TELEGRAM_WEBHOOK_SET",
          conversationId: null,
          messageId: null,
          userId: null,
          extra: { webhookUrl },
        });
      } catch (err) {
        logger.error({
          traceId: null,
          reasonCode: "TELEGRAM_WEBHOOK_SETUP_FAILED",
          conversationId: null,
          messageId: null,
          userId: null,
          extra: { error: err?.message || String(err) },
        });
      }
    }
  });
}

if (require.main === module) start();

module.exports = { createApp, start };
