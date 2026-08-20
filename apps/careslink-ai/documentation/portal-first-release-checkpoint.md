# Portal-first release checkpoint

Date: 2026-08-20

Branch: `codex/careslink-ai-mobile-sync-v1`
Base HEAD inspected: `fe5b708c488853418bfec3822369429e8fe9ff8f`

Current five-Note local batch base: `63c10ea2e94ee4efdba7ffdbeb5aabbee6fcfa3b`

Current durable generation local batch base: `4bf34ee0955a958c64e6865faa8bde2f2d1664a7`

Current registered-worker adapter local batch base: `ec30b9342164d893f096cc0942b09d64fd457a73`

This checkpoint covers the AI Web Portal reality audit, release sequencing,
local Referral foundation and source-only five-Note generation contracts. It
does not modify the native App, Main Website, Native Auth/M0 implementation or
served shared Product API routes. Those are prerequisites recorded in the
existing versioned contract documentation. All new Referral and Note
generation capabilities remain local, default-off, Production-unapplied and
absent from retained Preview runtime. Two disposable Preview databases were
used only for the isolated migration/assertion gates recorded below and then
deleted; no Preview application deployment or Production database was used as
the SQL target.

## 1. Portal reality matrix

“Real” below means the source can persist to Supabase when its existing server
configuration is present. It does not mean current Preview or Production
availability.

| Portal surface | Current data | Real submit/update | Current safety and workflow gap | First replacement |
|---|---|---:|---|---|
| `/providers`, `/providers/[id]` | `mock-data` | No | Unknown IDs fall back to the first mock provider; no provider table, membership or RLS | Real provider detail after M0 membership; unknown IDs return 404 |
| `/providers/onboarding`, `/providers/review` | static/mock | No | Forms/buttons imply a save/review that does not occur | Add canonical provider profile and admin review command after identity proof |
| Provider profile generator | mixed: real `provider_drafts`, mock editing seed | Partial | Draft handoff can use an in-memory fallback and is not a canonical provider | Treat claimed draft only as intake seed |
| `/provider-portal` | mock referrals | No | Accept/decline/request-info controls do nothing; provider identity is not DB-bound | Owner-scoped offered referrals plus atomic response command |
| `/referrals`, `/referrals/intake`, `/referrals/[id]`, match page | mock plus pure scoring function | No | No referrals/matches/status/audit tables; invalid detail ID can show the first mock | First Portal workflow replacement: real intake, triage, offer and response |
| `/referral-source-portal` | mock | No | Buttons do not submit; apparent requests are lost | Reuse the same versioned create-referral command as intake |
| `/referral-workspace/*` | mixed real access/material/outreach stores | Yes, for those tools | These are AI access and outreach tools, not the referral pipeline; some stores have memory fallback | Preserve and later link by canonical referral ID |
| `/admin`, `/dashboard` | mock global metrics | No | Core pages have no real referral permission gate; must not receive real data yet | Add membership gate, then replace only the assignment queue |
| Admin access requests/material usage | real/mixed | Yes | Manages AI access/metadata, not providers or referrals | Reuse its auth-first action pattern, not its business schema |
| `/plan-and-usage` | legacy credits | Read-only | Runtime is still 3 legacy credits although the 300-Point/Pro product baseline is approved | Do not show both systems; implement and reconcile the approved wallet before cutover |
| NDIS Case Note | real legacy server flow plus local shared-job evidence | Legacy generate/save only | Uses synchronous model and old credits; the new shared job is source-only and does not call it | Preserve legacy; keep the shared provider and canonical write default-off |
| Other four Note types | catalog plus local shared-job/durable-contract evidence | No | Communication, Handover, Progress and Incident Factual share the dispatcher/output boundary and a default-off durable internal contract/memory fake, but have no database-backed repository, registered worker, served route, real provider or golden safety set | Implement the reviewed database/worker boundary, then validate each type without forking orchestration |
| `/ai-documents` | real legacy generated drafts | Delete only | Not canonical documents; store errors can appear as an empty list; no revision/export | Feature-gated canonical list only after current Preview evidence |
| Shared `/v1` documents/sync | local durable adapter | Default-off | Exact current migrations are Production-unapplied and exist on no retained Preview; write grants withheld; no current base URL | M0 permits only me/list/pull after all identity/RLS gates pass |
| Library/Guides/Updates | absent | No | No page, store, content version or API | After referral + Notes/documents/export |
| Account export/delete | absent | No | No request/status/recovery flow | Later privacy/account slice |

