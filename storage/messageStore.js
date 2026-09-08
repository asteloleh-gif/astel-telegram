const { Pool } = require('pg');

function createMessageStore({ connectionString = process.env.DATABASE_URL, pool = null, logger = console } = {}) {
  const db = pool || (connectionString ? new Pool({ connectionString }) : null);
  let initialized = false;

  function isConfigured() {
    return Boolean(db);
  }

  async function init() {
    if (!db) return { configured: false, ready: false };
    if (initialized) return { configured: true, ready: true };
    await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await db.query(`
      CREATE TABLE IF NOT EXISTS telegram_messages (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'telegram',
        chat_username TEXT,
        chat_title TEXT,
        message_id BIGINT NOT NULL,
        message_date TIMESTAMPTZ,
        text TEXT NOT NULL,
        url TEXT,
        collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source, chat_username, message_id)
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS telegram_messages_date_idx ON telegram_messages (message_date DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS telegram_messages_chat_idx ON telegram_messages (chat_username)');
    await db.query('CREATE INDEX IF NOT EXISTS telegram_messages_text_trgm_idx ON telegram_messages USING GIN (lower(text) gin_trgm_ops)');
    initialized = true;
    return { configured: true, ready: true };
  }

  async function status() {
    if (!db) return { configured: false, ready: false, count: 0 };
    try {
      await init();
      const result = await db.query('SELECT COUNT(*)::int AS count, MAX(collected_at) AS last_collected_at FROM telegram_messages');
      return {
        configured: true,
        ready: true,
        count: Number(result.rows?.[0]?.count || 0),
        lastCollectedAt: result.rows?.[0]?.last_collected_at || null,
      };
    } catch (error) {
      logger?.error?.({ event: 'MESSAGE_STORE_STATUS_FAILED', error: error?.message || String(error) });
      return { configured: true, ready: false, count: 0, error: error?.message || String(error) };
    }
  }

  async function upsertMany(items = []) {
    if (!db) throw new Error('MESSAGE_STORE_NOT_CONFIGURED');
    await init();
    let insertedOrUpdated = 0;
    for (const item of items) {
      const messageId = Number(item?.messageId);
      const text = String(item?.text || '').trim();
      const chatUsername = item?.chatUsername ? String(item.chatUsername).replace(/^@/, '') : null;
      if (!Number.isFinite(messageId) || !text || !chatUsername) continue;
      await db.query(`
        INSERT INTO telegram_messages (
          source, chat_username, chat_title, message_id, message_date, text, url, collected_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT (source, chat_username, message_id)
        DO UPDATE SET
          chat_title = EXCLUDED.chat_title,
          message_date = EXCLUDED.message_date,
          text = EXCLUDED.text,
          url = EXCLUDED.url,
          updated_at = NOW()
      `, [
        item?.source || 'telegram',
        chatUsername,
        item?.chatTitle || null,
        messageId,
        item?.date || null,
        text,
        item?.url || null,
      ]);
      insertedOrUpdated += 1;
    }
    return { count: insertedOrUpdated };
  }

  async function search({ query, limit = 30, periodHours = 24 * 90, threshold = 0.48, sources = [] } = {}) {
    if (!db) throw new Error('MESSAGE_STORE_NOT_CONFIGURED');
    await init();
    const q = String(query || '').trim();
    if (!q) throw new Error('SEARCH_QUERY_REQUIRED');
    const finalLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const finalPeriodHours = Math.max(1, Math.min(24 * 3650, Number(periodHours) || 24 * 90));
    const finalThreshold = Math.max(0.1, Math.min(0.95, Number(threshold) || 0.48));
    const normalizedSources = Array.isArray(sources)
      ? sources.map((item) => String(item || '').replace(/^@/, '').trim()).filter(Boolean).slice(0, 100)
      : [];

    const params = [q, finalThreshold, finalPeriodHours, finalLimit];
    const sourceClause = normalizedSources.length ? 'AND chat_username = ANY($5::text[])' : '';
    if (normalizedSources.length) params.push(normalizedSources);

    const result = await db.query(`
      SELECT
        message_id AS "messageId",
        text,
        chat_title AS "chatTitle",
        chat_username AS "chatUsername",
        message_date AS date,
        url,
        GREATEST(
          CASE WHEN lower(text) LIKE '%' || lower($1) || '%' THEN 1 ELSE 0 END,
          similarity(lower(text), lower($1)),
          word_similarity(lower($1), lower(text))
        ) AS score
      FROM telegram_messages
      WHERE message_date >= NOW() - ($3::text || ' hours')::interval
        ${sourceClause}
        AND (
          lower(text) LIKE '%' || lower($1) || '%'
          OR similarity(lower(text), lower($1)) >= $2
          OR word_similarity(lower($1), lower(text)) >= $2
          OR to_tsvector('simple', text) @@ plainto_tsquery('simple', $1)
        )
      ORDER BY score DESC, message_date DESC NULLS LAST
      LIMIT $4
    `, params);

    return {
      query: q,
      count: result.rows.length,
      results: result.rows.map((row) => ({
        ...row,
        score: Number(row.score || 0),
      })),
    };
  }

  async function close() {
    if (pool || !db) return;
    await db.end();
  }

  return { isConfigured, init, status, upsertMany, search, close };
}

module.exports = { createMessageStore };
