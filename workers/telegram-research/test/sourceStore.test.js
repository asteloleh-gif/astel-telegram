const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSourceStore, normalizeSource } = require("../src/sourceStore");

test("normalizes public Telegram usernames and links", () => {
  assert.equal(normalizeSource("@cars_usa"), "@cars_usa");
  assert.equal(normalizeSource("https://t.me/cars_usa"), "@cars_usa");
  assert.throws(() => normalizeSource("https://t.me/+privateInvite"), /PRIVATE_INVITE_NOT_SUPPORTED/);
});

test("persists, deduplicates and removes sources", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astel-tg-sources-"));
  const file = path.join(dir, "sources.json");
  try {
    const store = createSourceStore({ file, seedSources: ["@seed_group"] });
    assert.equal(store.list().length, 1);

    const created = store.add({ source: "https://t.me/cars_usa", title: "Cars USA", status: "connected" });
    assert.equal(created.created, true);
    assert.equal(store.list().length, 2);

    const duplicate = store.add({ source: "@cars_usa" });
    assert.equal(duplicate.created, false);
    assert.equal(store.list().length, 2);

    const reloaded = createSourceStore({ file });
    assert.equal(reloaded.list().some((item) => item.source === "@cars_usa"), true);
    assert.equal(reloaded.remove("@cars_usa"), true);
    assert.equal(reloaded.list().some((item) => item.source === "@cars_usa"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
