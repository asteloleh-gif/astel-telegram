const fs = require("node:fs");
const path = require("node:path");

function normalizeSource(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("SOURCE_REQUIRED");
  if (/^https?:\/\/(?:www\.)?t\.me\/\+/i.test(raw)) throw new Error("PRIVATE_INVITE_NOT_SUPPORTED");

  let source = raw
    .replace(/^https?:\/\/(?:www\.)?t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .trim();

  if (source.includes("/")) source = source.split("/")[0];
  if (!/^[A-Za-z0-9_]{5,32}$/.test(source)) throw new Error("INVALID_TELEGRAM_SOURCE");
  return `@${source}`;
}

function createSourceStore({ file, seedSources = [] } = {}) {
  let memory = [];

  function readFileSources() {
    if (!file) return [];
    try {
      if (!fs.existsSync(file)) return [];
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function persist(items) {
    memory = items;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(items, null, 2)}\n`, { mode: 0o600 });
  }

  function hydrate() {
    const bySource = new Map();
    const existing = readFileSources();

    for (const entry of existing) {
      try {
        const source = normalizeSource(entry?.source || entry);
        bySource.set(source.toLowerCase(), {
          source,
          title: entry?.title || null,
          username: entry?.username || source.slice(1),
          chatId: entry?.chatId != null ? String(entry.chatId) : null,
          type: entry?.type || null,
          status: entry?.status || "connected",
          addedAt: entry?.addedAt || new Date().toISOString(),
        });
      } catch (_error) {}
    }

    for (const raw of seedSources) {
      try {
        const source = normalizeSource(raw);
        const key = source.toLowerCase();
        if (!bySource.has(key)) {
          bySource.set(key, {
            source,
            title: null,
            username: source.slice(1),
            chatId: null,
            type: null,
            status: "seeded",
            addedAt: new Date().toISOString(),
          });
        }
      } catch (_error) {}
    }

    memory = [...bySource.values()];
    if (file && !fs.existsSync(file) && memory.length) persist(memory);
    return memory;
  }

  function list() {
    return [...memory];
  }

  function add(entry) {
    const source = normalizeSource(entry?.source || entry);
    const key = source.toLowerCase();
    const existing = memory.find((item) => item.source.toLowerCase() === key);
    if (existing) return { created: false, item: existing };

    const item = {
      source,
      title: entry?.title || null,
      username: entry?.username || source.slice(1),
      chatId: entry?.chatId != null ? String(entry.chatId) : null,
      type: entry?.type || null,
      status: entry?.status || "connected",
      addedAt: new Date().toISOString(),
    };
    persist([...memory, item]);
    return { created: true, item };
  }

  function remove(value) {
    const source = normalizeSource(value);
    const next = memory.filter((item) => item.source.toLowerCase() !== source.toLowerCase());
    const removed = next.length !== memory.length;
    if (removed) persist(next);
    return removed;
  }

  hydrate();
  return { list, add, remove, normalizeSource };
}

module.exports = { createSourceStore, normalizeSource };