Two immediate Portal safety rules follow from this matrix:

1. A page may not silently fall back from real storage to mock or process
   memory in a user workflow.
2. A missing record must return an explicit not-found state; it must never show
   the first fixture.

## 2. Activation dependencies

Referral activation depends on the separately versioned Native Auth/M0 and
shared Product API contract. This foundation does not alter those contracts,
routes, flags or grants. In particular:

- the existing workspace fallback role resolver is not authoritative for the
  new Portal roles;
- native redirect allowlists and the current Preview base URL remain absent;
- Product API operation flags remain default-off and document write grants
  remain withheld;
- `/v1/me`, current-session proof and cookie/Bearer identity parity must pass on
  the exact same disposable Preview revision before Referral can be enabled.

## 3. Referral vertical slice

### Additive data model

- `portal_organizations`
- `portal_organization_memberships`
- `portal_providers`
- `portal_referrals`
- separately protected `portal_referral_contacts`
- `portal_referral_matches`
- append-only `portal_referral_followups`
- `portal_mutation_receipts`
- append-only `portal_audit_events`
- `portal_referral_document_links`
- `portal_referral_exports`

Owner, actor and role always come from the active server session and current
database membership. They are forbidden in mutation bodies. Organization
status/type and provider approval are rechecked for every operation. Contact
name/phone/email is separated from the referral row and is hidden from a
provider until that exact approved provider accepts the offer. Before
acceptance, the provider sees no free-text summary; only one of three frozen
Preview region codes and one of three frozen service-type codes can be exposed.
The private summary also rejects copied contact names, email and phone-like
values. These are narrow structural guards, not a claim of complete
de-identification.

### State machine

```text
SUBMITTED → TRIAGED → OFFERED → ACCEPTED → IN_PROGRESS
          ↑          └─ provider decline ─┘

IN_PROGRESS → NOTE_LINKED → EXPORTED → COMPLETED
```

Match status is separate from match score:

```text
CANDIDATE → OFFERED → ACCEPTED | DECLINED | WITHDRAWN | EXPIRED
```

A low matching score is not a provider decline. Unique partial indexes permit
at most one offered and one accepted provider per referral. Every mutation uses
an expected row version, an idempotency key and one append-only audit event.
Mutation responses and replay receipts contain only referral/match IDs, status,
version and timestamp; the request payload is represented by a SHA-256 hash,
not copied into the receipt. Contact data is obtained only through a newly
authorized read.

### Roles

| Role | Minimum visibility/action |
|---|---|
| Platform admin | Global workflow metadata; triage/offer; no implicit AI Note ownership |
| Partner operator | Tenant-scoped membership in a referral-source organization; only that tenant's referrals; triage/offer |
| Referral source | Create/read referrals in its organization; no provider assignment |
| Provider member | Minimal offered referral; respond only to its own offer; contact only after acceptance |

The foundation migration enables RLS but grants no table read/write privilege
and creates no state-changing RPC. Read policies and active-session membership
helpers are present for disposable-Preview testing. A later activation
migration must add narrow atomic commands that write business row, receipt and
audit in one transaction. Their execute grants remain withheld.

### Acceptance gates

- anonymous, wrong role, Source B and Provider B cannot read A;
- revoked session fails before request parsing;
- concurrent provider accepts result in exactly one accepted match;
- same-key replay is stable; changed payload conflicts; stale version is 409;
- each successful command writes exactly one metadata-only audit event;
- audit/receipt/correlation contain no contact, Note or token;
- a declined provider loses referral and child-row visibility immediately;
  an exact retry of the decline mutation may return only its original
  metadata-only ACK so transport idempotency remains stable;
