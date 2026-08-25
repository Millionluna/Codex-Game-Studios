# Portal-first release checkpoint

Date: 2026-08-25

Branch: `codex/careslink-ai-portal-referral-intake-v1`
Base HEAD inspected: `6067782bbe2a23c4dafb59ba812f977cb2524cd0`

Current five-Note local batch base: `63c10ea2e94ee4efdba7ffdbeb5aabbee6fcfa3b`

Current durable generation local batch base: `4bf34ee0955a958c64e6865faa8bde2f2d1664a7`

Current registered-worker adapter local batch base: `ec30b9342164d893f096cc0942b09d64fd457a73`

Historical r9 disposable database assertion gate HEAD:
`c7b70e9f84b9b804779039711b85cc7eda55bd57`

Historical r21 Attempt-2 historical-replay gate base HEAD:
`000f17af88eff9266a92e484ba2080335d20fd2d`

Current worker RPC shadow migration source:
`20260821071044_add_v1_note_generation_worker_rpc_shadow.sql`

Current registration-retention hardening source:
`20260823213144_harden_v1_note_generation_registration_retention.sql`

Current registration-retention hosted gate HEAD:
`4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf`

This checkpoint covers the AI Web Portal reality audit, release sequencing,
local Referral foundation and default-off intake/source-detail/Assignment M1a runtimes, plus source-only
five-Note generation contracts. It
does not modify the native App, Main Website, Native Auth/M0 implementation or
served shared Product API routes. Those are prerequisites recorded in the
existing versioned contract documentation. All new Referral and Note
generation capabilities remain local, default-off, Production-unapplied and
absent from retained Preview runtime. The private worker RPC migration passed
the isolated PostgreSQL 17.6 migration/assertion gate on deleted disposable
`r9`; deleted no-data `r20` subsequently passed its PostgreSQL 17.6 true
two-session claim/session/privacy race gate, and deleted no-data `r21` passed
the Attempt-2 historical-replay gate on PostgreSQL 17.6. Deleted no-data `r22`
then passed the exact 15-migration registration-retention gate. None is a
runtime apply. A subsequent disposable local PostgreSQL 16.15 run closed the
current database-engine, serial and true-two-session version gate under a
minimal Supabase-compatibility bootstrap; it was not a Preview or Production
runtime apply and is not full hosted Supabase parity.
Disposable Preview databases were used only for the isolated gates recorded
below and then deleted; no Preview application deployment or Production
database was used as the SQL target.

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
| `/referrals`, `/referrals/intake`, `/referrals/[id]`, match page | legacy mock remains default; default-off durable intake, exact-tenant source detail and operator Assignment M1a exist | List/create/source-detail plus operator queue/detail/triage/candidates/offer behind independent gates; not deployed | Gate-on assignment pages have no mock fallback and offer does not assign/accept; provider response, follow-up and audit remain disabled | Validate the exact four-gate revision on an approved disposable Preview before enabling one role surface at a time |
| `/referral-source-portal` | legacy mock remains default; source-only intake controls are wired and the UUID detail page has a separate gate | List/create/detail only behind independent gates; not deployed | No hosted runtime or activation; the operator slice is independently gated and provider/later workflow actions remain unavailable | Reuse the database-authorized source slice after exact-revision Preview approval |
| `/referral-workspace/*` | mixed real access/material/outreach stores | Yes, for those tools | These are AI access and outreach tools, not the referral pipeline; some stores have memory fallback | Preserve and later link by canonical referral ID |
| `/admin`, `/dashboard` | mock global metrics | No | Core pages have no real referral permission gate; must not receive real data yet | Add membership gate, then replace only the assignment queue |
| Admin access requests/material usage | real/mixed | Yes | Manages AI access/metadata, not providers or referrals | Reuse its auth-first action pattern, not its business schema |
| `/plan-and-usage` | legacy credits | Read-only | Runtime is still 3 legacy credits although the 300-Point/Pro product baseline is approved | Do not show both systems; implement and reconcile the approved wallet before cutover |
| NDIS Case Note | real legacy server flow plus local shared-job evidence | Legacy generate/save only | Uses synchronous model and old credits; the new shared job is source-only and does not call it | Preserve legacy; keep the shared provider and canonical write default-off |
| Other four Note types | catalog plus local shared-job/durable/RPC source evidence | No | Communication, Handover, Progress and Incident Factual share the dispatcher/output boundary, default-off durable contracts and the Production-unapplied private RPC source, but have no retained/applied runtime repository, registered/deployed worker, served route, real provider or golden safety set; PostgreSQL 16 engine/serial/two-session compatibility is now locally proved | Complete the remaining reviewed runtime boundaries, then validate each type without forking orchestration |
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
shared Product API contract. The current intake/detail/assignment work adds only a
Web-cookie Portal route/database slice and does not alter those shared Product contracts, native
routes, flags or grants. In particular:

- the existing workspace fallback role resolver is not authoritative for the
  new Portal roles;
- native redirect allowlists and the current Preview base URL remain absent;
- Product API operation flags remain default-off and document write grants
  remain withheld;
- the current intake, source-detail and assignment slices are deliberately Web-cookie-only and reject Bearer;
  `/v1/me`, current-session proof and cookie/Bearer identity parity remain a
  separate gate before any App/shared-Product handoff.

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

The foundation and intake migrations grant no Portal table read/write privilege
to API roles. The intake migration adds only authorize, source metadata list and
atomic create as `SECURITY DEFINER` functions with `search_path=''`; it revokes
`PUBLIC`, `anon` and `service_role`, then grants only `authenticated` execution.
Create writes the referral, separately protected contact, audit and receipt in
one transaction. All other state-changing operations and their execute grants
remain absent.

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
- Portal cookie resolves to the current database principal/member; App Bearer
  parity remains required before an App/shared-Product handoff;
- invalid route ID is not found, never fixture fallback.

### Rollback points

- app, operation and database gates all default off;
- migration is additive and does not import mocks or mutate legacy rows;
- the narrow authenticated RPC grant is inert while app and database gates
  remain off; activation requires a separately reviewed flag/deployment change;
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
- Production-unapplied Portal referral foundation migration, clean-applied and
  assertion-tested only on deleted disposable Previews, with RLS and all writes
  withheld;
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

