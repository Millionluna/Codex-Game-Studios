# Communication Note job-status Preview batch

Batch: `2026-09-07.job-status-read-preview.1`. Prepared on 2026-09-07.
This document is an execution contract, **not Hosted execution evidence**.

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
7. Revoke any remaining known test session, require zero sessions for the exact
   generated account, delete only that account, and check absence. Verify zero
   job-status runtime roles and close the admin connection (releasing the lock).
   SIGINT/SIGTERM stops subsequent test actions and still enters cleanup.
8. **Operator deletes the exact approved disposable Preview on either success
   or failure**, then verifies its absence with the control plane. If creation,
   sign-in, cleanup or process completion was ambiguous, deletion is the final
   containment boundary. Do not reuse that branch or rerun after a failure.

All output is fixed stage names, booleans and scenario labels; no exception body,
credential, user ID, session ID, role name or SQL result is printed. Keep the
approved branch ref in the operator's separate cleanup record. If the process is
force-killed or loses its admin connection, it cannot promise resource cleanup:
complete step 8, and report any deletion failure before doing more work.

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