- an offered provider can read only its own match and never another candidate;
- organization suspension/provider suspension fails closed on the next request;
- no authenticated direct write and no accidental function execute grant;
- Portal cookie and App Bearer resolve to the same principal/member;
- invalid route ID is not found, never fixture fallback.

### Rollback points

- app, operation and database gates all default off;
- migration is additive and does not import mocks or mutate legacy rows;
- activation grants must be in a separate migration;
- rollback disables capability/grants without deleting audit evidence;
- pages are replaced one at a time: intake, assignment, provider response,
  follow-up, then canonical document/export.

## 4. Shared contract boundary

The Referral foundation does not introduce a Portal-only document or sync
contract. Future referral-to-Note/document links must use the same versioned
canonical document IDs and Product API rules as the App. Sync push, document
writes and native auth remain outside this foundation and disabled. Any future
breaking contract change requires an impact fixture before App handoff.

## 5. Notes, 300 Points and later shared content

### AI Notes

The five shared codes are Communication, Handover, Progress, NDIS and Incident
Factual. They now enter one local typed catalog/dispatcher, provider port,
output validator and fake atomic job/document/revision unit of work. The job
uses the frozen `QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED` states; “pending” is
only the product meaning of `QUEUED`, not a sixth wire state. The server injects
the reviewed facts and disclaimer, rejects provider-owned facts and obvious
identifier/prohibited-decision output, and returns metadata-only acknowledgements.

This is source/offline evidence, not a usable Note service. The original job
readiness latch, durable readiness latch and payload-retention readiness latch
are all `false`. A server-internal durable repository contract and `TEST_ONLY`
memory fake now model attempts, leases, authorization, bounded recovery and
response-loss, but there is no HTTP route, database-backed durable repository,
registered worker, payload vault, real provider/model, STT, live Auth/privacy
transaction, Points settlement, export renderer or Portal generation UI. The
existing NDIS flow remains a separate legacy path and is not registered as the
new provider.

Next implementation order is:

1. freeze provider/model, payload-vault retention, lease/timeout/backoff and
   per-type golden safety decisions;
2. implement the database durable repository and transaction that fresh-reads
   the initiating session and exact privacy proof while atomically persisting
   job success, canonical document and revision 1;
3. add a default-off served job route and registered worker using the reviewed
   claim/authorization/recovery contract;
4. bind Points only after a usable canonical result revision exists;
5. implement revision-bound DOCX/PDF/TXT export and Portal UI.

No real model call is authorized in this task.

### Approved commercial baseline and Points

The product rules are approved, but their SQL/API/payment implementation is
not live. Free is A$0 with a one-time 300-Point welcome grant for an eligible
verified canonical account. Individual Pro is A$19.99 monthly or A$199 yearly;
both grant 2,000 subscription Points after each successful monthly entitlement
cycle, never 24,000 up front. Subscription Points do not roll over, while
purchased 500/2,000/5,000-Point top-ups do not expire and are available to
both Free and Pro users. Cancellation stops future cycle grants. V1 remains
individual only: Web, iOS and Android share one canonical user, entitlement,
wallet and append-only ledger.

The approved base rates are Communication 20, Handover 25, Progress 35, NDIS
50 and Incident Factual 60 Points. Device STT is 0; cloud STT is 10/minute;
Content Explain is 10; paragraph rewrite is 10; later full rewrites quote
20-40. Login, input, privacy review, edit, save, sync, export, delete, failed or
cancelled work cost 0. The first full generation and first same-facts full
rewrite are included in the base Note price.

The current Portal runtime still exposes the legacy three-credits-per-UTC-month
allowance and charges one legacy credit for NDIS. The Points wallet, lot,
entitlement and payment paths remain shadow/default-off. No code currently
serves an automatic welcome-300 grant, renews Pro lots, sells top-ups or
reconciles Stripe, Apple or Google events. Therefore:

