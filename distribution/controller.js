const { createHash } = require("node:crypto");
const { createDistributionHubClient } = require("../connectors/distributionHubClient");
const { miniAppUrl } = require("../telegram/ownerNavigation");
const { createLinkHealth } = require("./linkHealth");

function createDistributionController({ redis, stateStore, telegram, env = process.env, client, clock = () => Date.now() }) {
  const state=stateStore||redis;
  const hub = client || createDistributionHubClient({ env });
  const subteam = env.DISTRIBUTION_SUBTEAM_ENABLED === "true" && !env.DISTRIBUTION_API_PREFIX ? createDistributionController({redis,stateStore,telegram,env:{...env,DISTRIBUTION_SUBTEAM_ENABLED:"false",DISTRIBUTION_HUB_PROJECT_ID:"subteam",DISTRIBUTION_API_PREFIX:"/api/distribution/subteam",DISTRIBUTION_YOUTUBE_ENABLED:"false"},clock}) : null;
  const apiPrefix=env.DISTRIBUTION_API_PREFIX || "/api/distribution";
  const ownerId = String(env.TELEGRAM_OWNER_ID || "");
  const namespace = `astel:distribution:v1:${hub.projectId}`;
  let initialization;
  async function ensureState(){if(state?.init){if(!initialization)initialization=state.init().catch(()=>{initialization=undefined;throw Error('DISTRIBUTION_STATE_UNAVAILABLE');});await initialization;}}
  const active = () => hub.enabled() && Boolean(ownerId && env.TELEGRAM_WEBHOOK_SECRET && state && (!state.isConfigured || state.isConfigured()));
  const safeError = res => res.status(503).json({ error: "DISTRIBUTION_UNAVAILABLE" });
  const videoEnabled = () => hub.projectId === 'copilot' && env.VIDEO_WORKSPACE_ENABLED === 'true';
  function panelUrl(options = {}) { return miniAppUrl(env.PUBLIC_BASE_URL, { distribution: true, project: hub.projectId, ...options }); }
  function openButton({ video = false, planId } = {}) {
    const url = panelUrl(); if (!url) return null;
    const queue = [{ text: 'Открыть очередь и согласования', web_app: { url } }];
    const videos = videoEnabled() ? [{ text: 'Видеочерновики и правки', web_app: { url: panelUrl({ video: true, planId }) } }] : null;
    const rows = video && videos ? [videos, queue] : [queue, ...(videos ? [videos] : [])];
    if (subteam) rows.push([{ text: 'ASAP Team · согласования', web_app: { url: miniAppUrl(env.PUBLIC_BASE_URL, { distribution: true, project: 'subteam' }) } }]);
    return { inline_keyboard: rows };
  }
  const health = createLinkHealth({ state, namespace, clock, notify: async recovered => {
    const project = hub.projectId === 'subteam' ? 'ASAP Team' : 'Astel';
    await telegram.sendMessage({ chatId: ownerId,
      text: recovered ? `${project}: очередь Hub снова доступна (две проверки подряд).` : `${project}: очередь Hub не прочитана после трёх проверок подряд. Повторим автоматически. Уже переданные в Buffer задания не отменяются.`,
      replyMarkup: openButton() });
  } });
  async function approve(planId, digest) {
    if (!/^[a-f0-9]{64}$/.test(planId || "") || !/^[a-f0-9]{64}$/.test(digest || "")) throw new Error("INVALID_APPROVAL");
    const plan = await hub.call("status", { planId });
    if (plan.id !== planId || plan.digest !== digest || plan.state !== "NEEDS_APPROVAL" ||
        plan.input.destinations.some(t => Date.parse(t.scheduledAt) <= clock())) throw new Error("APPROVAL_STALE");
    // Owner action only. This never calls schedule or publishes to a platform.
    return hub.call("approve", { planId, digest });
  }
  function mount(app, { webAppGuard }) {
    if(subteam)subteam.mount(app,{webAppGuard});
    const guard = (req, res, next) => {
      if (!active()) return res.status(503).json({ error: "DISTRIBUTION_DISABLED" });
      return webAppGuard(req, res, () => String(req.telegramMiniAppUser?.id) === ownerId ? next() : res.sendStatus(403));
    };
    app.get(`${apiPrefix}/features`, guard, (_req, res) => res.json({...(hub.projectId==='copilot'&&env.VIDEO_WORKSPACE_ENABLED==='true'?{videoWorkspace:true,videoApprovals:hub.approvalsEnabled()}:{}),youtubeRead:env.DISTRIBUTION_YOUTUBE_ENABLED === "true",youtubeAsapTeam:env.DISTRIBUTION_YOUTUBE_ASAP_TEAM_ENABLED === "true"}));
    app.post(`${apiPrefix}/video-workspace/:action`, guard, async(req,res)=>{
      if(hub.projectId!=='copilot'||env.VIDEO_WORKSPACE_ENABLED!=='true'||!hub.video)return res.sendStatus(404);
      const action=req.params.action,body=req.body;
      if(!['inbox','status','feedback'].includes(action)||!body||typeof body!=='object'||Array.isArray(body))return res.sendStatus(400);
      const allowed=action==='inbox'?[]:action==='status'?['planId']:['planId','digest','requestId','decision','note'];
      if(Object.keys(body).some(k=>!allowed.includes(k))||(action!=='inbox'&&!/^[a-f0-9]{64}$/.test(body.planId||'')))return res.sendStatus(400);
      if(action==='feedback'&&(!/^[a-f0-9]{64}$/.test(body.digest||'')||!['changes_requested','draft_accepted'].includes(body.decision)||typeof body.note!=='string'||body.note.length>2000||(body.decision==='changes_requested'&&!body.note.trim())||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.requestId||'')))return res.sendStatus(400);
      try{res.json(await hub.video(action,body));}catch(error){
        if([400,403,404,409,429].includes(error?.status))return res.status(error.status).json({error:'VIDEO_REQUEST_REJECTED'});
        safeError(res);
      }
    });
    app.get(`${apiPrefix}/youtube/:action`, guard, async (req, res) => {
      if(env.DISTRIBUTION_YOUTUBE_ENABLED !== "true")return res.sendStatus(404);
      const actions={account:"youtubeaccount",videos:"youtubevideos",analytics:"youtubeanalytics"};
      if(!Object.hasOwn(actions,req.params.action))return res.sendStatus(404);
      const args={};
      if(req.query.accountKey!==undefined){
        if(typeof req.query.accountKey!=="string"||!["family","asap-team"].includes(req.query.accountKey))return res.sendStatus(400);
        if(req.query.accountKey==="asap-team"&&env.DISTRIBUTION_YOUTUBE_ASAP_TEAM_ENABLED!=="true")return res.sendStatus(404);
        args.accountKey=req.query.accountKey;
      }
      if(req.params.action === "analytics"){
        for(const key of ["startDate","endDate"]){const value=req.query[key];if(typeof value!=="string"||!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return res.sendStatus(400);args[key]=value;}
        if(args.startDate>args.endDate)return res.sendStatus(400);
      }
      try{res.json(await hub.call(actions[req.params.action],args));}catch(_){safeError(res);}
    });
    app.get(`${apiPrefix}/inbox`, guard, async (req, res) => {
      try { res.json(await hub.call("inbox", { ...(req.query.cursor ? { cursor: String(req.query.cursor) } : {}) })); } catch (_) { safeError(res); }
    });
    app.get(`${apiPrefix}/metrics`, guard, async (_req, res) => {
      try { res.json(await hub.call("metrics")); } catch (_) { safeError(res); }
    });
    app.get(`${apiPrefix}/plans/:id`, guard, async (req, res) => {
      if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.sendStatus(400);
      try { res.json(await hub.call("status", { planId: req.params.id })); } catch (_) { safeError(res); }
    });
    app.post(`${apiPrefix}/approve`, guard, async (req, res) => {
      if (!hub.approvalsEnabled()) return res.status(503).json({ error: "DISTRIBUTION_APPROVAL_DISABLED" });
      try { res.json(await approve(req.body?.planId, req.body?.digest)); }
      catch (error) { if (["INVALID_APPROVAL", "APPROVAL_STALE"].includes(error.message)) return res.status(409).json({ error: error.message }); safeError(res); }
    });
  }
  async function handle(update) {
    const m = update?.message;
    const match = /^\/(distribution|canvas|video)(?:@\w+)?(?:\s|$)/i.exec(String(m?.text || ''));
    if (!match) return false;
    if (String(m.from?.id) !== ownerId || m.chat?.type !== 'private' || String(m.chat.id) !== ownerId) return true;
    // These navigation commands must never fall through to the paid chat skill.
    if (!state || !env.TELEGRAM_WEBHOOK_SECRET || (state.isConfigured && !state.isConfigured())) return true;
    await ensureState();
    const id = createHash('sha256').update(String(update.update_id ?? m.message_id)).digest('hex');
    if (!(await state.set(`${namespace}:command:${id}`, 'reserved', { NX: true }))) return true;
    const video = match[1].toLowerCase() === 'video';
    let text, focus;
    if (!active() || (video && !videoEnabled())) {
      text = 'Связка с видеочерновиками пока недоступна. Генерация и публикация не запускались.';
    } else {
      try {
        if (video) {
          const data = await hub.video('inbox', {});
          const items = Array.isArray(data.items) ? data.items.filter(item => item.latest) : [];
          focus = items[0]?.planId;
          text = ['Видеочерновики Astel', items.length ? `Текущих версий: ${items.length}` : 'Черновиков пока нет. Собери ролик в OpenReel и передай его на согласование.',
            ...items.slice(0, 5).map(item => `${String(item.card?.title || 'Видео').slice(0, 160)} · версия ${item.card?.revision} · ${item.state}`),
            '', 'Просмотр, замечания и точное согласование — в Canvas. Эта команда не публикует.'].join('\n');
        } else {
          const metrics = await hub.call('metrics');
          text = `Дистрибуция Astel\nВ очереди: ${metrics.pending}\nОшибки: ${metrics.failed}\nТребуют проверки: ${metrics.ambiguous}\nПодтверждено: ${metrics.confirmedSuccess}\n\nВидео и согласования доступны в Canvas.`;
        }
      } catch (_) { text = 'Не удалось прочитать очередь Hub. Повтори проверку позже. Новые решения не отправлены; уже переданные в Buffer задания могут продолжать выполняться.'; }
    }
    try { await telegram.sendMessage({ chatId: ownerId, text, replyMarkup: openButton({ video, planId: focus }) }); }
    catch (_) { await state.set(`${namespace}:command:${id}`, 'unconfirmed'); }
    return true;
  }
  let busy = false;
  async function pollOne() {
    if (!active() || busy) return { checked: 0 };
    busy = true;
    try {
      await ensureState();
      const cursorKey = `${namespace}:cursor`;
      const after = Number(await state.get(cursorKey) || 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new Error("INVALID_CURSOR");
      const data = await hub.call("events", { after });
      if (!Array.isArray(data.events) || data.events.length > 500) throw new Error("INVALID_EVENTS");
      let cursor = after;
      for (const event of data.events) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor || event.projectId !== hub.projectId) throw new Error("INVALID_EVENT_IDENTITY");
        if (["NEEDS_APPROVAL", "FAILED", "AMBIGUOUS_HOLD", "PUBLISHED", "CANCEL_REQUESTED", "CANCELLED"].includes(event.state)) {
          const key = `${namespace}:notice:${event.sequence}`;
          if (await state.set(key, JSON.stringify({ status: "reserved", planId: event.planId, state: event.state }), { NX: true })) {
            let outcome = "unconfirmed";
            try {
              const message = await telegram.sendMessage({ chatId: ownerId, text: `Дистрибуция · ${String(event.brandId).slice(0,100)}\nСтатус: ${event.state}\nМатериал: ${String(event.contentId).slice(0,200)}\nВерсия: ${event.revision}\n\nОткрой приложение для полного материала и решения.`, replyMarkup: openButton({ video: String(event.contentId || '').startsWith('astel-video:'), planId: event.planId }) });
              outcome = message?.message_id ? "sent" : "unconfirmed";
            } catch (_) {}
            await state.set(key, JSON.stringify({ status: outcome, planId: event.planId, state: event.state }));
          }
        }
        cursor = event.sequence;await state.set(cursorKey, String(cursor));
      }
      await health.healthy();
      return { checked: data.events.length, cursor };
    } catch (error) {
      try { await health.failed(); } catch (_) {}
      throw error;
    } finally { busy = false; }
  }
  async function poll(){
    if(!subteam)return pollOne();
    const results=await Promise.allSettled([pollOne(),subteam.poll()]);
    if(results.some(r=>r.status==='rejected'))throw Error('DISTRIBUTION_UNAVAILABLE');
    return {checked:results.reduce((n,r)=>n+r.value.checked,0)};
  }
  function start() {
    if (!active() || env.DISTRIBUTION_NOTIFICATIONS_ENABLED !== "true") return null;
    // Notifications only. Independent of Kevin; never scans due posts or schedules them.
    const timer = setInterval(() => poll().catch(() => {}), 60000);timer.unref();return timer;
  }
  return { mount, handle, poll, start, active };
}
module.exports = { createDistributionController };
