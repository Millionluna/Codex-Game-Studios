# CaresLink AI Permissions

> Current runtime permissions are separated from the **Production-unapplied V1 shadow policy contract**. The contract has isolated database evidence, but no Production or application-runtime activation.

## Identity and claims

| Identity | Source | Current authority |
|---|---|---|
| Anonymous | no Supabase user | public home/auth/static legacy pages; selected metadata-only public conversion insert |
| Provider | authenticated UUID + trusted `app_metadata.role='provider'` | provider workspace, NDIS generation, own credits and own saved drafts |
| Admin | authenticated UUID + trusted `app_metadata.role='admin'` | access-request and aggregate/material-usage administration |
| Demo | query fixture only when non-production demo auth is enabled | local/test behavior; not a production role or authorization source |
| Service role | server-only Supabase secret | private stores and narrowly exposed database RPCs |

User-editable profile/user metadata is not trusted for admin. A Google-created user defaults to provider through trusted server/auth configuration; OAuth profile fields do not grant elevated access.

## Authorization layers

1. **Route check**: server resolves Supabase session before reading AI content or incurring cost.
2. **Role check**: provider/admin routes require the expected trusted role.
3. **Resource check**: server checks owner UUID, claim state and material feature.
4. **Database RLS/grants**: authenticated direct access is limited to explicit owner policies.
5. **Service-role RPC**: ledger/quota/claim writes remain server-only and validate supplied owner/reference.

All five layers are required where applicable. A code check does not replace RLS, and RLS does not make a service-role route safe by itself.

## Current resource x action matrix

| Resource / action | Anonymous | Provider owner | Other provider | Admin UI | Service role |
|---|---:|---:|---:|---:|---:|
| NDIS Companion form | deny/auth gate | allow | n/a | deny as non-provider | n/a |
| NDIS generation POST | 401 before body/quota/model | allow after validation/limits | n/a | deny | orchestrates stores/model |
| `account_entitlements` SELECT | deny | own rows | deny | aggregate only through server page | SELECT |
| `account_entitlements` write | deny | deny | deny | deny | RPC only |
| `credit_ledger` SELECT | deny | own rows | deny | aggregate only | SELECT |
| `credit_ledger` write | deny | deny | deny | deny | reserve/commit/release RPC only |
| NDIS claim read/claim | deny | own opaque claim through server | indistinguishable deny | deny | claim RPC/store |
| saved draft SELECT | deny | own row | deny | no body viewer | SELECT through owner route/store |
| saved draft DELETE | deny | own row | deny | no general delete | owner route/store |
| companion event INSERT | no direct table access | metadata route only | metadata route only | n/a | INSERT |
| public conversion INSERT | allowlisted metadata only | same | same | aggregate reporting | table policy permits anon INSERT |
| access request | public/auth flow as implemented | own workflow | no cross-owner view | review metadata | CRUD |
| provider profile/referral data | route-specific legacy rules | own/claimed context | deny unless explicit public profile | limited legacy admin actions | CRUD stores |

## Current RLS and grants

| Table | RLS | Authenticated grant/policy | Notes |
|---|---|---|---|
| `account_entitlements` | enabled | owner SELECT | client cannot write |
| `credit_ledger` | enabled | owner SELECT | terminal events via service-role RPC |
| `generated_material_drafts` | enabled | owner SELECT and DELETE | INSERT/save remains server-owned |
| `ndis_case_note_companion_claims` | enabled | none | opaque claim via server/service role |
| `template_companion_quota_usage` | enabled | none | server-only pseudonymous counters |
| `template_companion_events` | enabled | none | metadata-only server inserts |
| `public_conversion_events` | enabled | anon INSERT | public marketing exception; no private content |
| legacy provider/referral tables | enabled | generally no broad authenticated CRUD | server stores and domain checks remain material |

The audited schema has RLS enabled on the listed public tables, but RLS is not forced. Service-role behavior bypasses owner policies by design and must stay inside server code.

## Current deny cases

- Missing/invalid session: protected GET redirects to login; protected POST returns 401.
- Authenticated admin on provider-only Companion: denied.
- Authenticated provider on admin route: denied without admin content.
- External or malformed auth `next`: discarded in favor of safe internal default.
- Cross-owner claim or draft ID: generic not-found/deny response without existence leak.
- Wrong draft feature: denied even when the caller owns another material ID.
- Missing privacy confirmation or minimum facts: no credit reserve, quota or model call.
- Credit exhausted/quota exceeded: no new model call.
- Missing production Supabase/OpenAI/pepper configuration: fail closed; no memory fallback in production.

## Admin and support boundary

Current admin pages may display access-request metadata, feature counts, statuses and aggregate usage. They must not display full case-note JSON, privacy findings, cleaned facts, prompts, pasted text or generated body. There is no general support impersonation or “view user document” permission.

## V1 shadow permission contract and isolated evidence

