# Communication Note Preview terminal ACCEPTED usage alignment M1g-i

## Status

M1g-i closes the source/database shape mismatch that M1g-h recorded for a
signed `ACCEPTED` runner terminal. The source statement keeps its exact
nine-key usage object, including the three reconciliation labels. Additive
migration `20260829041316_align_communication_note_preview_terminal_accepted_usage.sql`
projects only the six provider receipt facts before performing the exact
receipt comparison. The current source also gives migrations 37 and 38 their
own explicit outer `BEGIN`/`COMMIT`, so their lock, temporary grants and cleanup
remain atomic under a statement-by-statement migration transport.

This now includes current-source, local PostgreSQL 16.15 and deleted
exact-current Hosted PostgreSQL 17 evidence. The Hosted gate ran from execution
source `02949d1a666fa8aa0496d3e995f1dd88c52a29a0` and proves the current
migration bytes, transactional policy `.6`, identity policy `.2` and v5 pins.
Deleted r19/r20 remain historical checkpoints for the prior artifact set later
committed as `4e84823`. This work does not activate a retained runtime identity,
credential resolver, provider transport, model call, deployment or Production
database change.

Successor note (M1j, 2026-08-30):
`communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts`
now supplies a production-shaped but explicitly TestOnly/source-only contract
for resolving the disposable target, custody/trust and fifth-caller session.
Its public factory remains unconditionally disabled, readiness remains
`false`, and all four approved target/resolver/port values remain `undefined`.
M1j therefore narrows the future adapter contract but does not retroactively
turn the M1g-i Hosted run into live resolver evidence or change any migration,
Preview, provider/model, deployment or Production claim below. See the
[M1j handoff](communication-note-preview-live-custody-caller-resolver-m1j.md).
Its TestOnly cleanup receipt requires acquisition-digest tombstone and
future-issuance-blocked claims, but durable broker fencing against late acquire
settlement remains unproved and is still an activation blocker.

| Boundary | M1g-i result |
|---|---|
| Migration count | 39 |
| Ordered migration basenames SHA-256 | `2bd2f029c86e1f4231b9a3bee7ee8681cb086dcd29eaaaceff21efcc1fec1fda` |
| Ordered migration entries SHA-256 | `a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2` |
| Migration 37 | 39,965 bytes; SHA-256 `09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432`; explicit outer transaction |
| Migration 38 | 28,835 bytes; SHA-256 `4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f`; explicit outer transaction |
| Additive migration | 26,279 bytes; SHA-256 `3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e`; exact statement and usage key-set checks use explicit `C` collation |
| Runner-terminal assertion | 48,566 bytes; SHA-256 `addcc0524c5ae1a20ab0797ae5d005cff846105da61b4100d0db2a60c9e5c1e6` |
| Adjacent A05 / A07 assertions | SHA-256 `b699e5967fd487656dc34c398b61c464396b26d40d48fc1bfbe8c53f3c423a3b` / `cbba8ad819cad206a4f94340e37ff1b593ee7944d01e5b7496fc13a9cc3748b0` |
| 18-file rollback policy | `2026-08-29.preview-schema-rollback-assertions.4`; manifest SHA-256 `f200ccd7da5fce6c14d6b532cf205f22e2f21b934824cc9027f061e48b610034` |
| Transactional migration policy | `2026-08-29.preview-transactional-migrations.6`; manifest SHA-256 `60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`; 19 known source wrappers are removed only in memory when the disposable reset harness supplies the whole-manifest transaction |
| Disposable identity policy | `2026-08-29.preview-runner-terminal-identity.2`; cross-binds the same healthy, no-data, non-default, non-persistent child Preview and its Production parent before credentials, CA bytes or a connection may be used |
| Activation preflight | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5`; digest `0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1` |
| Coordinator | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5`; digest `1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2` |
| Current local database gate | PostgreSQL 16.15 applied 39/39; migrations 37/38 passed a deliberate statement-by-statement sequence without a harness-supplied outer wrapper; A03 passed; zero terminal rows and zero temporary SET edges remained; the disposable cluster was removed |
| Historical PostgreSQL 17 / Hosted gate | r20 on the prior `4e84823` artifact set applied 39/39 through transactional policy `.5`, passed A01–A18 and completed the signed `ACCEPTED` temporary-LOGIN E2E; it remains attributed only to that prior artifact set |
| Exact-current Hosted PostgreSQL 17 gate | deleted no-data, non-default, non-persistent `careslink-note-terminal-m1g-i-v5-r2-20260830` (id `0e63cac9-d1dc-4096-9f65-c36de91c85fa`; ref `yrsgxbxislyenblphfdl`) passed the 19-row baseline pin, transactional 39/39 manifest `.6`, A01–A18, identity `.2`, signed `ACCEPTED`/replay/`IDEMPOTENCY_CONFLICT`, independent 39-row/ledger/role/session postcheck and final Advisors; native Supabase CLI migration apply remains a separate unproved transport |
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
surface. Migrations 37, 38 and 39 each keep their temporary DDL capabilities,
locks and revocations inside an explicit outer `BEGIN`/`COMMIT`. The disposable
whole-manifest harness removes only those pinned outer wrappers in memory before
running all 39 migration bodies in its own single transaction; repository bytes
remain unchanged by the harness.

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