- do not cut over or show two balances;
- do not grant Points in a migration or from a payment redirect;
- do not enable quote/reserve/commit/release before the canonical revision,
  RLS, concurrency and reconciliation gates pass;
- preserve product truth while implementation decisions remain open: exact
  welcome eligibility/existing-user treatment/expiry, legacy conversion,
  top-up AUD/GST/product IDs, refund debt handling, renewal/grace/channel
  switching, past-due and duplicate-subscription behavior, 15-versus-10-minute
  reservation expiry, first-rewrite catalog representation, database-unique
  welcome ownership and a commit contract bound to the persisted canonical
  `resultRevisionId` rather than a generic result reference.

Library, Guides, Updates, notifications and account export/delete follow the
Notes/document/export slice and use the same versioned contract, not Portal-only
sync rules.

## 6. First safe local batch and evidence

Referral foundation included in this batch:

- pure referral state machine with metadata-only replay, stale, A/B, declined
  access removal, multi-follow-up, role/provider eligibility, contact-summary
  rejection, frozen Preview catalog codes, sequential competing-decision
  rejection and failure rollback tests;
- Production-unapplied Portal referral foundation migration, clean-applied only
  on a deleted disposable Preview, with RLS and all writes withheld;
- rollback-only SQL assertions for A/B, contact visibility, revoked session and
  direct-write denial.

Formal local gates passed:

| Command | Result |
|---|---|
| focused Referral tests | 2 files / 28 tests passed |
| `pnpm test` | 107 files / 938 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 61/61 |

The SQL assertion script has not been executed because no authorized fresh
disposable Preview target or credentials are present.

## 7. Disposable Preview entry criteria

Do not provide a base URL to App/Main until all are true at the same revision:

1. a fresh disposable non-Production Supabase branch is identified and approved;
2. the exact current migration set clean-applies;
3. transactional assertions and ACL/RLS/SECURITY DEFINER negatives pass;
4. Source A/B, Provider A/B, platform-admin and revoked-session fixtures prove
   organization, provider, contact and child-row isolation;
5. replay, stale-version and competing accept/decline behavior pass against the
   database implementation once narrow state-changing RPCs exist;
6. Web cookie and App Bearer resolve to the same principal and membership;
7. cleanup returns test users, sessions and Referral rows to zero;
8. Referral, Product writes, AI, Points, billing and sync push remain disabled
   until a separately reviewed activation migration and route slice exist.

The historical protected Preview evidence remains useful but does not satisfy
these exact-current-revision gates and is not Production approval.

## 8. Pre-database Portal route/page slice — 2026-08-16

The next local batch connected the Referral contract to an actor-bound server
adapter, nine physical route surfaces under `/api/portal/referrals*` and
`/api/portal/referral-offers*`, plus shared Web controls. It is deliberately a
pre-database slice:

- the default runtime has no memory or Supabase adapter and a compile-time
  readiness latch fixed to `false`;
- all three non-secret environment settings default off and cannot bypass that
  latch;
- Preview target validation requires an explicit exact non-Production project
  ref and rejects Production;
- mutations resolve the request-scoped API before reading JSON, require
  same-origin HTTPS, `application/json`, a bounded body and a valid
  idempotency key;
- responses use a server-generated correlation ID, generic structured errors
  and metadata-only ACKs; client correlation, token, contact, summary and raw
  mutation IDs are not reflected;
- list, offer and audit DTOs are role-specific, and declined providers disappear
  from offer/detail reads while exact retry returns only the original ACK;
- pages never turn legacy mock IDs into canonical route IDs. Intake remains
  disabled, and actions needing a canonical UUID/row version render an explicit
  database-identity boundary.

Local evidence at this checkpoint is 7 focused files / 73 tests, full 112 files
/ 983 tests, TypeScript, ESLint and Next static generation 63/63. The migration
and transactional SQL assertions remain unexecuted. The memory arbitration test
does not prove Postgres row-lock behavior. No Preview URL can be handed to the
App or Main Website until the entry criteria above pass on one exact disposable
Preview revision.

## 9. Five-Note source/offline generation foundation — 2026-08-20

