# Astel video cards in the existing owner Canvas

An opt-in video view is added to the existing distribution Mini App. Set `VIDEO_WORKSPACE_ENABLED=true` after deploying the matching Hub module. Existing Hub URL, reader and owner credentials are reused server-side. There is no new public data store and no copied private historical Canvas HTML.

Every API request passes the existing signed Telegram init-data guard and exact owner check. Read operations use the current reader token; version-bound editorial feedback uses the existing owner token. The proxy exposes only inbox/status/feedback. It cannot submit, preflight, schedule or dispatch media. The existing exact-plan approval route remains responsible for approving a plan and still never calls schedule.

Cards show the precise story revision, script, sources, MP4 SHA-256 and actual server preflight state. A newer registered revision invalidates earlier approval at the Hub. Local previews continue working while cloud integration is disabled. This UI needs a real Telegram owner session for physical acceptance; mocked signed-session tests do not prove a phone flow.

Target: existing astel-assistant service, baseline `6d058c880718a5cdb0cf7e26c71ae94be36c5f14`. Preserve publishing variables, subscriptions, database and Redis. Roll back source to that baseline and disable only VIDEO_WORKSPACE_ENABLED if acceptance fails.

Validation: existing 104 Telegram tests passed. Two additional tests cover the new guarded proxy and fixed reader/owner client boundaries. No real social publication was performed.
