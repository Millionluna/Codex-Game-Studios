# V1 Note generation durable design handoff

> Status: default-off design plus five Production-unapplied migrations. The
> schema-only foundation passed its historical deleted-`r4` gate; at source HEAD
> `c7b70e9f84b9b804779039711b85cc7eda55bd57`, the exact worker RPC bundle passed
> isolated PostgreSQL 17.6 migration/assertion evidence on deleted disposable
> `r9`. A subsequent fixed harness on deleted no-data `r20` proved the three
> true two-session claim/session/privacy races on PostgreSQL 17.6; deleted
> no-data `r21` then proved Attempt-2 historical replay through success and
> purge. Deleted `r22` proved the current 15-migration retention gate on
> PostgreSQL 17.6, and a later disposable local PostgreSQL 16.15 run closed the
> current engine/serial/true-two-session version gate under the minimum
> Supabase-compatibility bootstrap. Migration #29 subsequently adds a
> source/local-only graceful registration-retirement control plane. Its final
> local gate clean-applied 29/29 migrations and passed all 9 rollback suites,
> the independent posture postcheck and both lock orderings. This is not a
> retained/applied runtime
> repository, callable worker,
> route, Preview capability, model call or Production capability.

## 1. Scope and non-goals

This design extends the shared five-Note foundation for Communication,
Handover, Progress, NDIS and Incident Factual. It describes durable job
metadata, attempts, leases, recovery and the transaction that may eventually
persist a usable canonical result.

This handoff does not authorize or implement:

- a retained or Production migration apply, caller `EXECUTE` grant or reachable
  private worker RPC;
- a served route, worker deployment or feature activation;
- raw cleaned-facts persistence;
- a real model or STT call;
- Points quote, reserve, commit, release or cutover;
- Production migration, grants, traffic or data changes.

The application readiness latch and every related runtime capability remain
off. Source or static evidence must not be described as served or end-to-end
evidence.

## 2. Why the existing public job table cannot be reused

`public.generation_jobs` in
`supabase/migrations/20260809120000_create_v1_shadow_foundation.sql` is an
earlier shadow model and is not the durable repository for the current job
contract.

It cannot safely be reused because:

- `document_id` is required before the job can be inserted. The current
  contract creates no canonical document for a failed or cancelled generation
  and creates the document plus revision 1 only when validated output succeeds.
- it stores the raw idempotency key instead of only an owner-scoped digest and
  request digest;
- it does not bind the exact initiating session, privacy proof, cleaned-facts
  hash, Note type, source locale and contract/schema versions needed at commit;
- it has no attempt, lease, heartbeat, expiry or crash-recovery model;
- it is already coupled to the shadow Points quote/reservation draft;
- it has an authenticated owner-SELECT grant and policy. That direct RLS path
  does not provide the fresh `auth.sessions` eligibility check required for a
  sensitive job read after session revocation.

The table must remain an inert historical shadow resource. New runtime code
must not dual-write it or silently translate the new state machine into it. Any
future retirement or reconciliation is a separately reviewed migration.

## 3. Private schema blueprint

The foundation migration creates the separate private schema
`careslink_v1_generation`. It does not add tables or types to
`careslink_v1_internal`: the existing Product API migrations and assertions
lock that schema to an exact function-only object set.

The migration preflight must fail when the new namespace already exists or its
owner, ACL, default privileges or object set differs from the expected state.
The schema/table owner and the reviewed executor role must be separate. Neither
may be an API role. The executor must be `NOLOGIN`, `NOSUPERUSER` and
`NOBYPASSRLS`, and may receive only the table operations required by the
reviewed definer functions. The schema grants no `USAGE` or `CREATE` to
`PUBLIC`, `anon`, `authenticated` or `service_role`.

The first schema-only object set was deliberately smaller than the eventual
durable repository:

1. two dedicated `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` roles, one owner and
   one future executor;
2. a single default-off `settings` row;
3. a metadata-only `jobs` table;
4. a metadata-only `attempts` table;
5. only their required constraints and indexes.

At its deleted-`r4` checkpoint it created no function, view, trigger or RLS
policy. The subsequent worker migration adds payload metadata,
one-time grants, provider-evidence detail, purge outbox, immutable policy and
registration catalogs, executor policies and the nine reviewed worker RPC
identities. The original three-table foundation and its historical evidence
must still never be described as the atomic transaction in section 7; the
additive revision has separate deleted-`r9` assertion evidence and runtime gates.
The later owner-runtime migration adds a thirteenth private table for
database-owned admission bindings, a distinct owner-API executor and three
private owner RPC identities. It seeds no active binding and does not turn the
first four migrations into a retained or callable runtime. The subsequent
graceful-retirement migration adds a fourteenth private table and a distinct
control-plane executor/RPC, but no retirement row, caller grant or activation.

No enum type is required; bounded text checks keep migration and rollback
inspection explicit. Every foreign-key column used for lookup or cascade must
have a matching index.

### 3.1 Default-off settings

The settings row fixes the capability name and `shadow_only=true`, with
`enabled=false`. Lease duration, maximum attempts, backoff, payload backend and
payload retention remain unset until their product and operational decisions
are approved. The migration must not guess those values.

The database flag is an additional kill switch, not an authorization source.
Application flags, route authorization, session eligibility, RPC ACL and row
binding must all pass independently.

### 3.2 Metadata-only jobs

The private `jobs` blueprint contains only bounded orchestration metadata:

- job UUID and owner UUID;
- exact initiating session UUID;
- Note type, source locale and versioned service/catalog code;
- contract and schema versions;
- privacy-review UUID and canonical cleaned-facts SHA-256;
- owner-scoped idempotency SHA-256 and canonical request SHA-256;
- a payload UUID plus immutable payload-policy version and SHA-256 binding;
- an optional content-free locator digest only when the approved vault needs
  one; the actual vault locator or bearer capability never enters this table;
- `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` or `CANCELLED`;
- attempt count and scheduling timestamps;
- allowlisted failure code;
- result document UUID, revision UUID and canonical content SHA-256 only after
  success;
- created, updated, started and finished timestamps;
- `shadow_only=true`.

`initiating_session_id` must store the exact private UUID, not only a hash. The
success transaction must use that UUID with `owner_user_id` to re-read the
current `auth.sessions` and `auth.users` eligibility state. It intentionally
has no foreign key to `auth.sessions`: revocation or session cleanup must not
cascade-delete audit metadata, and a missing row must fail revalidation. The
session UUID is never included in a client DTO, acknowledgement, URL, log,
analytics event or error.

The table stores neither a raw idempotency key nor an owner supplied by a
request body. Owner and initiating session are supplied only by the trusted
server authentication boundary.

### 3.3 Metadata-only attempts

The private `attempts` blueprint records:

- attempt UUID, job UUID, owner UUID and monotonically increasing attempt
  number;
- worker identity or its digest;
- lease-token SHA-256, never the raw lease token;
- bounded attempt status;
- lease acquisition, heartbeat and expiry timestamps;
- the timestamp of a successful payload-use authorization for that exact
  attempt and lease, without copying session or proof content;
- selected prompt, model, parser and policy versions;
- provider-output and canonical-content digests, never provider output;
- allowlisted failure code and terminal timestamps.

A composite foreign key on `(job_id, owner_user_id)` must bind every attempt
to the same owner as its job, and `UNIQUE (job_id, attempt_number)` must keep
attempt ordinals monotonic and non-duplicated. A partial unique index must allow
at most one active attempt for each job.
Attempt rows are append-oriented audit records: a heartbeat may update only the
active lease fields, and a terminal attempt cannot be reopened or overwritten
with another provider outcome.

## 4. Raw facts and payload-vault blocker

The worker cannot resume after a process restart unless it can retrieve the
reviewed cleaned facts. Those facts are sensitive content. Existing privacy
proofs deliberately persist only the canonical facts hash and sanitized
finding/decision metadata; the generation job tables must not weaken that
boundary by adding `cleaned_facts jsonb`.

Activation is blocked until all of the following are frozen and tested:

- the payload-vault backend and its private, non-URL locator contract;
- encryption and key/version management;
- who may decrypt and for which single job/attempt purpose;
- maximum queued, running, terminal and error retention;
- purge on success, failure, cancellation, timeout and account deletion;
- crash-safe purge retry and evidence without copying content;
- backup, restore and disaster-recovery retention;
- handling of an unavailable, expired, missing or digest-mismatched payload;
- prohibition of payload, tokens and decrypted facts in logs and diagnostics.

Until this decision exists, a schema can describe metadata but no route or
worker may enqueue a durable real-model job. A job stores only the payload UUID
and immutable policy bindings. The locator remains inside the vault boundary;
neither a claim nor a client-facing response returns it or treats it as a
bearer token.

## 5. Claim, lease and recovery semantics

Claiming uses a short database transaction and `FOR UPDATE SKIP LOCKED` so
parallel workers select different eligible jobs without waiting on one another.
The claim transaction only locks and changes database state; it must commit
before any model, STT, network, vault or filesystem call begins.

Within the claim transaction, the scheduler:

1. chooses one eligible queued or recoverable job in deterministic order;
2. closes an expired active attempt as an allowlisted recovery outcome;
3. creates the next attempt number;
4. generates a fresh opaque lease token, stores only its SHA-256 and returns
   the raw token once to the trusted worker, without returning a payload
   handle;
5. sets the lease expiry from an approved server-owned setting;
6. changes the job to `RUNNING` and commits.

The raw lease token is never a client acknowledgement field and must not enter
logs. If the claim response is lost, no worker may reconstruct the token from
the database; the attempt becomes recoverable only after lease expiry.

Claiming a lease does not authorize access to sensitive facts. Before payload
retrieval, decryption or a provider call, the worker must invoke a separate
privileged payload-use boundary bound to the exact job, attempt, lease token
and database transaction time. That short transaction must fresh-read the
initiating `auth.users`/`auth.sessions` eligibility and the exact privacy proof,
including owner, Note type, facts hash, schema, status, policy/revision and
expiry. Only a successful transaction may record payload authorization on that
exact attempt and issue a short-lived, single-consumption grant identifier.
The vault consumes that grant without exposing its internal locator to the
worker API. A failed session or privacy check atomically
closes the attempt and job with the corresponding allowlisted failure code,
starts no provider work and makes the payload unavailable. A future database
implementation may combine claim and payload authorization into one short
transaction, but it must never expose a handle before both fresh checks pass.

Heartbeats require the active attempt and matching lease-token digest. They may
extend a lease only within approved bounds and cannot revive a cancelled or
terminal job. Failure and cancellation atomically close the attempt and job.
Late provider output is discarded whenever the job is no longer `RUNNING`, the
attempt is no longer active, the token does not match or the lease has expired.

All job operations use one lock order to avoid deadlocks:

1. job row;
2. active attempt row;
3. initiating Auth session/user and privacy-proof rows;
4. canonical document/revision rows;
5. sync change, mutation receipt and provider-evidence metadata;
6. payload metadata and purge-outbox row;
7. terminal attempt and job update.

All time comparisons use the database transaction clock; RPC callers cannot
supply or backdate an authoritative time. No transaction may remain open
across a model call. Recovery must be bounded by
an approved attempt limit and backoff policy; both remain activation blockers
rather than guessed defaults.

## 6. Response-loss and replay

Enqueue uniqueness is `(owner_user_id, idempotency_hash)`. A replay with the
same request hash returns the existing metadata-only job acknowledgement; a
different request hash fails with `IDEMPOTENCY_CONFLICT`.

Success response loss is recovered from the job's persisted result binding. A
repeat commit with the same job, active/terminal attempt identity and canonical
content hash returns the existing metadata-only result. It must never create a
second document or revision. A different result hash, lease token, owner,
session, proof or request binding fails closed.

## 7. Atomic success transaction

The success RPC is written to complete all of these operations in one short
database transaction. Its scripted transaction/rollback contract passed on
deleted disposable `r9`; it remains unreachable and unproved as a runtime path:

1. assert the database capability is enabled, shadow-only and called through
   the exact reviewed privileged boundary;
2. lock the private job and active attempt in the global lock order;
3. verify owner, `RUNNING`, attempt identity, lease-token digest, unexpired
   lease and payload authorization recorded for that exact attempt using the
   database transaction clock, or return an already persisted identical
   success replay;
4. revalidate the exact initiating session UUID and owner against fresh
   `auth.sessions` plus trusted `auth.users` provider eligibility;
5. revalidate the exact owner, Note type, cleaned-facts hash, schema/version,
   confirmed status, scanner revision and unexpired privacy proof;
