const test = require("node:test");
const assert = require("node:assert/strict");
const { createTelegramResearchProxy } = require("../setup/telegramResearchProxy");

test("Telegram research proxy forwards search to the private worker", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { query: "пошив", count: 1, results: [{ text: "example" }] };
      },
    };
  };

  try {
    const proxy = createTelegramResearchProxy({
      baseUrl: "http://telegram-research-worker.railway.internal:3000/",
      workerApiKey: "secret-key",
      timeoutMs: 1000,
    });

    const result = await proxy.search({
      query: "пошив",
      periodHours: 720,
      limit: 10,
      sources: ["@sewbiz_online"],
    });

    assert.equal(result.count, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://telegram-research-worker.railway.internal:3000/search");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["x-astel-worker-key"], "secret-key");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      query: "пошив",
      periodHours: 720,
      limit: 10,
      sources: ["@sewbiz_online"],
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("Telegram research proxy omits an empty sources override", async () => {
  const originalFetch = global.fetch;
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, async json() { return { count: 0, results: [] }; } };
  };

  try {
    const proxy = createTelegramResearchProxy({ baseUrl: "http://worker", timeoutMs: 1000 });
    await proxy.search({ query: "шукаю", periodHours: 168, limit: 20, sources: [] });
    assert.deepEqual(body, { query: "шукаю", periodHours: 168, limit: 20 });
  } finally {
    global.fetch = originalFetch;
  }
});
