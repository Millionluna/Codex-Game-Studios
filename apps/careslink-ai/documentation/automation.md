# AI and Automation

## NDIS Case Note generation

| Item | Current behavior |
| --- | --- |
| Trigger | User explicitly submits after Privacy Review, finding resolution, minimum facts, and two confirmations |
| Owner | CaresLink AI server route; no background autonomous owner |
| Inputs | Cleaned structured support facts only; no raw pasted-notes field |
| External API | OpenAI `POST /v1/responses` only |
| Tools | None; no web search, retrieval, uploads, MCP, or tool calling |
| Steering | System/user instructions in `src/lib/openai-ndis-case-note.ts` |
| Hard guardrails | Server input validator, rate limit, atomic quota, strict JSON Schema, output parser, PII/prohibited-language rejection, bilingual numeric parity |
| Output | English draft, Chinese review version, missing facts, neutral wording checks, follow-up prompts, controlled disclaimer |
| Side effects | App creates a short-lived claim and metadata event after safe parsing; the model cannot save or send anything |
| Retry | No automatic model retry; a failed safety parse returns a generic failure and does not lower controls |
| Kill switch | Remove/disable `OPENAI_API_KEY`, or disable the route at deployment level |

OpenAI requests set `store: false` and a maximum output-token limit. The controlled disclaimer is replaced server-side even when a model returns another value.

## Companion telemetry

Client telemetry is explicit, allowlisted, rate-limited automation. It sends only an event name; attribution and pseudonymous visitor metadata are constructed by the server. Generation and save events are server-owned. Telemetry failures do not expose content and do not block a completed save.

## Not present

There is no infinite chat, autonomous agent loop, participant database, file upload, outbound referral, booking, payment, email automation, webhook consumer, or scheduled job in this release.
