require("dotenv").config();
const express = require("express");
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
    createSystemSkill({ policy, conversationStore: memory, redisClient: redis }),
    createResearchSkill({ provider, conversationStore: memory, logger: log, policy }),
    createAIChatSkill({ aiEngine: engine, conversationStore: memory, logger: log, policy }),
  ]);
  const assistant = assistantPipeline || createAssistantPipeline({
    skillRegistry: skills,
    publisher: telegramPublisher,
    conversationStore: memory,
    logger: log,
  });

  const heartbeatKey = `${policy.redisNamespace}:health:heartbeat`;
  const app = express();
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
