const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageStore } = require('../storage/messageStore');

test('message store is optional when DATABASE_URL is absent', async () => {
  const store = createMessageStore({ connectionString: '' });
  assert.equal(store.isConfigured(), false);
  assert.deepEqual(await store.status(), { configured: false, ready: false, count: 0 });
});

test('message store initializes schema and upserts public Telegram messages', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT COUNT/.test(sql)) return { rows: [{ count: 1, last_collected_at: null }] };
      return { rows: [] };
    },
  };
  const store = createMessageStore({ pool });
  await store.init();
  const result = await store.upsertMany([
    { source: 'telegram', chatUsername: 'cars', chatTitle: 'Cars', messageId: 10, text: 'Need parts', date: '2026-09-08T10:00:00Z', url: 'https://t.me/cars/10' },
    { source: 'telegram', chatUsername: null, messageId: 11, text: 'private', date: '2026-09-08T10:00:00Z' },
  ]);
  assert.equal(result.count, 1);
  assert.ok(calls.some(({ sql }) => /CREATE EXTENSION IF NOT EXISTS pg_trgm/.test(sql)));
  assert.ok(calls.some(({ sql }) => /INSERT INTO telegram_messages/.test(sql)));
});

test('deep search uses fuzzy trigram and word similarity', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT\s+message_id/.test(sql)) {
        return { rows: [{ messageId: 22, text: 'тканина гуртом', chatTitle: 'Sew', chatUsername: 'sew', date: '2026-09-08T10:00:00Z', url: 'https://t.me/sew/22', score: '0.78' }] };
      }
      return { rows: [] };
    },
  };
  const store = createMessageStore({ pool });
  const result = await store.search({ query: 'тканиа', threshold: 0.4, limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(result.results[0].score, 0.78);
  assert.ok(calls.some(({ sql }) => /word_similarity/.test(sql) && /plainto_tsquery/.test(sql)));
});