The current source gate passed 172 files / 2,321 tests, TypeScript,
zero-warning ESLint, the 73-file adapter synchronization check,
`git diff --check` and the Next.js 16.2.9 Webpack production build with 64/64
pages. A private Unix-socket-only PostgreSQL 16.15 cluster then applied all 39
current migrations.
The migration-37 and migration-38 source-level transactions passed a deliberate
statement-by-statement path without a harness-supplied outer wrapper;
A03 passed, final terminal rows and temporary SET edges were both zero, and the
cluster was deleted. The earlier 172-file / 2,315-test result remains only the
historical `4e84823` checkpoint.

The exact-current Hosted gate used two hard-stop disposable attempts. The first,
`careslink-note-terminal-m1g-i-v5-20260830` (id
`0a6ec996-1480-468f-87f2-7c4f8a57b9db`; ref `inpgstykhnkuqmifeevb`), passed
the 39/39 transaction, A01–A18, identity and signed valid chain, then was
deleted before Advisors when an external independent checker incorrectly used
the 19-row baseline's first version `20260625130340` as the 39-row chain's first
version. Three listings showed only healthy Production; no evidence below
depends on that attempt.

The fresh replacement `careslink-note-terminal-m1g-i-v5-r2-20260830` (id
`0e63cac9-d1dc-4096-9f65-c36de91c85fa`; ref `yrsgxbxislyenblphfdl`) was a
no-data, non-default, non-persistent PostgreSQL 17 child of Production. The
pinned CA SHA-256 was
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
It matched the exact 19-row baseline digest
`b742d12dee926ccfe76158cf524e503bcdc576a08e928a7147741faf4a314424`,
then applied all 39 current migrations in one transaction through manifest
`60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`.
A01–A18 passed 18/18 with manifest
`f200ccd7da5fce6c14d6b532cf205f22e2f21b934824cc9027f061e48b610034`.
Identity policy `.2` proved the exact RPC-only SET membership and zero-residue
LOGIN lifecycle. The signed valid chain returned fresh `ACCEPTED`, write-free
exact replay and `IDEMPOTENCY_CONFLICT`, retained the nine-key usage statement,
proved the six-fact receipt projection and ended with ledger counts
`[1,0,1,1,1,1]` plus no temporary login.

The corrected independent postcheck found 39 migration rows from
`20260625125102` through `20260829041316`, the same ledger counts, exactly one
nine-key `ACCEPTED` terminal and zero temporary roles or sessions. Final
Supabase Advisors returned security 21 INFO / 20 WARN / 0 ERROR, with zero
Communication/generation-schema security findings, and performance 105 INFO /
24 WARN / 0 ERROR. The generation-schema performance subset was 18 INFO / 13
WARN / 0 ERROR across `auth_rls_initplan`, `unindexed_foreign_keys` and
`unused_index`; global totals matched the recorded r20 totals. The replacement
Preview was deleted and three independent listings showed only default
Production `ACTIVE_HEALTHY`. The confirmed Micro rate was US$0.01344/hour; no
exact accrued invoice total is inferred.

The deleted Hosted sequence also belongs only to that prior artifact set:

- r19: id `17627f14-b3ef-4d94-834e-8adde3850a2f`; ref
  `tsozyxxjxzqixkztdpmr`. It applied the prior 39/39 manifest and passed A01–A18,
  but its valid-chain child exited before test collection because Vitest 4.1.9
  does not support the supplied `--minWorkers` option.
- r20: id `0e4154f3-f995-4f6c-a025-898435d3b5c0`; ref
  `fhcmsezgladnmzhkzoeb`. Its evidence lineage was committed as
  `4e84823d3c62e34abe0a0bd0f295e20dc456cae0`. It applied the prior exact
  39-entry manifest in one transaction, passed A01–A18, wrote one signed
  nine-key `ACCEPTED` terminal through a real temporary LOGIN, returned exact
  replay, rejected the signed conflict as `IDEMPOTENCY_CONFLICT`, and proved
  the exact six-fact receipt projection.
- The r20 postcheck found migration 39 last, ledger counts `[1,0,1,1,1,1]`,
  one nine-key `ACCEPTED` terminal and zero temporary LOGINs or sessions.
  Security advisors returned 21 INFO / 20 WARN and performance advisors
  105 INFO / 24 WARN, with no `ERROR`; these are project-wide
  [Database Linter](https://supabase.com/docs/guides/database/database-linter)
  results, and the security advisor had no finding in either Communication
  private schema.
- r19 and r20 were deleted. Three independent listings after each deletion
  showed only healthy default Production.

The unchanged A03 assertion still permits the signer-independence negative
vector to return either dedicated
`RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT` or generic `VALIDATION_ERROR`.
Tightening it to the dedicated code only remains a separately pinned hardening:
it would change A03, the rollback manifest and the derived preflight/coordinator
pins and therefore requires another separately authorized disposable Preview
rerun.

Exact-current Hosted PostgreSQL 17 evidence is now closed through the pinned
single-transaction repository runner. Native Supabase CLI migration apply
remains unproved as a separate transport. Remaining release work also includes
live trust/custody and caller-credential resolution, separately authorized
provider/model evaluation plus human review, final activation approval and
deployment verification. Readiness therefore remains `false`. M1g-i used only
local or disposable Preview writes and made no provider/model call, paid model
spend, real-care-data access, deployment or Production write.