6. validate the complete canonical NoteContent shape and recompute the
   canonical UTF-8 SHA-256 inside the database boundary;
7. create the canonical `ai_documents` row with no prior placeholder document;
8. create revision 1 with `base_revision_id=null`, the exact privacy proof and
   a server-owned mutation identifier;
9. update the document's current revision, then create the sync change and a
   `CREATE_DOCUMENT` idempotent mutation receipt;
10. persist the validated, content-free provider-evidence digest on the exact
    attempt;
11. logically revoke the payload metadata and enqueue its idempotent physical
    purge without performing any external vault call in the transaction;
12. bind the real document/revision/content hash to the attempt and job and mark
    both `SUCCEEDED`;
13. return a metadata-only `SERVER_ACKNOWLEDGED` result only after every row
    above exists in the same committed transaction.

Any exception rolls back every operation above. Failure, cancellation, expired
lease, revoked session, stale privacy proof, hash mismatch or invalid output
must leave zero new canonical, revision, sync or receipt rows. The transaction
does not create a checkpoint yet: the existing checkpoint job foreign key
targets the incompatible historical `public.generation_jobs`, so a new
versioned checkpoint binding requires a separate design.

Points remain completely outside this transaction. Later settlement may commit
only after this transaction has persisted a usable canonical revision; every
failure, cancellation or timeout must release a reservation to its original
lots.

## 8. ACL, RLS and RPC exposure

The three foundation tables, nine additive worker metadata tables, the later
admission-binding table and the retirement ledger enable **and force** RLS as
defence in depth. The
foundation had no policy at its historical schema-only checkpoint; the worker
owner-runtime and retirement migrations define only the command-specific
policies required by their private RPCs.
`FORCE ROW LEVEL SECURITY` makes the table owner subject
to policies, but it does not constrain a superuser or a role with
`BYPASSRLS`. Therefore the schema/table owner is distinct from the reviewed
definer executor, and the executor must be `NOLOGIN`, `NOSUPERUSER` and
`NOBYPASSRLS`. Future private policies may name only that exact executor and
permit only the operations required by reviewed wrappers. Schema and table privileges
are revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`; API
roles receive neither private schema usage nor direct table access.

The owner-runtime migration does not widen the worker executor. It creates a
separate `careslink_v1_generation_owner_api_executor` with `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`, and grants it only the reviewed
schema, column, helper and RLS surface needed by admit/enqueue, status and
cancel. Function ownership is not a caller grant. No API role or application
credential may assume either executor.

The retirement migration similarly creates the separate
`careslink_v1_generation_registration_control_executor` with `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. It owns only the reviewed
graceful-retirement control RPC and its narrow table/RLS surface. It is not a
worker executor, owner API, caller credential or emergency-revocation role.

On PostgreSQL 16+, a non-superuser creator with `CREATEROLE` automatically
retains an admin-only edge to each new dedicated role. That edge is not runtime
authority: the migration and assertions require `INHERIT=false` and
`SET=false`. The separate non-inheriting `SET` edge needed for ownership
transfer and owner-default-ACL hardening is scoped to the migration grantor and
revoked before completion. A hosted non-superuser migration actor enters a
bounded `SET ROLE` window so the dedicated owner alters its own global defaults,
then restores the transaction-captured migration entry actor explicitly. It
must not use `RESET ROLE`, because a Hosted CLI connection may have a transport
`session_user` that differs from the entry actor. API roles and the executor
are forbidden as members.

Every privileged function must be narrowly typed, owned by the reviewed
non-login executor role, declared `SECURITY DEFINER`, and use
`SET search_path = ''`.
Public wrappers must repeat the expected role/feature/session checks even though
ACL is the primary invocation boundary. Function creation is immediately
followed by explicit revocation from all API roles to remove PostgreSQL's
default `PUBLIC` execute privilege.

This source-only batch grants **no `EXECUTE`** to `service_role`, authenticated
users or any other API role. A later activation migration may grant only the
minimum exact worker signatures after the exact migration and assertions pass
on a disposable Preview. The current RPCs and private helpers are not directly
callable by an API role and are not in a Data API-exposed schema.

The existing authenticated direct SELECT on historical
`public.generation_jobs` must be revoked before any route could treat job status
as live data. User-facing job reads must go through a fresh-session-validating,
metadata-only adapter rather than direct PostgREST table access.

## 9. Migration boundaries

Supabase CLI 2.115.0 was used locally to generate the filename with:

```text
supabase migration new add_v1_note_generation_durable_shadow
```

The exact returned file is
`supabase/migrations/20260820135834_add_v1_note_generation_durable_shadow.sql`.
It remains additive, default-off, Production-unapplied and free of top-level
transaction syntax because the migration runner owns the transaction.

The first migration contains only the private metadata foundation described
in section 3. It grants no schema/table/function privilege to the future
executor, `PUBLIC`, `anon`, `authenticated` or `service_role`. It deliberately
contains no lease duration, retry budget, provider/model selection, payload
TTL, vault/KMS choice or purge SLA.

The same CLI workflow subsequently generated
`supabase/migrations/20260821071044_add_v1_note_generation_worker_rpc_shadow.sql`.
That additive source extends jobs/attempts and creates nine private metadata
tables: worker/provider/payload policy catalogs, worker registrations and
five-Note provider bindings, payloads, one-time grants, provider evidence and
the purge outbox. It creates the nine exact private claim, heartbeat, fence,
success-commit, failure-settle, resolve, recover, payload-authorize and
payload-consume identities. It seeds no catalog, registration or payload,
leaves the settings capability hard-off and grants no caller `EXECUTE`.

All RPCs are owned by the distinct executor, are `SECURITY DEFINER`, fix an
empty `search_path` and use database time. Executor table rights and RLS
policies are command-specific; API roles and `service_role` retain no private
schema/table rights or function execution. Deleted disposable `r9` supplied
isolated PostgreSQL 17.6 schema, ACL and scripted transaction evidence for this
boundary; it is not a retained database or runtime execution path.

Because the vault backend, KMS, retention and purge operator remain undecided,
normal payload consume can only settle `DENIED_SETTLED` /
`PAYLOAD_UNAVAILABLE`. It returns no `vaultGrant`, locator, bearer token or raw
facts. The SQL assertion's direct rollback-only `TEST_ONLY` transition of a
grant to `CONSUMED` exists solely to exercise canonical transaction atomicity;
it is not a vault/payload-consume E2E path.

The later additive owner-runtime file is
`supabase/migrations/20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql`.
It creates no route, connection, environment lookup, active policy binding or
API execute grant. Its three exact `SECURITY DEFINER` identities admit and
enqueue, return owner-safe status and cancel. New admission remains default-off;
status and cancellation intentionally remain available while that admission
switch is off so accepted work can be recovered or stopped during an incident.

The fifth additive generation file and repository migration #29 is
`supabase/migrations/20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql`.
It preserves immutable digest-bound `APPROVED` registration rows and records
graceful retirement in a separate append-only ledger. The exact control RPC
requires one fixed reason plus the exact unique, sorted active-binding version
set, retires that set atomically and blocks only new owner admission and worker
claim. It does not block existing-attempt heartbeat, fence, payload
authorize/consume, success commit, failure settle, resolve or recovery, nor
owner status/cancel. It creates no seed, retirement, caller `EXECUTE` grant,
route, credential, activation or emergency-revocation capability.

## 10. Disposable Preview assertion gate

Before any execute grant, route, worker or model integration, the exact source
revision had to clean-apply to a disposable non-Production Preview. Deleted
`r9` closed that gate for PostgreSQL 17.6. The foundation-only revision
established the rollback checks below; the additive-aware foundation assertion
preserved that subset while the worker assertion owned the extension's exact
objects and privileges:

- `server_version_num >= 160000`; this migration intentionally uses the
  PostgreSQL 16+ role-membership option syntax and has no pre-16 compatibility
  branch;
- namespace absence preflight, distinct expected schema/table owner and
  executor roles, safe admin-only creator edges with no `SET`/`INHERIT`, exact
  ACL/default ACL and exact private object set;
- `relrowsecurity=true` and `relforcerowsecurity=true` on every private table,
  zero schema/table privileges for all API roles and the future executor, and
  executor `rolcanlogin=false`, `rolsuper=false` and `rolbypassrls=false`;
- for the historical foundation-only object set, exactly zero private or public
  wrapper functions, views, triggers and policies and no executor object
  privilege; for the additive revision, exact worker-owned policies/functions
  and command-scoped executor rights are checked by its separate assertion;
- no `PUBLIC`, anon, authenticated or `service_role` private schema/table/RPC
  privilege in either revision;
- exact metadata-only columns, state/hash/time constraints, composite owner
  foreign keys, one active-attempt index and deterministic claim-order index;
- no raw facts, canonical content, provider output, transcript, token, URL,
  locator, raw idempotency key, arbitrary error text or `jsonb` column;
- the default-off settings row and absence of operational policy values;
- invalid hashes, states, terminal shapes, owner bindings, duplicate attempt
  ordinals and duplicate active attempts fail closed;

The RPC/payload assertion extended those checks and ran as one rollback-only
request on deleted `r9`. The cases below were initially established as serial,
fixture-backed PostgreSQL 17.6 evidence. Deleted `r20` later added
independent-session evidence only for the three races called out below; neither
gate is runtime behavior:

- no unsafe public overload and no unreviewed execute privilege;
- every definer function has a fixed empty search path and allowlisted owner;
- owner A/B isolation and metadata-only acknowledgements;
- exact top-level acknowledgement keys plus allowlisted nested fields and
  persisted relationships; before activation, add database vectors that reject
  unknown or missing keys at every nested envelope level, matching the stricter
  TypeScript adapter parser;
- initiating-session UUID mismatch, missing/revoked/expired session, deleted or
  banned user, anonymous/unconfirmed/non-provider user;
- wrong-owner, wrong-type, wrong-hash, wrong-schema, expired and revoked privacy
  proofs;
- same-request replay and changed-request idempotency conflict;
- deterministic `SKIP LOCKED` claim structure, a single-active-attempt
  invariant and monotonically increasing attempts; `r9` did not prove a true
  two-worker claim race, while `r20` later proved it on PostgreSQL 17.6;
- wrong/stale lease token, heartbeat bounds, lease expiry and recovery;
- scripted session revocation or privacy-proof expiry between enqueue and
  claim cannot issue or consume a payload-use grant, decrypt facts or start
  provider work; `r9` did not prove the corresponding two-connection lock
  races, while `r20` later proved them on PostgreSQL 17.6;
- cancellation and late provider-result rejection;
- claim-response and success-response loss replay;
- Attempt 1 settle/resolve replay while Attempt 2 is running, after Attempt 2
  succeeds and after payload plus purge-outbox advancement to `PURGED`, with
  exact Attempt 2 commit/resolve replay and stale Attempt 1 commit fencing;
- canonical document + revision 1 + sync change + `CREATE_DOCUMENT` receipt +
  provider-evidence digest + payload logical revocation + purge outbox +
  terminal attempt/job atomicity, including injected failure at every
  boundary;
- zero canonical output after failure, cancellation, stale proof, revoked
  session or transaction rollback;
- identical commit replay remains one document/revision, while changed output
  is rejected;
- payload locator remains vault-private; only an attempt-bound one-time grant
  is consumed, and the payload is logically revoked and physically purged
  according to the eventually approved vault/retention contract;
- account deletion remains compatible with logical revoke and durable purge
  outbox evidence without losing required audit/reconciliation bindings;
- policy catalog and registration rows remain immutable while historical
  attempts reference their digests, or attempts gain a reviewed registration
  foreign key plus lookup index before catalog lifecycle operations exist;
- no Points RPC, ledger or wallet mutation.

The same exact revision must then pass the existing canonical JSON vectors,
active-session tests, privacy tests, owner A/B RLS tests and revoked-session
cleanup tests. Deleted `r20` closed the true two-session/two-connection claim
and concurrent session/privacy-revocation race subset on PostgreSQL 17.6; the
deleted `r21` gate subsequently closed the Attempt-2 historical-replay subset.
The later local PostgreSQL 16.15 gate closed the current database-engine,
serial and true-two-session version path. The worker-half owner A/B database
boundary is now closed; the full admission/enqueue/status/cancel runtime
repository remains open. Preview evidence for an earlier migration revision is not promotion
evidence for this design.

## 11. Current evidence boundary

