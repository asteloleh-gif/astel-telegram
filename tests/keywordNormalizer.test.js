const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSeedList, parseSmartMatch, buildSmartMatch } = require('../research/keywordNormalizer');

test('normalizeSeedList dedupes and keeps user order', () => {
  assert.deepEqual(normalizeSeedList([' тканина ', 'тканина', 'тканиа']), ['тканина', 'тканиа']);
});

test('parseSmartMatch always preserves original seeds', () => {
  const result = parseSmartMatch(JSON.stringify({
    items: [
      { input: 'тканиа', variants: ['тканина', 'тканини'] },
      { input: 'поставшик', variants: ['поставщик'] },
    ],
  }), ['тканиа', 'поставшик']);

  assert.deepEqual(result.items[0], { input: 'тканиа', variants: ['тканиа', 'тканина', 'тканини'] });
  assert.deepEqual(result.items[1], { input: 'поставшик', variants: ['поставшик', 'поставщик'] });
  assert.ok(result.searchKeywords.includes('тканиа'));
  assert.ok(result.searchKeywords.includes('тканина'));
});

test('buildSmartMatch asks provider but never replaces original', async () => {
  const calls = [];
  const provider = {
    async generate(input) {
      calls.push(input);
      return {
        model: 'test-model',
        text: JSON.stringify({ items: [{ input: 'тканиа', variants: ['тканина'] }] }),
      };
    },
  };

  const result = await buildSmartMatch({ provider, keywords: ['тканиа'], model: 'cheap-model' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reasoningEffort, 'low');
  assert.deepEqual(result.searchKeywords, ['тканиа', 'тканина']);
  assert.equal(result.model, 'test-model');
});
