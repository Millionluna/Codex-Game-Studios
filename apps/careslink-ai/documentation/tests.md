# CaresLink AI Test Evidence

> Evidence date: 2026-08-26. This document separates **Existing**, **Proposed**, and **Gaps**. Passing current tests does not mean Product Baseline V1.0 is implemented.

## Existing

### Pre-batch audited runtime baseline

Run against exact audited HEAD `f0d994dfc66d7373bbadbe106b3147d847c6c8d3`:

| Command | Result |
|---|---|
| `pnpm test` | 79 files, 546 tests passed |
| `pnpm exec tsc --noEmit` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; 52 static/dynamic routes enumerated |

The build emitted only the known multiple-lockfile workspace-root warning. No application code or deployment was changed during this audit.

### Inactive shadow batch verification

Run against the current uncommitted implementation-readiness worktree. The repository checks below are separate from the isolated database evidence that follows:

| Command | Result |
|---|---|
| focused shadow/save/delete suite | 14 files, 131 tests passed |
| `pnpm test` | 90 files, 653 tests passed; includes all prior 546 tests |
| `pnpm exec tsc --noEmit` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; 52 static/dynamic routes enumerated |
| `git diff --check` | passed after final documentation edits |

The source tests prove source/domain contracts. Separate guarded-live runs prove migration/database authorization and the protected NDIS save integration on an isolated Preview. They do not prove a served Product API or any Production V1 activation.

### Shared Product API implementation batches (local only)

The historical 90-file / 653-test result above remains the implementation-readiness baseline. The 2026-08-11 pre-E2E shared implementation snapshot added the versioned transport/OpenAPI contract, default-off `/v1` routes including canonical revision append at `PATCH /v1/documents/{documentId}`, canonical `GET /v1/sync/pull?cursor=` and atomic `POST /v1/privacy-reviews`, a request-scoped Supabase adapter, service-only active-session resolver, deterministic privacy scanner and replay/conflict/owner/cursor/tombstone tests, four native-auth routes that return fixed `501` envelopes with capability `false`, and static migration-contract checks. The former `/v1/documents/{documentId}/revisions` HTTP route is not retained. `POST /v1/sync/push` is reserved as an unserved `NOT_IMPLEMENTED` boundary without a frozen batch body:

| Command | Result |
|---|---|
| `pnpm test` | 103 files, 831 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 59/59, including the Product API routes, atomic privacy confirmation and four fixed native-auth `501` boundaries |

The route adapter is not Preview- or Production-served: its master and durable-adapter flags both default off, and runtime target verification accepts only an explicitly matched non-Production Preview Supabase ref. The default runtime now assembles request-scoped persistence and active-session validation, but missing configuration fails closed before any client is created. Mobile uses `Authorization: Bearer`; cookie authentication is an additional Web transport through the same adapter. Web cookie mutations require same-origin HTTPS plus JSON, Bearer mutations remain independent of browser Origin, and sync pull is `GET /v1/sync/pull?cursor=` with no mutation body. Sync push remains unserved and `NOT_IMPLEMENTED`. Privacy confirmation authenticates before body parsing, scans bounded canonical structured facts with policy `2026-08-11.preview.1`, returns locator-only findings, and persists only hash/proof metadata through a dedicated service-only adapter. Its scanner is deterministic, not a guarantee of complete de-identification. Confirmed proofs use a temporary 30-minute Preview TTL; this is not a Production product decision. Create and append bind that proof to owner/type/canonical `factsSummary` hash/schema/status/expiry in the tested adapters; changing only `englishDraft` is valid and changing `factsSummary` is stale. The dedicated Preview privacy secret does not fall back to the generic service-role key. These are source-level guarantees only: this batch does not establish a live database RPC grant or route E2E. The five native routes physically return structured `501` envelopes, while their capability constants remain `false`; this is a fail-closed boundary, not implementation or service evidence. The four mobile-sync document write-RPC execute grants remain withheld pending disposable-database canonical-hash vectors and server-equivalent Note schema validation. Consequently, these source tests do not prove database RLS, revoked-session integration, write availability, native authentication, cross-device sync or end-to-end behavior.

### Historical Portal-first M0/M1 local checkpoint — updated 2026-08-16

That Portal-first source snapshot retained the native M0 machine
capability crosswalk, fixed native/sync-push `501` boundaries and Product API
operation gates. It added a local actor-bound Referral adapter, physical
Portal route wrappers, default-disabled page controls and a complete
dependency-injected intake → triage/offer → accept/decline → follow-up/audit
test path. At that snapshot the route runtime had no default durable adapter and its compile-time
readiness latch is `false`, so the physical routes fail with `503` before auth
or body parsing rather than serving mock or process-memory data.

Referral tests cover metadata-only replay hashes and ACKs,
role/organization/provider eligibility, Source A/B and Provider A/B isolation,
offered/declined visibility, fixed non-PII catalog codes, repeated follow-up,
stale state, same-key replay, changed-payload conflict, failed-audit rollback,
an injected cookie/Bearer transport-mapping fixture and two different-key offer
decisions. The transport fixture uses synthetic credentials and does not prove
real Supabase cookie/Bearer identity parity. Page
tests prove invalid demo IDs do not fall back to another fixture and legacy
mock IDs are not promoted into canonical route calls. The apparent concurrent
decision test runs against the synchronous memory adapter and is not Postgres
transaction-concurrency evidence.

| Command | Result |
|---|---|
| focused Portal Referral gate | 7 files, 73 tests passed |
| `pnpm test` | 112 files, 983 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

The then-current Portal migration and transactional assertion script were not applied or
executed. There was no disposable Preview base URL, no native redirect
allowlist authority and no served Referral persistence. Five Portal pages now
show fail-closed local controls or explicit database-identity boundaries, but
their surrounding legacy demo sections remain mock and are not represented as
canonical Referral data.

### Portal Referral intake runtime source/local checkpoint — 2026-08-25

The current source replaces only Referral-source list/create behind three
default-off application gates, `VERCEL_ENV=preview`, an exact non-Production
Supabase ref and the separate default-off database flag. The request-scoped
Supabase client is cookie-only; Bearer is rejected and no service-role client or
memory fallback exists. The route resolves database authorization before a
private mutation body. The database revalidates the flag, current Auth
session/user and exactly one active referral-source membership in an active
referral-source organization. After every potentially blocking authorization
lock is held, it refreshes wall-clock time and repeats the complete Auth
session/user eligibility predicate before returning the protected context.

The new authorize, metadata list and atomic create RPCs are `SECURITY DEFINER`
with `search_path=''` and grant execution only to `authenticated`; `PUBLIC`,
`anon` and `service_role` remain revoked and no API role receives direct Portal
table privilege. Create derives the actor/organization in the database,
recomputes the canonical payload hash and writes referral, private contact,
metadata-only audit and receipt rows atomically. Replay is stable, a changed
payload conflicts and list returns only source-organization metadata. Triage,
offer, response, follow-up, detail and audit remain disabled. The browser keeps
private fields disabled until the authorization GET succeeds and disables them
again on an authorization-boundary failure.

| Command | Result |
|---|---|
| focused Portal Referral gate | 9 files / 165 tests passed |
| `npm test` | 133 files / 1,628 tests passed |
| `npx tsc --noEmit --incremental false` | passed |
| `npm run lint` | passed |
| `npm run build` | passed; Next static generation completed 63/63 |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 files checked |
| `git diff --check` | passed |

The frozen disposable-local PostgreSQL 16.15 gate clean-applied all 30
repository migrations and passed all 10 explicit-rollback assertion suites,
followed by an independent zero-fixture/default-off/owner/ACL/role-edge
postcheck. The Portal migration SHA-256 was
`5a98154b254050b3140f5f185d52e3ff7e070da05fbdfa99dbdd60665b382e1c` and
the corrected Portal assertion SHA-256 was
`206ba671f2960ab9eb88552092975eeb9caddc302dbcedf2bacc5d65819ad666`.
The eight true two-session cases passed: same-key replay, same-key changed-body
conflict, session expiry while waiting on the mutation advisory lock, real
writer blocking for capability flag, Auth session, membership and organization
locks, and the post-lock wall-clock regression. In that final case the caller
waited on the exact Auth-session row across `not_after`, then received
`PORTAL_SESSION_REVOKED` with zero writes across referral, private contact,
audit and receipt tables. Exact fixture cleanup restored both append-only
triggers, the full postcheck passed again, the server stopped and the temporary
cluster was deleted with zero matching local roots retained. Migrations that
require the existing generation-owner bootstrap used atomic owner-grant/
session-authorization/owner-revoke wrappers; the final migrator
generation-schema privileges remained false. This is a minimal
Supabase-compatible local bootstrap, not hosted GoTrue/PostgREST or Supabase
platform parity.

These are source and disposable-local-database claims only. No hosted
GoTrue/PostgREST cookie E2E, hosted Preview or Production migration, deployment,
flag activation, retained business row or paid runtime resource is claimed.

### Portal Referral source-detail runtime source/local checkpoint — 2026-08-25

This slice adds one independently gated `GET_REFERRAL` path for a referral
source to reopen a referral owned by its exact organization. The application
base gate, source-detail application gate, master database flag and detail
database flag all fail closed and remain off by default. A separate new intake
database flag closes direct Data API list/create when only detail is enabled.
The cookie-only resolver rejects Bearer before client construction, authorizes
from fresh database session/membership state through
`portal_referral_source_detail_authorize()`, and then invokes
`portal_referral_source_detail(p_referral_id)`.

The authenticated-only `SECURITY DEFINER` RPC holds the master and operation
flag rows, reuses the intake context's post-lock session revalidation, joins the
separately protected contact row and requires the exact source organization.
Cross-tenant, absent and null IDs share `PORTAL_NOT_FOUND`. Its exact 9-field
referral / 3-field contact DTO excludes tenant, actor, assignment, document,
export and audit identities and performs no write. The server and browser both
reject extra/missing fields, invalid catalog/status/version/time values and
non-canonical response UUIDs; error bodies are never parsed into detail state.
The adapter, route and browser bind the returned referral ID to the requested
UUID; the route projects the exact DTO even if a future adapter returns a wider
legacy view. When the durable detail gate is on, list items provide a same-origin
detail link, the UUID page never falls back to a legacy mock record, and keyed
component state cannot show the prior referral while navigating to another ID.

| Command | Result |
|---|---|
| focused intake/source-detail gate | 9 files / 214 tests passed |
| `pnpm test` | 136 files / 1,717 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm exec next build --webpack` | passed; Next static generation completed 63/63 |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 files checked |
| `git diff --check` | passed |

A temporary Homebrew PostgreSQL 16.15 cluster
(`server_version_num=160015`) loaded only the minimum compatible
foundation → intake → source-detail migration chain and then ran
the updated intake and new source-detail rollback suites with `ON_ERROR_STOP=1`.
Both transactions passed. The source-detail suite proved master+detail cannot
open intake authorize/list/create and master+intake cannot open either detail
RPC, as well as default-off/master-only denial, exact Source A/B reads,
bidirectional tenant denial, absent/null IDs, expired/deleted sessions, revoked
membership, authenticated-only RPC ACL, entry-owner/search-path posture,
direct-table denial, zero writes and cleanup. The updated intake suite reproved
authorization, atomic create/list, replay/conflict and its existing session/
tenant boundaries behind master + intake. The final postcheck retained all
three flags off/Preview-only and zero referral/audit/receipt rows. The server
was stopped and the temporary cluster deleted. This is deliberately not a
31/31 repository clean-apply or hosted Supabase parity claim.

The migration is 5,780 bytes / SHA-256
`8e58ad2d7fcf68400925604b459dc972be7f7ef8608b1b496d5217a99ec0dc4e`;
the source-detail rollback file is 29,059 bytes / SHA-256
`2dc91eb69814a778d82a392d41c2d4aadc84a102b8df870a24db4bb41842dd98`.
The updated intake BEGIN-through-ROLLBACK body is 40,774 bytes / SHA-256
`f9934a85728d3d42f1109ac05675f8c25c7ac06b0e1c40231747828f30bc1195`.
No cloud database, Preview deployment, Production migration, flag activation,
retained user/business row or paid resource was used.

### Portal Referral Assignment M1a source/local checkpoint — 2026-08-25

This slice adds an independently gated operator queue/detail, triage,
eligible-provider candidates and offer. The application and database gates are
default-off. Runtime authorization remains cookie-only and exact-Preview-ref
bound; database authorization resolves exactly one active platform admin or
source-tenant partner operator and rechecks the live Auth session after lock
waits. Queue and candidates are bounded; Supabase and browser envelopes plus
route requests are exact-key parsed, while route responses are strictly
validated and allowlist-projected. Gate-on pages never fall back to mock. Offer
promotes or creates one `OFFERED` match while leaving `assigned_provider_id`
null.
Provider response, follow-up and audit list remain unsupported.

| Command | Result |
|---|---|
| focused Assignment gate | 9 files / 292 tests passed |
| `pnpm test` | 138 files / 1,821 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm exec next build --webpack` | passed; Next static generation completed 64/64 |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 files checked |
| `git diff --check` | passed |

A temporary PostgreSQL 16.15 (`server_version_num=160015`) loaded the minimum
compatible bootstrap and foundation → intake → source-detail → assignment
migration chain with `ON_ERROR_STOP=1`, then passed the rollback-only Assignment
suite. The suite proves default-off/master-before-operation and cross-gate
denial; exact owner/definer/volatile/search-path/ACL posture; zero direct table
grants; exact-one role/organization/session authority; tenant/not-found
isolation; strict DTO, trimmed names, keyset/state boundaries; provider
eligibility and uniform not-found for absent/currently ineligible targets even
when a historical `DECLINED` or `EXPIRED` match exists; triage/offer hashes,
replay, conflict, stale and corrupt-receipt handling; bigint increment
protection; candidate promotion; metadata-only audit; stable replay after
provider suspension; role restoration, cleanup and zero-write failure
snapshots.

Eleven real two-backend PostgreSQL scenarios also passed. Concurrent same-actor
same-mutation triage returned one ACK and one audit/receipt side effect;
triage/offer queued behind the same referral lock produced exactly one winner;
and the provider helper locked only its bounded result. Eight wall-clock expiry
scenarios crossed `not_after` while waiting at the triage referral, Auth row,
organization/membership table, candidate referral/provider and offer
referral/match/provider lock stages. Every expired call returned
`PORTAL_SESSION_REVOKED` before a data-derived error or write, with zero
referral/match/audit/receipt side effect. The temporary cluster and race scripts
were removed.

The pre-review migration at exact source commit `526aa1e` is 36,128 bytes /
SHA-256
`e9ecd8ce68a70a69d0a611f5803aeaae195025cfc6a65235025d6e6544fdcb40`;
the rollback assertion file is 62,944 bytes / SHA-256
`eb77a92cf18ad602a9cdb6c6fb05ab58e63618ec4b97ade2e38b0d81775eedff`;
the TypeScript migration contract is 20,783 bytes / SHA-256
`65c13cae85e4f1e4e3d9b387965c0aae9e785a0f9162466f8a9869598be752e1`.
This is a minimum local chain, not a full repository migration apply or hosted
GoTrue/PostgREST/Auth E2E. No cloud database, deployment, flag activation,
retained fixture, Production action or paid resource was used.

### Portal Referral Assignment M1a PR review hardening — 2026-08-26

Independent PR review found that the browser/route contracts and release text
bounded the Assignment queue to 50, but the authenticated public database RPC
still accepted `p_limit=100`. A hostile direct PostgREST caller could therefore
request twice the intended tenant/global-admin metadata page. The migration now
rejects every limit above 50, the rollback suite proves `51` returns
`PORTAL_VALIDATION_ERROR`, and all valid queue/keyset fixtures use 50 or less.

The same review made the documented shared-URL role-surface exclusion
executable: the Assignment page latch stays closed whenever intake or
source-detail UI is active, while request-scoped API operation gates remain
independent. A null/undefined source-detail adapter envelope now maps to the
redacted `503 ADAPTER_UNAVAILABLE` boundary instead of falling through to a
generic 500. One dev-only `jsdom@26.1.0` dependency supports seven real
React-mounted Coordinator tests covering SUBMITTED → TRIAGED → OFFERED,
pending duplicate-submit blocking, 409 and malformed-ACK authoritative refresh,
candidate 403 private-detail invalidation and A→B→A late-response isolation for
the independent detail, candidate and mutation trackers.

| Command | Result |
|---|---|
| focused changed-surface Vitest runs | passed, including 7/7 mounted DOM state-flow tests |
| `pnpm test` | 139 files / 1,830 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next.js 16.2.9 generated 64/64 static pages |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 files checked |
| `git diff --check` | passed |
| PostgreSQL 16.15 patched minimum chain + Assignment rollback suite | passed with `ON_ERROR_STOP=1`; 51 rejected, 50 queue/keyset passed, final `ROLLBACK` reached |
| PostgreSQL postcheck | 4/4 Portal flags default-off/Preview-only; checked Auth and Portal fixture counts zero; temporary cluster removed |

Current source identities are:

- migration: 36,127 bytes / SHA-256 `1478122a147dddaffcdfb07aa6dfc29b0162ba27342480984bb6fb96152e3416`;
- rollback assertion: 63,195 bytes / SHA-256 `569c6f50899df1754be1cc4971328b3dfae4a766871941b83b4603bc867bcd9c`;
- TypeScript migration contract: 20,782 bytes / SHA-256 `b41346f82942338ca78cbc6bac4a70dc17c2e57da4ff13df51062463fe88b171`.

The hardening batch itself did not touch a cloud database, deployment, flag or
Production. The exact-current disposable Hosted gate immediately below later
closed Hosted attribution for this commit and these hashes without retaining
activation or touching Production.

### Portal Referral Assignment M1a exact-current Hosted Cookie gate — 2026-08-26

The exact source was HEAD
`43659ab16e9af6d9c73d0a55f8fe8b30b3ce9ee2`. The approved disposable Supabase
Preview was `portal-assignment-m1a-r2-20260826` (id
`3b111420-9f47-4e9f-b3a5-acd418f9423f`, ref
`uzlnwjurzbtwtstabogm`). It was non-default, `persistent=false`,
`with_data=false`, healthy PostgreSQL 17.6
(`server_version_num=170006`) and charged at the confirmed US$0.01344/hour
branch rate.

The exact repository inventory applied 32/32 migrations and all 13
rollback-only suites passed. The Hosted identities matched the current
Assignment migration at 36,127 bytes / SHA-256
`1478122a147dddaffcdfb07aa6dfc29b0162ba27342480984bb6fb96152e3416`
and its rollback assertion at 63,195 bytes / SHA-256
`569c6f50899df1754be1cc4971328b3dfae4a766871941b83b4603bc867bcd9c`.

The first local-HTTPS attempt used a `127.0.0.1` origin and reached the
designed same-origin `403` boundary. Its one-time Auth and Portal fixtures were
fully torn down. The authoritative rerun used the `localhost` same origin and
all eight real SSR-cookie assertions passed:

| Exact-current Hosted Cookie assertion | Result |
|---|---|
| Bearer on the cookie-only Assignment route | `401 AUTH_REQUIRED` before the cookie RPC client |
| operator queue | only Source A; no summary/contact projection and no Source B identifier |
| detail isolation | Source A `200`; Source B and a random valid UUID both uniform `404 NOT_FOUND` |
| triage | `SUBMITTED` v1 → `TRIAGED` v2; exact same-key/body replay returned the identical ACK |
| provider candidates | exactly one active, approved, available Melbourne support-coordination provider |
| offer | `TRIAGED` v2 → `OFFERED` v3; exact replay returned the identical match/ACK |
| final database state | A `OFFERED` v3 with `assigned_provider_id=null`; B unchanged; one offered match, two audit rows and two hash-only mutation receipts |
| revocation | global GoTrue sign-out made the same cookie return `401` |

The terminal independent postcheck proved all four Portal flags disabled and
still Preview-only; all four checked Auth tables and all 11 Portal business
tables empty; both temporary migration roles absent; and all three append-only
triggers enabled. Supabase security advisors returned 21 INFO and 14 WARN;
performance advisors returned 105 INFO and 24 WARN. The Portal security WARN
items were the intentional authenticated `SECURITY DEFINER` RPC surface,
bounded by the application/database gates, internal authorization and explicit
execute grants; the remaining advisor output stays recorded as non-blocking
hardening backlog rather than being silently discarded.

The branch was deleted and three consecutive absence probes found both its id
and ref absent. Only the Production `main` branch remained healthy, and its 19
migration versions were identical before and after the gate. There was no
deployment, merge, retained Preview activation or Production write.

### Portal Referral Provider Response M1b initial source/local checkpoint — 2026-08-26

The default-off M1b slice adds only the approved provider's bounded metadata
inbox and `ACCEPT`/`DECLINE`. Its two HTTP operations are
`GET /api/portal/referral-offers` and
`POST /api/portal/referral-offers/{matchId}/response`; its three public RPCs are
`portal_referral_provider_response_authorize()`,
`portal_referral_provider_response_offers(integer,uuid)` and
`portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)`.
The request-scoped adapter rejects Bearer, derives exact provider authority from
the live cookie/database context, strictly projects seven inbox fields, hashes
server correlation and reuses the original idempotency key when a response is
network-uncertain within the same authorization epoch. The gate-on Provider
Portal does not read legacy provider fixtures or mock metrics.

| Command / gate | Result |
|---|---|
| focused M1b application + migration contracts | 7 files / 244 tests passed |
| `pnpm test` | 142 files / 1,908 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next.js 16.2.9 generated 64/64 static pages |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 files checked |
| `git diff --check` | passed |
| PostgreSQL 16.15 minimum seven-migration chain | then-current M1b applied with `ON_ERROR_STOP=1` after a clean database rebuild |
| M1b rollback-only assertion | passed through final `ROLLBACK`: exact Provider A/B, bounded/no-PII inbox including accepted `CLOSED`, NULL-safe corrupt-state denial, offer-time-only capacity, ACL/search path, forged/stale/cross-provider denial, ACCEPT/DECLINE, replay/conflict and zero residue |
| existing Portal regression assertions | Intake, Source Detail and Assignment all passed after the then-current M1b was applied |
| terminal PostgreSQL postcheck and cleanup | 5/5 Portal flags off/Preview-only; Auth/Portal fixtures zero; client table grants zero; exactly three M1b RPCs with owner+authenticated execution only; append-only audit/receipt triggers enabled; cluster and bootstrap removed |

The then-current database used a disposable Homebrew PostgreSQL 16.15 loopback
cluster with the minimum Supabase-compatible Auth/role/`pgcrypto` bootstrap. It
was stopped and permanently removed after verification. This does not prove
hosted GoTrue, PostgREST, Advisors, true two-session response races or a served
Preview at this initial source/local checkpoint. That checkpoint created no
paid/Hosted Preview, deployment, merge, activation, Production SQL/write or
retained test resource. The historical exact-source Hosted gate immediately
below later closed its recorded GoTrue/PostgREST Cookie and Data API gaps
without retaining activation or touching Production; the post-review section
after it records the subsequent source delta and new local concurrency proof.

### Portal Referral Provider Response M1b historical exact-source Hosted Cookie/Data API gate — 2026-08-26

The exact gated source commit was
`cc1e53cc88666a3e3f18ac55058295db408535ee`. The approved disposable Supabase
Preview was `portal-provider-response-m1b-r1-20260826` (id
`40ae62be-b7ba-4170-a39b-c33972022d10`, ref
`aupndcptwlqmjlgeifdj`) under Production parent
`adocsnwnslxhxcjgbyee`. It was non-default, `persistent=false`, created with
`with_data=false`, reported `ACTIVE_HEALTHY` before use and ran PostgreSQL 17.6
(`server_version_num=170006`); the confirmed branch rate was US$0.01344/hour
plus usage.

Official Supabase CLI 2.115.0 reset the no-data branch and applied the exact
33-file repository migration inventory. Local and remote migration versions
then matched 33/33. The ordered migration-basename inventory had SHA-256
`07102bb3e4697db80b38a2c9ecd67cdede8c98c59db15768903b370371bf5ba2`.
All 14 rollback-only suites passed:
`v1_shadow_contract`, `v1_ndis_shadow_integration`,
`v1_mobile_sync_shadow`, `v1_privacy_review_shadow`,
`portal_referral_workflow_foundation`, `portal_referral_intake_runtime`,
`portal_referral_source_detail_runtime`, `portal_referral_assignment_runtime`,
`portal_referral_provider_response_runtime`,
`v1_note_generation_durable_foundation`,
`v1_note_generation_worker_rpc_shadow`,
`v1_note_generation_owner_runtime_rpc_shadow`,
`v1_note_generation_registration_retirement_shadow` and
`migration_entry_role_restore`. The last used only short-lived `LOGIN` and
`NOLOGIN CREATEROLE` actors and proved `session_user <> current_user`; both
external roles and the suite's internal temporary role were removed.

