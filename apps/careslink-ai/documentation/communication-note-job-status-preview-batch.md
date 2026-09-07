# Communication Note job-status Preview batch

Batch: `2026-09-07.job-status-read-preview.2`. Locally corrected on 2026-09-07.
Latest Hosted evidence is r2 below: **the fixed migration/Auth/read/cleanup probe
passed and the Preview was deleted**. The subsequent security-advisor collection
failed, so the enclosing lifecycle returned `ok:false`; there is no advisor or
release-gate pass. Historical r1 and local correction records remain distinct.

## Boundary

This batch checks the dedicated read role against Hosted Auth. It creates no
job, payload, privacy review, document, Points wallet or ledger row; invokes no
model; changes no product flag, route, Logo or green UI. There is no deployment.
The source adapter and formal recovery reader remain default-off.

The script does not create, reset, migrate or delete a branch. The operator must
obtain fresh authorization for **one no-data, nonpersistent, nondefault Preview**,
the fixed pinned migration setup, one synthetic confirmed Auth account and the
short-lived roles below. Do not reuse an already-consumed one-time approval.
Production and copied data are prohibited. A parent ref is used only for
control-plane cross-binding; it is never a database/API write target.

The prior fixed transactional migration harness remains responsible for setup.
Use its existing approved disposable-target/reset contract, not arbitrary SQL.
This batch requires exact history `version`, `name` and `statements` for all 47
pinned migrations, plus matching local SQL hashes. A missing or different
history is a failure, not permission to apply migrations automatically.

## Offline preparation

From `apps/careslink-ai`:

```sh
node scripts/preview-e2e/communication-note-job-status-preview.mjs --check
npx vitest run scripts/preview-e2e/communication-note-job-status-preview.test.mjs
npx vitest run scripts/preview-e2e/communication-note-job-status-preview-auth-cleanup.test.mjs
node scripts/preview-e2e/communication-note-job-status-local-pg16.mjs
```

No arguments is also check-only. Invalid arguments fail before reading secrets
or connecting. Check-only pins four relevant source files and 47 migrations;
it does not imply that a remote project has been inspected or passed.

The local runner owns a private Unix-socket-only PG16 cluster. Its existing nine
reader scenarios use a local synthetic Auth/metadata fixture, not Hosted Auth.
Five new scenarios exercise the actual new ACL gate and physical login helper:
successful read cleanup, read failure cleanup, connection failure cleanup, and
rejection of a network error as proof of credential revocation. The role remains
removed even when the last denial assertion fails. Local HBA uses `trust`:
this proves NOLOGIN and membership, **not password authentication or TLS**.
Three additional cleanup scenarios check an already-revoked session, an active
owned session and a real database foreign-key denial. Their Auth API ports are
explicitly simulated with local SQL inside rolled-back transactions; they do
not prove Hosted GoTrue deletion. All 17 local scenarios must pass.
The cluster is stopped and its exact owned temporary directory is removed.

## Authorized input and invocation

The only live mode is `--execute-authorized-preview` followed by exactly:

```text
--expected-branch-ref=<approved 20-character child ref>
--expected-pg-major=17
--ssl-root-cert-path=<absolute, nonsymlink CA path>
--expected-ssl-root-cert-sha256=<independently verified CA SHA-256>
```

Supply a bounded JSON envelope through a **private in-memory stdin pipe** from
the credential/control-plane acquisition step. Never put passwords or Auth keys
in command arguments, shell history, environment variables, files or tool output.
The envelope has exactly these fields:

- `scope`: the batch ID above.
- `observedAt`: UTC ISO time from the fresh control-plane read (at most 60 seconds
  old, never in the future). It is not a caller-supplied substitute for that read.
- `branch`: the existing disposable-target envelope, with `metadata` containing
  `ref`, `parent_project_ref`, `is_default`, `persistent`, `with_data`, `status`;
  and `credentials` containing `REF`, `STATUS`, `POSTGRES_URL_NON_POOLING`,
  `POSTGRES_URL`. Both refs must be the approved child; both statuses must be
  `ACTIVE_HEALTHY`; all three booleans must be false. The existing parser pins the
  expected parent and binds both database hostnames/credentials to the child.