The earlier source-only handoff was produced offline. This schema batch
rechecked the current official Supabase CLI, migration, Data API, RLS,
Postgres-role and function-security documentation before implementation.
Supabase CLI 2.115.0 generated the local filename. A first clean-apply attempt
then used a fresh non-default `with_data=false` Supabase branch on PostgreSQL 17
(`server_version_num=170006`). Because the parent migration history was not a
strict repository prefix, 13 exact local source SQL files were submitted
individually in source order. The first 12 succeeded; this metadata migration
failed with PostgreSQL `42501 permission denied to change default privileges`
at its owner default-ACL step.

Read-only post-failure checks found neither the generation schema nor either
generation role, confirming atomic rollback of the failed migration. The exact
disposable branch was deleted and its absence verified. Production was not used
as the SQL target, and no deployment, runtime capability or execute grant was
added or enabled. This is failure/cleanup evidence, not successful Preview
evidence.

The repaired revision used for that historical gate had the dedicated owner
alter its global defaults inside a temporary `SET ROLE` / `RESET ROLE` window
and did not repeat the schema revoke after the migration actor transferred
ownership. A second fresh branch clean-applied all 13 exact source migrations;
the earlier `42501` did not recur, so that recorded revision gained execution
evidence rather than source-only inference. Section 16 records the later
Hosted-CLI role-topology correction; this paragraph is not evidence for that
newer source.

The rollback-only assertion then failed inside its transaction because
PostgreSQL 17's `information_schema.table_constraints` includes generated NOT
NULL names as well as the declared constraint names. A transaction-local
comparison showed the expected declared set in `pg_constraint`. The assertion
rolled back and the exact disposable branch was deleted. Production was not
used as the SQL target.

The repaired assertion uses `pg_constraint` with exact schema/table/ordinary-
table filtering. A third fresh non-default `with_data=false` PostgreSQL 17
branch clean-applied all 13 exact source migrations and passed that full
same-request rollback assertion. Post-rollback inspection also passed the
expected `NOLOGIN`/non-privileged role topology, bootstrap membership edges,
forced-RLS/default-ACL checks, forced-off settings row, zero fixture/business
rows and absence of private-schema policies, functions, views, non-internal
triggers and API/executor privilege leaks. The security and performance advisor
review had no generation warning/error; only the expected informational
RLS-with-no-policy and zero-row unused-index findings remained.

Four adjacent rollback suites then passed on `r3`: V1 shadow, NDIS integration,
mobile sync and privacy review. The Portal Referral rollback suite failed with
`VALIDATION_ERROR` because its older canonical-revision fixture lacked the
privacy proof/facts binding required by the newer trigger; its transaction
rolled back. The complete exact-revision cross-domain gate was therefore still
incomplete at the end of the third attempt. The `r3` branch was deleted and its
absence was verified. Production was not used as the SQL target, and no
deployment, runtime flag, capability or API/executor grant was added or enabled.

### Fourth disposable Preview result

At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`, fresh PostgreSQL 17
branch `careslink-note-durable-preview-20260821-r4` was non-default,
`persistent=false` and `with_data=false`, with parent default
`adocsnwnslxhxcjgbyee`. Its id was
`ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b` and project ref was
`czqdjqdjghmmzukstprt`. The same reviewed 13-file source manifest applied 13/13.
The durable assertion and all five adjacent suites passed 6/6, including the
repaired privacy-bound Portal Referral fixture against the current trigger.

Post-rollback checks passed the recorded zero-row matrix across Auth/session,
legacy, canonical, sync/NDIS, Points/migration, Portal, generation and assertion
fixtures; only the expected forced-off seed/catalog rows remained. Both
generation roles retained the reviewed non-login, non-privileged topology, all
three tables retained RLS plus FORCE RLS, and the private schema retained zero
policies, functions, views, non-internal triggers and API/executor privilege
leaks. Generation, Portal and mobile-sync flags remained disabled and
shadow-only. Generation-scope advisors returned exactly three informational
no-policy and seven informational unused-index findings, with zero
warning/error.

The exact `r4` branch was deleted; subsequent branch listing contained neither
its id nor ref, while parent default `adocsnwnslxhxcjgbyee` still existed.
Production was not the SQL target, and no Production action, migration,
deployment, flag/capability change or grant occurred. This result proves only
the exact schema/cross-domain assertion gate. It does not implement or enable a
callable RPC, durable worker, model/STT integration, Points settlement or user
flow.

The source-only registered-worker database adapter may validate a composite
atomic acknowledgement. Deleted `r9` proved the scripted database row and
rollback relationships for the exact current migration, but it did not prove a
retained runtime transaction, caller credential, vault grant or real purge
operation.

## 12. Current worker RPC source handoff

The paragraph above closes the historical deleted-`r4` foundation result. The
current worktree contains the CLI-generated worker RPC migration described in
section 9 and
`supabase/assertions/v1_note_generation_worker_rpc_shadow_assertions.sql`.
`supabase/assertions/v1_note_generation_durable_foundation_assertions.sql` is
also additive-aware so it can retain the foundation subset after the worker
extension is installed. At source HEAD
`c7b70e9f84b9b804779039711b85cc7eda55bd57`, disposable PostgreSQL 17.6 `r9`
(`v1-note-worker-rpc-r9`; id
`a1571c30-a322-4cea-b332-b189804df195`; ref
`hyczevivoakmflswmwlb`) clean-applied 14/14 migrations and passed the five
adjacent, durable and worker rollback suites 7/7.

The worker assertion installs transaction-only `TEST_ONLY` policy,
registration, Auth/privacy and job fixtures after proving the real migration's
empty catalogs, hard-off setting and private ACL posture. Its source checks
claim/lease/recovery, authority denial, retries, response-loss replay, canonical
success/rollback and composite acknowledgement-to-row relationships. It
temporarily marks a grant `CONSUMED` only to reach the canonical atomicity
fixture; the real consume RPC remains permanently fail-closed as
`DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE` and exposes no vault capability.

The independent postcheck retained 12-table owner/RLS/FORCE-RLS posture,
hard-off flags, empty Auth/canonical/generation/catalog/registration/payload/
grant/evidence/outbox/Points/Portal fixtures, exact non-login/non-superuser/
non-`BYPASSRLS`/non-inheriting roles, denied API ACLs and nine executor-only
`SECURITY DEFINER` RPCs with `search_path=''`. Generation-scope advisors had
zero security findings and zero performance WARN/ERROR. Its 20 performance
INFO findings were 14 [unindexed composite foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and 6 [unused fresh indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
which require load-time review rather than mechanical indexing. Global advisor
results were not all green: security was 23 INFO + 3 pre-existing public
security-definer WARN ([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable));
performance was 144 INFO + 11 WARN.

Independent review reported P0/P1/P2(delete) = 0. The exact `r9` branch was
deleted and both its ID and ref were absent afterward; Production
`adocsnwnslxhxcjgbyee` remained the default branch and healthy, and was never a
SQL target. This is disposable schema/transaction/assertion evidence only.

The local source gate passed:

| Command | Result |
|---|---|
| adjacent Note generation tests | 10 files / 348 tests passed |
| `pnpm test` | 122 files / 1,337 tests passed; preserves 121 / 1,294 and the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 63/63 |

Deleted no-data `r20` subsequently exercised the same worker-RPC revision with
two persistent PostgreSQL 17.6 sessions and distinct backend PIDs through the
Supabase Session Pooler. Client TLS used `sslmode=verify-full` and the Supabase
Root 2021 CA. Its temporary least-privilege runner could execute only eight
fixed zero-argument `TEST_ONLY` helpers and the three real claim, authorize and
consume RPCs; it had no sensitive table DML or owner/executor membership.
`SKIP LOCKED`, session-revocation-first and privacy-authorization-first races
all passed. Cleanup committed `NOLOGIN`, drained only the exact idle pooler
backends, removed the fixed fixtures/support schema/runner, passed an
independent zero/posture postcheck and deleted the Preview. Production was
never the SQL target. The detailed evidence and advisor counts are recorded in
`documentation/tests.md`.

At base HEAD `000f17af88eff9266a92e484ba2080335d20fd2d`, deleted
no-data PostgreSQL 17.6 `r21` (`v1-note-worker-rpc-r21`; id
`688da83b-78e8-45fa-8646-b015822d59b0`; ref
`kfgjxlilotpaxnozomqq`) was non-default, `persistent=false` and
`with_data=false`. Its confirmed Preview creation rate was US$0.01344/hour;
because the branch was deleted, no ongoing charge or accrued total is inferred.
The exact 146488-byte rollback assertion body had SHA-256
`bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`;
14 migrations applied 14/14 and the adjacent, durable and worker rollback
suites passed 7/7.

The fixed scenario reproduced the exact Attempt 1 settle/resolve
acknowledgements while Attempt 2 was `RUNNING`, after Attempt 2 reached
`SUCCEEDED`, and after the payload plus purge outbox reached `PURGED`. Attempt
2 commit and resolve replayed exactly, a fully valid stale Attempt 1 commit was
rejected with `LEASE_EXPIRED` and expired recovery returned zero. Before
Attempt 2 succeeded the directed side effects were absent; after success, every
subsequent replay and purge stage retained one canonical document, revision,
sync change, mutation receipt, provider-evidence row and purge-outbox row. The
independent postcheck
retained hard-off, zero fixtures, 12 private tables, nine private RPCs, denied
API table/RPC access and two admin-only role-creator edges. Advisor results
matched deleted `r9`. The branch was deleted; Production remained healthy and
was never the SQL target. This closes Attempt-2 historical replay only and
creates no retained Preview or runtime/Production capability.

### Attempt-registration historical retention gate — 2026-08-24

Supabase CLI 2.115.0 generated the additive fifteenth migration
`20260823213144_harden_v1_note_generation_registration_retention.sql`. The
design chooses the reviewed database-enforced retention option: every
historical `attempts.registration_digest` now references the exact immutable
`worker_registrations.registration_digest` through the named
`attempts_registration_catalog_fk`. The constraint uses explicit `ON UPDATE
RESTRICT` and `ON DELETE RESTRICT`. It is added `NOT VALID`, so new orphaned
history is rejected without an eager initial table scan, and is then explicitly
validated so any pre-existing missing registration fails the migration closed.
The non-unique B-tree `attempts_registration_digest_idx` supplies the required
referencing-side lookup path.

`NOT VALID` is a fail-closed validation shape, not an online low-lock promotion
claim. The ordinary index build and same-transaction validation can block
writers. The current capability is hard-off with no runtime writer; any future
data-bearing promotion needs its own maintenance, zero-row or separately
reviewed online-DDL plan.

The static migration contract locks the exact constraint, validation and index
shape. The rollback assertion inspects the live catalog metadata, then proves
that changing a historical attempt to a missing registration digest and deleting
an in-use worker registration are both rejected by the exact named foreign key.
It verifies that the failed subtransactions leave the registration, all five
provider-policy bindings, attempts and payload grants at their original counts.
This is retention enforcement only: the migration adds no catalog lifecycle
RPC, seed, caller grant, registry/runtime entrypoint or capability flag, and it
does not apply or authorize a Production change.

At exact source HEAD `4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf`,
disposable PostgreSQL 17.6 branch `r22` (`v1-note-worker-rpc-r22`; id
`0bc8db56-0e4a-42ec-9595-1f32a3d74a6b`; ref
`wuzcjcfrkctelcnbbgtg`) was non-default, `persistent=false` and
`with_data=false`. Its confirmed Preview creation rate was US$0.01344/hour.
The exact current durable-foundation assertion body was 37547 bytes with
SHA-256 `2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`;
the exact current worker-RPC assertion body was 153956 bytes with SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`.
All 15 migrations applied 15/15 and all seven rollback suites passed 7/7.

The independent postcheck proved the exact validated `RESTRICT` foreign key and
valid/ready non-unique registration-digest index, all 12 private generation
tables, all nine private RPC identities, hard-off settings, zero checked data
and fixture rows, denied API table/RPC access and only the two expected
admin-only creator edges. Security advisors reported 26 global findings (23
INFO + 3 pre-existing WARN) with zero generation findings. Performance
advisors reported 155 global findings (144 INFO + 11 WARN); generation scope
contained 20 INFO (14 unindexed foreign keys + 6 unused indexes) and zero
WARN/ERROR. The exact `r22`
branch was deleted, so no ongoing charge or accrued total is inferred.
Production remained the healthy default parent, was never the SQL target and
was otherwise untouched.

This closes the PostgreSQL 17.6 hosted registration-retention gate for the
current revision. The deleted `r9`, `r20` and `r21` results above remain evidence
only for their recorded revisions and are not rewritten as evidence for this
migration.

