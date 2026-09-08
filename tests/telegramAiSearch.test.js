const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeLanguages,
  parsePlan,
  planTelegramQueries,
  runTelegramAiSearch,
} = require('../research/telegramAiSearch');

test('normalizeLanguages keeps supported unique languages', () => {
  assert.deepEqual(normalizeLanguages(['uk', 'en', 'uk', 'xx']), ['uk', 'en']);
  assert.deepEqual(normalizeLanguages([]), ['auto']);
});

test('parsePlan accepts fenced JSON and removes duplicate queries', () => {
  const plan = parsePlan('```json\n{"languages":["uk","en"],"queries":[{"language":"uk","query":"шукаю запчастини"},{"language":"uk","query":"шукаю запчастини"},{"language":"en","query":"looking for auto parts"}]}\n```');
  assert.deepEqual(plan.languages, ['uk', 'en']);
  assert.equal(plan.queries.length, 2);
});

test('planTelegramQueries asks provider and returns structured plan', async () => {
  const calls = [];
  const provider = {
    async generate(input) {
      calls.push(input);
      return {
        model: 'test-model',
        text: JSON.stringify({
          languages: ['uk', 'en'],
          queries: [
            { language: 'uk', query: 'шукаю постачальника запчастин' },
            { language: 'en', query: 'looking for auto parts supplier' },
          ],
        }),
      };
    },
  };

  const result = await planTelegramQueries({ provider, goal: 'buyers for US auto parts', languages: ['uk', 'en'] });
  assert.equal(calls.length, 1);
  assert.equal(result.queries.length, 2);
  assert.equal(result.model, 'test-model');
});

test('runTelegramAiSearch dedupes messages across generated queries', async () => {
  const provider = {
    async generate() {
      return {
        model: 'test-model',
        text: JSON.stringify({
          languages: ['uk', 'en'],
          queries: [
            { language: 'uk', query: 'шукаю запчастини' },
            { language: 'en', query: 'looking for auto parts' },
          ],
        }),
      };
    },
  };

  const searches = [];
  const telegramResearch = {
    async search({ query }) {
      searches.push(query);
      if (query.startsWith('шукаю')) {
        return {
          sources: ['@cars'],
          results: [{ messageId: 10, chatUsername: 'cars', date: '2026-09-08T10:00:00Z', text: 'Need parts', url: 'https://t.me/cars/10' }],
          errors: [],
        };
      }
      return {
        sources: ['@cars'],
        results: [
          { messageId: 10, chatUsername: 'cars', date: '2026-09-08T10:00:00Z', text: 'Need parts', url: 'https://t.me/cars/10' },
          { messageId: 11, chatUsername: 'cars', date: '2026-09-08T11:00:00Z', text: 'Looking for supplier', url: 'https://t.me/cars/11' },
        ],
        errors: [],
      };
    },
  };

  const result = await runTelegramAiSearch({ provider, telegramResearch, goal: 'auto parts buyers', languages: ['uk', 'en'], limit: 20 });
  assert.equal(searches.length, 2);
  assert.equal(result.count, 2);
  assert.equal(result.results[0].messageId, 11);
  assert.deepEqual(result.results.find((item) => item.messageId === 10).matchedLanguages.sort(), ['en', 'uk']);
});
