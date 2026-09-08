# Astel Telegram Research Worker

Read-only MTProto worker used by Astel Assistant to search configured Telegram channels/groups.

## v0.1 scope

- Uses a normal Telegram user account over MTProto.
- Read-only: no sends, replies, joins, invites, reactions, or profile changes.
- Searches only explicitly configured sources (`TELEGRAM_SOURCES`).
- Returns normalized results: source, text, chat, date, link.
- Designed to run as a separate Railway service.

## Required variables

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`
- `TELEGRAM_SOURCES` — comma/newline-separated usernames, e.g. `@group1,@channel2`
- `WORKER_API_KEY` — recommended for protecting `/sources` and `/search`

Optional:

- `MAX_SOURCES_PER_SEARCH=30`
- `MAX_RESULTS=50`
- `TELEGRAM_CONNECTION_RETRIES=5`
- `PORT=3000`

## Create a session string locally

Do not commit or paste credentials into chat.

```bash
cd workers/telegram-research
npm install
TELEGRAM_API_ID=... TELEGRAM_API_HASH=... npm run session
```

The script asks for the phone, Telegram code, and 2FA password if enabled. Store the resulting `TELEGRAM_SESSION` only in Railway Variables.

## API

`GET /health` — connection/auth state (no secrets)

`GET /sources` — configured source list

`POST /search`

```json
{
  "query": "looking for parts from usa",
  "periodHours": 168,
  "limit": 20
}
```

When `WORKER_API_KEY` is set, send it as `x-astel-worker-key`.