### PostgreSQL 16.15 local isolated gate — 2026-08-24

On a worktree based on HEAD
`93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea`, a disposable Homebrew
PostgreSQL 16.15 server (`server_version_num=160015`) applied the clean
repository sequence 27/27: 12 pre-V1 migrations followed by the exact current
V1 manifest 15/15. All seven rollback suites passed with the current durable
assertion body (37547 bytes; SHA-256
`2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`)
and worker assertion body (153956 bytes; SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`).
The independent postcheck proved all 12 private generation tables, nine worker
RPCs, hard-off state, zero checked fixtures, API denial, only the two expected
admin-only creator edges and the exact validated registration-retention FK plus
index.

The strict local-only harness connected to loopback `127.0.0.1:55432` without
TLS, a password or any credential material and held two distinct backend PIDs.
It passed the 3/3 `SKIP LOCKED`, session-revocation-first and
privacy-authorization-first races. Its fixed setup and cleanup bodies had
SHA-256
`ba183bacf8b35a2493b520563ce2fe2d1193e0638af17d2be62c8b58076112bc`
and `e4aa567f372885137f2b0251f51ea1818a5ca329ec9ed8a9a9f8355cc3ecbecb`;
the two focused files passed 59/59 and the complete Preview E2E policy suite
passed 3 files / 72 tests. Fixed SQL cleanup removed the database runner,
`TEST_ONLY` helper surface and fixtures. The outer gate then stopped the server
and deleted the exact cluster directory, Colima profile and disk. The
complete current source handoff also passed 125 files / 1,400 tests, TypeScript,
full lint, the 63/63-page Next production build and the 73-file Codex-adapter
sync check.

Supabase CLI 2.115.0 accepts local `db.major_version` only for 13, 14, 15 and
17. This result therefore comes from vanilla PostgreSQL 16 plus the minimum
Supabase-compatible roles, Auth stubs and `pgcrypto` surface used by these
migrations. It closes the PostgreSQL 16 database-engine, serial and
true-two-session compatibility gate, but does not claim GoTrue, PostgREST,
`supautils`, Advisors or hosted Supabase parity. Production was never a target,
and no deployment, grant, runtime activation or paid resource was created.

The pre-harness registration-retention source gate passed the three focused
migration contracts (39/39), the full 125-file / 1,381-test suite, lint,
TypeScript, the 63/63-page Next production build, the 73-file Codex-adapter sync
check and `git diff --check`. Those historical source results are static/local
evidence only; the later strict-local batch's current 1,400-test result is
recorded above.

Independent review of this current source batch found no P0/P1/P2; the prior
`r21` final source/security review also reported no P0/P1. Remaining
activation governance is explicit, not a hidden default:

- add database exact-key vectors for every nested acknowledgement envelope;
  the SQL helpers currently lock top-level keys and validate allowlisted nested
  fields/row relationships, while the TypeScript adapter parser is stricter;
- prove account-delete, logical revoke, purge-outbox retry and cross-state
  recovery retain the required audit/reconciliation evidence;
- before any real provider call, bind provider `startedAt` to a successfully
  consumed grant and recheck post-consume lease/heartbeat freshness;
- before any executor caller can be treated as untrusted, harden sequential
  JSON numeric parsing with explicit type, regex and safe-cast gates rather
  than relying on expression evaluation order.

Deleted `r9` closed the PostgreSQL 17.6 serial assertion, role/ACL/function,
scripted-fault and zero-fixture gates. Deleted `r20` subsequently closed the
PostgreSQL 17.6 true two-session `SKIP LOCKED` claim and session/privacy-
revocation race gate. The local PostgreSQL 16.15 run subsequently closed the
current engine/serial/true-two-session version path. The worker-half
adapter-to-database boundary is recorded below, and the later
admission/enqueue/status/cancel source/local-SQL closure is recorded in section
14. Deleted `r21` closed the Attempt-2 historical
replay gate. The current source batch chooses and implements the registration
retention FK/index design, and deleted `r22` closes its exact PostgreSQL 17.6
hosted gate. Attempt listing, nested exact-key vectors, account-delete/purge and
orphan recovery, provider-start binding, numeric parsing and the runtime/vault
governance items above remain open before any caller grant or registry entry.
Only after those results and the vault/KMS/retention, worker
credential, model/provider/STT and Points decisions are separately approved
may runtime activation be considered. Nothing in this handoff authorizes
Preview retention, Production apply, route activation, model/STT traffic or
Points settlement.

## 13. Worker-half owner A/B database integration boundary — 2026-08-24

This recorded checkpoint closes the narrowly defined worker-half owner A/B runtime
integration boundary. The existing default-off registered-worker composite
adapter is joined through `note-generation-registered-worker-postgres.server.ts`
to the exact nine private database RPC identities using an explicitly injected,
server-private query port. That source-only port creates no connection, pool,
environment lookup, role or grant. Claim and authority calls supply no owner,
initiating session, authoritative time, duration, retry budget, raw payload or
locator. Lease-bound calls intentionally carry an opaque lease token, and the
success commit intentionally carries canonical NoteContent. Owner A and owner B remain bound by database-owned
job, attempt, payload, grant and privacy relationships, and cross-owner
composition must fail closed without exposing private row content.

This worker-half boundary was not the complete implementation of
`CaresLinkV1NoteGenerationDurableRepository`. In particular, it does not add
owner admission or enqueue, private idempotency lookup, owner-safe status/read,
attempt listing or cancellation. It also adds no caller credential or execute
grant, runtime registry entry, scheduler, route, payload vault, real provider,
model/STT call, Points settlement or activation flag. Every application
readiness latch and the Production/default database state remain off. Fixed
TEST_ONLY setup temporarily enabled the disposable local private setting only
for the live window; cleanup restored its hard-off constraint. The migrations
remain Production-unapplied. Section 14 records the later owner source/database
boundary; it does not retroactively widen this worker gate.

Normal payload consumption remains fail-closed until the vault/KMS/retention
contract exists. The disposable, cleanup-bounded `TEST_ONLY` consumed-grant bridge used to
exercise a composite success acknowledgement remains scripted integration
evidence only and must not be described as payload-vault, purge or provider E2E.

The isolated execution used source base
`ec29430dec7a79c611a552a52e36277e3512166e` and a fresh vanilla PostgreSQL
16.15 cluster on passwordless loopback `127.0.0.1:55432`. All 27 current
repository migrations applied and the expected 12 private tables, nine RPCs,
hard-off setting and zero generation rows were present before setup. The
temporary worker role was non-superuser, `NOINHERIT`, `NOBYPASSRLS`, connection
limit 1, with no effective application-table or `TEMPORARY` privilege or
owner/executor membership. Exact ACL allowlists admitted only each function
owner plus the runner for nine RPCs and eight fixed helpers. Management SQL was
bound to the exact local data-directory pattern, cluster name, bootstrap marker
and application name. This management/bootstrap run does not
replace the earlier non-superuser 27/27 and seven-suite PG16 migration proof.

Setup, quiesce and cleanup SHA-256 values were
`a2b4ddd54acbbc621aa886b70b1c80dfac56de4b722154f4e9820f16b2aeea7b`,
`e6ea88f8a280626c0059ee3a7e9d131382520630f2a7733d3983e5161f2a4ef0`
and `e490809e3c39cb17d8d407399200743378df2b29d84bbd9da35da0cec18ff203`.
The explicit live test passed 2/2. A and B each completed a canonical revision-1
transaction. Cross-job, attempt, payload, issued-grant and lease substitutions failed; B's
committed result was recovered after simulated response loss without commit
retry. C's post-authorization privacy revoke made authorize and consume return
replay-safe `DENIED_SETTLED`; a later settle call replayed the same terminal
`FAILED / PRIVACY_REVIEW_STALE` outcome before vault access. All nine RPCs were observed,
vault calls remained zero, and unqualified owner projections were A=1, B=1 and
C=0. The A/B grant bridge only marked two fixed metadata rows `CONSUMED`; it
released no payload capability and is not provider, purge or vault E2E.

The final source gate passed four focused files / 80 tests, the Preview E2E
policy suite 4 files / 75 tests, and the full suite 128 files / 1,425 tests,
plus TypeScript, full lint, 63/63-page build, 73-file adapter sync and diff
checks. Independent quiesce committed `NOLOGIN`, rejected a new runner
connection and found no runner session. Fixed cleanup then committed and independent postcheck found zero Auth,
privacy, canonical and generation/catalog fixtures, no runner or helper schema,
hard-off settings, restored PUBLIC `TEMPORARY`, zero unexpected RPC ACLs and 9/9
API/service-role RPC denials. The server stopped and
the exact temporary cluster directory was deleted. No hosted database,
Production apply, deployment, paid resource or activation was involved.

## 14. Owner admission/status/cancel source boundary — 2026-08-24

Migration
`20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql` closes the
source/database half of the owner repository without activating it. It creates
the dedicated `careslink_v1_generation_owner_api_executor` described in section
8 and one database-owned `admission_policy_bindings` table. The table is empty
by default: there is no active registration choice, fallback selection or seed.
The existing settings row remains hard-off. The migration and its final ACL
cleanup grant no `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, `service_role`,
the worker executor or an application caller.

The binding is a policy-bundle selector, not a unique-worker allowlist. A
different complete and currently valid Five-Note registration may claim when
its worker policy, payload policy and the queued Note type's provider policy
match the job's frozen subset. Its other four provider policies do not have to
match for that job.

The three new private `SECURITY DEFINER` identities are:

1. `admit_and_enqueue_v1_shadow_note_generation_job(...)`;
2. `get_v1_shadow_note_generation_job_status(...)`;
3. `cancel_v1_shadow_note_generation_job(...)`.

Admission takes the authenticated owner/session/transport plus pre-staged
metadata identifiers and hashes. It owns authoritative time, rechecks the
active session and current privacy proof, selects one exact active admission
binding and validates its complete worker/provider/payload catalogs. Callers
cannot pick policy versions. An owner-plus-idempotency advisory lock serializes
replay and changed-input races. A first acceptance writes the job and `AVAILABLE`
payload metadata in one transaction. An exact replay returns the existing
owner-safe job; changed request content fails with an idempotency conflict, and
same staged payload identity with a changed job/handle/expiry fails with an
identity-link conflict. A different replacement payload ID is not silently
linked and is reported only through the server-private `payloadAccepted`
receipt.

Status and cancellation still require a fresh session, but they do not require
the admission flag to be on. This is intentional incident behavior: disabling
new admission must not strand existing work. Cancellation locks the job before
session/state resolution so it has one linearization point against worker claim
or settlement. `QUEUED` cancellation creates no attempt. `RUNNING`
cancellation terminates the one live attempt; both paths revoke every issued
grant, logically revoke the payload, enqueue one purge-outbox request and finish
the job atomically. Existing contradictory purge state or a broken terminal
shape fails closed with no partial mutation.

The paired `note-generation-owner-repository.server.ts` adapter is server-only,
fixed `false` readiness and constructible only with the exact `TEST_ONLY`
capability, an explicitly injected direct-query function and an authenticated
principal. Its SQL is schema-qualified. It does not read an environment value,
create a URL/connection/pool, use PostgREST or expose internal policy, payload
or locator data. Its public repository shape is enqueue/get/cancel only;
attempt listing is not implemented or claimed.

The disposable local PostgreSQL 16.15 evidence applied #1-#24 and the #26-#28
tail as the non-superuser migration actor, including a fresh exact replay of
final migration #28. The hand-built
minimum Supabase-compatible bootstrap treated #25 as a bootstrap-superuser
ownership transition. Therefore this is not an all-28-migrations non-superuser
claim, and it does not replace the earlier historical PostgreSQL 16.15 evidence
for its recorded revision.

The owner-runtime, additive-aware worker-RPC and durable-foundation assertions
all completed through `ROLLBACK`. The frozen owner assertion is 100936 bytes /
SHA-256
`05a3e4b95559981a1919a4dae83157ecef60f7485c1afd76150199a50f7990b8`
for the full file and 100156 bytes / SHA-256
`c8ad3fca9432afa1410807eec38c4c451ba885713a54ddec15149c26f1706bfa`
for the executable body. The additive-aware worker assertion is 158635 bytes /
SHA-256
`a2c1da6c7a94bd43f5a2d93ce7ecdbe5832fad53e2756d0b0cc4dc1d3b0bfe9c`
for the full file and 154903 bytes / SHA-256
`6ed296b0764cf80b13915758209797d2de8b4a247296652f3ea63ad01bd50b94`
for the executable body.
The independent final postcheck confirmed 13/13 forced-RLS tables, 27 owner
policies, three correctly owned RPCs, 19 direct function `EXECUTE` ACL entries
including those RPCs, one hard-off
settings row and zero rows in the other 12 tables. A real two-connection
auth-session lock wait ended with `P0001 SESSION_REVOKED` after expiry while
blocked.
The final source gate passed 130 test files / 1522 tests, TypeScript, full lint,
the 63/63-page Next production build, the 73-file Codex-adapter sync check and
`git diff --check`.

This closes only the Production-unapplied source and local database boundary.
It is not hosted GoTrue/PostgREST parity, a retained Preview, caller credential
or grant, served route, deployment, model/STT, payload-vault or end-to-end
evidence. Attempt listing, real vault/KMS/retention and orphan recovery, hosted
Auth/Data API validation, account deletion, provider/model/STT integration and
Points remain activation blockers. The subsequent migration below now supplies
graceful registration retirement without changing the immutable `APPROVED`
manifest; emergency revocation remains a separate blocker.

## 15. Worker-registration graceful retirement source/local boundary — 2026-08-24

Migration #29,
`20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql`,
adds `worker_registration_retirements` as the fourteenth private generation
table. Its row is an append-only operational fact linked by restrictive foreign
key to the canonical registration. The worker registration remains immutable,
`status='APPROVED'` and digest-bound; retirement is intentionally not encoded as
`REVOKED` or as a new manifest digest.

The distinct `careslink_v1_generation_registration_control_executor` owns one
private `SECURITY DEFINER` control identity. It is `NOLOGIN`, `NOINHERIT`,
`NOSUPERUSER` and `NOBYPASSRLS` and is not granted to an API, service,
application, worker or owner caller. The RPC accepts only `ROTATED`,
`DECOMMISSIONED` or `POLICY_SUPERSEDED`, plus an operation UUID and the exact
unique, sorted active-binding version list. It uses binding-to-registration
lock order and fresh post-wait reads, changes the confirmed bindings to
`RETIRED` and inserts the ledger fact atomically. Exact operation replay is
write-free; a different operation payload or stale expected set fails closed.

The operational boundary is graceful drain. Retirement blocks a new owner
admission and a new worker claim, with triggers also preventing a new `RUNNING`
attempt or reactivation of a retired registration's binding. It does not
invalidate an existing attempt, whose heartbeat, fence, payload authorization,
consume, success commit, failure settle, resolve and recovery paths remain
available. Recovery may still append terminal `FAILED` history, while owner
status and cancellation continue to function. Emergency revocation of
in-flight authority, grants or payload/purge work is out of scope.

The ledger enables and forces RLS, and its insert path is confined to the
control executor. The migration seeds no retirement or binding and creates no
caller `EXECUTE` grant, route, credential, environment selection, runtime
registry entry, worker deployment, retained Preview or Production capability.
Its dedicated strict assertion passed BEGIN-through-ROLLBACK on the disposable
local PostgreSQL 16.15 harness. It is the ninth current rollback-only suite;
the owner suite had already raised the historical seven-suite inventory to
eight. The final clean gate applied all 29 repository migrations, passed all 9
suites, independently retained 14 forced-RLS tables, four locked generation
roles, hard-off settings and zero generation fixtures, and passed both real
retirement-first and claim-first lock orderings. Historical `r22` manifests and
assertion hashes continue to describe only their recorded revision and are not
rewritten by this handoff.

## 16. Hosted CLI migration-entry role restoration — 2026-08-25

Supabase Hosted may authenticate its migration connection as a transport login
role and enter the database migration actor with `SET ROLE`. In that topology,
`session_user` and the file-entry `current_user` differ. PostgreSQL
`RESET ROLE` returns to the connection default or `session_user`; it is not a
stack pop to the preceding `current_user`. The five Production-unapplied Note
generation migrations #25 through #29 previously contained 25 such exits
(`1 / 7 / 1 / 5 / 11`). A normal Hosted CLI apply could therefore lose the
migration actor after the first dedicated owner/executor window.

Each of those migrations now transaction-locally captures its entry actor in
`careslink.migration_entry_role` before any role switch. Every owner/executor
exit restores the `role` GUC to that captured actor with session scope so the
actor remains correct after the runner commits. Capture is transaction-local
and rolls back with a failed migration. The two #26 auth-reader schema grants
also target that captured actor through identifier-safe `%I` formatting;
neither grant, function ownership nor cleanup relies on the transport
`session_user`.

The same non-superuser PostgreSQL 16.15 run exposed and closed a second #25
ownership precondition. The prospective table owner needs `CREATE` on the
containing schema. #25 now grants that dedicated `NOLOGIN` owner only for the
three table-owner transfers, revokes the grant while the migration actor still
owns the schema, and transfers the schema last. No explicit migration-entry or
transport-login schema privilege remains.

The local gate used a fresh loopback-only cluster with a `LOGIN NOINHERIT`
transport role and a distinct `NOLOGIN CREATEROLE` migration actor. The
rollback-only role/ACL assertion passed, including identifier-safe dynamic
grant and revoke. A separate commit boundary retained the migration actor as
`current_user` after `COMMIT`. The full #25 migration then committed in that
topology: all three tables and the schema were owned by the dedicated owner;
both transport and entry roles had zero schema `CREATE`; the temporary
`SET=true` membership was gone; and only the PostgreSQL 16 admin-only bootstrap
edge (`ADMIN=true`, `INHERIT=false`, `SET=false`) remained. The server was
stopped and the exact temporary cluster directory was permanently deleted.

Four diagnostic no-data Hosted iterations then exposed and closed assertion-
harness defects without changing Production. Hosted enters assertion files as
`current_user=postgres` while retaining a distinct transport `session_user`.
The four generation suites and five ordinary/Portal suites now capture that
entry actor once and use 82 explicit restores instead of bare `RESET ROLE`.
The dedicated restoration suite inspects the temporary ACL directly with
`aclexplode`; an effective-privilege check was invalid because a SET-only role
membership can preserve indirect privilege after the direct ACL is revoked.

The final non-default, `persistent=false`, `with_data=false` Preview was
`hosted-role-restore-r5-20260825` (id
`d68d531a-55e6-4374-be68-494da7542c75`, ref
`eqqlvqqhvsogusqhzuaq`) under Production parent
`adocsnwnslxhxcjgbyee`. In one official Supabase CLI 2.115.0 remote reset, the
exact 30 migrations and all 11 rollback suites passed. The special suite proved
the real `session_user != current_user` topology, entry-actor `CREATEROLE`,
temporary grant, explicit restore, revoke and direct-ACL cleanup.

A separate rollback-only postcheck proved the exact 30-row migration manifest;
14 owner-correct forced-RLS generation tables; four locked `NOLOGIN NOINHERIT`
roles and exact bootstrap edges; both #26 auth/privacy readers and all five #30
Portal `SECURITY DEFINER` functions owned by the entry actor; hard-off settings;
zero checked Auth, Portal and generation fixtures; and no API or schema-
`CREATE` leak. Security advisors reported zero generation findings. Generation
performance scope retained 14 unindexed-FK INFO, four unused-index INFO and 13
`auth_rls_initplan` WARN advisories; these are tracked separately from the role
boundary. The Preview was deleted and exact id/ref absence was verified, leaving
only the healthy default Production branch. Production was never a SQL target;
no deployment, activation, business data or ongoing Preview charge resulted.
The deleted-`r5` source snapshot gate passed the 11 direct contract files (162
tests), the full
134-file / 1,657-test Vitest suite, TypeScript, lint, the Next.js 16.2.9 webpack
production build with 63/63 static pages, the 73-file adapter check and
`git diff --check`.

The subsequent source follow-up embeds exact `pg_proc.proowner` checks for the
two #26 auth/privacy readers in the maintained worker rollback suite. Its
current enhanced BEGIN-through-ROLLBACK body is 162,857 bytes with SHA-256
`1c30fd7a8604ec8a279ac8d8cf00155bf54801ee15d91dc8ecbc7bc9bc9cf859`.
The adjacent Portal-intake suite now embeds the corresponding five exact owner
checks and has a current body of 39,728 bytes with SHA-256
`2255331b99ff6c4ca05b3a79578c6daa601e26662633063aa004f43423e3729f`.
This completes the source-maintenance follow-up without rewriting the deleted-
`r5` evidence: `r5` executed the earlier bodies and proved the same underlying
owner posture through its independent postcheck, but no fresh Hosted Preview
has executed these enhanced exact bodies. Production has not been touched.

## 17. Communication synthetic-Preview authorization ledger M1g-b — 2026-08-28

M1g-b adds a separate, source-only authorization ledger for one bounded
Communication Note provider evaluation. It does not replace or activate the
five-Note durable job, attempt, payload-vault, worker-registration or owner
repository described above. Its authority policy digest is
`7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9`.

The external owner signs exact canonical JSON with Ed25519. The application
verifier resolves the public key from an external trust-registry snapshot and
enforces its owner-authorization purpose/domain and owner/tenant scope. A
caller-expected binding separately fixes the run. The statement binds those
identities, fixed six-slot M1g-a request bodies,
M1e/M1f/M1g-a source-policy digests, evidence hashes, synthetic-only data class,
budget and a maximum 15-minute authorization window. The database receives and
persists only an already-verified statement and verifier evidence. It validates
the fixed statement and recomputes digests but does not independently establish
the trust registry or verify owner identity.

The private `careslink_v1_generation` schema gains five append-only ledgers for
authorization, revocation, claim, dispatch reservation and signed dispatch
receipt. All enable and force RLS. Three distinct `NOLOGIN`, `NOINHERIT`,
`NOSUPERUSER`, `NOBYPASSRLS` executor roles separate registration, dispatch and
receipt operations; API and `service_role` callers receive no schema/table/
function access. Security-definer functions use `search_path=''` and narrow
operation-specific grants.
Every authority RPC requires `READ COMMITTED`; `REPEATABLE READ` and
`SERIALIZABLE` fail before validation or mutation so post-lock commands cannot
reuse a stale snapshot that predates a concurrent revocation.

The single-use sequence differs from the recoverable worker lease above:

1. authorization persistence records an application-verified external
   signature but grants no execution by itself;
2. claim locks the parent authorization, fresh-checks expiry/revocation with at
   least five minutes remaining, inserts one unique claim and returns its raw
   token only once while storing only its SHA-256;
3. reservation locks that claim and commits one unique next-slot intent before
   any external network work starts; exact response-loss replay returns no new
   dispatch authority;
4. revocation remains appendable after claim and, serialized on the parent
   authorization, blocks every future reservation without releasing prior
   authority;
5. a content-free CaresLink-signed terminal observation binds every durable
   reservation field, uses a purpose-separated receipt key, and consumes the
   reserved slot; only `COMPLETED` with exactly recalculated fixed-price cost
   allows the next slot;
6. a timeout, crash, partial response or unknown response after transport
   starts is `TRANSPORT_AMBIGUOUS`; it may preserve observed status/correlation
   HMACs but no usage/cost, and permanently consumes the slot with no retry.

No row lock or transaction spans an HTTP request. A CaresLink receipt may bind
pairwise-distinct HMACs of its client request ID, OpenAI's `x-request-id` and the
Responses body `response.id`, but those identifiers are not signatures or
idempotency guarantees. The receipt always states
`providerAttestation=ABSENT` and disclaims proof of exact provider receipt,
billing, model execution and exactly-once behavior.

Both authority/receipt readiness latches remain literal `false`; approved
owner and receipt keys, caller grants, credentials, transport and runtime
importers remain absent. The migration is Production-unapplied and has caused
no hosted database mutation. This section therefore records a shadow source
contract only, not a paid Preview, durable generation runtime, retained
database capability or Production execution authority.

## 18. Communication synthetic-Preview custody and callers M1g-c — 2026-08-28

M1g-c extends only the isolated M1g-b evaluation path. It does not alter the
five-Note durable job/attempt model, payload lifecycle, worker catalog, owner
repository, canonical document write or Points design. Its policy version and
digest are
`custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1` and
`1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438`.

The server boundary models three purpose-separated custody inputs:

1. explicitly injected candidate metadata labelled as an external trust-registry
   snapshot, containing public Ed25519 material plus bounded
   purpose/domain/owner/tenant, candidate `ACTIVE` and key-validity metadata
   needed to verify the M1g-b authorization; it does not prove registry
   provenance, freshness or complete revocation;
2. a SHA-256 reference to a non-exportable CaresLink receipt-signer handle,
   purpose-bound to the exact internal-observation domain while withholding the
   private key; the source validator itself performs no signing;
3. a SHA-256 reference to one temporary, least-privilege OpenAI project
   service-account API key, bound through project/service-account/key HMACs,
   scope evidence, a maximum 30-minute lifetime and fixed six-call limit without
   exposing the bearer secret.

The descriptors are content-free. They may hold policy identifiers, timestamps,
bounded status, hashes/HMACs, public fingerprints and digests of opaque managed
handles/references, but no prompt/facts/output, raw care or project identifiers,
private signing key, OpenAI bearer, database credential or provider response
body. They are
explicitly injected, not discovered from environment variables, and do not
create or resolve a real key. Purpose separation prevents an owner-verification
snapshot, receipt signer and provider credential from substituting for one
another.

Migration
`20260828034704_add_communication_note_preview_custody_callers_shadow.sql`
adds no custody table or row. It creates four `NOLOGIN`, `NOINHERIT`,
`NOSUPERUSER`, `NOBYPASSRLS` caller shells:

- `careslink_v1_preview_authorization_registration_caller` gets the single
  authorization-registration function;
- `careslink_v1_preview_authorization_revocation_caller` gets the single
  authorization-revocation function;
- `careslink_v1_preview_dispatch_caller` gets the claim and reservation
  functions;
- `careslink_v1_preview_receipt_caller` gets the single receipt function.

That 1/1/2/1 mapping grants only private-schema `USAGE` and exact function
`EXECUTE`. The shells receive no table/sequence access, broad function grant,
executor-role membership, `SET ROLE` path, login or API/service-role privilege.
The existing M1g-b executors remain function owners and retain the narrow
forced-RLS table privileges. `READ COMMITTED`, lock-then-recheck and no-lock-
across-transport requirements remain unchanged. PostgreSQL 16 may retain only
its non-usable creator ADMIN bootstrap edge (`INHERIT=false`, `SET=false`);
the assertion rejects every usable or unexpected caller/executor edge.

A caller-supplied identity HMAC is a content-free binding for the expected
statement, not proof of a PostgreSQL role, Supabase Auth session, JWT subject or
database credential. A future live deployment must create and authenticate a
separate login-capable identity, then grant it membership only in the required
shell. M1g-c deliberately does neither.

The TypeScript custody boundary has no route, component, worker, scheduler,
queue or product-runtime importer. Both readiness latches remain literal
`false`, the approved snapshot remains `undefined` and validation is
`TEST_ONLY`. Candidate trust-registry hashes do not prove registry provenance,
freshness or complete revocation. No real key, service account, signature,
OpenAI call, spend,
hosted Supabase mutation,
retained Preview, Vercel configuration, deployment or Production change is
part of this batch. Exact local test/build/PostgreSQL counts and artifact
digests are recorded in `documentation/tests.md`; they authorize no runtime or
external action.
Detailed scope and activation blockers are in
`documentation/communication-note-preview-key-custody-callers-m1g-c.md`.

## 19. Communication synthetic-Preview activation preflight M1g-d — 2026-08-29

M1g-d adds a server-only, pure `TEST_ONLY` evidence validator around the
isolated M1g-b/M1g-c path. Its version and literal policy digest are
`preflight.communication.openai.synthetic-preview.2026-08-29.m1g-d.v2` and
`791a4d893afd4e490ab0164a8f604589bcf8015d25e5723b4df210f8c0b44f67`.
It does not alter the durable Note job/attempt model, vault lifecycle,
canonical-document transaction, worker catalog or Points design.

The validator rebuilds a content-free candidate and cross-binds the verified
owner authorization, validated custody snapshot, exact shared observation
time, provider/project/credential evidence, receipt-key lifecycle, boundary-
safe 37-migration manifest, six artifact pins and four ordered caller
candidates. Each caller
asserts no elevated PostgreSQL role attributes, extra caller-shell/executor/API
membership, direct table/sequence/function privileges, raw credential material
or active backend. Candidate and section observations cannot be future or
predate authorization effectiveness/provider-credential issuance, may be at
most five minutes old and yield a candidate live for no more than 15 minutes or
the remaining authorization window.

The database section requires a fixed HMAC algorithm, purpose and version plus
one declared common key-reference digest for distinct target and Production
project-reference HMACs. This is internal candidate consistency only: M1g-d
does not resolve the HMAC key or authenticate either project against an
independent Supabase inventory/control plane. Likewise, external evidence
digests and their shared timestamp are not recomputed from authenticated bytes
or signed system responses. Both gaps remain covered by
`EXTERNAL_PROVENANCE_NOT_AUTHENTICATED`; caller HMACs and posture fields do not
prove provisioned logins or live PostgreSQL catalog/ACL state and remain
covered by `RUNTIME_IDENTITIES_NOT_PROVISIONED`.

A valid candidate still returns `activationReady=false` with five fixed
blockers. All eight prior readiness values stay `false`, all six approved
values stay `undefined`, and the live factory always throws. There is no new
migration, route, worker, runtime importer, environment lookup, secret/KMS/HMAC
resolver, provider or database connection, hosted action, paid request,
deployment or Production change. Detailed scope is in
`documentation/communication-note-preview-activation-preflight-m1g-d.md` and
final local gate evidence is recorded in `documentation/tests.md`.

## 20. Communication reserve-before-dispatch transcript M1g-e — 2026-08-29

M1g-e adds no durable repository or executable transport. It freezes the next
coordination boundary as a server-only, pure `TEST_ONLY` transcript/transition
validator with version
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-e.v2` and
policy digest
`4649f620bc60425d5ca40d308d167110befd4a29c772e9877ddbeac5eaaa3531`.
The validator reruns the M1g-d preflight and M1g-c custody checks before it
accepts any transcript state. It then cross-binds the preflight, authority,
custody, request-pin, runner, evaluation, template, manifest, fixture, worker,
authorization and run digests.

The accepted state machine is deliberately narrower than a live coordinator:

1. one authorization-registration candidate binds the registration caller;
2. one runner-preflight candidate fixes all six exact slots, their body pins,
   `1..10,000` input-token counts and the 20,130/120,780/250,000-micro-USD
   projected/per-run cost bounds before a claim;
3. one claim candidate binds the dispatch caller plus authorization/run/
   authority/body-pin/runner parents, exposes no claim token and requires at
   least five minutes of authorization life remaining;
4. slot `0..5` is reserved serially with the exact M1g-b fixture, ordinal,
   request-body SHA-256, byte length, semantic digest, one client-request HMAC,
   one UUID, claim/authorization/run parents and attempt `1`;
5. `LOCAL_PRE_DISPATCH_ABORTED` has no transport entry; every other outcome
   requires the same reservation/body binding at an irreversible transport
   entry;
6. the existing M1g-b Ed25519 verifier authenticates the content-free CaresLink
   receipt observation against the injected M1g-c public-key snapshot;
7. the receipt-record candidate binds the receipt caller, digest, signature
   hash and outcome. A first-write candidate or exact replay candidate is
   non-dispatching;
8. a `COMPLETED` result advances only after explicit runner acceptance binds
   authorization/run/claim/reservation/receipt digest and signature, the exact
   fixture/body/preflight/usage/cost evidence, all seven critical checks and
   passed `en`/`zh-Hans`/`zh-Hant` reviews. `PROVIDER_HTTP_ERROR`,
   `TRANSPORT_AMBIGUOUS` and `LOCAL_PRE_DISPATCH_ABORTED` consume the terminal
   slot with no retry; six completed slots end only in
   `TEST_TRANSCRIPT_COMPLETE_NOT_ACTIVATION_AUTHORITY`.
9. provider completion followed by cancellation, provider-evidence, golden,
   human-review or report failure instead records a parent/receipt-bound
   `RUNNER_SLOT_FAILED_TEST_CANDIDATE`; acceptance and failure are mutually
   exclusive, and failure is terminal with no retry or continuation.

For `COMPLETED` and `PROVIDER_HTTP_ERROR`, the receipt observation must be no
more than the policy's 30-second application-transcript candidate interval after
transport entry. A delayed `TRANSPORT_AMBIGUOUS` observation remains allowed
because it is terminal and cannot retry. The validator also rejects cross-role
reuse across static evidence, client/transport correlation HMACs, runner
provider hashes/candidate digests, receipt evidence and fixture digests. The
runner provider hash and receipt OpenAI correlation HMACs have no authenticated
shared identifier and remain `UNATTESTED_NO_SHARED_IDENTIFIER`.

This verifies internal state consistency and a test receipt signature, not the
database event claims. M1g-f changes the source reserve result to return its
canonical database `reserved_at` timestamp on fresh insert and exact replay,
but M1g-e still has no trusted database port and never observes that value. It
therefore labels `databaseReservedAtCandidate` as unattested and retains
`DATABASE_ATTESTED_RESERVED_AT_ABSENT`. A future live path must consume the
source-defined result directly; it must not guess from an application clock or
add a read-after-reserve authority path.

M1g-f also adds a private forced-RLS, append-only terminal ledger and changes
the reserve source contract so every earlier slot needs `COMPLETED + ACCEPTED`;
a `FAILED` terminal permanently consumes the run. The terminal executor has no
fifth caller or runtime execute grant, so the transcript's runner decision is
still `ABSENT_TEST_CANDIDATE_ONLY` and
`DURABLE_RUNNER_TERMINAL_STATE_ABSENT` remains a runtime-evidence blocker. A
live path must first add the independently reviewed caller, custody decision and
authenticated adapter without weakening this lock-aligned continuation gate.

The validator executes no injected callback, SQL, network request, signer,
secret resolver or environment lookup. It returns no raw claim token, request
body, facts, generated Note, provider response, credential or receipt
signature. The sanitized result is recursively frozen and always reports
`UNATTESTED_INJECTED_TEST_TRANSCRIPT`, `coordinatorReady=false`,
`activationReady=false`, `dispatchCapability=ABSENT`, absent pre-run approval
and absent post-run evaluation acceptance. The live factory always throws; no
route, component, worker, queue, cron, Supabase Function or product runtime may
import it. Detailed scope is in
`documentation/communication-note-preview-reserve-before-dispatch-coordinator-m1g-e.md`.

## 21. Communication durable runner terminal M1g-f — 2026-08-29

M1g-f supplies the source-only database boundary that M1g-e could previously
describe only as injected state. A CLI-generated migration requires the five
existing Preview execution ledgers to be locked and empty, then adds a private
forced-RLS append-only terminal ledger and a separate
`careslink_v1_preview_runner_terminal_executor`. The executor is `NOLOGIN`,
`NOINHERIT` and `NOBYPASSRLS`; no fifth caller or runtime execute edge exists.

The reserve result now exposes its database-written UTC-millisecond
`reservedAt` on a fresh insertion and on an exact response-loss replay; only
the fresh result grants dispatch authority. Before any later slot, every prior
slot must have an immutable `COMPLETED` receipt and `ACCEPTED` terminal. Missing
terminal state remains pending without authority, while `FAILED` permanently
consumes the run. The terminal RPC binds the receipt/reservation/claim/
authorization chain, exact request-body pins and receipt usage/cost, plus the
caller-supplied runner candidate/provider identifiers, seven checks, three
ordered locale reviews and purpose-separated digest/HMAC values. It does not
independently attest the truth of those caller-supplied runner fields.

The terminal policy version is
`policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1`
with digest
`4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a`.
It is not runtime authority. Any later activation must first choose and review
an independent signed-terminal envelope or an authenticated terminal adapter as
the trust root, then atomically add the fifth caller, custody evidence and
runtime port. Detailed scope is in
`documentation/communication-note-preview-durable-runner-terminal-m1g-f.md`.

## 22. Communication signed runner-terminal caller and ports M1g-g — 2026-08-29

M1g-g is the additive successor to M1g-f. It preserves M1g-f as the historical
unsigned source/database checkpoint and closes that checkpoint's chosen trust-
root shape with an independent Ed25519 terminal envelope. The signing purpose
is `CARESLINK_RUNNER_TERMINAL`, the allowed domain is
`CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL`, and the signed statement
binds the signer key-id hash and public-key fingerprint alongside the existing
authorization/run/claim/reservation/receipt, fixture/body, evaluation, review
and terminal-state evidence. The caller identity HMAC remains correlation and
scope evidence; it is not a signature or terminal trust root.

The terminal verifier accepts only a purpose/domain-scoped Ed25519 SPKI
snapshot and a canonical 64-byte signature encoded as 86-character unpadded
Base64URL. It verifies the canonical CaresLink signing message, key validity
window, observation time and signer fingerprints before creating immutable
verified evidence. Owner-authorization, receipt and runner-terminal signer
key-id hashes, public-key fingerprints and custody references must be pairwise
distinct. This prevents either earlier signing purpose from being reused to
authorize an `ACCEPTED` or `FAILED` terminal.

CLI migration
`20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql`
requires all six execution ledgers to be locked and empty. It removes
`persist_verified_communication_note_preview_runner_terminal(jsonb,text)` and
creates the exact signed replacement
`persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)`.
The forced-RLS append-only ledger now persists the original signature,
signature SHA-256, signer key-id hash, public-key fingerprint, authenticity,
verifier method and verifier identity HMAC. PostgreSQL recomputes and binds
this evidence and exact replay must match it byte-for-byte, but PostgreSQL does
not claim to perform Ed25519 verification; that remains the source verifier's
boundary.

The new `careslink_v1_preview_runner_terminal_caller` is the fifth, separate
`RUNNER_TERMINAL_PERSISTENCE` caller mapping. It is `NOLOGIN`, `NOINHERIT`,
`NOSUPERUSER` and `NOBYPASSRLS`, and receives only private-schema `USAGE` plus
exact three-argument terminal RPC `EXECUTE`. It receives no table, sequence,
type, helper, authorization, revocation, claim, reservation or receipt RPC
privilege; it has no executor membership, API/service-role edge, login member
or `SET ROLE` path. The terminal executor remains the isolated security-
definer owner with its existing forced-RLS ledger privileges.

Two source-only ports preserve that separation. The signed-terminal runtime
port verifies an injected envelope before forwarding only verified evidence to
one purpose-scoped persistence method. The PostgreSQL port accepts only an
injected parameterized query capability and the exact three-argument SQL; it
cannot construct a connection, read environment variables, resolve a signing
key or database credential, or select an arbitrary function. Both factories
are `TEST_ONLY`; their readiness constants remain `false` and their approved
ports remain `undefined`.

The following fixed bindings and PostgreSQL result are the historical M1g-g
checkpoint. M1g-i later added explicit transaction wrappers to migrations 37
and 38, so their historical bytes are not the current migration bytes.

| Binding | Version / SHA-256 digest |
|---|---|
| signed terminal policy | `policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2` / `d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa` |
| signed terminal statement | `runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2` |
| custody policy | `custody.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2` / `f537dc64e3c57a34b6db6d0d1c871c38a70bcb51c4d071e625b026f840a309ca` |
| derived activation preflight | `preflight.communication.openai.synthetic-preview.2026-08-29.m1g-g.v3` / `491481513a67198cba91babc3c172fc1f326f9ee7bdd883b3d1208c639bdaf73` |
| derived coordinator | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-g.v3` / `f6609c2f357b5fda92ae5aa1b459dfb1e32b7893c3e8436e0e94a8ffa2bbe675` |
| migration bytes | `b095785331c848d02cabc417eb3131fe2f9328564abef6fc0dd35bccd2980c5a` |
| rollback-assertion bytes | `f8e8307718e3bdf0835b93cdac075279ae4f5ba3dbab287af46e1280ce587ad5` |

