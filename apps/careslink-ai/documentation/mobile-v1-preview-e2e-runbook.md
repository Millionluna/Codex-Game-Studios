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
- This repository does not yet contain the live harness assembler. The module is
  therefore the canonical policy API, not proof that a future generated helper
  consumed it. Before another live run, the assembler must prove the exact import
  or copied hash and test both observation call sites and the request-only retry
  path for conformance.
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