### Portal Referral foundation, intake, source-detail, Assignment M1a and Provider Response M1b runtimes (default-off and Production-unapplied)

The Portal Referral foundation introduces organization membership, provider,
referral, separately protected contact, match, follow-up, receipt, audit,
document-link and export tables. It grants no Portal table privilege to
`public`, `anon`, `authenticated` or `service_role`. The newer source-only intake
migration adds exactly three public `SECURITY DEFINER` RPCs—authorize, source
metadata list and atomic create—with `search_path=''` and `EXECUTE` only for
`authenticated`; `PUBLIC`, `anon` and `service_role` remain revoked. Its two
private helpers grant no caller execution.

The later source-detail migration adds two read-only public `SECURITY DEFINER`
RPCs—`portal_referral_source_detail_authorize()` and
`portal_referral_source_detail(uuid)`—under the migration-entry owner with
`search_path=''`. It revokes `PUBLIC`, `anon`, `authenticated` and
`service_role` before granting `EXECUTE` back only to `authenticated`; no table
grant is added. Both RPCs hold master + source-detail database gates, then reuse
the fresh intake session/membership context. The detail tenant predicate
requires the exact source organization, and
cross-tenant and absent identifiers both raise `PORTAL_NOT_FOUND`. The DTO is
limited to referral ID, summary, region, service, status, version, contact and
timestamps; source/actor/assignment/document/export/audit identities are not
returned.

That migration also creates the independently default-off `referral_intake_v1`
row and replaces the private intake gate helper. The already granted intake
authorize/list/create RPCs now hold master + intake before validation or write,
so master + detail cannot open intake through a direct Data API call. Conversely,
master + intake cannot open either detail RPC.

Assignment M1a adds exactly six public `SECURITY DEFINER` RPCs—assignment
authorize, queue, detail, triage, candidates and offer—with `search_path=''`,
the migration-entry owner and `EXECUTE` only for `authenticated`. Four private
assignment helpers have no API-role execution, and no Portal table grant is
added. Every RPC holds master then `referral_assignment_v1`; the new row remains
`enabled=false, preview_only=true`. Assignment context must resolve from the
live database to exactly one active `platform_admin` membership in an active
PLATFORM organization or one active `partner_operator` membership in an active
REFERRAL_SOURCE organization. Mixed, multiple and zero contexts fail closed.
Partner operators are source-tenant-scoped; platform admins are global.

Queue is metadata-only and keyset-bounded. Assignment detail adds the source
organization, private summary/contact and at most one active-offer projection,
but excludes source user, membership, provider-member, audit, receipt,
document and export identities. Candidate and offer share one private
eligibility query: active PROVIDER organization, APPROVED review,
AVAILABLE/LIMITED capacity, exact region/service and at least one active
provider member. Offer checks the authorized referral before provider
eligibility, promotes or creates one match and keeps
`assigned_provider_id=null`; under Assignment M1a alone, provider response is
still unavailable. Triage and
offer use actor+mutation advisory serialization, expected row versions, fresh
post-lock session checks, SHA-256 payload/idempotency/correlation values and one
audit plus one receipt. Session time is sampled only after Auth row locks; the
context rechecks it after organization/membership table locks and before
exact-one derivation, and candidates/offer recheck after their referral,
match/provider lock stages. Currently ineligible providers retain uniform
not-found even when a historical match exists. Exact completed offer replay
remains stable if the provider later becomes ineligible; changed payload or kind
conflicts.

The local actor-bound test adapter enforces Source A/B, Provider A/B and
partner-operator tenant isolation. Providers receive only frozen region/service
codes before accepting their own offer; summary/contact become visible only to
the exact accepted and still-approved provider. Decline or eligibility
revocation removes access. Mutation acknowledgements contain IDs, status,
version and timestamp only; receipts/audit use SHA-256 identifiers and do not
copy contact, summary, client correlation or raw idempotency values. Raw match
and audit rows are limited to platform admin or the tenant partner operator in
the draft RLS contract.

Provider Response M1b adds an independent `referral_provider_response_v1`
database gate and three authenticated-only definer RPCs:
`portal_referral_provider_response_authorize()`,
`portal_referral_provider_response_offers(integer,uuid)` and
`portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)`.
The context must resolve exactly one active
`provider_member` in an active PROVIDER organization with one APPROVED provider;
zero, multiple, suspended or non-approved contexts fail closed. Capacity is an
offer-time M1a eligibility condition and is not reinterpreted as provider
authority while an already-issued offer is answered. Provider identity is
always database-derived and is never accepted from the route, body or JWT user
metadata.