The local PostgreSQL 16.15 gate clean-applied the exact 38/38 migration set and
passed the signed-terminal assertion boundary. That evidence does not activate
the design. Two explicit blockers remain: the runtime factory's test-only
signing-key snapshot is not cross-bound to a validated live M1g-c custody/
trust-registry resolver, and its verifier HMAC is not cross-bound to a fifth-
caller credential/identity resolver. Login/membership provisioning and both
resolver bindings require a separately authorized disposable-Preview batch.
No ordinary environment value can stand in for them.

All readiness remains false; approved signer/custody/runtime/PostgreSQL values
remain absent. M1g-g creates no product route, worker, queue, cron, Supabase
Function, provider/model call, Hosted application, deployment or Production
change. Detailed scope is in
`documentation/communication-note-preview-signed-runner-terminal-port-m1g-g.md`.

## 23. Communication runner-terminal trust composition and disposable Hosted identity M1g-h — 2026-08-29

M1g-h is the additive successor to M1g-g. It does not change the signed
statement or database schema. Instead, it makes the missing source composition
explicit: a test-only external registry candidate is validated against the
M1g-c custody and M1g-g terminal-policy digests, then combined with the exact
fifth caller into one private branded record. Only that composition may derive
the signed verifier, runtime persistence boundary and exact PostgreSQL port.
Private `WeakMap` records keep the trusted signing snapshot and caller input out
of public evidence. Cross-composition terminals and ports, stale/future
observations, raw key/caller substitution and non-exact RPC identities fail
closed.