The original Portal assertion revision ran on deleted disposable `r3` and
rolled back when its pre-privacy canonical revision fixture hit the current
privacy trigger. At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`,
the privacy-bound repair passed that trigger on fresh deleted disposable `r4`
as part of the complete six-suite cross-domain assertion gate. At that
historical checkpoint this closed the Portal schema/assertion gate only; it did
not provide callable state-changing RPCs or enable the Portal workflow.

## 7. Disposable Preview entry criteria

Do not provide a base URL to App/Main until all are true at the same revision:

1. a fresh disposable non-Production Supabase branch is identified and approved;
2. the exact current migration set clean-applies;
3. transactional assertions and ACL/RLS/SECURITY DEFINER negatives pass;
4. Source A/B, Provider A/B, platform-admin and revoked-session fixtures prove
   organization, provider, contact and child-row isolation;
5. intake create/list replay, conflict, atomicity and lock behavior pass against
   the exact database implementation; later stale-version and competing
   accept/decline gates remain separate because those RPCs are still absent;
6. the Web cookie path passes through hosted GoTrue/PostgREST; App Bearer parity
   is added and proved separately before any App handoff;
7. cleanup returns test users, sessions and Referral rows to zero;
8. Referral flags, Product writes, AI, Points, billing and sync push remain
   disabled until a separately reviewed exact-revision activation/deployment.

The historical protected Preview evidence remains useful but does not satisfy
these exact-current-revision gates and is not Production approval.

## 8. Portal Referral intake source/local runtime — 2026-08-25

This batch replaces only Referral-source intake create/list in source. The
runtime requires all three application gates, `VERCEL_ENV=preview`, an exact
non-Production Supabase ref and the separate database flag. It uses a
request-scoped cookie session client, rejects Bearer authorization and never
creates a service-role client. Authorization is resolved before private body
parsing. The UI keeps private inputs disabled until the metadata GET proves the
current database authorization; a later 401/403/503 invalidates that
preauthorization and prevents repeated private submission.

The migration removes only the prior constraint that forced `enabled=false`.
The column default and existing capability row remain false and
`preview_only=true` remains enforced. Authorize, list and create are
`SECURITY DEFINER` functions with `search_path=''`, executable only by
`authenticated`; `PUBLIC`, `anon` and `service_role` remain revoked, and no
direct Portal table privilege is granted. The database revalidates the current
Auth user/session and exactly one active referral-source membership in an active
referral-source organization. Once every potentially blocking authorization
lock is held, it refreshes wall-clock time and repeats the complete Auth
session/user eligibility predicate. Create recomputes the canonical payload
hash with that database-derived actor and atomically writes referral, private
contact, audit and receipt rows. List is source-tenant scoped and metadata-only.
Triage, offer, response, follow-up, detail and audit remain disabled.

The frozen disposable-local PostgreSQL 16.15 gate clean-applied 30/30
repository migrations and passed 10/10 explicit-rollback suites plus the
independent zero-fixture/default-off/ACL/owner/role-edge postcheck. The Portal
migration SHA-256 was
`5a98154b254050b3140f5f185d52e3ff7e070da05fbdfa99dbdd60665b382e1c` and
the Portal assertion SHA-256 was
`206ba671f2960ab9eb88552092975eeb9caddc302dbcedf2bacc5d65819ad666`.
All eight true two-session cases passed: same-key replay, same-key changed-body
conflict, session expiry after advisory-lock waiting, capability-flag,
Auth-session, membership and organization writer blocking, plus the exact
Auth-session lock wait across `not_after`. That final caller received
`PORTAL_SESSION_REVOKED` and wrote zero referral, private-contact, audit or
receipt rows. Exact cleanup restored both append-only triggers and removed
every fixture; the full postcheck passed again, the server stopped and the
temporary cluster was deleted with no matching local root retained. Existing
generation-owner migrations used atomic temporary-visibility wrappers under
the minimal local bootstrap; their final privilege/role-edge posture passed
independently.

This is source and disposable-local-PostgreSQL evidence only. It does not claim
a hosted GoTrue/PostgREST cookie E2E, hosted Preview or Production migration,
deployment, flag activation, retained business row, model call or paid runtime
resource. No Preview URL may be handed to the App or Main Website until the
remaining entry criteria above pass on the exact served revision.

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
types, but it remains inert and Production-unapplied. The first three disposable
attempts exposed and safely isolated one hosted-role issue, one PostgreSQL 17
catalog-assertion issue and one stale Portal privacy fixture. The fourth
disposable attempt passed the exact schema/cross-domain assertion gate. The
broader served Preview and activation gates have not passed.

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
and its absence verified. Production was not used as the SQL target, and no
Production migration, deployment, capability or grant was changed. This is
failure/cleanup evidence, not successful Preview evidence.

The then-current source repair changed the dedicated owner's global defaults
inside a temporary `SET ROLE` window, used `RESET ROLE` before object creation,
and performed the only schema revoke before ownership transfer. The later
2026-08-25 Hosted role-restoration gate superseded that unsafe exit with an
explicit restore to the captured file-entry actor. On the second historical
branch, all 13 exact source migrations applied successfully and the earlier
`42501` did not recur. The
rollback assertion then failed safely because PostgreSQL 17's
`information_schema.table_constraints` included generated NOT NULL constraint
names in addition to the declared constraints. Its transaction rolled back;
the branch was deleted and its absence verified. Production was not used as the
SQL target.

The assertion now uses `pg_constraint` joined to `pg_class` and `pg_namespace`
for the three exact declared-constraint sets. On a third fresh non-default
`with_data=false` PostgreSQL 17 branch, all 13 exact source migrations applied
in order and that complete same-request durable assertion passed. Post-rollback
checks also passed the dedicated role topology, forced RLS, default ACL and
privilege-denial contract; the sole settings row remained forced off, all
generation/Auth/session/privacy/assertion fixture counts returned to zero, and
no policy, function, view, non-internal trigger or API/executor privilege was
present in the private schema. Security and performance advisors reported no
generation-schema warning/error: only the expected informational RLS-with-no-
policy and zero-row unused-index findings remained.

The first four adjacent rollback suites—V1 shadow, NDIS integration, mobile
sync and privacy review—also passed on `r3`. The fifth, Portal Referral, failed
with `VALIDATION_ERROR` because its older canonical-revision fixture lacked the
current privacy proof/facts binding; its transaction rolled back. Thus the
complete cross-domain gate was still open at the end of the third attempt. The
`r3` branch was deleted and its absence verified. Production was not used as
the SQL target, and no deployment, runtime flag or API/executor grant was added
or enabled.

### Fourth disposable Preview attempt (`r4`)

At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`, fresh branch
`careslink-note-durable-preview-20260821-r4` was non-default,
`persistent=false`, `with_data=false` and PostgreSQL 17, with parent default
`adocsnwnslxhxcjgbyee`. Its id was
`ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b` and its project ref was
`czqdjqdjghmmzukstprt`. The same 13-file manifest clean-applied 13/13. The
durable assertion and all five adjacent suites then passed 6/6, including the
privacy-bound Portal Referral fixture against the current trigger.