The exact M1b migration was 21,868 bytes / SHA-256
`2ab4bb434f1a40432061f7a77c0e075dd55dc872467f67c9d545c04fe73ad04c`;
its rollback assertion was 46,392 bytes / SHA-256
`76aab212a45adc57ffbd8686e5e7cd515bd43b9611bdf4e6f22535475f9aa71a`;
and its migration-contract test was 16,215 bytes / SHA-256
`ab41392f01dcd98a792f571a0ec7eabb1f36dbbfdaea6d2eac84d612647a6047`.

Two auto-confirmed one-time GoTrue password users, separate organization and
approved-provider contexts, and three offered referrals exercised the exact
Next source over local HTTPS. The application used `VERCEL_ENV=preview`, the
exact branch-ref pin, and only the base, durable-adapter and Provider Response
application gates. Intake, Source Detail and Assignment stayed off; at the
database layer, only the master and Provider Response rows were enabled. It
received the branch URL and publishable key; the service role was confined to
one-time Auth administration, while the non-pooling database credential was
confined to fixture setup and verification. Neither entered the application
environment. Separate real SSR-cookie jars drove Provider A and Provider B
through Hosted GoTrue and PostgREST.

All 14 Hosted harness assertions were true:

| Historical exact-source Hosted Cookie/Data API assertion | Result |
|---|---|
| `noCookieRejected` | no-cookie offers `GET` returned `401 AUTH_REQUIRED` |
| `bearerRejected` | adding any `Authorization` header to A's valid Cookie `GET` and otherwise-valid response `POST` returned `401 AUTH_REQUIRED` before mutation; all three referrals/matches remained `OFFERED` and audit/receipt counts remained zero |
| `pageRendered` | `/provider-portal` returned `200` over the same local HTTPS origin, rendered `Authorized provider offers` and exposed no fixture-private value |
| `tenantListsExact` | both GETs returned `200`; A received exactly two and B exactly one own-tenant `OFFERED`/`OFFERED` v3 offer, ordered by ascending match ID; each item had only the seven bounded fields and no PII |
| `crossProviderHidden` | A responding to B's match, B responding to A's match and A using a random valid UUID each returned uniform `404 NOT_FOUND`; the separate lists exposed no cross-provider row |
| `transportRejected` | A's valid Cookie mutation with Origin `https://127.0.0.1:3107` returned `403 FORBIDDEN`; `text/plain` returned `400 VALIDATION_ERROR`; neither changed data |
| `staleRejected` | B's own match with `expectedVersion=2` returned `409 STALE_REFERRAL` with zero side effects |
| `acceptReplayStable` | A remained `UNAVAILABLE` yet the first accept returned `200`, proving capacity was an offer-time condition: match/referral became `ACCEPTED`, Provider A was assigned and match/referral versions became v2/v4; exact same-key/body replay returned the identical ACK without a second write |
| `idempotencyConflict` | reusing the successful accept key with changed decision returned `409 IDEMPOTENCY_CONFLICT` |
| `declineReplayStable` | A's first decline returned `200`: match became `DECLINED`, referral returned to `TRIAGED` unassigned at v2/v4; exact replay returned the identical ACK without a second write |
| `finalListExact` | A listed only its accepted `ACCEPTED`/`ACCEPTED` v4 row; B still listed only its untouched `OFFERED`/`OFFERED` v3 row |
| `finalDatabaseExact` | exactly two audit events and two receipts existed; recomputed SHA-256 values exactly matched audit mutation/correlation hashes and receipt mutation/payload hashes, no raw idempotency key or correlation ID was stored, and each decision's four checked authoritative timestamps exactly matched its returned ACK |
| `providerARevoked` | after global GoTrue sign-out, A's still-unexpired JWT's `session_id` was absent from `auth.sessions`; the old Cookie returned `401 SESSION_REVOKED` for offers `GET` and the original accept replay `POST` |
| `providerBRevoked` | after global GoTrue sign-out, B's `session_id` was absent from `auth.sessions`; its old Cookie returned `401 SESSION_REVOKED` for offers `GET` |

The terminal teardown left all five Portal flags disabled, removed both users
and every fixture, and proved all four checked Auth tables plus all 11 Portal
business tables globally empty. All five flags remained false and Preview-only,
and all three append-only follow-up/receipt/audit triggers remained enabled.
The independent postcheck also retained zero API-role Portal table grants; the
exact six M1b functions' `postgres` ownership, `SECURITY DEFINER`, volatility,
empty `search_path` and public/authenticated/private ACL posture; the
valid/ready/live inbox index; and zero temporary migration roles.
Security advisors returned 21 INFO, 17 WARN and zero ERROR;
performance advisors returned 105 INFO, 24 WARN and zero ERROR. The WARN output
remains recorded hardening backlog and was not treated as silent success.

The Preview was deleted, and three consecutive absence probes found both its
id and ref absent. The retained default Production branch reported
`ACTIVE_HEALTHY`; its 19 migration versions were identical before and after the
gate. No Vercel deployment, merge, retained activation, Production SQL/Auth/data access or
Production write occurred.

### Portal Referral Provider Response M1b post-review hardening — 2026-08-26

Implementation source `f45b19c596edd0bdbe01eba17e6e5fa136df5225`
postdates the deleted `cc1e53cc88666a3e3f18ac55058295db408535ee`
Hosted run. It fixes the final PR review findings without changing the
default-off/Production-unapplied boundary:

- the one-page inbox selects live `OFFERED` rows before `ACCEPTED` history,
  returns the chosen rows in strict ascending match-ID DTO order and rejects the
  frozen non-null cursor until a real pagination contract exists;
- fetch plus response-body parsing share a 10-second timeout;
- pending actions and manual refresh are mutually excluded, and every action
  has a unique safe accessible name;
- browser focus, visible-tab, auth-storage and persisted-page transitions clear
  the old projection and old uncertain command before reauthorization. An
  in-flight request from an older authorization epoch cannot restore its key,
  so a different member of the same provider never inherits another actor's
  intent; and
- a retained local-only PostgreSQL 16 harness opens distinct backend PIDs and
  tests replay, competing decisions, session/provider/flag revocation during
  waits, and M1b-decline-to-M1a-offer lock ordering.

| Post-review command / gate | Exact result |
|---|---|
| focused M1b app, migration and concurrency contracts | 8 files / 271 tests passed |
| `pnpm test` | 143 files / 1,935 tests passed |
| TypeScript and full lint | passed |
| `pnpm build` | Next.js 16.2.9; 64/64 static pages generated |
| adapter and patch checks | 73 adapters in sync; `git diff --check` passed |
| PostgreSQL 16.15 minimum chain and rollback suites | 7/7 migrations; Intake, Source Detail, Assignment and Provider Response 4/4 |
| true two-backend concurrency | 6/6 scenarios passed; same-key single effect, exactly one different-key winner, three post-wait revocations fail closed, and decline→offer completed without deadlock |
| concurrency policy contracts | harness-focused 16/16 and five Preview-policy files / 91 tests passed; Node syntax and ESLint passed |
| terminal local cleanup | support schema/runner absent; all five flags disabled; Auth/Portal fixtures zero; PostgreSQL stopped, temporary directories removed and port 55432 closed |

The exact post-review M1b migration is 22,513 bytes / SHA-256
`256f713df793d4cbae5b6c63119f2acb26460f73bf963ffde3f72f465384e0a6`;
the rollback assertion is 52,339 bytes / SHA-256
`b939a5f0e3e3536b4b245f48acc5d801b1ad64361ff89a2560e08065bc571f0c`;
and the migration-contract test is 16,647 bytes / SHA-256
`adb384b745bf0e26ddb4d85811bf096e1ea8e9bdbdd968e4232616f3417f3b4a`.

This checkpoint created no Hosted Preview, deployment, activation or
Production write. The deleted `cc1e53c` evidence remains valid only for that
older exact source. The later exact-gate-source disposable re-gate is recorded in
the next section; it closes this evidence gap without authorizing merge,
deployment, activation or Production application.

### Portal Referral Provider Response M1b exact-source Hosted re-gate — 2026-08-26

Exact gate source HEAD was
`44f3bd68699dc953e2666bf033dac2b5e26a4d30`, a documentation-only child of
implementation source `f45b19c596edd0bdbe01eba17e6e5fa136df5225`.
The confirmed disposable Supabase Preview was
`portal-provider-response-m1b-r2-20260826` (id
`fb2e7d39-436d-48d5-a890-ad53b23b1fc6`; ref
`nhupgyxczlvtddycrgyw`), non-default, `persistent=false`, `with_data=false` and
`ACTIVE_HEALTHY` under Production parent `adocsnwnslxhxcjgbyee`.

| Exact-source Hosted gate | Result |
|---|---|
| source/static preflight | clean exact HEAD; 33 local migrations; ordered basename SHA-256 `07102bb3e4697db80b38a2c9ecd67cdede8c98c59db15768903b370371bf5ba2`; M1b migration/assertion/contract hashes matched Section 31 evidence |
| remote migration manifest | 33/33 exact local/remote versions; ordered content SHA-256 `168212c92ac6bcdc646c52f74bf0dc72b716120f3ef3de8d3768a2a190dad8a2` |
| rollback suites | 14/14 passed; Hosted role restoration proved distinct login/entry actors on one PostgreSQL 17.6 connection and removed all temporary roles |
| focused regression | 8 files / 271 tests passed |
| exact production build | Next.js 16.2.9; 64/64 pages generated |
| built-in browser | real Provider Portal workbench rendered; signed-out stable state was correct; zero console errors and no Next error overlay |
| real historical Cookie/Data API matrix | 14/14 true: the same named no-cookie, Bearer, render, tenant, cross-provider, transport, stale, replay/conflict, final list/database and saved-Cookie revocation assertions in the historical table above, now against the exact gate source |
| active-first delta | two live higher-id `OFFERED` rows plus the lowest 48 of 50 `ACCEPTED` history rows were the exact selected 50; returned DTO order remained ascending and no private sentinel appeared |
| cursor delta | direct authenticated PostgREST rejected non-null `p_after_match_id` with `PORTAL_VALIDATION_ERROR` |
| exact final database | ACCEPT/DECLINE/unchanged-B actor, status, match/referral versions and assignment fields were exact; recomputed audit mutation/correlation and receipt mutation/payload hashes matched; raw identifiers were absent; authoritative timestamps matched ACKs |
| terminal teardown | five flags disabled/Preview-only; four Auth tables and 11 Portal fixture domains zero; three append-only triggers enabled; zero API Portal table privileges; zero temporary migration roles |
| Advisors after cleanup | security 21 INFO / 17 WARN / 0 ERROR; performance 106 INFO / 24 WARN / 0 ERROR. The real inbox query used its dedicated index, so final performance had one fewer unused-index INFO than the pre-matrix snapshot |
| disposable deletion | local link, recovery state, certificate/key and harness removed; branch id/ref absent in three consecutive probes |
| Production boundary | default project remained `ACTIVE_HEALTHY`; exact 19 migration versions unchanged; no Production SQL, Auth, Data API, route or other write |

A preliminary reverse-proxy harness run returned `403` at the HTTPS transport
guard before mutation because Next did not receive a native TLS request URL.
Its `finally` cleanup already proved zero Auth/Portal residue. The replacement
native-TLS rerun produced the complete passing matrix above. No key, password,
Cookie, JWT, raw idempotency key or correlation id was printed or retained.
Lifecycle/coalescing/in-flight/timeout fault scenarios remain attributed to the
exact-source 271 focused tests, not to this minimal Hosted API matrix. The later
response-focus and sign-in recovery work below is not attributed to either
result.

This closed the then-current post-review Hosted re-gate for exact source
`44f3bd6` only. It does not cover the later UI source below, deploy Vercel, merge
the PR, retain or activate a runtime, apply Production, or add accepted-provider
private detail, follow-up, notification, audit listing or document/export
behavior.

### Portal Referral Provider Response M1b post-gate UI recovery — 2026-08-26

The current PR's later UI-only source fixes the two final-review P2 findings:

- lost keyboard focus moves to an accurate live result while the authoritative
  list refreshes, then falls back only when the focused interim node disappears;
  connected focus chosen by the user during a slow POST or GET is preserved;
- an `AUTH_REQUIRED` response renders and focuses the exact same-origin
  `/auth/login?next=%2Fprovider-portal` recovery link.

The regression assertions were added first and reproduced the missing waiting
state plus both completion and slow-POST focus theft before the implementation
passed them. Final local results were 8 focused files / 274 tests, 143 files /
1,938 tests, TypeScript, full lint, the Next.js 16.2.9 64/64-page production
build, 73 adapters in sync and a clean `git diff --check`.

This source changes no route, server adapter, migration, RPC, database grant,
flag or Production boundary. It postdates exact Hosted gate source `44f3bd6` and
has no new paid Preview, Hosted/browser re-gate, Vercel deployment, merge,
activation or Production evidence.

### Portal Referral Follow-up M1c source/local checkpoint — 2026-08-26

The first real M1c batch adds an independently gated approved-provider detail
and fixed-code follow-up flow. The database must prove the exact assigned
provider, one coherent accepted match and `ACCEPTED | IN_PROGRESS` before
returning summary/contact. Mutation input is limited to expected version and
one of five fixed outcomes; no free text, due date, history, actor/provider
identity or operator/source write is served. Success atomically updates the
referral version and writes one append-only follow-up, metadata-only audit and
hash-only receipt.

Tests were written red first. Independent review then exercised the complete
client async state machine and closed the route-reuse, stale-completion,
lifecycle-worker, per-resource pending and enable/disable ABA findings. Private
detail is bound to the committed referral plus authorization epoch; stale work
cannot revive another referral or release a write before an authoritative GET.
Uncertain replay retains referral/status/version, outcome and key only inside
the same authorization epoch, never summary/contact. The final independent
review found no remaining P0/P1.

| Command / gate | Result |
|---|---|
| focused M1c application + migration contracts | 11 files / 336 tests passed |
| `pnpm test` | 147 files / 2,011 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed after sandbox-only local process approval; Next.js 16.2.9 generated 64/64 pages |
| PostgreSQL 16 minimum Portal chain | eight exact migration files clean-applied; Follow-up migration completed with all six flags default-off/Preview-only |
| M1c rollback-only assertion | 1,171 lines executed through final `ROLLBACK`: exact Provider A/B detail isolation, fixed-code record, replay/conflict/stale/state, ACL/search path, atomic side effects and cleanup |
| existing Portal regression assertions | Foundation, Intake, Source Detail, Assignment and Provider Response all passed after M1c was applied |
| terminal PostgreSQL postcheck and cleanup | six flags off/Preview-only; Auth/Portal fixtures zero; three append-only triggers enabled; temporary cluster stopped and deleted |

This initial source checkpoint created no true two-backend M1c race result.
The later local gate below closes that one evidence gap only. It still creates
no Hosted GoTrue/PostgREST/Data API gate, paid or retained Preview, Vercel
deployment, merge, activation or Production SQL/write. Follow-up history,
`next_due_at`, notifications, audit listing and document/export remain deferred.

### Portal Referral Follow-up M1c true-concurrency local gate — 2026-08-26

The retained M1c gate is a one-command, local-only PostgreSQL 16 lifecycle. It
creates a fresh passwordless server with no TCP listener and exposes only a
private `0700` Unix socket below its owned `0700` temporary root; host
authentication is explicitly `reject`. It pins the exact eight-migration
manifest, bootstrap/setup/cleanup SHA-256 bodies and complete live-harness
source body, then opens distinct backend PIDs through a least-privilege runner.
Teardown makes the runner `NOLOGIN`, drains only its exact sessions, performs
cleanup and terminal postcheck, confirms PostgreSQL stopped and deletes the
exact owned temporary directory. It rejects Hosted targets, public/arbitrary
socket paths, passwords and generic database/`PG*` environment fallbacks.

| Command / gate | Exact result |
|---|---|
| focused live-harness and lifecycle policy tests | 2 files / 28 tests passed |
| `pnpm test` | 149 files / 2,039 tests passed |
| `pnpm exec tsc --noEmit --incremental false` and `pnpm lint` | passed |
| current M1c rollback-only assertion | all 1,249 lines executed through final `ROLLBACK`, including lock-aligned replay and `CLOSED` residual-binding denial |
| exact database chain | PostgreSQL 16.15; 8/8 migrations; manifest SHA-256 `540562a57ed1e242354c6e02bf62e18eb0e6e3ecba7a5a4ef6e070d402482f9e` |
| true multi-backend M1c concurrency | exact-current 8/8 twice on independent fresh private-socket clusters with internal high-port identifiers `50950` and `55918`: same-key replay, changed-payload conflict, different-key stale loser, same-provider actor scoping, session/provider/flag revoke-first, and ownership revoke with the old receipt replay started while revoke locks were still held, then denied after commit |
| exact executable evidence | live harness `5cd432e1da2f6cefef7f8e86d7a557b0d2fe7e5d937d8e45189c0558ffe833f1`; bootstrap `b4d880a79275062e87e42014b5d1d1a8d9d77deb3dc5d7a25fb15239c1aea252`; setup `f86e76ccbce57a3ede4aacba2d1b29b5d280fca154a399b2cbb6a12e26d7d533`; cleanup `2c83c9c1b6f06fd6927036cfd4174dbad5e063bf26171a64cc02f50aca732b42` |
| terminal cleanup | runner quiesced; SQL cleanup and independent postcheck passed; all six flags disabled/Preview-only; Auth/Portal fixtures zero; three append-only triggers enabled; PostgreSQL stopped normally; exact temp root removed |

The blocker proof accepts PostgreSQL's documented lock-queue shape: every
waiter must be in `Lock` wait and reach the intended controller PID through a
graph containing only the scenario's known backend PIDs. Unknown PIDs, self
edges or a chain that cannot reach the controller fail closed. This gate used
no Supabase cloud service and adds no Hosted Auth/Data API, deployment,
activation, merge or Production evidence.

The post-review replay path now takes the same referral-then-ordered-match
locks as a fresh mutation, rechecks the session after those locks, and requires
the current provider assignment, `ACCEPTED | IN_PROGRESS` referral state and
exactly one coherent accepted match before reusing an ACK. A `CLOSED` referral
with deliberately retained historical bindings fails `PORTAL_NOT_FOUND`.
The outer lifecycle verifies the exact live-harness bytes before execution; a
mutation test removes a real scenario call while leaving its self-reported
completion entry and proves the gate fails closed.

### Portal Referral Assignment M1a disposable Hosted Cookie gate — 2026-08-25

The exact source commit was
`526aa1efba281ee1e6e671ffb2a20d40cce1999b`. The approved disposable Supabase
Preview was `portal-assignment-m1a-r1-20260825` (id
`5b509a27-925b-4cd4-9924-603d8a0d8470`, ref
`scyathyvzyopukbdutps`) under Production parent
`adocsnwnslxhxcjgbyee`. It was non-default, `persistent=false`,
`with_data=false`, healthy and charged at the confirmed US$0.01344/hour branch
rate. Production was never a SQL, Auth or application target.

Official Supabase CLI 2.115.0 reset the linked no-data branch and applied the
exact 32-file repository migration chain. `migration list --linked` then
matched all 32 local/remote versions, and the Hosted database reported
`server_version_num=170006`. All 13 rollback-only SQL suites passed. Twelve ran
directly with the branch non-pooling URL; the migration-entry-role suite also
passed under a short-lived LOGIN runner after `SET ROLE` to a short-lived
`CREATEROLE` entry actor. Both roles were removed. The independent baseline and
postchecks retained four default-off/Preview-only Portal flags, the exact 32
migration rows, no temporary roles and zero Auth/Portal fixtures before the
runtime setup.

One auto-confirmed, one-time GoTrue password user exercised the exact Next
source over local HTTPS with `VERCEL_ENV=preview`, the exact branch-ref pin,
base/durable/Assignment application gates on and Intake/Source Detail gates
off. The app received only the branch URL and publishable key; the branch
service-role key was confined to one-time Auth administration and never entered
the application environment. The SSR client produced the real Supabase Auth
cookie consumed by the Next routes and Hosted GoTrue/PostgREST RPCs.

| Hosted Cookie assertion | Result |
|---|---|
| Bearer on the cookie-only Assignment route | `401 AUTH_REQUIRED` before the cookie RPC client |
| operator queue | only Source A; no summary/contact projection and no Source B identifier |
| detail isolation | Source A `200`; Source B and a random valid UUID both uniform `404 NOT_FOUND` |
| triage | `SUBMITTED` v1 → `TRIAGED` v2; exact same-key/body replay returned the identical ACK |
| provider candidates | exactly the one active, approved, available Melbourne support-coordination provider |
| offer | `TRIAGED` v2 → `OFFERED` v3; exact replay returned the identical match/ACK |
| final database state | A `OFFERED` v3 with `assigned_provider_id=null`; B unchanged; one offered match, two audit rows and two receipts with hash-only command fields |
| revocation | global GoTrue sign-out made the same cookie return `401` |

The fixed teardown closed master then Assignment, transactionally removed the
two audit/receipt rows, match, private contacts, referrals, provider,
memberships and organizations, restored both append-only triggers, hard-deleted
the Auth user and proved its old password grant failed. Auth users, identities,
sessions and refresh tokens plus every Portal fixture table and enabled flag
were zero. The local HTTPS process, certificate, test harness and Supabase link
were removed. The branch was deleted, and three consecutive branch-list probes
found its id/ref absent while the sole default Production branch remained
`ACTIVE_HEALTHY`.

This closes exact-revision Hosted GoTrue/PostgREST cookie and database evidence
for pre-review commit `526aa1e`. The exact-current 2026-08-26 gate above now
covers the later queue-bound hardening; this historical run remains separate
and is not a Vercel Preview deployment, retained activation, Production
approval or evidence for provider response M1b.

### Five-Note generation source/offline checkpoint — 2026-08-20

Communication, Handover, Progress, NDIS and Incident Factual now share one
server-only catalog dispatcher, one provider port and one canonical output
builder. The fake job unit of work proves `QUEUED`, `RUNNING`, `SUCCEEDED`,
`FAILED` and `CANCELLED`; owner-scoped replay and changed-payload conflict;
response-loss recovery; cancel/late-output handling; canonical document plus
revision-1 success; and zero canonical result on provider or atomic-store
failure. Admission validates a fresh session, bounded cleaned facts and an
exact privacy-proof binding, then checks the initiating session and proof again
before commit. The durable port contract requires those checks to run inside
the future database transaction.

Output tests cover all five adjacent schemas, exact provider-owned fields,
server-injected facts/disclaimer, canonical UTF-8 hash, bounds, obvious
identifier rejection, catalog prohibited-decision literals and runtime
revalidation of the read-only legacy NDIS material adapter. These are not
complete semantic/model golden sets.

| Command | Result |
|---|---|
| focused Note generation gate | 2 files, 68 tests passed |
| `pnpm test` | 114 files, 1,051 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

`CARESLINK_V1_NOTE_GENERATION_READY` remains compile-time `false`. At this
historical checkpoint there was no served route, database durable job
table/repository, registered worker, model/STT call, database write, Points
port, export renderer or generation UI. No migration or SQL assertion was
added or executed in that batch.

### Durable Note generation internal contract checkpoint — 2026-08-20

`src/lib/v1/note-generation-durable.ts` and its test add a source-only,
server-internal repository contract plus an explicitly `TEST_ONLY` memory fake.
`documentation/v1-note-generation-durable-design.md` records the future private
database and worker boundary. The source evidence covers metadata-only enqueue
and owner-scoped replay, concurrent attempt claim, lease renewal and expiry,
explicit bounded recovery, stale-worker fencing, cancellation/terminal
invariants, response-loss replay, and atomic canonical document plus revision-1
success.

Claim does not expose the payload handle. A separate worker-private payload-use
operation requires exact current memory session/privacy bindings for the same
job, attempt and lease before returning the test handle and recording
`payloadAuthorizedAt`. Missing authorization blocks canonical commit; failed
bindings close the attempt/job and remove payload availability; recovered
attempts do not inherit authorization. Canonical success revalidates the
binding, server-owned output shape/disclaimer, reviewed-facts hash, mutation
identity, canonical UTF-8 hash and monotonic transaction time. Owner-safe views
exclude session, privacy, idempotency, payload, lease and worker metadata.

| Command | Result |
|---|---|
| focused durable generation gate | 1 file, 38 tests passed |
| adjacent Note generation gate | 3 files, 106 tests passed |
| `pnpm test` | 115 files, 1,089 tests passed; preserves 114 / 1,051 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

`CARESLINK_V1_NOTE_GENERATION_DURABLE_READY` and
`CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY` remain `false`. There is
no served route, database migration/repository, registered worker, payload
vault/retention policy, real model/STT call, Points integration or deployment.
The memory binding tests do not fresh-read live `auth.sessions`, `auth.users` or
privacy rows and are not Preview/Production revocation E2E evidence. A future
database implementation must prove those checks and canonical persistence in
one transaction on a disposable Preview before activation.

