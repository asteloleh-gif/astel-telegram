# Astel Assistant

Private owner-only Telegram client for **Astel Assistant**.

## Current capabilities — v0.5.0

- Telegram Bot API webhook client
- owner-only access control
- Redis-backed dedupe, reservation/idempotency and cooldown safety
- short-term Redis conversation memory
- OpenAI Responses API chat
- `/research <query>` for fresh web research
- `/leads <query>` for public B2B lead research
- `/crew <objective>` for the complete Astel Business AI team
- `/crew battle <objective>` for the Battle Box team
- `/status`, `/reset`, `/help`
- owner-only Threads Copilot approval inbox with immutable approve/edit/skip decisions
- Railway deployment with healthcheck and webhook auto-registration

## Pipeline

```text
Telegram Update
  -> normalize
  -> owner guard
  -> Redis safety
  -> skill registry
       -> system
       -> research / lead hunter
       -> hyper-crew
       -> ai-chat
  -> Telegram publisher
  -> confirmed-publish memory commit
```

The main invariant is:

> ONE TELEGRAM SOURCE MESSAGE → MAXIMUM ONE AUTOMATIC PUBLISHED REPLY

## Research / Lead Hunter

Examples:

```text
/research последние изменения пошлин США на автозапчасти
/leads покупатели carbon fiber auto parts в США
```

Research uses OpenAI-hosted web search. Lead Hunter is restricted to lawful public information and is instructed not to invent contacts or use gated/private data.

## Environment

Copy `.env.example` and provide real secrets only in the hosting environment. Never commit tokens.

Required live secrets/config include `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `OPENAI_API_KEY`, `REDIS_URL`, `PUBLIC_BASE_URL`, and `TELEGRAM_WEBHOOK_SECRET`.

Hyper Crew is optional and fails closed when it is not configured:

```env
HYPER_CREW_BASE_URL=http://astel-hyper-crew.railway.internal:3000
HYPER_CREW_API_TOKEN=replace-with-a-long-random-token
HYPER_CREW_TIMEOUT_MS=180000
```

The Mini App uses owner-authenticated `/api/hyper-crew/*` proxy routes, so the internal bearer token is never exposed to browser JavaScript. Crew output stops at human approval; the operator remains dry-run until a publishing connector is configured separately.

## Run

```bash
npm install
npm test
npm start
```

See `docs/ARCHITECTURE.md` for the safety and memory design.

## Threads Copilot approval inbox

Set `COPILOT_APPROVAL_ENABLED=true` and provide `COPILOT_ACCOUNT_KEYS_JSON` as a
JSON map such as `{ "ru": "random-secret", "en": "another-random-secret" }`.
Each secret must be at least 32 characters. Producers submit immutable draft
versions to `POST /api/copilot/drafts` with `X-Copilot-Account` and a Bearer
credential, then poll `GET /api/copilot/drafts/:id` for the owner's decision.
The inbox stores approval state only; it does not publish to Threads.
