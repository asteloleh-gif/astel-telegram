# Astel Assistant — Architecture

## Product

`astel-telegram` is the Telegram client for **Astel Assistant**, a private owner-only AI assistant.
Telegram is the first interface. New business capabilities are added as isolated skills, not baked into the transport layer.

## Invariant

> ONE TELEGRAM SOURCE MESSAGE → MAXIMUM ONE AUTOMATIC PUBLISHED REPLY

## Pipeline

```text
Telegram Update
  -> Telegram Adapter / normalize
  -> Router
  -> Owner Guard
  -> Redis Safety (dedupe -> reservation -> cooldown)
  -> Skill Registry
       -> system
       -> research / lead hunter
       -> ai-chat
  -> Publisher
  -> Telegram sendMessage
  -> commit assistant memory only after confirmed publish
```

## Safety

Redis namespace defaults to `astel:tg:v1`.

- `dedupe:<update_id>` prevents webhook retry duplication.
- `reservation:<conversationId>:<messageId>` prevents concurrent/replayed processing of one source message.
- `cooldown:<conversationId>:<userId>` applies per-user/per-chat pacing.
- Redis failures fail closed.
- Network/timeout errors during Telegram send are treated as ambiguous and are not blindly retried.
- Successful publication transitions reservation state to `PUBLISHED` with a longer TTL.

## Access control

`TELEGRAM_OWNER_ID` is mandatory for live use. Non-owner events are ignored before AI or publishing.
If owner ID is not configured, the assistant fails closed.

## Memory

Short-term memory lives in Redis and is scoped by:

```text
conversationId + threadId/main + userId
```

It has a TTL (`CONVERSATION_RESET_HOURS`), message cap, and approximate token budget.
User messages may be persisted after they are genuinely received.
Assistant messages are persisted only after Telegram confirms publication.

## AI

The provider is OpenAI via the Responses API. Provider details stay outside the Telegram adapter.
The model, reasoning effort, timeout, and output budget are environment-configurable.

The research skill can opt into OpenAI-hosted web search per request. Web search is not enabled for every chat message, which keeps cost and behavior bounded.

## Skills

The registry currently has three concrete skills:

- `system`: `/start`, `/help`, `/status`, `/reset`
- `research`: `/research <query>`, `/leads <query>`
- `ai-chat`: default free-form assistant chat

`/leads` is limited to lawful public B2B research. It is instructed not to use private/gated data or invent contacts, and uses a hard per-response tool-call cap.

## Runtime gates

- `BOT_ENABLED=false` prevents publishing.
- `BOT_DRY_RUN=true` logs reply candidates without sending.
- Live mode should be enabled only after CI and staging checks pass.

## Deployment

Target: separate Railway service and separate Redis state from Threads production.
The production service is `astel-assistant`; Threads remains a separate project/service.