The public registry and composition states deliberately say
`TEST_ONLY_VALIDATED_NOT_APPROVED` and `TEST_ONLY_COMPOSED_NOT_APPROVED`. They
prove validation by this module, not external registry authenticity, revocation
freshness, live KMS custody or owner approval. The corresponding readiness is
literal `false`; approved registry, composition, runtime and PostgreSQL values
remain `undefined`.

The disposable database identity design creates a random ten-minute
`NOINHERIT`, connection-limit-1 LOGIN only after exact non-Production branch,
PostgreSQL-major and pinned-CA checks. Its sole usable edge is SET-only
membership into the existing fifth `NOLOGIN` caller, with
`ADMIN=false`/`INHERIT=false`/`SET=true`. The login has no direct object or
executor privilege. Cleanup applies `NOLOGIN`, rejects reconnect, closes or
drains the exact sessions, revokes the edge and drops the role. Branch metadata
and credentials are bounded to stdin, anonymous fd3 and memory rather than
persistent environment variables or files.

The local PostgreSQL 16.15 gate applied all 38 migrations and proved the
source-valid signed `FAILED`/`CANCELLED` terminal path end to end: a fresh row,
write-free exact replay, altered valid-signature conflict, append-only
enforcement, final ledger counts `1/0/1/1/1/1` and role deletion. It did not
prove `ACCEPTED`: the source statement has nine usage keys but migration 38
requires exact equality with the stored receipt's six-key usage object. That
schema/source mismatch remains a release blocker.

