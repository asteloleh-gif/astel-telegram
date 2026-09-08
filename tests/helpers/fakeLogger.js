/**
 * Collects log calls in memory so tests can assert on reasonCode/traceId
 * propagation without parsing stdout.
 */
function createFakeLogger() {
  const entries = [];
  const record = level => fields => entries.push({ level, ...fields });
  return {
    entries,
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    critical: record("critical"),
  };
}

module.exports = { createFakeLogger };
