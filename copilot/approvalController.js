const { timingSafeEqual } = require("node:crypto");
const { createApprovalQueue } = require("./approvalQueue");

function createApprovalController({ redis, telegram, env }) {
  const enabled = env.COPILOT_APPROVAL_ENABLED === "true";
  const ownerId = String(env.TELEGRAM_OWNER_ID || "");
  const queue = createApprovalQueue({ redis });
  // One independent credential per producer/account; an RU producer cannot submit EN.
  let accounts = {};
  try {
    const parsed = JSON.parse(env.COPILOT_ACCOUNT_KEYS_JSON || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) accounts = parsed;
  } catch (_) {}
  const submissionCooldownSeconds = Math.max(1, Number(env.COPILOT_SUBMISSION_COOLDOWN_SECONDS || 10));
  const active = () => enabled && Boolean(ownerId && env.TELEGRAM_WEBHOOK_SECRET);
  function editorUrl(draftId) {
    try {
      const url = new URL(String(env.PUBLIC_BASE_URL || ""));
      if (url.protocol !== "https:") return "";
      url.pathname = "/";
      url.search = new URLSearchParams({ copilotDraft: draftId }).toString();
      url.hash = "";
      return url.toString();
    } catch (_) { return ""; }
  }
  function authenticate(req) {
    const account = String(req.get("x-copilot-account") || "");
    const secret = Object.hasOwn(accounts, account) ? accounts[account] : null;
    const supplied = Buffer.from(String(req.get("authorization") || ""));
    if (typeof secret !== "string" || secret.length < 32) return null;
    const expected = Buffer.from(`Bearer ${secret}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? account : null;
  }
  async function report(account, input) {
    const safeInteger = (value, max = 1000000) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
    };
    const scanned = safeInteger(input?.scanned);
    const fresh = safeInteger(input?.fresh);
    const eligible = safeInteger(input?.eligible);
    const evaluated = safeInteger(input?.evaluated);
    const submitted = safeInteger(input?.submitted, 100);
    const aiTokens = safeInteger(input?.aiTokens, 10000000);
    if ([scanned, fresh, eligible, evaluated, submitted, aiTokens].some(value => value === null)) throw new Error("INVALID_REPORT");
    const status = String(input?.status || "ok").slice(0, 30);
    const reason = String(input?.reason || "").replace(/[\r\n]+/g, " ").slice(0, 80);
    await telegram.sendMessage({
      chatId: ownerId,
      text: `Copilot · ${account.toUpperCase()} · цикл завершён\n` +
        `Просмотрено: ${scanned}\nНовых: ${fresh}\nПосле фильтра: ${eligible}\n` +
        `GPT оценил: ${evaluated}\nЧерновиков: ${submitted}\nGPT: ${aiTokens} токенов\n` +
        `${status === "ok" ? "Следующий запуск: через 4 часа" : `Статус: ${status}${reason ? ` · ${reason}` : ""}`}`,
    });
  }
  async function notify(draft) {
    if (!(await queue.reserveNotification(draft.id))) return "already_reserved";
    try {
      const editUrl = editorUrl(draft.id);
      await telegram.sendMessage({ chatId: ownerId,
        text: `Threads · ${draft.account} · ${draft.language}\n${draft.permalink ? `Пост: ${draft.permalink}` : `Пост ID: ${draft.postId}`}\n\n${draft.sourceText}\n\nЧерновик:\n${draft.text}`,
        replyMarkup: { inline_keyboard: [[
          { text: "Одобрить", callback_data: `cp:a:${draft.id}` },
          editUrl ? { text: "Изменить", web_app: { url: editUrl } } : { text: "Изменить", callback_data: `cp:e:${draft.id}` },
          { text: "Пропустить", callback_data: `cp:s:${draft.id}` },
        ]] },
      });
      return "sent";
    } catch (_) {
      return "unconfirmed";
    }
  }
  function mount(app, { webAppGuard } = {}) {
    app.post("/api/copilot/reports", async (req, res) => {
      if (!active()) return res.status(503).json({ error: "COPILOT_DISABLED" });
      const account = authenticate(req);
      if (!account) return res.sendStatus(401);
      try {
        await report(account, req.body);
        return res.status(201).json({ status: "sent" });
      } catch (error) {
        return res.status(error.message === "INVALID_REPORT" ? 400 : 503).json({ error: error.message === "INVALID_REPORT" ? "INVALID_REPORT" : "TELEGRAM_UNAVAILABLE" });
      }
    });
    app.post("/api/copilot/drafts", async (req, res) => {
      if (!active()) return res.status(503).json({ error: "COPILOT_DISABLED" });
      const account = authenticate(req);
      if (!account) return res.sendStatus(401);
      try {
        if (!(await queue.reserveSubmission(account, submissionCooldownSeconds))) {
          res.set("retry-after", String(submissionCooldownSeconds));
          return res.status(429).json({ error: "SUBMISSION_COOLDOWN" });
        }
        const { draft, created } = await queue.submit({ ...req.body, account });
        const notification = await notify(draft);
        return res.status(notification === "unconfirmed" ? 202 : (created ? 201 : 200)).json({ id: draft.id, created, notification });
      } catch (error) {
        return res.status(error.message === "INVALID_DRAFT" ? 400 : 503).json({ error: error.message === "INVALID_DRAFT" ? "INVALID_DRAFT" : "STORE_UNAVAILABLE" });
      }
    });
    app.get("/api/copilot/drafts/:id", async (req, res) => {
      if (!active()) return res.status(503).json({ error: "COPILOT_DISABLED" });
      const account = authenticate(req);
      if (!account) return res.sendStatus(401);
      try {
        const draft = await queue.get(req.params.id);
        if (!draft || draft.account !== account) return res.sendStatus(404);
        return res.json({ draft, decision: await queue.decision(draft.id) });
      } catch (_) { return res.status(503).json({ error: "STORE_UNAVAILABLE" }); }
    });
    if (typeof webAppGuard === "function") {
      app.get("/api/copilot/editor/:id", webAppGuard, async (req, res) => {
        if (!active()) return res.status(503).json({ error: "COPILOT_DISABLED" });
        try {
          const draft = await queue.get(req.params.id);
          if (!draft || draft.expiresAt <= Date.now()) return res.status(404).json({ error: "DRAFT_EXPIRED" });
          if (await queue.decision(draft.id)) return res.status(409).json({ error: "DRAFT_ALREADY_DECIDED" });
          return res.json({ draft });
        } catch (_) { return res.status(503).json({ error: "STORE_UNAVAILABLE" }); }
      });
      app.post("/api/copilot/editor/:id", webAppGuard, async (req, res) => {
        if (!active()) return res.status(503).json({ error: "COPILOT_DISABLED" });
        try {
          const result = await queue.reviseById(req.params.id, ownerId, req.body?.text);
          if (result.status === "invalid") return res.status(400).json({ error: "INVALID_DRAFT_TEXT" });
          if (result.status === "expired") return res.status(404).json({ error: "DRAFT_EXPIRED" });
          if (result.status === "already_decided") return res.status(409).json({ error: "DRAFT_ALREADY_DECIDED" });
          if (result.status === "revised") await notify(result.draft);
          return res.json({ status: result.status, id: result.draft.id });
        } catch (_) { return res.status(503).json({ error: "STORE_UNAVAILABLE" }); }
      });
    }
  }
  async function handle(update) {
    const callback = update?.callback_query;
    if (callback?.data?.startsWith("cp:")) {
      if (!active() || String(callback.from?.id) !== ownerId ||
          callback.message?.chat?.type !== "private" || String(callback.message?.chat?.id) !== ownerId) return true;
      const match = /^cp:([aes]):([a-f0-9]{32})$/.exec(callback.data);
      if (!match) return true;
      const result = match[1] === "e"
        ? await queue.beginEdit(match[2], ownerId)
        : await queue.decide(match[2], match[1] === "a" ? "approved" : "skipped", ownerId);
      await telegram.answerCallbackQuery({ callbackQueryId: callback.id,
        text: result.status === "approved" ? "Одобрение сохранено" :
          result.status === "skipped" ? "Пропущено" :
          result.status === "editing" ? "Пришли исправленный текст следующим сообщением" :
          "Решение уже принято или черновик истёк" });
      return true;
    }
    const message = update?.message;
    if (!active() || String(message?.from?.id) !== ownerId || message?.chat?.type !== "private" ||
        String(message?.chat?.id) !== ownerId || !(await queue.pendingEdit(ownerId))) return false;
    const text = String(message.text || "").trim();
    if (!text || [...text].length > 500) {
      await telegram.sendMessage({ chatId: ownerId, text: "Пришли новый текст одним сообщением, до 500 символов." });
      return true;
    }
    const result = await queue.revise(ownerId, text);
    if (result.status === "revised") await notify(result.draft);
    else if (result.status === "unchanged") await telegram.sendMessage({ chatId: ownerId, text: "Текст не изменился. Старые кнопки остаются активными." });
    else await telegram.sendMessage({ chatId: ownerId, text: "Черновик уже обработан или истёк." });
    return true;
  }
  async function sendTest() {
    if (!active()) return { status: "disabled" };
    const { draft } = await queue.submit({
      account: "test",
      postId: String(Date.now()),
      language: "ru",
      sourceText: "ТЕСТОВЫЙ ПОСТ: предприниматель рассказал, как автоматизация помогла освободить время для работы с клиентами.",
      text: "Интересный пример. А какой процесс дал самый заметный результат после автоматизации?",
    });
    return { status: await notify(draft), id: draft.id };
  }
  return { mount, handle, sendTest };
}
module.exports = { createApprovalController };
