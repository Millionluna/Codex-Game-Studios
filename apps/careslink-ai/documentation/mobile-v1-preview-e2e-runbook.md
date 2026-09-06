# Mobile V1 Protected Preview E2E Runbook

This runbook covers disposable, protected Preview verification of the default-off
Mobile V1 Product API. It is not a Production deployment, migration or promotion
procedure.

## Persistent and generated boundaries

- `scripts/preview-e2e/deployment-cleanup-policy.mjs` is the canonical,
  credential-free deployment cleanup policy.
- Generated live harnesses must import or copy that module without reimplementing
  its deadline, retry or horizon rules, execute
  `assertDeploymentCleanupPolicyRegression()` before any filesystem, environment,
  CLI or network adapter, and lock the exact policy file hash.
- This repository contains credential-free Points lifecycle composition, but no
  live adapter host or live harness assembler. The policy API and offline call-site
  tests are not proof that a future generated helper consumed them. Before another
  live run, the assembler must prove the exact import or copied hash and test both
  observation call sites and the request-only retry path for conformance.
- Live harnesses, credentials, machine runtime manifests, ledgers, deployment
  manifests, requests and staging belong only in a newly created `0700` private
  temporary directory. They must never be committed or included in a Vercel
  deployment context.
- The live action must be explicit. A normal repository test must never create a
  Preview, user, grant or database row.

Run the offline policy gate with:

```sh
pnpm test:preview:e2e:policy
```

### Points fixture diagnostics (2026-09-06)

The narrower Points UI verification has durable, credential-free offline modules:

- `points-preview-identity-policy.mjs`: canonical Provider fixture app metadata,
  a fixed parameterized SELECT, and fixed-field boolean diagnostics.
- `points-preview-identity-invocation.mjs`: required, explicitly injected read-only
  adapters; exact disposable-branch re-attestation before and after the query.
- `points-preview-platform-contract.mjs`: Preview-only Vercel 59.5.0 argument
  assembly and top-level deployment response parsing. No CLI execution.
- `points-preview-lifecycle.mjs`: complete control-flow composition using those
  imports, explicit adapter contracts, deadlines and `finally` cleanup. All cloud,
  database and browser effects in its test suite are in-memory simulations.

Run the dedicated offline gate from the app directory:

```sh
pnpm test:preview:points:offline
```

This command cannot create cloud resources or users. It tests injected synthetic
adapters, including the existing migration invocation and cleanup policy. These
modules are not a complete live harness assembler and do not independently prove
the future generated harness imports them. Before any new authorized live run,
lock their source digests and test their actual call sites; do not retype private
variants of their predicates, CLI field mappings or deployment arguments.

The identity invocation consumes an already-created synthetic Auth response in
`{ status, body }` form and the pre-ledgered `expectedUserId`. Its
`readCliOutput(argv)` callback returns pinned Supabase CLI output; the validated
branch converter exposes `pipelineStatus`, not raw `status`. Its
`readIdentityProof({ expectedBranchRef, text, values })` callback must execute the
fixed SELECT once, on the already TLS-verified disposable connection, and return
`{ projectRef, result: { rowCount, rows } }`. Derive `projectRef` from the verified
connection descriptor, never echo the caller's expected ref as proof. The
invocation provides no default CLI, network, connection or credential loader.

Collect Auth and database diagnostics before rejecting an invalid Auth response;
query only the pre-ledgered expected ID, never an ID supplied by that response.
Any branch/connection mismatch, adapter exception or failed predicate stops this
invocation without retries. The lifecycle owner must still clean up in `finally`.
For predicate failures, `PointsPreviewIdentityError.diagnostics` contains only
fixed field names and booleans. Never append the raw response, query arguments,
database errors, email, ID or token. CLI/database transport failures carry only a
fixed checkpoint and code, not fabricated field-level evidence.

