const { Pool } = require("pg");

function createManagedCrewBotStore({ connectionString = process.env.DATABASE_URL, pool = null } = {}) {
  const db = pool || (connectionString ? new Pool({ connectionString }) : null);
  let initialized = false;

  function isConfigured() {
    return Boolean(db);
  }

  async function init() {
    if (!db) return { configured: false, ready: false };
    if (initialized) return { configured: true, ready: true };
    await db.query(`
      CREATE TABLE IF NOT EXISTS telegram_managed_crew_bots (
        agent_id TEXT PRIMARY KEY,
        bot_user_id BIGINT NOT NULL UNIQUE,
        username TEXT,
        display_name TEXT NOT NULL,
        owner_user_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS telegram_managed_crew_bots_username_idx ON telegram_managed_crew_bots (username)");
    initialized = true;
    return { configured: true, ready: true };
  }

  async function list() {
    if (!db) return [];
    await init();
    const result = await db.query(`
      SELECT
        agent_id AS "agentId",
        bot_user_id::text AS "botUserId",
        username,
        display_name AS "displayName",
        owner_user_id::text AS "ownerUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM telegram_managed_crew_bots
      ORDER BY created_at ASC
    `);
    return result.rows;
  }

  async function get(agentId) {
    if (!db) return null;
    await init();
    const result = await db.query(`
      SELECT
        agent_id AS "agentId",
        bot_user_id::text AS "botUserId",
        username,
        display_name AS "displayName",
        owner_user_id::text AS "ownerUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM telegram_managed_crew_bots
      WHERE agent_id = $1
    `, [String(agentId || "")]);
    return result.rows[0] || null;
  }

  async function findByBotUserId(botUserId) {
    if (!db) return null;
    await init();
    const result = await db.query(`
      SELECT
        agent_id AS "agentId",
        bot_user_id::text AS "botUserId",
        username,
        display_name AS "displayName",
        owner_user_id::text AS "ownerUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM telegram_managed_crew_bots
      WHERE bot_user_id = $1::bigint
    `, [String(botUserId || "")]);
    return result.rows[0] || null;
  }

  async function upsert({ agentId, botUserId, username = null, displayName, ownerUserId = null } = {}) {
    if (!db) throw new Error("MANAGED_CREW_STORE_NOT_CONFIGURED");
    await init();
    const result = await db.query(`
      INSERT INTO telegram_managed_crew_bots (
        agent_id, bot_user_id, username, display_name, owner_user_id, created_at, updated_at
      ) VALUES ($1, $2::bigint, $3, $4, $5::bigint, NOW(), NOW())
      ON CONFLICT (agent_id)
      DO UPDATE SET
        bot_user_id = EXCLUDED.bot_user_id,
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        owner_user_id = EXCLUDED.owner_user_id,
        updated_at = NOW()
      RETURNING
        agent_id AS "agentId",
        bot_user_id::text AS "botUserId",
        username,
        display_name AS "displayName",
        owner_user_id::text AS "ownerUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      String(agentId),
      String(botUserId),
      username ? String(username).replace(/^@/, "") : null,
      String(displayName),
      ownerUserId == null ? null : String(ownerUserId),
    ]);
    return result.rows[0];
  }

  async function close() {
    if (pool || !db) return;
    await db.end();
  }

  return { isConfigured, init, list, get, findByBotUserId, upsert, close };
}

module.exports = { createManagedCrewBotStore };
