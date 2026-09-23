function parseCrewCommand(event) {
  const text = String(event?.text || "").trim();
  const match = text.match(/^\/(?:crew|team)(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const raw = String(match[1] || "").trim();
  if (!raw) return { projectId: null, objective: "" };
  const parts = raw.split(/\s+/);
  const aliases = {
    astel: "astel-business",
    business: "astel-business",
    "astel-business": "astel-business",
    battle: "battle-box",
    battlebox: "battle-box",
    "battle-box": "battle-box",
  };
  const projectId = aliases[parts[0].toLowerCase()] || "astel-business";
  const objective = aliases[parts[0].toLowerCase()] ? parts.slice(1).join(" ") : raw;
  return { projectId, objective };
}

function formatApproval(run, miniAppUrl = "") {
  const variants = run?.approval?.package?.draft?.variants || [];
  const preview = variants.slice(0, 2).map((variant, index) => {
    const text = String(variant?.text || "").trim();
    return `${index + 1}. ${variant?.platform || "content"}: ${text.slice(0, 700)}${text.length > 700 ? "…" : ""}`;
  });
  const destinations = run?.approval?.package?.distributionPlan?.destinations || [];
  const lines = [
    "Hyper Crew подготовил пакет ✅",
    `Проект: ${run.projectId}`,
    `Статус: ${run.status}`,
    `Run: ${run.id}`,
    `Команда: ${run.stages?.length || 0} этапов · ${run.usage?.totalTokens || 0} токенов`,
    ...(preview.length ? ["", ...preview] : []),
    ...(destinations.length ? ["", `Distribution: ${destinations.map(item => item.platform).join(", ")}`] : []),
    "",
    "Нужна ручная проверка. Публикация не выполнялась.",
  ];
  const url = String(miniAppUrl || "").trim().replace(/\/+$/, "");
  return {
    text: lines.join("\n").slice(0, 3950),
    replyMarkup: url ? { inline_keyboard: [[{ text: "🧠 Проверить в Hyper Crew", web_app: { url: `${url}?crewRun=${encodeURIComponent(run.id)}` } }]] } : null,
  };
}

function formatFailure(run, miniAppUrl = "") {
  const review = run?.outputs?.reviewer || {};
  const code = run?.error?.message || "UNKNOWN_ERROR";
  const explanations = {
    CONTENT_REVIEW_REVISE: "Reviewer запросил повторную доработку. Автоматический цикл остановлен, чтобы не сжигать бюджет.",
    CONTENT_REVIEW_REJECT: "Reviewer отклонил пакет как неподходящий или недостаточно подтверждённый.",
  };
  const instructions = Array.isArray(review.revisionInstructions) ? review.revisionInstructions : [];
  const lines = [
    "Hyper Crew остановил задачу ⚠️",
    `Проект: ${run?.projectId || "unknown"}`,
    `Статус: ${run?.status || "FAILED"}`,
    `Run: ${run?.id || "unknown"}`,
    `Команда: ${run?.stages?.length || 0} этапов · ${run?.usage?.totalTokens || 0} токенов`,
    "",
    explanations[code] || `Ошибка: ${code}`,
    ...(review.notes ? ["", `Reviewer: ${review.notes}`] : []),
    ...(instructions.length ? ["", "Что исправить:", ...instructions.slice(0, 5).map(item => `• ${item}`)] : []),
    "",
    "Ничего не опубликовано.",
  ];
  const url = String(miniAppUrl || "").trim().replace(/\/+$/, "");
  return {
    text: lines.join("\n").slice(0, 3950),
    replyMarkup: url && run?.id ? { inline_keyboard: [[{ text: "🧠 Открыть run", web_app: { url: `${url}?crewRun=${encodeURIComponent(run.id)}` } }]] } : null,
  };
}

function createHyperCrewSkill({ client, miniAppUrl = "", logger } = {}) {
  if (!client) throw new Error("hyperCrewSkill requires client");
  return {
    id: "hyper-crew",
    canHandle: event => Boolean(parseCrewCommand(event)),
    async handle(event) {
      const parsed = parseCrewCommand(event);
      if (!parsed.objective) {
        return {
          text: [
            "Hyper Crew готов принять задачу.",
            "/crew <задача> — Astel Business",
            "/crew battle <задача> — Battle Box",
            "",
            "Команда: Researcher → Strategist → Copywriter → Reviewer → Distribution Manager → твоё одобрение.",
          ].join("\n"),
          rememberAssistant: false,
        };
      }
      const idempotencyKey = `telegram:${event.updateId || `${event.conversationId}:${event.messageId}`}`;
      const created = await client.createRun({
        projectId: parsed.projectId,
        objective: parsed.objective,
        idempotencyKey,
        requestedBy: `telegram:${event.userId || "owner"}`,
        input: { source: "astel-assistant", conversationId: event.conversationId },
      });
      let run;
      try {
        run = await client.startRun(created.id);
      } catch (error) {
        const failedRun = await client.getRun(created.id).catch(() => null);
        if (!failedRun || failedRun.status !== "FAILED") throw error;
        logger?.warn?.({
          traceId: event.traceId,
          reasonCode: "HYPER_CREW_RUN_FAILED",
          conversationId: event.conversationId,
          messageId: event.messageId,
          userId: event.userId,
          extra: { runId: failedRun.id, projectId: failedRun.projectId, error: failedRun.error?.message || error.message },
        });
        return { ...formatFailure(failedRun, miniAppUrl), rememberAssistant: false };
      }
      logger?.info?.({
        traceId: event.traceId,
        reasonCode: "HYPER_CREW_RUN_READY",
        conversationId: event.conversationId,
        messageId: event.messageId,
        userId: event.userId,
        extra: { runId: run.id, projectId: run.projectId, status: run.status },
      });
      return { ...formatApproval(run, miniAppUrl), rememberAssistant: false };
    },
  };
}

module.exports = { createHyperCrewSkill, parseCrewCommand, formatApproval, formatFailure };
