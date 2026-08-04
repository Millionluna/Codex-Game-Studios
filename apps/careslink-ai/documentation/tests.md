# Verification Map

## Existing coverage

| Use case | Rule and expected deny case | Evidence | Status |
| --- | --- | --- | --- |
| Browser Privacy Review | Matched ranges stay local; direct/indirect/evaluative clues are found and cleaned | `src/lib/ndis-case-note-browser-privacy.test.ts` | Existing automated |
| Full Chinese acceptance case | Names, phone, NDIS number block; location/context require review; observable facts remain | Same test file | Existing automated |
| Pre-generation closure | Missing date/facts, unresolved findings, or unchecked confirmations produce no request object | Same test file | Existing automated |
| Server auth gate | Signed-out POST returns `401` before JSON parsing, quota, claim, telemetry, or OpenAI; admin returns `403` | `src/app/api/template-companion/ndis-case-note/route.test.ts` | Existing automated |
| Google OAuth availability | Server release gate must be exactly true and Supabase settings must confirm Google; disabled/unavailable state fails closed | `src/lib/google-oauth.test.ts`, auth page render tests | Automated |
| OAuth callback safety | PKCE code exchange, internal next allowlist, trusted-role routing, cancellation sanitization, and no token-bearing final URL | `src/app/auth/actions.test.ts`, `src/app/auth/callback/route.test.ts` | Automated |
| Brand typography | Root, document, Tailwind sans/mono, controls and data surfaces use the single CaresLink serif stack | `src/app/brand-font.test.ts` | Automated |
| Server bypass | After auth, missing attestation/facts and crafted PII return `422` before quota or OpenAI | Same route test | Existing automated |
| Authenticated quota | Provider account/IP limits return `429`; failed generation still consumes the attempted quota | Route and store tests | Existing automated |
| Credit entitlement and ledger | Missing persistence fails closed; free monthly summary and metadata mapping are validated; migration contains owner RLS and service-role-only RPC grants | `src/lib/account-credit-store.test.ts` plus migration/grant review | Automated/static/live database |
| Idempotent generation | Same key replays one owner-bound claim; concurrent replay calls neither quota nor model; exhausted balance blocks; generation/claim failures release credits | NDIS generation route tests | Automated |
| Plan & Usage | Provider page reads only the current owner and renders EN/zh-Hans metadata without reservation IDs or document content | `src/app/plan-and-usage/page.test.tsx` | Automated |
| OpenAI contract | Request uses `store:false`, strict schema, bounded output, controlled prompt | `src/lib/openai-ndis-case-note.test.ts` | Existing automated with mocked HTTP |
| Output safety | Malformed, PII and prohibited conclusions reject the whole result; only semantic dates canonicalize; slash/code counterexamples, noon/midnight boundaries and real differences reject | `src/lib/ndis-case-note-companion.test.ts` | Automated |
| Claim ownership | Generation immediately binds the claim to provider; expiry and cross-owner use are denied | `src/lib/ndis-case-note-companion-store.test.ts`, generation/save route tests | Existing automated |
| Provider save | Signed-out/admin denied; provider save idempotent and owner-scoped | Save route tests | Existing automated |
| Provider delete | Two-step UI; signed-out/admin denied; one owner-and-feature-scoped delete; cross-owner/wrong-feature/missing share one `404` | Delete route, store and companion UI tests | Automated |
| Saved-draft owner RLS | Migration revokes broad grants, allows authenticated owner `SELECT`/`DELETE` only, and leaves `INSERT`/`UPDATE` server-controlled | Generated material store/schema tests plus migration review | Automated/static |
| Telemetry privacy | Events contain metadata and no generated content/input; only two surface/medium pairs and fixed offer/copy events are accepted | Store/event route/request tests plus attribution migration review | Automated/static |
| Sign out | Provider/admin sessions call server-side sign-out; matching local auth cookies clear; missing client/remote/cleanup failure cannot show success; safe return and re-gate remain | Auth action, Supabase cookie helper, AppShell and release smoke | Automated/live |
| Privacy notice | EN/zh-Hans notice states account data, reviewed facts, `store:false` without a ZDR claim, 30-minute claim usability plus opportunistic row cleanup, saved-until-delete, telemetry and draft boundary | `src/app/privacy/page.test.tsx` plus route smoke | Automated/live |
| Zero-credit fake door | Explicit Starter A$9.99/30-credit concept, no charge/top-up/contact/free text; offer events metadata-only | Companion render and event route tests | Automated |
| Invite-only cohort report | Service-role UUID allowlist and effective membership interval filter every event/credit aggregate; pure CTE report is read-only; non-members cannot enter pilot measures | `src/lib/pilot-funnel-contract.test.ts`, migration review and target database read-only execution | Automated/static/live database |
| Admin isolation | Material usage uses metadata and excludes NDIS case-note details | Admin/material store tests | Existing automated |
| Responsive product shell | Authenticated task flow, unchecked confirmations, no guest/demo cards | Companion static render plus guarded 1440/390 smoke | Existing automated/manual |

