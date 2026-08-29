# Communication Note Preview hosted runner-terminal identity M1g-h

## Status

M1g-h composes the M1g-g signed terminal verifier, the M1g-c custody snapshot
shape and the fifth database caller behind one source-branded boundary. It also
adds disposable-Preview harnesses for a short-lived login, schema rollback
assertions and a synthetic signed terminal flow. The source and local database
gates passed, but the initial Hosted gate—the 18-file rollback-assertion
bundle—returned the fixed code `SCHEMA_ROLLBACK_ASSERTION_FAILED`. The
remaining Hosted identity and signed terminal gates were therefore not run.
This batch is not approved for activation.

| Boundary | Final M1g-h state |
|---|---|
| Trust registry candidate | `TEST_ONLY_VALIDATED_NOT_APPROVED` |
| Trust composition | `TEST_ONLY_COMPOSED_NOT_APPROVED` |
| Runtime readiness | `false` |
| Approved registry/composition/runtime/PostgreSQL values | `undefined` |
| Disposable Preview | `careslink-note-terminal-m1g-h-r1-20260829`; id `64b9d356-91b8-44ed-a9b6-f3f11717e2bc`; ref `hspkccjobyqmoomiidjp` |
| Preview posture | non-default, non-persistent, `with_data=false`, parent `adocsnwnslxhxcjgbyee`, PostgreSQL 17 target |
| Confirmed Preview rate | US$0.01344/hour; no exact accrued charge is inferred |
| Pinned CA | `/Users/milliohusky/Downloads/prod-ca-2021.crt`; SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7` |
| Migration evidence | exact 38-version history present; branch metadata remained `MIGRATIONS_FAILED` after an earlier Supabase CLI 2.115 transaction-execution failure |
| Hosted rollback assertion | failed closed with `SCHEMA_ROLLBACK_ASSERTION_FAILED` before a success bundle was produced |
| Hosted one-time LOGIN / signed terminal E2E | not run after the preceding gate failed |
| Preview teardown | deletion returned success; three subsequent listings showed the Preview id/ref absent |
| Production | only the default ref `adocsnwnslxhxcjgbyee` remained and reported `ACTIVE_HEALTHY`; it was never the SQL target |

## Trust registry and custody composition

`communication-note-preview-runner-terminal-trust-composition.server.ts` uses
private `WeakMap` records to brand a validated registry candidate and the
composition derived from it. The public values expose only content-free hashes,
purpose, exact caller/executor/RPC names and negative capability facts. Raw
signing material, database credentials and the unbranded fifth-caller input are
not exposed.

The verifier, signed runtime port and PostgreSQL port must all be derived from
the same branded composition. A verified terminal from another composition,
an independently constructed database port, a registry observation later than
the composition time, or one more than five minutes earlier fails closed. This
proves source-level cross-binding only. It does not authenticate the injected
registry as an externally approved registry or prove live custody provenance.

## One-time Preview LOGIN boundary

The identity harness is designed to create a random
`careslink_v1_preview_runner_terminal_runtime_<nonce>` login only after exact
Preview-ref, non-Production, PostgreSQL-major and pinned-TLS checks. Its policy
sets `NOINHERIT`, connection limit 1 and a ten-minute validity window, and
permits only an `ADMIN=false`, `INHERIT=false`, `SET=true` membership into the
existing fifth `NOLOGIN` caller. The login itself receives no direct table,
schema, executor, API/service-role or arbitrary-function privilege.

Role-local teardown is bounded and fail-safe: it sets `NOLOGIN`, rejects
reconnection, closes or drains the exact test sessions, revokes membership and
drops the role, with at most one fresh management reconnect if the setup
connection is lost after commit. A failed reconnect still fails the harness;
deleting the entire disposable Preview is the final database-scope guarantee.
The Hosted run did not reach this gate, so no M1g-h runtime LOGIN was created
there.

## Target, TLS and secret transport

The harness rejects the known Production ref, mismatched branch refs,
unexpected database/user/port fields, unverified TLS, ambient `PG*` variables
and malformed branch metadata. It accepts Supabase branch JSON only through
bounded stdin. The pinned CA is read from an explicit absolute path and verified
against the explicit SHA-256 before connection.

Credential-bearing child configuration is passed through an anonymous file
descriptor and process memory to one Vitest worker. The child environment uses
a strict allowlist. Connection strings, passwords and branch JSON are not
written to repository files or evidence output. These invocation arguments are
test evidence, not persistent product configuration.

## Hosted result

Supabase CLI 2.115 first attempted the repository migration set statement by
statement. Migration 37 stopped at `LOCK TABLE can only be used in transaction
blocks`. The two affected migrations were then sent to this exact disposable
Preview with explicit outer transaction wrappers; their repository bytes were
immediately restored and have no source diff. Supabase subsequently reported
all 38 migration versions through `20260829011323`, while the branch retained
the earlier `MIGRATIONS_FAILED` operation metadata and remained
`ACTIVE_HEALTHY`. This is not described as a native clean migration apply.

The exact 18-file rollback bundle had manifest SHA-256
`163ddd40e68f8c2accc8904c4b7165c6630ba8fdad58b54a674d4f27908273f1`.
Its Hosted run produced only `SCHEMA_ROLLBACK_ASSERTION_FAILED`, not the required
`18/18` success object. That code proves that one of the 18 hash-verified SQL
requests returned an error and the immediate rollback request succeeded; it
does not distinguish a SQL assertion from timeout, connection or protocol
failure, identify a file, report a passed count or prove the final postchecks.
Per the stop rule, the no-write identity probe and positive signed
runtime-to-PostgreSQL flow were skipped. No Hosted terminal ledger success,
replay result, altered-envelope conflict or temporary-role cleanup is claimed.

Advisors were captured before deletion. Security returned 41 project-wide
findings: 21 INFO `rls_enabled_no_policy` and 20 WARN
`authenticated_security_definer_function_executable`. Performance returned 184
project-wide findings: 72 `unindexed_foreign_keys`, 24 `auth_rls_initplan`, 87
`unused_index` and one `auth_db_connections_absolute` (160 INFO, 24 WARN).
These broad Preview findings are not attributed solely to M1g-h. Remediation:
[RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[RLS init plans](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) and
[production connection guidance](https://supabase.com/docs/guides/deployment/going-into-prod).

The Preview was then deleted. Three independent branch listings contained only
the healthy default Production branch, establishing that no Preview database,
temporary role, synthetic row or ongoing branch charge remains. See Supabase's
[branching guide](https://supabase.com/docs/guides/deployment/branching) and
[branch usage guidance](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
for the platform boundary.

## Local evidence and remaining blockers

Before the Hosted attempt, the source gates passed 10 Preview-harness files /
140 tests and five trust/runtime files / 37 tests. The final cleanup hardening
added six recovery/fail-closed regressions, including four commit-response-loss
cases; the full suite passed 171 files / 2,288 tests, TypeScript, zero-warning
targeted ESLint, syntax checks,
`git diff --check` and the webpack production build with 64/64 static pages.
A disposable local PostgreSQL 16.15 cluster applied the exact 38 migrations and
proved the source-valid signed `FAILED`/`CANCELLED` flow, fresh insert, exact
write-free replay, altered valid-signature conflict, append-only enforcement,
final six-ledger counts `1/0/1/1/1/1` and role removal. That cluster was
deleted. This local result must not be relabelled as Hosted evidence.

Two blockers remain explicit:

- Hosted rollback assertions have no passing `18/18` result, so the one-time
  Hosted identity and signed runtime-to-PostgreSQL flow remain unproved.
- Source `ACCEPTED` usage contains nine keys, while migration 38 requires exact
  equality with the six-key stored receipt usage. Only the `FAILED`/`CANCELLED`
  source-valid path is locally proved; `ACCEPTED` needs a separately reviewed
  schema/source reconciliation.

The next Hosted attempt requires a new disposable Preview, a fresh cost
confirmation and explicit authorization. It should first add a content-free,
fixed per-file failure stage to the rollback harness, distinguish SQL semantics
from timeout/transport failure on PostgreSQL 17, close the diagnosed cause, and
then rerun all three Hosted gates.
There was no provider/model call, paid model spend, real care data, Vercel
deployment, Production write, push, merge or activation in M1g-h.