The authorized Hosted attempt used disposable, non-default, non-persistent,
no-data Preview `hspkccjobyqmoomiidjp`. Supabase CLI 2.115 first failed
migration 37 because its statement-by-statement executor placed `LOCK TABLE`
outside a transaction. Temporary outer transaction wrappers produced the exact
38-version history and were then removed from source; branch operation metadata
retained `MIGRATIONS_FAILED` while the Preview remained `ACTIVE_HEALTHY`.

The 18-file rollback manifest
`163ddd40e68f8c2accc8904c4b7165c6630ba8fdad58b54a674d4f27908273f1`
then returned `SCHEMA_ROLLBACK_ASSERTION_FAILED`. The no-write one-time identity
probe and signed runtime-to-Hosted-PostgreSQL terminal gate were not run. The
Preview was deleted, three later listings showed it absent, and only healthy
default Production `adocsnwnslxhxcjgbyee` remained. Thus M1g-h supplies useful
source/local evidence and a safe Hosted failure/teardown record, but no passing
Hosted E2E, product runtime activation, provider/model call, real care data,
deployment or Production change. Full evidence and advisor links are in
`documentation/communication-note-preview-hosted-runner-terminal-identity-m1g-h.md`.

## 24. Communication signed terminal ACCEPTED usage alignment M1g-i — 2026-08-29

M1g-i is the forward-only successor to M1g-h's diagnosed usage mismatch.
Additive migration
`20260829041316_align_communication_note_preview_terminal_accepted_usage.sql`
replaces the signed three-argument terminal RPC so the independently signed
statement retains its exact nine-key usage object while only the six provider
facts are projected for exact receipt-ledger comparison. The three removed
projection fields are reconciliation labels, not provider facts. Signature,
authorization, claim, reservation, receipt, cost, parent-lock, append-only,
replay and exact caller ACL semantics remain unchanged.

The current source also wraps migrations 37 and 38 in explicit
`BEGIN`/`COMMIT` boundaries. Their business SQL and privilege sequence are
unchanged, but a statement-by-statement transport can no longer strand their
temporary grants before `LOCK TABLE`. Migration 37 is 39,965 bytes with
SHA-256 `09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432`;
migration 38 is 28,835 bytes with SHA-256
`4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f`.
The 39-entry ordered-content digest is
`a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2`.

The rollback harness assigns stable, content-free stages `R00` and
`A01`–`A18`. Adjacent owner/worker assertions now account for the six isolated
Communication Note tables without treating their `statement` and `usage`
columns as registered-worker payload leakage. Transactional policy
`2026-08-29.preview-transactional-migrations.6` binds all 39 entries with
manifest SHA-256
`60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`
and removes 19 known outer wrappers in memory before maintaining its own
single transaction. The exact migration 39, A03 terminal assertion and
18-file rollback manifest remain pinned. Derived v5 preflight/coordinator
policy digests are
`0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1`
and
`1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2`.
Identity policy `2026-08-29.preview-runner-terminal-identity.2` requires one
exact `metadata` plus `credentials` envelope proving that the target is the
same healthy, no-data, non-default, non-persistent child of pinned Production
before the destructive reset runner may read CA material or connect.

A fresh disposable local PostgreSQL 16.15 cluster applied the current 39/39
migrations. Migrations 37 and 38 were deliberately sent statement by statement
without an external transaction and succeeded through their own explicit
wrappers. A03 then passed as a rollback-only database assertion; final terminal
rows and temporary SET-role edges were both zero. The server stopped and the
cluster was deleted. Current source validation passed 172 files / 2,321 tests,
TypeScript, zero-warning ESLint, 73-file adapter synchronization, diff checks
and the 64/64-page Webpack production build. The earlier 172-file / 2,315-test
result belongs to the prior artifact set committed as
`4e84823d3c62e34abe0a0bd0f295e20dc456cae0`.

Deleted no-data Hosted PostgreSQL 17 r20 subsequently applied the prior
`4e84823` artifact set in one transaction, passed A01–A18 and completed the
actual temporary-LOGIN signed `ACCEPTED`, exact replay and conflict gate.
Independent postcheck found the expected `[1,0,1,1,1,1]` durable chain and zero
temporary LOGINs/sessions. r20 was deleted and three listings left only healthy
Production. That historical result does not prove native Supabase CLI apply,
transactional policy `.6`, identity policy `.2`, or the v5 pins at the current
revision. A03 also still accepts either the dedicated signer-independence code
or generic `VALIDATION_ERROR`; narrowing it to the dedicated code remains a
separate repin and paid-Preview follow-up, not a claim of this checkpoint.
Live trust/custody and credential resolvers, current exact-revision Hosted
validation, provider/model evaluation, human review and final approval remain
absent; readiness is still false and approved values are undefined. No
provider/model, real-data, deployment or Production write is part of M1g-i.
Full evidence is in
`documentation/communication-note-preview-terminal-accepted-usage-m1g-i.md`.

## 25. Communication resolved custody/caller runtime binding M1j — 2026-08-30

M1j is the source-only successor to M1g-i's accepted terminal evidence. It does
not create the missing live custody or credential services. Instead,
`communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts`
defines the production-shaped boundary those future services must satisfy,
under version
`binding.communication.openai.synthetic-preview.2026-08-30.m1j.v1` and policy
digest `6e33f6a6c061f539b75808afc27abfe6f33fedfcf28de5f7b2a5fdeed5faee04`.

The public constructor unconditionally fails without inspecting its input.
Readiness is `false`, and the approved disposable target, custody resolver,
caller-credential resolver and resolved runtime port remain `undefined`. The
executable constructor and all resolver/session constructors are explicitly
TestOnly. Module-local WeakSet/WeakMap provenance prevents a plain or spread
object from standing in for those test objects; lease reference, session
binding, runtime role and query-function identity are synchronously claimed for
single consumption within the module.

The TestOnly sequence is:

1. validate a content-free, no-data, non-default, non-persistent,
   Production-excluded PostgreSQL 17 target descriptor;
2. resolve the M1g-c/M1g-g custody and trust composition without accepting raw
   private keys or credentials;
3. acquire the exact fifth-caller lease on one physical, dedicated, single-use
   session whose adapter normalizes every result to exact `{rows}`;
4. begin one `READ COMMITTED` read-write transaction, apply separate statement,
   lock, idle-in-transaction and transaction timeouts, attest the base runtime,
   then use `SET LOCAL ROLE` for the fifth caller;