The current local batch adds two server-only modules and their tests:

- `src/lib/v1/note-generation-output.ts` freezes the provider candidate shape,
  server-owned facts/disclaimer, output bounds, identifier/prohibited-decision
  guard, canonical JSON hash and a revalidated read-only legacy NDIS adapter;
- `src/lib/v1/note-generation-job.ts` freezes one five-type dispatcher and
  provider port, version-bound jobs, hashed idempotency, metadata-only ACKs,
  owner isolation, session/privacy admission and commit-time bindings, cancel
  late-result handling and a fake atomic job + document + revision-1 store.

The fake store proves local state-machine and atomicity semantics only. A
future database durable implementation must revalidate the active initiating
session and exact owner/type/facts-hash/schema/status/expiry privacy proof
inside the same transaction that creates the canonical result and marks the job
`SUCCEEDED`. No current migration or SQL assertion implements that transaction.
Approved runtime timeout/lease/backoff policy, database recovery, semantic
golden sets, real model/STT, Points, export and served Portal UI remain
activation blockers.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused five-Note generation tests | 2 files / 68 tests passed |
| `pnpm test` | 114 files / 1,051 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

These results execute no model, STT, Points, database, Preview or Production
operation.

## 10. Durable generation source contract — 2026-08-20

The next local batch adds:

- `src/lib/v1/note-generation-durable.ts`, a server-internal durable repository
  contract and explicitly `TEST_ONLY` memory fake;
- `src/lib/v1/note-generation-durable.test.ts`, covering claim, authorization,
  lease/recovery, stale-worker fencing, replay, owner-safe views, retention and
  canonical revision-1 invariants;
- `documentation/v1-note-generation-durable-design.md`, the default-off handoff
  for a future private database schema, transaction and worker.

The source contract models owner-scoped idempotent enqueue, concurrent claim,
lease renewal/expiry, explicit bounded recovery, cancellation and terminal
invariants. Claim returns no payload handle. A separate worker-private
payload-use operation requires exact same-attempt/lease session and privacy
bindings before it returns the test handle and records authorization. Canonical
commit requires that authorization, rechecks the bindings, validates the
complete server-owned Note output, writes one document plus revision 1 in the
memory atomic region, and supports exact success response-loss replay. Changed
replay input conflicts; expired/recovered leases fence old workers; a recovered
attempt does not inherit payload authorization.

Only `getOwnerView` is serializable to an owner. It excludes initiating session,
privacy proof, facts/idempotency/payload/lease hashes and worker metadata. The
private record may retain the initiating session UUID solely so a future
database transaction can fresh-read eligibility; access/refresh tokens, raw
facts and provider output are absent from job/attempt metadata.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused durable generation tests | 1 file / 38 tests passed |
| adjacent Note generation tests | 3 files / 106 tests passed |
| `pnpm test` | 115 files / 1,089 tests passed; preserves 114 / 1,051 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

`CARESLINK_V1_NOTE_GENERATION_DURABLE_READY` and
`CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY` remain `false`. No route,
database migration/repository, registered worker, payload vault, model/STT,
Points or deployment was added. Memory session/privacy binding tests are not
live `auth.sessions`/privacy-row E2E and cannot authorize Preview or Production
activation.

## 11. Worker, provider and sensitive-payload policy contracts — 2026-08-20

This local batch adds three source-only contracts and their tests:

- `note-generation-worker-policy.ts` requires a complete immutable digest-bound
  policy for queue, lease, heartbeat, hard attempt/provider deadlines, commit
  margin, explicit retry vector/outcomes, recovery batch and jitter;
- `note-generation-provider-policy.ts` requires exact provider, model/revision,
  prompt, golden-set, parser, service/rate-catalog and cost-evidence versions,
  and binds its timeout to the actual digest-verified `APPROVED` worker policy;
- `note-generation-payload-contract.ts` models canonical reviewed-facts
  staging, single-use attempt grants, fresh session/privacy binding at both
  authorization and consumption, logical revoke, purge retry/receipt and
  owner-safe status through an explicitly plaintext `TEST_ONLY` memory fake.

