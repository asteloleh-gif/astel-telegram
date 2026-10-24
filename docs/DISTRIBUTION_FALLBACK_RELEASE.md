# Astel Telegram fallback connector — release candidate

NOT DEPLOYED. Existing primary GPT/Kevin access is unchanged. No Hyper Crew run, social publication, Meta/Airtable mutation or existing Buffer queue change is part of this release.

## Existing production

Repo asteloleh-gif/astel-telegram, main 27064c9b62ec13c773f49c9cca06be808c5c586e; Railway astel-assistant project e53f5f4e-97d8-4325-95e3-ed20440869aa, production 8ae7021d-5f14-4bc2-aec7-79762483db07, service 1d555d75-f52b-4978-89ff-26c91f1d2fdf. Live deployment 11319867-e883-4a19-90d2-5ded6c18a8e1. Existing panel: https://astel-assistant-production.up.railway.app . Open it inside the existing Telegram bot to provide signed owner initData.

Health verified: version 0.6.0, healthy Redis, messageStoreConfigured=true. No pending Railway changes at audit. Redis has no volume; therefore the new connector uses the existing PostgreSQL with its existing persistent volume and a separate table distribution_connector_state. No existing tables are rewritten. Database acceptance against production has not run yet; SQL-store tests use a test double.

Hub project 4a6245f3-650c-40f4-bcc2-c5ffa1b73e27, production b05ed9fd-5938-41fa-b246-754a46b149c9, service 0b6d6df1-45fc-4996-823a-fc82e5113bee. Live deployment a499a2d6-56dd-44f7-9769-704dbc3e4ca2. No volume is attached. The reviewed Hub must be deployed before the connector can operate.

## Changed behavior

Owner `/distribution` command -> deterministic delivery counters and button opening the existing Mini App. Existing Approvals card -> Hub inbox -> full immutable material, media, account, variant, time, digest, delivery receipts -> exact owner approval. Telegram-signed user ID is checked server-side. The connector can read or approve only; it has no schedule/cancel capability and never holds raw Buffer tokens. Approval never starts a publication.

Separate PostgreSQL notification ledger and event cursor survive connector restart. A send reservation is durable before Telegram transmission. Ambiguous acknowledgements remain unconfirmed and are not automatically resent. Hub outages notify once; recovery is separate. The notification worker runs every minute independently of Kevin, queries Hub events only and never becomes a publishing scheduler. One service replica retained.

## Requested bounded release

Push the two reviewed branches, without merging main: review/distribution-fallback-20261024 for Telegram and review/unified-distribution-hub-20261024 for Hub. Pin ONLY the two named services to the exact candidate SHAs in the accompanying manifest. The Telegram research worker follows the same repo: do not change its source or deploy it. Do not change any Social Engine or Hyper Crew service.

1. Create one 1 GB volume for lazy-distribution at /data, one replica. Set LD_STORAGE_DIR=/data, LD_STORAGE_BINDING=astel-distribution-production-v1 and LD_INITIALIZE_STORAGE=true. Start with `node dist/hub/provision.js && node dist/hub/connector-canary.js && node dist/index.js`. Provisioning refuses to reset existing/partial/mismatched data.
2. Configure explicit six-account routes/bindings from the reviewed mapping. Transfer the two already saved Buffer credentials to Hub's server secret store. LD_BUFFER_ENABLE_WRITES=false, LD_RECONCILE_ENABLED=false, LD_MEDIA_HOSTS_JSON=[]; provider writes remain disabled. No new Buffer key or external permission is needed.
3. Issue two backend-only Hub caller credentials: astel-telegram-reader (producer/status only, project copilot) and oleg (owner/status+approve only, project copilot). Install them as LD_CALLERS_JSON on Hub and as DISTRIBUTION_HUB_READER_TOKEN / DISTRIBUTION_HUB_OWNER_TOKEN on Telegram. Values must never enter Git, browser JS, chat, Airtable or this document. Kevin receives neither credential in this operation.
4. Telegram vars: DISTRIBUTION_HUB_ENABLED=true, DISTRIBUTION_NOTIFICATIONS_ENABLED=true, DISTRIBUTION_HUB_PROJECT_ID=copilot, DISTRIBUTION_HUB_URL=https://lazy-distribution-production.up.railway.app. Keep existing bot token, owner ID, webhook secret, DATABASE_URL and other settings. Existing owner auth and PostgreSQL are reused.
5. LD_CONNECTOR_CANARY=true creates exactly one idempotent private simulation approval card: “Проверка запасного канала Astel. Это тест согласования. Публикация в соцсетях отключена.” It references astel.us:threads, simulation date 2035-01-01T00:00:00Z. This is NOT a scheduled public post. Startup replay reuses the same card. Oleg approves it in the existing Mini App; verify Hub APPROVED, zero provider attempts and no public post.

## Resources and cost

No new bot, paid Buffer plan, Hosted OpenPost plan, bucket, compute service or AI calls. Existing Telegram PostgreSQL stores the small new ledger. One new Hub volume is required; Railway pricing checked October 24 lists $0.00000006/GB/second (~$0.16/GB for 30 days). CPU/RAM/egress remain metered on the existing services; incremental use is not assumed zero and is not a fixed subscription charge. Keep the existing Railway workspace spending limit; do not raise it. Recheck budget before applying.

Source: https://railway.com/pricing

## Acceptance and stop/rollback

Before live apply: verify immutable SHAs/diffs/tests and staged changes touch only the two services and the one volume. After apply: check both health endpoints, new PG table initialization, authenticated Hub inbox, one private Telegram notification, owner `/distribution`, actual signed Mini App view/approval, Hub APPROVED and zero provider attempts. Confirm state/cursor persists on restart; do not delete or reset the journal, budget, SQL table or notice reservations. No public tests.

Stop by setting DISTRIBUTION_HUB_ENABLED=false and DISTRIBUTION_NOTIFICATIONS_ENABLED=false. No publishing stops are required because writes never enabled. Roll Telegram back to deployment 11319867-e883-4a19-90d2-5ded6c18a8e1 and Hub to a499a2d6-56dd-44f7-9769-704dbc3e4ca2 if needed, while preserving storage. Old code does not consume the new ledger. Do not drop the SQL table or delete the volume as part of rollback.

Public publishing/platform-ID/media acceptance gates remain separate. Kevin handoff: NOT_SENT; no verified direct recipient/channel was used.
