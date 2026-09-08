const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");

test("health is 200 before Telegram session is configured", async () => {
  const { app } = createApp({ env: { PORT: "0" } });
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.ready, false);
    assert.equal(body.telegram.configured, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
