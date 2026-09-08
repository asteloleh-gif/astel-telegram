function stripCodeFence(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("```")) return value;
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeSeedList(value) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const item of input) {
    const keyword = String(item || "").trim().replace(/\s+/g, " ");
    const key = keyword.toLocaleLowerCase();
    if (!keyword || keyword.length > 160 || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= 20) break;
  }
  return result;
}

function parseSmartMatch(text, seeds) {
  let payload;
  try {
    payload = JSON.parse(stripCodeFence(text));
  } catch (_error) {
    throw new Error("SMART_MATCH_INVALID_JSON");
  }

  const seedList = normalizeSeedList(seeds);
  const byInput = new Map();
  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const input = String(item?.input || "").trim();
    if (!input) continue;
    const seed = seedList.find((candidate) => candidate.toLocaleLowerCase() === input.toLocaleLowerCase());
    if (!seed) continue;
    const variants = [];
    for (const raw of Array.isArray(item?.variants) ? item.variants : []) {
      const value = String(raw || "").trim().replace(/\s+/g, " ");
      if (!value || value.length > 160) continue;
      if (variants.some((existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase())) continue;
      variants.push(value);
      if (variants.length >= 3) break;
    }
    byInput.set(seed, variants);
  }

  const items = seedList.map((seed) => {
    const variants = [seed];
    for (const value of byInput.get(seed) || []) {
      if (!variants.some((existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase())) variants.push(value);
      if (variants.length >= 3) break;
    }
    return { input: seed, variants };
  });

  const searchKeywords = [];
  for (const item of items) {
    for (const value of item.variants) {
      if (!searchKeywords.some((existing) => existing.toLocaleLowerCase() === value.toLocaleLowerCase())) searchKeywords.push(value);
      if (searchKeywords.length >= 40) break;
    }
    if (searchKeywords.length >= 40) break;
  }

  return { items, searchKeywords };
}

async function buildSmartMatch({ provider, keywords, model = null } = {}) {
  if (!provider?.generate) throw new Error("AI_PROVIDER_REQUIRED");
  const seeds = normalizeSeedList(keywords);
  if (!seeds.length) throw new Error("SMART_MATCH_KEYWORDS_REQUIRED");

  const response = await provider.generate({
    model,
    reasoningEffort: "low",
    maxOutputTokens: 900,
    instructions: [
      "You are a conservative spelling and morphology normalizer for lexical Telegram search.",
      "The user already chose the search concepts. Do NOT broaden their meaning and do NOT invent business intent, synonyms, related products, or topical expansions.",
      "For every input keyword or phrase, return up to 2 useful variants in addition to the original when justified.",
      "Useful variants are ONLY: obvious typo correction, obvious wrong keyboard-layout or transliteration correction, and close grammatical or inflection forms that preserve the same lexical concept.",
      "Pay special attention to Ukrainian and Russian. Preserve the language unless the input itself is obvious transliteration or wrong keyboard layout.",
      "Never remove or replace the original input: the original query will always be searched too.",
      "If a term is already correct and no close lexical variant is useful, return only the original.",
      "Return JSON only: {\"items\":[{\"input\":\"...\",\"variants\":[\"...\"]}]}",
    ].join("\n"),
    input: JSON.stringify(seeds),
  });

  return {
    ...parseSmartMatch(response.text, seeds),
    model: response.model || model || null,
  };
}

module.exports = { normalizeSeedList, parseSmartMatch, buildSmartMatch };
