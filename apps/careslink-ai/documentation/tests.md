# CaresLink AI Test Evidence

> Evidence date: 2026-08-25. This document separates **Existing**, **Proposed**, and **Gaps**. Passing current tests does not mean Product Baseline V1.0 is implemented.

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
`r5` rows above. No fresh Hosted Preview has executed either enhanced exact
body, and Production has not been touched.

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
but `r5` did not execute the enhanced bodies identified above. A fresh
disposable Preview would be required to create new exact-body Hosted evidence;
that evidence refresh has not occurred and is not being attributed to `r5`.

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
| Portal Referral intake and source-detail runtime | intake/source-detail migration contracts, route/runtime/Supabase/UI tests and both rollback suites | default-off cookie-only list/create/detail; auth-first request scope; independent operation gates; exact authenticated RPC grants; database-derived source tenant; post-lock session revalidation; uniform cross-tenant/not-found detail; strict private DTO parsing; atomic PII-separated create and write-free detail passed source tests. Historical intake evidence includes local 30/30, 10/10, 8/8 two-session and deleted r5 Hosted 30/30/11/11 gates. The later exact source-detail migration has only its separately recorded local evidence; hosted GoTrue/PostgREST and activation remain unproved |
| Runtime isolation | `src/lib/v1/runtime-boundary.test.ts` | audited NDIS routes and the new `/v1` adapter are the only allowed server boundaries; `/v1` remains disabled without explicit adapters |

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
11. Portal Intake/source detail still lack hosted GoTrue/PostgREST cookie E2E and actual Preview activation; triage, offer, provider response, follow-up and audit remain unimplemented.
