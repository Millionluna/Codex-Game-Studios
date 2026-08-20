# V1 Note generation durable design handoff

> Status: source-only, default-off design. This document records the next
> database and worker boundary; it does not claim that a durable worker, route,
> migration, Preview capability, model call or Production capability exists.

## 1. Scope and non-goals

This design extends the shared five-Note foundation for Communication,
Handover, Progress, NDIS and Incident Factual. It describes durable job
metadata, attempts, leases, recovery and the transaction that may eventually
persist a usable canonical result.

This handoff does not authorize or implement:

- a migration or database connection;
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
The schema must be owned by the migration role and grant no `USAGE` or `CREATE`
to `PUBLIC`, `anon`, `authenticated` or `service_role`.

The proposed private object set is:

1. a single default-off settings row;
2. a metadata-only `jobs` table;
3. a metadata-only `attempts` table;
4. only the minimum private helper functions needed by reviewed public
   wrappers.

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
- an opaque payload-vault handle once that contract is approved;
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

- the payload-vault backend and an opaque, non-URL handle contract;
- encryption and key/version management;
- who may decrypt and for which single job/attempt purpose;
- maximum queued, running, terminal and error retention;
- purge on success, failure, cancellation, timeout and account deletion;
- crash-safe purge retry and evidence without copying content;
- backup, restore and disaster-recovery retention;
- handling of an unavailable, expired, missing or digest-mismatched payload;
- prohibition of payload, tokens and decrypted facts in logs and diagnostics.

Until this decision exists, a schema can describe metadata but no route or
worker may enqueue a durable real-model job. The opaque handle itself must also
remain private and must not act as a bearer token.

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
exact attempt and release an opaque, attempt-bound payload handle to the
worker. A failed session or privacy check atomically
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
5. sync change and mutation receipt;
6. terminal attempt and job update.

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

The future success RPC must complete these eleven operations in one short
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
9. update the document's current revision, then create the sync change and
   idempotent mutation receipt;
10. bind the real document/revision/content hash to the attempt and job and mark
    both `SUCCEEDED`;
11. return a metadata-only `SERVER_ACKNOWLEDGED` result after all durable rows
    exist.

Any exception rolls back all eleven operations. Failure, cancellation, expired
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

Both private tables must enable **and force** RLS as defence in depth and define
no client owner policy. `FORCE ROW LEVEL SECURITY` is required because ordinary
RLS does not constrain the table owner used by reviewed definer functions.
Schema and table privileges are revoked from `PUBLIC`, `anon`, `authenticated`
and `service_role`; the API roles receive neither private schema usage nor
direct table access.

Every privileged function must be narrowly typed, owned by the reviewed
migration role, declared `SECURITY DEFINER`, and use `SET search_path = ''`.
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

## 9. Future migration creation boundary

No migration file is created by this design handoff. When the blockers are
resolved and Supabase CLI is available, the file must first be generated with:

```text
supabase migration new add_v1_note_generation_durable_shadow
```

Implementation must edit the exact filename returned by that command. It must
not invent a timestamp or manually create a migration filename. The migration
must remain default-off, additive, Production-unapplied and free of top-level
transaction syntax when the active migration runner owns the transaction.

## 10. Disposable Preview assertion gate

Before any execute grant, route, worker or model integration, the exact source
revision must clean-apply to a new disposable non-Production Preview and pass
rollback-only assertions covering:

- namespace absence preflight, expected owner, exact ACL/default ACL and exact
  private object set;
- `relrowsecurity=true` and `relforcerowsecurity=true` on every private table,
  zero schema/table privileges for all API roles, and only the reviewed definer
  owner exercising the explicitly tested internal write path;
- no raw facts, content, provider output, transcript, token, Authorization,
  URL, raw idempotency key or arbitrary error text column;
- no unsafe public overload and no `PUBLIC`, anon, authenticated or
  `service_role` execute privilege;
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
  release a payload handle, decrypt facts or start provider work;
- cancellation and late provider-result rejection;
- claim-response and success-response loss replay;
- canonical document + revision 1 + sync change + receipt + terminal job
  atomicity, including injected failure at every boundary;
- zero canonical output after failure, cancellation, stale proof, revoked
  session or transaction rollback;
- identical commit replay remains one document/revision, while changed output
  is rejected;
- payload handle is private, content-free and purged according to the eventually
  approved vault/retention contract;
- no Points RPC, ledger or wallet mutation.

The same exact revision must then pass the existing canonical JSON vectors,
active-session tests, privacy tests, owner A/B RLS tests and revoked-session
cleanup tests. Preview evidence for an earlier migration revision is not
promotion evidence for this design.

## 11. Current evidence boundary

This document was produced from a local read-only audit of the current source.
No Supabase changelog or online documentation was fetched because this batch
was explicitly offline. No migration was generated or applied, no SQL assertion
was executed, no database or Preview was contacted, and no runtime capability
was enabled. Supabase CLI availability and current external platform behaviour
must be reverified before implementation.