The inbox is limited to the caller's own `OFFERED` or `ACCEPTED` match rows and
returns only match/referral IDs, frozen region/service codes, match/referral
status and referral row version. The bounded first page selects live `OFFERED`
rows before `ACCEPTED` history, then returns the strict DTO in ascending match-ID
order; a non-null cursor fails validation because M1b has no pagination
contract yet. No table grant or provider match RLS policy is added. Response
holds master then provider-response gates, serializes the actor+mutation lane,
locks referral before its matches, refreshes session and provider authority
after waits, and verifies the supplied payload hash against a database-rebuilt
canonical command. `ACCEPT` completes the previously absent assignment binding;
`DECLINE` returns the referral to triage. Exact completed replay may return only
its historical metadata ACK even after a decline removes the offer from the
inbox. The durable M1b route does not yet serve the
post-accept private referral detail that the broader foundation permission model
reserves for a later independently reviewed read slice.

Follow-up M1c supplies that independently reviewed provider-only continuation
behind `referral_follow_up_v1`. Its authenticated-only definer RPCs are
`portal_referral_follow_up_authorize()`,
`portal_referral_follow_up_detail(uuid)` and
`portal_referral_follow_up_record(uuid,bigint,text,text,text,text)`. The detail
RPC returns summary/contact only after re-deriving the exact-one active approved
provider, proving `assigned_provider_id`, one coherent accepted match and an
`ACCEPTED` or `IN_PROGRESS` referral. Missing and cross-provider identifiers are
uniformly not found. The record RPC accepts only expected version plus one of
five fixed outcomes; actor, organization and provider remain database-derived,
and `next_due_at`, free text and history are not served.

Record holds master then Follow-up gates, serializes the actor+mutation lane,
locks referral before all matches, rechecks the Auth session after waits and
rebuilds the canonical payload hash in PostgreSQL. A success changes
`ACCEPTED → IN_PROGRESS` or records another `IN_PROGRESS → IN_PROGRESS` event,
increments the referral version once, and atomically writes one append-only
follow-up, one metadata-only audit event and one hash-only receipt. Exact replay
revalidates current provider assignment and accepted-match ownership before
returning the metadata-only ACK. No Portal table grant, anon/service-role RPC,
operator/source mutation, history, notification, audit-list or document/export
permission is added.

The default runtime now supplies a request-scoped cookie client only after the
base API and durable-adapter gates, the selected independent operation gate and
the exact non-Production Preview ref pass. It
rejects caller Bearer authorization, never creates a service-role client and
executes database authorization before a private mutation body is parsed. The
database revalidates the current Auth user/session and the exact active
membership required by the selected operation; actor, organization and role
are never accepted from the body. Source list is metadata-only and create
atomically writes referral, private contact, audit and receipt rows with hashed
mutation/correlation identifiers. Source detail is read-only. Assignment reads
or performs only triage/offer, while Provider Response reads the caller's
metadata-only inbox or performs only accept/decline as described above. All
application flags are off, and every database flag row defaults off in migration
source. Exact pre-review commit `526aa1e`
remains the historical
deleted-disposable Hosted 32/32 migration, then-current 13/13 rollback and real
GoTrue SSR-cookie route-E2E baseline. Exact-current hardening HEAD
`43659ab16e9af6d9c73d0a55f8fe8b30b3ce9ee2` separately passed 32/32 migrations
and all 13 current rollback suites on deleted no-data branch
`portal-assignment-m1a-r2-20260826` (id
`3b111420-9f47-4e9f-b3a5-acd418f9423f`; ref
`uzlnwjurzbtwtstabogm`). Its exact-source local HTTPS Next runtime used a real
Hosted SSR cookie to pass Bearer rejection, Source-A-only queue, uniform
Source-B/random-ID detail denial, triage/replay, one eligible candidate,
offer/replay, the expected OFFERED-v3/hash-only terminal database state and
global-session-revocation `401`. This extends Hosted attribution to the
queue-bound, page-latch and null-adapter revision without changing the default-
off permission model.

The fixed teardown left Auth users, identities, sessions and refresh tokens and
every Portal fixture table at zero; all four Portal flags were
`enabled=false, preview_only=true`, and the checked append-only triggers were
normally enabled. Three consecutive branch-list probes found the exact `r2` id
and ref absent after deletion. Production retained 19 migrations and remained
the default `ACTIVE_HEALTHY` project before and after; it was never a SQL, Auth,
route or other write target. No Vercel deployment, merge, retained Preview,
Production migration or activation is claimed.

Historical pre-review M1b source
`cc1e53cc88666a3e3f18ac55058295db408535ee` subsequently passed a separate
deleted no-data Hosted gate on Preview ref
`aupndcptwlqmjlgeifdj`: 33/33 migrations, all 14/14 rollback suites and the
real local-HTTPS Next/GoTrue SSR-cookie/Data API matrix with two independent
provider sessions. The only Supabase connection values in the Next environment
were the branch URL and publishable key. The service role was confined to one-time Auth administration,
and the direct non-pooling database credential was confined to fixture setup and
verification; neither credential entered the Next environment. The matrix
proved no-cookie and Bearer rejection before authority, Provider A/B list and
mutation isolation, exact no-PII projections, transport,
stale-version and idempotency rejection, stable ACCEPT/DECLINE replay,
hash-bound terminal database effects and global revocation of saved old cookies,
including Provider A's Cookie carrying a still-unexpired access JWT. Fixed
teardown left all four Auth tables and all 11 Portal business
tables at zero, all five flags off/Preview-only and all three append-only
triggers enabled. Three consecutive deletion probes found the exact ref absent;
Production remained the default healthy project at 19 migrations and received
no SQL, Auth, route or other write.

