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

### Portal Referral foundation, intake, source-detail and Assignment M1a runtime (default-off and Production-unapplied)

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
`assigned_provider_id=null`; provider response remains unavailable. Triage and
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
or performs only triage/offer as described above. All application and database
flags remain off. Exact pre-review commit `526aa1e` remains the historical
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

The exact-current branch's security advisors returned 21 INFO / 14 WARN and
performance advisors returned 105 INFO / 24 WARN, with no ERROR. The
authenticated-executable `SECURITY DEFINER` warnings include intentionally
narrow Portal RPCs: each remains covered by the master plus operation-specific
database gates, the exact non-Production application target, fresh Auth
user/session checks and exact membership/tenant authorization; all use
`search_path=''`, and authenticated callers receive no direct Portal table
write grant. The WARN findings therefore remain visible review items rather
than an unrestricted definer or all-project security-green claim.

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