5. attest the same backend PID and transaction ID, database clock, caller and
   SECURITY DEFINER executor attributes/membership edges,
   schema/relation/column/sequence posture and exact signed-terminal RPC
   metadata/ACL before and after the one parameterized persistence call;
6. commit once, or attempt rollback for every unacknowledged BEGIN/COMMIT path,
   prove the role reset on the same backend when transport state permits, and
   never retry the RPC; and
7. request idempotent cleanup by acquisition digest even if credential acquire
   lost its response, then validate a request-bound TestOnly release report
   whose paired disposition is either destroyed/revoked or, only without a
   returned binding, not-acquired/not-issued; every accepted report must also
   claim that the acquisition digest is tombstoned and future issuance blocked
   before returning success.

Clock observations must be monotonic. Authorization expiry caps trust expiry;
trust and target expiry cap the lease; the lease requires 30 seconds remaining
before database use, while PostgreSQL 17 `transaction_timeout` limits the whole
transaction to ten seconds. `VALID UNTIL` is treated only as login posture, not
as a mechanism that kills an existing session. Custody/acquire operations have
a 5-second settlement bound, every main-transaction database operation a
12-second bound, and rollback/reset/revoke independent 5-second bounds. Each receives a fresh
AbortSignal, but the JS watchdog alone cannot prove remote cancellation; a live
adapter must bind abort to driver cancel/session destruction. Errors expose
only fixed domain codes/messages.

This boundary deliberately calls its cleanup artifact a TestOnly report. Its
tombstone and future-issuance fields are resolver self-report, not independent
proof that a live administrator durably fenced the acquisition digest, dropped
the LOGIN, revoked the credential and terminated every backend. Activation therefore still requires
an approved control-plane target verifier, real custody and caller/session
adapters, TLS endpoint-to-target binding, an administrative zero-role/session
postcheck, durable cross-process replay prevention and acquisition-digest
tombstoning that wins against late issuance, and a same-revision
disposable PostgreSQL 17 gate. M1j adds no
migration, environment variable, network/SDK client, product importer,
provider/model call, Preview, deployment or Production write. The M1g-i
preflight/coordinator pins remain unchanged because their false/absent resolver
claims are still true.

Detailed handoff is in
`documentation/communication-note-preview-live-custody-caller-resolver-m1j.md`.

## 26. Communication durable caller-credential resolver M1k — 2026-08-30

M1k implements the first local TestOnly database-backed lifecycle proof of
M1j's fifth-caller credential boundary, using a TestOnly server adapter plus an
isolated local PostgreSQL broker.
Its policy version is
`resolver.communication.openai.synthetic-preview.2026-08-30.m1k.v1` and its
policy digest is
`67fb2065c23c1cd99a8e1c1a396509edefd7e7614fa476e2ee95839eafea5a7c`.
The public factory is still unconditionally disabled, readiness is `false` and
the approved resolver export is `undefined`.

The resolver generates a short-lived SCRAM credential, sends the verifier only
to an injected management broker, opens one injected physical session with the
password, binds its backend PID, and returns a secret-free M1j lease. Revocation
is fixed as a durable tombstone, local session destruction, separate-transaction
database finalization, independent inspection and only then the M1j release
receipt. A locally known session or complete M1j binding cannot be represented
by a false never-issued audit result.

The broker ledger is metadata-only and monotonic:
`RESERVED -> ISSUED_UNBOUND -> ACTIVE -> TOMBSTONED -> REVOKED`, with a direct
never-issued `RESERVED -> TOMBSTONED` path. All operations for one acquisition
digest share an advisory transaction lock. Tombstone records its XID and must
commit before finalization. The TypeScript resolver requests at most 90 seconds;
the isolated SQL broker accepts 30 seconds–10 minutes for independent testing,
and the PG16 harness uses five-minute fixtures. An issued runtime role has
`CONNECTION LIMIT 1`, no inheritance/dangerous attributes and exactly one
SET-only edge to the terminal caller. Binding requires the expected role,
backend start, PID, idle state and fixed application name. The tombstone
transaction verifies the stored role name/OID and atomically
commits `NOLOGIN` plus an expired `VALID UNTIL` with the ledger fence.
Finalization requires that login fence, terminates/drains matching name/OID
backends, revokes membership, drops the role and persists a paired release
receipt. Independent postcheck verifies the terminal row, zero role/session/
membership residue, zero raw-credential columns and zero API/PUBLIC ACL.

The disposable private-socket PostgreSQL 16.15 gate passed six scenario groups,
including a proven advisory-lock waiter for concurrent tombstone/acquire,
wrong-PID/application bind rejection, ACTIVE replay, simultaneous acquire,
acquire-response-loss, committed-`NOLOGIN` late-reconnect rejection,
simultaneous revoke and active-session cleanup. Before teardown,
postcheck observed three metadata tombstones—two issued and one never issued—
and zero runtime roles, sessions and memberships. The exact temporary server
was then stopped and its directory deleted. This evidence is not PostgreSQL 17,
Hosted, TLS or pinned-CA evidence.

M1k intentionally adds no migration. The existing 39-entry manifest and M1g-i
Hosted evidence therefore remain unchanged and cannot be attributed to M1k.
The production successor must add the broker in a separately authorized
additive migration batch and atomically repin every affected artifact, place
the broker beside the terminal ledger under the same locking authority, and
make the terminal RPC revalidate an ACTIVE acquisition fence bound to the
session user/backend/expiry. It must also add approved target/custody/secret
transport, the other four caller purposes and an explicitly authorized
same-revision PostgreSQL 17 no-data Preview gate before provider evaluation or
activation.

Detailed handoff is in
`documentation/communication-note-preview-durable-caller-credential-resolver-m1k.md`.

## 27. Communication formal runtime-credential broker M1l — 2026-08-30

M1l adds the production-shaped database source that M1k deliberately deferred:
the additive 40th migration
`20260830065750_add_communication_note_preview_runtime_credential_broker.sql`.
It remains Production-unapplied and default-off. Resolver version is
`resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2`, policy
digest is
`e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e`.
The inherited runtime binding is
`binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1` with digest
`cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115`;
status is `SOURCE_CONTRACT_WITH_UNAPPLIED_DURABLE_BROKER_NOT_APPROVED`,
readiness is `false`, and the approved resolver remains `undefined`.

The migration requires the Supabase Hosted management shape: exact `postgres`
session/current user and database,
`NOSUPERUSER`, `CREATEROLE`, `BYPASSRLS`, plus `pg_signal_backend` and
`pg_read_all_stats`. It creates private forced-RLS
`careslink_v1_runtime_broker` with a monotonic hash/digest-only acquisition
ledger and invoker lifecycle APIs. No raw password, SCRAM verifier, DSN or
connection string is persisted. API roles have zero broker capability.

The runtime role is derived from the acquisition digest, uses SCRAM, is bounded
to 45–90 seconds and one connection, and is `INHERIT=true`. Its outbound fifth-
caller edge is `ADMIN=false`, `INHERIT=true`, `SET=false`. PostgreSQL 16/17
`CREATEROLE` also creates a distinct inbound inert creator edge with
`member=postgres`, superuser grantor, `ADMIN=true`, `INHERIT=false`,
`SET=false`. The client transaction sends no `SET ROLE`: outside the wrapper
`current_user=session_user=runtime role`; inside the `SECURITY DEFINER` wrapper
`current_user=terminal executor` and `session_user=runtime role`. SQL `SET ROLE`
and `set_config('role',...)` are forbidden.

The migration uses cluster-wide `pg_shdepend` to require zero static-caller
ownership dependencies and exact ACL dependencies only for the current
database generation schema and terminal wrapper. Acquire, bind and wrapper
runtime paths revalidate this proof, reject generation-column capability via
`has_any_column_privilege`, and re-attest both wrapper and inner as exact
executor-owned `SECURITY DEFINER` functions with empty `search_path` and exact
ACL. The runtime
inherits only the terminal wrapper and has no generation table, sequence,
column or other-function privilege. Acquire records role/OID and hashed
lease/session/credential identities. Bind requires exact PID, backend start and
fixed runtime application, then immediately makes the role `NOLOGIN`.
Lifecycle mutations serialize on one exclusive acquisition-digest transaction
lock.

The public database interface remains the exact three-argument
`persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)`.
The former implementation becomes a private unfenced inner function. The
wrapper takes a shared transaction lock in the same namespace, reloads the row
and rechecks ACTIVE state, role name/OID, PID/backend start, fixed application,
authorization digest, run hash, caller-identity HMAC, expiry, `NOLOGIN` and the
exact outbound caller plus inbound inert creator membership postures before
delegating. Tombstone/finalize need the
exclusive lock, which makes terminal-first wait for commit and makes
tombstone-first fail closed before the old implementation can write.

The resolver session contract now includes connection-owned
`cancelInFlight()`. On Abort it waits at most 250 ms for both cancellation and
the underlying query to settle. Confirmed settlement permits reuse; any
unconfirmed barrier permanently quarantines the driver, preventing later SQL
through that capability while the independent management path performs the
durable cleanup.

An owned, no-TCP, private-Unix-socket PostgreSQL 16.15 harness applied the
formal migration under a non-superuser `postgres` with the exact required role
memberships and passed six scenarios with four issued-and-revoked acquisitions.
Final residue counts were zero for runtime roles, sessions, memberships and API
privileges. In the second-database runtime-owned large-object case, the first
finalize returned SQLSTATE `2BP01`, routine `DropRole`, while TOMBSTONED ledger,
`NOLOGIN` role, membership and remote residue survived rollback. Removing the
unique owner dependency allowed finalize and inspect to succeed with zero
residue.

The SQL sequence is independently designed to fail closed: durable tombstone and
`NOLOGIN` precede `DROP ROLE`, and `REVOKED` follows only successful deletion.
The same-revision Hosted/PG17 proof is now closed by deleted no-data,
non-default, non-persistent Preview r5 (branch ID
`5f088eac-ac66-4625-8f4c-c9e7d9b02c2a`, ref `ucdmoxqzruohiqmsokfv`). It passed
40/40 migrations in one transaction, A01–A18, pinned-CA child execution and an
independent postcheck. Its terminal state was `ACCEPTED`; exact replay was
write-free, a valid conflict was rejected, direct-login inherited caller
identity issued no `SET ROLE`, and bind established `NOLOGIN`. Two acquisitions
reached `REVOKED`, final ledgers were `[1,0,1,1,1,1]`, and runtime role/session/
membership/API/verifier/temporary-database residue was zero.

The cross-database case proved the exact PostgreSQL 17 large-object ACL and
current-database plus cluster-wide owner dependency using `aclexplode` and
`pg_shdepend`, retained the tombstone/fence/residue after the expected
`2BP01`/`DropRole` rollback, and converged to zero only after controlled owner
cleanup. Security and Performance Advisors had zero broker-scoped findings;
global findings and pre-existing generation lint errors remain, so this is not a
global zero-warning claim. r5 was deleted and three independent branch lists
left only healthy default Production, which was never the SQL target. This is
Hosted Preview evidence, not Production, deployment or provider/model evidence.

Moving from 39 to 40 migrations makes M1g-i's old pins and deleted Preview
evidence historical for their exact revision. The atomic M1l set passed 53/53
focused checks and is frozen as migration
`64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa`;
transactional `2026-08-30.preview-transactional-migrations.7` with 40 entries,
20 wrappers and manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`;
ordered basenames/entries `f9905d27a907045dfd6e7677e54c50af84be06a194535682bcf9dc4859657d4f` /
`7006c0ef8cb62d9596fdd236ffd3357d16338370e9d1437f54a58eb668b4b250`;
A03 `0f8192bccf46101103c301fcfd2b00cb818dd6725425a952777f697db8ea8172`;
rollback `2026-08-30.preview-schema-rollback-assertions.5` manifest
`e0b5f30f9a4c33bf04020a4d11453c87a52321b69c6edd74982446b0fadd58fe`;
and preflight/coordinator
`4447c071fa37ab21f23624a4d3d4d28b2ee9ba2e1ef4c9be969bf9a0481de2f3` /
`570544bf700997a0ba90e06422019c237a01835ba8b75ff70bed5348cdf4bf02`.
These pins are source integrity, not approval. The disposable PostgreSQL 17
Hosted gate is complete; the remaining target/custody/secret-transport/product-
driver/provider/human/merge/deployment gates still require separate evidence and
authorization. Until they close, no product route or Production traffic may use
this broker.

Detailed handoff is in
`documentation/communication-note-preview-runtime-credential-broker-m1l.md`.
