# CaresLink AI Architecture

## Product boundary

CaresLink AI provides guided business-document drafting. The provider-authenticated NDIS Case Note Companion turns de-identified, user-entered support facts into an English draft and a Simplified Chinese review version. The public Core landing remains separate. Every output remains a user-reviewed draft. The product does not make clinical, legal, compliance, regulatory, care, risk, qualification, quality, or service-endorsement decisions.

## Stack

| Layer | Current implementation |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS |
| Authentication | Supabase Auth email/password and Google PKCE session cookies via `@supabase/ssr` |
| Persistence | Supabase Postgres accessed from server code with the service-role key |
| AI | OpenAI Responses API with strict JSON Schema and `store: false` |
| Hosting | Vercel; production and preview use environment-scoped variables |
| Tests | Vitest, TypeScript, ESLint, Next production build, guarded browser smoke |

## Runtime map

1. An unauthenticated GET is redirected to login with an allowlisted internal return URL; an admin is redirected to the admin workspace.
2. The authenticated provider page keeps pasted source text and matched ranges in React memory only.
3. Browser Privacy Review detects obvious identifiers and unsafe wording, proposes cleaned structured facts, and requires each finding to be resolved.
4. The browser constructs a generation body only after minimum facts and two unchecked-by-default confirmations are complete.
5. `POST /api/template-companion/ndis-case-note` verifies a provider session before body parsing, quota, claim, telemetry, or OpenAI, then repeats privacy attestation and input validation.
6. A server-only RPC lazily creates the monthly free entitlement and grant, then atomically reserves 1 credit against the request idempotency key. Same-key concurrent/replayed requests cannot reserve twice.
7. OpenAI returns a strict bilingual object. Server parsing rejects malformed, identifying or prohibited output as a whole. Numeric parity canonicalizes month-name and marker-based dates plus numeric dates only when explicit date semantics surround them; non-date slash/code values remain exact. Chinese time periods use explicit ranges: morning 1-11, afternoon 12/1-6, noon only 12, pre-dawn 12/1-5, evening 6-11, and evening 12 maps to 00. Any other period-hour pair becomes a non-equivalent sentinel.
8. A successful result is stored in a claim already bound to the current provider under a deterministic pepper-derived token hash. It can be recovered or saved for 30 minutes; expired rows are unusable and are deleted by a later generation/save cleanup rather than an exact scheduled deletion. The credit commits only after the claim is available; failed work releases the credit.
9. The provider may explicitly save the claim to `generated_material_drafts`, later read it or permanently delete it. Saved-document operations always include the current account ID. Admin surfaces expose metadata or aggregates, not case-note content.

Login and registration present Google only when the server-side release gate is
explicitly enabled and the Supabase Auth settings endpoint confirms that the Google provider is active. Any settings failure hides Google and leaves email/password available. The server
action requests a Supabase PKCE authorization URL, and `/auth/callback` exchanges
the code before applying the same internal-route allowlist used by password auth.
Only `app_metadata` may grant an existing account the admin role; a new Google
account and any role-like `user_metadata` remain provider-scoped.

Authenticated provider and admin shells expose a server-side Sign out action.
The action clears the Supabase session and preserves only an allowlisted internal
return route; an external return target is reduced to the provider default. The
Companion header exposes the same action on desktop and mobile. If the auth
client is unavailable or remote sign-out fails, the action clears matching local
Supabase auth cookies and returns an error rather than claiming success.

## Trust boundaries

| Crossing | Enforcement |
| --- | --- |
| Browser to companion API | Verified provider session first; no raw paste field in request type; minimum-fact closure; two attestations; server revalidation |
| Server to OpenAI | Server-only API key; bounded output; strict schema; `store: false`; no tool calls |
| Server to Supabase | Service-role client only for claims, quota, events, and material drafts |
| Credit authorization | Monthly entitlement plus append-only ledger; service-role-only reserve/commit/release RPCs; idempotency key and per-user advisory lock |
| Claim to account | Opaque token hash plus `claimed_by_user_id` condition in a service-role-only RPC |
| Saved draft to account | Server resolves Supabase session and filters/checks `user_id`; delete uses one `id + user_id + feature` statement; authenticated owner `SELECT`/`DELETE` RLS is prepared by migration |
| Admin reporting | Metadata-only selectors; NDIS case-note drafts are excluded from current material-usage detail |
| Pilot cohort reporting | Service-role-managed UUID allowlist plus enrollment/removal interval; reports expose aggregates only and never join auth email |