- `auth`: exactly `publishableKey` and `secretKey` from that same child. The SDK
  derives its HTTPS origin from the approved ref, not an input URL. The secret
  key is used only in this server-side probe to create/revoke/delete the synthetic
  account; it is never used as the job-reader credential.

Refresh control-plane evidence if setup took too long. Do not edit the timestamp
to make stale evidence pass. The branch metadata is a trusted operator input,
not cryptographically attested by this standalone script.

## Fixed sequence

1. Verify source pins, target and pinned-CA TLS. Use direct port 5432, falling
   back to session-pooler 5432 **only** for a direct network-unreachable error.
   Never fall back after TLS/auth/permission errors and never use transaction
   pooling. Verify `postgres` identity, PG17, exact migration history, empty
   Auth users/sessions, absence of runtime roles, and acquire the batch advisory
   lock. Check actual wrapper body, definer/search path and exact role ACLs.
2. Create one random `@example.invalid` confirmed synthetic user, trusted
   `app_metadata.role=provider`, with a random in-memory password. Sign in with
   password; verify claims and user with Auth; invoke the zero-argument
   `resolve_v1_current_session_status` as that user's JWT; cross-check its real
   `auth.sessions` row. No email is sent.
3. For each read create a fresh
   `careslink_v1_job_status_runtime_<16 hex>` login: SCRAM verifier, at most 90
   seconds validity, connection limit 1, NOINHERIT, NOBYPASSRLS, no elevated role
   attributes. Grant only caller membership (ADMIN false, INHERIT false, SET
   true). Confirm the real session identity before `SET ROLE`. The executor,
   direct tables, generic reader and cancellation RPC must remain inaccessible.
4. An active owner/session reading a random missing job must return precisely
   `P0001 NOT_FOUND`; a mismatched owner/session must return precisely
   `P0001 SESSION_REVOKED`. Each read has its own login and cleanup.
5. Revoke the actual session using Auth admin sign-out, scope `local`. Confirm
   its Auth session row is gone; reuse the old JWT for the current-session RPC
   and require `REVOKED`. A new dedicated read login with the old owner/session
   must receive `SESSION_REVOKED`. Deleting a user alone is not session proof.
6. After each read, including failed reads/connections: NOLOGIN and clear the
   password, close the physical connection, require authentication denial for
   a new connection, terminate any exact-role residual backends, revoke its
   caller edge, drop only that run-owned role and verify absence. Network errors
   do not count as denied-login evidence. No broad `DROP OWNED` is used.
7. Bind the exact generated email and any known user ID, then inspect that
   account's current sessions. If already empty, do not repeat sign-out with a
   revoked JWT. Otherwise require exactly one session, bound to that user's
   token, and successfully revoke it through Auth with scope `local`. Require
   fresh zero sessions before account deletion, delete only that account via
   Auth, verify its absence by both email and ID, and recheck zero sessions.
   Each cleanup operation has a 10-second evidence deadline; timeout is failure,
   not cancellation proof. Do not retry or treat generic 401/403/404 as success.
   Verify zero job-status runtime roles and close the admin connection (releasing
   the lock). SIGINT/SIGTERM stops subsequent test actions and still enters cleanup.
8. **Operator deletes the exact approved disposable Preview on either success
   or failure**, then verifies its absence with the control plane. If creation,
   sign-in, cleanup or process completion was ambiguous, deletion is the final
   containment boundary. Do not reuse that branch or rerun after a failure.

All output is fixed stage names, booleans and scenario labels; no exception body,
credential, user ID, session ID, role name or SQL result is printed. Keep the
approved branch ref in the operator's separate cleanup record. If the process is
force-killed or loses its admin connection, it cannot promise resource cleanup:
complete step 8, and report any deletion failure before doing more work.

An Auth cleanup failure sets top-level `stage: "auth-cleanup"`; `probeStage`
preserves the last main test stage. `authCleanupEvidence` separately records the
fixed cleanup stage, allowlisted failure category and revocation/account/session
booleans. It never includes arbitrary backend error text or codes. A lost create
acknowledgement is recoverable only when the exact generated email finds one
account; an absent lookup with no known user ID is not proof of cleanup.

## Evidence interpretation and remaining work

