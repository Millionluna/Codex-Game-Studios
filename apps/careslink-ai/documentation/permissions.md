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

### Portal Referral foundation (local and unapplied)

The Portal Referral foundation introduces organization membership, provider,
referral, separately protected contact, match, follow-up, receipt, audit,
document-link and export tables in an unapplied migration. It does not grant
authenticated table access or any state-changing RPC. A future adapter must
derive the actor, organization, role and provider identity from a freshly
validated session and current database membership; none may be accepted from a
request body.

The local actor-bound test adapter enforces Source A/B, Provider A/B and
partner-operator tenant isolation. Providers receive only frozen region/service
codes before accepting their own offer; summary/contact become visible only to
the exact accepted and still-approved provider. Decline or eligibility
revocation removes access. Mutation acknowledgements contain IDs, status,
version and timestamp only; receipts/audit use SHA-256 identifiers and do not
copy contact, summary, client correlation or raw idempotency values. Raw match
and audit rows are limited to platform admin or the tenant partner operator in
the draft RLS contract.

These are source/static guarantees. The route runtime has no default durable
adapter and a non-configurable `false` readiness latch, so physical
`/api/portal/referrals*` and `/api/portal/referral-offers*` handlers return a
metadata-only `503` before body parsing. The migration and rollback-only SQL
assertions have not run against a database; real RLS, ACL, active-session and
concurrent transaction behavior remain disposable-Preview gates.

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