The production worker catalog is empty, provider policy is undefined, payload
retention policy is undefined, and all readiness values remain `false`. Missing
model usage/cost is recorded as `UNAVAILABLE`, never invented as zero. Provider
cost evidence is separate from the approved 20/25/35/50/60 user Points catalog.
No real model, provider, vault, KMS, queue, database, Points settlement or route
was connected.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused worker/provider/payload tests | 3 files / 104 tests passed |
| adjacent Note generation tests | 6 files / 210 tests passed |
| `pnpm test` | 118 files / 1,193 tests passed; preserves 115 / 1,089 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

Before any Preview activation, owners must approve the exact worker durations
and retry budget, provider/model/region and prompt/golden governance, payload
TTL and purge SLA, encryption/KMS/data residency, backup/restore deletion
behavior, and telemetry/cost-retention policy. The implementation must then add
a private durable database adapter, registered worker, server transaction clock,
live `auth.users`/`auth.sessions` and privacy-proof reads, and disposable-Preview
concurrency/revocation/purge tests. None of those decisions is guessed here.

## 12. Registered Note worker v2 source contract — 2026-08-20

This batch adds `note-generation-registered-worker.ts` and its test. It does not
deploy or register a runtime worker. Readiness remains `false`, the production
registry is frozen empty, and the only factory requires the literal
`TEST_ONLY` capability.

The registration digest binds the worker identity, contract/schema, immutable
worker policy, all five Note provider policies and the payload-policy snapshot.
The parameterless worker surface then proves this order: claim; authorize and
single-consume reviewed facts; enforce grant lifetime, provider deadline and
heartbeats; validate content-free provider evidence; reject non-completed
results; build canonical content; fence the lease; and call one atomic success
boundary for canonical document/revision 1, sync change, mutation receipt and
payload logical revoke. Exact retry/jitter/max-attempt rules and response-loss
resolution are also fail-closed.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused registered-worker tests | 1 file / 43 tests passed |
| adjacent Note generation tests | 7 files / 253 tests passed |
| `pnpm test` | 119 files / 1,236 tests passed; preserves 118 / 1,193 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

Independent source/test review found no current P0/P1. This remains control-flow
evidence only. A real durable store, database transaction clock, scheduler,
fresh session/privacy database reads, encrypted payload backend, approved
provider/model policies and disposable-Preview concurrency/recovery gates are
still required before any runtime registry entry or user traffic can exist.

## 13. Registered-worker database/vault adapter contract — 2026-08-20

This batch adds `note-generation-registered-worker-adapter.server.ts` and its
test, plus the minimum adjacent worker binding needed to carry the
metadata-only cleaned-facts hash and exact provider-evidence replay hash. The
adapter exposes no route and discovers no Supabase client, credential,
environment or runtime registration. Its readiness latch remains `false`; the
only constructor requires `TEST_ONLY` and injected abstract RPC/vault ports.

The adapter freezes nine RPC names and forbids owner, session, caller time,
duration, retry budget, raw facts and vault locator arguments. A payload may be
consumed only after a database-derived type/version/hash binding matches the
claim and the decrypted facts pass the shared typed, bounded canonical-hash
gate. Success, failure and response-loss parsing require complete composite
transaction acknowledgements; a bare result or settlement is rejected. The
success acknowledgement binds canonical revision 1, sync, `CREATE_DOCUMENT`
receipt, provider evidence, terminal job/attempt, payload revocation and purge
enqueue before returning metadata-only IDs and hashes.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused adapter tests | 1 file / 46 tests passed |
| registered worker + adapter | 2 files / 91 tests passed |
| adjacent Note generation tests | 8 files / 301 tests passed |
| `pnpm test` | 120 files / 1,284 tests passed; preserves 119 / 1,236, 118 / 1,193 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

