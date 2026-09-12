const { createHash } = require("node:crypto");

// Immutable drafts and SET NX decisions: exactly one terminal decision per text.
// This queue records approval; it never calls the Threads publishing API.
function createApprovalQueue({ redis, namespace = "astel:copilot:v1", clock = Date.now, ttlSeconds = 86400 }) {
  const key = (id, part) => `${namespace}:${id}:${part}`;
  const validId = id => /^[a-f0-9]{32}$/.test(String(id));
  async function get(id) {
    if (!validId(id)) return null;
    const value = await redis.get(key(id, "draft"));
    return value ? JSON.parse(value) : null;
  }
  async function decision(id) {
    if (!validId(id)) return null;
    const value = await redis.get(key(id, "decision"));
    return value ? JSON.parse(value) : null;
  }
  async function submit(input) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(input.account || "") ||
        !/^\d{1,40}$/.test(input.postId || "") ||
        typeof input.text !== "string" || !input.text.trim() || [...input.text].length > 500 ||
        typeof input.language !== "string" || input.language.length > 35 || !input.language) {
      throw new Error("INVALID_DRAFT");
    }
    const normalizedText = input.text.trim();
    let permalink = "";
    try {
      const parsed = new URL(String(input.permalink || ""));
      if (parsed.protocol === "https:" && /(^|\.)threads\.(com|net)$/i.test(parsed.hostname)) permalink = parsed.toString();
    } catch (_) {}
    const id = createHash("sha256").update(`${input.account}:${input.postId}:${normalizedText}`).digest("hex").slice(0, 32);
    const draft = {
      id, account: input.account, postId: input.postId, language: input.language,
      text: normalizedText, sourceText: String(input.sourceText || "").slice(0, 1200),
      permalink,
      createdAt: clock(), expiresAt: clock() + ttlSeconds * 1000,
    };
    const created = await redis.set(key(id, "draft"), JSON.stringify(draft), { NX: true, EX: ttlSeconds });
    const stored = created === "OK" ? draft : await get(id);
    if (!stored) throw new Error("DRAFT_UNAVAILABLE");
    // Repeated submissions never silently replace text already displayed to owner.
    return { created: created === "OK", draft: stored };
  }
  async function decide(id, action, ownerId) {
    if (!["approved", "skipped"].includes(action)) throw new Error("INVALID_ACTION");
    const draft = await get(id);
    if (!draft || draft.expiresAt <= clock()) return { status: "expired" };
    const value = { action, ownerId: String(ownerId), at: clock(), textHash: createHash("sha256").update(draft.text).digest("hex") };
    const remaining = Math.max(1, Math.ceil((draft.expiresAt - clock()) / 1000));
    const saved = await redis.set(key(id, "decision"), JSON.stringify(value), { NX: true, EX: remaining + 86400 });
    return { status: saved === "OK" ? action : "already_decided", decision: saved === "OK" ? value : await decision(id) };
  }
  async function beginEdit(id, ownerId) {
    const draft = await get(id);
    if (!draft || draft.expiresAt <= clock()) return { status: "expired" };
    if (await decision(id)) return { status: "already_decided" };
    await redis.set(key(ownerId, "edit"), id, { EX: 600 });
    return { status: "editing", draft };
  }
  async function pendingEdit(ownerId) {
    return redis.get(key(ownerId, "edit"));
  }
  async function revise(ownerId, text) {
    const originalId = await pendingEdit(ownerId);
    if (!originalId) return { status: "none" };
    await redis.del(key(ownerId, "edit"));
    return reviseById(originalId, ownerId, text);
  }
  async function reviseById(originalId, ownerId, text) {
    const original = await get(originalId);
    if (!original || original.expiresAt <= clock()) return { status: "expired" };
    if (await decision(originalId)) return { status: "already_decided", decision: await decision(originalId) };
    const normalizedText = String(text || "").trim();
    if (!normalizedText || [...normalizedText].length > 500) return { status: "invalid" };
    if (normalizedText === original.text) return { status: "unchanged", draft: original };
    const replacement = await submit({ ...original, text: normalizedText });
    const value = { action: "superseded", ownerId: String(ownerId), at: clock(), replacementId: replacement.draft.id };
    const remaining = Math.max(1, Math.ceil((original.expiresAt - clock()) / 1000));
    const saved = await redis.set(key(originalId, "decision"), JSON.stringify(value), { NX: true, EX: remaining + 86400 });
    if (saved !== "OK") return { status: "already_decided", decision: await decision(originalId) };
    return { status: "revised", draft: replacement.draft };
  }
  async function reserveNotification(id) {
    return (await redis.set(key(id, "notification"), "reserved", { NX: true, EX: ttlSeconds + 86400 })) === "OK";
  }
  async function reserveSubmission(account, cooldownSeconds = 10) {
    return (await redis.set(key(`account:${account}`, "submission-lock"), "1", { NX: true, EX: cooldownSeconds })) === "OK";
  }
  return { submit, get, decision, decide, beginEdit, pendingEdit, revise, reviseById, reserveNotification, reserveSubmission };
}

module.exports = { createApprovalQueue };
