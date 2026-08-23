# V1 Note generation durable design handoff

> Status: default-off design plus two Production-unapplied migrations. The
> schema-only foundation passed its historical deleted-`r4` gate; at source HEAD
> `c7b70e9f84b9b804779039711b85cc7eda55bd57`, the exact worker RPC bundle passed
> isolated PostgreSQL 17.6 migration/assertion evidence on deleted disposable
> `r9`. A subsequent fixed harness on deleted no-data `r20` proved the three
> true two-session claim/session/privacy races on PostgreSQL 17.6; deleted
> no-data `r21` then proved Attempt-2 historical replay through success and
> purge. This is not a retained/applied runtime repository, callable worker,
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
policy. The subsequent migration adds payload metadata,
one-time grants, provider-evidence detail, purge outbox, immutable policy and
registration catalogs, executor policies and the nine reviewed worker RPC
identities. The original three-table foundation and its historical evidence
must still never be described as the atomic transaction in section 7; the
additive revision has separate deleted-`r9` assertion evidence and runtime gates.

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

The three foundation tables and all nine additive private metadata tables
enable **and force** RLS as defence in depth. The foundation had no policy at
its historical schema-only checkpoint; the additive migration now defines only
the command-specific executor policies required by the private RPCs.
`FORCE ROW LEVEL SECURITY` makes the table owner subject
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
The PostgreSQL 16 path and owner A/B runtime integration remain open. Preview
evidence for an earlier migration revision is not promotion evidence for this
design.

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

Independent final source/security review reported no P0/P1. Remaining
activation governance is explicit, not a hidden default:

- treat approved policy catalogs and registration bindings as append-only and
  retain them while jobs/attempts reference their digests, or add a reviewed
  `RESTRICT` attempt-registration foreign key plus index before deletion or
  replacement is possible;
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
revocation race gate. Activation still requires the PostgreSQL 16 path and
owner A/B runtime integration. Deleted `r21` closed the Attempt-2 historical
replay gate; catalog retention, nested exact-key vectors,
account-delete/purge recovery, provider-start binding, numeric parsing and the
runtime/vault governance items above remain open before any caller grant or
registry entry. Only after those results and the vault/KMS/retention, worker
credential, model/provider/STT and Points decisions are separately approved
may runtime activation be considered. Nothing in this handoff authorizes
Preview retention, Production apply, route activation, model/STT traffic or
Points settlement.
