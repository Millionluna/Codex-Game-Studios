# CaresLink AI Architecture

## Product boundary

CaresLink AI provides guided business-document drafting. The public NDIS Case Note Companion turns de-identified, user-entered support facts into an English draft and a Simplified Chinese review version. Every output remains a user-reviewed draft. The product does not make clinical, legal, compliance, regulatory, care, risk, qualification, quality, or service-endorsement decisions.

## Stack

| Layer | Current implementation |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS |
| Authentication | Supabase Auth session cookies via `@supabase/ssr` |
| Persistence | Supabase Postgres accessed from server code with the service-role key |
| AI | OpenAI Responses API with strict JSON Schema and `store: false` |
| Hosting | Vercel; production and preview use environment-scoped variables |
| Tests | Vitest, TypeScript, ESLint, Next production build, guarded browser smoke |

## Runtime map

1. The public companion keeps pasted source text and matched ranges in React memory only.
2. Browser Privacy Review detects obvious identifiers and unsafe wording, proposes cleaned structured facts, and requires each finding to be resolved.
3. The browser constructs a generation body only after minimum facts and two unchecked-by-default confirmations are complete.
4. `POST /api/template-companion/ndis-case-note` repeats privacy attestation and input validation before auth lookup, quota consumption, or OpenAI.
5. OpenAI returns a strict bilingual object. Server parsing rejects malformed, identifying, prohibited, or numerically inconsistent output as a whole.
6. A successful guest result is stored as a 30-minute claim under a SHA-256 token hash. The opaque token, never the content, may travel through the login return URL.
7. A signed-in provider may atomically bind the claim to their Supabase user and save it to `generated_material_drafts`.
8. Saved-document reads always query with the current account ID. Companion admin surfaces expose metadata or aggregates, not case-note content.

## Trust boundaries

| Crossing | Enforcement |
| --- | --- |
| Browser to companion API | No raw paste field in request type; minimum-fact closure; two attestations; server revalidation |
| Server to OpenAI | Server-only API key; bounded output; strict schema; `store: false`; no tool calls |
| Server to Supabase | Service-role client only for claims, quota, events, and material drafts |
| Claim to account | Opaque token hash plus `claimed_by_user_id` condition in a service-role-only RPC |
| Saved draft to account | Server resolves Supabase session and filters/checks `user_id` in application code |
| Admin reporting | Metadata-only selectors; NDIS case-note drafts are excluded from current material-usage detail |

The browser cannot query the protected tables directly. Their grants are revoked from `anon` and `authenticated`. Because server code holds the service role, application-level owner checks are a load-bearing control and must remain covered by tests.

## Stored data

| Store | Content |
| --- | --- |
| `ndis_case_note_companion_claims` | Generated material only, token hash, expiry, optional claiming user |
| `template_companion_quota_usage` | Date, quota scope, pseudonymous fingerprint hash, count |
| `template_companion_events` | Event name, optional user ID, visitor hash, allowlisted attribution, locale, timestamp |
| `generated_material_drafts` | Provider-owned saved output and status |

Raw pasted notes, matched spans, structured input, and generated content are not written to companion telemetry. There is no participant database or upload surface.

## Known risks and assumptions

- Privacy detection is heuristic and cannot guarantee complete de-identification. Manual review remains mandatory.
- IP, user-agent, cookie, and pepper-derived quota identities are abuse controls, not durable identity. Shared networks may share an IP limit.
- An opaque claim URL is a short-lived bearer capability. `referrer: no-referrer`, 30-minute expiry, hashed storage, and one-owner binding reduce but do not eliminate forwarding risk.
- Owner isolation for service-role draft access depends on server handlers continuing to apply `user_id` checks.
- Non-production may use an in-memory fallback. Production fails closed without persistent companion storage unless `CARESLINK_ALLOW_COMPANION_MEMORY_STORE=true` is deliberately set.
- There is no scheduled work and no automated email in this release, so there are no `cron.md` or `emails.md` documents.

## Related documents

- [flows.md](./flows.md)
- [permissions.md](./permissions.md)
- [variables.md](./variables.md)
- [tests.md](./tests.md)
- [automation.md](./automation.md)
- [seo.md](./seo.md)
