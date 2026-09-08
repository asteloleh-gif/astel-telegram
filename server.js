require("dotenv").config();
const express = require("express");
const { createTelegramAdapter } = require("./adapters/telegramAdapter");
const { classifyTelegramMessage } = require("./router/telegramRouter");
const { loadPolicy } = require("./config/policy");

const app = express();
app.use(express.json({ limit: "1mb" }));

const policy = loadPolicy();
const telegram = createTelegramAdapter();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astel-telegram",
    version: "0.1.0",
    botEnabled: String(process.env.BOT_ENABLED || "false").toLowerCase() === "true",
    dryRun: String(process.env.BOT_DRY_RUN || "true").toLowerCase() === "true",
    policy,
  });
});

app.post("/telegram/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = telegram.normalizeUpdate(req.body);
    const route = classifyTelegramMessage(message, { botUserId: process.env.TELEGRAM_BOT_USER_ID || null });

    console.log("Telegram route", JSON.stringify({
      updateId: message?.updateId || null,
      messageId: message?.messageId || null,
      chatId: message?.chatId || null,
      action: route.action,
      reason: route.reason,
      conversationKey: route.conversationKey || null,
    }));

    if (route.action !== "REPLY") return;
    if (String(process.env.BOT_ENABLED || "false").toLowerCase() !== "true") return;
    if (String(process.env.BOT_DRY_RUN || "true").toLowerCase() === "true") return;

    // AI + safety pipeline will be wired in the next implementation step.
    // No automatic publish occurs until that pipeline is connected and tested.
  } catch (error) {
    console.error("Telegram webhook error", JSON.stringify({ error: error?.message || String(error) }));
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Astel Telegram listening on ${port}`));
