# Communication Note Preview durable caller credential resolver M1k

## 状态与结论

M1k 把 M1j 第五个 `RUNNER_TERMINAL_PERSISTENCE` caller 的自报清理契约，推进到
一个可由真实本地 PostgreSQL 验证的 **TestOnly 持久 broker 与 server-only
resolver 适配层**。它证明了 acquisition digest 的跨连接串行化、先提交不可逆
tombstone、再销毁会话/撤销角色，以及独立零残留 postcheck 的本地语义。

这不是上线 broker，也不是已批准的数据库凭据服务。SQL 只位于
`scripts/preview-e2e`，没有进入 Supabase migration；公开 factory 仍无条件关闭，
readiness 仍为 `false`，approved resolver 仍为 `undefined`。M1k 没有产品 importer、
环境变量、网络/SDK 连接、Hosted Preview、provider/model 调用、部署或 Production
变更。

| 边界 | M1k 结果 |
|---|---|
| resolver | `src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.ts` |
| resolver tests | `src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.test.ts` |
| isolated broker | `scripts/preview-e2e/communication-note-preview-runtime-credential-broker-setup.sql` |
| teardown / audit | `communication-note-preview-runtime-credential-broker-cleanup.sql` / `communication-note-preview-runtime-credential-broker-postcheck.sql` |
| static SQL gate | `communication-note-preview-runtime-credential-broker.test.mjs` |
| real local gate | `communication-note-preview-runtime-credential-broker-local-pg16.mjs` |
| policy version | `resolver.communication.openai.synthetic-preview.2026-08-30.m1k.v1` |
| policy digest | `67fb2065c23c1cd99a8e1c1a396509edefd7e7614fa476e2ee95839eafea5a7c` |
| readiness | `CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_READY === false` |
| policy status | `TEST_ONLY_INJECTED_DURABLE_BROKER_NOT_APPROVED` |
| approved resolver | `CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_DURABLE_CALLER_CREDENTIAL_RESOLVER === undefined` |
| public factory | always throws fixed `PRODUCT_API_DISABLED` |
| executable path | exact-capability `createTestOnly...` with injected broker/session/audit/clock/entropy ports |
| production migration | `productionMigrationPresent=false`; zero Supabase migration files added |
| migration manifest | unchanged at 39; no migration, manifest, preflight or coordinator repin |
| database evidence | disposable local PostgreSQL 16.15 only; no PostgreSQL 17 or Hosted claim |

Successor note (M1l, 2026-08-30): M1l keeps the facts above as the historical
M1k checkpoint, then adds formal migration source
`20260830065750_add_communication_note_preview_runtime_credential_broker.sql`
as migration 40. Its private durable broker is hash-only, the exact
three-argument terminal RPC now acquires a shared ACTIVE fence against exclusive
tombstone/finalize, bind applies `NOLOGIN`, and resolver Abort requires a
250 ms connection-bound cancel/query settlement barrier or permanent
quarantine. The formal source passed a disposable private-socket PostgreSQL
16.15 harness with `scenarioCount=6`, four revoked issued acquisitions, and
zero role/session/membership/API residue. Same-revision deleted PostgreSQL 17
Preview r5 subsequently passed 40/40, A01–A18, pinned-CA terminal and exact
cross-database owner-residue gates with zero final residue. It remains
Production-unapplied/default-off and has no deployment or product/provider
evidence. See the
[M1l handoff](communication-note-preview-runtime-credential-broker-m1l.md).

## Why the broker remains isolated

Adding a future additive Supabase migration would change the ordered migration manifest and require
an atomic repin of the migration SHA, ordered basenames and entries, transactional policy, A03
assertion, rollback manifest, preflight and coordinator. Its number and exact contents must be
decided when that separately authorized batch is written. It would also make the current exact
39-migration Hosted evidence historical for the new artifact set. M1k deliberately does not make
that schema claim: it closes the local lifecycle design/proof step while preserving prior evidence
only for its original revision. In particular, historical r20 remains scoped to artifact
`4e84823d3c62e34abe0a0bd0f295e20dc456cae0`, and the later Hosted result remains scoped to
execution source `02949d1a666fa8aa0496d3e995f1dd88c52a29a0` and its deleted PostgreSQL 17
Preview. Neither result was rerun for or inherited by M1k.

The broker schema is therefore explicitly named
`careslink_test_only_runtime_broker`, accepts only PostgreSQL major 16 or 17 under a fixed
management `application_name`, and must run as `postgres` on a disposable, no-data database.
Neither setup nor the resolver discovers a target or credential itself.

## Durable acquisition state machine

