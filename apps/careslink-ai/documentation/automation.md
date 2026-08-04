# AI and Automation

## NDIS Case Note generation

| Item | Current behavior |
| --- | --- |
| Trigger | Signed-in provider explicitly submits after Privacy Review, finding resolution, minimum facts, and two confirmations |
| Owner | CaresLink AI server route; no background autonomous owner |
| Inputs | Cleaned structured support facts only; no raw pasted-notes field |
| External API | OpenAI `POST /v1/responses` only |
| Tools | None; no web search, retrieval, uploads, MCP, or tool calling |
| Steering | System/user instructions in `src/lib/openai-ndis-case-note.ts` |
| Hard guardrails | Provider session before body parsing, server input validator, idempotent monthly credit reservation, account/IP rate and quota controls, strict JSON Schema, output parser, PII/prohibited-language rejection, date-aware bilingual numeric parity |
| Output | English draft, Chinese review version, missing facts, neutral wording checks, follow-up prompts, controlled disclaimer |
| Side effects | App creates a short-lived claim already bound to the provider and a metadata event after safe parsing; the model cannot save or send anything |
| Retry | No automatic model retry; same-key transport retries recover one completed claim or a stable state without another model call/credit; a new explicit attempt uses a new key |
| Kill switch | Remove/disable `OPENAI_API_KEY`, or disable the route at deployment level |

OpenAI requests set `store: false` and a maximum output-token limit. The controlled disclaimer is replaced server-side even when a model returns another value.

## Companion telemetry

Provider-session telemetry is explicit, allowlisted, rate-limited automation. It sends only an event name; attribution and pseudonymous visitor metadata are constructed by the server. Unauthenticated and admin writes are denied. Generation, credit-exhaustion and save events are server-owned. Client copy and zero-credit offer events accept no free text. Surface attribution is limited to two exact Core surface/medium pairs. Telemetry failures do not expose content and do not block a completed save.

## Not present

There is no infinite chat, autonomous agent loop, participant database, file upload, outbound referral, booking, payment, email automation, webhook consumer, or scheduled job in this release. The Starter A$9.99/month concept shown at zero credits is a fake-door research prompt only; it cannot charge or grant credits.
