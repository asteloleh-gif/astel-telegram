# Astel Telegram

Standalone Telegram project built on the proven Astel Reply Engine patterns, but without Meta/Threads-specific code.

## Goal

Build a self-hosted Telegram AI assistant with:

- Telegram Bot API adapter
- Redis-backed dedupe/idempotency/cooldowns
- short-term conversation memory
- human takeover lock
- configurable reply policy
- AI usage telemetry
- Railway-friendly deployment

## Architecture

```text
Telegram Update
    ↓
Telegram Adapter
    ↓
Telegram Router / Policy
    ↓
Safety + Memory
    ↓
AI Engine
    ↓
Telegram sendMessage
    ↓
Redis / Logs
```

## Status

Initial project scaffold. Core modules are intentionally platform-independent. Threads/Meta-specific token management, Graph API routing, target_id logic, and UNKNOWN_PARENT handling are not included.

## Environment

Copy `.env.example` and provide real secrets only in your hosting environment. Never commit tokens.

## Run

```bash
npm install
npm test
npm start
```