No migration was generated: the Supabase CLI is unavailable and this task was
explicitly offline, so inventing a timestamped migration would violate the
reviewed migration workflow. No database, RLS/ACL, fresh Auth/privacy row,
vault, purge outbox or transaction was exercised. The composite acknowledgement
is therefore a fail-closed source contract, not proof of those effects. The
next database batch must begin with the CLI-generated filename and remain
blocked until a disposable Preview proves the distinct non-bypass executor
role, FORCE RLS, exact ACLs, database clock, concurrent claims, revocation
races, canonical atomicity and purge behavior.

## 14. Durable Note metadata schema-only foundation — 2026-08-21

The official Supabase CLI workflow was reverified and CLI 2.115.0 generated
`20260820135834_add_v1_note_generation_durable_shadow.sql`; no timestamp was
invented. This is the first database-shaped layer for the five shared Note
types, but it remains inert and Production-unapplied. A second disposable
Preview clean-applied the complete 13-file source manifest, while the
rollback-only assertion exposed a PostgreSQL 17 catalog-compatibility bug and
rolled back. The complete Preview gate has not passed.

The migration creates dedicated owner/executor roles with `NOLOGIN`,
`NOSUPERUSER` and `NOBYPASSRLS`, the private
`careslink_v1_generation` schema, a settings row constrained permanently off,
metadata-only jobs/attempts and ten indexes. All three tables enable and force
RLS and have zero policies. API roles and the future executor receive no schema
or object privilege. On PostgreSQL 16+, only the creator's automatic admin-only
edges may remain; assertions require `INHERIT=false` and `SET=false`, while the
temporary ownership `SET` edge is grantor-scoped and revoked. There is no raw
idempotency key, facts, canonical content,
provider output, transcript, token, URL, locator, arbitrary error text, JSON or
binary content column.

The adjacent rollback-only SQL source freezes catalog, ownership, role,
effective default-ACL, column, constraint/index names and actions and contains
negative fixtures for invalid settings, state/hash/time/owner bindings and
multiple active attempts. It deliberately contains no function or
`SKIP LOCKED` claim and states that it does not prove an RPC or atomic canonical
transaction. The TypeScript source test separately locks exact index and
foreign-key definitions.

Local evidence for this batch:

| Command | Result |
|---|---|
| focused migration contract | 1 file / 10 tests passed |
| adjacent Note generation tests | 9 files / 311 tests passed |
| `pnpm test` | 121 files / 1,294 tests passed; preserves 120 / 1,284 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |
| focused ESLint and `git diff --check` | passed |

The first clean-apply attempt used a fresh non-default Supabase branch with
`with_data=false` on PostgreSQL 17 (`server_version_num=170006`). The first 12
exact local source SQL files applied in order, while this thirteenth migration
failed with `42501 permission denied to change default privileges`. Read-only
post-failure checks confirmed its schema and two roles were absent, proving the
failed migration rolled back atomically; the disposable branch was then deleted
and its absence verified. The Production database was not connected to,
queried, migrated or modified. This is failure/cleanup evidence, not successful
Preview evidence.

The hosted-safe source repair changes the dedicated owner's global defaults
inside a temporary `SET ROLE` / `RESET ROLE` window and performs the only schema
revoke before ownership transfer. On a second fresh branch, all 13 exact source
migrations applied successfully and the earlier `42501` did not recur. The
rollback assertion then failed safely because PostgreSQL 17's
`information_schema.table_constraints` included generated NOT NULL constraint
names in addition to the declared constraints. Its transaction rolled back;
the branch was deleted and its absence verified. Production was not used as the
SQL target.

The assertion now uses `pg_constraint` joined to `pg_class` and `pg_namespace`
for the three exact declared-constraint sets. This revision has not yet run. A
fresh disposable `r3` branch must repeat 13/13 apply and pass the complete
same-request assertion before this gate can pass. There is still no
payload metadata/grant, vault/KMS/retention decision, purge outbox,
provider-evidence detail store, transaction-clock scheduler,
claim/heartbeat/fence/commit/settle RPC, registered worker, model/STT call,
Points call, runtime flag or Production change. Those remain separate
activation gates, not hidden defaults in this schema.