The deleted M1b Preview's security advisors returned 21 INFO / 17 WARN and its
performance advisors returned 105 INFO / 24 WARN, with zero ERROR. Three WARN
are the intentionally narrow authenticated-executable Provider Response
`SECURITY DEFINER` RPCs. Like the 21 INFO / 14 WARN recorded for the earlier
Assignment `r2`, these are visible review items rather than an unrestricted
definer or all-project security-green claim: every RPC remains covered by the
master plus operation-specific database gates, the exact non-Production
application target, fresh Auth user/session checks and exact membership/tenant
authorization; all use `search_path=''`, and authenticated callers receive no
direct Portal table write grant. M1b remains default-off and
Production-unapplied. No Preview/runtime was retained, and no Vercel deployment,
merge, activation, private accepted-detail read, follow-up, notification, audit
list or document/export permission was added.

Post-review source `f45b19c596edd0bdbe01eba17e6e5fa136df5225`
keeps transport-uncertain replay only inside one browser authorization epoch.
Focus, visible-tab, auth-storage and persisted-page boundaries clear both the
old projection and old command before reauthorization, so another active member
of the same provider cannot inherit the prior actor's idempotency key. It also
adds the active-offer-first bounded inbox, 10-second request/body timeout and
the real local PostgreSQL 16 two-backend race gate. Local validation passed 8
focused files / 271 tests, 143 files / 1,935 tests, TypeScript, lint, 64/64
static pages, adapter/diff checks, the seven-migration chain, all four Portal
rollback suites and 6/6 concurrency scenarios. Exact gate source HEAD
`44f3bd68699dc953e2666bf033dac2b5e26a4d30` then passed a newly authorized
no-data Hosted re-gate on deleted Preview
`portal-provider-response-m1b-r2-20260826` (id
`fb2e7d39-436d-48d5-a890-ad53b23b1fc6`; ref
`nhupgyxczlvtddycrgyw`). The database path was restricted to explicit linked
CLI queries against that ref and rejected all direct-connection variables;
the Next process received only the Preview Supabase URL and publishable key as
Supabase connection values, while the Auth admin key stayed only in the
one-time matrix process. The exact migration/suite gate passed 33/33 and 14/14;
the real SSR-cookie/Data API matrix passed its historical 14/14 assertions and
the exact-current active-first/non-null-cursor checks 2/2. Final teardown left
zero rows across the four Auth tables and 11 Portal fixture domains, all five
flags off/Preview-only, all three append-only triggers enabled, zero API Portal
table grants and zero temporary migration roles. Final Advisors were security
21 INFO / 17 WARN / 0 ERROR and performance 106 INFO / 24 WARN / 0 ERROR.
The branch was deleted and three probes found its id/ref absent; Production
remained the default `ACTIVE_HEALTHY` project with the same 19 migrations. This
closes the post-review Hosted evidence prerequisite without granting merge, deployment,
activation, private-detail access or any Production permission.
The later focus/sign-in UI recovery in the current PR postdates exact gate
source `44f3bd6`, has local-only evidence and adds no permission.

`supabase/migrations/20260809120000_create_v1_shadow_foundation.sql` defines the following controls. It was applied only to a disposable `with_data=false` branch and has not been applied to Production Supabase:

| Shadow resource | Authenticated client | Service role | Integrity binding |
|---|---|---|---|
| documents, revisions, checkpoints, self-review | owner `SELECT` only | no document write RPC in this historical foundation migration; see the newer unapplied draft below | composite owner/document/revision foreign keys |
| privacy proof | owner `SELECT` only | future validated repository | proof reference binds the same owner |
| generation/export jobs and events | owner `SELECT` only | future orchestrator/worker | job/event references bind owner and document |
| point wallet/lots/quotes/reservations/allocations/ledger | owner `SELECT` only | five shadow-only grant/quote/reserve/commit/release RPCs | quote, reservation, lot and ledger references bind owner |
| rate catalog | no authenticated grant | `SELECT` | version and service-code foreign keys |
| legacy migration batch/items | no authenticated grant | `SELECT` only in this migration | metadata/hash only; target mapping binds source owner |
| NDIS shadow link/outbox/comparison | no authenticated grant | `SELECT` plus three narrowly granted projection/comparison/audit RPCs | legacy source, owner, canonical document and revision are composite-bound |

