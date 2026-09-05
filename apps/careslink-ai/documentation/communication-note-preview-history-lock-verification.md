# Preview migration-history lock verification

## Status — 2026-09-05

The no-data Micro Preview r6 attempt (`careslink-points-ui-v1-e2e-r6-20260905`,
commit `4d596de`) returned `migration_history_lock_schema_missing`: the history
namespace was absent at lock acquisition. It stopped before reset preconditions,
public-object removal, history deletion or execution of the 46 migrations. The
Preview was deleted; three absence checks and an independent listing confirmed
that only healthy Production remained. The earlier r5 generic checkpoint did not
identify a cause and must not be retroactively relabelled as the same SQLSTATE.

The subsequent `.18` initialization fix is local-only and verified with synthetic
PostgreSQL 16.15 fixtures. It has not been rerun on hosted PostgreSQL 17 and does
not establish a passing application E2E. No new cloud resource, Production
connection, model call, hosted permission change, deployment, commit or push was
performed in this local-fix batch.

### r7 hosted attempt — 2026-09-05

After a new one-Preview cost/scope confirmation, the execution-only r7 attempt
used commit `3e67789` and created exactly one no-data, non-default, non-persistent
Preview, `careslink-points-ui-v1-e2e-r7-20260905` (branch ID
`40764b04-a349-4b5a-8896-9e459ea6908b`, ref `vvlcnhivvugzxuqtwabk`). Its readiness
checks passed. The temporary orchestration script then stopped at its
`credentials` stage with `FIXED_PREVIEW_EXECUTION_FAILED`, before launching the
transactional migration runner. No database connection, reset, migration or lock
test was performed by the local runner; this is **not** a new hosted result for
policy `.18`.

Cleanup deleted that exact Preview. Three consecutive absence checks and an
independent branch listing confirmed that only healthy Production remained.
There was no second create attempt, deployment, model call or Production SQL.
The temporary script did not persist or print credential-bearing JSON.

