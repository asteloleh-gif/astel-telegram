# Astel video bot completion

Branch: `fix/astel-video-bot-entry`, based on deployed Canvas `4c05a67177928e82a813df1781e8f33680bc0db6` (PR #35). This additive patch completes navigation/review in the existing owner bot. No new service, dependency, secret, permission scope, Hub publisher or paid model call is introduced.

## Owner flow

- `/video` reads the existing Hub video inbox and returns up to five current titles/revisions plus a button opening the exact newest plan. It is deterministic and never falls through to the paid chat skill, including when the video feature is unavailable.
- `/canvas` opens the existing queue and status summary; `/distribution` remains supported. All three require the configured owner in the owner's private chat and preserve command deduplication.
- `/start` and `/help` expose the video path; bot-suffixed commands work. On startup, when the existing VIDEO_WORKSPACE_ENABLED flag is true, the bot registers commands and a **Canvas** menu only for the existing owner's private chat. Other users' menus, BotFather settings and authentication grants remain unchanged. Menu setup failure does not take down the webhook; the next startup can idempotently reapply it.
- Video notifications open the precise card rather than only a general inbox. The URL contains an ID, never a credential; actual signed-owner authorization is still required.

The card shows the current exact plan state, script, source links and server MP4 proof. One unavailable card has its own retry. Failed video preview offers an explicit file link. The owner can refresh, request a nonempty correction or accept a draft. Publication approval remains the existing distinct exact-digest action, visible only when enabled, current, freshly verified and future-dated. There is no schedule/publish call.

An unconfirmed feedback request is kept with its same UUID and note in memory/sessionStorage. Reload restores that intent. Reading a matching saved review resolves an acknowledgement lost after save; retrying after a failure before save reuses the same UUID. A second different decision is blocked until the first is resolved. Sensitive server credentials never enter the browser.

## Notification damping

Persisted counters require three consecutive failed queue checks before an outage notice and two consecutive successes before recovery. New outage notices are limited to one per 15 minutes per project; recovery is sent only for an outage that was actually notified. Counters survive restart, legacy down reservations are supported and unknown Telegram send outcomes are not replayed. Astel and ASAP Team notices are labelled separately.

This reduces notification noise. It is not a diagnosis or repair of an intermittent network/Hub fault. PostgreSQL/Redis failure remains fail-closed. Existing Hub event cursor and per-event delivery records are retained; these counters do not pause or execute provider work.

## Validation

All **119** existing/new Node tests passed. They cover private-owner access, command reservation, exact notification links, scoped Bot API settings, stale/rate-limit errors, nonempty corrections, delayed/cooldown health notices and no scheduling/provider calls.

Real browser QA used the actual public JS/CSS and signed-owner BFF against a clearly labelled synthetic localhost Hub. A lost-before-save scenario made two HTTP attempts with one UUID and one saved review, surviving reload. A lost-after-save scenario was reconciled by READ with one attempt and one saved review. A failed card did not block another. At a 390px viewport, document width stayed 390px. Approval, real Telegram messages and model calls were zero. Details: [validation JSON](VIDEO_BOT_VALIDATION_2026-10-28.json).

This does not prove a physical Telegram/iPhone session or external Drive video playback. The earlier server verified the real MP4; a fresh signed Mini App session remains a rollout acceptance step. No production Telegram signature was fabricated.

Local replay (no real keys needed):

```bash
node --test tests/*.test.js
node scripts/video-canvas-smoke.js
# Separate scenario:
node scripts/video-canvas-smoke.js --lost-after
```

The smoke prints a dynamic loopback URL. Open it in a browser; the first correction deliberately loses its response. This fixture imports no production environment or key and is never mounted by `server.js`.

## Production activation / rollback

Target only the existing Railway astel-assistant service `1d555d75-f52b-4978-89ff-26c91f1d2fdf`, environment `8ae7021d-5f14-4bc2-aec7-79762483db07`. Keep all current variables, PostgreSQL/Redis, Hub and publishing configuration. VIDEO_WORKSPACE_ENABLED is already true; no new flag is required. Pin the reviewed commit, stage it in this environment, inspect that only its source is changed and obtain explicit production deployment confirmation before accept-deploy.

Acceptance: deployment SUCCESS, public JS/CSS match the commit, logs contain TELEGRAM_OWNER_NAVIGATION_READY, unauthenticated video requests remain rejected, actual owner `/video` opens the exact card. Do not send a message as the human owner or approve a plan just to test. No paid planner call is part of acceptance.

Rollback source to `integration/astel-video-canvas` / `4c05a67177928e82a813df1781e8f33680bc0db6`; preserve all data and credentials. The owner-scoped menu remains a valid existing Canvas URL on the older app. Old commands/notification reservations and new health metadata can coexist. If reverting the menu is required, change only that owner's menu through the existing Bot API; do not change the global bot menu.

Primary API references: [setChatMenuButton](https://core.telegram.org/bots/api#setchatmenubutton), [setMyCommands](https://core.telegram.org/bots/api#setmycommands), [Mini App menu launch](https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button).