All shadow tables enable RLS before integration, and shadow business rows are constrained to `shadow_only=true`. Authenticated users receive no `INSERT`, `UPDATE` or `DELETE`; shadow RPC execute grants are revoked from `public`, `anon` and `authenticated` and granted only to `service_role`.

The newer `20260810131648_add_v1_mobile_sync_shadow.sql` draft defines one service-only session-status RPC and seven narrowly scoped Product data RPCs for list/get/create/revision/checkpoint/tombstone/sync operations. Product data ownership is derived from `auth.uid()`. The final active-principal helper joins the exact Auth session and user at one evaluation time and fails closed unless the session is unexpired and the user has authenticated database `aud`/`role`, a confirmed email, trusted database `raw_app_meta_data.role='provider'`, `is_anonymous=false`, no deletion and no current ban. User-editable `raw_user_meta_data` and JWT user metadata are never authorization inputs. The source contract defines and statically locks both session-row revocation and this database provider-eligibility boundary; broader inactivity and high-risk reauthentication policy remains part of the unserved session-management capability. To prevent a revoked-but-unexpired JWT from bypassing that check, the draft revokes authenticated direct reads of canonical documents, revisions, checkpoints and self-review events. Only list/get/pull receive authenticated execute; the four document write-RPC grants remain withheld until canonical-hash vectors and complete server-equivalent Note schema validation pass in a disposable Supabase database. Separately, the TypeScript privacy route authenticates before parsing, returns only finding locators and invokes proof issuance through a dedicated Preview-only service client with hash/version/decision metadata—never cleaned facts or a token. That source implementation does not establish an applied database RPC or grant. The database feature flag defaults off. Source/static tests are not database RLS evidence. The local `/v1` runtime now assembles the durable adapter and service-only active-session resolver, but two application flags remain default-off and missing configuration or any failed session/RPC check fails closed. Cookie-authenticated mutations additionally require an exact same-origin HTTPS `Origin` and JSON media type after authentication but before body parsing; Bearer-native mutations remain header-authenticated and do not require a browser Origin.

Isolated guarded-live evidence: 18/18 expected tables existed; all 14 owner resources had RLS, owner-SELECT policies and authenticated SELECT grants; authenticated write grants were 0; all five Points RPCs were executable only by `service_role`. Anon reads/RPCs returned 401. Provider A/B JWTs saw only their own rows and all direct INSERT/PATCH/DELETE/RPC attempts returned 403. A test-only platform service actor saw zero owner rows and had no elevated product permission. Composite owner/document/revision foreign keys and `shadow_only=false` rejected invalid fixtures. The service role could execute Points RPCs but had no direct INSERT/UPDATE/DELETE table grants.

The local NDIS integration migration adds no client write grant and no product Admin role. Provider owner reads of the already-defined canonical document/revision tables remain RLS-scoped, while link/outbox/comparison tables are service-only metadata. The public save route authenticates a provider and legacy claim before the server-only integration can construct a service-role client. The repository is absent from `src/components` and every other application route.

Second integration-gate evidence: the disposable `qkciaecjwidtbujzwzln` branch applied and replayed both migrations. Schema inspection found RLS on all three integration tables, zero `anon`/`authenticated` table privileges, zero public/anon/authenticated execution grants and exactly three service-role execution grants. Anonymous REST returned `401` for canonical/integration reads and `404` for non-exposed RPCs. Service-role SQL proved source-owner FK denial, `shadow_only=false` rejection, idempotent replay, concurrent revision serialization and metadata-only reconciliation. A fresh real provider JWT was not obtained because official branch sign-up required email confirmation; Auth internals were not patched to bypass that control. Therefore this run adds database/service-boundary evidence, not a completed App Preview owner-RLS proof for the integration slice.

The subsequent protected App Preview used confirmed, test-only provider A/B sessions on retained non-default branch `odrdlsrdlmtjczhmsbnj`. Provider A's legacy save projected one owner-bound canonical revision and comparison; provider B could not read or affect A's legacy or canonical data. Same-idempotency replay remained singular, and disabling the master flag left legacy Save available while producing no shadow activity. Test users and all associated rows were then cleared to zero. The branch remains only as an inactive Preview baseline; no V1 Organisation/Admin permission was introduced and Production RLS was not changed.

Final pre-commit hardening adds a narrower legacy-NDIS lifecycle condition to the Production-unapplied owner policies: canonical document/revision/checkpoint rows projected from `generated_material_drafts` are owner-readable only while the matching owner/source row with the same creation identity exists. Source deletion therefore removes owner readability before a best-effort, service-role-only tombstone RPC runs; cleanup failure cannot expose content or change the legacy Delete response, and the service-only audit reports it as `SOURCE_DELETE_CLEANUP_PENDING`. Tombstoning binds the deleted source's `created_at`, persists the first correlation and does not write on replay; a later source with the same ID is a separate generation. Non-legacy owner policies keep their prior owner-only semantics. The then-current revisions of forward migrations `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048` passed on the retained non-default branch; they backfilled a real synthetic pre-identity row, tombstoned an unidentifiable orphan, proved a historical PURGED row remains terminal, exposed a simulated missed tombstone without restoring owner access and separated a same-ID/new-generation fixture. The then-current transactional assertions passed and zero fixtures remained. Later catalog, active-provider/session and private-schema ACL hardening—including the current `20260810080048` revision—has only source/contract-test evidence and has not been re-applied. Production was not changed; the exact current migration set and assertions must pass on a new or rebuilt disposable branch before another protected route-level Preview.

