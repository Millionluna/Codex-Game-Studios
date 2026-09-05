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

Next: commit and update existing PR #36 without deployment. A separately
authorized disposable Preview is still needed to verify the initialization fix
and the remaining baseline/migration gates on PostgreSQL 17. The newly learned
schema-missing cause does not justify changing unrelated baseline fingerprints,
accepting arbitrary existing history or granting extra hosted-role privileges.
