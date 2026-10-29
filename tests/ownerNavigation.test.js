const test = require('node:test');
const assert = require('node:assert/strict');
const { miniAppUrl, configureOwnerNavigation } = require('../telegram/ownerNavigation');
const { createTelegramAdapter } = require('../adapters/telegramAdapter');

test('menu and command registration use only the existing owner private chat', async () => {
  const calls = [], adapter = createTelegramAdapter({ token: 'local-fixture-token', fetchImpl: async (url, options) => {
    calls.push({ method: url.split('/').at(-1), body: JSON.parse(options.body) }); return new Response(JSON.stringify({ ok: true, result: true }));
  } });
  const result = await configureOwnerNavigation({ telegram: adapter, env: { TELEGRAM_OWNER_ID: '7', PUBLIC_BASE_URL: 'https://astel.test', VIDEO_WORKSPACE_ENABLED: 'true' } });
  assert.equal(result.ownerScoped, true); assert.deepEqual(calls.map(c => c.method), ['setMyCommands', 'setChatMenuButton']);
  assert.deepEqual(calls[0].body.scope, { type: 'chat', chat_id: 7 }); assert.equal(calls[1].body.chat_id, 7);
  assert.equal(calls[1].body.menu_button.web_app.url, 'https://astel.test/?distribution=1');
  for (const name of ['start', 'video', 'canvas', 'distribution', 'think', 'research', 'crew', 'reset']) assert.ok(calls[0].body.commands.some(c => c.command === name));
});
test('disabled or unsafe navigation registers no command or menu', async () => {
  const telegram = { async setMyCommands() { throw Error('must not be called'); } };
  for (const env of [{}, { VIDEO_WORKSPACE_ENABLED: 'true', TELEGRAM_OWNER_ID: '7', PUBLIC_BASE_URL: 'http://astel.test' }, { VIDEO_WORKSPACE_ENABLED: 'true', TELEGRAM_OWNER_ID: '7', PUBLIC_BASE_URL: 'https://user:secret@astel.test' }]) {
    assert.equal((await configureOwnerNavigation({ telegram, env })).enabled, false);
  }
  assert.equal(miniAppUrl('https://astel.test/old?x=1#hash', { video: true, planId: 'a'.repeat(64) }), 'https://astel.test/?distribution=1&video=1&planId=' + 'a'.repeat(64));
});
test('adapter refuses global menu/commands and does not leak a key in setup arguments', async () => {
  const adapter = createTelegramAdapter({ token: 'local-only' });
  await assert.rejects(() => adapter.setMyCommands({ commands: [], scope: { type: 'default' } }), /Owner/);
  await assert.rejects(() => adapter.setChatMenuButton({ chatId: '-7', url: 'https://astel.test' }), /Private/);
});