### Communication Note Preview owner authorization M1g-b (source-only)

M1g-b is not part of the current runtime permission matrix. It defines three
separate private execution roles, none of which is an application credential:

| Shadow action | Database role | Permitted source operation | Explicitly denied |
|---|---|---|---|
| Persist already-verified owner authorization or revocation | `careslink_v1_preview_authorization_executor` | owns the exact definer RPCs and only their RLS-governed internal table/column privileges; no runtime caller membership | API/service-role access, broad mutation, signing-key trust decisions |
| Claim authorization and reserve the next exact slot | `careslink_v1_preview_dispatch_executor` | owns the exact definer RPCs plus their RLS-governed lock/insert privileges and token-hash validation; no runtime caller membership | second claim, token reissue, broad mutation, out-of-order/duplicate reservation, external HTTP inside the transaction |
| Persist an already-verified CaresLink receipt | `careslink_v1_preview_receipt_executor` | owns the exact definer RPC plus its RLS-governed lock/insert privileges; no runtime caller membership | provider attestation claims, broad mutation, receipt overwrite, prompt/facts/body/raw identifier storage |

All five authorization, revocation, claim, reservation and receipt ledgers use
enabled plus forced RLS, append-only protection and separate ownership. No
schema usage, table privilege or function execution is granted to `PUBLIC`,
`anon`, `authenticated` or `service_role`. Security-definer functions have a
fixed empty search path, validate exact relationships and are owned by the
dedicated role whose direct privileges are limited to the rows/columns required
by that command. A future runtime caller must receive only exact function
`EXECUTE`, never role membership or `SET ROLE`; inert-role ownership does not
itself create a caller. Every RPC rejects non-`READ COMMITTED` transactions so
no stale repeatable snapshot can bypass a post-lock revocation recheck.

The application verifier, not PostgreSQL, resolves the external owner key from
an external trust-registry snapshot and verifies Ed25519 before calling the
database persistence boundary. The snapshot must carry the owner-authorization
purpose/domain and exact owner/tenant scope; the caller also supplies the
expected run binding. Receipt keys use a disjoint purpose. SHA-256/HMAC values
do not grant authority. The
database may validate the fixed canonical statement and persist verifier
evidence, but that is not independent owner-signature verification.

The authority policy digest is
`7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9`.
Both readiness latches are `false`, both approved key snapshots are absent and
there is no caller grant, environment lookup, route, worker, real provider
transport, hosted database application or Production permission. A signed
receipt authenticates only the CaresLink internal observation and always keeps
`providerAttestation=ABSENT`; it does not establish billing, model execution,
an exact provider receipt or exactly-once delivery.

### Communication Note Preview custody callers M1g-c (source-only)

M1g-c preserves the three M1g-b executor roles as function owners and adds four
separate, inert caller shells. This separates ownership/table privileges from
the future connection identities that may invoke exact definer functions:

| Caller shell | Exact function bundle | Explicitly absent |
|---|---|---|
| `careslink_v1_preview_authorization_registration_caller` | one authorization-registration RPC | revocation, claim, reservation, receipt, table access, executor membership and login |
| `careslink_v1_preview_authorization_revocation_caller` | one authorization-revocation RPC | registration, claim, reservation, receipt, table access, executor membership and login |
| `careslink_v1_preview_dispatch_caller` | authorization claim plus next-slot reservation RPCs | authorization registration/revocation, receipt, table access, executor membership and login |
| `careslink_v1_preview_receipt_caller` | one verified-receipt persistence RPC | authorization, claim, reservation, table access, executor membership and login |

