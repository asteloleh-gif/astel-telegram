const LANGUAGE_LABELS = {
  uk: "Ukrainian",
  ru: "Russian",
  en: "English",
  pl: "Polish",
  de: "German",
  zh: "Simplified Chinese",
};

const ALLOWED_LANGUAGES = new Set(["auto", ...Object.keys(LANGUAGE_LABELS)]);

function normalizeLanguages(value) {
  const list = Array.isArray(value) ? value : [value || "auto"];
  const normalized = [];
  for (const item of list) {
    const code = String(item || "").trim().toLowerCase();
    if (!ALLOWED_LANGUAGES.has(code) || normalized.includes(code)) continue;
    normalized.push(code);
  }
  return normalized.length ? normalized.slice(0, 6) : ["auto"];
}

function stripCodeFence(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parsePlan(text) {
  let payload;
  try {
    payload = JSON.parse(stripCodeFence(text));
  } catch (_error) {
    throw new Error("AI_QUERY_PLAN_INVALID_JSON");
  }

  const languages = Array.isArray(payload?.languages)
    ? payload.languages.map((item) => String(item || "").toLowerCase()).filter((item) => LANGUAGE_LABELS[item])
    : [];

  const queries = [];
  for (const item of payload?.queries || []) {
    const query = String(item?.query || "").trim().replace(/\s+/g, " ");
    const language = String(item?.language || "").trim().toLowerCase();
    if (!query || query.length > 160 || !LANGUAGE_LABELS[language]) continue;
    if (queries.some((entry) => entry.query.toLowerCase() === query.toLowerCase())) continue;
    queries.push({ language, query });
    if (queries.length >= 12) break;
  }

  if (!queries.length) throw new Error("AI_QUERY_PLAN_EMPTY");
  return {
    languages: languages.length ? [...new Set(languages)] : [...new Set(queries.map((item) => item.language))],
    queries,
  };
}

async function planTelegramQueries({ provider, goal, languages = ["auto"], model = null } = {}) {
  if (!provider?.generate) throw new Error("AI_PROVIDER_REQUIRED");
  const normalizedGoal = String(goal || "").trim();
  if (!normalizedGoal) throw new Error("AI_SEARCH_GOAL_REQUIRED");

  const requested = normalizeLanguages(languages);
  const languageInstruction = requested.includes("auto")
    ? "Choose 3-5 useful languages for this goal from: uk, ru, en, pl, de, zh."
    : `Use only these language codes: ${requested.join(", ")}.`;

  const response = await provider.generate({
    model,
    reasoningEffort: "low",
    maxOutputTokens: 900,
    instructions: [
      "You build concise Telegram keyword searches for business research.",
      "Telegram search is lexical, so produce phrases people are likely to actually write in messages.",
      "Include synonyms and intent phrases where useful, not long natural-language questions.",
      "Generate at most 2 strong queries per language and no more than 12 total.",
      languageInstruction,
      "Return JSON only, no markdown: {\"languages\":[\"uk\"],\"queries\":[{\"language\":\"uk\",\"query\":\"...\"}]}",
    ].join("\n"),
    input: normalizedGoal,
  });

  return {
    goal: normalizedGoal,
    ...parsePlan(response.text),
    model: response.model || model || null,
  };
}

function resultKey(item) {
  if (item?.url) return `url:${item.url}`;
  const source = item?.chatUsername || item?.chatTitle || item?.chatId || "telegram";
  if (item?.messageId) return `${source}:${item.messageId}`;
  return `${source}:${item?.date || ""}:${String(item?.text || "").slice(0, 180)}`;
}

async function runTelegramAiSearch({
  provider,
  telegramResearch,
  goal,
  languages = ["auto"],
  periodHours = 168,
  limit = 30,
  model = null,
} = {}) {
  if (!telegramResearch?.search) throw new Error("TELEGRAM_RESEARCH_REQUIRED");
  const plan = await planTelegramQueries({ provider, goal, languages, model });
  const finalLimit = Math.max(1, Math.min(50, Number(limit) || 30));
  const perQueryLimit = Math.max(4, Math.min(10, Math.ceil(finalLimit / Math.max(1, plan.queries.length)) + 2));
  const merged = new Map();
  const errors = [];
  const sources = new Set();

  for (const entry of plan.queries) {
    try {
      const payload = await telegramResearch.search({
        query: entry.query,
        periodHours,
        limit: perQueryLimit,
      });
      for (const source of payload?.sources || []) sources.add(source);
      for (const item of payload?.results || []) {
        const key = resultKey(item);
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { ...item, matchedQueries: [entry.query], matchedLanguages: [entry.language] });
        } else {
          if (!existing.matchedQueries.includes(entry.query)) existing.matchedQueries.push(entry.query);
          if (!existing.matchedLanguages.includes(entry.language)) existing.matchedLanguages.push(entry.language);
        }
      }
      for (const error of payload?.errors || []) {
        errors.push({ query: entry.query, source: error.source || null, error: error.error || "SEARCH_FAILED" });
      }
    } catch (error) {
      errors.push({ query: entry.query, source: null, error: error?.message || "SEARCH_FAILED" });
    }
  }

  const results = [...merged.values()]
    .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime())
    .slice(0, finalLimit);

  return {
    goal: plan.goal,
    languages: plan.languages,
    queries: plan.queries,
    sources: [...sources],
    count: results.length,
    results,
    errors: errors.slice(0, 30),
    model: plan.model,
  };
}

module.exports = {
  LANGUAGE_LABELS,
  normalizeLanguages,
  parsePlan,
  planTelegramQueries,
  runTelegramAiSearch,
};