The post-review Production Pilot Release Gate baseline is 77 Vitest files and 530 passing tests, followed by TypeScript, ESLint and the Next production build. Preview and Production smoke are recorded separately because Production promotion requires an independent review greenlight.

## Release-candidate live checks

| Check | Type | Expected result |
| --- | --- | --- |
| Previous real OpenAI synthetic generation | Guarded live, 3 August 2026, commit `10f9f55` | Passed under the superseded guest-first decision; retained only as model/privacy/output evidence |
| Auth-gate Preview GET/API | Guarded live | Signed-out GET enters login; signed-out POST `401` with no quota/OpenAI; provider form renders |
| Authenticated Preview generation/save | Guarded live | PII denial `422`; safe generation `200`; provider owns saved draft; second provider cannot read/save it |
| Preview quota | Guarded live | Authenticated account/IP limit returns `429` |
| Preview cleanup | Manual/SQL verification | Temporary accounts, claims, drafts, events, and quota rows removed |
| Credit database transaction | Shared-Supabase synthetic A/B | Fresh grant `3`; reserve/commit/release/replay/exhaustion stable; cross-owner RPC returns not-found; owner RLS hides B; temporary rows removed |
| Date-aware real structured output | Preview then Production | English month/Chinese numeric month preserves the same date and unrelated quantities; a real difference is rejected |
| Sign out | Preview then Production | Provider/admin cookie is cleared; protected Companion immediately redirects to login; external return target is absent |
| Pilot attribution and fake door | Preview then Production | Only two surface pairs persist; zero-credit view/request events contain metadata only and entitlement remains zero |

The local live check used only synthetic de-identified facts. Its evidence records statuses, field names and lengths, token counts, and cleanup state; it does not retain input or generated wording. The exact claim, quota, and telemetry rows created by that check were deleted and verified absent afterward.

## Gaps

| Priority | Gap | Exposure |
| --- | --- | --- |
| P1 | Heuristic privacy rules cannot cover every direct or indirect identifier | A user could submit an undetected identifying clue; manual review remains mandatory |
| P1 | Current server routes use service role and bypass the new owner RLS | A future server route omitting its explicit owner predicate could expose another owner's content; route tests remain mandatory |
| P1 | No automatic saved-draft purge policy has been selected | Saved drafts remain until the owner deletes them; required records must live in the organisation's authorised record system |
| P2 | Expired unsaved claim rows are purged opportunistically, not by a scheduler | Claims cannot be used after 30 minutes, but an expired row may remain until a later generation/save cleanup runs |
| P2 | IP/device quota behavior varies behind shared proxies and privacy tools | False positives or lower abuse resistance |
| P2 | No end-to-end browser test is currently a repository CI job | UI interaction regressions rely on release smoke |
| P2 | This repository has no merge-gating workflow for the CaresLink AI test/build commands | Local/preview gates must be run explicitly before merge |
