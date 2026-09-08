function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function createTelegramResearchProxy({ baseUrl, workerApiKey, timeoutMs = 15000 } = {}) {
  const root = normalizeBaseUrl(baseUrl);

  async function request(path, { method = "GET", body } = {}) {
    if (!root) throw new Error("TELEGRAM_RESEARCH_WORKER_URL_MISSING");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${root}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(workerApiKey ? { "x-astel-worker-key": workerApiKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error || `WORKER_HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    status: () => request("/setup/status"),
    begin: (phone) => request("/setup/begin", { method: "POST", body: { phone } }),
    code: (code) => request("/setup/code", { method: "POST", body: { code } }),
    password: (password) => request("/setup/password", { method: "POST", body: { password } }),
    reset: () => request("/setup/reset", { method: "POST", body: {} }),
    listSources: () => request("/sources"),
    addSource: (source) => request("/sources", { method: "POST", body: { source } }),
    deleteSource: (source) => request(`/sources/${encodeURIComponent(String(source || "").replace(/^@/, ""))}`, { method: "DELETE" }),
    listDialogs: ({ limit = 120 } = {}) => request(`/dialogs?limit=${encodeURIComponent(String(limit))}`),
    search: ({ query, periodHours, limit, sources } = {}) => request("/search", {
      method: "POST",
      body: {
        query,
        periodHours,
        limit,
        ...(Array.isArray(sources) && sources.length ? { sources } : {}),
      },
    }),
  };
}

module.exports = { createTelegramResearchProxy, normalizeBaseUrl };