### Note worker, provider and payload policy checkpoint — 2026-08-20

Three server-only modules extend the default-off Note design without enabling a
worker or model. The worker policy has no approved runtime entry and requires a
complete digest-bound definition for queue age, lease, heartbeat, attempt/provider
deadline, commit margin, retry vector, retry outcomes, recovery batch and
jitter. The provider policy has no configured provider or model. It binds all
five Note types to exact provider/model/revision, prompt, golden-set, parser,
service and rate-catalog versions; an actual digest-verified `APPROVED` worker policy is
the only deadline authority. Missing usage and cost remain explicitly
`UNAVAILABLE` rather than zero, and provider cost cannot alter the approved
Points rate.

The payload contract has no current retention policy or backend. Its explicit
`TEST_ONLY` memory fake validates all five canonical fact shapes, clamps expiry
to the privacy proof, issues an attempt-bound single-consumption grant, and
rechecks RUNNING job/attempt plus current session/privacy bindings before facts
are released. It models logical revoke, idempotent physical-purge evidence and
owner-safe views, but is intentionally plaintext and non-durable. Its tests are
binding evidence only: they do not live-read Auth/privacy rows or prove
encryption, KMS, deletion, backups or restore non-resurrection.

| Command | Result |
|---|---|
| focused policy/payload gate | 3 files, 104 tests passed |
| adjacent Note generation gate | 6 files, 210 tests passed |
| `pnpm test` | 118 files, 1,193 tests passed; preserves 115 / 1,089 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

Activation remains blocked until approved worker values, provider/model and
governance versions, retention/purge values, vault/KMS/region/backup decisions,
a registered worker, a database transaction clock, live session/privacy checks
and disposable-Preview negative tests all exist. No network, model, STT,
database, Points, Preview or Production action is evidence of this checkpoint.

### Registered Note worker v2 source checkpoint — 2026-08-20

`src/lib/v1/note-generation-registered-worker.ts` adds a source-only,
default-off orchestration contract without registering or deploying a worker.
The runtime registry is empty and the sole factory is `TEST_ONLY`. A canonical
registration digest binds worker identity, contract/schema, the approved worker
policy, all five Note provider policies and the payload-policy snapshot.

The local control-flow evidence covers five Note types across all three locales;
payload authorization before single consumption; strict grant/deadline checks;
provider timeout and heartbeat fencing; content-free provider evidence;
non-success finish reasons; exact retry, jitter and attempt limits; commit and
settlement response-loss recovery; canonical revision 1; and metadata-only
outcomes. There is no old payload locator, Points port, network, environment,
database or route dependency.

| Command | Result |
|---|---|
| focused registered-worker gate | 1 file, 43 tests passed |
| adjacent Note generation gate | 7 files, 253 tests passed |
| `pnpm test` | 119 files, 1,236 tests passed; preserves 118 / 1,193 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

Independent review found no current P0/P1 in this source-only batch. Activation
remains blocked on a real durable database transaction that atomically persists
canonical revision 1, sync change, mutation receipt and payload logical revoke;
fresh `auth.users`/`auth.sessions` and privacy-proof reads in the same short
authorization transaction; approved worker identity/policies; a real scheduler;
and disposable-Preview lease, recovery, revocation and response-loss evidence.

### Registered-worker database/vault adapter source checkpoint — 2026-08-20

`src/lib/v1/note-generation-registered-worker-adapter.server.ts` adds a
source-only, default-off composite adapter for the v2 registered-worker ports.
It defines nine exact abstract privileged RPC calls and one injected one-time
vault-consume port. No Supabase client, URL, credential, environment lookup,
route or runtime registry is present, and the only factory remains
`TEST_ONLY`.

The adapter rejects caller-supplied owner/session/time/retry/facts/locator
authority; binds each claim to a cleaned-facts hash; compares database-derived
Note type, contract/schema and facts hash before decrypting; and revalidates
typed, bounded canonical facts before provider use. Canonical success and
response-loss replay strictly rebuild NoteContent and provider evidence, then
require one composite acknowledgement for revision 1, sync, a
`CREATE_DOCUMENT` mutation receipt, job/attempt terminal bindings, payload
logical revocation and purge enqueue. Failure/retry acknowledgements bind the
approved retry policy, exact provider-evidence hash and the shared payload and
attempt status vocabularies.

| Command | Result |
|---|---|
| focused adapter gate | 1 file, 46 tests passed |
| worker + adapter gate | 2 files, 91 tests passed |
| adjacent Note generation gate | 8 files, 301 tests passed |
| `pnpm test` | 120 files, 1,284 tests passed; preserves 119 / 1,236, 118 / 1,193 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |

This is parser/control-flow evidence, not a database transaction attestation.
Supabase CLI was unavailable and the task remained offline, so no migration was
generated, no SQL or rollback assertion ran, no RLS/ACL role topology was
created, no database/vault/Preview was contacted and no execute grant was made.
The composite acknowledgement becomes meaningful only after the exact future
migration passes clean-apply, role, RLS, concurrency, revocation, replay,
atomic-failure and purge-outbox assertions on a disposable Preview.

### Durable Note metadata schema-only checkpoint — 2026-08-21

The next local batch rechecked current official Supabase migration, Data API,
RLS, role and function-security guidance, then used Supabase CLI 2.115.0 to
generate
`supabase/migrations/20260820135834_add_v1_note_generation_durable_shadow.sql`.
The migration creates only two dedicated non-login roles, the private
`careslink_v1_generation` schema, one forced-off settings row, metadata-only
jobs/attempts and ten supporting indexes. All three tables enable and force
RLS, define no policy and expose no privilege to `PUBLIC`, `anon`,
`authenticated`, `service_role` or the future executor.
On PostgreSQL 16+, a non-superuser role creator retains only the automatic
bootstrap-granted admin edge for each dedicated role; the assertions require
`INHERIT=false` and `SET=false`, and reject every API-role, executor-member or
other membership edge. The temporary non-inheriting `SET` edge used for object
ownership is grantor-scoped and revoked by the migration.

`supabase/assertions/v1_note_generation_durable_foundation_assertions.sql` is a
manual rollback-only assertion source. It freezes exact objects, roles,
ownership, effective default ACLs, columns, constraint/index names and actions,
then uses
transaction-only owner access to exercise state/hash/time/composite-owner and
single-running-attempt failures. That temporary test access is restored before
the final rollback and is not part of the migration. The former
`information_schema` body ran on PostgreSQL 17 and rolled back at its constraint
catalog check. The repaired `pg_constraint` revision subsequently passed as one
rollback-only request on fresh `r3` and again as part of the complete `r4`
cross-domain gate; the TypeScript source test additionally locks exact index
and foreign-key definitions.

| Command | Result |
|---|---|
| focused migration contract | 1 file / 10 tests passed |
| adjacent Note generation tests | 9 files / 311 tests passed |
| `pnpm test` | 121 files / 1,294 tests passed; preserves 120 / 1,284, 119 / 1,236 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 63/63 |
| focused ESLint and `git diff --check` | passed |

This remains a schema-only foundation, not a durable database implementation.
At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`, deleted disposable `r4`
passed the same 13-file clean-apply 13/13 plus the durable and all five adjacent
rollback suites 6/6, including the repaired privacy-bound Portal Referral
fixture. There is no retained Preview, pgTAP run, function, RPC, payload
metadata/grant, vault, purge outbox, worker registration, runtime flag, model
call, Points call or Production migration apply. The next database phase must
separately implement and prove those boundaries; this checkpoint does not
prove `SKIP LOCKED`, live session/privacy route E2E or atomic canonical
persistence through a callable RPC.

### Durable Note worker RPC shadow source checkpoint — 2026-08-21

The next local batch used the CLI-generated filename
`supabase/migrations/20260821071044_add_v1_note_generation_worker_rpc_shadow.sql`.
It adds nine private metadata tables—worker, provider and payload policy
catalogs; worker registrations and their five-Note provider bindings; payloads;
single-use payload grants; provider evidence; and the payload purge outbox—and
extends jobs/attempts with the bindings required by the registered-worker
adapter. It also defines the nine exact private claim, heartbeat, fence,
success-commit, failure-settle, attempt-resolve, expired-recover,
payload-authorize and payload-consume RPC identities.

This is source-only and fail-closed. The migration seeds no policy catalog,
worker registration or payload, and the existing settings row remains hard-off.
All twelve private tables have RLS plus FORCE RLS. The new policies and object
ACLs admit only the narrow operations needed by the distinct non-login,
non-superuser, non-`BYPASSRLS` executor; all RPCs are executor-owned
`SECURITY DEFINER` functions with exact signatures and `search_path=''`.
`PUBLIC`, `anon`, `authenticated` and `service_role` have no `EXECUTE`, so the
functions are neither a Data API surface nor a worker credential.

The RPC source uses the database transaction clock and fresh Auth/session and
privacy-proof reads, and its success envelope binds canonical document,
revision 1, sync change, `CREATE_DOCUMENT` mutation receipt, provider evidence,
terminal job/attempt, payload logical revocation and purge enqueue. The
rollback-only worker assertion checks exact top-level envelopes, allowlisted
nested fields and persisted metadata relationships, plus replay/conflict
behavior, retries, recovery and rollback atomicity. The TypeScript adapter
parser performs the stricter nested exact-key validation; matching database
nested exact-key vectors remain an activation gate. The earlier
durable-foundation assertion is now additive-aware: it retains the required three-table foundation checks when
the separately reviewed worker extension is present, while the worker assertion
owns the exact extension tables, policies, functions and executor ACL surface.
Both revised assertions later passed on deleted disposable `r9`; that isolated
evidence is recorded below and is not a retained/runtime apply.

Vault backend, KMS, retention and purge operations remain undecided. Therefore
a valid normal consume can only atomically return `DENIED_SETTLED` with
`PAYLOAD_UNAVAILABLE`; it never emits a `vaultGrant`, locator, token or raw
facts. The worker assertion directly marks a grant `CONSUMED` only inside its
rollback transaction to exercise canonical success/failure atomicity. That
explicit `TEST_ONLY` bridge is not payload-consume, vault, encryption, purge or
account-deletion E2E evidence.

Pre-r9 local source evidence at exact commit
`5692ddc0427cba10f5311071fdea6c886ef13d2d`:

| Command | Result |
|---|---|
| adjacent Note generation tests | 10 files / 348 tests passed |
| `pnpm test` | 122 files / 1,331 tests passed; preserves the 121 / 1,294 and 90 / 653 historical baselines |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

Deleted disposable `r9` later closed the exact PostgreSQL 17.6 clean-apply,
seven-suite rollback, role/ACL/function and zero-fixture/flags-off gates.
At that `r9` checkpoint, activation evidence was still open for the PostgreSQL
16 path, owner A/B runtime integration, true two-session/two-connection
`SKIP LOCKED` claims and concurrent session/privacy-revocation locks, plus
response-loss replay after attempt 2 had already succeeded. The later `r20`
and `r21` gates recorded below close the PostgreSQL 17.6 two-session race and
attempt-2 historical-replay subsets respectively.
That checkpoint still required catalog/registration rows to remain append-only
or gain a reviewed `RESTRICT` attempt-registration foreign key plus index. The
current source checkpoint below selects the FK/index option, and deleted `r22`
subsequently closes its PostgreSQL 17.6 hosted migration/assertion gate.
Governance must still prove purge/outbox cross-state recovery with account
deletion. Before a real provider starts, `startedAt` must bind to a consumed
grant and a fresh post-consume lease/heartbeat check. Before an executor caller
is treated as untrusted, sequential JSON numeric parsing must use explicit
type/regex/safe-cast gates.
No route, worker, model, STT, Points, Preview application/runtime, Production
migration, deployment or user flow was enabled or exercised by this checkpoint.

### First durable-metadata disposable Preview attempt — 2026-08-21

A fresh non-default Supabase branch reported `with_data=false`, PostgreSQL 17
(`server_version_num=170006`) and zero rows in the checked Auth and legacy
tables. The parent branch migration history was not a strict prefix of this
repository, so no automatic migration-history suffix was assumed. The reviewed
13-file local suffix was submitted individually in source order rather than
repairing or resetting remote history. The first 12 source files applied
successfully on the disposable branch. The thirteenth,
`20260820135834_add_v1_note_generation_durable_shadow.sql`, failed with
PostgreSQL `42501 permission denied to change default privileges` at the owner
default-ACL step.

The failed thirteenth migration was atomic: read-only checks found neither the
`careslink_v1_generation` schema nor either dedicated generation role after the
error. The exact disposable branch was then deleted and its absence was
verified. Production was not used as the SQL target; no deployment, capability,
grant, route or user traffic was enabled. This is failure and cleanup evidence,
not a successful Preview proof.

The then-current source fix used the temporary non-inheriting membership to
`SET ROLE` to the dedicated owner, changed that owner's global default ACL as
itself, and used `RESET ROLE` before object creation. The later 2026-08-25
Hosted role-restoration gate superseded that exit: current source explicitly
restores the captured file-entry actor and still avoids the redundant schema
revoke after ownership transfer.

### Second durable-metadata disposable Preview attempt — 2026-08-21

A fresh non-default `with_data=false` PostgreSQL 17 branch repeated the same
zero-data and absent-target preflight. All 13 exact source migrations then
applied successfully in order, including the hosted-safe metadata migration;
the earlier `42501` did not recur. This proves the migration repair against the
hosted actor, but it did not complete the full Preview gate.

The rollback-only assertion was sent as one 28,445-byte SQL request with its
own `BEGIN` and final `ROLLBACK`. It failed at the exact settings-constraint
catalog check because PostgreSQL 17's `information_schema.table_constraints`
also reports generated NOT NULL names such as `*_not_null`. A transaction-local
diagnostic showed that `pg_constraint` contained exactly the declared named
constraints. No assertion fixture or temporary role/RLS change persisted; the
branch was deleted and its absence verified. Production was not used as the SQL
target.

The assertion now reads the three table constraint sets from `pg_constraint`
joined to `pg_class` and `pg_namespace`, without filtering away unexpected real
constraints. That revision required the fresh `r3` repetition recorded below;
the second attempt alone is not successful Preview proof.

### Third durable-metadata disposable Preview attempt — 2026-08-21

A fresh non-default `with_data=false` PostgreSQL 17 branch repeated the absent-
target and zero-data preflight. All 13 exact source migrations applied in order.
The repaired `pg_constraint` durable assertion was then sent as one request with
its own `BEGIN` and final `ROLLBACK` and passed.

Post-rollback checks confirmed both generation roles remained `NOLOGIN`,
`NOSUPERUSER`, `NOCREATEROLE`, `NOINHERIT` and `NOBYPASSRLS`; the only role
edges were the two expected admin-only bootstrap edges with neither `SET` nor
`INHERIT`. All three generation tables remained RLS-enabled and RLS-forced; the
sole `note_generation_v1` settings row remained `enabled=false` and
`shadow_only=true`; jobs, attempts, Auth/session/privacy-review and assertion
fixture rows were zero. The private schema still had zero policies, functions,
views and non-internal triggers, and no schema/table privilege leaked to
`anon`, `authenticated`, `service_role` or the future executor.

The security and performance advisor review also passed the generation-schema
gate: there were no generation warning/error findings. The only generation
findings were the three expected informational `rls_enabled_no_policy` entries
for deliberately fail-closed tables and seven informational unused-index entries
on the zero-row branch.

The five adjacent rollback assertions then produced four passes:
`v1_shadow_contract_assertions.sql`,
`v1_ndis_shadow_integration_assertions.sql`,
`v1_mobile_sync_shadow_assertions.sql` and
`v1_privacy_review_shadow_assertions.sql`. The final
`portal_referral_workflow_foundation_assertions.sql` request failed with
`VALIDATION_ERROR` and rolled back. Its older canonical-revision fixture omits
the privacy proof/facts binding now required by the newer revision trigger; this
is cross-migration fixture drift, not evidence that the durable assertion
failed. No fixture or temporary privilege from that request persisted.

At the end of the third attempt, the exact-revision cross-domain gate was
therefore incomplete. The local Portal Referral repair then supplied a
hash-bound confirmed proof and valid five-field Communication facts without
weakening or bypassing the privacy trigger. The `r3` branch was deleted and its
absence verified. Production was not used as the SQL target, and no deployment,
runtime flag, capability or API/executor grant was added or enabled.

Local validation of that repair passed the Portal migration contract (1 file /
13 tests), the five adjacent migration-contract files (5 files / 64 tests), the
full 121-file / 1,294-test suite, TypeScript, full lint and Next static
generation 63/63. These source gates preceded the fourth attempt below.

### Fourth durable-metadata disposable Preview attempt — 2026-08-21

At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`, a fresh PostgreSQL 17
branch named `careslink-note-durable-preview-20260821-r4` was created as
non-default, `persistent=false` and `with_data=false` from parent default
`adocsnwnslxhxcjgbyee`. Its branch id was
`ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b` and its project ref was
`czqdjqdjghmmzukstprt`. The same reviewed 13-file source manifest applied in
order 13/13.

The durable rollback assertion and all five adjacent rollback suites then
passed 6/6: V1 shadow, NDIS integration, mobile sync, privacy review and the
now privacy-bound Portal Referral fixture. The Portal suite passed the current
privacy trigger; it was not bypassed or weakened.

Post-rollback inspection passed the recorded zero-row matrix across
Auth/session, legacy, canonical, sync/NDIS, Points/migration, Portal, generation
and assertion fixtures while retaining only the expected forced-off
seed/catalog rows. Both generation roles remained non-login and non-privileged
with only the expected PostgreSQL 16+ admin-only creator edges. All three
generation tables remained RLS-enabled and RLS-forced. The private generation
schema had zero policies, functions, views, non-internal triggers and
API/executor privilege leaks. The generation, Portal and mobile-sync capability
rows remained disabled and shadow-only; no runtime flag was enabled.

Generation-scope security and performance advisors reported exactly three
informational `rls_enabled_no_policy` findings and seven informational unused-
index findings, with zero warning/error. These are expected for the deliberate
fail-closed, zero-row schema and are not runtime-usage evidence.

The exact `r4` branch was deleted after verification. A subsequent branch list
contained neither id `ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b` nor ref
`czqdjqdjghmmzukstprt`; parent default `adocsnwnslxhxcjgbyee` still existed.
Production was never the SQL target, and there was no Production action,
migration, deployment, capability/flag change or grant. This fourth attempt
closes only the exact schema/cross-domain assertion gate. It does not make any
RPC, worker, provider/model/STT integration, Points settlement or user flow
available.

### Durable Note worker-RPC disposable Preview gate — 2026-08-23

At source HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, disposable
`r9` (`v1-note-worker-rpc-r9`; id
`a1571c30-a322-4cea-b332-b189804df195`; ref
`hyczevivoakmflswmwlb`) was non-default, `persistent=false`,
`with_data=false` and PostgreSQL 17.6 under parent default Production project
`adocsnwnslxhxcjgbyee`. The exact 14 migrations applied 14/14; the five
adjacent, durable and worker rollback suites passed 7/7.

