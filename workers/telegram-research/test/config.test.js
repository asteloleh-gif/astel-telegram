const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig, parseSources } = require("../src/config");

test("parseSources normalizes usernames and t.me links", () => {
  assert.deepEqual(
    parseSources("foo, @bar\nhttps://t.me/baz"),
    ["@foo", "@bar", "@baz"]
  );
});

test("loadConfig caps search limits", () => {
  const config = loadConfig({
    TELEGRAM_API_ID: "123",
    TELEGRAM_API_HASH: "hash",
    TELEGRAM_SESSION: "session",
    TELEGRAM_SOURCES: "foo,bar",
    MAX_SOURCES_PER_SEARCH: "999",
    MAX_RESULTS: "999",
  });
  assert.equal(config.apiId, 123);
  assert.equal(config.sources.length, 2);
  assert.equal(config.maxSourcesPerSearch, 50);
  assert.equal(config.maxResults, 100);
});
