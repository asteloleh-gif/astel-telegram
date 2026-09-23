class HyperCrewError extends Error {
  constructor(message, { status = 502, code = "HYPER_CREW_ERROR" } = {}) {
    super(message);
    this.name = "HyperCrewError";
    this.status = status;
    this.code = code;
  }
}

function createHyperCrewClient({
  baseUrl = process.env.HYPER_CREW_BASE_URL,
  apiToken = process.env.HYPER_CREW_API_TOKEN,
  timeoutMs = Number(process.env.HYPER_CREW_TIMEOUT_MS || 180000),
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const token = String(apiToken || "").trim();
  const configured = Boolean(base && token);

  async function request(path, { method = "GET", body, authenticated = true, timeout = timeoutMs } = {}) {
    if (!base) throw new HyperCrewError("HYPER_CREW_NOT_CONFIGURED", { status: 503, code: "HYPER_CREW_NOT_CONFIGURED" });
    if (authenticated && !token) throw new HyperCrewError("HYPER_CREW_TOKEN_MISSING", { status: 503, code: "HYPER_CREW_TOKEN_MISSING" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      throw new HyperCrewError(timedOut ? "HYPER_CREW_TIMEOUT" : "HYPER_CREW_UNAVAILABLE", {
        status: timedOut ? 504 : 502,
        code: timedOut ? "HYPER_CREW_TIMEOUT" : "HYPER_CREW_UNAVAILABLE",
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HyperCrewError(payload?.message || payload?.error || `Hyper Crew request failed (${response.status})`, {
        status: response.status,
        code: payload?.error || "HYPER_CREW_REQUEST_FAILED",
      });
    }
    return payload;
  }

  return {
    isConfigured: () => configured,
    health: () => request("/health", { authenticated: false, timeout: Math.min(timeoutMs, 5000) }),
    listProjects: () => request("/v1/projects"),
    listAgents: () => request("/v1/agents"),
    listConnectors: () => request("/v1/connectors"),
    listRuns: () => request("/v1/runs"),
    getRun: id => request(`/v1/runs/${encodeURIComponent(id)}`),
    createRun: input => request("/v1/runs", { method: "POST", body: input }),
    startRun: id => request(`/v1/runs/${encodeURIComponent(id)}/start`, { method: "POST", body: {} }),
    decideRun: (id, input) => request(`/v1/runs/${encodeURIComponent(id)}/decisions`, { method: "POST", body: input }),
  };
}

module.exports = { createHyperCrewClient, HyperCrewError };