Every shell is `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. The
migration grants only private-schema `USAGE` and exact function `EXECUTE` in the
1/1/2/1 mapping. It grants no table, sequence, broad function or owner-role
privilege and no `SET ROLE` path. `PUBLIC`, `anon`, `authenticated`,
`service_role`, `authenticator` and the listed API/runtime roles remain outside
all four shells. A PostgreSQL 16 non-superuser role creator may
retain only the server-created ADMIN bootstrap edge with both `INHERIT` and
`SET` false; the assertion rejects every usable or caller-to-executor/runtime
edge around all caller and executor roles. The migration adds no custody table,
credential row, login, seed, route or database setting.

An identity HMAC supplied to an M1g statement is not PostgreSQL, Supabase Auth
or connection authentication. It can bind a previously authenticated caller to
expected metadata, but cannot prove `current_user`, session validity, JWT
subject or possession of a database credential. A future live connection
identity and its exact shell membership must be provisioned, audited, rotated
and revoked separately; until then the shells cannot be assumed by runtime.

The server-only custody contract similarly grants no authority by itself. It
validates purpose-separated, content-free descriptors for the external owner
verification snapshot, non-exportable receipt signer and temporary
project-service-account credential reference. It accepts no raw private key or
bearer value, has no runtime importer, keeps both readiness latches `false` and
leaves the approved snapshot `undefined`. Candidate registry hashes are neither
authenticated provenance nor a freshness/revocation proof. Its policy digest is
`1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438`.
No real key, signing operation, login-capable caller, hosted database mutation,
provider call, deployment or Production permission is part of M1g-c. See
`documentation/communication-note-preview-key-custody-callers-m1g-c.md`.

### Communication Note Preview signed terminal caller M1g-g (historical source-only checkpoint)

M1g-g adds the fifth purpose-scoped caller that M1g-f deliberately left
absent. Historical M1g-f evidence remains accurate for that revision; the new
CLI migration adds the following separate shell without widening any of the
four M1g-c bundles:

| Caller shell | Exact function bundle | Explicitly absent |
|---|---|---|
| `careslink_v1_preview_runner_terminal_caller` | `persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)` only | authorization, revocation, claim, reservation and receipt RPCs; tables, sequences, types, helper functions, executor membership, login and API/service-role access |

The caller is `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. It
receives private-schema `USAGE` and exact three-argument function `EXECUTE`
only. The isolated runner-terminal executor remains the security-definer
function owner and retains only its forced-RLS ledger privileges; no runtime
identity may assume either role. The old unsigned
`persist_verified_communication_note_preview_runner_terminal(jsonb,text)`
entry is removed so it cannot bypass the independent signature evidence.

The terminal authority is an Ed25519 envelope under purpose
`CARESLINK_RUNNER_TERMINAL` and domain
`CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL`, not the caller identity
HMAC. The application verifies the purpose- and domain-scoped public-key
snapshot before calling PostgreSQL. The database binds and persists the exact
statement, unpadded Base64URL signature, signature SHA-256, signer key-id hash,
public-key fingerprint, authenticity/method labels and verifier identity HMAC;
it does not claim to verify Ed25519 itself. Owner-authorization, receipt and
terminal signer identifiers, fingerprints and custody references must remain
pairwise distinct.

The source-only signed-terminal and PostgreSQL ports accept only explicit
dependency injection and an exact parameterized RPC. They create no pool or
connection, read no environment, resolve no secret or signing key and expose
no product route/worker importer. Their readiness values remain `false`, all
approved ports and the approved terminal signing key remain `undefined`, and
the fifth shell has no login-capable member. The test-only signing-key snapshot
is not yet cross-bound to a validated M1g-c custody/trust-registry resolver,
and the verifier HMAC is not cross-bound to a fifth-caller credential/identity
resolver. Those are explicit activation blockers, not live registry, custody
or caller-authentication evidence. M1g-g therefore grants no Hosted,
provider/model, deployment or Production permission. Its terminal policy and
custody digests are respectively
`d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa`
and
`f537dc64e3c57a34b6db6d0d1c871c38a70bcb51c4d071e625b026f840a309ca`.

### Communication Note Preview runner-terminal trust composition and disposable identity M1g-h (historical test-only checkpoint)

M1g-h source-cross-binds the terminal verifier, runtime port and exact
PostgreSQL port to one branded custody/trust composition. The registry status
is `TEST_ONLY_VALIDATED_NOT_APPROVED`; the composition status is
`TEST_ONLY_COMPOSED_NOT_APPROVED`. Raw signing keys, caller records and database
credentials cannot be substituted for the branded objects. This is a local
validation boundary, not approval or authenticated external provenance.

The disposable identity policy permits a random, ten-minute, connection-limit-1
LOGIN only on an exact non-Production Preview. The role is `NOINHERIT` and may
receive exactly one membership into
`careslink_v1_preview_runner_terminal_caller` with `ADMIN=false`,
`INHERIT=false` and `SET=true`. It receives no direct schema, table, sequence,
executor, API/service-role or other RPC privilege. Teardown first applies
`NOLOGIN`, rejects new connections, closes or drains the exact sessions, then
revokes the membership and drops the LOGIN.

The original M1g-h authorized Hosted run stopped at the earlier 18-file rollback gate with
`SCHEMA_ROLLBACK_ASSERTION_FAILED`, so that one-time LOGIN was not created and
no Hosted caller assumption or signed terminal write is claimed. The entire
no-data Preview was deleted; three subsequent listings left only the healthy
default Production branch. Local PostgreSQL 16.15 did prove the same identity
shape and source-valid signed `FAILED`/`CANCELLED` path, but local evidence does
not grant a persistent Hosted identity or runtime permission. Readiness remains
`false`, approved values remain `undefined`, and no Production, deployment,
provider/model or real-data permission was added. Detailed evidence is in
`documentation/communication-note-preview-hosted-runner-terminal-identity-m1g-h.md`.