Post-rollback checks passed the recorded zero-row matrix across Auth/session,
legacy, canonical, sync/NDIS, Points/migration, Portal, generation and assertion
fixtures while retaining only expected forced-off seed/catalog rows. Both
generation roles retained the reviewed non-login, non-privileged topology; all
three generation tables retained RLS plus FORCE RLS; the private schema had zero
policies, functions, views, non-internal triggers and API/executor privilege
leaks. Generation, Portal and mobile-sync flags remained disabled and
shadow-only. Generation-scope advisors reported exactly three informational
no-policy and seven informational unused-index findings, with zero
warning/error.

The exact `r4` branch was deleted. Subsequent branch listing contained neither
its id nor ref, while parent default `adocsnwnslxhxcjgbyee` still existed.
Production was not the SQL target, and no Production action, migration,
deployment, capability/flag change or grant occurred. This closes only the
schema/cross-domain assertion gate; it does not implement or enable an RPC,
worker, model/STT call, Points settlement or user flow.

At that `r4` foundation checkpoint there was still no payload metadata/grant,
purge outbox, provider-evidence detail store or worker RPC source. The next
section records the later source addition; it does not retroactively turn the
deleted-`r4` result into evidence for that revision. Vault/KMS/retention,
registered worker, model/STT, Points and runtime capability remain separate
activation gates, not hidden defaults.

## 15. Durable Note worker RPC shadow source — 2026-08-21

Supabase CLI generated
`20260821071044_add_v1_note_generation_worker_rpc_shadow.sql`. It extends the
same private generation schema with nine metadata tables for policy catalogs,
registration bindings, payload/grant lifecycle, provider evidence and purge
outbox, plus nine exact private RPC identities: claim, heartbeat, fence,
success commit, failure settlement, attempt resolution, expired recovery,
payload authorization and payload consumption. Communication, Handover,
Progress, NDIS and Incident Factual all use this one versioned database
contract; no type receives a separate scheduler or settlement path.

The implementation is deliberately inert. It seeds no catalog, registration
or payload, and the database settings capability remains hard-off. All twelve
private tables use RLS plus FORCE RLS. The distinct executor is non-login,
non-superuser and non-`BYPASSRLS`; its exact `SECURITY DEFINER` functions have
empty `search_path` and only the minimum underlying object access. No API role
or `service_role` receives RPC `EXECUTE`, so there is no Data API or deployed
worker entrypoint.

The source implements database-time leases/recovery, fresh Auth/session and
privacy-proof checks, immutable worker/provider/payload bindings and composite
validated success/failure/replay acknowledgements. Canonical success is designed
as one transaction that binds revision 1, sync change, mutation receipt,
provider evidence, terminal state, payload logical revoke and purge enqueue.
The assertion locks exact top-level envelopes, allowlisted nested fields and
persisted-row relationships, plus injected rollback failures. The TypeScript
adapter is stricter about nested exact keys; matching database vectors remain
an activation gate. The older foundation assertion is now additive-aware so it
can retain its three-table invariants after the extension; the worker assertion
owns the extension's exact tables, policies, functions and ACLs.

Vault/KMS/retention is not decided. Normal payload consume therefore always
settles `DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE` and cannot return a
`vaultGrant`, locator or facts. A direct `CONSUMED` metadata update appears only
in the rollback-only SQL assertion as a `TEST_ONLY` bridge for canonical
transaction atomicity. It is not a vault, payload-consume, purge or
account-deletion E2E test.

Pre-r9 local source evidence at exact commit
`5692ddc0427cba10f5311071fdea6c886ef13d2d`:

| Command | Result |
|---|---|
| adjacent Note generation tests | 10 files / 348 tests passed |
| `pnpm test` | 122 files / 1,331 tests passed; preserves 121 / 1,294 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

The later `r9` result below closes the exact PostgreSQL 17.6 clean-apply,
rollback-assertion, role/ACL/function and post-rollback zero-matrix gate; it is
not Production or runtime evidence. At that checkpoint, activation still
required the PostgreSQL 16 path, owner A/B runtime integration and true
two-session/two-connection `SKIP LOCKED` claim plus session/privacy-revocation
races. The later `r20` result below closes only that PostgreSQL 17.6 race
subset, and the later `r21` result closes the Attempt-2 historical-replay
subset.
Account-delete/purge cross-state recovery remains unproved. Before catalogs can
be populated, governance must either make registration/catalog rows append-only
for the lifetime of every referencing attempt or add and prove a reviewed
`RESTRICT` attempt registration foreign key plus index. Before real provider
work, provider `startedAt` must bind to a consumed grant with post-consume
lease/heartbeat freshness; before trusting an executor caller, JSON numeric
parsing needs sequential type/regex/safe-cast hardening. No route, model, STT,
Points, deployment, Production change or user traffic is authorized by this
checkpoint.

## 16. Durable Note worker RPC isolated PostgreSQL gate — 2026-08-23

At source HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, disposable
`r9` (`v1-note-worker-rpc-r9`; id
`a1571c30-a322-4cea-b332-b189804df195`; ref
`hyczevivoakmflswmwlb`) was non-default, `persistent=false`,
`with_data=false` and PostgreSQL 17.6 under parent default Production project
`adocsnwnslxhxcjgbyee`. The exact 14 migrations applied 14/14; the five
adjacent, durable and worker rollback suites passed 7/7.

