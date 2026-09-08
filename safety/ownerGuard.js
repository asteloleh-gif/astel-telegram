function checkOwner(event, ownerUserId) {
  if (!ownerUserId) return { allowed: false, reasonCode: "OWNER_NOT_CONFIGURED" };
  if (!event?.userId || String(event.userId) !== String(ownerUserId)) {
    return { allowed: false, reasonCode: "UNAUTHORIZED_USER" };
  }
  return { allowed: true, reasonCode: "OWNER_OK" };
}

module.exports = { checkOwner };
