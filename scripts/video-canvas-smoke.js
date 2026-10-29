// Local QA only. Uses synthetic owner signatures and a fake Hub; no real keys.
const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createDistributionController } = require('../distribution/controller');
const { createTelegramWebAppGuard } = require('../setup/telegramWebAppGuard');
const { createFakeRedisClient } = require('../tests/helpers/fakeRedisClient');

const app = express(), planId = 'a'.repeat(64), digest = 'c'.repeat(64), cardDigest = 'd'.repeat(64);
const token = 'local-synthetic-fixture-only', lostAfter = process.argv.includes('--lost-after');
const stats = { feedbackAttempts: [], feedbackRecords: 0, approveCalls: 0, messages: 0, modelCalls: 0 };
const card = { revision: 1, digest: cardDigest, title: 'QA — склад', script: 'Локальная проверка экрана. Это синтетическая карточка, реальный план и голос не изменяются.', artifact: { sha256: '1'.repeat(64), duration: 41.024 }, sources: [{ author: 'QA fixture', license: 'test only' }] };
const item = { planId, inputDigest: digest, state: 'NEEDS_APPROVAL', latest: true, card, reviews: [], proof: { state: 'verified', at: new Date().toISOString(), sha256: card.artifact.sha256 } };
const broken = { ...structuredClone(item), planId: 'b'.repeat(64), card: { ...card, title: 'QA — недоступная карточка' } };
const client = { projectId: 'copilot', enabled: () => true, approvalsEnabled: () => true,
  async call(action, args) {
    if (action === 'inbox') return { items: [], nextCursor: null };
    if (action === 'metrics') return { pending: 1, failed: 0, ambiguous: 0, confirmedSuccess: 0 };
    if (action === 'status') {
      if (args.planId !== planId) throw Error('fixture card unavailable');
      return { id: planId, digest, state: 'NEEDS_APPROVAL', input: { mode: 'simulation', brandId: 'qa', revision: 1, variants: {}, assets: [], destinations: [{ scheduledAt: '2035-01-01T00:00:00Z' }] }, deliveries: [] };
    }
    if (action === 'approve') { stats.approveCalls++; throw Error('QA must not approve'); }
    throw Error('Unexpected action: ' + action);
  },
  async video(action, args) {
    if (action === 'inbox') return { items: [structuredClone(item), structuredClone(broken)] };
    if (action === 'status') return structuredClone(args.planId === planId ? item : broken);
    if (action !== 'feedback') throw Error('Unexpected video action');
    stats.feedbackAttempts.push(args.requestId);
    if (stats.feedbackAttempts.length === 1 && !lostAfter) throw Error('lost before save');
    let review = item.reviews.find(r => r.id === args.requestId);
    if (!review) { review = { id: args.requestId, digest: args.digest, decision: args.decision, note: args.note }; item.reviews.push(review); stats.feedbackRecords++; }
    if (stats.feedbackAttempts.length === 1 && lostAfter) throw Error('lost after save');
    return review;
  },
};
const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 7 }) });
const checked = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => k + '=' + v).join('\n');
const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
params.set('hash', crypto.createHmac('sha256', secret).update(checked).digest('hex'));
const env = { TELEGRAM_OWNER_ID: '7', TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: 'qa-only', PUBLIC_BASE_URL: 'https://qa.invalid', VIDEO_WORKSPACE_ENABLED: 'true' };
const controller = createDistributionController({ redis: createFakeRedisClient(), telegram: { async sendMessage() { stats.messages++; } }, env, client });
app.use(express.json()); controller.mount(app, { webAppGuard: createTelegramWebAppGuard({ botToken: token, ownerUserId: '7' }) });
app.get('/qa/stats', (_req, res) => res.json(stats));
app.get('/health', (_req, res) => res.json({ ok: true, aiModels: { chat: 'LOCAL QA — no model' } }));
app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const sdk = `<script>window.Telegram={WebApp:{initData:${JSON.stringify(params.toString())},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}};</script>`;
  res.send(html.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>', sdk).replace('<body>', '<body><aside style="padding:10px;background:#fff2ba;text-align:center">LOCAL QA: synthetic owner / fake Hub / no Telegram or AI calls</aside>'));
});
app.use(express.static(path.join(__dirname, '../public')));
const server = app.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/?distribution=1&video=1`, lostAfter })));