The migration revokes broad `anon`/`authenticated` access and grants
`authenticated` only owner-scoped `SELECT`/`DELETE` on saved drafts. It does not
grant end-user `INSERT`/`UPDATE`. Current server code still holds the service
role and bypasses RLS, so explicit owner predicates are a load-bearing control
and remain covered by tests. The migration must be applied separately to each
target Supabase project.

## Stored data

| Store | Content |
| --- | --- |
| `ndis_case_note_companion_claims` | Generated material only, token hash, expiry, provider owner for this entry point |
| `template_companion_quota_usage` | Date, quota scope, pseudonymous fingerprint hash, count |
| `template_companion_events` | Event name, optional user ID, visitor hash, allowlisted attribution/surface, locale, timestamp |
| `generated_material_drafts` | Provider-owned saved output and status |
| `account_entitlements` | Provider owner, free plan status, UTC monthly period, limit, and effective timestamps |
| `credit_ledger` | Append-only feature/action/event/units/reservation/model/token-count metadata; no prompt, input, output, participant fact, or email |
| `pilot_cohort_members` | Fixed cohort code, owner UUID, controlled rollout stage and effective membership times; service-role only |

Raw pasted notes, matched spans, structured input, and generated content are not written to companion telemetry. There is no participant database or upload surface.

The only persisted Core acquisition pairs are
`core_product_landing/product_landing` and
`core_download_success/post_download`. Client product events include view,
start, copy and zero-credit offer metadata; generation, exhaustion and save are
server-created. The zero-credit offer uses the signed-in account, accepts no
free text or new contact details, does not charge, and does not alter credits.

The public `/privacy` route provides English and Simplified Chinese collection
and retention notice copy. Login, registration, Companion, Saved Documents,
the application shell and the public footer link to it.

Saved drafts remain until the owning provider deletes them; no automatic 30- or
90-day purge is claimed in this release. CaresLink AI is not the organisation's
formal record-retention system.

## Known risks and assumptions

- Privacy detection is heuristic and cannot guarantee complete de-identification. Manual review remains mandatory.
- Date-aware bilingual parity supports audited English month names, Chinese date markers, context-qualified numeric dates and 12/24-hour times. Numeric slash/code strings without date semantics remain exact. New formats require adversarial tests before support is claimed.
- Account and pepper-derived IP quota identities are abuse controls. Shared networks may share an IP limit.
- Credits and abuse quota are intentionally separate: failures release credits, while an attempt that reached OpenAI can still consume the daily abuse quota.
- The short-lived claim token remains a bearer capability inside the authenticated page. Immediate owner binding, `referrer: no-referrer`, 30-minute usability expiry, and hashed storage reduce forwarding risk. Expired rows can remain until the next generation/save cleanup run, but cannot be claimed or saved.
- Owner isolation for service-role draft access depends on server handlers continuing to apply `user_id` checks; owner RLS applies only to session-bound authenticated queries after its migration is applied.
- Non-production may use an in-memory fallback. Production fails closed without persistent companion storage unless `CARESLINK_ALLOW_COMPANION_MEMORY_STORE=true` is deliberately set.
- There is no scheduled work and no automated email in this release, so there are no `cron.md` or `emails.md` documents.

## Related documents

- [flows.md](./flows.md)
- [permissions.md](./permissions.md)
- [variables.md](./variables.md)
- [tests.md](./tests.md)
- [automation.md](./automation.md)
- [seo.md](./seo.md)
- [prd.md](./prd.md)
- [pilot-funnel-runbook.md](./pilot-funnel-runbook.md)
- [pilot-funnel.sql](./pilot-funnel.sql)