The independent postcheck passed exact ownership and RLS plus FORCE RLS on all
12 generation tables; hard-off flags; zero Auth, canonical, generation,
catalog/registration, grant/evidence/outbox, Points and Portal fixture rows;
the reviewed `NOLOGIN`/`NOSUPERUSER`/`NOBYPASSRLS`/`NOINHERIT` roles; denied
API ACLs; and nine executor-only `SECURITY DEFINER` RPCs with `search_path=''`.
Security advisors returned 26 global findings (23 INFO + 3 WARN for pre-existing
public `get`/`list`/`pull` functions; [remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable))
and zero generation findings. Performance advisors returned 155 global findings
(144 INFO + 11 WARN); generation scope contained 20 INFO—14 [unindexed
composite foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and 6 [unused fresh indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)—with
zero WARN/ERROR. This is not an all-project green claim. Independent review
reported P0/P1/P2(delete) = 0.

Earlier `r6` infrastructure transport, `r7` restricted-executor assertion
(`42501`, fixed assertion-only at `78f1dd3`) and `r8` stale-attempt fixture
(`finished_at=NULL`, fixed assertion-only at `c7b70e9`) attempts were deleted,
not repaired in place. Successful `r9` was also exactly deleted and its ID/ref
were absent afterward; the Production parent remained the default branch and
healthy, and was never a SQL target.

The local gate passed 122 files / 1,337 tests, TypeScript, full lint and Next
static generation 63/63. This is isolated schema/transaction/assertion evidence,
not a retained Preview, Production apply, runtime worker/caller, live
Auth/privacy route, model/STT, vault/KMS/retention, Points or user-flow result.
Normal consume remains `DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE`; at the `r9`
checkpoint, PostgreSQL 16 and true two-connection
claim/session/privacy-revocation races remained hard activation blockers.

### Durable Note worker-RPC true two-session PostgreSQL 17 gate — 2026-08-24

Disposable no-data `r20` exercised the current worker-RPC revision through the
Supabase Session Pooler on port 5432 with `sslmode=verify-full`, the Supabase
Root 2021 CA and an authorized client TLS socket. The harness established two
persistent PostgreSQL 17.6 sessions with distinct backend PIDs as the temporary
least-privilege concurrency runner. Within the test surface its only explicit
grants were eight fixed zero-argument `TEST_ONLY` helpers and the three real
claim, authorize and consume RPCs; it had no owner/executor membership or
sensitive table/column DML privilege.

All three live scenarios passed. `SKIP LOCKED` produced one `CLAIMED` and one
prompt `IDLE` result while the first transaction remained open. A session
deletion was observed blocking authorization and then settled
`SESSION_REVOKED`. Authorization was observed blocking privacy revocation,
after which consume settled `PRIVACY_REVIEW_STALE`. Both denial paths left zero
canonical rows and fail-closed payload/purge state.

Management-plane cleanup then committed runner `NOLOGIN`, drained only the
exact idle Supavisor backends, removed the fixed fixtures, helper schema and
runner, and passed an independent zero-row and posture postcheck. Security
advisors were 26 global findings (23 INFO + 3 pre-existing WARN) and zero
generation findings. Performance advisors were 133 global findings (122 INFO +
11 WARN); generation scope was 18 INFO—14 [unindexed composite foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
plus 4 [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)—with
zero WARN/ERROR and zero concurrency-specific findings. The disposable branch
was deleted; Production was never the SQL target and remained `ACTIVE_HEALTHY`.

This closes the true two-session claim/session/privacy race gate for PostgreSQL
17.6 only. PostgreSQL 16, owner A/B runtime integration and the already listed
catalog/envelope/purge/provider/vault governance remain open. Attempt-2
historical replay was still open at this `r20` checkpoint and was subsequently
closed by deleted `r21` below. No caller grant, retained Preview, runtime worker
or Production capability was created.

Final source handoff gates passed:

| Command | Result |
|---|---|
| `pnpm test:preview:e2e:policy` | 3 files / 53 tests passed |
| `pnpm test` | 124 files / 1,377 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |
| `python3 tools/sync_codex_adapters.py --check` | passed; 73 adapter files in sync |
| `git diff --check` | passed |

### Durable Note worker-RPC attempt-2 historical replay gate — 2026-08-24

From worktree base HEAD `000f17a`, deleted disposable `r21`
(`v1-note-worker-rpc-r21`; id `688da83b-78e8-45fa-8646-b015822d59b0`; ref
`kfgjxlilotpaxnozomqq`) was non-default, `persistent=false`,
`with_data=false` and PostgreSQL 17.6. The exact assertion SQL body was
146,488 bytes with SHA-256
`bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`.
The confirmed Preview creation rate was US$0.01344/hour; the branch was deleted,
so no ongoing charge or accrued total is inferred.
All 14 migrations applied 14/14 and all seven rollback suites passed 7/7.

The fixed target matrix proved exact Attempt 1 settle/resolve replay while
Attempt 2 was `RUNNING`, after Attempt 2 had committed `SUCCEEDED`, and after
the payload and purge outbox had both advanced to `PURGED`. Attempt 2 success
commit and resolve replayed their original acknowledgements exactly. A fully
valid stale Attempt 1 success commit was rejected with `LEASE_EXPIRED` and
expired recovery returned zero work. Before Attempt 2 succeeded those directed
side effects were absent; after success, every subsequent replay and purge
stage retained exactly one canonical document, revision, sync change, mutation
receipt, provider-evidence row and purge-outbox row.

The independent postcheck confirmed the exact 12-table and nine-RPC surfaces,
hard-off settings, zero checked data and fixture rows, denied API access and
only the two expected admin-only creator role edges. Advisor results matched
`r9`: security
reported 26 global findings (23 INFO + 3 pre-existing WARN) and zero generation
findings; performance reported 155 global findings (144 INFO + 11 WARN), with
20 generation INFO and zero generation WARN/ERROR. The exact `r21` branch was
deleted and its id/ref were absent afterward. Production remained healthy and
was never the SQL target.

The focused worker-RPC migration contract passed 25/25; the full local gate
passed 124 files / 1,377 tests, TypeScript, full lint and Next static generation
63/63. This closes only the PostgreSQL 17.6 attempt-2 historical replay gate.
At that `r21` checkpoint, PostgreSQL 16, owner A/B runtime integration and the
already listed catalog/envelope/purge/provider/vault governance remained open.
No caller grant, retained Preview, runtime worker or Production capability was
created.

### Durable Note registration historical-retention source and r22 gate — 2026-08-24

Supabase CLI 2.115.0 generated
`20260823213144_harden_v1_note_generation_registration_retention.sql` as the
fifteenth migration in the reviewed local worker manifest. It creates exactly
`attempts_registration_digest_idx` on
`careslink_v1_generation.attempts(registration_digest)` and validates exactly
one `attempts_registration_catalog_fk` from that column to
`careslink_v1_generation.worker_registrations(registration_digest)`, with
`ON UPDATE RESTRICT` and `ON DELETE RESTRICT`. The index precedes the initially
`NOT VALID` constraint; validation then fails closed if existing attempt history
has already lost its immutable registration row.

The updated rollback-only assertion source is identified independently of the
historical hosted runs:

| Assertion body | Current SHA-256 | Current bytes | Added source proof |
|---|---|---:|---|
| `v1_note_generation_worker_rpc_shadow_assertions.sql` | `1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb` | 153956 | exact validated FK/index catalog posture; missing child-digest rewrite and referenced parent delete rejection; historical rows unchanged |
| `v1_note_generation_durable_foundation_assertions.sql` | `2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6` | 37547 | minimum transaction-local worker-registration fixture required by the new FK |

Local verification passed all three focused migration contracts (39/39), the
full 125-file / 1,381-test suite, lint, TypeScript, the 63/63-page Next
production build, the 73-file Codex-adapter sync check and `git diff --check`.

The earlier deleted Preview evidence remains historical and unchanged. `r21`
passed the exact earlier 14/14 manifest and 7/7 suites with the 146488-byte
worker body at SHA-256
`bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`.
`r9` passed the exact earlier 14/14 manifest and 7/7 suites with the 36467-byte
durable-foundation body at SHA-256
`3bd571e8447cbedd838251339e273877a25decaa582a538f0d7049319504bab0`.
Neither run included the fifteenth migration or either current assertion body.

At source HEAD `4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf`, disposable
`r22` (`v1-note-worker-rpc-r22`; id
`0bc8db56-0e4a-42ec-9595-1f32a3d74a6b`; ref
`wuzcjcfrkctelcnbbgtg`) was non-default, `persistent=false`,
`with_data=false` and PostgreSQL 17.6 (`server_version_num=170006`) at the
confirmed US$0.01344/hour Preview rate. The exact 15-file manifest applied
15/15. The five adjacent suites plus the durable-foundation and worker bodies
identified above passed 7/7.

The independent postcheck confirmed exactly 12 private generation tables, nine
private worker RPC identities, hard-off settings, zero checked business,
catalog, registration, grant, evidence, outbox and fixture rows, denied API
table/RPC access and only the two expected admin-only creator role edges. The
new `attempts_registration_catalog_fk` was validated with exact `RESTRICT`
update/delete actions, and `attempts_registration_digest_idx` had the exact
single indexed key. Security advisors returned 26 global findings (23 INFO + 3
pre-existing WARN) and zero generation findings. Performance advisors returned
155 global findings (144 INFO + 11 WARN), with 20 generation INFO—14 unindexed
composite-foreign-key findings and six unused fresh-index findings—and zero
generation WARN/ERROR.

The exact `r22` branch was deleted and its ID/ref were absent afterward.
Production remained healthy and default and was never the SQL target. The
hourly rate records only the confirmed creation price; no accrued total is
inferred. This closes only the hosted registration historical-retention gate.
PostgreSQL 16, owner A/B runtime integration, nested exact-key envelopes,
account-delete/purge recovery, provider-start binding, sequential numeric
parsing and all vault/runtime gates remain open. No retained Preview,
deployment, caller grant, runtime flag or capability was created.

### Durable Note PostgreSQL 16.15 local isolated gate — 2026-08-24

The `r22` result immediately above remains historical PostgreSQL 17.6 hosted
evidence. A subsequent worktree based on HEAD
`93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea` used a disposable Homebrew
PostgreSQL 16.15 server with exact `server_version_num=160015`. Its clean apply
covered 27/27 repository migrations: the 12 pre-V1 migrations followed by the
exact current V1 manifest 15/15. The five adjacent suites plus the durable and
worker rollback suites passed 7/7 with the same current bodies recorded above:
37547 bytes / SHA-256
`2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`
for durable foundation and 153956 bytes / SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`
for worker RPC.

The independent postcheck confirmed exactly 12 private generation tables, nine
private worker RPC identities, hard-off settings, zero checked fixture rows,
denied API table/RPC access, only the two expected admin-only creator edges and
the exact validated registration-retention FK/index.

The strict local-only harness used two independent backend PIDs at loopback
`127.0.0.1:55432`, with no TLS, password or credential material. It passed 3/3
`SKIP LOCKED`, session-revocation-first and privacy-authorization-first races.
The fixed setup body had SHA-256
`ba183bacf8b35a2493b520563ce2fe2d1193e0638af17d2be62c8b58076112bc`;
the fixed cleanup body had SHA-256
`e4aa567f372885137f2b0251f51ea1818a5ca329ec9ed8a9a9f8355cc3ecbecb`.
Setup, quiesce, drain and cleanup all passed.

| Current local command/gate | Result |
|---|---|
| two focused strict-local harness/policy files | 59/59 passed |
| `pnpm test:preview:e2e:policy` | 3 files / 72 tests passed; preserves the prior 53 and adds 19 strict-local cases |
| `pnpm test` | 125 files / 1,400 tests passed; preserves historical `r22` source result 125 / 1,381 and adds 19 strict-local cases |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |
| Codex-adapter sync check | 73 files passed |

Fixed SQL cleanup removed the database runner, `TEST_ONLY` helper surface and
fixtures. The outer gate then stopped the server and deleted the exact
PostgreSQL cluster directory, Colima profile and disk. Production was never a
target, and no retained Preview, deployment, caller grant, runtime activation
or paid resource was created.

Supabase CLI 2.115.0 accepts local `db.major_version` only for 13, 14, 15 and
17, not 16. The gate therefore used vanilla PostgreSQL 16 plus only the minimum
Supabase-compatible roles, Auth stubs and `pgcrypto` surface needed by the
repository migrations. This closes the current PostgreSQL 16 database-engine,
serial and true-two-session compatibility gate; it is not GoTrue, PostgREST,
`supautils`, Advisors or hosted Supabase parity evidence.

The worker-half owner A/B adapter-to-database boundary is closed below. At that
checkpoint the owner admission/enqueue/status/cancel repository remained open;
the later source/local-SQL closure is recorded in the following owner-runtime
section. Attempt listing, nested database exact-key envelopes,
account-delete/purge and orphan recovery, provider-start binding to a consumed
grant plus fresh lease/heartbeat, sequential numeric parsing,
vault/KMS/retention, worker credentials, hosted Auth/Data API, model/STT, Points
and runtime activation remain open.

### Registered-worker owner A/B database integration boundary — 2026-08-24

The current batch closes only the worker-half adapter-to-database boundary. The
existing `TEST_ONLY`, default-off registered-worker adapter is joined to
`note-generation-registered-worker-postgres.server.ts`, which maps an explicitly
injected query port to the exact nine private RPC identities without creating a
connection, environment lookup, role or grant. Its owner A and owner B cases
require database-derived owner/session/privacy/job bindings, symmetric positive
paths, cross-owner job/attempt/payload/grant/lease denial, metadata-only
acknowledgements and no raw payload or locator in claim/authority arguments.
Lease-bound calls intentionally carry an opaque lease token, and success commit
intentionally carries canonical NoteContent. Transient lease/grant capabilities
are not logged or retained; terminal acknowledgements, logs and retained gate
evidence contain no private content.

The observed gate ran on a worktree based on
`ec29430dec7a79c611a552a52e36277e3512166e` against a fresh vanilla
PostgreSQL 16.15 cluster listening only on passwordless loopback
`127.0.0.1:55432`. Management SQL also required the fixed temporary-directory
pattern, cluster name, bootstrap marker and management application name. The
repository migration sequence applied 27/27 and the
pre-setup baseline reported 12 private generation tables, nine RPCs, hard-off
settings and zero generation rows. Management bootstrap was local-only; the
tested runner was non-superuser, `NOINHERIT`, `NOBYPASSRLS`, connection limit 1,
had no effective application-table or `TEMPORARY` privilege or owner/executor
membership, and exact ACLs admitted only each function owner plus the runner for
the nine RPCs and eight fixed helpers.

The fixed setup/quiesce/cleanup SHA-256 values were
`a2b4ddd54acbbc621aa886b70b1c80dfac56de4b722154f4e9820f16b2aeea7b`,
`e6ea88f8a280626c0059ee3a7e9d131382520630f2a7733d3983e5161f2a4ef0`
and `e490809e3c39cb17d8d407399200743378df2b29d84bbd9da35da0cec18ff203`.
The explicit live file passed 2/2 and proved:

- owner A heartbeat, authorize, TEST_ONLY consumed metadata, fence, commit and
  exact successful resolve;
- owner B cross-job, cross-attempt, cross-payload and owner-A-lease denial, plus
  rejection of C's still-`ISSUED` grant inside an explicit rollback-only
  transaction, followed by a successful commit whose deliberately lost response
  resolved without commit retry;
- owner C authorization followed by privacy revoke; authorize and consume both
  returned replay-safe `DENIED_SETTLED / PRIVACY_REVIEW_STALE`, and the later
  `settleFailure` call replayed the same terminal `FAILED` reason, with zero vault
  calls;
- all nine RPC identities called through the real query adapter, final A/B/C
  unqualified FORCE-RLS canonical projections 1/1/0, two evidence rows and no
  duplicate canonical, evidence or outbox effect.

The four focused Postgres/adapter/policy files passed 80/80, the Preview E2E
policy suite passed 4 files / 75 tests, and the full source suite passed 128
files / 1,425 tests. TypeScript, full ESLint, the 63/63-page production build,
the 73-file Codex-adapter sync check and `git diff --check` passed. A separate
quiesce first committed `NOLOGIN`, rejected a new runner connection and found no
runner session. Cleanup then committed and an independent postcheck found zero Auth users/sessions, privacy
reviews, canonical rows and generation/catalog rows; runner and helper schema
were absent, settings were hard-off with the constraint restored, PUBLIC
`TEMPORARY` was restored, unexpected RPC ACLs were zero, and 9/9 RPCs still
denied `anon`, `authenticated` and `service_role`. The server stopped,
the exact temporary cluster directory was permanently deleted and the port was
closed.

The fixed A/B consumed metadata helper is not a payload vault or real consume
implementation. This worker-half gate did not itself close the owner runtime
repository; the later source/local-SQL owner boundary is recorded next. Attempt
listing, caller credentials/grants, runtime registry, scheduler, route,
vault/KMS/retention, provider/model/STT and Points remain absent. All application
readiness values remain `false`; only the disposable TEST_ONLY window
temporarily enabled the private setting, and cleanup restored it hard-off. No
Production or retained Preview capability is created.

### Note generation owner runtime repository source/local gate — 2026-08-24

The current source adds Production-unapplied migration
`20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql` and the
private `TEST_ONLY` direct-query adapter
`note-generation-owner-repository.server.ts`. The migration creates a dedicated
`careslink_v1_generation_owner_api_executor` with `NOLOGIN`, `NOINHERIT`,
`NOSUPERUSER` and `NOBYPASSRLS`; it neither reuses the cross-owner worker
executor nor creates a caller credential. The new database-owned
`admission_policy_bindings` catalog is empty by default. Exactly three private
`SECURITY DEFINER` RPCs implement admit-and-enqueue, owner-safe status and
cancel. No binding is seeded, the setting remains hard-off and no API role,
`service_role` or application caller receives `EXECUTE`.

The binding is a policy-bundle selector rather than a unique-worker allowlist.
A different complete valid Five-Note registration may claim when its worker,
payload and current Note-type provider policy match the queued job; its other
four provider policies are not part of that per-job comparison.

Admission takes owner/session identity from the injected authenticated
principal and derives authoritative time, fresh session/privacy state and the
exact worker/provider/payload catalog selection in the database. An
owner-scoped advisory lock serializes each idempotency lane. A new acceptance
atomically writes the metadata-only job and available payload record; replay
requires the same request and staged identity links, while a replacement
payload candidate is reported privately rather than becoming an owner response.
The adapter parses an exact owner-safe job envelope and has no PostgREST/Data
API, environment, URL, pool or attempt-list surface.

The admission hard switch is checked only for new work. Status and cancellation
continue to authenticate against a fresh session while the switch is off.
Cancellation takes the job lock first, cancels the live attempt only when the
job was running, revokes issued grants, revokes the payload, enqueues exactly
one purge request and finishes the job atomically. A queued cancellation creates
no synthetic attempt. Pre-existing inconsistent purge state fails the whole
transaction closed.

The disposable local PostgreSQL 16.15 execution applied #1 through #24 and the
#26 through #28 tail as the non-superuser migration actor, including a fresh
exact replay of final migration #28. The
hand-built minimum compatibility bootstrap used #25 as a bootstrap-superuser
ownership transition; therefore this run must not be described as a clean
28/28 non-superuser apply. The earlier recorded 27/27 PostgreSQL 16.15 evidence
above remains historical evidence for its own revision and is not rewritten.

All three current rollback assertions completed through `ROLLBACK`: the new
owner suite, the additive-aware worker suite and the durable-foundation suite.
The frozen assertion identities are:

| Assertion | Full file | Executable body |
|---|---|---|
| owner runtime | 100936 bytes; SHA-256 `05a3e4b95559981a1919a4dae83157ecef60f7485c1afd76150199a50f7990b8` | 100156 bytes; SHA-256 `c8ad3fca9432afa1410807eec38c4c451ba885713a54ddec15149c26f1706bfa` |
| additive-aware worker RPC | 158635 bytes; SHA-256 `a2c1da6c7a94bd43f5a2d93ce7ecdbe5832fad53e2756d0b0cc4dc1d3b0bfe9c` | 154903 bytes; SHA-256 `6ed296b0764cf80b13915758209797d2de8b4a247296652f3ea63ad01bd50b94` |

The independent final postcheck found 13/13 private tables with RLS plus FORCE
RLS, 27 owner policies, three correctly owned RPCs, 19 direct function
`EXECUTE` ACL entries including those RPCs,
one hard-off settings row and zero rows in all other generation tables. A true
two-connection auth-session lock wait returned `P0001 SESSION_REVOKED` after
the session expired while the status call was blocked.
The final source gate passed 130 test files / 1522 tests, TypeScript, full lint,
the 63/63-page Next production build, the 73-file Codex-adapter sync check and
`git diff --check`.

This gate is local database/source evidence, not a hosted Preview or
Production run. It does not prove GoTrue, PostgREST, a route/caller grant,
deployment, vault/KMS/retention or orphan recovery, account deletion,
provider/model/STT traffic, Points settlement or end-to-end behavior. Attempt
listing is intentionally not implemented and remains open.
Graceful registration retirement is supplied by the subsequent source/local
batch below. Emergency revocation and its in-flight authority, grant, payload
and purge recovery semantics remain open.

### Note generation worker-registration graceful-retirement source/local gate — 2026-08-24

Migration #29,
`20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql`,
adds a separate append-only retirement ledger while preserving the canonical
worker registration as immutable, digest-bound and `APPROVED`. The fourteenth
private generation table enables and forces RLS. Its distinct
`careslink_v1_generation_registration_control_executor` is `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS` and owns one private control RPC;
no API role, `service_role`, worker executor, owner executor or application
caller receives `EXECUTE`.

The RPC validates one operation UUID, one fixed reason (`ROTATED`,
`DECOMMISSIONED` or `POLICY_SUPERSEDED`) and an exact unique, sorted list of
currently active admission-binding versions. Binding-to-registration locking
and post-wait reads make the ledger insert and the corresponding
`ACTIVE`-to-`RETIRED` binding updates atomic. Exact replay returns the existing
fact without writing; a changed operation or stale expected set fails closed.

The gates are deliberately narrow: a retired registration cannot admit a new
owner job or claim a new worker attempt, and trigger checks reject a new
`RUNNING` attempt or reactivated binding. Existing attempts retain heartbeat,
fence, payload authorize/consume, success commit, failure settle, resolve and
recovery. Recovery may still write terminal `FAILED` history, and owner status
and cancellation remain callable. This is graceful drain, not emergency
revocation.

The new migration and its dedicated assertion are source/local PostgreSQL
16.15 evidence only. The assertion completed through strict `ROLLBACK` and is
the ninth current suite; the owner suite had already raised the historical
seven-suite inventory to eight. The final clean gate applied 29/29 migrations,
passed all 9 rollback suites, the independent 14-table/four-role/hard-off/zero-
fixture postcheck and both real retirement/claim lock orderings. The migration
seeds no retirement or active binding and creates no caller grant, route,
credential, runtime registry, deployment, activation or Production effect.

### Hosted CLI 30-migration role-restoration gate — 2026-08-25

The final disposable Supabase Preview was
`hosted-role-restore-r5-20260825` (id
`d68d531a-55e6-4374-be68-494da7542c75`, ref
`eqqlvqqhvsogusqhzuaq`) under parent `adocsnwnslxhxcjgbyee`. It was
non-default, `persistent=false`, `with_data=false`, healthy and priced at the
confirmed US$0.01344/hour branch rate. Production was not a SQL target.

One official Supabase CLI 2.115.0 `db reset --linked` applied the exact 30-file
repository migration manifest and ran all 11 rollback suites in order. Four
earlier disposable diagnostics had identified test-harness assumptions rather
than new migration defects: nine role-switching suites now capture the
assertion-entry actor once and restore it at all 82 completed windows, and the
special suite checks direct temporary ACL state rather than privilege inherited
through a SET-only role membership. Every diagnostic branch was deleted.

The exact assertion bodies executed by deleted `r5` were:

| Suite | Bytes | SHA-256 |
|---|---:|---|
| V1 shadow foundation | 9,886 | `fe0602925e43d39467d1fa20eba379034067765bb8b5d79c460b8cb87533e438` |
| NDIS shadow integration | 32,981 | `26714dcaedecdebbd31ee4ba9b4ecf4c5bf475afa6ffb0cceb55b039c854a871` |
| Mobile sync shadow | 63,415 | `a568dc1d9123d79251a74aa9edd2abff5f87d7eb2981370acf01d5381ec5274b` |
| Privacy review shadow | 62,866 | `37edb42dbc692f125316b78a62909e4dc6876c1dbf3a3d17682090b4bd0941aa` |
| Portal referral workflow | 40,758 | `9b3e7ebcd2349ac9d7c553459dcff340a6992a7705bf2202d05cf90fd3b70fdc` |
| Portal referral intake | 38,843 | `d434f916ff0aece191b0754e35393c0ab03ada7ec9849c75add8c04c16536182` |
| Generation durable foundation | 40,182 | `e65b163bae59503d80a20d1ac1ff9457e0996bae5d2c10f537c33c4bbd8b28ea` |
| Generation worker RPC | 161,598 | `50b2b9cf03c7e23279cfed94f38958b949fefd722a3def9ff787d24c40b9a72f` |
| Generation owner runtime | 104,193 | `9377611059f0f816a45edeb2c391a2905896e1534d37384047b06c5ca5b2946a` |
| Generation registration retirement | 51,410 | `7701051c4bd11159833ccd5c9a3604becc5b38d79d25e1e280aff80d4e9513a4` |
| Migration-entry role restoration | 3,985 | `042e8ae2639de46cf6d82818e27c358a52ad0e1415cb75609c3e06cbc57cfde1` |

The later source follow-up moved the seven exact `pg_proc.proowner` signature
checks into the maintained rollback suites. The current enhanced generation-
worker body is 162,857 bytes with SHA-256
`1c30fd7a8604ec8a279ac8d8cf00155bf54801ee15d91dc8ecbc7bc9bc9cf859`;
the current enhanced Portal-intake body is 39,728 bytes with SHA-256
`2255331b99ff6c4ca05b3a79578c6daa601e26662633063aa004f43423e3729f`.
These are current source identities, not replacements for the two historical
`r5` rows above. The later exact-commit `526aa1e` disposable gate applied 32/32
and passed all 13 then-current rollback suites, superseding that historical
exact-body gap without touching Production. The Assignment suite changed again
in the 2026-08-26 queue-bound hardening and the later exact-current Hosted gate
recorded above exercised that final body.

The special suite proved the real Hosted topology with distinct
`session_user` and entry `current_user`, entry-actor `CREATEROLE`, temporary
grant, explicit restore, revoke and direct-ACL cleanup. A separate rollback-only
postcheck retained the exact 30 migration rows; 14 owner-correct forced-RLS
generation tables; four locked role identities and exact bootstrap edges; both
#26 readers and all five #30 Portal definer functions under the entry actor;
hard-off settings; zero checked Auth, Portal and generation fixtures; and no
API or schema-`CREATE` leak.

The source-maintenance follow-up is complete: the long-lived worker and Portal-
intake rollback suites now check the exact signatures and entry ownership of
the two #26 readers and five #30 Portal functions. Deleted `r5`'s independent
postcheck remains the historical Hosted proof of the underlying owner posture,
but `r5` did not execute the enhanced bodies identified above. That evidence is
still not attributed to `r5`; the separately recorded exact-commit `526aa1e`
disposable 32/32 and 13/13 gate is the later pre-review body refresh. The current
Assignment assertion hash is separately identified in the PR-review section.

Security advisors returned 21 INFO and six WARN globally, zero findings in the
generation scope, and one INFO plus three intended authenticated-
`SECURITY DEFINER` WARN findings in the Portal scope. Performance advisors
returned 129 INFO and 24 WARN globally. Generation scope contained 14
unindexed-FK INFO, four unused-index INFO and 13 `auth_rls_initplan` WARN;
Portal scope contained 16 unused-index INFO and two `auth_rls_initplan` WARN.
These remain recorded optimization/advisor work, not evidence of a role, owner,
ACL, RLS, fixture-isolation or activation-boundary failure.

The deleted-`r5` source snapshot gate passed the 11 direct contract files (162
tests), the full
134-file / 1,657-test Vitest suite, TypeScript, lint, the Next.js 16.2.9 webpack
production build with 63/63 static pages, the 73-file Codex-adapter sync check
and `git diff --check`.

The final Preview was deleted, its id/ref absence was verified, and only the
healthy default Production branch remained. The branch has no ongoing charge;
the exact accrued amount is not inferred. This gate proves Hosted database
migration and rollback assertions only. It does not activate GoTrue/PostgREST,
a route or caller grant, a worker, model/STT, Points, or any Production feature.

### Mobile V1 protected Product API Preview E2E — 2026-08-14

A protected, non-Production Preview exercised the default-off Product API against
the reviewed source snapshot with two synthetic password users. No Production
deployment, alias, database, migration or user data changed.

| Gate | Result |
|---|---|
| Protection and Auth | exact protection/bypass contract passed; both users passed create, authoritative pre-sign-in database proof, password sign-in and session-row proof |
| Five Note types | 5 privacy confirmations and replays, 5 document creates and replays, and 15 unique synthetic mutation identifiers exercised and tracked |
| Owner isolation | owner B received an empty list, exact initial pull cursor `sync.v1:0`, no owner-A get visibility and fixed cross-owner write denies |
| Revision and recovery | patch/replay, idempotency conflict, stale base, checkpoint/replay, aggregate recovery, pull/upsert, tombstone/replay and privacy-outbox exclusion passed |
| Shutdown | the guarded write window closed, all four temporary RPC grants were revoked, both sessions were revoked, and the prior JWT was rejected |
| Cost and scope | zero model calls, zero Points/Billing activity and zero Production changes |

Permanent, credential-free regression and application checks on the current
post-review worktree passed after the cleanup policy and evidence were saved.
They are later source/static evidence and do not imply that the historical
Preview ran the exact current SQL revision:

| Command | Result |
|---|---|
| `pnpm test:preview:e2e:policy` | 1 file, 13 tests passed |
| `pnpm test` | 104 files, 894 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 59/59 |

The `5 / 5 / 15` counts are coverage evidence. The 15 identifiers include
successful, replay and expected conflict/deny paths; they do not mean 15 database
commits. Generated cleanup identifiers were held in memory or the temporary
recovery ledger. Synthetic request content passed through the disposable Preview
and was removed with the test rows; neither identifiers nor payloads are recorded
here.

The business matrix completed, but the original process then failed closed with
`E2E_CLEANUP_DEPLOYMENT_INCOMPLETE`. Post-incident review found two overly short
deployment-observation deadlines and an adjacent subsecond horizon edge case. After
the request-only retry and horizon policies were independently reviewed and locked,
one recovery-only action returned `cleanupComplete: true`. Three joint
deployment-absence samples, three Auth-absence samples and the final global-zero
audit passed. The ledger, primary manifest, recovery manifest, requests and staging
artifacts were all absent at the end. This split outcome must not be reported as a
single `ACTION=run` exit-zero.

This is Preview route evidence, not Production approval. It does not prove native
Auth, Points/Billing, model generation, cross-device/offline behavior or real-user
workflows. The repeatable cleanup policy is documented in
`documentation/mobile-v1-preview-e2e-runbook.md` and locked by credential-free
tests under `scripts/preview-e2e/`.

### Post-review hardening boundary

A final pre-commit review found four gaps that the earlier Preview matrix did not
exercise: historical A→B→A content replay, source validation before the advisory
lock, same-content source metadata updates, and legacy deletion leaving canonical
content without its source mapping. The local source now uses a source-versioned
mutation identity, validates the current source after locking, requires replay to
still reference the current canonical revision, and binds NDIS canonical documents
to their legacy source so owner reads require a live source; a fail-safe server RPC
then tombstones the retained canonical record without deleting its audit content.
The readiness audit was also consolidated so historical failed Preview
attempts are not presented as current state.

The then-current NDIS revisions implementing the four changes above were applied
to the retained non-default branch and their then-current transactional assertions
passed. The later committed SQL additionally adds exact catalog postconditions,
private-schema ACL/object-set proofs and fresh eligible-provider session checks;
those later changes have source/contract-test evidence only and have not been
applied to that branch or any deployment.
Repository tests and static SQL assertions must pass locally, then the exact current
migration set and transactional SQL assertion files must clean-apply on a new or
rebuilt `with_data=false` branch before another protected Preview. The earlier
Preview evidence remains evidence for the earlier source only; it is not a release
approval for this hardened migration revision.

### Isolated Supabase guarded-live evidence

Target identity was verified before writing:

- branch ref `jtkicyqwdabhjzhdutve`, parent project ref `adocsnwnslxhxcjgbyee`;
- Supabase reported `with_data=false`, non-default branch and healthy status;
- branch URL ref differed from Production;
- pre-apply legacy rows were 0 and legacy column/constraint/policy/grant signatures were captured.

| Gate | Result |
|---|---|
| Fresh apply / reproducibility | passed twice, including branch reset to the parent migration and a second 44,028-character apply |
| Legacy safety | row counts remained 0; all four legacy schema signatures matched before/after |
| Objects and grants | 18/18 tables; 14/14 owner RLS policies; 14/14 owner SELECT grants; 0 authenticated writes; 5/5 service-role RPC grants; 0 anon/authenticated/public RPC grants |
| Database constraints | all 9 `shadow_only` checks present; `false` rejected; cross-owner document/revision/checkpoint/current-revision combinations rejected |
| Real JWT RLS | anon read/RPC 401; provider A/B each saw only own rows; test-only platform service actor saw 0; direct INSERT/PATCH/DELETE/RPC returned 403 |
| Points commit path | earliest-expiring lots allocated 20 + 30; one commit; replay did not duplicate ledger rows |
| Points release path | one release restored the exact source lots; replay stable; different reason/event rejected |
| Failure paths | expired quote, expired lot/insufficient balance, cross-owner quote/reservation, fixed-rate/idempotency conflicts and release-after-commit rejected |
| Ledger and welcome | append-only application boundary held; no automatic 300-point welcome lot |
| Service-role boundary | positive writes only through five RPCs; direct table INSERT/UPDATE/DELETE denied |

No model call, legacy credit mutation, Production database write, environment change, deployment, commit or push occurred. Fixture credentials were test-only and are not recorded here. The reusable schema/grant assertion script is `supabase/tests/v1_shadow_contract_assertions.sql`.

Cleanup evidence: 3 test users, 3 identities, 9 sessions, 9 refresh tokens, 2 documents, 2 revisions, 2 wallets, 4 lots, 6 quotes, 2 reservations, 4 allocations and 8 ledger rows were removed. Post-cleanup counts for every shadow business table, legacy table and orphan auth/session check were 0; deleted password grant returned 400. The dedicated branch was then deleted, and the branch list returned only the default main project.

### NDIS integration database gate (second disposable branch)

The application-layer integration was tested separately on branch `qkciaecjwidtbujzwzln`, which Supabase reported as non-default, `with_data=false`, healthy and parented to `adocsnwnslxhxcjgbyee`. The branch cost confirmation was `0.01344/hour`; the branch was deleted after the run.

| Gate | Result |
|---|---|
| Migration reproducibility | foundation + integration applied; branch reset to parent `20260804115230`; both applied again |
| Transaction assertions | `v1_shadow_contract_assertions.sql` and `v1_ndis_shadow_integration_assertions.sql` passed before and after reset |
| Legacy safety | generated drafts, entitlements and legacy ledger stayed at 0 before fixtures; generated-material column signature `a8f2575c37929a5a7144c03c644917e4` matched before/after apply |
| Integration grants | three tables had RLS; zero anon/authenticated table grants; zero public/anon/authenticated RPC grants; exactly three service-role RPC grants |
| Integrity | three `shadow_only` checks; composite source-owner/document/revision FKs present; invalid owner/target fixtures rejected by assertions |
| Same-key concurrency | one call returned `PROJECTED`, the concurrent call `REPLAYED`; one document/revision identity |
| Distinct-content concurrency | advisory lock serialized the two calls as revisions 2 and 3; no silent overwrite |
| Failure/reconciliation | malformed projection returned `FAILED` + `SHADOW_WRITE_FAILED`; audit reported failed/missing source metadata without body content |
| Shadow read | controlled calls returned `MATCH`, `MISMATCH` and `MISSING` as expected |
| Legacy credits / Points | no entitlement/credit rows were changed; Point wallet/lot/quote/reservation/allocation/ledger counts remained 0; no welcome grant |
| Anonymous REST | canonical and integration reads returned `401`; service-only RPCs were not exposed and returned `404` |
| Supabase advisors | security/performance findings were INFO/WARN platform or FK-index advisories; existing Preview hot-path indexes were retained and no mechanical bulk indexing was added |

The fresh integration JWT/App Preview gate did **not** complete. Official branch signup required email confirmation and produced no session. A direct SQL Auth fixture produced a GoTrue compatibility error; patching Auth token internals was rejected and not attempted. The fixture and one unconfirmed official-signup user were deleted. The available branch tooling exposed publishable keys but not a branch-only server secret, so no honest Vercel Preview could be configured. No Preview deployment or environment value was created.

Cleanup evidence for the second branch: Auth users, identities, sessions and refresh tokens; legacy drafts/credits; canonical documents/revisions/checkpoints; links/outbox/comparisons; claims/events/quota; and all Point tables were each verified at 0. The branch was deleted and the branch list returned only default `main`.

### Protected App Preview E2E (retained baseline branch)

The final application gate used branch `odrdlsrdlmtjczhmsbnj` (ID `5ce82f14-2a98-4f23-9022-8ece9ff2397b`), which Supabase identified as non-default, `with_data=false` and parented to `adocsnwnslxhxcjgbyee`. Both migrations were present. Production database, Vercel target and alias were not changed.

| Gate | Result |
|---|---|
| Guard on, parser-valid save | unchanged legacy 200/save behavior plus one `PROJECTED` canonical revision |
| Shadow read | metadata-only comparison returned `MATCH`; canonical content was not served to the browser |
| Idempotency replay | same request/key reused the existing projection and did not add a revision |
| Owner isolation | provider B saw and affected zero provider A legacy/canonical resources |
| Master kill switch | legacy Save succeeded while shadow links/documents/revisions/outbox/comparisons stayed unchanged |
| Model/cost | zero OpenAI calls; existing legacy credits and every Point table remained unchanged |
| Projection failure evidence | parser/adapter failure is caught at the projection boundary and logs only `PROJECTION_ERROR` plus non-content status metadata |
| Cleanup | A/B Auth users and all test-tagged rows were verified at zero; five test deployments and six activation/test env values were removed |

The owner intentionally retained the empty branch as a dedicated Preview schema baseline. Preview base URL and the two existing branch keys remain configured; the keys were checked only for non-empty presence and were never printed. Activation flags are absent. The temporary env-pull file was deleted and verified absent. Production alias remained on its pre-cleanup deployment. Final database hardening was forward-applied under registry versions `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048`. A real synthetic pre-identity row was backfilled from its link, an unidentifiable orphan was tombstoned and owner-hidden, a simulated historical PURGED row remained terminal, a simulated missed tombstone appeared as metadata-only `SOURCE_DELETE_CLEANUP_PENDING` without owner visibility, and a same-ID/new-generation ABA fixture proved write-free replay and generation isolation. The fixtures were removed, and the updated foundation/integration assertions passed in rollback transactions. Every Auth/legacy/canonical/integration/Point count remained zero. The earlier protected deployment predates the revised route bundle and is not route-level promotion evidence for it.

This does not prove a live, data-bearing cross-migration upgrade. The `20260810072017` to `20260810072952` boundary is not atomic, and a pre-existing PURGED row's original `updated_at` cannot be reconstructed after the corrective update without snapshot evidence. Production testing must start from a zero-row preflight under a maintenance/snapshot gate, or use a separately reviewed transactional/squashed plan and restoration manifest.

### Existing coverage by requirement area

| Area | Current evidence | Related V1 IDs actually supported |
|---|---|---|
| Auth and redirects | `src/app/auth/actions.test.ts`, `src/app/auth/callback/route.test.ts`, `src/lib/google-oauth.test.ts`, server-auth/session tests | `AI-AUTH-001` partial, `AI-AUTH-002` partial, `AI-AUTH-003`; `APP-AUTH-001/002/006/008` partial/reusable |
| Role navigation/deny | `src/components/app-shell.test.tsx`, `src/lib/referral-workspace-auth*.test.ts`, admin/provider page tests | `AI-PERM-001/002` partial; `APP-NFR-001` partial |
| Browser privacy | `src/lib/ndis-case-note-browser-privacy.test.ts`, Companion component tests | `AI-PRIV-001`, `AI-IN-001` partial; `APP-NOTE-010/015` partial |
| Server minimum facts/privacy | NDIS route, request and companion tests | `AI-IN-003`, `AI-PRIV-002`; `APP-NOTE-014/015` partial |
| Structured output/safety | `src/lib/openai-ndis-case-note.test.ts`, `src/lib/ndis-case-note-companion.test.ts` | `AI-TYPE-004`, `AI-GEN-005/006/009` partial; `APP-NOTE-004/018/019` partial |
| Credit transaction/idempotency | `src/lib/account-credit-store.test.ts`, NDIS route tests, migration contract assertions | primitive for `AI-GEN-002/004/007`, `AI-PTS-006`; `APP-PTS-003` reusable |
| Claims/save/owner isolation | Companion store/save/draft route tests, generated material store tests | `AI-DOC-006` partial; `APP-DOC-001` partial |
| Metadata-only telemetry | event route/store and pilot funnel contract tests | `AI-DATA-005/006`, `AI-NFR-009` partial; `APP-NFR-002/012` partial |
| Locale/UI/visual structure | i18n, page, brand font, shell and Companion component tests | current `en`/`zh-Hans` only; V1 `zh-Hant` remains untested/conflicting |
| SEO boundary | `src/app/seo-policy.test.ts`, page metadata tests | confirms AI noindex and Core SEO ownership; not an App V1 capability |
| Legacy regression | provider drafts, guided materials, outreach, referral/profile tests | protects Web legacy scope; does not satisfy five Note/App requirements |
| V1 transport, privacy and route contract | `src/lib/v1/shared-contracts.test.ts`, `openapi-shadow-contract.test.ts`, `transport-contract.test.ts`, `product-api-route.server.test.ts`, `privacy-review-scanner.server.test.ts`, `privacy-review-route.server.test.ts`, `privacy-review-memory.test.ts` | three locales, five Note codes, version/min-client/correlation/error headers, scanner/locator/no-leak/proof-binding behavior and default-off routes; no Production-served API |
| Canonical document shadow | `src/lib/v1/canonical-document-shadow.test.ts` | owner deny, immutable revision sequence, stale base, full-request idempotency, checkpoint, self-review invalidation and tombstone/purge domain rules |
| Points shadow | `src/lib/v1/points-shadow.test.ts` | lot ordering/expiry, quote boundaries, reserve/commit/release, replay, insufficient balance and cross-owner deny in memory |
| Legacy NDIS projection | `src/lib/v1/legacy-ndis-adapter.test.ts` | deterministic read-only projection, no approval upgrade, no invented facts and metadata-only migration candidate |
| Production-unapplied SQL boundary | `src/lib/v1/v1-shadow-migration-contract.test.ts`, `mobile-sync-migration-contract.test.ts`, isolated guarded-live and local engine evidence | additive/no legacy DML, owner isolation and explicit grants are source-checked; historical deleted `r4` passed the 13-file foundation manifest 13/13 and six rollback suites. At HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, deleted `r9` passed the exact 14-file worker manifest 14/14, seven rollback suites and independent hard-off/zero-row/role/RLS/ACL/9-RPC postchecks. Deleted `r20` additionally passed the PostgreSQL 17.6 true two-session claim/session/privacy race gate; deleted `r21` passed the Attempt 1/Attempt 2 historical-replay and post-purge matrix; deleted `r22` passed 15/15 and 7/7. The isolated PostgreSQL 16.15 gates added engine and strict two-backend evidence. Deleted Hosted r5 then passed the exact 30-file manifest, all 11 rollback suites and the independent owner/role/RLS/ACL/hard-off/zero-fixture postcheck. All diagnostic Previews and local test resources were removed. This is schema/transaction evidence only; runtime writes remain withheld |
| Owner generation repository boundary | `note-generation-owner-repository.server.test.ts`, `note-generation-owner-runtime-migration-contract.test.ts` and `v1_note_generation_owner_runtime_rpc_shadow_assertions.sql` | exact private direct-query calls, owner-safe envelopes, default-empty admission, fresh session/privacy/catalog selection, idempotent atomic enqueue, status/cancel while hard-off and atomic cancellation are source/local-SQL tested. The local PG16.15 owner/posture/session-lock gate and deleted r5 Hosted 30/30 migration, 11/11 assertion and independent posture gate passed. No retained Preview, hosted Auth/Data API, route, caller grant, vault/model/Points or Production capability |
| Worker-registration graceful retirement | `note-generation-registration-retirement-shadow-migration-contract.test.ts` and `v1_note_generation_registration_retirement_shadow_assertions.sql` | migration #29 preserves immutable digest-bound `APPROVED` registrations, adds the fourteenth forced-RLS table and validates append-only retirement, fixed reasons, exact sorted active-binding compare-and-retire, idempotent replay, new-admission/new-claim denial and existing-attempt drain/recovery. The local 29/29, 9/9, posture and two-ordering race gate plus deleted r5 Hosted 30/30, 11/11 and independent posture gate passed. No caller grant, route, credential, seed, activation, emergency revoke or Production capability |
| Portal Referral intake, source-detail, Assignment M1a and Provider Response M1b runtimes | four migration contracts, route/runtime/Supabase/UI tests and rollback suites | default-off cookie-only source list/create/detail, operator queue/detail/triage/candidates/offer and approved-provider metadata inbox/accept/decline; independent application/database operation gates; exact authenticated RPC grants; database-derived exact-one operator/provider contexts; tenant/provider isolation; post-lock session revalidation; strict DTO/ACK parsing; PII-separated create; assignment offer keeps `assigned_provider_id` null and M1b accept sets it from database context. M1a retains its deleted exact-current Hosted GoTrue/PostgREST Cookie evidence. Post-review M1b source `f45b19c` passed 8/271 focused and 143/1,935 full tests, its PostgreSQL 16.15 7/7 migration + 4/4 rollback gate and 6/6 real two-backend races. Exact gate source `44f3bd6` then passed the deleted no-data Preview's 33/33 migrations, 14/14 rollback suites, all 14 real two-provider SSR-cookie/Data API assertions and active-first/non-null-cursor delta 2/2, followed by clean terminal posture, final Advisors, three deletion probes and unchanged Production. The later focus/sign-in UI recovery passed only the local 8/274 and 143/1,938 gates and is not covered by `44f3bd6`. Neither Portal slice has a Vercel Preview deployment, retained activation or Production application |
| Portal Referral Follow-up M1c runtime | M1c migration contract, route/runtime/Supabase/UI/browser tests, rollback suite and retained local concurrency lifecycle | default-off exact-provider accepted private detail plus five-code follow-up; A/B isolation, strict DTO/ACK, post-lock session checks, actor-bound hashes, atomic follow-up/audit/receipt/version writes and PII-safe resource/epoch-fenced lifecycle/replay are source/local tested. Receipt replay now takes referral→ordered-match locks and revalidates live session/assignment/status/coherent accepted tuple before reusing the ACK; `CLOSED` residual bindings fail closed. The application checkpoint passed 336 focused, 2,011 then-current full tests and 64/64 build pages; the post-review exact local gate passed 2/28 focused concurrency-policy tests, 149/2,039 current full tests and all 8/8 PostgreSQL 16.15 true multi-backend races twice through fresh no-TCP private-socket clusters with exact cleanup and an exact-hash-pinned live harness. Hosted Auth/Data API, deployment, activation and Production remain unproved |
| Runtime isolation | `src/lib/v1/runtime-boundary.test.ts` | audited NDIS routes and the new `/v1` adapter are the only allowed server boundaries; `/v1` remains disabled without explicit adapters |

### Communication Note provider-evaluation source gate — 2026-08-27

The historical M1d Communication-specific provider slice introduced a real
fixed-endpoint OpenAI Responses HTTPS adapter and a digest-bound evaluation
policy while keeping it unreachable from routes and worker registries. M1e has
since removed that executable HTTPS path; current execution is limited to an
injected non-HTTPS mock transport for contract tests. Three deeply
frozen synthetic fixtures cover English, Simplified Chinese, Traditional
Chinese and mixed-language inputs. Exact Arabic-number multisets, required fact
markers, shared privacy/output checks and Communication decision-language
refusals fail closed. The current contract-test parser path additionally
requires a matching local event date/hour-minute and exact non-date
Arabic-number quantity multisets in all three drafts; source-backed additional
dates/times remain valid, while lists cannot introduce new numeric tokens.
Provider responses require the exact policy model and Response object, one
completed assistant output, bounded JSON and strict candidate keys; unverified
`EXACT` model revisions are rejected, and error bodies, note text, raw provider
IDs, facts and credentials are absent from evidence.

The focused gate passes 79 tests across the provider, golden/refusal,
registered-worker and runtime-boundary suites, and TypeScript passes with no
emit. The full local gate passes 151 test files / 2,062 tests, full lint and a
64/64-page Next 16.2.9 production build using webpack. Every provider call is
mocked. The test-only model identifier is not an approved current model. There
was no OpenAI call, API-key or environment change, database/Points activity,
route/UI, deployment, commit or push. Readiness stays compile-time `false`.
Detailed scope and activation blockers are in
`documentation/communication-note-provider-evaluation-m1d.md`.

### Communication Note Preview-evaluation policy source gate — 2026-08-27

M1e replaced the test-only model alias with the exact evaluation snapshot
`gpt-5.4-mini-2026-03-17` and adds a separate canonical governance digest for
the provider-policy digest, closed AU-storage Responses endpoint profile,
explicit `reasoning:none`, synthetic-only input class, ZDR/amendment
requirements and dated price evidence. It recorded proposed six-call/US$0.25
ceilings and all-candidate automated plus human-semantic requirements for a
future approved runner; it did not claim those aggregate controls were already
enforced.

The policy tests reject model aliases, arbitrary or malformed endpoint input,
stale digests, missing/extra fields, recomputed tampered-plan digests and nested
changes to model, endpoint, reasoning, data posture, budget, fixture set or
checks. Literal pins cover both full fixture contents and the complete plan.
The request builder consumes the same frozen plan, requires its provider-policy
digest to match and obtains the future paid-call URL only through the closed
endpoint profile. The paid factory remains unavailable and accepts no secret or
network transport; parser/transport tests use only an injected mock with a
non-HTTPS URL. At the M1e checkpoint, the runtime-boundary test kept the modules
server-only and left the adapter absent from all runtime importers.

The plan records Australia regional storage as supported and regional
processing as unsupported. It separately records that the key's project region
is not attested and that Structured Output schema system data is outside
regional-residency coverage. ZDR, the Modified Retention amendment, owner spend
approval, out-of-region-processing acknowledgement, temporary-key teardown and
pricing reconfirmation remain unattested; runner budget/report binding was not
implemented at M1e. Evaluation readiness stays `false`, the approved evaluation
snapshot stays `undefined`, and every provider-shaped response in tests is
mocked. No API key, environment, provider call, database/Points write, route,
deployment, commit or push is part of this source gate. Detailed scope is in
`documentation/communication-note-preview-evaluation-policy-m1e.md`.

M1f has since closed M1e's static-request reproducibility item by
literal-pinning the complete system prompt, Structured Output schema and static
request semantics. The current rendered requests are separately hashed into
the report, but there is no independent historical wire-format approval pin.
It also implements the mock-only source runner described below; neither change
authorizes a paid call.

The final focused M1e gate passes 6 test files / 150 tests. The full local gate
passes 152 test files / 2,081 tests, TypeScript with no emit, full lint and the
64/64-page Next 16.2.9 webpack production build. The repository-level Codex
adapter check passes all 73 generated files and `git diff --check` passes.

### Communication Note one-shot Preview-evaluation runner source gate — 2026-08-27

M1f binds the literal request-template digest, fixed six-slot manifest, revised
plan digest, dedicated one-attempt/no-retry worker policy and one-shot runner
policy. All six requests are rendered, hashed and token-counted before any
provider dispatch. The maximum 10,000 input and 2,400 output tokens reserve
20,130 micro-USD per call and 120,780 micro-USD total against the fixed
250,000-micro-USD ceiling. Calls are serial, any failure is terminal and no
seventh call or fallback can occur.

The runner tests cover policy and digest drift, deep freezing, the unavailable
paid factory, forged-provider rejection, complete-preflight ordering and exact
frozen requests, exact manifest order, six success calls and 18 language
reviews, BigInt rounding, conservative cached-token reconciliation, positive
usage and all input/output/cached/reasoning bounds, provider and trusted-callback
deadlines, cancellation at each asynchronous boundary, golden/schema failures,
unique non-null provider-request-ID hashes, same-ID synchronous/concurrent/replay
reuse, different-ID conflict, content-redacted errors, semantic report tampering
after digest recomputation and absence of built-in environment, global-fetch,
HTTPS and credential paths. The runtime-boundary suite permits the provider
import only from this source-only runner and proves that no other source runtime
imports the runner.

The successful mock report is recursively frozen and contains only source
digests, fixture IDs/ordinals, hashes, token/cost values, timestamps and pass
flags. Raw facts, drafts, prompts, provider request IDs, run IDs, response/error
bodies and credentials are absent. Calculated cost is explicitly an upper bound
rather than an invoice amount. The report labels itself
`UNATTESTED_TEST_CONTRACT_ONLY`: its recomputable digest provides internal
integrity, not source authentication.

The focused M1f gate passed 6 files / 85 tests. The complete local gate passed
155 files / 2,126 tests, TypeScript with no emit, full lint, the 64/64-page Next
16.2.9 webpack production build, all 73 generated Codex-adapter checks and
`git diff --check`. All provider responses, token counts and review results were
injected trusted test callbacks; those callbacks were arbitrary code and did
not form a network security boundary. Paid readiness remained `false`, the
approved runner policy was `undefined`, and the paid factory remained
unavailable. At that checkpoint, an independently pinned exact JSON body,
durable single-use approval claim, authenticated execution receipt,
provider-side project spend cap and temporary key, real reviewer attribution,
Australia project/ZDR/Modified-Retention attestations, processing
acknowledgement and immediate price reconfirmation remained P1 prerequisites
for any separately authorized synthetic call. No OpenAI call, database/Points
write, route, deployment, commit or push was part of M1f. Detailed scope is in
`documentation/communication-note-preview-evaluation-runner-m1f.md`.

### Communication Note exact request-body pin source gate M1g-a — 2026-08-27

M1g-a adds wire serializer version
`wire.communication.openai.responses.2026-08-27.m1g-a.v1`, body-pin version
`pin.communication.openai.synthetic-request-body.2026-08-27.m1g-a.v1` and
literal bundle digest
`90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8`.
The bundle retains six ordered manifest slots and three distinct synthetic
request bodies. Each body is independently pinned by its raw UTF-8 SHA-256,
exact byte length and semantic canonical digest, so raw key-order or
serialization drift cannot hide behind semantic equality.

Runner version
`runner.communication.openai.synthetic-preview.2026-08-27.m1g-a.v2` with
digest
`a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4`
validates every source body pin before token preflight. The branded provider
validates the selected slot again and passes the same `JSON.stringify` string,
without reserialization, to the injected non-HTTPS mock callback. The mock
report binds the bundle digest, raw body hashes, byte lengths and semantic
digests. Its validator compares those report values directly with the literal
slot pins and does not rebuild the request to manufacture its expected value.

Tests cover the literal bundle and deep freeze, exact six-slot/three-body
mapping, builder-to-literal byte equality, raw-versus-canonical drift, model,
prompt, schema and inner-JSON mutation rejection, slot and self-resigned bundle
tampering, exact provider mock-body dispatch, runner preflight and evidence
binding, report tamper rejection, content redaction and the server-only importer
allowlist. The focused M1g-a gate passed 4 files / 77 tests. The full
`npm test` run passed 156 files / 2,143 tests; lint with
`--max-warnings=0`, the sequential `npx next build --webpack` production build
and subsequent `npx tsc --noEmit --incremental false` all passed. Repository
adapter synchronization passed for 73 checked files, and `git diff --check`
passed after the final M1g-a documentation update.

This is exact application JSON request-body evidence, not a full HTTP/TLS wire
capture. The bundle declares `UNATTESTED_SOURCE_PIN_ONLY`,
`NOT_EXECUTION_AUTHORITY`, external owner approval `ABSENT` and dispatch
attestation `ABSENT`. Request-body-pin and paid-runner readiness remain `false`,
approved snapshots remain `undefined`, and the paid factory remains
unavailable. There is no API key, signature, signer, trusted verification key,
durable single-use approval claim, authenticated dispatch receipt, real network
call, database/Points write, route, deployment, commit or push in M1g-a.
Detailed scope is in
`documentation/communication-note-preview-request-body-pins-m1g-a.md`.

### Communication Note owner-authorization shadow contract M1g-b — 2026-08-28

M1g-b literal-pins authority policy digest
`7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9`
and adds a server-only Ed25519 verification contract for an external owner
authorization. The signer key is accepted only through an explicitly injected
external trust-registry snapshot with enforced purpose/domain/owner/tenant
scope; a caller-supplied expected binding separately fixes the run. Statement
digests alone cannot authenticate or self-authorize an envelope. The exact
statement binds owner, tenant and run
hashes, a bounded 15-minute window, at least 5 minutes remaining at durable
claim, all M1e/M1f/M1g-a source digests, the six fixed slots, synthetic-only
input, environment-evidence hashes and the fixed budget.

The source authority tests cover a valid external Ed25519 signature and reject
signature recomputation with only a changed SHA-256 digest, untrusted/self-
supplied key material, cross-purpose/cross-tenant keys, source/slot/budget/time/
key drift and content-bearing evidence. Receipt vectors keep the client request
ID, OpenAI `x-request-id` and Responses body `response.id` pairwise distinct;
bind every content-free reservation field and reservation time; exactly
recompute the fixed integer-ceiling cost; validate partial ambiguous transport
plus other outcome-specific shapes; verify a separate CaresLink Ed25519
signature; and retain
`providerAttestation=ABSENT` plus the explicit non-proof list.

The paired migration contract must prove five private append-only ledgers,
enabled plus forced RLS, exact role/function ACLs, empty function search paths,
no API/service-role access, canonical statement validation, one atomic claim,
one pre-network reservation per ordered slot and one terminal signed receipt
per reservation. Each RPC must statically and dynamically reject every
transaction isolation level other than `READ COMMITTED`. Runtime SQL evidence
must additionally prove row-lock
serialization, fresh post-lock time checks, exact response-loss replay without
token reissue, revocation-before-claim denial, post-claim revocation blocking
later reservations, ordered slot progression and permanent consumption of
ambiguous transport. No external HTTP call may occur
inside a database transaction.

The exact local source gate passed 158 Vitest files / 2,163 tests, the focused
3-file / 26-test authority gate, TypeScript, ESLint, the 64/64-page Next.js
webpack production build, the 73-file Codex-adapter sync check and
`git diff --check`. A fresh private-Unix-socket PostgreSQL 16.15 cluster
clean-applied 35/35 migrations and passed the 65,918-byte rollback assertion
(SHA-256
`cb98ff81ed8d6211cb6ddffcf02d5fde882c60e9f5f07f09b0833c354fa3f1d7`),
including all five `REPEATABLE READ` rejection probes, before rollback with
zero fixture rows.

A second fresh no-TCP PostgreSQL 16.15 cluster applied the exact 35-file
manifest (SHA-256
`4676531ac4f87ed1d7caf7e949f9663581ca1b1c7707bf2ea7f42cf3b908a986`)
and passed three true two-backend races with observable
`Lock/transactionid` waits. Concurrent same-authorization claim returned one
token and one row while the loser failed `AUTHORIZATION_ALREADY_CLAIMED`.
Revocation-first caused the waiting reservation to fail
`AUTHORIZATION_REVOKED` with zero reservation rows. Reservation-first committed
one dispatch authority before the waiting revocation committed, leaving the
expected one reservation plus one revocation in timestamp order. The clusters
used synthetic metadata only; no provider transport, TCP listener or hosted
resource was involved, and all race-gate resources were stopped and removed.

This is source/local contract evidence only. The database persists an
authorization or receipt only after the application boundary has verified its
signature; PostgreSQL does not independently implement or attest the external
Ed25519 trust registry. Both readiness latches are literal `false`, both
approved key snapshots are absent and the source has no runtime importer,
credential, transport or caller grant. No real OpenAI request, paid spend,
hosted Supabase mutation, retained Preview, route, worker, Points write,
deployment or Production change is part of M1g-b. Detailed scope is in
`documentation/communication-note-preview-owner-authorization-m1g-b.md`.

### Communication Note key-custody and caller-shell source gate M1g-c — 2026-08-28

M1g-c is limited to the default-off server-only
`communication-note-preview-key-custody.server.ts` contract and an additive
least-privilege caller migration. The expected focused source gate verifies
three explicitly injected, purpose-separated, content-free descriptors:
candidate metadata labelled as an external owner-verification snapshot, the
digest of a non-exportable CaresLink receipt-signer handle and the digest of a
temporary OpenAI project service-account credential reference. It rejects a
future `observedAt`, non-`ACTIVE` or expired key, malformed candidate metadata,
cross-purpose references, raw private keys, raw bearers, broad/user/Production
credentials, unbounded project/spend/expiry claims, content-bearing evidence
and any attempt to treat an identity HMAC as database or Auth authentication.
It deliberately does not establish registry provenance, a maximum snapshot age
or complete revocation evidence; those remain activation blockers.

The runtime-boundary assertion scans controlled root scripts plus `src/`,
`scripts/` and optional `supabase/functions/` trees, including TS/JS ESM/CJS
extensions, and must keep the custody module absent from every route, component,
product runtime, worker, queue and scheduler importer. Paid and
application readiness must remain literal `false`; the source must perform no
environment lookup, global network call, key creation/resolution or secret
logging.

Migration
`20260828034704_add_communication_note_preview_custody_callers_shadow.sql`
and rollback assertion
`communication_note_preview_custody_callers_shadow_assertions.sql` must prove:

- exactly four `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS` caller
  shells;
- the exact 1/1/2/1 registration/revocation/dispatch/receipt function mapping;
- only private-schema `USAGE` and exact function `EXECUTE`, with no table,
  sequence, broad-function, caller-to-executor/runtime, usable `INHERIT` or
  `SET ROLE`, login, API, `service_role` or `authenticator` privilege; the only
  tolerated role edge is PostgreSQL 16's exact creator ADMIN bootstrap shape
  with both `INHERIT` and `SET` false;
- preserved M1g-b executor ownership, `SECURITY DEFINER`, `search_path=''`,
  forced-RLS/append-only posture and five-function `READ COMMITTED` behavior;
- no custody table, credential row, seed, fixture, login-capable identity or
  runtime activation.

Local PostgreSQL evidence must clean-apply the exact current migration manifest,
run the new assertion inside its rollback boundary, independently confirm the
role/ACL posture and finish with zero M1g-c fixtures. No hosted database, real
key, OpenAI control-plane action, provider request, paid spend, Vercel change,
deployment or Production action belongs to this gate.

Evidence handoff — fill only from the final exact source run:

| Evidence | Final value |
|---|---|
| M1g-c policy version | `custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1` |
| M1g-c policy digest | `1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438` |
| focused files / tests | 4 files / 33 tests passed |
| full files / tests | 160 files / 2,179 tests passed |
| TypeScript / ESLint / Next build / static pages | serial `tsc --noEmit` and full ESLint passed; Next.js 16.2.9 Webpack production build passed with 64/64 static pages. The default Turbopack entry was environment-blocked before compilation because this temporary worktree's `node_modules` is a symlink outside its filesystem root |
| repository adapter sync / diff check | 73 adapters in sync; `git diff --check` passed |
| PostgreSQL version and migration manifest count/digest | PostgreSQL 16.15 (Homebrew), private Unix socket and no TCP; 36/36 migrations clean-applied as ordered raw transactions. Ordered basename SHA-256 `5bb377df2075029d3bce3aaf70e303bc7441b76e9d011cee9ba202872331232e`; ordered concatenated-content SHA-256 `5a830bf901acaf9b71d3cd88ff618c80561136fcd71c08f4cf694acbe8bf74a2` |
| migration bytes / SHA-256 | 7,005 bytes / `e6b77e76406d8db1d68ad6e8da0d9d2dd88521c713047c0415aa60d29243d432` |
| assertion bytes / SHA-256 | 24,511 bytes / `7fa7fa9d4c9667005b36c1f72c95aaf2418131d05037b5ea347f83e0bfcf16d2` |
| migration-contract test bytes / SHA-256 | 8,482 bytes / `d7550ecdea8fad00a1f6228fd230814f7c7dee74dc387244ce939f94bae7c918` |
| rollback/posture/zero-fixture result | final M1g-c assertion passed both as superuser and in a rollback-only non-superuser `CREATEROLE` topology with the exact ADMIN=true/INHERIT=false/SET=false bootstrap edges; adjacent M1g-b assertion passed; temporary actor and membership edges rolled back to zero; all five M1g ledgers remained zero rows |
| terminal local cleanup | PostgreSQL stopped; exact temporary cluster directory `/private/tmp/careslink-portal-follow-up-pg16.OxuRKMf1` removed; port 65431 closed |

Detailed source boundary and remaining real-activation blockers are in
`documentation/communication-note-preview-key-custody-callers-m1g-c.md`.

### Communication Note activation-preflight source gate M1g-d — 2026-08-28

M1g-d adds only the server-only, pure
`communication-note-preview-activation-preflight.server.ts` contract. Its
validator consumes explicitly injected, content-free M1g-b authorization,
M1g-c custody and candidate evidence. It performs no environment lookup,
network/provider/database call, credential/key resolution, signing, hosted
mutation or deployment. The live factory always throws; successful test-only
validation returns `activationReady=false` with the five exact blockers. All
eight pre-existing readiness constants remain `false` and all six approved
values remain `undefined`.

The focused gate covers literal policy/blocker pins, recursive freezing and
rebuilding, exact 36-file boundary-safe migration manifest pins, all authority/
custody/provider/database/caller/review constraints, shared post-issuance
timestamps, exact five- and 15-minute boundaries, cross-purpose digest/HMAC/
reference isolation, hostile proxies/accessors/custom arrays, bounded data-graph
traversal, secret/content exclusion and runtime-importer quarantine. No SQL
migration or PostgreSQL/Hosted run is required because M1g-d changes no schema.

Evidence handoff:

| Evidence | Final value |
|---|---|
| M1g-d policy version | `preflight.communication.openai.synthetic-preview.2026-08-28.m1g-d.v1` |
| M1g-d policy digest | `81ab3c3bac64f2f9205c2eb358e298d440e3735e5a9c0ed07a842058e6947e53` |
| focused files / tests | 4 files / 38 tests passed |
| full files / tests | 161 files / 2,189 tests passed |
| TypeScript / ESLint | `tsc --noEmit --pretty false` and full `eslint .` passed |
| Next production build | Next.js 16.2.9 Webpack build passed; 64/64 static pages generated |
| repository adapter sync / diff check | 73 adapters in sync; `git diff --check` passed |
| migration source pins | 36 migrations; ordered-basename SHA-256 `5bb377df2075029d3bce3aaf70e303bc7441b76e9d011cee9ba202872331232e`; canonical ordered `{name, sha256, utf8ByteLength}` entries SHA-256 `97e6e7be1907ae1b43bb8698f00e4a708a2c5b95f6875fe453aa43bbf0839fad` |
| new source bytes / SHA-256 | 46,008 bytes / `af80399ce3c78544716ad7199e7ccb9da104c42305f7272fb65b735e2f19f6dd` |
| new focused-test bytes / SHA-256 | 46,582 bytes / `45ba9e31543168d1eaf81d91884f58ac2873cef13bda1eccfb3cae418a861f39` |
| security review | P0/P1/P2/LOW = 0 within the strict source-only `TEST_ONLY` boundary; no product runtime importer or activation capability |

The database target/Production HMACs and common key-reference digest remain
injected candidate consistency, not independent Supabase inventory/control-
plane attestation. External evidence digests and shared timestamps likewise are
not authenticated bindings to canonical source bytes or trusted system
responses. They remain explicit activation blockers under
`EXTERNAL_PROVENANCE_NOT_AUTHENTICATED`; login/caller claims remain blocked by
`RUNTIME_IDENTITIES_NOT_PROVISIONED`. If any future live path consumes this
result, those two boundaries must be closed first through a separately
authorized design and gate. Detailed scope is in
`documentation/communication-note-preview-activation-preflight-m1g-d.md`.

### Communication Note reserve-before-dispatch source gate M1g-e — 2026-08-28

M1g-e adds only the server-only, pure
`communication-note-preview-reserve-before-dispatch-coordinator.server.ts`
contract. It consumes explicitly injected, content-free evidence and uses the
real M1g-b authorization/receipt, M1g-c custody and M1g-d preflight validators;
it does not add an executable coordinator. No callback, environment lookup,
database/RPC operation, network/provider call, key or credential resolution,
hosted mutation, deployment or Production change belongs to this gate. The live
factory always throws and every readiness/approval latch stays closed.

The focused source gate covers:

- the literal final policy digest and fixed blocked reasons;
- registration → exact six-slot runner preflight → fresh parent-bound claim
  with at least five authorization minutes remaining → serial reservation →
  optional transport → Ed25519 receipt verification/persistence ordering;
- mandatory `RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE` before continuation from a
  `COMPLETED` receipt, including authorization/run/claim/reservation/receipt
  digest and signature bindings, exact fixture/body/preflight/usage/cost,
  seven true critical checks and passed `en`/`zh-Hans`/`zh-Hant` reviews;
- mutually exclusive, parent/receipt-bound
  `RUNNER_SLOT_FAILED_TEST_CANDIDATE` after provider completion, with terminal
  no-retry/no-continuation behavior and the fixed missing-durable-state blocker;
- terminal no-retry behavior for provider HTTP error, transport ambiguity and
  local pre-dispatch abort, plus the exact-only non-dispatching receipt replay;
- the 30-second application-transcript candidate interval for `COMPLETED` and
  `PROVIDER_HTTP_ERROR`, while delayed `TRANSPORT_AMBIGUOUS` stays allowed but
  terminal;
- cross-role purpose separation across static evidence, client/transport/
  runner-provider/runner-candidate/receipt/fixture values and the explicit
  `UNATTESTED_NO_SHARED_IDENTIFIER` relationship between the runner provider
  hash and receipt correlation HMACs;
- bounded plain-data traversal, fixed sanitized failures, recursively frozen
  content-free output and runtime-importer quarantine.

Evidence handoff for the final exact local source revision:

| Evidence | Current source-focused value |
|---|---|
| M1g-e policy version | `coordinator.communication.openai.synthetic-preview.2026-08-28.m1g-e.v1` |
| M1g-e policy digest | `ea6bb5854783a322bd059abbf5c9f7d1e96828d2569e72bce8d23d4b196bf9b0` |
| focused implementation coverage | 7 files / 108 tests passed across M1g-a body pins, M1g-b authority/receipt, M1g-c custody, M1g-d preflight, M1f runner, M1g-e coordinator and runtime quarantine; the narrower final coordinator/quarantine rerun also passed 2 files / 26 tests |
| full files / tests | 162 files / 2,206 tests passed; the suite emitted only the pre-existing unrelated React `act(...)` warnings |
| TypeScript / ESLint / Next build / adapter sync / diff check | `tsc --noEmit` passed; ESLint `--quiet` passed; Next 16.2.9 Webpack production build passed with 64/64 pages; 73 adapter files were in sync; `git diff --check` passed |
| coordinator source artifact | 62,274 bytes; SHA-256 `528c2af6f1568304e2d8cf96937a5b9a46e73e6f7ecec4f0954f303a8fc39544` |
| coordinator test artifact | 60,201 bytes; SHA-256 `913a110b43f13b39484f358909ae744547073396823320c6d82ca9b1fe089ea3` |
| SQL / Hosted Supabase evidence | not applicable to this source-only batch; no migration or hosted action |
| security review | independent final code and security re-audits found no remaining actionable P0/P1/P2/LOW findings; the durable runner terminal state and database-attested `reservedAt` remain explicit blockers, not closed claims |

Detailed evidence boundaries and remaining activation blockers are in
`documentation/communication-note-preview-reserve-before-dispatch-coordinator-m1g-e.md`.

### Communication Note durable runner-terminal source/database gate M1g-f — 2026-08-29

M1g-f remains source-only, default-off and unreachable by runtime identities.
It adds a forced-RLS, append-only runner-terminal ledger and an isolated
`NOLOGIN`/`NOINHERIT`/`NOBYPASSRLS` executor. The reserve RPC now returns the
database-written UTC-millisecond `reservedAt`; exact replay returns the same
stored value without dispatch authority. A later slot requires every earlier
reservation to have both a durable `COMPLETED` receipt and a durable
`ACCEPTED` terminal. Missing terminal evidence blocks without mutation, while
a failed terminal permanently consumes the run.

The migration intentionally adds no fifth runtime caller, runtime executor
membership or runtime-caller execute grant. The existing M1g-c contract remains
exactly four callers.

Before any live terminal grant, a separately authorized batch must add the
fifth purpose-scoped caller, custody descriptor and authenticated runtime port,
and must choose an explicit trust root: either an independently signed terminal
envelope or the authenticated adapter/caller as the sole attesting identity.
The caller-supplied verifier HMAC is not treated as a signature.

Evidence for the final local source revision:

| Evidence | Final value |
|---|---|
| terminal policy / digest | `policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1` / `4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a` |
| terminal statement version | `runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-f.v1` |
| stable authority / runner policy digests | `7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9` / `a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4` |
| derived preflight version / digest | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-d.v2` / `791a4d893afd4e490ab0164a8f604589bcf8015d25e5723b4df210f8c0b44f67` |
| derived coordinator version / digest | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-e.v2` / `4649f620bc60425d5ca40d308d167110befd4a29c772e9877ddbeac5eaaa3531` |
| focused implementation coverage | 7 files / 64 tests passed across terminal policy/migration, authority, custody, preflight, coordinator and runtime quarantine |
| full files / tests | 164 files / 2,221 tests passed |
| TypeScript / ESLint | `tsc --noEmit --pretty false` and `eslint . --quiet` passed |
| Next production build | Next.js 16.2.9 Webpack build passed; 64/64 static pages generated |
| repository adapter sync / diff check | 73 adapters in sync; `git diff --check` passed |
| migration manifest | 37 migrations; ordered-basename SHA-256 `d9cf6c02336c94fd7878b87a28b83063d3d1777a197cbdbfe97299e51efb8953`; canonical ordered `{name, sha256, utf8ByteLength}` entries SHA-256 `a85ed5cc2f12e7c3b8cf29e837b5153dddc2c797559065c6731731bbab396a16` |
| terminal policy source | 4,482 bytes; SHA-256 `51da5605992d2cdd2573ee327e7e07a10d25cb127a5f11a60aa876a60b88ccd6` |
| terminal policy test | 4,945 bytes; SHA-256 `0d310cf35b5d69785184e7455e8dd02bd9345ee1eb108a6f137ce5084c5900c6` |
| terminal migration contract test | 15,522 bytes; SHA-256 `4da8313cfb40d1dc040aa187c48a04a0f6d569c11ec5bbf96db61280a5e55348` |
| terminal migration | 39,948 bytes; SHA-256 `4341cdacb90e45eea428edfc57df29379ca211900e161844016daad190f7b9c5` |
| terminal rollback assertion | 37,768 bytes; SHA-256 `ca4e34eb11927eb55e2115f859f132493f3549ed4b8713c4c7d1be3e80483832` |

Disposable PostgreSQL 16.15 evidence used a private `0700` Unix socket,
disabled TCP listening and SSL, and applied the exact 37/37 migration set in a
single-error-stop sequence. The execution-authority, custody-callers and new
runner-terminal rollback assertion suites all passed. Independent functional
fixtures proved fresh/replay `reservedAt`, missing-terminal blocking, strict
string-type rejection, usage drift and preflight-token underestimate rejection,
accepted terminal replay and next-slot continuation, failed-terminal
permanence, and failed-to-accepted conflict rejection. Reapplying the migration over a
non-empty Preview execution ledger failed closed with the exact
`PREVIEW_EXECUTION_LEDGERS_MUST_BE_EMPTY` error and rolled back. All six
execution ledgers were then zero under the dispatch executor's RLS view; the
temporary cluster and harness files were deleted.

Independent contract/security review findings were incorporated into the
final SQL and source contracts; the final re-audits found no remaining
actionable P0-P3 or LOW issue. No Hosted Supabase connection or write, real
provider/model call, Preview/Production deployment, runtime activation, secret
resolution or real care data was used. The M1g-e runtime evidence blockers
`DATABASE_ATTESTED_RESERVED_AT_ABSENT` and
`DURABLE_RUNNER_TERMINAL_STATE_ABSENT` therefore remain closed, accurate
blockers rather than activation claims. Detailed boundaries are in
`documentation/communication-note-preview-durable-runner-terminal-m1g-f.md`.

### Communication Note signed runner-terminal caller/port gate M1g-g — 2026-08-29

M1g-g is an additive successor to the historical M1g-f gate. It selects an
independent Ed25519 terminal trust root, adds a fifth purpose-scoped `NOLOGIN`
caller and source-only signed-terminal/PostgreSQL ports, while leaving every
runtime readiness and approval latch closed. The caller identity HMAC remains
a purpose-scoped binding and is not accepted as terminal authenticity.

The signed statement binds purpose `CARESLINK_RUNNER_TERMINAL`, domain
`CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL`, signer key-id hash and
public-key fingerprint. Verification accepts only a canonical 64-byte Ed25519
signature encoded as 86-character unpadded Base64URL and checks the scoped
public-key snapshot before exposing immutable verified evidence. Owner,
receipt and terminal signer identifiers, fingerprints and custody references
must be pairwise distinct.

The CLI migration requires all six Preview execution ledgers to be empty,
drops the former unsigned
`persist_verified_communication_note_preview_runner_terminal(jsonb,text)`
entry and creates only the signed
`persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)`
entry. PostgreSQL recomputes the signature SHA-256 and binds the signer and
verifier fields, but does not claim application-side Ed25519 verification. The
new caller gets only private-schema `USAGE` and exact function `EXECUTE`; it has
no login, table/sequence/type/helper privilege, executor membership or API-role
edge.

Evidence recorded for this local source revision:

| Evidence | Final value |
|---|---|
| terminal policy / digest | `policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2` / `d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa` |
| terminal statement version | `runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2` |
| custody policy / digest | `custody.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2` / `f537dc64e3c57a34b6db6d0d1c871c38a70bcb51c4d071e625b026f840a309ca` |
| derived preflight version / digest | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-g.v3` / `491481513a67198cba91babc3c172fc1f326f9ee7bdd883b3d1208c639bdaf73` |
| derived coordinator version / digest | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-g.v3` / `f6609c2f357b5fda92ae5aa1b459dfb1e32b7893c3e8436e0e94a8ffa2bbe675` |
| signed terminal migration | SHA-256 `b095785331c848d02cabc417eb3131fe2f9328564abef6fc0dd35bccd2980c5a` |
| signed terminal rollback assertion | SHA-256 `f8e8307718e3bdf0835b93cdac075279ae4f5ba3dbab287af46e1280ce587ad5` |
| PostgreSQL compatibility | PostgreSQL 16.15 clean-applied the exact 38/38 migration set and passed the signed terminal assertion gate |
| non-empty-ledger cut-over refusal | PostgreSQL 16.15 applied the first 37 migrations, created one valid synthetic authorization (`1/0/0/0/0/0` across the six ledgers), then rejected migration 38 with exact `PREVIEW_EXECUTION_LEDGERS_MUST_BE_EMPTY`; the fifth caller, six new columns, signed constraint and three-argument RPC remained absent, the old two-argument RPC remained present, and the temporary cluster was deleted |
| focused signed-terminal/port/migration/boundary tests | 5 files / 53 tests passed |
| complete Vitest gate | 166 files / 2,250 tests passed |
| static gates | TypeScript passed; ESLint passed with zero warnings; 73-file Codex adapter check and `git diff --check` passed |
| production build | Next.js 16.2.9 explicit webpack build passed with 64/64 static pages; the default Turbopack command was not used as evidence because this isolated worktree's shared `node_modules` symlink resolves outside Turbopack's filesystem root |

The runtime and PostgreSQL factories are `TEST_ONLY`, accept only explicitly
injected dependencies and cannot create a pool/connection, read environment,
resolve keys/credentials or select another RPC. Runtime readiness stays
`false`; approved runtime/PostgreSQL ports, custody snapshot and terminal
signing key stay absent. The test-only signing-key snapshot is not cross-bound
to a live M1g-c custody/trust-registry resolver, and the verifier HMAC is not
cross-bound to a fifth-caller credential/identity resolver. These are explicit
activation blockers, so this evidence is not a live/end-to-end registry,
custody or caller-authentication claim. This gate used no Hosted Supabase
connection or write, real provider/model call, deployment, Production action
or real care data.
Detailed boundaries are in
`documentation/communication-note-preview-signed-runner-terminal-port-m1g-g.md`.

### Communication Note runner-terminal trust composition and disposable Hosted identity gate M1g-h — 2026-08-29

M1g-h adds source-level custody/trust composition, exact-composition runtime and
PostgreSQL port brands, a one-time LOGIN lifecycle and three disposable-Preview
harnesses. The source and local database evidence passed. The Hosted sequence
failed closed at its first rollback-assertion gate, so the later Hosted identity
and signed terminal gates were not attempted and activation remains denied.

| Evidence | Final value |
|---|---|
| registry/composition | `TEST_ONLY_VALIDATED_NOT_APPROVED` / `TEST_ONLY_COMPOSED_NOT_APPROVED`; readiness `false`; approved values `undefined` |
| focused Preview harness tests | 10 files / 140 tests passed |
| focused trust/runtime tests | 5 files / 37 tests passed |
| cleanup/recovery regression | 2 files / 22 tests passed, including four commit-response-loss cases, one quiesce-proof false-success denial and one reconnected-session reconfiguration/target-revalidation continuation |
| complete final Vitest gate | 171 files / 2,288 tests passed |
| static/build gates | TypeScript, targeted zero-warning ESLint, Node syntax and `git diff --check` passed; Next.js webpack build passed 64/64 pages |
| local database gate | disposable PostgreSQL 16.15 applied 38/38; signed `FAILED`/`CANCELLED`, fresh=true, replay=false, altered signed conflict, append-only, final `1/0/1/1/1/1`, role drop and cluster deletion passed |
| Hosted Preview | `careslink-note-terminal-m1g-h-r1-20260829`; id `64b9d356-91b8-44ed-a9b6-f3f11717e2bc`; ref `hspkccjobyqmoomiidjp`; parent Production `adocsnwnslxhxcjgbyee`; non-default, non-persistent, `with_data=false`, PostgreSQL 17 target |
| confirmed rate | US$0.01344/hour; no exact invoice or accrued total inferred |
| pinned TLS | CA `/Users/milliohusky/Downloads/prod-ca-2021.crt`; SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| rollback bundle | 18 files; manifest SHA-256 `163ddd40e68f8c2accc8904c4b7165c6630ba8fdad58b54a674d4f27908273f1`; Hosted result `SCHEMA_ROLLBACK_ASSERTION_FAILED`, not 18/18 |
| Hosted identity/terminal | not run after the preceding fixed failure; no Hosted LOGIN, terminal row, replay/conflict or role-drop success is claimed |
| teardown | branch delete returned success; three later listings showed the id/ref absent and only default Production `ACTIVE_HEALTHY` |

Supabase CLI 2.115 initially executed migration 37 without the transaction
block required by its `LOCK TABLE` statement and returned `LOCK TABLE can only
be used in transaction blocks`. Sending migrations 37 and 38 to this exact
Preview with temporary explicit outer transaction wrappers produced the exact
38-version history through `20260829011323`; repository migration bytes were
then restored unchanged. Branch metadata retained the earlier
`MIGRATIONS_FAILED` operation status while the Preview reported
`ACTIVE_HEALTHY`. This is evidence of version history, not a native clean apply.
The generic assertion code proves only that one of the 18 hash-verified SQL
requests returned an error and the immediate rollback request succeeded. It
intentionally discards SQL/driver detail, cannot distinguish a SQL assertion
from timeout, connection or protocol failure, cannot identify a file or passed
count, and does not prove the final ledger/role/membership postchecks.

Pre-deletion advisors returned 41 security findings (21 INFO RLS-without-policy,
20 WARN authenticated SECURITY DEFINER execution) and 184 performance findings
(72 unindexed foreign keys, 24 RLS init-plan, 87 unused indexes and one absolute
Auth connection strategy; 160 INFO and 24 WARN). They are project-wide findings,
not an M1g-h-only delta. Relevant remediation is documented in the
[M1g-h handoff](communication-note-preview-hosted-runner-terminal-identity-m1g-h.md).

The local signed failure result cannot substitute for the absent Hosted result.
The source `ACCEPTED` statement also carries nine usage keys while migration 38
requires equality with the stored six-key receipt usage, so `ACCEPTED` remains
unproved. A new Hosted attempt needs a fresh disposable Preview, cost
confirmation and authorization after a fixed, content-free per-file diagnostic
and PostgreSQL 17 regression close the rollback failure. No provider/model call,
real data, deployment, Production write, push, merge or activation occurred.

### Communication Note terminal ACCEPTED usage alignment gate M1g-i — 2026-08-29

M1g-i is an additive successor to the historical M1g-h gate. Migration
`20260829041316_align_communication_note_preview_terminal_accepted_usage.sql`
keeps the exact nine-key signed terminal usage and compares an exact six-fact
projection with the durable receipt. The current source also adds explicit
outer transactions to migrations 37 and 38 so their locks, temporary grants
and cleanup stay atomic under statement-by-statement migration transports.

| Gate | Result |
|---|---|
| migration identity | 39 migrations; ordered basenames `2bd2f029c86e1f4231b9a3bee7ee8681cb086dcd29eaaaceff21efcc1fec1fda`; current ordered entries `a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2` |
| transaction-wrapper migrations | migration 37: 39,965 bytes / `09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432`; migration 38: 28,835 bytes / `4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f`; each has one source-level `BEGIN`/`COMMIT` |
| migration 39 | 26,279 bytes; SHA-256 `3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e`; one explicit transaction contains every temporary DDL capability and its revocation; exact JSON key-set comparisons use explicit `C` collation |
| terminal assertion / rollback manifest | A03 SHA-256 `addcc0524c5ae1a20ab0797ae5d005cff846105da61b4100d0db2a60c9e5c1e6`; fixed-stage 18-file manifest `f200ccd7da5fce6c14d6b532cf205f22e2f21b934824cc9027f061e48b610034` |
| current policy pins | transactional `2026-08-29.preview-transactional-migrations.6` / `60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2` with 19 in-memory wrapper removals; identity `2026-08-29.preview-runner-terminal-identity.2`; preflight `m1g-i.v5` / `0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1`; coordinator `m1g-i.v5` / `1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2` |
| ACCEPTED vectors | exact nine-key positive, exact replay and six-fact receipt projection passed; six-key source, missing/extra/invalid reconciliation, inconsistent `ASSUMED_ZERO`/`UNAVAILABLE` and receipt drift failed closed |
| current application/static | 172 files / 2,321 tests; TypeScript; zero-warning ESLint; 73 adapter files; `git diff --check`; Next.js 16.2.9 Webpack build with 64/64 pages |
| current local database | disposable PostgreSQL 16.15 applied 39/39; migrations 37/38 passed a deliberate statement-by-statement sequence without a harness-supplied outer wrapper; A03 passed; final terminal rows and temporary SET edges were both zero; the cluster was removed |
| historical application/static | the prior `4e84823` artifact set passed 172 files / 2,315 tests, TypeScript, zero-warning ESLint, 73 adapter files, `git diff --check` and the 64/64-page Webpack build; it is retained only as the previous checkpoint |
| historical PostgreSQL 17 / Hosted | r19 id/ref `17627f14-b3ef-4d94-834e-8adde3850a2f` / `tsozyxxjxzqixkztdpmr`; r20 id/ref `0e4154f3-f995-4f6c-a025-898435d3b5c0` / `fhcmsezgladnmzhkzoeb`; r20's prior artifact set was committed as `4e84823d3c62e34abe0a0bd0f295e20dc456cae0` and passed 39/39, A01–A18, temporary-LOGIN signed `ACCEPTED`, replay, `IDEMPOTENCY_CONFLICT` and `[1,0,1,1,1,1]` with zero temporary LOGINs/sessions |
| exact-current PostgreSQL 17 / Hosted | execution source `02949d1a666fa8aa0496d3e995f1dd88c52a29a0`; deleted no-data Preview `careslink-note-terminal-m1g-i-v5-r2-20260830`, id/ref `0e63cac9-d1dc-4096-9f65-c36de91c85fa` / `yrsgxbxislyenblphfdl`; pinned 19-row baseline, transactional 39/39 policy `.6`, A01–A18, identity `.2`, signed `ACCEPTED`/replay/`IDEMPOTENCY_CONFLICT`, `[1,0,1,1,1,1]`, independent migration/ledger/zero-role/session postcheck and final Advisors all passed; three deletion probes left only healthy Production |

The rollback runner now assigns `R00` to runner preflight and `A01`–`A18` to
the fixed files. Every failure is one content-free JSON object with `stage` and
`errorType`; a matched fixed diagnostic may also include allowlisted `detail`
(`Dxxx`, optionally suffixed by `A`, `V`, `P` or `U`). SQL, filenames, SQLSTATE,
credentials, driver detail and branch metadata are excluded, and rollback
failure retains priority.

The source/local usage mismatch and the prior `4e84823` Hosted rollback,
one-time identity and signed `ACCEPTED` gates are closed for that historical
artifact set. r19 first proved 39/39 plus A01–A18 but exposed an unsupported
Vitest `--minWorkers` option before live test collection; r20 then passed the
full prior chain. Both Previews were deleted and three listings after each
deletion showed only healthy Production.

The exact-current replacement Preview then proved the current transactional
manifest and policies. Its independent postcheck found 39 versions from
`20260625125102` through `20260829041316`, one nine-key `ACCEPTED` terminal,
ledger counts `[1,0,1,1,1,1]` and zero temporary roles/sessions. Final security
Advisors returned 21 INFO / 20 WARN / 0 ERROR with zero
Communication/generation-schema findings. Performance returned 105 INFO / 24
WARN / 0 ERROR; its generation-schema subset was 18 INFO / 13 WARN / 0 ERROR
across `auth_rls_initplan`, `unindexed_foreign_keys` and `unused_index`. The
global Advisor totals matched r20. The exact replacement branch was deleted and
three independent listings showed only default Production `ACTIVE_HEALTHY`.
This closes exact-current Hosted PostgreSQL 17 through the pinned repository
runner; native Supabase CLI migration apply remains an unproved transport.

The unchanged A03 signer-independence negative vector still accepts either
`RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT` or generic `VALIDATION_ERROR`.
Dedicated-code-only enforcement remains a separately pinned hardening that must
be paired with another authorized disposable Preview rerun. Live
custody/credential resolvers, provider/model evaluation, human review and final
activation approval also remain open. Readiness remains false; no model call,
real data, deployment or Production write occurred. See the
[M1g-i handoff](communication-note-preview-terminal-accepted-usage-m1g-i.md).

### Communication Note resolved custody/caller runtime binding gate M1j — 2026-08-30

M1j adds one server-only source contract and its focused test. The public
factory is tested as unconditionally disabled and accessor-safe; the approved
target, custody resolver, caller resolver and runtime port stay `undefined`.
Only the TestOnly path accepts module-branded target/resolver objects and a
WeakMap-backed one-physical-session lease. Factory-provenance leases quarantine
every recognizable lease/session/runtime/query identity before the remaining
lease validation, so an invalid lease waiting in revoke cannot race a corrected
port with the same identities. Plain/spread leases, duplicate identities and
expanded/accessor-backed shapes fail before any SQL.

The focused matrix covers exact happy-path order, four separate transaction
timeouts, authorization/trust/target/lease cross-binding, clock rollback and
post-resolver expiry, minimum remaining lease time, stable backend PID and
transaction ID, runtime/caller role and reverse-membership drift, schema and
relation/column/sequence ACL drift, exact terminal RPC owner/security/
volatility/language/signature/search-path/ACL posture, exact executor role and
membership posture before and after the RPC, no retry, fixed error
mapping, normalized `{rows}` adapter enforcement, BEGIN and COMMIT response
loss, rollback/reset failures, issued acquire-response loss cleanup by
acquisition digest, strict complete/none/invalid paired release bindings,
mandatory TestOnly acquisition tombstone/future-issuance claims, a resolver
state-model test rejecting work that resumes after the tombstone, same-isolate
atomic single consumption, expired-authorization precheck, and 5s/12s/5s
resolver/database/cleanup bounded settlement with fresh abort signals.
The runtime-boundary gate also allows only the module's own test importer and
keeps every direct dependency outside `src/app` and `src/components`.

The strengthened focused M1j plus runtime-boundary run passed 2 files / 35
tests. A temporary
local PostgreSQL 16.15 catalog then executed the real base identity,
`SET LOCAL ROLE` and caller identity SQL and returned the expected backend PID,
transaction ID, caller/executor attributes and membership edges, schema, RPC
metadata/ACL and role-edge posture. This local syntax/catalog check intentionally
omitted PostgreSQL 17-only
`transaction_timeout`; the M1j target contract remains PostgreSQL 17. The
server was stopped and its temporary cluster/test file were deleted.

The adjacent 12-file regression passed 143 tests. The final application gate
passed 173 files / 2,345 tests, TypeScript, repository-wide zero-warning ESLint,
the 73-file Codex adapter check, `git diff --check`, and the Next.js 16.2.9
explicit Webpack production build with 64/64 static pages.

This is source/local TestOnly evidence, not a live custody resolver, approved
database target, real credential lifecycle, durable broker tombstone against
late issuance, independent administrative cleanup proof, driver-level
cancellation, cross-process replay prevention, retained
Preview, provider/model call, deployment or Production change.
See the
[M1j handoff](communication-note-preview-live-custody-caller-resolver-m1j.md).

### Communication Note durable caller-credential resolver gate M1k — 2026-08-30

M1k adds one server-only resolver test and one static SQL contract test without
changing the 39-migration manifest. Together with `runtime-boundary.test.ts`,
the focused gate passed 3 files / 32 tests. It covers a secret-free M1j lease,
exact acquire → open → bind order, durable tombstone → physical-session destroy
→ finalize → independent inspect order, digest-only cleanup after acquire
response loss, no pre-tombstone destroy on bind/Abort, bounded hung destroy,
late non-cooperative session open after revoke, immutable injected-port/session
snapshots, fixed redacted errors, and rejection of a false `NOT_ACQUIRED` /
`NOT_ISSUED` result after a local session existed. The boundary test limits the
module to server-only TestOnly support and proves no product app/component
importer, environment lookup or network/provider adapter was added.

The static SQL gate passed 11 tests. It asserts that the repository still has
exactly 39 migrations; broker lifecycle is monotonic and all mutations share
one acquisition-digest advisory lock; tombstone and finalize require separate
top-level transactions; tombstone atomically commits an OID/name-bound
`NOLOGIN` fence; ACTIVE bind replay re-attests PID/backend-start/application/
expiry; no password, SCRAM verifier, DSN or connection string is stored or
returned; role creation is SCRAM-only with one SET-only caller edge; API/PUBLIC
ACL remains empty; and cleanup precedes a read-only independent zero-residue
postcheck.

The real local gate used an owned no-TCP private-socket PostgreSQL 16.15
cluster. Six scenario groups covered normal bind plus wrong PID and ACTIVE
replay; a real blocked acquire versus an uncommitted tombstone; simultaneous
duplicate acquire; response loss plus wrong application, committed `NOLOGIN`
and rejected late reconnect; simultaneous idempotent revoke; and active backend
termination. Before teardown, postcheck observed three immutable metadata
tombstones—two issued and one never issued—and cleanup/postcheck ran three times
each. Final counts were zero runtime roles, zero runtime sessions and zero
runtime memberships. The exact fixed output is retained in the
[M1k handoff](communication-note-preview-durable-caller-credential-resolver-m1k.md).
The server was stopped, its exact temporary directory was absent afterward and
the fixed probe port did not respond.

This is source/static and PostgreSQL 16.15 local evidence. It does not prove
PostgreSQL 17, Hosted Supabase, TLS/pinned CA, a production migration, a live
secret broker, the terminal RPC's future ACTIVE-fence check, a provider/model
call, deployment or Production safety. The final repository gate passed 175
files / 2,366 tests, TypeScript, repository-wide zero-warning ESLint and the
73-file Codex adapter synchronization check. The Next.js 16.2.9 explicit
Webpack production build generated 64/64 static pages. The default Turbopack
invocation rejected this temporary worktree's cross-root shared
`node_modules` symlink before compilation, so it is not a passing build gate.

### Communication Note formal runtime-credential broker gate M1l — 2026-08-30

M1l adds the formal 40th migration contract and retains the old three-argument
terminal RPC. Binding version/digest are
`binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1` /
`cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115`;
durable resolver version/digest are
`resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2` /
`e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e`.
Static tests assert the Hosted-shaped non-superuser management
guard, private forced-RLS hash-only broker, derived runtime role, exact
45–90-second issuance window, bind-time `NOLOGIN`, shared terminal transaction
fence versus exclusive tombstone/finalize fence, post-lock ACTIVE and
role/OID/PID/backend-start/application/auth/run/HMAC/expiry checks, private
unfenced implementation, helper/function/default ACLs, and zero raw
password/SCRAM/DSN storage. They also pin the inherited-role model: runtime
`INHERIT=true`; an outbound caller edge with
`ADMIN=false`/`INHERIT=true`/`SET=false`; and a distinct inbound inert
PostgreSQL 16/17 creator edge with `member=postgres`, superuser grantor and
`ADMIN=true`/`INHERIT=false`/`SET=false`. Client SQL never sends `SET ROLE`:
outside the wrapper `current_user=session_user=runtime`, while inside the
`SECURITY DEFINER` wrapper `current_user=executor` and
`session_user=runtime`.

Static coverage additionally proves cluster-wide `pg_shdepend` has zero static-
caller ownership dependencies and exact ACL dependencies only for the current
database generation schema and terminal wrapper. It pins acquire/bind/wrapper
runtime revalidation, generation-column denial through
`has_any_column_privilege`, and both wrapper/inner as exact executor-owned
`SECURITY DEFINER` functions with empty `search_path` and exact ACL. The runtime inherits only the exact
terminal wrapper and has no generation table/sequence/column/other-function
privilege. Migration entry-role tests also retain the temporary
executor role switch and restoration contract.

Resolver/terminal-port tests cover the new connection-bound `cancelInFlight()`
barrier: Abort waits up to 250 ms for both cancellation and the underlying query
to settle, restores a session only after confirmed settlement, and permanently
quarantines a driver on timeout so no later SQL can reuse it. The Postgres port
maps both fixed `RUNTIME_CREDENTIAL_NOT_ACTIVE` and SQLSTATE `55P03` to the
fixed invalid-state transition.

The formal-migration harness created an owned PostgreSQL 16.15 cluster on a
private Unix socket with TCP rejected. A bootstrap superuser creates the actual
migration actor as `NOSUPERUSER`, `CREATEROLE`, `BYPASSRLS` and grants
`pg_signal_backend` plus `pg_read_all_stats`; the harness then applies the
unmodified 40th migration source. It passed six scenarios with four issued-and-
revoked acquisitions and zero runtime role/session/membership/API-privilege
residue. The sixth case created a second local database and a runtime-owned large
object. Its first finalize returned SQLSTATE `2BP01`, routine `DropRole`, while
TOMBSTONED ledger, `NOLOGIN` role, caller membership and remote residue survived
rollback. After the unique owner dependency was removed, finalize and inspect
succeeded with zero residue. Static SQL coverage separately pins the intended fail-closed order—
durable tombstone and `NOLOGIN` before `DROP ROLE`, `REVOKED` only after
successful deletion. This local PG16 evidence is independently complemented by
the same-revision Hosted PostgreSQL 17 gate below.

```json
{"ok":true,"gate":"communication-note-runtime-broker-migration-local-pg16","postgresMajor":16,"postgresVersion":"16.15","postgresVersionNum":160015,"scenarioCount":6,"acquisitionCount":4,"revokedIssuedCount":4,"runtimeRoleCount":0,"runtimeSessionCount":0,"runtimeMembershipCount":0,"apiPrivilegeCount":0}
```

The atomic pin set passed 53/53 focused checks and is frozen as: migration
`64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa`;
transactional `2026-08-30.preview-transactional-migrations.7`, 40 entries,
20 wrappers, manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`;
ordered basenames/entries `f9905d27a907045dfd6e7677e54c50af84be06a194535682bcf9dc4859657d4f` /
`7006c0ef8cb62d9596fdd236ffd3357d16338370e9d1437f54a58eb668b4b250`;
A03 `0f8192bccf46101103c301fcfd2b00cb818dd6725425a952777f697db8ea8172`;
rollback `2026-08-30.preview-schema-rollback-assertions.5`, manifest
`e0b5f30f9a4c33bf04020a4d11453c87a52321b69c6edd74982446b0fadd58fe`;
preflight/coordinator
`4447c071fa37ab21f23624a4d3d4d28b2ee9ba2e1ef4c9be969bf9a0481de2f3` /
`570544bf700997a0ba90e06422019c237a01835ba8b75ff70bed5348cdf4bf02`.
The same final revision passed 179 test files / 2,418 tests, TypeScript
with no emit, full ESLint, `git diff --check`, and the Next.js 16.2.9 Webpack
production build with 64/64 pages. The default Turbopack entry was
environment-blocked before compilation because this temporary worktree's
shared `node_modules` symlink resolves outside its filesystem root, so it is
not counted as passing evidence.

The final no-data, non-default, non-persistent Micro PostgreSQL 17 Preview
`careslink-note-runtime-broker-m1l-r5-20260830` (branch ID
`5f088eac-ac66-4625-8f4c-c9e7d9b02c2a`, ref
`ucdmoxqzruohiqmsokfv`) passed the exact 40/40 single-transaction migration
pipeline, A01–A18 18/18, the pinned-CA Hosted child and an independent outer
postcheck. The child reported `terminalState=ACCEPTED`, direct-login inherited
caller identity without `SET ROLE`, bind-time `NOLOGIN`, a successful exact
replay without a new row, rejected valid idempotency conflict, two issued and
revoked acquisitions, final ledger counts `[1,0,1,1,1,1]`, and zero runtime
role/session/membership/API privilege/verifier/temporary-database residue.
Credential transport was an anonymous FD pipe with process-memory-only material;
no raw credential material was present in the result.

The cross-database test used exact PostgreSQL 17 catalog evidence: two raw large-
object ACL items expanded to the four owner/postgres × SELECT/UPDATE rows with
the exact runtime grantor and no grant option, plus current-database and cluster-
wide `pg_shdepend` owner-dependency binding. The first finalize failed with
SQLSTATE `2BP01` / `DropRole` while the tombstone, `NOLOGIN` fence and remote
residue survived rollback; controlled cleanup then allowed finalize, inspect and
all residue checks to converge to zero.

Security Advisors returned 41 global findings (21 INFO, 20 WARN) and Performance
Advisors returned 129 (105 INFO, 24 WARN), with zero findings in the
`careslink_v1_runtime_broker` scope. Database lint returned 17 issues across 14
functions: the broker had two non-blocking shadow/unused-variable warnings, while
the two errors were pre-existing permission-denied calls in generation analyzers.
This is not a global zero-warning lint claim.

The r5 Preview was deleted after metadata revalidation. Three independent final
branch lists contained only the default Production project and it remained
`ACTIVE_HEALTHY`; Production was never the SQL target. The migration remains
unapplied/default-off in Production, and no provider/model or deployment gate ran
for M1l. Readiness and approval remain false/absent. See the
[M1l handoff](communication-note-preview-runtime-credential-broker-m1l.md).

### Communication Note approved runtime adapters M1m — source only

M1m adds five server-only, default-off adapter contracts: an authenticated
disposable-Preview target resolver with pinned CA bytes; a one-use callback
management credential transport and exclusive management session; durable
broker SQL adapters; an exclusive runtime PostgreSQL session with exact-client
hard-close cancellation; and a sealed composition into the existing durable
resolver/runtime port. Every approved export remains absent and every readiness
constant remains `false`. The concrete `pg` client constructors and credential
transport are test-only injections; no product route, environment lookup, DSN,
SDK import, log sink, retained credential, provider/model call or deployment is
introduced.

Static boundary coverage pins the exact importer graph for all five M1m modules,
including the inherited resolved-binding and durable-resolver dependencies, and
rejects imports from `src/app` and `src/components`. Unit coverage uses synthetic
clients, targets, CA material and credentials only. It does not constitute a
Hosted Preview, PostgreSQL 17, Supabase Auth/Data API, live secret-manager,
Production migration or activation result. Final repository closeout counts are
now fixed at M1m focused 99/99, runtime-boundary 12/12 and the complete
184-file / 2,518-test Vitest suite. The same source passed `tsc --noEmit`, full
ESLint, tracked plus new-file whitespace checks and the Next.js 16.2.9 Webpack
production build with 64/64 pages. These are local source results, not Preview,
deployment or Production evidence.

### Communication Note approved runtime adapters M1n — Hosted harness source

M1n adds local/default-off coverage for the future real-driver gate without
running that gate. The new policy tests pin exact public control-plane config,
Direct and Supavisor Session port 5432 shapes, CA and source-revision digests,
the FD5 binary secret frame, a minimal child environment, fixed bounded status
codes and content-free evidence. A shared child-channel suite also locks
multiple parent-to-child input pipes, timeout/termination behavior and the
unchanged M1l FD3/FD4 contract.

Source pinning now uses one canonical 66-path manifest: the manifest itself,
package/pnpm lock/tsconfig, outer runner/channel, current static import closure,
setup SQL and all 40 migrations are framed into the digest. Tests require exact
schema, byte-order sorting, uniqueness, regular non-symlink files, all 40 disk
migrations and an independently recomputed digest. The caller must provide the
reviewed digest before stdin/database access and the child recomputes it. This
does not attest the complete Node/Vitest/node_modules transitive closure.

The live test stays default-off in ordinary Vitest. Its static assertions keep
M1m/M1n readiness false and approved exports absent, parse/recompute one exact
source revision, reject expanded/replayed secret frames, and lock evidence that
states the underlying Supabase branch password is static, not attested
short-lived, not rotation-tested and present in process memory during the run.
Runtime-boundary coverage adds this one test-only importer to the exact target,
management, runtime-session, composition, durable-resolver, resolved-binding and
trust-fixture graphs while keeping `src/app` and `src/components` at zero.

The enabled branch of the same file is designed to inject the real
resolved `pg@8.23.0` constructor (checked from the actual package in both
parent and child) and call only the high-level M1m
`bundle.runtimePort.persist(envelope)` path after a synthetic ledger setup. It
then requires exactly five fresh management deliveries and an independent zero-
residue postcheck. Parent tests also lock the exact ordered 40-version preflight
parameter plus cleanup/finalize/inspect of all acquisitions, including already
revoked rows, before a separate ACL/session/role and verifier-state query. The
success contract requires one issued/revoked 64-hex verifier hash-only tombstone;
only never-issued rows may retain null, and raw password/SCRAM material remains
forbidden. None of
those Hosted assertions ran in this source batch:
there is no PG17/TLS/PID/Abort/live-cleanup/branch-delete pass to report yet.
The reviewed source revision is
`5bf672d6819b6d6129f806e2fc7ab62c661a57cffbbc5403fcfa7967d39cfc31`;
the exact local closeout passed 10 focused files / 151 tests, the full 187-file /
2,547-test suite, TypeScript, full ESLint, three Node runner syntax checks,
whitespace/diff checks, the 73-file Codex adapter sync, and the Next.js 16.2.9
Webpack production build with 64/64 pages. Independent review ended at P0=0,
P1=0. These remain local/default-off results, not Hosted live evidence.

### Communication Note approved runtime adapters M1o — post-review hardening

M1o provides candidate fixes for the three source-review findings without
enabling the live-only test. These fixes remain subject to same-revision final
review and are not recorded here as already closed. Management deliveries now
carry a factory-generated 64-hex nonce. Tests prove exact echo binding,
distinct nonces, old-envelope replay rejection before a second Client,
sequential and truly concurrent atomic repeated-nonce rejection, fail-closed
behavior at the 256-entry registry bound, and monotonic-expiry pruning. The
registry keeps only nonce SHA-256 and expiry; the static branch-admin source
password is still explicitly not one-use.

Outer-runner tests cover graceful, rejected and never-settling admin close,
exact TLS stream destruction, missing/throwing/no-op-destroy refusal before a second
Client, timer cleanup, Direct to Session Pooler fallback only after confirmed
close/destruction, and fixed final cleanup failure. Shared-channel tests inject
synchronous `.end(payload)` failures on every input position, including the
secret FD, and cover `child.kill()` returning false or throwing. They prove
handle-owned SIGKILL attempts, late input/status/child error absorption, destroy
invocation on all streams, no secret/raw-error serialization, and bounded
data/exit/stateful-listener cleanup after child close or the independent
one-second deadline. Static content-free error sinks remain until actual close;
raw PID signalling is forbidden. Existing M1l FD3/FD4 behavior remains in the
same focused gate.

The final-review M1o candidate source revision is
`7a0f19f782670acf663fd087a3e460df92048e2d2406b05efe20d900a182e011`.
The exact local focused gate passed 10 files / 169 tests and the full suite
passed 187 files / 2,565 tests. TypeScript, full ESLint, three Node syntax
checks, whitespace/diff, the 73-file adapter sync and the Next.js 16.2.9
Webpack 64/64-page build are the same-revision closeout. No Hosted PG17, TLS,
PID, live cleanup, branch deletion, Preview creation, deployment or Production
operation ran in this batch.

### Communication Note approved runtime adapters M1p — first Hosted attempt

The separately authorized no-data Preview attempt on 2026-08-31 passed exact
child metadata, pinned-CA TLS, PostgreSQL 17 and the 40/40 transactional
migration gate. The full runner did not pass: its child returned
`M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_DRIVER_INVALID` before synthetic
setup, runtime-role creation or M1m broker/persist execution. The failed branch
was deleted immediately; three independent sequential listings showed only the
healthy default Production branch. No Production database, real data,
deployment or model/provider was accessed.

An exact Vitest-worker regression proved that Vite wrapped the pinned
`pg@8.23.0` CommonJS dynamic-import namespace in a Proxy while the underlying
`default.Client` remained valid and non-Proxy. The fix candidate loads the same
validated absolute entry with Node `createRequire`, retaining all version,
package-root, Client/prototype Proxy and `connect/query/end/on` checks. Candidate
source revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`
passes:

- the exact live file: 5/5;
- the five-file M1m/M1n/M1o focused gate: 97/97;
- full Vitest: 187 files / 2,566 tests;
- TypeScript, full ESLint, Node syntax, whitespace/diff and 73-file adapter sync;
- Next.js 16.2.9 Webpack production build: 64/64 pages.

These are local/default-off results, not a Hosted runtime pass. A rerun requires
same-revision review and a new paid Preview authorization; the failed run's
price confirmation cannot be reused.

### Communication Note approved runtime adapters M1p — corrected Hosted pass

After PR #18 merged, a new separately authorized no-data PG17 Preview ran the
same reviewed source revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`.
The 40/40 migration gate passed in one transaction with the exact manifest,
empty ledgers and no temporary roles. A fresh credential envelope then passed
the complete Hosted positive-path runner with:

- actual `pg@8.23.0`, Direct 5432 and pinned-CA verify-full TLS;
- validated child control-plane identity, project-ref binding and source pin;
- real M1m composition and an `ACCEPTED` terminal;
- the factory-scope cross-open replay-protection contract with five fresh
  deliveries;
- zero terminal runtime role/session/membership/API privileges;
- one hash-only credential-verifier tombstone and no raw credential in evidence
  or durable ledger.

The success evidence deliberately reports Abort and timeout live coverage as
false. Adversarial replay and Session Pooler fallback were not live-tested;
server-side SSL enforcement was not attested. The static branch-admin password
was present in process memory during the run, and the evidence does not attest
an underlying short-lived or rotated password, process-memory zeroization or
complete transitive dependency integrity. It does not approve activation:
readiness remains false and approved exports stay absent. The caller deleted
the exact Preview immediately afterward; three sequential listings showed only
the healthy default Production branch. No Production database connection or
mutation, real data, deployment or provider/model call occurred; Production
parent interaction was limited to disposable branch create/get/list/delete
control-plane operations.

### Communication Note approved runtime adapters M1q — Hosted timeout/Abort pass

On 2026-08-31, after a fresh explicit authorization at the then-current Micro
Compute price of `US$0.01344/hour`, the caller created the no-data,
non-default, non-persistent PG17 Preview
`m1q-communication-note-hosted-negative-paths-r1-20260831` (branch id
`c1c404d3-e45d-44a2-b474-af3b52b7c13a`, child ref
`htylsaspsskufkgjginz`) under parent `adocsnwnslxhxcjgbyee`. It was reported as
`with_data=false` and `ACTIVE_HEALTHY`. The pinned Server root certificate
SHA-256 was
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

The exact 40/40 single-transaction migration gate passed with manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`.
The first two full-runner attempts failed before the first scenario setup due to
setup SQL syntax errors. Each failure rolled back the complete transaction, and
independent postchecks found zero generation/broker ledger rows and zero
temporary runtime roles. The correction completed five `DO` blocks with
`END;` and parenthesized the top-level `CASE` expression used by an `IF`. A PG17
parse-only diagnostic then returned `{"parsed":true}` and rolled back its
transaction; two independent reviews ended at P0=0, P1=0 and P2=0.

The corrected fixed source revision
`8b84b0aa633892a2da9bf157702f005c06b48d3b98a2f1aef2bff78082b552b7`
then passed
`COMMUNICATION_NOTE_M1Q_APPROVED_RUNTIME_ADAPTERS_HOSTED_NEGATIVE_PATHS` over
Direct 5432 with actual `pg@8.23.0` and client-side pinned-CA verify-full TLS.
The live gate ran exactly three domain-separated scenarios with fresh M1m
composition/runtime and monitor/admin connections: positive, PostgreSQL
statement timeout and runtime-watchdog Abort. The evidence proves:

- one positive `ACCEPTED` terminal and no terminal writes for either negative
  scenario, with cumulative ledger `[3,0,3,3,3,1]`;
- a real SQLSTATE `57014` statement timeout while the exact backend was in
  transaction, followed by `ROLLBACK` and session reset on the same live client;
- the targeted sixth 12-second watchdog callback and hard-close of the exact TLS
  stream/client before the broker tombstone query, with exact
  `(PID, backend_start)` durable binding and all three runtime PIDs drained;
- three revoked acquisitions, three 64-hex hash-only verifier tombstones, and
  zero terminal runtime roles, sessions, memberships or API privileges.

The evidence retains `sourceRevisionTransitiveClosureAttested=false`,
`underlyingCredentialShortLived=false`,
`underlyingCredentialExpiryAttested=false`, `rotationTested=false`,
`highLevelDatabaseSettlementDeadlineWallClockTested=false`,
`externalCallerAbortLiveTested=false`,
`processMemoryZeroizationAttested=false` and
`branchDeletionVerifiedByRunner=false`; caller-side deletion is recorded
separately below. Three hash-only verifier residues are allowed; raw password,
SCRAM verifier and DSN residue remain forbidden.

The setup-SQL hotfix at this exact final source revision passed 2 focused files /
29 tests and the complete 187-file / 2,571-test suite. TypeScript, full ESLint,
three Node runner syntax checks, the 73-file adapter sync, `git diff --check` and
the Next.js 16.2.9 Webpack build with 64/64 pages also passed.

`activationApproved=false`, `ready=false`, and approved exports remain absent. The
caller deleted the exact branch after the successful gate. Three independent
sequential listings each returned only default `main` in `ACTIVE_HEALTHY`,
revoking the branch credential and stopping further branch charges; actual
accrued cost remains subject to Supabase billing. There was no Production SQL
or data access, Vercel deployment, real-data flow or provider/model call. The
historical M1p revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`
and its positive-only, Abort/timeout-false evidence remain unchanged.

### Communication Note product runtime composition M1r — source only

M1r tests the first production-dependency-backed product composition boundary
without activating it. The focused suite asserts exact `pg@8.23.0` production
and `@types/pg@8.23.0` development classification in package and lock files;
fixed policy version/digest/readiness; frozen and absent approved exports; and
the exact seven-symbol runtime export surface.

Cold import uses both a counter-backed fake and the actual unmocked `pg` named
export. It verifies package version, non-Proxy constructor/prototype and
callable data methods without Client construction, connect, query or end.
Hostile constructor Proxy and accessor methods are rejected without invoking
their traps. Formal factory hostile inputs are not inspected; malformed,
missing, extra, accessor, null-prototype and Proxy TestOnly options fail before
M1m composition.

Runtime-boundary coverage restricts every non-test `pg` subpath import across
TypeScript/JavaScript module forms to the M1r server-only module, restricts the
module itself to its exact test importer and keeps App Route/component importers
at zero. A post-build check scans `.next/static/chunks` for the M1r
version/status/digest and secret sentinel. These checks prove only the
default-off source/build boundary; they do not prove a reachable deployed
server trace, database connection, Product API wiring, provider/model call or
Production activation.

The final local run passed 3 focused files / 36 tests and the complete 188-file
/ 2,578-test suite. TypeScript, full ESLint, 73-file adapter sync,
`git diff --check`, the 64/64-page Webpack production build and the 24-file
client-chunk scan also passed.

### Communication Note product runtime identities M1s — source only

M1s tests the default-off identity/custody composition placed outside M1r. The
suite fixes the version, policy digest/readiness, frozen policy, absent approved
export and exact seven-symbol runtime export surface. Formal factory hostile
Proxy inputs are not inspected. TestOnly validation rejects missing/extra,
accessor, null-prototype, Proxy and malformed identity data before target/M1r
composition or PostgreSQL Client construction.

The positive test captures the deployment attestation request and verifies the
exact audience, non-Production environment, source revision, target and CA
binding. It then invokes the three private target wrappers and management
credential wrapper, proving one canonical deployment evidence digest and one
canonical authenticated control-plane evidence digest propagate unchanged to
HMAC, CA and credential custody. Raw upstream evidence is not re-exported as the
aggregate digest; the output remains the original frozen M1r bundle. Stale,
future, expired, overlong, revision/audience/environment-mismatched and raw-
credential identity claims fail closed, and source failures are normalized to
the fixed content-free error.

Runtime-boundary tests restrict M1s to its exact test importer, keep App Route
and component importers at zero, retain M1r as the only non-test `pg` importer,
and forbid ambient environment/network/SDK/DSN/log authority in M1s. The
post-build scanner now checks both M1r and M1s version/status/digest/secret
markers across client chunks.

The final local run passed 4 focused files / 76 tests and the complete 189-file
/ 2,609-test suite. TypeScript, full ESLint, 73-file adapter sync,
`git diff --check`, the 64/64-page Turbopack production build and the 24-file
M1r/M1s client-chunk scan also passed. These are source/build tests only: no
cloud identity, Supabase API/database, Vault/KMS, deployment or model was used.

### Current live/read-only evidence

- Supabase migrations, tables, RLS flags, policies, grants, function grants and aggregate row counts were checked read-only.
- Vercel production deployment/SHA and runtime error aggregates were checked read-only.
- Synthetic users and shadow fixtures existed only on isolated branches and were fully cleared; no Production user/data was read or changed.
- The protected App Preview gate used zero model calls. Temporary Preview flags/deployments were removed afterward; the clean isolated branch was retained by owner decision, and Production remained unchanged. The then-current NDIS post-review hardening passed on that retained branch, but the later exact catalog/private-schema/provider-session hardening and route bundle postdate that evidence and must receive a new same-revision protected Preview before promotion.

## Proposed

The following suites are required before the corresponding V1 slice can be called implemented.

### Contract and compatibility

- Parse/lint the new contract-only OpenAPI and add generated Web/App SDK fixtures; current tests check vocabulary/absence of a production server but do not parse or serve it (`AI-FND-001/002`, `AI-NFR-010`, `APP-COMPAT-001`).
- Stable error envelope, locale/fallback, idempotency and correlation tests (`AI-NFR-008/009`, `APP-NFR-007/012`).
- Current plus previous two client schema compatibility and force-upgrade response tests.

### Identity and permission

- Microsoft/Apple and confirmed identity-linking tests; duplicate/relay email cases (`AI-AUTH-001/002`, `APP-AUTH-002/003`).
- Device registry, revoke-one/revoke-all, token refresh and high-risk reauth tests (`AI-AUTH-004/005`, `APP-AUTH-004-007`).
- Every target private table: owner A CRUD, owner B deny, admin deny/body isolation, revoked-session deny and service-role grant inspection (`AI-PERM-001/002`, `APP-NFR-001`).
- Repeat provider A/B JWT owner-RLS checks with the integration migration present, using confirmed branch users created through a supported Auth path. The second branch could not satisfy email confirmation without bypassing Auth.

### Five Note types and privacy

- Independent schema/minimum/output/facts/safety golden sets for all five types (`AI-TYPE-001-005`, `APP-NOTE-001-005`).
- Disposable-database and protected-Preview confirmation of the source-tested
  `privacy_review_id` owner/type/canonical-hash/schema/status/expiry/revision
  binding and locator-only failure envelopes (`AI-PRIV-003/004`).
- English/zh-Hans/zh-Hant parity, mixed-language input and explicit fallback tests (`AI-IN-002`, `AI-GEN-005`, `APP-NFR-007`).
- Incident-specific refusal tests for reportability, safeguarding, blame, risk rating and regulatory conclusions.

### Canonical documents and recovery

- Promote the tested memory document rules into database/server integration: first-input creation, accepted revision/save ack, base-revision 409, restore-as-new-revision and tombstone propagation (`AI-DOC-001/002/008-013`, `APP-SYNC-001-010`).
- Browser recovery buffer and native encrypted DB/outbox lifecycle tests, including kill process, token expiry and network switch (`APP-OFF-001-003`).
- Generation job close/reopen/cross-device recovery and exactly-once persistence/settlement tests (`AI-GEN-003/004/007`).

### Points and Billing

- Add concurrent SQL transaction races for reserve/commit/release and rate-version rollover. The isolated serial RPC/RLS matrix has passed, but concurrency remains unproved (`AI-PTS-001-007`, `APP-PTS-001-005`).
- Legacy-credit migration replay/reconciliation/rollback tests (`AI-MIG-002/003`).
- Stripe/Apple/Google receipt uniqueness, webhook replay, restore, refund/revoke and daily reconciliation tests (`AI-ENT-001`, `AI-BILL-001-005`, `APP-PAY-001-005`).

### Export

- Same revision rendered to DOCX/PDF/TXT/Copy with stable order, draft labels and no internal fields (`AI-DOC-007/014-018`, `APP-DOC-005-010`).
- Safe filename, short-lived unguessable URL, expired/revoked/cross-owner deny, cancellation cleanup and batch partial-retry tests.

### Content, actions and notifications

- Published/corrected/withdrawn content state, source/checked-date/translation completeness and CDN invalidation tests (`AI-LIB-001-005`, `AI-PUB-001-003`).
- Save/Follow/Guide progress/version migration/checklist/reminder sync tests (`AI-ACT-001`, `AI-REM-001`, `AI-GUIDE-001-003`).
- Daily Brief eligibility/explanation/no-empty-message and Note-content exclusion tests (`AI-BRIEF-001`, `APP-LIB-013/014`).
- Safe push payload, preferences, timezone/DST, frequency cap, inbox deep link, fatigue and withdrawal tests (`AI-NTF-001-007`, `APP-NTF-001-011`).

### Data control and operations

- Reauthenticated account export/delete, processor cleanup, legal-hold exception and subscription-separation tests (`AI-DATA-001-004`, `APP-DATA-001-003`).
- PITR restore drill proving no duplicate document revisions or ledger commits (`AI-NFR-005`, `APP-NFR-010`).
- Cost telemetry/redaction, budget threshold/kill switch and validated-model fallback tests (`AI-COST-001-007`).
- iOS/Android accessibility, secure storage, backup exclusion, app-switcher, crash/network and store review matrix tests.

## Gaps

1. The native App exists in a separate repository and is outside this task; this AI repository does not execute or attest its iOS/Android, offline, purchase or store gates.
2. The OpenAPI/TypeScript contract and default-off durable `/v1` route adapter now exist, but there is no Preview- or Production-served Product API, generated client package, schema registry or previous-version compatibility fixture.
3. The registration-retention source worktree passed its historical 1,381 tests across 125 files and all three focused migration contracts 39/39, with the `r21` 1,377-test / 124-file result, the `r9` 1,337-test / 122-file result and earlier baselines retained. The strict-local harness batch subsequently passed 1,400 tests across the same 125 files. All five Note types share a Production-unapplied private metadata/RPC layer with nine worker RPC identities, three newer owner RPC identities and one separately owned graceful-retirement control identity, but no caller execute grant. Deleted PostgreSQL 17.6 disposable `r9` proved the exact 14-migration, seven-suite and independent postcheck gate; deleted `r20` closed the PostgreSQL 17.6 true two-session claim/session/privacy race gate; deleted `r21` closed Attempt 1 historical replay across Attempt 2 success and post-purge state; deleted `r22` closed the hosted registration historical-retention gate with the exact 15/15 manifest, 7/7 suites and independent postcheck. The earlier disposable local PostgreSQL 16.15 gate closed its recorded engine, serial and true-two-session path with 27/27 repository migrations, exact V1 15/15, 7/7 suites and 3/3 races. The later owner-runtime PG16.15 run passed the new owner, additive-aware worker and durable rollback suites, independent posture postcheck and auth-session lock-wait race; #1-#24 and #26-#28 applied non-super, including fresh exact final #28, while #25 remained an explicit bootstrap-superuser transition. Migration #29 supplies graceful retirement with 14 forced-RLS tables. Its local strict rollback assertion passed inside the final clean 29/29 migration, 9/9 aggregate, independent posture and two-ordering retirement/claim race gate. Deleted Hosted r5 subsequently passed the exact 30/30 migration manifest, all 11 rollback suites and the independent owner/role/RLS/ACL/hard-off/zero-fixture postcheck. No worker/owner Preview or local cluster is retained. The five types still lack emergency revocation, attempt listing, a deployed worker, nested exact-key database vectors, account-delete/purge and orphan recovery, provider-start binding, safe sequential numeric parsing, real vault/KMS/retention, caller credentials/grants/routes, hosted GoTrue/PostgREST, real provider/model/STT integration, Points and complete per-type golden sets; runtime activation remains open.
4. Canonical document/revision/checkpoint states exist as memory/domain contracts plus historical isolated schema/RPC evidence and a Production-unapplied mobile-sync migration draft that was clean-applied only on a deleted disposable branch; there is no retained schema activation, editor, renderer or cross-device recovery E2E.
5. Points lots/rates/reservations passed isolated serial database tests but remain shadow-only. There is no runtime entitlement integration, welcome eligibility decision, concurrent reservation proof or legacy-credit conversion/reconciliation test.
6. No payment provider sandbox, webhook replay, refund or reconciliation harness exists.
7. No content editorial state, Guide, Daily Brief, notification or email/cron service exists.
8. No signed PIA/data-map/subprocessor/NDB evidence is represented in automated tests.
9. Current production refresh-token errors need a reproducible stale-cookie/session recovery test before V1 release.
10. Build/test success is not a production V1 greenlight; migration, Preview/live safety and explicit owner approval remain mandatory.
11. Portal Assignment M1a exact-current commit `43659ab16e9af6d9c73d0a55f8fe8b30b3ce9ee2` has 32/32 migrations, 13/13 rollback suites and the complete real Hosted GoTrue/PostgREST SSR-cookie route matrix on a deleted disposable branch, with independent zero-fixture and unchanged-Production proof. Provider Response M1b exact gate source `44f3bd68699dc953e2666bf033dac2b5e26a4d30` likewise has 33/33 migrations, 14/14 rollback suites, a complete 14/14 real Provider A/B Hosted GoTrue/PostgREST Cookie/Data API matrix and the exact-gate-source active-first/non-null-cursor delta 2/2 on a deleted no-data branch. The later focus/sign-in UI recovery postdates that source and has local-only evidence, so the prior Hosted gate cannot be attributed to current PR HEAD. No evidence here itself authorizes merge or promotion; there is still no Vercel Preview deployment, retained activation or Production approval, and private accepted-provider detail, assignment finalization beyond acceptance, follow-up and audit listing remain unimplemented.