Offline inspection found a defect in that temporary script: it required `REF`
and `STATUS` from `supabase branches get -o json`. The pinned
[CLI 2.115.0 standard-env formatter](https://github.com/supabase/cli/blob/v2.115.0/apps/cli/src/legacy/commands/branches/branches.format.ts)
emits database URLs and API environment values, but not those two metadata
fields. Reproduction using synthetic data confirms that this mapping loses the
required envelope keys and is rejected as
`RUNNER_TERMINAL_IDENTITY_BRANCH_JSON_INVALID` before connecting. This is a
confirmed local invocation defect; the generic live `credentials` checkpoint
does not distinguish it from every other possible failure inside that stage.

### Local invocation correction after r7

The repository already had a compatible
`communication-note-preview-disposable-branch-envelope.mjs` converter; the r7
temporary script bypassed it. The new versioned
`communication-note-preview-transactional-invocation.mjs` entry point composes
that existing converter with the branch-control and downstream target guards.
It does not change policy `.18`, migration SQL or database permissions.

- Require the locked branch UUID/name/ref, PostgreSQL 17, pinned CA and explicit
  reset-authorization argument. Check CLI 2.115.0, CA bytes and migration manifest.
- Retrieve and validate the exact branch list **before** requesting credentials,
  then repeat that validation after retrieval. Both observations must prove a
  healthy, no-data, non-default, non-persistent child of the pinned parent.
- Feed the actual CLI standard-env JSON into the existing converter. Metadata
  comes from the second validated list, never assumed `REF`/`STATUS` fields or a
  hardcoded healthy status. The converter independently binds both database URLs
  to the expected Preview and checks role/password consistency. Conflicting
  supplied metadata is rejected; unused API keys and JWT secrets are discarded.
- Pass only the canonical envelope to the unchanged runner via anonymous stdin,
  with a restricted child environment. Never print or save branch credentials.
  Outer failures carry fixed, distinct checkpoints; raw CLI errors are discarded.
- Invoke the runner once, with a 15-minute process timeout and cancellation
  propagation. Do not retry, create/delete branches, or deploy from this entry
  point. The outer lifecycle owner must still delete the exact authorized Preview
  in `finally` and verify its absence, including after invocation failure.

The entry-point tests use synthetic CLI 2.115.0 output and injected I/O only.
They reproduce the old r7 mapping failure and cover the corrected route,
before/after metadata changes, Production/DSN mismatch, missing/contradictory
fields, environment injection, secret exclusion, every CLI call failure, and
the default subprocess wiring/failure/cancellation paths with process doubles.
No real CLI, cloud connection or database write is performed by these tests.

Local correction verification: 61 new invocation tests passed; the full suite
passed 236 files / 3,463 tests. TypeScript, ESLint, adapter synchronization
(73 files) and diff checks passed. This does not establish a hosted PG17 pass.

After a **new** resource authorization, the lifecycle owner should call this
versioned entry point instead of recreating a credential adapter in `/tmp`:

```sh
node scripts/preview-e2e/communication-note-preview-transactional-invocation.mjs \
  --expected-branch-id=NEW_BRANCH_UUID \
  --expected-branch-name=NEW_BRANCH_NAME \
  --expected-branch-ref=NEW_BRANCH_REF \
  --expected-pg-major=17 \
  --ssl-root-cert-path=/Users/milliohusky/Downloads/prod-ca-2021.crt \
  --expected-ssl-root-cert-sha256=700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7 \
  --authorized-disposable-preview-reset=b742d12dee926ccfe76158cf524e503bcdc576a08e928a7147741faf4a314424
```

Replace the three non-secret identity placeholders only with the new create
result and independently verified branch list. The reset digest identifies the
fixed operation; it is not a substitute for user authorization. Never run this
entry point outside an already-established cleanup lifecycle.

## Findings and unchanged safety boundary

The exact `LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE
MODE` statement succeeds with an explicit transaction and sufficient privileges.
SELECT, INSERT, or their combination is insufficient; UPDATE, DELETE or TRUNCATE
permits this lock. Schema USAGE is also required for a non-owner. These are
fixture observations consistent with the [PostgreSQL 16 LOCK documentation](https://www.postgresql.org/docs/16/sql-lock.html)
and [PostgreSQL 17 LOCK documentation](https://www.postgresql.org/docs/17/sql-lock.html).
They do not establish the hosted table's owner or ACL.

A concurrent writer blocks the requested lock, and the acquired lock allows
readers while blocking writers. Rollback releases it. An ordinary read-only
transaction can acquire this lock on the local primary, but cannot DELETE;
read-only status alone is therefore not a demonstrated cause of this checkpoint.
This matches PostgreSQL's [utility command classification](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/tcop/utility.c).

The original lock mode, transaction boundary, timeouts, reset proofs, TLS checks,
target checks and migration bytes are unchanged. There are no new grants,
existing-object ownership changes, automatic retries or weaker locks in the runner.

## Missing-schema initialization — policy `.18`

The runner previously assumed that migration history already existed. The pinned
[Supabase CLI 2.115.0 implementation](https://github.com/supabase/cli/blob/v2.115.0/apps/cli-go/pkg/migration/history.go)
has a separate history initialization step. The fix adds that missing lifecycle
step, with stricter refusal to modify an existing partial schema:

- Only after the Preview target, TLS, reset authorization and transaction/advisory
  lock gates succeed, inspect whether the entire history namespace is absent.
- If absent, create the `postgres`-owned namespace and an empty history table in
  the same transaction. The columns/types/order match the pinned CLI: primary-key
  `version text`, nullable `statements text[]`, nullable `name text`.
- Use explicit CREATE, not IF NOT EXISTS, so a competing creator makes the run
  fail rather than silently adopting a different object's ownership or contents.
- Remove PUBLIC/anon/authenticated/service_role access from **these newly created
  objects only**. Do not modify existing schemas, roles or their ACLs.
- Acquire the original SHARE ROW EXCLUSIVE lock. A newly initialized history must
  have zero rows and the exact empty-history digest. Existing history still needs
  the pinned 19-row digest; an existing empty or partial history is not repaired.
- All existing public/catalog/system-data checks still run before application
  objects are removed. Failure rolls back the bootstrap schema/table along with
  any later changes. No old history rows are synthesized to satisfy a check.

Successful evidence reports `migrationHistoryInitialized` and the actual baseline
count/digest: zero/empty for the new path or 19/pinned for the existing path. The
reset-authorization digest remains the pinned contract identifier, not a claim
that a newly bootstrapped branch had 19 recorded migrations.

## Fixed failure evidence

Policy version: `2026-09-05.preview-transactional-migrations.18`.
The helper consumes only an own string `code` property and maps these SQLSTATEs
to fixed checkpoints under `TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED`:

| SQLSTATE (internal only) | Checkpoint suffix after `migration_history_lock_` |
| --- | --- |
| `42501` | `permission_denied` |
| `55P03` | `not_available` |
| `57014` | `query_canceled` |
| `42P01` | `relation_missing` |
| `3F000` | `schema_missing` |
| `25P01` | `transaction_required` |
| `25P02` | `transaction_aborted` |
| `40P01` | `deadlock` |

Unknown/non-string/inherited/accessor codes retain `migration_history_lock`.
Raw SQLSTATEs, error text, query, detail and stack are not copied into hosted
evidence. `57014` is deliberately not named `statement_timeout`: cancellation can
have other causes. See the [PostgreSQL error-code reference](https://www.postgresql.org/docs/17/errcodes-appendix.html).
Every classified failure stops before reset and retains the original diagnosis
even if rollback also fails. Preview deletion remains the final cleanup boundary.
Initialization has fixed `inspect_migration_history_schema`,
`create_migration_history_schema`, `create_migration_history_table` and
`restrict_migration_history_access` failure checkpoints, without raw error text.

## Reproduce locally

From `apps/careslink-ai`:

```sh
npm run test:local:communication-note-preview-history-lock
npm test -- scripts/preview-e2e/communication-note-preview-transactional-migrations.test.mjs
```

The fixture requires a local PostgreSQL 16 installation at one of its fixed paths.
It takes no arguments and accepts no existing database target. It creates its own
temporary cluster, uses a private `0700` Unix socket with no TCP listener, attests
the local data directory/cluster/version before fixture writes, and stops the
owned server before removing its directory. Unproven shutdown retains the exact
temporary directory for investigation. A sandbox may need local shared-memory
permission for `initdb`; there is no remote fallback.

Verification: 24 live local scenarios passed; 44 focused unit tests passed,
including exact fault injection at all 48 existing-history and 51 fresh-history
query boundaries; the full application suite passed 235 files / 3,402 tests.
TypeScript, ESLint, adapter sync (73 files) and diff
checks passed. The local server stopped and the synthetic fixture was removed.

Commit `3e67789` was pushed and existing PR #36 updated without deployment.
This change records the post-r7 invocation correction, its tests and evidence;
the correction has only been validated locally. Next is to reconfirm the cost
and scope of one disposable no-data Preview, then use the versioned entry point
inside its cleanup lifecycle to verify the initialization fix and remaining
baseline/migration gates on PostgreSQL 17. The newly learned
schema-missing cause does not justify changing unrelated baseline fingerprints,
accepting arbitrary existing history or granting extra hosted-role privileges.