Time eligibility uses one materialized database `clock_timestamp()` sample for
confirmation and ban predicates. Auth timestamp strings are checked for format,
not compared with the controller's clock. All nine database fields must be
strictly `true`, with exactly one row and the exact expected field shape. Missing,
null, wrong-role, anonymous, banned or unconfirmed users remain rejected. Fixture
metadata requires both authoritative `app_metadata.role=provider` and the legacy
compatibility field `careslink_role=provider`; user metadata grants no authority.
See the [Supabase Admin Auth contract](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
and [PostgreSQL clock semantics](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

Vercel argument assembly always uses `--target preview`; it never adds the
production-only `--skip-domain` flag or changes to Production to accommodate it.
Runtime/build environment flags contain names only, with values supplied privately
by the owner. CLI output parsing returns private cleanup coordinates, not safe
report data or ownership proof; REST project/team/run/time/protection attestation
is still required. A malformed create response must never trigger another create.

Offline qualification is not a successful Auth session. Subsequent password
login, actual session/RPC proof, refresh/revoke/re-login and two-owner browser
isolation remain unverified until a separately authorized hosted run passes.
The previous second-account rejection had no per-field diagnostics, so clock
skew is a demonstrated script risk, not a proven cause of that specific failure.

### Points lifecycle offline composition (2026-09-07)

`runPointsPreviewLifecycle({ configuration, adapters, clock, signal })` has no
default adapters, credential loading, CLI entry point or automatic cloud action.
The ordinary test command above also runs the lifecycle fault-injection matrix.
It demonstrates orchestration, not actual migrations, session/RPC success, hosted
browser coverage, remote resource deletion or readiness for Production.

The lifecycle executes the canonical cleanup startup regression before its first
adapter or clock call. Before preflight, it verifies the six imported dependency
digests in `POINTS_PREVIEW_LIFECYCLE_SOURCE_PINS` and the caller-pinned digest of
its own file. Configuration also requires a pinned commit/tree, distinct owner
IDs, one run marker, exact project/team and a maximum ten-minute to two-hour
window. Five minutes are reserved for cleanup. The future live host must verify
the source/runtime/upload closure independently; a receipt echoing expected
values is not evidence that the host actually performed the check.

The business sequence is fixed: preflight and CLI version checks; durable private
ledger; one dataless, nonpersistent branch; canonical inventory identity and ready
state; fixed migration receipt; TLS-scoped connection and zero-data proof; two
pre-ledgered user creations and the imported dual-source diagnostics; shadow
balances 62/7; backend receipt; pre-ledgered Preview creation; REST ownership and
URL binding; browser receipt; unchanged-points proof. Invalid identity diagnostics
stop before Points seeding and deployment. Any uncertain create result stops
business work and enters cleanup without a second create attempt.

Every effect is an explicit function listed in `POINTS_PREVIEW_LIFECYCLE_ADAPTERS`.
The host receives deeply frozen input and `{ deadlineMs, signal, timeoutMs? }`.
It must perform real scoped checks when eventually authorized, not return
synthetic receipts. Important contracts include:

- `preflight`: verify commit/tree, upload pinning, protected Preview, disabled
  models and Vercel CLI 59.5.0; the lifecycle separately checks Supabase 2.115.0.
- `migrate`: invoke the reviewed fixed migration runner, returning 46 migrations
  and the pinned manifest digest. The lifecycle does not execute SQL itself.
- `openDatabase`: derive the project ref from the verified TLS connection.
  `readIdentityProof` follows the exact-owner SELECT contract above.
- `runBackendChecks`: require both accounts and all seven exported backend
  checks. `runBrowserChecks`: require all eight exported browser checks.
  Only the owned deployment's REST-attested URL may be visited.
- `getDeployment` / `listDeployments`: return `{ status, body }` management API
  responses, with complete pagination and exact project/team/time scope.
  `deleteDeployment` must return the exact deleted UID. These functions never
  translate HTTP or response-shape failures into transport exceptions.
- `writeLedger`: atomically persist the private recovery record before each
  creation, with no password, token or raw Auth response. IDs are retained only
  in the private ledger, not the sanitized lifecycle result.
- `quiesce`: join outstanding local work and attest a bounded remote acceptance
  horizon. An aborted request alone does not establish that a remote create was
  rejected. An unjoined operation prevents a successful cleanup result.

The injected clock owns monotonic `now()`, bounded `sleep(ms)` and
`arm(deadlineMs, callback)` (returning a timer cancellation function). Adapter
calls are raced against these timers and aborted on timeout. External cancellation
stops business calls; cleanup uses independent signals and the full hard deadline.
A live adapter must honor cancellation and account for late remote acceptance.

Cleanup closes the database gate and revokes sessions, resolves uncertain creates
after the acceptance horizon, verifies deployment ownership, deletes the exact
deployment and gathers three joint ID/marker/window absence observations. Both
GET and paginated list observation calls use the canonical full deadline and
30-second request cap. Only a locally classified `PointsPreviewTransportError`
resets every sample and retries after five seconds; HTTP, scope, shape and
ownership failures do not retry. Unknown create outcomes require either one
owned marker match or a proven empty complete window, never a guessed target.

The remaining independent cleanup steps delete fixture rows and exact users,
verify global Auth/Points zero, close the connection, delete the guarded branch
and observe branch absence three times. Failure in one cleanup step does not skip
the other independent attempts. Private local artifacts may be deleted only when
all cleanup steps and final ledger persistence pass; otherwise retain recovery
evidence. The returned result contains only fixed stages, booleans, cleanup names
and, if available, sanitized identity diagnostics.

Before hosted verification: review and pin this composition, implement and test
the private live adapter host, verify protection/environment/runtime boundaries,
and obtain explicit authorization for the new bounded disposable run. Passing
offline receipts does not authorize that run or resolve the prior hosted failure.

## Required preflight

1. Pin the source snapshot, Node runtime, Vercel API/CLI adapter and Supabase
   client/runtime closure. Reject drift before reading credentials.
2. Prove the Supabase target is healthy, non-default, non-Production and starts
   with zero synthetic Auth, Product API, privacy-review and Points rows.
3. Prove the Vercel target is a protected Preview with no Production alias and
   no new or persisted bypass credential.
4. Persist a recovery ledger before any deployment create, Auth create or
   Product API write. Store only generated identifiers needed for exact cleanup;
   never store passwords, access tokens, request bodies or note text.
5. Require two synthetic users and a guarded, time-bounded write window. The four
   temporary write RPC grants must be enabled and revoked under the database guard.
6. Require de-identified, structurally validated fixtures for all five Note types.

## Deployment cleanup policy

Every deletion observation must jointly cover the durable deployment ID, the
run-scoped marker and the complete project/time-window inventory.

- Pass the full helper API deadline to every observation. The API adapter caps
  each request at 30 seconds; do not add a shorter per-call deadline.
- Retry only a locally classified `VERCEL_API_REQUEST_FAILED`. Before retrying,
  discard every in-memory joint-zero sample and wait five seconds within the
  helper deadline. A request failure is never absence evidence.
- JSON, HTTP, response-shape, identity, ownership, scope and ambiguity failures
  remain fail-closed.
- If the acceptance horizon is one to 999 milliseconds away, first prove the
  teardown reserve is at least one second, then sleep the exact interval. Longer
  waits continue through the bounded-pause path.
- A deployment deletion is terminal only after three complete joint-zero
  observations at least five seconds apart.
- Overall cleanup is complete only after the later public/Auth cleanup and final
  database/global-zero audit also pass.

## Business matrix

The same protected Preview revision must verify:

- exact contract, client-version, correlation and error envelopes;
- two password sessions with authoritative database session proof;
- privacy confirmation, replay and document create/replay for all five Note types;
- owner-B empty list, initial pull cursor `sync.v1:0`, get and cross-owner write deny;
- owner-A patch/replay/conflict/stale-base, checkpoint, aggregate recovery,
  pull/upsert, tombstone/replay and privacy-outbox exclusion;
- close/revoke before guard release, post-gate write denial, logout and revoked JWT
  rejection.

The ledger count `5 documents / 5 privacy proofs / 15 mutation identifiers` is a
coverage summary. Mutation identifiers include success, replay and expected
conflict/deny cases; they are not a claim of 15 committed database mutations.

## Cleanup and recovery

Normal cleanup closes flags and grants, revokes sessions, deletes the exact
Preview, removes test-tagged public rows and Auth users, proves global zero and
then removes all local evidence.

If cleanup fails after the business matrix:

1. Do not rerun the matrix or create another Preview.
2. Keep the ledger and both deployment manifests unchanged.
3. Review and lock a recovery-only harness that cannot deploy, enable grants or
   run business requests.
4. Run exactly one explicit recovery action against the durable identifiers.
5. Declare cleanup complete only after the ledger, primary manifest, recovery
   manifest, request directory and staging directory are all absent.

## Evidence boundary

Record only dates, source/policy digests, fixed safe error codes, aggregate test
counts and zero/absence results. Do not record URLs, project/branch refs, platform
IDs, user/session/document/mutation IDs, emails, run markers, correlation IDs,
tokens, keys, raw fixtures, request bodies or response bodies.

A passed Preview matrix is not Production approval and does not prove native Auth,
Points/Billing, model behavior, cross-device/offline behavior or real-user data
handling.
