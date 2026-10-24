function createDistributionHubClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const reader = env.DISTRIBUTION_HUB_READER_TOKEN || "";
  const owner = env.DISTRIBUTION_HUB_OWNER_TOKEN || "";
  const projectId = env.DISTRIBUTION_HUB_PROJECT_ID || "copilot";
  let origin = null;
  try {
    const u = new URL(env.DISTRIBUTION_HUB_URL);
    if (u.protocol === "https:" && !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash) origin = u.origin;
  } catch (_) {}
  const enabled = () => env.DISTRIBUTION_HUB_ENABLED === "true" && Boolean(origin && reader.length >= 32);
  async function call(action, args = {}) {
    if (!enabled()) throw new Error("DISTRIBUTION_NOT_CONFIGURED");
    const read = ["inbox", "status", "metrics", "events"].includes(action);
    if (!read && action !== "approve") throw new Error("DISTRIBUTION_ACTION_DENIED");
    const token = read ? reader : owner;
    if (token.length < 32) throw new Error("DISTRIBUTION_APPROVAL_NOT_CONFIGURED");
    let response;
    try {
      response = await fetchImpl(`${origin}/api/distribution/${action}`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...args, projectId }), redirect: "error", signal: AbortSignal.timeout(15000),
      });
    } catch (_) { throw new Error("DISTRIBUTION_RESPONSE_UNCONFIRMED"); }
    if (!response.ok) throw new Error("DISTRIBUTION_REQUEST_FAILED");
    return response.json();
  }
  return { call, enabled, projectId, approvalsEnabled: () => enabled() && owner.length >= 32 };
}
module.exports = { createDistributionHubClient };