The independent postcheck passed all 12 generation-table owner/RLS/FORCE-RLS
checks, hard-off flags, exact non-login/non-superuser/non-`BYPASSRLS`/
non-inheriting roles, denied API table/RPC ACLs and nine executor-only
`SECURITY DEFINER` RPCs with `search_path=''`. Auth, canonical, generation,
catalog/registration, payload/grant/evidence/outbox, Points and Portal fixture
rows were zero. Security advisors returned 26 global findings (23 INFO + 3 WARN
for pre-existing public `get`/`list`/`pull` functions; [remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable))
and zero generation findings. Performance advisors returned 155 global findings
(144 INFO + 11 WARN); generation scope was 20 INFO—14 [unindexed composite
foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and 6 [unused fresh indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)—with
zero WARN/ERROR. Independent review reported P0/P1/P2(delete) = 0.

Earlier worker attempts did not become evidence: `r6` stopped on MCP
approval/transport infrastructure at migration 6; `r7` reached 14/14 plus six
suites before a restricted-executor raw-content assertion failed with `42501`
and was repaired assertion-only at `78f1dd3`; `r8` reached the same point before
a stale pre-commit attempt fixture exposed `finished_at=NULL` and was repaired
assertion-only at `c7b70e9`. Each branch was deleted rather than repaired in
place. After the successful gate, `r9` was exactly deleted and its ID/ref were
absent; the Production parent remained the default branch and healthy, and was
never the SQL target.

Local gates at that HEAD passed 122 files / 1,337 tests, TypeScript, full lint
and Next static generation 63/63. There is no retained Preview, caller grant,
runtime repository/worker, model/STT, vault/KMS/retention implementation,
Points settlement or user-flow evidence. Normal consume remains
`DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE`; at the `r9` checkpoint, true
two-connection claim and session/privacy-revocation races remained a hard
activation blocker.

## 17. Durable Note worker RPC true two-session PostgreSQL 17 gate — 2026-08-24

Disposable no-data `r20` used the Supabase Session Pooler with strict verified
client TLS to hold two persistent PostgreSQL 17.6 sessions with distinct
backend PIDs. A temporary least-privilege runner then passed all three live
races: one `CLAIMED` plus one prompt `IDLE` result under `SKIP LOCKED`, session
revocation winning before authorization, and privacy authorization locking
before revocation so the later consume failed closed. The denial paths created
no canonical rows.

Management-plane cleanup committed runner `NOLOGIN`, drained only the exact
idle pooler backends, removed the fixed fixtures/support schema/runner and
passed an independent zero/posture postcheck. Security advisors were 26 global
findings with zero in generation scope. Performance advisors were 133 global
findings and 18 generation INFO with zero generation WARN/ERROR and zero
concurrency-specific findings. The branch was deleted; Production was never
the SQL target and remained `ACTIVE_HEALTHY`.

This closes only the PostgreSQL 17.6 true two-session claim/session/privacy race
gate. Deleted `r21` below subsequently closes Attempt-2 historical replay;
PostgreSQL 16, owner A/B runtime integration and the existing
catalog/envelope/purge/provider/vault governance remain open. No caller grant,
retained Preview, runtime worker or Production capability was created.

## 18. Durable Note worker RPC Attempt-2 historical replay gate — 2026-08-24

At base HEAD `000f17af88eff9266a92e484ba2080335d20fd2d`, the exact
rollback assertion body had SHA-256
`bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`
and was 146488 bytes. Disposable PostgreSQL 17.6 branch `r21`
(`v1-note-worker-rpc-r21`; id
`688da83b-78e8-45fa-8646-b015822d59b0`; ref
`kfgjxlilotpaxnozomqq`) was non-default, `persistent=false` and
`with_data=false`. Its confirmed Preview creation rate was US$0.01344/hour;
because the branch was deleted, no ongoing charge or accrued total is inferred.
All 14 migrations applied 14/14 and the adjacent, durable and worker rollback
suites passed 7/7.

The fixed two-attempt scenario proved exact Attempt 1 settle/resolve replay
while Attempt 2 was `RUNNING`, again after Attempt 2 reached `SUCCEEDED`, and
again after both payload and purge outbox reached `PURGED`. Attempt 2 success
commit and resolve replayed their exact acknowledgements; a fully valid stale
Attempt 1 commit failed with `LEASE_EXPIRED`; expired recovery returned zero.
Before Attempt 2 succeeded those directed side effects were absent. After
success, every subsequent replay and purge stage retained exactly one canonical
document, revision, sync change, mutation receipt, provider-evidence row and
purge-outbox row.

The independent postcheck retained the hard-off setting, zero fixtures, all 12
private generation tables, all nine private worker RPC identities, denied API
table/RPC access and the two admin-only role-creator membership edges. Security
and performance advisor results were unchanged from deleted `r9`, including
zero generation security findings and zero generation performance WARN/ERROR.
The exact `r21` branch was deleted; Production remained the default healthy
parent and was never the SQL target.

This closes the Attempt-2 historical-replay gate only. At this `r21`
checkpoint, PostgreSQL 16, owner A/B runtime integration, catalog retention,
nested exact-key database vectors, account-delete/purge recovery,
provider-start binding, sequential numeric parsing hardening and the real
runtime/vault boundaries remained activation blockers. No caller grant,
retained Preview, runtime worker, route, model/STT, Points or Production
capability was created or authorized.

## 19. Durable Note registration historical-retention source and r22 gate — 2026-08-24

Supabase CLI 2.115.0 generated the fifteenth migration in the reviewed local
worker manifest,
`20260823213144_harden_v1_note_generation_registration_retention.sql`. It adds
the exact child index `attempts_registration_digest_idx` on
`careslink_v1_generation.attempts(registration_digest)` and the exact validated
foreign key `attempts_registration_catalog_fk` from that column to
`careslink_v1_generation.worker_registrations(registration_digest)`, with both
`ON UPDATE RESTRICT` and `ON DELETE RESTRICT`. The migration creates the
referencing index first, adds the constraint `NOT VALID` so new orphans fail
closed immediately, and then validates all existing attempt history.

The current BEGIN-through-ROLLBACK worker assertion body is 153956 bytes with
SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`.
It now locks the exact constraint/index catalog posture and proves that both a
registration-digest rewrite and deletion of a registration referenced by a
historical terminal attempt fail on `attempts_registration_catalog_fk` without
changing the retained rows. The current durable-foundation assertion body is
37547 bytes with SHA-256
`2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`;
it adds only the minimum transaction-local registration fixture required by the
new foreign key.

The local gate passed all three focused migration contracts (39/39), the full
125-file / 1,381-test suite, lint, TypeScript, the 63/63-page Next production
build, the 73-file Codex-adapter sync check and `git diff --check`. That local
result alone was source evidence; the separate hosted apply follows below.

These current bodies subsequently received the hosted `r22` evidence below.
For historical separation, deleted `r21` still proves only its earlier 14/14
manifest and 7/7 rollback suites with the 146488-byte worker body, SHA-256
`bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`.
Deleted `r9` still proves only its historical 14/14 manifest and 7/7 rollback
suites with the earlier 36467-byte durable-foundation body, SHA-256
`3bd571e8447cbedd838251339e273877a25decaa582a538f0d7049319504bab0`.
Neither historical gate included the fifteenth migration or the current
assertion bodies.

At source HEAD `4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf`, disposable
PostgreSQL 17.6 (`server_version_num=170006`) branch `r22`
(`v1-note-worker-rpc-r22`; id
`0bc8db56-0e4a-42ec-9595-1f32a3d74a6b`; ref
`wuzcjcfrkctelcnbbgtg`) was non-default, `persistent=false` and
`with_data=false`. Its confirmed Preview rate was US$0.01344/hour. The exact
15-file manifest applied 15/15, and the five adjacent, durable-foundation and
worker rollback suites passed 7/7 using the exact 153956-byte worker and
37547-byte durable bodies recorded above.

The independent postcheck retained exactly 12 private generation tables, nine
private worker RPC identities, the hard-off setting, zero checked business,
catalog, registration, grant, evidence, outbox and fixture rows, denied API
table/RPC access and only the two expected admin-only creator membership edges.
It also confirmed the validated `attempts_registration_catalog_fk` with exact
`ON UPDATE RESTRICT` / `ON DELETE RESTRICT` actions and the exact
`attempts_registration_digest_idx`. Security advisors returned 26 global
findings (23 INFO + 3 pre-existing WARN) and zero generation findings.
Performance advisors returned 155 global findings (144 INFO + 11 WARN), with
20 generation INFO—14 unindexed composite-foreign-key findings plus six unused
fresh-index findings—and zero generation WARN/ERROR.

The exact `r22` branch was deleted, and its ID and ref were absent afterward;
Production remained the healthy default and was never the SQL target. The
confirmed hourly rate is creation evidence only, and no accrued total is
inferred. This closes only the hosted registration historical-retention gate.
PostgreSQL 16, owner A/B runtime integration, nested exact-key database vectors,
account-delete/purge recovery, provider-start binding, sequential numeric
parsing and all real vault/runtime/activation gates remain open. No retained
Preview, deployment, caller grant, runtime flag or capability was created.

## 20. Durable Note PostgreSQL 16.15 local isolated gate — 2026-08-24

The `r22` conclusion above remains the state at that historical hosted
checkpoint. A later worktree based on HEAD
`93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea` used a disposable Homebrew
PostgreSQL 16.15 server with exact `server_version_num=160015`. The clean
repository path applied 27/27 migrations: 12 pre-V1 migrations plus the exact
current V1 manifest 15/15. The five adjacent suites and the durable-foundation
and worker rollback bodies passed 7/7. Those current bodies were the 37547-byte
durable assertion at SHA-256
`2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`
and the 153956-byte worker assertion at SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`.

The independent postcheck retained exactly 12 private generation tables, nine
private worker RPCs, the hard-off setting, zero checked fixtures, denied API
access and only the two expected admin-only creator edges. It also proved the
exact validated registration-retention foreign key and its exact referencing
index.

The strict local-only concurrency harness opened two independent backend PIDs
against loopback `127.0.0.1:55432`, with no TLS, password or credential
material. It passed 3/3 `SKIP LOCKED`, session-revocation-first and
privacy-authorization-first races. Fixed setup and cleanup bodies had SHA-256
`ba183bacf8b35a2493b520563ce2fe2d1193e0638af17d2be62c8b58076112bc`
and `e4aa567f372885137f2b0251f51ea1818a5ca329ec9ed8a9a9f8355cc3ecbecb`.
The two focused harness/policy files passed 59/59; the complete Preview E2E
policy suite passed 3 files / 72 tests. Fixed SQL cleanup removed the database
runner, `TEST_ONLY` helper surface and fixtures. The outer gate then stopped the
server and deleted the exact cluster directory, Colima profile and Colima disk.
The complete current source handoff also passed 125 files /
1,400 tests, TypeScript, full lint, the 63/63-page Next production build and the
73-file Codex-adapter sync check.

Supabase CLI 2.115.0 accepts local `db.major_version` 13, 14, 15 or 17, but not
16. This gate therefore used vanilla PostgreSQL 16 plus only the minimum
Supabase-compatible roles, Auth stubs and `pgcrypto` surface needed by the
repository migrations. It closes the current PostgreSQL 16 database-engine,
serial and true-two-session compatibility gate. It does not prove GoTrue,
PostgREST, `supautils`, Advisors or hosted Supabase parity.

The worker-half owner A/B adapter-to-database boundary is closed below. At this
checkpoint the owner admission/enqueue/status/cancel repository remained open;
its later source/local-SQL closure is recorded in section 22. Attempt listing,
nested database exact-key vectors, account-delete/purge and orphan recovery,
provider-start binding to a consumed grant with fresh lease/heartbeat, safe
sequential numeric parsing, vault/KMS/retention, worker credentials, hosted
Auth/Data API, model/STT, Points and runtime activation remain open.
Production was never a target; no retained Preview, deployment, caller grant,
runtime flag, capability or paid resource was created.

## 21. Registered-worker owner A/B database integration boundary — 2026-08-24

The current batch closes only the worker-half owner A/B adapter-to-database
boundary. The existing `TEST_ONLY`, default-off registered-worker adapter is
connected through `note-generation-registered-worker-postgres.server.ts` and an
explicitly injected server-private query port to the current nine private worker
RPC identities. The port creates no connection, environment lookup, role or
grant. Database-owned owner/session/privacy and job relationships remain
authoritative, while cross-owner
job/attempt/payload/grant/lease composition fails closed and acknowledgements
remain metadata-only.

This does not make the five-Note service usable. At this worker-half checkpoint,
the durable repository still lacked owner admission/enqueue, owner-safe status
and cancellation; section 22 records the later source/local-SQL boundary.
Attempt listing remains absent. There is also no caller credential or grant,
runtime registry, scheduler, served job route, payload vault, provider/model/STT
traffic, Points settlement, deployment or Production schema apply. Application
readiness and the Production/default database setting remain off; only the
disposable TEST_ONLY window temporarily enabled its private local setting, and
cleanup restored hard-off.

The remaining implementation sequence is database exact-key and safe numeric
parsing hardening; account-delete/purge and orphan recovery; approved
vault/KMS/retention, worker credential and provider/model policy decisions;
real consume plus provider-start/lease freshness; then attempt listing, caller
grant/route, registry and scheduler. A same-revision protected Preview and
explicit activation approval remain later gates, with Points only after a usable
canonical revision exists.

The gate ran from source base
`ec29430dec7a79c611a552a52e36277e3512166e` on disposable vanilla PostgreSQL
16.15 at passwordless loopback `127.0.0.1:55432`. The current migrations applied
27/27 before fixed setup. Setup/quiesce/cleanup SHA-256 values were
`a2b4ddd54acbbc621aa886b70b1c80dfac56de4b722154f4e9820f16b2aeea7b`,
`e6ea88f8a280626c0059ee3a7e9d131382520630f2a7733d3983e5161f2a4ef0`
and `e490809e3c39cb17d8d407399200743378df2b29d84bbd9da35da0cec18ff203`.
The exact non-superuser runner held no effective application-table or
`TEMPORARY` privilege or owner/executor membership; exact ACLs admitted only
each function owner plus the runner for nine worker RPCs and eight fixed helpers.

The explicit live test passed 2/2: owner A/B success, five cross-owner
capability denials, response-loss resolve without a duplicate commit, privacy
denial before vault access, all nine RPCs observed and unqualified owner
projections A=1/B=1/C=0. The A/B success path used fixed TEST_ONLY consumed
metadata helpers, not a payload vault. The full source tree passed 128 files /
1,425 tests, Preview policy 4 files / 75 tests, TypeScript, lint, 63/63-page
build, 73-file adapter sync and diff checks.

Independent quiesce committed `NOLOGIN`, rejected a new runner connection and
found no runner session. Cleanup committed and independent postcheck reported zero Auth, privacy,
canonical and generation/catalog fixtures, absent runner/helper schema,
hard-off settings, restored PUBLIC `TEMPORARY`, zero unexpected RPC ACLs and 9/9
API/service-role RPC denials. The local server and
exact temporary directory were deleted. No Preview was retained and no
Production, deployment, model/STT, Points or paid resource action occurred.

## 22. Note generation owner repository source/local gate — 2026-08-24

The next owner-repository source boundary is now present without changing the
release checkpoint to active. Production-unapplied migration
`20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql` creates a
dedicated `careslink_v1_generation_owner_api_executor` with `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. It does not reuse the worker
executor and is not a caller credential. The new database-owned
`admission_policy_bindings` catalog is empty by default, the database capability
remains hard-off and no API role, `service_role` or application caller receives
`EXECUTE`.

This catalog selects a policy bundle; it is not a unique-worker allowlist. A
second complete valid Five-Note registration may claim only when its worker,
payload and current Note-type provider policies match the frozen job subset;
its other four provider policies are outside that claim comparison.

Exactly three private `SECURITY DEFINER` RPCs cover admit-and-enqueue,
owner-safe status and cancel. The private
`note-generation-owner-repository.server.ts` adapter is direct-query and
`TEST_ONLY`, with factory-injected authenticated identity. It creates no
connection, pool, environment selection, PostgREST/Data API path, route or
runtime registry entry.

Admission takes its clock, fresh session/privacy authority and exact active
worker/provider/payload selection from the database. An owner-scoped advisory
lock serializes the idempotency lane, and the first acceptance atomically
creates the metadata-only job and available payload. Exact replay is returned
without duplicate work; request or staged identity conflicts fail closed.
Status and cancellation intentionally remain available when new admission is
disabled. Cancellation locks the job first and atomically cancels a running
attempt when one exists, revokes issued grants and payload, enqueues one purge
request and finishes the job. A queued cancellation creates no fake attempt.
No attempt-list API or adapter exists.

The disposable local PostgreSQL 16.15 run applied #1-#24 and the #26-#28 tail
as the non-superuser migration actor, including a fresh exact replay of final
migration #28. Its hand-built minimum
compatibility bootstrap used #25 as a bootstrap-superuser ownership transition;
therefore this is not evidence that all 28 migrations applied as a
non-superuser, and it does not rewrite the earlier historical 27/27 result.
The new owner assertion, additive-aware worker assertion and durable-foundation
assertion all completed through `ROLLBACK`.

Frozen owner assertion evidence is 100936 bytes / SHA-256
`05a3e4b95559981a1919a4dae83157ecef60f7485c1afd76150199a50f7990b8`
for the full file and 100156 bytes / SHA-256
`c8ad3fca9432afa1410807eec38c4c451ba885713a54ddec15149c26f1706bfa`
for the executable body. The additive-aware worker assertion is 158635 bytes /
SHA-256
`a2c1da6c7a94bd43f5a2d93ce7ecdbe5832fad53e2756d0b0cc4dc1d3b0bfe9c`
for the full file and 154903 bytes / SHA-256
`6ed296b0764cf80b13915758209797d2de8b4a247296652f3ea63ad01bd50b94`
for the executable body.
The independent final postcheck confirmed 13 forced-RLS tables, 27 owner
policies, three correctly owned RPCs, 19 direct function `EXECUTE` ACL entries
including those RPCs, hard-off settings
and zero other generation rows. A true two-connection auth-session lock wait
returned `P0001 SESSION_REVOKED` after expiry during the wait.
The final source gate passed 130 test files / 1522 tests, TypeScript, full lint,
the 63/63-page Next production build, the 73-file Codex-adapter sync check and
`git diff --check`.

This checkpoint is source and local database evidence only. It is not a hosted
Preview/Production apply, GoTrue/PostgREST validation, caller grant/route,
deployment, vault consume, model/STT, Points or end-to-end result. Attempt
listing, real vault/KMS/retention and orphan recovery, account deletion, hosted
Auth/Data API, provider/model/STT integration and all activation wiring remain
release blockers. Graceful registration rotation is supplied by the subsequent
source/local-only boundary below; emergency revocation and its in-flight
authority/grant/payload/purge semantics remain a separate blocker.

## 23. Note generation worker-registration graceful-retirement source/local gate — 2026-08-24

Supabase CLI 2.115.0 generated the fifth Production-unapplied generation
migration and repository migration #29,
`20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql`.
It does not add `REVOKED` or rewrite the canonical worker manifest. The
registration remains immutable, digest-bound and `status='APPROVED'`; a new
append-only `worker_registration_retirements` ledger records the separate
operational decision.

The migration adds the distinct
`careslink_v1_generation_registration_control_executor` with `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. Its one private control RPC
accepts an operation UUID, one of the fixed `ROTATED`, `DECOMMISSIONED` or
`POLICY_SUPERSEDED` reasons and the exact unique, sorted set of active admission
binding versions. It locks bindings before the registration, rechecks fresh
state after the lock wait, atomically retires the confirmed active bindings and
inserts one immutable ledger row. Exact replay is write-free; changed operation
input or a stale binding set fails closed.

A committed retirement blocks only new work authority: owner admission and
worker claim reject the registration, and defense-in-depth triggers reject a
new `RUNNING` attempt or reactivated binding. Existing attempts may continue
heartbeat, fence, payload authorization/consume, success commit, failure
settle, resolve and recovery. Recovery can still record terminal `FAILED`
history; owner status and cancellation also remain available. This is graceful
drain, not emergency revocation.

The ledger is the fourteenth private generation table with RLS and FORCE RLS.
The control identity is executable only by its non-login owner. No retirement
row or active binding is seeded, and no API/service/application caller receives
`EXECUTE`; there is no route, credential, registry activation, worker
deployment, Preview retention, paid resource or Production change.

The dedicated
`v1_note_generation_registration_retirement_shadow_assertions.sql` suite has
passed as a strict BEGIN-through-ROLLBACK assertion on the disposable local
PostgreSQL 16.15 harness. Its full file is 50,987 bytes with SHA-256
`0a58b4b6731e48525af4b9eaf395cb4d20bebc4e77baea5c0207b9e2c92f7cbc`;
the exact BEGIN-through-ROLLBACK body is 50,584 bytes with SHA-256
`3c9b1d9cfd0919bdf1213d3272923261cc9399cc88fcdd85e46469c8e026440f`.
It is the ninth current rollback-only suite because the owner suite had already
raised the historical seven-suite inventory to eight. The final clean gate
applied all 29 repository migrations, passed all 9 rollback suites, the
independent 14-table/four-role/hard-off/zero-fixture posture postcheck and both
real retirement-first and claim-first lock orderings. The full application gate
then passed 131 Vitest files / 1,534 tests, TypeScript, lint, 63/63 static-page
generation and the 73-file Codex-adapter sync check. This remains source/local
evidence and does not claim promotion readiness. All earlier `r22` manifests,
assertion identities and hashes remain historical evidence for their recorded
revision and are not rewritten.

## 24. Hosted CLI role-restoration and Portal posture gate — 2026-08-25

The final non-default, `persistent=false`, `with_data=false` Preview was
`hosted-role-restore-r5-20260825` (id
`d68d531a-55e6-4374-be68-494da7542c75`, ref
`eqqlvqqhvsogusqhzuaq`) under Production parent
`adocsnwnslxhxcjgbyee`. Official Supabase CLI 2.115.0 applied the exact 30-file
manifest and passed all 11 rollback suites in one remote reset. This included
the Portal workflow and intake suites after all 31 of their completed role
windows were changed from bare `RESET ROLE` to explicit restoration of the
captured assertion-entry actor.

The separate postcheck retained all five #30 Portal `SECURITY DEFINER`
functions under the migration-entry owner, exact authenticated execution
boundaries, hard-off Portal settings and zero referral, contact, audit and
receipt fixtures. No API or generation-schema `CREATE` privilege leaked to the
transport login or API roles. Portal security advisors reported one INFO and
three WARN findings for the intended authenticated `SECURITY DEFINER` public
functions. Portal performance scope retained 16 unused-index INFO and two
`auth_rls_initplan` WARN advisories; they are recorded optimization work rather
than a role/owner/ACL/RLS failure.

The Preview was deleted and exact id/ref absence was verified. Production was
never a SQL target, and no hosted Auth/Data API E2E, deployment, flag activation,
caller route, retained fixture or ongoing Preview charge resulted.
The deleted-`r5` source snapshot gate passed the 11 direct contract files (162
tests), the full
134-file / 1,657-test Vitest suite, TypeScript, lint, the Next.js 16.2.9 webpack
production build with 63/63 static pages, the 73-file adapter check and diff
checks.

The source follow-up now pins all five #30 Portal function owners by exact
signature inside the maintained Portal-intake rollback suite. Its current
enhanced BEGIN-through-ROLLBACK body is 39,728 bytes with SHA-256
`2255331b99ff6c4ca05b3a79578c6daa601e26662633063aa004f43423e3729f`.
The paired generation-worker suite likewise pins the two #26 reader owners and
has a current body of 162,857 bytes with SHA-256
`1c30fd7a8604ec8a279ac8d8cf00155bf54801ee15d91dc8ecbc7bc9bc9cf859`.
Deleted `r5`'s postcheck remains the historical Hosted proof of those owners,
but `r5` did not execute these enhanced exact bodies. No fresh Hosted exact-
body gate has occurred, and Production has not been touched.

## 25. Portal Referral source-detail source/local runtime — 2026-08-25

The next real user-value slice closes the source intake loop: an authenticated
referral source can reopen one referral owned by its exact organization and see
the private summary/contact originally submitted. It adds no assignment,
provider response, follow-up, audit listing, document/export or Note/Points
capability.

`CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED` is independent from the
intake operation gate. The base API/durable gates, exact non-Production Preview
ref, master database row and new `referral_source_detail_v1` database row must
also pass. The same migration adds a separate `referral_intake_v1` row. Master,
intake and detail remain `enabled=false, preview_only=true`; master+detail cannot
open direct Data API intake, and master+intake cannot open detail. The request
scope stays cookie-only, rejects Bearer before client construction and uses a
detail-specific authorization RPC over the existing fresh session/exact-one-
source-membership context.

The CLI-generated migration
`20260825110251_add_portal_referral_source_detail_runtime.sql` replaces the
private intake gate with master+intake and adds two authenticated-only,
read-only source-detail `SECURITY DEFINER` RPCs with `search_path=''` under the
migration-entry owner. They hold master+detail; the read applies the exact source
organization predicate and returns a strict 9+3 DTO. Cross-tenant, missing and
null identifiers share `PORTAL_NOT_FOUND`; no table grant or referral/contact/
audit/receipt write is added. Adapter, route and browser bind response ID to
request ID; the route strips wider legacy fields. The durable list exposes a
detail link only when its gate is on, and the UUID page strictly parses success,
never parses private error bodies, never reuses prior-ID state and never falls
back to mock.

The focused gate passed 9 files / 214 tests. The full gate passed 136 files /
1,717 tests, TypeScript, lint, Next.js 16.2.9 webpack build with 63/63 static
pages, the 73-file adapter sync check and diff checks. A temporary local
PostgreSQL 16.15 (`server_version_num=160015`) minimum chain executed only the
foundation, intake and source-detail migrations plus both the updated intake and
new detail rollback suites under `ON_ERROR_STOP=1`. Cross-gate direct-RPC denial,
intake create/list/replay, A/B isolation, expired/deleted sessions, revoked
membership, all three flags, owner/ACL/search path, direct-table denial, zero
writes, cleanup and final rollback passed. The temporary server/cluster were
removed.

This source/local gate is not a 31/31 clean repository apply, hosted
GoTrue/PostgREST E2E, retained Preview, deployment or activation. Production
and cloud data were not touched. The following section records the later
Assignment M1a implementation behind its own default-off gate.

## 26. Portal Referral Assignment M1a source/local runtime — 2026-08-25

Assignment M1a is the first real operator workflow slice. It adds a maximum-50
assignment queue, one private operator detail, `SUBMITTED` → `TRIAGED`, exact
eligible-provider candidates and `TRIAGED` → `OFFERED`. A platform admin in one
active PLATFORM organization has global scope; a partner operator in one active
REFERRAL_SOURCE organization has only that source tenant. Zero, multiple and
mixed operator contexts fail closed. Cross-tenant, missing and null referral
IDs share `PORTAL_NOT_FOUND`, and provider eligibility is checked only after the
authorized referral boundary.

`CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED` and database row
`referral_assignment_v1` are independent from intake and source detail. The
base API/durable gates, exact non-Production Preview ref, master database row
and assignment row must all pass. All four Portal rows remain
`enabled=false, preview_only=true`. The cookie-only resolver rejects Bearer
before client creation; every database RPC independently holds master then
assignment and refreshes the exact Auth session/operator authority. Direct Data
API calls cannot open assignment using intake or source-detail flags.

CLI-generated migration
`20260825120908_add_portal_referral_assignment_runtime.sql` adds six
authenticated-only `SECURITY DEFINER` RPCs and four private helpers with
`search_path=''`, no API execution on helpers and no table grant. Candidate and
offer share the same active/approved/capacity/region/service/provider-member
eligibility query. Triage and offer serialize actor+mutation and referral/match
resources, hash payload/idempotency/correlation identifiers, recheck the
session after lock waits and atomically write one audit plus one receipt. Offer
creates or promotes one match but leaves `assigned_provider_id=null`; exact
completed replay survives later provider ineligibility, while a currently
ineligible target remains uniform not-found even if a historical match exists.
No accept/decline, assignment finalization, follow-up, audit list,
document/export or Note/Points capability is added.

The gate-on `/referrals` and `/referrals/{id}/matches` pages use real strict DTOs
and never fall back to mock. Request/response UUID, status, row version, UTC
time, maximum length/count and duplicate checks exist at Supabase, route and
browser boundaries. A→B→A identity generations reject late detail, candidate
and mutation responses. Candidate authorization failures remove private detail;
409 and malformed mutation ACK paths refresh authoritative detail.

`/referrals` remains a shared legacy URL for the source and operator surfaces.
Assignment and source-role UI activation must therefore remain mutually
exclusive for this slice; simultaneous role-surface activation is not approved.

The focused gate passed 9 files / 292 tests; the full gate passed 138 files /
1,821 tests, TypeScript, full lint, the Next.js 16.2.9 webpack build with 64/64
static pages, 73-file adapter sync and diff checks. PostgreSQL 16.15 passed the
minimum foundation → intake → source-detail → assignment chain, the rollback
suite and eleven real two-backend scenarios: same-mutation single side effect,
same-referral single winner, bounded provider locking, and eight `not_after`
expiry checks across Auth, organization/membership, referral, match and provider
lock stages. Expired calls returned `PORTAL_SESSION_REVOKED` before data-derived
errors or writes. The migration/assertion/contract hashes are recorded in
`documentation/tests.md`; all temporary local resources were removed.

This is source/local evidence, not a full repository migration apply, hosted
GoTrue/PostgREST/Auth E2E, retained Preview, deployment or activation.
Production and cloud data were not touched. The next real workflow slice is
provider response M1b—provider-scoped offer list plus atomic accept/decline—only
after a separately approved disposable-Preview validation of this exact M1a
revision.
