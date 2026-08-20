# V1 Note generation durable design handoff

> Status: source-only, default-off design plus a Production-unapplied
> schema-only migration foundation that clean-applied only on a deleted
> disposable Preview. This document records the next database and worker
> boundary; it does not claim that a durable repository, worker, route, RPC,
> Preview capability, model call or Production capability exists.

## 1. Scope and non-goals

This design extends the shared five-Note foundation for Communication,
Handover, Progress, NDIS and Incident Factual. It describes durable job
metadata, attempts, leases, recovery and the transaction that may eventually
persist a usable canonical result.

This handoff does not authorize or implement:

- a database connection, migration apply or private worker RPC;
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

A future migration should create a separate private schema such as
`careslink_v1_generation`. It must not add tables or types to
`careslink_v1_internal`: the existing Product API migrations and assertions
lock that schema to an exact function-only object set.

The migration preflight must fail when the new namespace already exists or its
owner, ACL, default privileges or object set differs from the expected state.
The schema/table owner and the reviewed executor role must be separate. Neither
may be an API role. The executor must be `NOLOGIN`, `NOSUPERUSER` and
`NOBYPASSRLS`, and may receive only the table operations required by the
reviewed definer functions. The schema grants no `USAGE` or `CREATE` to
`PUBLIC`, `anon`, `authenticated` or `service_role`.

The first schema-only object set is deliberately smaller than the eventual
durable repository:

1. two dedicated `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` roles, one owner and
   one future executor;
2. a single default-off `settings` row;
3. a metadata-only `jobs` table;
4. a metadata-only `attempts` table;
5. only their required constraints and indexes.

It creates no function, view, trigger or RLS policy. The future payload
metadata, one-time grants, provider-evidence detail, purge outbox and nine
reviewed worker RPCs are a separate additive phase. They must exist before the
atomic transaction in section 7 can be implemented; the current three-table
foundation must never be described as that transaction.

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

The future success RPC must complete all of these operations in one short
database transaction:

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