The metadata-only ledger has one row per acquisition digest and allows only:

`RESERVED -> ISSUED_UNBOUND -> ACTIVE -> TOMBSTONED -> REVOKED`

`RESERVED` may also move directly to `TOMBSTONED` and then `REVOKED`, covering revoke before
acquire. A trigger rejects identity mutation, state reversal, delete and truncate. Every
`acquire`, `bind`, `tombstone` and `finalize` operation takes the same transaction-level advisory
lock derived from the acquisition digest. Consequently:

- two acquires for one digest cannot both issue;
- a committed tombstone makes every later acquire fail closed;
- acquire response loss can be cleaned up from a fresh process that knows only the digest;
- repeated and concurrent revoke attempts converge on the same terminal metadata row.

`tombstone` stores its transaction ID. The cleanup script commits that transaction before opening
a new top-level transaction for `finalize`, and `finalize` rejects the transaction that created
the tombstone. If finalization fails, the durable fence remains and a later administrative cleanup
can retry without reopening issuance.

## Credential and session boundary

The resolver derives a deterministic runtime role from the acquisition digest, generates 32 bytes
of password entropy and a 16-byte salt, and constructs a SCRAM-SHA-256 verifier with 4,096
iterations. It passes only the verifier to the injected management broker and only the password to
the injected exclusive-session factory. The broker ledger stores only the verifier SHA-256, never
the verifier, password, DSN, CA body or connection string.

The runtime role is a short-lived `LOGIN` with `NOINHERIT`, no dangerous attributes,
`CONNECTION LIMIT 1`, `VALID UNTIL`, fixed timeouts, and exactly one non-admin,
non-inheriting, `SET`-only membership in
`careslink_v1_preview_runner_terminal_caller`. `bind` accepts the lease only when the exact idle
backend PID, role, backend start and fixed runtime `application_name` are visible. The resolver
returns the M1j lease only after this binding succeeds.

The TypeScript resolver requests a lease of at most 90 seconds and requires at least 45 seconds
remaining before issue. The isolated broker accepts a 30-second to 10-minute window so its SQL
lifecycle can be tested independently; the real PG16 harness used five-minute fixtures. This wider
TestOnly SQL acceptance is not a production lease policy. The public descriptor contains hashes
and posture facts only. The raw password is not placed in a lease,
release report, error, environment variable or log. Mutable byte buffers are overwritten in
`finally`; JavaScript strings cannot be reliably zeroized, so a production credential transport
must additionally minimize string copies and own driver/process memory controls. This limitation
is one reason the adapter remains TestOnly.

## Tombstone-first revoke and independent audit

The resolver fixes release order as:

1. broker `tombstone` and durable commit;
2. destroy the module-known physical session;
3. broker `finalize` in a separate transaction;
4. independent audit-port `inspect`;
5. construct and return the M1j digest-bound release report.

For an issued identity, `tombstone` verifies the stored role name and OID, changes the role to
`NOLOGIN` with an already-expired `VALID UNTIL`, verifies that login fence, updates the ledger and
commits all of those effects atomically. A new connection attempt begun after that commit with the
old password is therefore rejected. `finalize` requires the committed login fence, terminates and
boundedly drains every matching name/OID backend, revokes membership, drops the role, and records the paired
`DESTROYED` / `REVOKED` disposition. A never-issued tombstone records only the paired
`NOT_ACQUIRED` / `NOT_ISSUED` disposition. The audit port must be a distinct function identity
from every broker mutation. It verifies the terminal row and zero role, membership and session
residue before the resolver may report success. If the resolver locally observed a session or M1j
provided a complete binding, an `everIssued=false` audit is rejected so cleanup cannot be
misreported as “never issued.”

The resolver snapshots every injected broker/audit/session/clock/entropy function and each opened
session's PID/query/destroy methods before use, so later object mutation cannot replace an attested
capability. Local destroy receives a 250 ms settlement grace; rejection or non-settlement cannot
block authoritative `finalize` and `inspect`. A per-resolver tombstoned-digest fence also destroys,
without binding, any non-cooperative `open` result that arrives after digest-only revoke completed.
Query Abort and bind failure no longer destroy a session ahead of the durable tombstone.

The postcheck is read-only and separately submitted after cleanup. It proves every ledger row is
terminal, the selected digest has one valid immutable tombstone/receipt, no runtime role/backend/
membership remains, the schema structurally contains no raw credential column, all functions are
`SECURITY INVOKER` with empty `search_path`, and `PUBLIC`, `anon`, `authenticated`,
`service_role` and `authenticator` have no broker capability.

## Verification evidence

