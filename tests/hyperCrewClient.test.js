const test = require("node:test");
const assert = require("node:assert/strict");
const { createHyperCrewClient, HyperCrewError } = require("../connectors/hyperCrewClient");

test("hyper crew client keeps bearer token server-side and forwards run input", async () => {
  const calls = [];
  const client = createHyperCrewClient({
    baseUrl: "http://crew.internal/",
    apiToken: "secret-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: "run-1", status: "CREATED" }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });
  const result = await client.createRun({ projectId: "astel-business", objective: "Prepare launch" });
  assert.equal(result.id, "run-1");
  assert.equal(calls[0].url, "http://crew.internal/v1/runs");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret-token");
  assert.equal(JSON.parse(calls[0].options.body).objective, "Prepare launch");
});

test("hyper crew client reports missing configuration without making a request", async () => {
  const client = createHyperCrewClient({ baseUrl: "", apiToken: "" });
  await assert.rejects(() => client.listRuns(), error => error instanceof HyperCrewError && error.code === "HYPER_CREW_NOT_CONFIGURED");
});