All three private tables enable **and force** RLS as defence in depth and define
no policy in the schema-only phase. `FORCE ROW LEVEL SECURITY` makes the table owner subject
to policies, but it does not constrain a superuser or a role with
`BYPASSRLS`. Therefore the schema/table owner is distinct from the reviewed
definer executor, and the executor must be `NOLOGIN`, `NOSUPERUSER` and
`NOBYPASSRLS`. Future private policies may name only that exact executor and
permit only the operations required by reviewed wrappers. Schema and table privileges
are revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`; API
roles receive neither private schema usage nor direct table access.

On PostgreSQL 16+, a non-superuser creator with `CREATEROLE` automatically
retains an admin-only edge to each new dedicated role. That edge is not runtime
authority: the migration and assertions require `INHERIT=false` and
`SET=false`. The separate non-inheriting `SET` edge needed for ownership
transfer and owner-default-ACL hardening is scoped to the migration grantor and
revoked before completion. A hosted non-superuser migration actor enters a
bounded `SET ROLE` window so the dedicated owner alters its own global defaults,
then `RESET ROLE`s before table creation. API roles and the executor are
forbidden as members.

Every privileged function must be narrowly typed, owned by the reviewed
non-login executor role, declared `SECURITY DEFINER`, and use
`SET search_path = ''`.
Public wrappers must repeat the expected role/feature/session checks even though
ACL is the primary invocation boundary. Function creation is immediately
followed by explicit revocation from all API roles to remove PostgreSQL's
default `PUBLIC` execute privilege.

This source-only batch grants **no `EXECUTE`** to `service_role`, authenticated
users or any other API role. A later activation migration may grant only the
minimum public wrapper signatures after the exact migration and assertions pass
on a disposable Preview. No private helper is directly callable by an API role.

The existing authenticated direct SELECT on historical
`public.generation_jobs` must be revoked before any route could treat job status
as live data. User-facing job reads must go through a fresh-session-validating,
metadata-only adapter rather than direct PostgREST table access.

## 9. Schema-only migration boundary

Supabase CLI 2.115.0 was used locally to generate the filename with:

```text
supabase migration new add_v1_note_generation_durable_shadow
```

The exact returned file is
`supabase/migrations/20260820135834_add_v1_note_generation_durable_shadow.sql`.
It remains additive, default-off, Production-unapplied and free of top-level
transaction syntax because the migration runner owns the transaction.

This first migration contains only the private metadata foundation described
in section 3. It grants no schema/table/function privilege to the future
executor, `PUBLIC`, `anon`, `authenticated` or `service_role`. It deliberately
contains no lease duration, retry budget, provider/model selection, payload
TTL, vault/KMS choice or purge SLA. A later migration must be generated by the
same CLI workflow and separately reviewed before adding any function or grant.

## 10. Disposable Preview assertion gate

Before any execute grant, route, worker or model integration, the exact source
revision must clean-apply to a new disposable non-Production Preview. The
schema-only foundation must first pass rollback-only assertions covering:

- `server_version_num >= 160000`; this migration intentionally uses the
  PostgreSQL 16+ role-membership option syntax and has no pre-16 compatibility
  branch;
- namespace absence preflight, distinct expected schema/table owner and
  executor roles, safe admin-only creator edges with no `SET`/`INHERIT`, exact
  ACL/default ACL and exact private object set;
- `relrowsecurity=true` and `relforcerowsecurity=true` on every private table,
  zero schema/table privileges for all API roles and the future executor, and
  executor `rolcanlogin=false`, `rolsuper=false` and `rolbypassrls=false`;
- exactly zero private or public wrapper functions, views, triggers and
  policies, and no `PUBLIC`, anon, authenticated, `service_role` or executor
  schema/table/function privilege;
- exact metadata-only columns, state/hash/time constraints, composite owner
  foreign keys, one active-attempt index and deterministic claim-order index;
- no raw facts, canonical content, provider output, transcript, token, URL,
  locator, raw idempotency key, arbitrary error text or `jsonb` column;
- the default-off settings row and absence of operational policy values;
- invalid hashes, states, terminal shapes, owner bindings, duplicate attempt
  ordinals and duplicate active attempts fail closed;

The later RPC/payload migration must then extend those assertions to cover:

- no unsafe public overload and no unreviewed execute privilege;
- every definer function has a fixed empty search path and allowlisted owner;
- owner A/B isolation and metadata-only acknowledgements;
- initiating-session UUID mismatch, missing/revoked/expired session, deleted or
  banned user, anonymous/unconfirmed/non-provider user;
- wrong-owner, wrong-type, wrong-hash, wrong-schema, expired and revoked privacy
  proofs;
- same-request replay and changed-request idempotency conflict;
- two-worker concurrent claim, `SKIP LOCKED`, single active attempt and
  monotonically increasing attempts;
- wrong/stale lease token, heartbeat bounds, lease expiry and recovery;
- session revocation or privacy-proof expiry between enqueue and claim cannot
  issue or consume a payload-use grant, decrypt facts or start provider work;
- cancellation and late provider-result rejection;
- claim-response and success-response loss replay;
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
- no Points RPC, ledger or wallet mutation.

The same exact revision must then pass the existing canonical JSON vectors,
active-session tests, privacy tests, owner A/B RLS tests and revoked-session
cleanup tests. Preview evidence for an earlier migration revision is not
promotion evidence for this design.

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
disposable branch was deleted and its absence verified. The Production database
was never connected to, queried, migrated or modified, and no runtime
capability or execute grant was enabled. This is failure/cleanup evidence, not
successful Preview evidence.

The repaired source now has the dedicated owner alter its global defaults
inside a temporary `SET ROLE` / `RESET ROLE` window and does not repeat the
schema revoke after the migration actor transfers ownership. A second fresh
branch clean-applied all 13 exact source migrations; the earlier `42501` did not
recur, so that hosted repair is now execution evidence rather than source-only
inference.

The rollback-only assertion then failed inside its transaction because
PostgreSQL 17's `information_schema.table_constraints` includes generated NOT
NULL names as well as the declared constraint names. A transaction-local
comparison showed the expected declared set in `pg_constraint`. The assertion
rolled back and the exact disposable branch was deleted. Production was not
used as the SQL target. The assertion now uses `pg_constraint` with exact
schema/table/ordinary-table filtering, but this revised body has not yet run.
A fresh disposable `r3` must repeat the complete apply and assertion before the
Preview gate can pass.

The source-only registered-worker database adapter may validate a composite
atomic acknowledgement, but that acknowledgement is not proof that a database
transaction, RLS policy, executor-role topology, vault grant or purge outbox
exists. Only the clean-apply and rollback assertions above can provide that
evidence for the exact future migration revision.
