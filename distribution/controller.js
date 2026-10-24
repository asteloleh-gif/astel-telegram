const { createHash } = require("node:crypto");
const { createDistributionHubClient } = require("../connectors/distributionHubClient");

function createDistributionController({ redis, stateStore, telegram, env = process.env, client, clock = () => Date.now() }) {
  const state=stateStore||redis;
  const hub = client || createDistributionHubClient({ env });
  const ownerId = String(env.TELEGRAM_OWNER_ID || "");
  const namespace = `astel:distribution:v1:${hub.projectId}`;
  let initialization;
  async function ensureState(){if(state?.init){if(!initialization)initialization=state.init().catch(()=>{initialization=undefined;throw Error('DISTRIBUTION_STATE_UNAVAILABLE');});await initialization;}}
  const active = () => hub.enabled() && Boolean(ownerId && env.TELEGRAM_WEBHOOK_SECRET && state && (!state.isConfigured || state.isConfigured()));
  const safeError = res => res.status(503).json({ error: "DISTRIBUTION_UNAVAILABLE" });
  function panelUrl() {
    try { const u = new URL(env.PUBLIC_BASE_URL); if (u.protocol !== "https:") return ""; u.pathname = "/"; u.search = "?distribution=1"; u.hash = ""; return u.toString(); } catch (_) { return ""; }
  }
  const openButton = () => panelUrl() ? { inline_keyboard: [[{ text: "Открыть очередь и согласования", web_app: { url: panelUrl() } }]] } : null;
  async function approve(planId, digest) {
    if (!/^[a-f0-9]{64}$/.test(planId || "") || !/^[a-f0-9]{64}$/.test(digest || "")) throw new Error("INVALID_APPROVAL");
    const plan = await hub.call("status", { planId });
    if (plan.id !== planId || plan.digest !== digest || plan.state !== "NEEDS_APPROVAL" ||
        plan.input.destinations.some(t => Date.parse(t.scheduledAt) <= clock())) throw new Error("APPROVAL_STALE");
    // Owner action only. This never calls schedule or publishes to a platform.
    return hub.call("approve", { planId, digest });
  }
  function mount(app, { webAppGuard }) {
    const guard = (req, res, next) => {
      if (!active()) return res.status(503).json({ error: "DISTRIBUTION_DISABLED" });
      return webAppGuard(req, res, () => String(req.telegramMiniAppUser?.id) === ownerId ? next() : res.sendStatus(403));
    };
    app.get("/api/distribution/features", guard, (_req, res) => res.json({youtubeRead:env.DISTRIBUTION_YOUTUBE_ENABLED === "true"}));
    app.get("/api/distribution/youtube/:action", guard, async (req, res) => {
      if(env.DISTRIBUTION_YOUTUBE_ENABLED !== "true")return res.sendStatus(404);
      const actions={account:"youtubeaccount",videos:"youtubevideos",analytics:"youtubeanalytics"};
      if(!Object.hasOwn(actions,req.params.action))return res.sendStatus(404);
      const args={};
      if(req.params.action === "analytics"){
        for(const key of ["startDate","endDate"]){const value=req.query[key];if(typeof value!=="string"||!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return res.sendStatus(400);args[key]=value;}
        if(args.startDate>args.endDate)return res.sendStatus(400);
      }
      try{res.json(await hub.call(actions[req.params.action],args));}catch(_){safeError(res);}
    });
    app.get("/api/distribution/inbox", guard, async (req, res) => {
      try { res.json(await hub.call("inbox", { ...(req.query.cursor ? { cursor: String(req.query.cursor) } : {}) })); } catch (_) { safeError(res); }
    });
    app.get("/api/distribution/metrics", guard, async (_req, res) => {
      try { res.json(await hub.call("metrics")); } catch (_) { safeError(res); }
    });
    app.get("/api/distribution/plans/:id", guard, async (req, res) => {
      if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.sendStatus(400);
      try { res.json(await hub.call("status", { planId: req.params.id })); } catch (_) { safeError(res); }
    });
    app.post("/api/distribution/approve", guard, async (req, res) => {
      if (!hub.approvalsEnabled()) return res.status(503).json({ error: "DISTRIBUTION_APPROVAL_DISABLED" });
      try { res.json(await approve(req.body?.planId, req.body?.digest)); }
      catch (error) { if (["INVALID_APPROVAL", "APPROVAL_STALE"].includes(error.message)) return res.status(409).json({ error: error.message }); safeError(res); }
    });
  }
  async function handle(update) {
    const m = update?.message;
    if (!/^\/distribution(?:@\w+)?(?:\s|$)/.test(String(m?.text || ""))) return false;
    if (!active() || String(m.from?.id) !== ownerId || m.chat?.type !== "private" || String(m.chat.id) !== ownerId) return true;
    await ensureState();
    const id = createHash("sha256").update(String(update.update_id ?? m.message_id)).digest("hex");
    if (!(await state.set(`${namespace}:command:${id}`, "reserved", { NX: true }))) return true;
    let text;
    try {const metrics = await hub.call("metrics");text = `Дистрибуция Astel\nВ очереди: ${metrics.pending}\nОшибки: ${metrics.failed}\nТребуют проверки: ${metrics.ambiguous}\nПодтверждено: ${metrics.confirmedSuccess}\n\nСогласование доступно в приложении.`;}
    catch (_) {text = "Связь с Hub недоступна. Новые решения не отправлены. Уже переданные в Buffer задания могут продолжать выполняться.";}
    try {
      await telegram.sendMessage({ chatId: ownerId, text, replyMarkup: openButton() });
    } catch (_) {
      // A lost send acknowledgement is not a reason to send the same command response again.
      await state.set(`${namespace}:command:${id}`, "unconfirmed");
    }
    return true;
  }
  let busy = false;
  async function poll() {
    if (!active() || busy) return { checked: 0 };
    busy = true;
    try {
      await ensureState();
      const cursorKey = `${namespace}:cursor`;
      const after = Number(await state.get(cursorKey) || 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new Error("INVALID_CURSOR");
      const data = await hub.call("events", { after });
      if (!Array.isArray(data.events) || data.events.length > 500) throw new Error("INVALID_EVENTS");
      const wasDown = await state.get(`${namespace}:down`);
      if(wasDown){
        // Reserve recovery before sending; a lost Telegram ack never causes blind replay.
        await state.del(`${namespace}:down`);
        try{await telegram.sendMessage({chatId:ownerId,text:"Связь Astel Telegram с Hub восстановлена.",replyMarkup:openButton()});}catch(_){}
      }
      let cursor = after;
      for (const event of data.events) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor || event.projectId !== hub.projectId) throw new Error("INVALID_EVENT_IDENTITY");
        if (["NEEDS_APPROVAL", "FAILED", "AMBIGUOUS_HOLD", "PUBLISHED", "CANCEL_REQUESTED", "CANCELLED"].includes(event.state)) {
          const key = `${namespace}:notice:${event.sequence}`;
          if (await state.set(key, JSON.stringify({ status: "reserved", planId: event.planId, state: event.state }), { NX: true })) {
            let outcome = "unconfirmed";
            try {
              const message = await telegram.sendMessage({ chatId: ownerId, text: `Дистрибуция · ${String(event.brandId).slice(0,100)}\nСтатус: ${event.state}\nМатериал: ${String(event.contentId).slice(0,200)}\nВерсия: ${event.revision}\n\nОткрой приложение для полного материала и решения.`, replyMarkup: openButton() });
              outcome = message?.message_id ? "sent" : "unconfirmed";
            } catch (_) {}
            await state.set(key, JSON.stringify({ status: outcome, planId: event.planId, state: event.state }));
          }
        }
        cursor = event.sequence;await state.set(cursorKey, String(cursor));
      }
      return { checked: data.events.length, cursor };
    } catch (error) {
      if(await state.set(`${namespace}:down`,"reserved",{NX:true})){
        try{await telegram.sendMessage({chatId:ownerId,text:"Связь Astel Telegram с Hub недоступна. Новые согласования приостановлены; существующие задания в Buffer не отменены.",replyMarkup:openButton()});}catch(_){}
      }
      throw error;
    } finally { busy = false; }
  }
  function start() {
    if (!active() || env.DISTRIBUTION_NOTIFICATIONS_ENABLED !== "true") return null;
    // Notifications only. Independent of Kevin; never scans due posts or schedules them.
    const timer = setInterval(() => poll().catch(() => {}), 60000);timer.unref();return timer;
  }
  return { mount, handle, poll, start, active };
}
module.exports = { createDistributionController };
