// Persisted notification damping only; never pauses Hub or provider execution.
function createLinkHealth({ state, namespace, clock, notify }) {
  const key = namespace + ':link-health', downKey = namespace + ':down', lastKey = namespace + ':health-notice-at';
  async function counters() {
    try {
      const value = JSON.parse(await state.get(key) || '{}');
      return { failures: Math.min(3, Math.max(0, Number(value.failures) || 0)), successes: Math.min(2, Math.max(0, Number(value.successes) || 0)) };
    } catch (error) { if (error instanceof SyntaxError) return { failures: 0, successes: 0 }; throw error; }
  }
  async function failed() {
    const value = await counters(); value.failures = Math.min(3, value.failures + 1); value.successes = 0;
    await state.set(key, JSON.stringify(value));
    if (value.failures < 3 || await state.get(downKey)) return;
    const last = Number(await state.get(lastKey) || 0), now = clock();
    const notified = !last || now - last >= 15 * 60000;
    if (!await state.set(downKey, JSON.stringify({ notified }), { NX: true })) return;
    if (notified) {
      await state.set(lastKey, String(now));
      try { await notify(false); } catch (_) {} // unknown send outcome is not replayed
    }
  }
  async function healthy() {
    const value = await counters(); value.failures = 0; value.successes = Math.min(2, value.successes + 1);
    await state.set(key, JSON.stringify(value));
    const down = await state.get(downKey);
    if (!down || value.successes < 2 || !await state.del(downKey)) return;
    let notified = true; // older versions reserved this as the literal "reserved"
    try { notified = JSON.parse(down).notified === true; } catch (_) {}
    if (notified) {
      await state.set(lastKey, String(clock()));
      try { await notify(true); } catch (_) {}
    }
  }
  return { failed, healthy };
}
module.exports = { createLinkHealth };
