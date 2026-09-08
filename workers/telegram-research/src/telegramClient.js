const { TelegramClient } = require("teleproto");
const { StringSession } = require("teleproto/sessions");

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeSourceUsername(source) {
  return String(source || "").replace(/^@/, "").trim();
}

function normalizeMessage(message, source, entity) {
  const username = entity?.username || normalizeSourceUsername(source) || null;
  const id = message?.id != null ? Number(message.id) : null;
  const date = toIsoDate(message?.date);
  const chatId = entity?.id != null ? String(entity.id) : null;
  const title = entity?.title || entity?.firstName || entity?.username || source;
  const text = String(message?.message || message?.text || "").trim();
  const url = username && id ? `https://t.me/${username}/${id}` : null;

  return {
    source: "telegram",
    messageId: id,
    text,
    chatId,
    chatTitle: title || null,
    chatUsername: username || null,
    date,
    url,
  };
}

function createTelegramResearchClient(config) {
  let client = null;
  let connected = false;
  let authorized = false;
  let account = null;

  function isConfigured() {
    return Boolean(config.apiId && config.apiHash && config.session);
  }

  async function connect() {
    if (connected && authorized && client) return { connected, authorized, account };
    if (!isConfigured()) {
      return { connected: false, authorized: false, account: null, reason: "TELEGRAM_SESSION_MISSING" };
    }

    const session = new StringSession(config.session);
    client = new TelegramClient(session, config.apiId, config.apiHash, {
      connectionRetries: config.connectionRetries,
    });

    await client.connect();
    connected = true;
    authorized = await client.isUserAuthorized();
    if (!authorized) {
      return { connected, authorized, account: null, reason: "TELEGRAM_SESSION_UNAUTHORIZED" };
    }

    const me = await client.getMe();
    account = {
      id: me?.id != null ? String(me.id) : null,
      username: me?.username || null,
      firstName: me?.firstName || null,
    };
    return { connected, authorized, account };
  }

  async function status() {
    if (!isConfigured()) {
      return { configured: false, connected: false, authorized: false, account: null };
    }
    try {
      const state = await connect();
      return { configured: true, ...state };
    } catch (error) {
      connected = false;
      authorized = false;
      return {
        configured: true,
        connected: false,
        authorized: false,
        account: null,
        error: error?.message || String(error),
      };
    }
  }

  async function search({ query, sources, periodHours = 168, limit = 20 }) {
    if (!query || !String(query).trim()) throw new Error("SEARCH_QUERY_REQUIRED");
    const state = await connect();
    if (!state.authorized) throw new Error(state.reason || "TELEGRAM_NOT_AUTHORIZED");

    const selectedSources = (sources?.length ? sources : config.sources)
      .slice(0, config.maxSourcesPerSearch);
    if (!selectedSources.length) throw new Error("NO_TELEGRAM_SOURCES_CONFIGURED");

    const maxResults = Math.min(Math.max(1, Number(limit) || 20), config.maxResults);
    const perSource = Math.max(2, Math.min(20, Math.ceil(maxResults / selectedSources.length) + 2));
    const cutoff = Date.now() - Math.max(1, Number(periodHours) || 168) * 60 * 60 * 1000;
    const results = [];
    const errors = [];

    for (const source of selectedSources) {
      try {
        const entity = await client.getEntity(source);
        const messages = await client.getMessages(entity, {
          search: String(query).trim(),
          limit: perSource,
        });

        for (const message of messages) {
          const item = normalizeMessage(message, source, entity);
          if (!item.text) continue;
          const ts = item.date ? new Date(item.date).getTime() : 0;
          if (ts && ts < cutoff) continue;
          results.push(item);
        }
      } catch (error) {
        errors.push({ source, error: error?.message || String(error) });
      }
    }

    results.sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

    return {
      query: String(query).trim(),
      periodHours: Number(periodHours) || 168,
      sources: selectedSources,
      count: Math.min(results.length, maxResults),
      results: results.slice(0, maxResults),
      errors,
    };
  }

  async function disconnect() {
    if (client) await client.disconnect().catch(() => null);
    client = null;
    connected = false;
    authorized = false;
    account = null;
  }

  return { connect, status, search, disconnect, isConfigured };
}

module.exports = { createTelegramResearchClient, normalizeMessage, toIsoDate };