`ok:true` means this **probe's** negative-read/Auth/credential sequence passed.
It always reports `previewDeleted:false` and `previewDeletionRequired:true`;
the operator must append real deletion evidence. This script never claims it
deleted the branch. A failed stage stops further test scenarios; cleanup remains
allowed and required. Do not turn partial evidence into success.

This gate intentionally uses missing-job reads, avoiding synthetic job inserts,
FK/trigger bypass and admission/Points changes. It therefore does **not** prove
populated owner RLS/status envelopes on Hosted, browser Cookie composition, or
the source adapter's actual issuer/tombstone/one-query transport. Those evidence
fields explicitly remain false. Existing local tests cover five status envelopes
and owner RLS separately. Pinning a source file does not mean it was executed by
this Hosted script.

Next after the approved remote batch: review its actual evidence and deletion,
then implement and verify the real source-adapter/Cookie read composition and
populated synthetic job flow before connecting the existing green task page.
Do not enable the formal route solely because this negative-read probe passed.

## r1 Hosted execution — 2026-09-07

The user confirmed Millionluna's Org (`dupupgakxfikiqeqseej`), the quoted Micro
rate and one no-data Preview with fixed migrations, synthetic Auth/read-role
checks and deletion. The organization's `get_cost` returned US$0.01344/hour,
matching the confirmed rate; actual accrued charges are not inferred here.

