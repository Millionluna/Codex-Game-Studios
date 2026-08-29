# Communication Note Preview terminal ACCEPTED usage alignment M1g-i

## Status

M1g-i closes the source/database shape mismatch that M1g-h recorded for a
signed `ACCEPTED` runner terminal. The source statement keeps its exact
nine-key usage object, including the three reconciliation labels. Additive
migration `20260829041316_align_communication_note_preview_terminal_accepted_usage.sql`
projects only the six provider receipt facts before performing the exact
receipt comparison. Migration 38 is retained byte-for-byte as historical
evidence.

This now includes source, local PostgreSQL 16.15 and deleted disposable Hosted
PostgreSQL 17 evidence. It does not activate a retained runtime identity,
credential resolver, provider transport, model call, deployment or Production
database change.

| Boundary | M1g-i result |
|---|---|
| Migration count | 39 |
| Ordered migration basenames SHA-256 | `2bd2f029c86e1f4231b9a3bee7ee8681cb086dcd29eaaaceff21efcc1fec1fda` |
| Ordered migration entries SHA-256 | `75d78f30eb2fdc105890308a142d9cf7a0cadcbfda6f2900c06bff64699efb7c` |
| Additive migration | 26,279 bytes; SHA-256 `3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e`; exact statement and usage key-set checks use explicit `C` collation |
| Runner-terminal assertion | 48,566 bytes; SHA-256 `addcc0524c5ae1a20ab0797ae5d005cff846105da61b4100d0db2a60c9e5c1e6` |
| Adjacent A05 / A07 assertions | SHA-256 `b699e5967fd487656dc34c398b61c464396b26d40d48fc1bfbe8c53f3c423a3b` / `cbba8ad819cad206a4f94340e37ff1b593ee7944d01e5b7496fc13a9cc3748b0` |
| 18-file rollback policy | `2026-08-29.preview-schema-rollback-assertions.4`; manifest SHA-256 `f200ccd7da5fce6c14d6b532cf205f22e2f21b934824cc9027f061e48b610034` |
| Activation preflight | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v4`; digest `59a71d4e8668f16cbb0007cfa13bca595b4767cc4842a0d0bb69be0708e9a4ae` |
| Coordinator | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v4`; digest `02268069d8290059988bf96d488828b0b12dec912810972b97c790629fa848af` |
| Local database gate | PostgreSQL 16.15; 39/39 migrations and 18/18 rollback assertions passed; the two expected schema terminal roles existed, zero temporary assertion roles remained, and the disposable cluster was removed |
| PostgreSQL 17 / Hosted gate | deleted no-data r20 applied 39/39, passed A01–A18 and completed the signed `ACCEPTED` temporary-LOGIN E2E; exact replay and conflict behavior passed; the LOGIN and all sessions were removed |
| Activation | denied; readiness remains `false` and approved values remain `undefined` |

## Usage contract

The signed terminal accepts exactly these nine source keys:

`source`, `inputTokens`, `outputTokens`, `totalTokens`,
`totalTokensReconciliation`, `cachedInputTokens`,
`cachedInputTokensReconciliation`, `reasoningTokens` and
`reasoningTokensReconciliation`.

The receipt ledger remains the authority for six provider facts. The terminal
RPC removes only the three reconciliation labels when constructing the receipt
projection, then requires exact equality with the stored receipt usage and
retains the original nine-key statement for signature and ledger binding.
`ASSUMED_ZERO` requires zero, `UNAVAILABLE` requires null, and reported values
must carry their exact numeric value. Missing keys, extra keys, invalid labels,
inconsistent reconciliation and factual receipt drift all fail closed.

The replacement preserves the existing signature, authorization, claim,
reservation, receipt, cost, parent-lock, append-only, replay and exact-ACL
semantics. It adds no table, role, seed row, caller grant or callable product
surface. The migration temporarily obtains only the DDL capabilities needed to
replace the executor-owned function and revokes the schema `CREATE` privilege
and both SET-only role memberships before completion. An explicit outer
`BEGIN`/`COMMIT` keeps those changes atomic even when a migration transport
would otherwise autocommit individual statements.

## Rollback diagnostics and adjacent assertions

The rollback runner now binds the 18 files to fixed stages `A01` through `A18`;
runner preflight uses `R00`. Failures emit one content-free JSON line containing
`stage` and `errorType`; a matched fixed diagnostic may additionally include an
allowlisted `detail` (`Dxxx`, optionally suffixed by `A`, `V`, `P` or `U`).
Transport, timeout, SQL, setup and cleanup paths cannot expose filenames, SQL,
SQLSTATE, credentials, branch metadata or driver details. Rollback failure keeps
priority over the originating assertion error.

The current 39-migration schema also required adjacent assertion maintenance:

- A05 explicitly accounts for the six isolated Communication Note tables while
  retaining exact owner/RLS/Data API denial checks.
- A07 accounts for those tables in its catalog set and limits the JSON/JSONB
  sensitive-column scan to the registered-worker domain.
- A08 used the real `session_user != current_user` role topology during the
  local database gate.

## Verification and remaining blockers

The final local source gate passed 172 test files / 2,315 tests, TypeScript,
zero-warning ESLint, the 73-file adapter synchronization check,
`git diff --check` and the Next.js 16.2.9 Webpack production build with 64/64
pages. A private Unix-socket-only PostgreSQL 16.15 cluster then applied all 39
migrations and passed all 18 rollback assertions. Its minimum Supabase Auth
compatibility functions and temporary migration/assertion roles existed only
inside the disposable cluster; cleanup stopped the server and removed the
cluster.

The PostgreSQL 17 and synthetic signed-terminal blockers are closed. The
Hosted sequence was:

- r19 applied 39/39 and passed A01–A18. Its valid-chain child exited before
  test collection because Vitest 4.1.9 does not support the supplied
  `--minWorkers` option. The option was removed, a real nested-Vitest smoke
  test was added, and a 512-byte fd4 channel now carries only one allowlisted
  content-free status while stdout/stderr and raw database errors stay hidden.
- r20 applied the exact 39-entry manifest in one transaction and passed all 18
  rollback assertions on PostgreSQL 17. Its real temporary LOGIN then wrote one
  signed nine-key `ACCEPTED` terminal, returned exact replay without a second
  row, rejected a source-valid reconciliation conflict as
  `IDEMPOTENCY_CONFLICT`, and proved the exact six-fact receipt projection.
- Independent postcheck found migration 39 last, ledger counts
  `[1,0,1,1,1,1]`, one nine-key `ACCEPTED` terminal and zero temporary LOGINs
  or sessions. Security advisors returned 21 INFO / 20 WARN and performance
  advisors 105 INFO / 24 WARN, with no `ERROR`; these are project-wide
  [Database Linter](https://supabase.com/docs/guides/database/database-linter)
  results, and the security advisor had no finding in either Communication
  private schema.
- r19 and r20 were deleted. Three independent listings after each deletion
  showed only healthy default Production.

Remaining release work is live trust/custody and caller-credential resolution,
separately authorized provider/model evaluation plus human review, final
activation approval and deployment verification. Readiness therefore remains
`false`. M1g-i used only disposable Preview writes and made no provider/model
call, paid model spend, real-care-data access, push, merge, deployment or
Production write.
