const test = require('node:test');
const assert = require('node:assert/strict');
const { createLinkHealth } = require('../distribution/linkHealth');
const { createFakeRedisClient } = require('./helpers/fakeRedisClient');

test('isolated failures never spam; counters survive a controller restart', async () => {
  const state = createFakeRedisClient(), notices = [], input = { state, namespace: 'qa', clock: () => 1000000, notify: async value => notices.push(value) };
  let health = createLinkHealth(input);
  await health.failed(); await health.healthy(); await health.failed(); await health.healthy(); assert.equal(notices.length, 0);
  await health.failed(); await health.failed(); health = createLinkHealth(input); await health.failed(); assert.deepEqual(notices, [false]);
  await health.healthy(); assert.equal(notices.length, 1); await health.healthy(); assert.deepEqual(notices, [false, true]);
});
test('repeated outages within 15 minutes do not generate another alert pair', async () => {
  const state = createFakeRedisClient(), notices = []; let now = 1000000;
  const health = createLinkHealth({ state, namespace: 'qa', clock: () => now, notify: async value => notices.push(value) });
  const cycle = async () => { for (let i = 0; i < 3; i++) await health.failed(); for (let i = 0; i < 2; i++) await health.healthy(); };
  await cycle(); now += 60000; await cycle(); assert.deepEqual(notices, [false, true]);
  now += 16 * 60000; await cycle(); assert.deepEqual(notices, [false, true, false, true]);
});
test('lost notification reply and a legacy down reservation are never blindly replayed', async () => {
  const state = createFakeRedisClient(); let attempts = 0;
  const config = { state, namespace: 'qa', clock: () => 1000000, notify: async () => { attempts++; throw Error('lost ack'); } };
  let health = createLinkHealth(config); for (let i = 0; i < 3; i++) await health.failed(); health = createLinkHealth(config); await health.failed(); assert.equal(attempts, 1);
  await state.set('qa:down', 'reserved'); await health.healthy(); await health.healthy(); assert.equal(attempts, 2);
});
