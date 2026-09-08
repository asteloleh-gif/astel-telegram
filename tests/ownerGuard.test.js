const test = require("node:test");
const assert = require("node:assert/strict");
const { checkOwner } = require("../safety/ownerGuard");

test("ownerGuard: configured owner is allowed", () => {
  assert.deepEqual(checkOwner({ userId: "7" }, "7"), { allowed: true, reasonCode: "OWNER_OK" });
});

test("ownerGuard: other users are rejected", () => {
  assert.deepEqual(checkOwner({ userId: "8" }, "7"), { allowed: false, reasonCode: "UNAUTHORIZED_USER" });
});

test("ownerGuard: missing owner configuration fails closed", () => {
  assert.deepEqual(checkOwner({ userId: "7" }, ""), { allowed: false, reasonCode: "OWNER_NOT_CONFIGURED" });
});
