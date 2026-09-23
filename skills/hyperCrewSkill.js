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
      const run = await client.startRun(created.id);
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

module.exports = { createHyperCrewSkill, parseCrewCommand, formatApproval };
