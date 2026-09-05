# Preview migration-history lock verification

## Status — 2026-09-05

The preceding no-data Micro Preview attempt stopped at `migration_history_lock`,
before reset preconditions, public-object removal, migration-history deletion,
or execution of the 46 migrations. That checkpoint alone does **not** identify
the underlying database error. The Preview was subsequently deleted.

This batch is local-only. It adds error classification and a synthetic PostgreSQL
16.15 regression fixture. It does not claim a hosted PostgreSQL 17 fix or passing
application E2E. No cloud resource, Production connection, model call, hosted
privilege grant, deployment, commit or push was performed in this batch.

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
ownership changes, retries, skip paths or weaker locks in the hosted runner.

## Fixed failure evidence

Policy version: `2026-09-05.preview-transactional-migrations.17`.
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

Verification: 18 live local scenarios passed; 35 focused unit tests passed,
including the existing 47-query fault-injection matrix; the full application suite
passed 235 files / 3,393 tests. TypeScript, ESLint, adapter sync (73 files) and diff
checks passed. The local server stopped and the synthetic fixture was removed.

Next: commit and update existing PR #36 without deployment. A separately
authorized disposable Preview is still needed to obtain the hosted error
classification before choosing a targeted fix; local privileges must not be
copied to hosted roles speculatively.
