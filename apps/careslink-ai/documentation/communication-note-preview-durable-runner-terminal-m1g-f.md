# Communication Note Preview durable runner terminal M1g-f

> Successor note (M1g-g, 2026-08-29): the current contract chooses the
> independent Ed25519 trust-root option described below, removes the unsigned
> overload and adds a fifth purpose-scoped `NOLOGIN` caller shell plus source-
> only ports. See `communication-note-preview-signed-runner-terminal-port-m1g-g.md`.

## Status

M1g-f adds the source database contract needed for a future executable
reserve-before-dispatch coordinator. It makes the database-written reservation
time observable in the reserve result and requires a durable runner terminal
decision before a later slot can be reserved. It remains **source-only,
default-off and non-callable by any runtime identity**.

| Boundary | M1g-f state |
|---|---|
| Terminal policy version | `policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1` |
| Terminal policy digest | `4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a` |
| Terminal statement version | `runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-f.v1` |
| Migration | `20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql` |
| Database schema | private `careslink_v1_generation` |
| New durable ledger | `communication_note_preview_runner_terminals` with RLS enabled and forced, one immutable row per reservation/receipt |
| New executor | `careslink_v1_preview_runner_terminal_executor`; `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` |
| Runtime caller or executor membership | absent |
| Data API / service-role execution | denied |
| Hosted migration, deployment or provider call | none |

The policy digest is the canonical SHA-256 of the source policy core in
`communication-note-preview-runner-terminal-policy.server.ts`. It binds the
stable M1g-b authority policy and M1f runner policy, not the migration artifact
hash or M1g-e coordinator digest; this intentionally avoids a manifest/policy
hash cycle.

## Database-attested reservation time result

M1g-f replaces `reserve_communication_note_preview_dispatch` without changing
its parameter signature or return type. The database still chooses
`reserved_at` from a fresh, millisecond-truncated wall clock after the
authorization and claim locks. The result now returns that persisted value as
canonical UTC milliseconds in both cases:

- a fresh insert returns `created=true`, `dispatchAuthorized=true` and its
  database `reservedAt`;
- an exact response-loss replay returns the same historical `reservedAt`, but
  keeps `created=false` and `dispatchAuthorized=false`.

No caller may supply a reservation time. A read-after-reserve lookup is not a
dispatch authority and is not introduced. The returned timestamp attests only
the durable database reservation row; it is not OpenAI wire time, provider
attestation, billing evidence or proof of model execution.

## Durable runner terminal ledger

The new append-only ledger records exactly one terminal decision for a
`COMPLETED` dispatch receipt. Its ingress function requires `READ COMMITTED`,
runs as the isolated terminal executor with `search_path=''`, and takes locks
in the shared order:

```text
authorization -> claim -> reservation -> receipt
```

It recomputes the terminal statement digest and cross-binds the authorization,
run, claim, reservation, receipt, slot, fixture, request-body pins and stable
authority/runner/terminal policy identifiers. A first insert and an exact
replay are distinguishable; replay never grants dispatch authority. A
different second decision for the same reservation fails closed and cannot
replace failure with acceptance.

`ACCEPTED` requires the `COMPLETED` receipt's exact usage and calculated cost,
all seven critical checks set to `true`, and the ordered passed reviews for
`en`, `zh-Hans` and `zh-Hant`. `FAILED` forbids acceptance-only evidence and
allows only:

- `CANCELLED`;
- `PROVIDER_EVIDENCE_INVALID`;
- `GOLDEN_EVALUATION_FAILED`;
- `HUMAN_REVIEW_FAILED`;
- `REPORT_INVALID`.

Both states are no-retry. The ledger stores only content-free identifiers,
digests, HMACs, bounded counters, timestamps and decision metadata. It stores
no claim token, request body, prompt, cleaned facts, generated Note, provider
body, raw external identifier or secret.

## Continuation and concurrency

The reserve RPC and terminal RPC serialize on the same claim lock. Before a
slot above zero can be inserted, every earlier reservation must have a durable
`COMPLETED` receipt and durable `ACCEPTED` terminal. The outcomes are:

| Earlier state | Later reservation |
|---|---|
| receipt absent | rejected; no authority |
| receipt non-`COMPLETED` | run permanently consumed |
| `COMPLETED`, terminal absent | pending; no authority |
| terminal `FAILED` | run permanently consumed |
| `COMPLETED` + terminal `ACCEPTED` | eligible for the next exact slot, subject to all existing revocation, expiry and slot checks |

If terminal persistence wins the claim lock, a waiting reserve observes the
committed terminal. If reserve wins first, it observes no terminal and inserts
nothing. Concurrent acceptance/failure attempts are serialized and the unique
reservation/receipt constraints permit only one immutable result.

The migration requires the existing Preview execution ledgers to be empty. It
does not invent acceptance for historical `COMPLETED` receipts or attempt to
repair an already-created later reservation.

## Privilege boundary

The terminal executor receives only the parent reads/lock-only columns,
terminal-ledger select/insert access and its exact definer RPC dependencies.
The dispatch executor receives terminal-ledger select only for the continuation
gate. `PUBLIC`, `anon`, `authenticated`, `service_role`, the four existing
M1g-c callers and unrelated executors cannot execute the new function. All
migration-only `SET` edges and schema `CREATE` grants are removed before the
migration finishes.

M1g-f deliberately does **not** create a fifth caller shell. Creating that ACL
surface without simultaneously extending M1g-c custody and M1g-d caller
evidence would make the four-caller contract false. The future runtime-port
batch must atomically add the purpose-scoped terminal caller, exact execute
grant, credential/custody descriptor, authenticated adapter and teardown
evidence.

The current terminal row does not persist an independent terminal signature.
That is safe only while the RPC remains unreachable by runtime identities.
Before any runtime grant, the next batch must explicitly choose and review one
trust root: either extend the contract with an independently signed terminal
envelope and custody/verifier evidence, or make the authenticated, purpose-
scoped terminal adapter/caller the sole attesting identity. It may not treat the
caller-supplied verifier HMAC as a signature.

## Relationship to M1g-e

The M1g-e transcript validator is revised to acknowledge that both database
structures now exist in source. Its two runtime evidence blockers remain:

- `DATABASE_ATTESTED_RESERVED_AT_ABSENT` means no trusted runtime has invoked
  the new reserve result and supplied its database value to the coordinator;
- `DURABLE_RUNNER_TERMINAL_STATE_ABSENT` means no trusted runtime has persisted
  or read a terminal row.

Injected transcript candidates do not satisfy either blocker. Coordinator and
activation readiness remain `false`, dispatch capability remains absent, and
the live factories still throw.

## Verification and remaining work

The focused source gate covers the canonical terminal policy, migration
structure, reserve replay semantics, terminal evidence, lock order, RLS/ACL,
runtime-boundary quarantine and the M1g-d/M1g-e derived policy pins. Exact
final test counts, SQL artifact hashes and disposable local PostgreSQL 16.15
execution evidence are recorded in `documentation/tests.md`.

Activation still requires a fifth purpose-scoped caller and authenticated
runtime port, an explicit terminal trust-root/custody decision, real external
provenance, a disposable non-Production database application, provider/key
controls, completed attributable human review, explicit run approval and
verified teardown. Production and real care data remain excluded.