### Communication Note Preview terminal ACCEPTED usage alignment M1g-i (current source/local; prior Hosted separately attributed)

M1g-i does not widen the M1g-g/M1g-h permission surface. The existing
`careslink_v1_preview_runner_terminal_caller` retains only private-schema
`USAGE` and exact execution of
`persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)`.
The isolated executor remains the function owner; no API/service role, LOGIN,
table privilege, broad function grant or caller-to-executor membership is
added.

Migrations 37 and 38 now keep their grants, locks and cleanup inside explicit
repository transactions, with SHA-256 values
`09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432`
and
`4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f`.
Migration 39 remains
`3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e`.
The current ordered migration entries SHA-256 is
`a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2`;
transactional policy `2026-08-29.preview-transactional-migrations.6` binds
manifest
`60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`
and strips only 19 known explicit wrappers in memory for its single outer
transaction.

Identity policy `2026-08-29.preview-runner-terminal-identity.2` adds a mandatory
canonical `metadata` plus projected `credentials` envelope before the
destructive reset runner can read the CA or connect. It cross-binds the expected
ref, metadata/credential refs, direct host and pooler user and requires exact
`with_data=false`, `is_default=false`, `persistent=false` and
`status=ACTIVE_HEALTHY` values plus the source-pinned Production
`parent_project_ref`. A default/rotated Production ref, another parent,
persistent branch, `with_data=true` branch or unhealthy branch receives no
database permission. Preflight/coordinator versions
`preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5` and
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5` bind
digests
`0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1`
and
`1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2`.

The current focused source gate passed 5 files / 79 tests plus targeted lint,
Node syntax and diff checks. The complete current source gate then passed 172
files / 2,321 tests, TypeScript, zero-warning ESLint, the 73-file adapter sync
check and the 64/64-page Webpack build. Fresh isolated PostgreSQL 16.15 passed
39/39; migrations 37 and 38 deliberately succeeded statement by statement
without an ad hoc outer wrapper, A03 passed, and the final posture had zero
terminal rows and zero residual `SET` membership edges. The earlier 172
files / 2,315 tests and deleted r20 Hosted evidence belong only to artifact set
`4e84823`. That r20 run did create the temporary one-time LOGIN, complete signed
`ACCEPTED`/replay/conflict, and remove the LOGIN and sessions; it cannot be
attributed to the current transaction hashes, policy `.6`, identity policy `.2`
or v5 bindings. Exact-current Hosted/native-CLI proof requires a separately
authorized fresh disposable Preview. No persistent identity, broader grant,
runtime permission or Production authority may be inferred; readiness and
approval remain closed.

## Intended V1 matrix (partly codified, not available at runtime)

| Target resource | Owner | Admin/support | Service/backend | Required control |
|---|---|---|---|---|
| canonical document/revision/checkpoint | CRUD own | metadata/correlation only | validated mutations | owner RLS, revision conflict, tombstone |
| privacy review proof | own referenced proof | no excerpt/body | dedicated service-only confirm/validate hash binding | authenticated owner/type/canonical facts hash/schema/status/scanner revision/expiry binding; locator-only errors |
| generation/transcription/export job | own job/status/result | metadata only | worker lifecycle | owner RLS, idempotency, safe cancellation |
| point wallet/lots/ledger | SELECT own | aggregate/support reference | append-only RPC/provider events | no client write; allocation invariants |
| entitlement/receipt | SELECT own status | metadata/support state | verified provider event only | global receipt idempotency |
| content | published public read | editorial roles only | publication workflow | status/revision/locale/source contract |
| Save/Follow/Guide progress/action/reminder | CRUD own | aggregate only | reminder scheduler | owner RLS, source revision |
| notification preference/inbox/device | CRUD own | delivery metadata only | scheduler/provider adapter | safe payload, device/session revoke |
| data export/delete request | own request after reauth | support status only | audited workflow | reauth, legal-hold separation, processor cleanup |

## Permission work required before V1

1. Clean-apply the exact current migration set on a new or rebuilt disposable branch, execute the transactional SQL assertions, and rerun the protected Product API route matrix at that same revision before any Production enablement. Add Web-cookie parity separately; native PKCE/session/device support remains an independent disabled capability gate.
2. Treat the completed isolated schema/RLS/RPC gate as migration evidence only; require a separately approved application Preview for dual-write/shadow-read and reconciliation.
3. Replace broad service-role CRUD patterns with domain RPCs or server repositories that verify owner and idempotency.
4. Add device/session revocation and high-risk reauthentication.
5. Add support-safe correlation views rather than正文 access.
6. Extend the now-covered deleted/tombstoned resource policies with old-client, revoked-session and billing-provider replay tests.