The real harness created an owned temporary PostgreSQL 16.15 cluster with a private Unix socket
and no TCP listener, bootstrapped only the roles and hashing helper required by this isolated
contract, switched the runtime connection to SCRAM, and ran six lifecycle/concurrency scenarios:

1. acquire, physical-session bind, wrong-PID rejection, exact ACTIVE replay and normal revoke;
2. an uncommitted tombstone holding the digest lock, one proven waiting acquire, then committed
   tombstone and rejected late issuance;
3. two simultaneous acquires for one digest, with exactly one issue;
4. acquire-response loss, wrong-application bind rejection, committed `NOLOGIN`, rejected late
   reconnect and cleanup from fresh digest-only resolvers;
5. two simultaneous revoke attempts with idempotent terminal results;
6. bound active-session termination and zero-residue verification.

The fixed final output was:

```json
{"ok":true,"gate":"communication-note-runtime-credential-broker-local-pg16","postgresMajor":16,"postgresVersion":"16.15","postgresVersionNum":160015,"scenarioCount":6,"acquisitionCount":3,"issuedTombstoneCount":2,"nonissuedTombstoneCount":1,"cleanupCount":3,"postcheckCount":3,"runtimeRoleCount":0,"runtimeSessionCount":0,"runtimeMembershipCount":0}
```

The harness then stopped the server and deleted its exact temporary root. A subsequent filesystem
probe found no matching cluster directory, and `pg_isready` found no server on the fixed probe
port. This proves the recorded PostgreSQL 16.15 local run only. The SQL is intentionally compatible
with major 16/17, but M1k has not executed it on PostgreSQL 17, Supabase Hosted, TLS or pinned CA.

The static SQL gate protects the 39-migration boundary, monotonic state transitions, common digest
lock, separate tombstone/finalize transactions, metadata-only credential storage, API-role zero
ACL, SCRAM-only role DDL, cleanup order and independent zero-residue postcheck. Resolver tests cover
secret-free lease/report surfaces, acquire/open/bind and tombstone/destroy/finalize/inspect order,
concurrent revoke-before-acquire, response-loss cleanup, abort cleanup/redaction, bounded hung
destroy, late non-cooperative open, immutable port/session snapshots and rejection of a false
never-issued receipt. `runtime-boundary.test.ts` keeps the module server-only and permits only its
own test to import it; the M1k module and test are separately allowlisted consumers of the
pre-existing M1j support boundary.

The focused M1k/runtime-boundary gate passed 3 files / 32 tests, including 11 static SQL tests. The
final repository gate passed 175 files / 2,366 tests, TypeScript, repository-wide zero-warning ESLint, the 73-file Codex adapter
synchronization check, `git diff --check`, and the Next.js 16.2.9 explicit Webpack production build
with 64/64 static pages. The default Turbopack invocation cannot follow this temporary worktree's
cross-root shared `node_modules` symlink; it failed before compilation and is not claimed as a
passing gate.

## What M1k does not close

M1k does not yet supply a production-grade durable credential broker. Activation remains blocked
until a separately reviewed atomic batch:

1. adds the broker to the target PostgreSQL 17 database in a separately authorized additive
   migration batch and atomically repins every affected migration/rollback/preflight/coordinator
   artifact;
2. makes the signed terminal RPC itself revalidate an `ACTIVE` acquisition row under the same
   database authority, bound runtime role/backend and expiry, closing the committed-tombstone to
   backend-termination write window;
3. provides an approved target/control-plane verifier, pinned TLS/CA connection, production secret
   transport, orphan recovery and operator/audit ownership;
4. implements equivalent live custody/caller boundaries for
   `AUTHORIZATION_REGISTRATION`, `AUTHORIZATION_REVOCATION`, `DISPATCH` and
   `RECEIPT_PERSISTENCE` rather than only the fifth terminal caller;
5. runs the same revision on an explicitly authorized disposable no-data PostgreSQL 17 Preview,
   with independent zero credential/role/session/data residue evidence;
6. separately authorizes the provider transport, bounded synthetic model evaluation, human safety/
   privacy/product review, merge, deployment and final activation.

The committed `NOLOGIN` fence blocks new authentication attempts begun afterward, but it does not
itself terminate a backend that was already authenticated or prove the fate of an authentication
already in progress. `finalize` terminates and audits the sessions visible to the broker; the future
terminal-RPC ACTIVE-fence recheck plus driver cancellation/session ownership is still required to
close the remaining pre-fence write window.

Until those gates close, no product route may import this resolver, no approved export may be
populated, and no real AI application traffic or care data may use it.
