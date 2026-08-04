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
6. OpenAI returns a strict bilingual object. Server parsing rejects malformed, identifying, prohibited, or numerically inconsistent output as a whole.
7. A successful result is stored as a 30-minute claim already bound to the current provider under a SHA-256 token hash; this entry point creates no anonymous claim.
8. The provider may explicitly save the claim to `generated_material_drafts`, later read it or permanently delete it. Saved-document operations always include the current account ID. Admin surfaces expose metadata or aggregates, not case-note content.

Login and registration present Google only when the server-side release gate is
explicitly enabled after Supabase provider and redirect verification. The server
action requests a Supabase PKCE authorization URL, and `/auth/callback` exchanges
the code before applying the same internal-route allowlist used by password auth.
Only `app_metadata` may grant an existing account the admin role; a new Google
account and any role-like `user_metadata` remain provider-scoped.

## Trust boundaries

| Crossing | Enforcement |
| --- | --- |
| Browser to companion API | Verified provider session first; no raw paste field in request type; minimum-fact closure; two attestations; server revalidation |
| Server to OpenAI | Server-only API key; bounded output; strict schema; `store: false`; no tool calls |
| Server to Supabase | Service-role client only for claims, quota, events, and material drafts |
| Claim to account | Opaque token hash plus `claimed_by_user_id` condition in a service-role-only RPC |
| Saved draft to account | Server resolves Supabase session and filters/checks `user_id`; delete uses one `id + user_id + feature` statement; authenticated owner `SELECT`/`DELETE` RLS is prepared by migration |
| Admin reporting | Metadata-only selectors; NDIS case-note drafts are excluded from current material-usage detail |

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
| `template_companion_events` | Event name, optional user ID, visitor hash, allowlisted attribution, locale, timestamp |
| `generated_material_drafts` | Provider-owned saved output and status |

Raw pasted notes, matched spans, structured input, and generated content are not written to companion telemetry. There is no participant database or upload surface.

Saved drafts remain until the owning provider deletes them; no automatic 30- or
90-day purge is claimed in this release. CaresLink AI is not the organisation's
formal record-retention system.

## Known risks and assumptions

- Privacy detection is heuristic and cannot guarantee complete de-identification. Manual review remains mandatory.
- Account and pepper-derived IP quota identities are abuse controls. Shared networks may share an IP limit.
- The short-lived claim token remains a bearer capability inside the authenticated page. Immediate owner binding, `referrer: no-referrer`, 30-minute expiry, and hashed storage reduce forwarding risk.
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
