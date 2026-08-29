# Communication Note Preview terminal ACCEPTED usage alignment M1g-i

## Status

M1g-i closes the source/database shape mismatch that M1g-h recorded for a
signed `ACCEPTED` runner terminal. The source statement keeps its exact
nine-key usage object, including the three reconciliation labels. Additive
migration `20260829041316_align_communication_note_preview_terminal_accepted_usage.sql`
projects only the six provider receipt facts before performing the exact
receipt comparison. Migration 38 is retained byte-for-byte as historical
evidence.

This is source and local PostgreSQL evidence only. It does not activate a
runtime identity, credential resolver, provider transport, model call,
deployment or Production database change.

| Boundary | M1g-i result |
|---|---|
| Migration count | 39 |
| Ordered migration basenames SHA-256 | `2bd2f029c86e1f4231b9a3bee7ee8681cb086dcd29eaaaceff21efcc1fec1fda` |
| Ordered migration entries SHA-256 | `f488c36ea517b20881a08f365fc58287e053d60e629afff920ff7658cefca1d1` |
| Additive migration | 26,255 bytes; SHA-256 `a97cfe86203500e3bb083c6fb7f5516974e6418cf7a0d3e1ca652a13f190422e` |
| Runner-terminal assertion | 48,576 bytes; SHA-256 `5324e0cdd9b97e8804385950c59c89b1b80e4c4215fd24b0ecf9e85c97a4c9bd` |
| Adjacent A05 / A07 assertions | SHA-256 `b699e5967fd487656dc34c398b61c464396b26d40d48fc1bfbe8c53f3c423a3b` / `cbba8ad819cad206a4f94340e37ff1b593ee7944d01e5b7496fc13a9cc3748b0` |
| 18-file rollback policy | `2026-08-29.preview-schema-rollback-assertions.2`; manifest SHA-256 `36c0f94448d4a53a19f94540f5d6685c3678ad29019e42b6b0b7b97fdc41d833` |
| Activation preflight | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v4`; digest `a97241fafb4392b3a192be05842b619fc659b0e3026ce7f2cf37410ac2c8c22c` |
| Coordinator | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v4`; digest `6a26e2104ebd8cecc55c638cdb2d9ec15b097630e90c0e19573addaa76fc5b2a` |
| Local database gate | PostgreSQL 16.15; 39/39 migrations and 18/18 rollback assertions passed; the two expected schema terminal roles existed, zero temporary assertion roles remained, and the disposable cluster was removed |
| PostgreSQL 17 / Hosted gate | not run; no no-network PostgreSQL 17 runtime was available locally |
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
only `stage` and `errorType`. Transport, timeout, SQL, setup and cleanup paths
cannot expose filenames, SQL, SQLSTATE, credentials, branch metadata or driver
details. Rollback failure keeps priority over the originating assertion error.

The current 39-migration schema also required adjacent assertion maintenance:

- A05 explicitly accounts for the six isolated Communication Note tables while
  retaining exact owner/RLS/Data API denial checks.
- A07 accounts for those tables in its catalog set and limits the JSON/JSONB
  sensitive-column scan to the registered-worker domain.
- A08 used the real `session_user != current_user` role topology during the
  local database gate.

## Verification and remaining blockers

The final local source gate passed 171 test files / 2,296 tests, TypeScript,
zero-warning ESLint, the 73-file adapter synchronization check,
`git diff --check` and the Next.js 16.2.9 Webpack production build with 64/64
pages. A private Unix-socket-only PostgreSQL 16.15 cluster then applied all 39
migrations and passed all 18 rollback assertions. Its minimum Supabase Auth
compatibility functions and temporary migration/assertion roles existed only
inside the disposable cluster; cleanup stopped the server and removed the
cluster.

Three release blockers remain:

- rerun the exact 39-migration / 18-assertion chain on PostgreSQL 17 or a newly
  authorized disposable Hosted Preview;
- prove the source-valid signed `ACCEPTED` path through the Hosted one-time
  identity and terminal persistence flow;
- supply separately reviewed live trust/custody and caller-credential
  resolvers, then obtain final activation approval.

A new Hosted attempt requires fresh cost confirmation and explicit
authorization. M1g-i performed no cloud write, Preview creation, provider/model
call, paid model spend, real-care-data access, push, merge, deployment or
Production change.