- Gate source: `5e365b174f89e3931a7125d014aaa96a8866c922` (clean worktree).
- Batch: `2026-09-07.job-status-read-preview.1`.
- Branch: `careslink-job-status-r1-20260907`.
- Branch ID: `803b55e6-02f0-4159-9c06-49714359ccdc`.
- Project ref: `tfhpagvaufcduuyerzzv`.
- Parent ref: `adocsnwnslxhxcjgbyee` (control-plane binding only).
- Created: `2026-09-07T03:53:36.038502+00:00`.
- Creation and CLI re-attestation: no data, nondefault, nonpersistent.
- CLI: pinned 2.115.0; no upgrade during the batch.
- CA SHA-256:
  `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- Credential-free temporary lifecycle script SHA-256:
  `b3a528cc9b7bacc9bd1a0297ebea585f5d5b63d1aa9c71a185afcbecd52a43ec`.

Before create, the check-only runner and 81 tests across the read-probe and
versioned migration-invocation suites passed. The lifecycle used the committed
transactional invocation, then re-read branch credentials into memory, validated
the canonical branch envelope and passed the Auth/read input through anonymous
stdin to the unchanged committed probe. No raw credentials were printed or
written to local files.

### What passed on Hosted

The PG17 migration runner passed the existing 19-row baseline/history lock and
applied all **47 migrations in a single transaction**, removing 26 outer
transaction wrappers in memory. It reported `migrationHistoryInitialized=false`,
18 application roles, 26 protected application ACL grants, empty ledgers and no
temporary-role residue. Its manifest SHA-256 was
`90650837b534ceaecf4a88df4bc4d5fc734b8ed799c12bb29ccf18e625d47187`;
all fixed baseline catalog/member/dependency/publication/event-trigger/default
ACL/non-application ACL checks passed. This does not prove missing-history
initialization.

The read probe's completed scenario labels establish:

1. PG17 exact migration history, actual wrapper body, dedicated-role ACLs and
   pinned-CA TLS connection passed.
2. A real confirmed synthetic Auth user signed in; claims, current-session RPC,
   user identity and the real Auth session row matched.
3. Three distinct short-lived physical logins each proved SET-only caller
   membership, denied executor/table/generic-reader/cancellation access, and
   completed credential disable, new-login denial, backend/role cleanup.
4. Active-session missing-job reads returned `NOT_FOUND`; mismatched owner/session
   reads returned `SESSION_REVOKED`.
5. Actual Auth sign-out removed the session row. The old JWT's current-session
   RPC returned `REVOKED`, and a new dedicated read login using that revoked
   owner/session received `SESSION_REVOKED`.

### What failed and what was cleaned up

Despite all those scenario labels completing, the unchanged probe returned:

```json
{
  "ok": false,
  "stage": "actual-session-revocation",
  "authCleanup": false,
  "credentialCleanup": true,
  "databaseClosed": true,
  "interrupted": false,
  "previewDeletionRequired": true,
  "previewDeleted": false,
  "productRouteActivated": false,
  "sourceAdapterTransportVerified": false,
  "populatedJobAndOwnerRlsVerified": false,
  "browserCookieCompositionVerified": false
}
```

`authCleanup:false` is a failure of the final Auth-account cleanup block. Its
catch does not identify which substep failed: exact-account lookup, repeated
sign-out, zero-session assertion, account deletion or absence verification.
The `stage` field remains the last main test stage; it does **not** mean the
already-recorded session-revocation test failed. Do not infer a confirmed root
cause, successful account deletion or an account still present from this flag.

As authorized, the first failed probe stopped the batch. The lifecycle's
`finally` deleted **that exact Preview**, then three consecutive branch listings
proved the name/ID/ref absent and only healthy default Production remained.
An independent MCP branch listing confirmed the same; a project lookup returned
NotFound. There was **one create, no retry and no replacement branch**. Branch
deletion is the final containment boundary for the synthetic account and static
branch credentials, not retroactive evidence that per-account cleanup passed.
The temporary credential-free lifecycle file/directory were also removed.

No Production SQL or data access, real care data, Points mutation, model call,
deployment, product flag change or green UI change occurred. Hosted advisors
were not collected after the failed probe; no advisor pass is claimed.

Next: locally separate and test the Auth-cleanup substeps, add safe fixed
checkpoints and investigate repeated sign-out/idempotency without weakening the
zero-session/account-absence assertions. No source fix or new remote run was
performed in this execution-only batch. A fresh one-Preview authorization and
full cleanup pass are required before any adapter/Cookie/UI activation work.

## Local Auth-cleanup correction — 2026-09-07

The pinned `@supabase/auth-js` 2.108.2 admin `signOut` returns Auth errors to its
caller. An offline test through the actual pinned Supabase client, with every
HTTP response intercepted, reproduces a `401 session_expired` response: r1's
repeated-sign-out assertion rejects it and never reaches account deletion.
This establishes a reproducible failure path, **not the confirmed cause of r1**;
the historical catch discarded the actual failing checkpoint and error code.

The new dedicated helper removes the unnecessary repeat when fresh SQL already
proves zero sessions. It keeps independent revocation and deletion evidence,
consistent with [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions).
Active-session cleanup still requires exact owner/session binding and a successful
Auth response. No raw Auth SQL mutation, broad error suppression, retry, grants,
migration change or production readiness change was added to the Hosted runner.
Batch `.2` rejects the old `.1` authorization envelope; it does not reuse the
consumed r1 approval. The source pins and 47-migration manifest are unchanged.

Verification on this revision:

- Full suite: 264 files / 3,998 tests, including 36 new cleanup cases and one
  old-batch rejection vector. The real SDK test is synthetic HTTP, not Hosted.
- Local PG16: 17/17 scenarios passed and owned-cluster stop/removal confirmed.
  The first local run rejected a temporary-table-to-permanent-table foreign key
  (`42P16`); the fixture now creates its dependency inside the rolled-back
  transaction. The repeat then proved the intended real `23503` cleanup denial.
- Check-only: `.2`, exact 47 migrations, `hostedExecuted:false`.
- TypeScript, full zero-warning ESLint, 73-file adapter sync and diff checks passed.

No new Preview, Production access, deployment, UI/Logo change, real care data,
Points mutation or model call occurred. No new browser/build evidence is claimed.
Next: obtain fresh authorization for one no-data Preview and replay the fixed
`.2` batch, stopping on failure and deleting the exact branch on either outcome.
Only that complete Hosted cleanup evidence can close the failed r1 gate.

## r2 Hosted execution — 2026-09-07

The user confirmed the organization and current quoted US$0.01344/hour Micro
compute rate (other usage/taxes billed as incurred), then authorized execution.
One no-data, nondefault, nonpersistent Preview was created; no replacement or
test retry occurred. No actual accrued bill is inferred from the quoted rate.

- Organization: Millionluna's Org, `dupupgakxfikiqeqseej`.
- Clean gate source: `b8dcb40a2e051ddcff532b9ef4abb08ba84724da`.
- Probe batch: `2026-09-07.job-status-read-preview.2`.
- Branch: `careslink-job-status-r2-20260907`.
- Branch ID: `baf9e2df-bee7-4aa1-aeb3-9f92f9f01d90`.
- Child ref: `zhbxpmuorjaxajfbgqux`.
- Parent ref: `adocsnwnslxhxcjgbyee`, control-plane binding only.
- Created: `2026-09-07T04:52:08.935813+00:00`.
- CLI: 2.115.0, unchanged during execution.
- CA SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- Credential-free temporary lifecycle script SHA-256:
  `a37ce443d845770e42b9e94cd54af97fe2645853a5e1cc4a4283533d1688d00d`.

Before creation, check-only/source/CA/CLI/baseline checks and the three focused
suites (118 tests) passed. The lifecycle used the committed transactional
invocation and the existing canonical branch-envelope converter. Credentials
were transferred through anonymous in-memory stdin, not command arguments,
environment exports, files or output. Only the child database/Auth endpoint
received test operations; no Production SQL/data access occurred.

### Passed fixed probe and cleanup

The PG17 invocation under migration policy `.19` passed the exact existing
19-row history/baseline checks and applied all 47 migrations in one transaction.
It reported 26 outer wrappers removed in memory, 18 application roles, 26
protected ACL grants, empty ledgers and no temporary-role residue. The manifest
remained `90650837b534ceaecf4a88df4bc4d5fc734b8ed799c12bb29ccf18e625d47187`.
`migrationHistoryInitialized:false`: missing-history initialization was not tested.

The actual committed `.2` probe returned `ok:true`. Exact wrapper/ACL/TLS checks,
real synthetic Auth sign-in/claims/user/current-session identity, missing-job
`NOT_FOUND`, mismatched-owner/session `SESSION_REVOKED`, three separate physical
read-credential issue/disable/new-login-denial/drop lifecycles, actual sign-out,
and old-JWT current-session/reader rejection all passed. Final evidence:

```json
{
  "ok": true,
  "authCleanup": true,
  "authCleanupEvidence": {
    "ok": true,
    "stage": "complete",
    "failure": null,
    "revocation": "already-absent",
    "accountAbsent": true,
    "sessionsAbsent": true,
    "deletionAcknowledged": true
  },
  "credentialCleanup": true,
  "databaseClosed": true,
  "interrupted": false
}
```

This proves the corrected already-revoked cleanup path on Hosted, including Auth
account-delete acknowledgement, account absence and independently zero sessions.
It closes the specific missing cleanup evidence from r1 for revision `.2`; it
does not establish r1's historical root cause or retroactively pass revision `.1`.

### Advisor collection failed; exact Preview deletion verified

After the successful probe, the temporary lifecycle attempted the additional
CLI security-advisor collection. It failed at `security-advisors` with fixed
`FIXED_PREVIEW_EXECUTION_FAILED`, before usable advisory evidence was emitted.
The wrapper discarded raw CLI output/errors; the checkpoint alone does not
distinguish a command, JSON parsing or report-shape validation failure. No zero-
finding result, specific vulnerability, or confirmed collection root cause is
claimed. This failure did not come from the committed Auth/read probe.

The first failure immediately entered deletion. The exact branch was deleted;
three consecutive CLI absence checks and an independent MCP listing showed only
healthy default Production. The child project lookup returned NotFound. Those
observations were completed by `2026-09-07T04:54:27Z`. The enclosing lifecycle
therefore returned `ok:false, previewDeleted:true, interrupted:false`: deletion
passed, but the optional report step did not. The temporary credential-free
lifecycle file and its owned directory were removed after evidence capture.

No source repair, deployment, product flag/route/UI/Logo change, real care data,
job/payload/Points mutation or model call occurred. Source-adapter transport,
populated Hosted owner-RLS/status envelopes and browser Cookie composition remain
explicitly false; this is not a production readiness or all-five-Note pass.

Next: locally implement and test the real job-status read transport and strict
Cookie-principal composition, retaining default-off flags and the existing green
UI. Resolve the advisor collection contract locally and include valid advisor
evidence in the next necessary integration Preview; do not create a standalone
replacement merely to repeat this already-passed Auth cleanup probe. Populated
synthetic flow, advisors and explicit activation approval remain required before
formal route activation or deployment.
