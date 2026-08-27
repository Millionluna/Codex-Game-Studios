# CaresLink AI Automation

> Current-state automation inventory audited 2026-08-09; isolated database evidence updated 2026-08-25. No background worker, cron, payment webhook or notification automation exists in the audited application.

## Current LLM automation

### NDIS Case Note Companion

| Stage | Current behavior | Failure/stop behavior |
|---|---|---|
| Authentication | Supabase session and provider role checked first | 401/403 before body, quota, credit or model |
| Input gate | body shape, minimum facts, confirmations and server identifier scan | stable validation error; no model |
| Credit | reserve one legacy credit using idempotency key | `credit_exhausted` or storage failure; no model |
| Abuse quota | account and IP daily counters | quota response; no model |
| Model | direct OpenAI Responses API call with strict JSON schema and `store:false` | model/network/parse/safety failure |
| Safety | structured parse, bilingual fact checks and prohibited-boundary validation | entire output rejected |
| Persistence | opaque 30-minute claim stores usable result and model/token metadata | failure releases credit |
| Settlement | commit only after claim is usable; otherwise release | repeated terminal request is idempotent |
| Save | provider claims/saves output to owner-bound draft | expired/cross-owner/wrong-feature deny |

The model route is synchronous. There is no queue, worker lease, durable job state, automatic model fallback or unattended retry loop.

### Legacy guided AI

Profile rewrite, share card, referral message, bilingual intro and handover checklist use separate guarded Next routes and OpenAI adapters. They remain legacy provider-workspace functions with access-code/quota gates. They are not V1 Note types and must not share the future personal Points entitlement without a new approved service/rate contract.

## Current API/tool surface

- OpenAI is called through direct HTTPS from server-only adapters in `src/lib/openai-*.ts`.
- No MCP server, third-party tool execution, browsing agent or unrestricted chat loop is exposed to users.
- Supabase service-role repositories and RPCs perform claims, quota and credit operations.
- Vercel Analytics is wrapped by `src/components/safe-vercel-analytics.tsx` to remove unsafe URL/query detail.
- Metadata event routes accept fixed event/attribution vocabularies; no note body is intentionally recorded.
- Portal Referral intake, source detail, Assignment M1a and Provider Response M1b are synchronous request/transaction paths, not automation. They use a request-scoped cookie Supabase client and fourteen restricted public database RPCs in total—three intake, two source-detail, six assignment and three provider-response. The assignment "queue" and provider offer "inbox" are bounded read models, not background job queues; these paths use no `service_role`, OpenAI call, worker, cron, notification or unattended retry.

## Current approvals and human review

- Privacy findings and confirmations are user-reviewed before generation.
- AI output is always a user-reviewable draft, not an approved/compliant/verified record.
- Copy/save do not represent professional, clinical, legal, compliance or quality approval.
- Admin surfaces do not provide an approval workflow or full-content review.

## Current kill switches

| Control | Current effect | Limitation |
|---|---|---|
| Remove/disable `OPENAI_API_KEY` | generation fails closed | coarse; no per-service incident mode |
| Google OAuth feature flag | hides/disables Google path honestly | not a session/device kill switch |
| account/IP quota | limits NDIS model volume | not a budget-aware cost circuit breaker |
| legacy access codes | gates legacy guided materials | not applicable to V1 Notes/Points |
| Vercel rollback | restores prior application deployment | database changes require separate additive rollback plan |
| V1 shadow master + dual-write flags | both exact `true`, Preview environment and exact non-Production Supabase branch ref are required | disabling either immediately prevents new shadow calls after redeploy; legacy save remains available |
| V1 shadow-read flag | enables only metadata hash/status comparison after successful projection | cannot enable write or replace the legacy response |
| Portal API + durable-adapter + independent operation gate | base gates exact `true`, `VERCEL_ENV=preview`, an exact non-Production Supabase ref, the selected intake/detail/assignment/provider-response/follow-up application gate, the master database row and its matching operation row are required | any failed gate stops before a client or private body read where applicable; the five operation slices do not enable one another, including through direct Data API calls. Exact-current Assignment retains its deleted-Preview Hosted Cookie evidence. Provider Response implementation source `f45b19c596edd0bdbe01eba17e6e5fa136df5225` adds active-offer-first selection, request timeouts, principal-boundary command clearing and 6/6 local true-concurrency scenarios. Exact gate source HEAD `44f3bd68699dc953e2666bf033dac2b5e26a4d30` passed the fresh no-data Hosted re-gate on deleted ref `nhupgyxczlvtddycrgyw`: 33/33 migrations, 14/14 rollback suites, real GoTrue SSR-cookie/Data API assertions 14/14 and exact-current active-first/non-null-cursor checks 2/2. Teardown left every Auth/Portal fixture domain at zero, all five then-current flags disabled, three deletion probes passed and Production remained healthy at 19 migrations. M1b remains default-off and Production-unapplied. Follow-up M1c adds a sixth default-off flag plus accepted-provider private detail and fixed-code mutation; its no-TCP, private-Unix-socket PostgreSQL 16.15 local lifecycle passed all 8/8 replay/competition/revocation/ownership races twice with exact cleanup and a SHA-pinned live harness. It still has no Hosted Auth/Data API evidence. No runtime is retained or deployed, and no merge, activation, history/audit/export automation or Vercel/Production deployment was added |

Source-only worker/provider policy schemas now define immutable digests, explicit timing/retry fields and content-free model usage/cost evidence. A source-only registered-worker v2 facade proves authorize/consume, heartbeat/deadline, finish-reason, retry, fencing and response-loss ordering. The default-off adapter maps that facade to nine privileged RPC calls and a one-time vault-consume port. The earlier CLI-generated metadata foundation passed its historical deleted-`r4` PostgreSQL 17 schema/cross-domain gate. At source HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, the subsequent `20260821071044_add_v1_note_generation_worker_rpc_shadow.sql` passed the exact deleted-`r9` PostgreSQL 17.6 migration/assertion gate: 14/14 migrations and seven rollback suites. Its executor-only RLS policies, object ACLs, nine executor-owned `SECURITY DEFINER` functions with `search_path=''`, hard-off settings and empty catalogs/registrations passed an independent postcheck. Deleted no-data `r20` later passed the three true two-session PostgreSQL 17.6 claim/session/privacy races through verified Session Pooler TLS, then removed the temporary runner, support surface and branch. Deleted no-data `r21` then passed the fixed Attempt-2 historical replay and post-purge lifecycle gate without duplicate canonical/evidence/outbox side effects. This is isolated schema/transaction evidence, not runtime automation: no API role or `service_role` has RPC `EXECUTE`, the runtime registry is empty, every factory is `TEST_ONLY`, and readiness is false. There is still no approved runtime model-policy registry, deployed worker, payload vault/KMS/retention contract, per-service budget threshold, validated fallback model switch, served job-cancellation control or central incident dashboard.

Communication provider-evaluation M1d adds a real server-only OpenAI Responses
HTTPS adapter, but no automation imports it. It has an explicit disposable
evaluation capability, injected secret/model/fetch/clock, a fixed endpoint,
`store:false`, no tools, strict structured output, bounded JSON and no adapter
retry. Runtime output validation requires matching local event date/time and
exact non-date Arabic-number quantities in all three drafts, and rejects new
numeric tokens in generated lists. Mocked-fetch tests are the only execution
evidence; there was no provider traffic. Provider/model selection, full semantic
groundedness, OpenAI data-handling/ZDR/region approval, payload-vault retention,
worker registration, route, Points and Production authorization remain explicit
blockers. See
`documentation/communication-note-provider-evaluation-m1d.md`.

Supabase CLI 2.115.0 has since generated source-only migration `20260823213144_harden_v1_note_generation_registration_retention.sql`. It adds `attempts_registration_digest_idx` and the named `attempts_registration_catalog_fk` from `attempts.registration_digest` to `worker_registrations.registration_digest`, with update/delete `RESTRICT`, `NOT VALID` creation and explicit validation. It creates no seed, caller grant, runtime surface or Production change. Its local gate passed 39/39 focused contracts, the full 125-file / 1,381-test suite, lint, TypeScript, the 63/63-page production build, the 73-file Codex-adapter sync check and `git diff --check`. Deleted disposable `r22` then clean-applied the current manifest 15/15 and passed the seven rollback suites; the hosted registration-retention gate is now closed without enabling any runtime automation.

### PostgreSQL 16.15 local isolated gate — 2026-08-24

On a worktree based on HEAD
`93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea`, a disposable Homebrew
PostgreSQL 16.15 cluster (`server_version_num=160015`) clean-applied all 27
repository migrations: the 12 pre-V1 migrations followed by the exact current
V1 manifest 15/15. All seven rollback suites passed with the current durable
assertion body (37547 bytes; SHA-256
`2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`)
and worker assertion body (153956 bytes; SHA-256
`1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`).
The independent postcheck proved 12 private generation tables, nine worker RPCs,
hard-off settings, zero checked fixtures, denied API access, only the two
expected admin-only creator edges and the exact validated retention foreign key
plus index.

A strict local-only harness then held two independent backend PIDs on loopback
`127.0.0.1:55432` and passed 3/3 `SKIP LOCKED`,
session-revocation-first and privacy-authorization-first races. It used no TLS,
password or credential material. Its fixed setup and cleanup bodies had SHA-256
`ba183bacf8b35a2493b520563ce2fe2d1193e0638af17d2be62c8b58076112bc`
and `e4aa567f372885137f2b0251f51ea1818a5ca329ec9ed8a9a9f8355cc3ecbecb`;
the two focused harness/policy files passed 59/59 and the complete Preview E2E
policy suite passed 3 files / 72 tests. Fixed SQL cleanup removed the database
runner, `TEST_ONLY` helper surface and fixtures. The outer gate then stopped the
server and deleted the exact cluster directory, Colima profile and disk. The
complete current handoff also passed 125
files / 1,400 tests, TypeScript, full lint, the 63/63-page Next production build
and the 73-file Codex-adapter sync check. Production was never a target, and no
deployment, grant, runtime activation or paid resource was created.

Supabase CLI 2.115.0 accepts local `db.major_version` only for 13, 14, 15 and
17, so this evidence deliberately used vanilla PostgreSQL 16 plus the minimum
Supabase-compatible roles, Auth stubs and `pgcrypto` surface required by the
repository migrations. It closes the PostgreSQL 16 database-engine, serial and
true-two-session gates; it is not GoTrue, PostgREST, `supautils`, Advisors or
hosted Supabase parity evidence.

### Registered-worker owner A/B database integration boundary — 2026-08-24

The current batch closes only the **worker half** of owner A/B runtime database
integration. The existing default-off registered-worker adapter is bound to the
exact nine private worker RPC identities through an explicitly injected,
server-private database port implemented by
`note-generation-registered-worker-postgres.server.ts`. It creates no
connection, pool, environment lookup, role or grant. Separate synthetic owner A
and owner B database bindings remain database-derived. Claim/authority calls
accept no caller-supplied owner, session, clock, retry policy, raw payload or
locator. Lease-bound calls intentionally carry an opaque lease token, and the
success commit intentionally carries canonical NoteContent; returned
acknowledgements and retained gate evidence remain content-free.

This closure does not create the full durable runtime repository. Owner
admission and enqueue, owner-safe job status/read, cancellation, a caller
credential or grant, runtime registry, scheduler, route and deployment remain
absent. Every application readiness latch and the Production/default database
state remain off. Fixed TEST_ONLY setup temporarily enabled the private setting
inside the disposable local execution window only; cleanup restored its hard-off
constraint. Normal payload consumption remains fail-closed without an approved
vault, and neither Preview retention nor any Production action is authorized.

The isolated execution used a worktree based on
`ec29430dec7a79c611a552a52e36277e3512166e` and a disposable vanilla
PostgreSQL 16.15 cluster. The cluster listened only on passwordless loopback
`127.0.0.1:55432`; management SQL additionally required the exact temporary
data-directory pattern, cluster name, bootstrap marker and application name. A
local superuser was used only for bootstrap, migration and fixture lifecycle,
while the tested worker connection used the fixed
`careslink_v1_generation_owner_ab_runner` role with
`NOSUPERUSER / NOINHERIT / NOBYPASSRLS`, connection limit 1, no effective
application-table or `TEMPORARY` privilege or owner/executor membership, and
exact ACLs for only the nine reviewed RPCs plus eight fixed TEST_ONLY helpers.
The current migration sequence applied 27/27 and the
pre-setup baseline was 12 private tables, nine RPCs, hard-off and zero
generation rows. This run did not repeat or replace the earlier seven-suite
non-superuser PG16 migration proof.

The setup/quiesce/cleanup hashes were
`a2b4ddd54acbbc621aa886b70b1c80dfac56de4b722154f4e9820f16b2aeea7b`,
`e6ea88f8a280626c0059ee3a7e9d131382520630f2a7733d3983e5161f2a4ef0`
and `e490809e3c39cb17d8d407399200743378df2b29d84bbd9da35da0cec18ff203`.
The explicit live test passed 2/2: A/B success, A/B unqualified RLS projection
1/1, C projection 0, five cross-owner capability denials, response-loss resolve
without commit retry, replay-safe privacy denial and zero vault calls. The
fixed A/B consumed-grant helpers updated metadata only and released no payload
or capability.

An independent quiesce committed `NOLOGIN`, rejected a new runner connection
and found no active runner session before cleanup. Cleanup removed the exact
fixtures, grants, helpers, schema and runner and restored the membership and
PUBLIC `TEMPORARY` baselines. Independent postcheck counts were zero for
Auth users/sessions, privacy, canonical and generation/catalog data; capability
was hard-off, unexpected RPC ACLs were zero and all nine RPCs still denied every
API/service role. The local
server and exact temporary directory were then deleted. No scheduler, retained
worker, hosted Preview, Production action, deployment or paid resource was
created.

### Owner admission/status/cancel source boundary — 2026-08-24

Production-unapplied migration
`20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql` adds a
separate `careslink_v1_generation_owner_api_executor`. It is `NOLOGIN`,
`NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`, is not the worker executor and is
not a caller credential. The migration adds one database-owned,
default-empty `admission_policy_bindings` catalog and exactly three private
`SECURITY DEFINER` RPC identities for admit-and-enqueue, owner-safe status and
cancel. No active binding is seeded, the database capability stays hard-off,
and no API role, `service_role` or application caller receives `EXECUTE`.

The binding selects a frozen policy bundle rather than uniquely allowlisting a
worker. Another complete valid Five-Note registration may claim only when its
worker policy, payload policy and the queued Note type's provider policy match
the job; its other four provider policies need not match.

The private `TEST_ONLY` direct-query adapter
`note-generation-owner-repository.server.ts` accepts only an explicitly
injected query port and authenticated principal. It creates no connection,
pool, environment lookup, Data API/PostgREST call, route or registry entry.
Admission uses database time, fresh session and privacy reads, an exact active
database catalog selection and an owner/idempotency advisory lock. An accepted
request creates the job and available payload metadata atomically; exact
replay preserves the existing owner-safe job, while request or staged-identity
conflicts fail closed. Status and cancellation deliberately remain available
when the admission kill switch is off so an incident does not strand already
accepted work.

Cancellation serializes on the job and atomically cancels a running attempt
when one exists, revokes every issued payload grant, logically revokes the
payload, creates exactly one purge-outbox request and finishes the job as
`CANCELLED`. A queued job does not invent an attempt. The adapter exposes no
attempt-list operation, raw facts, payload handle or internal policy identity.

A disposable local PostgreSQL 16.15 gate applied #1 through #24 and the #26
through #28 tail as the non-superuser migration actor, including a fresh exact
replay of final migration #28. In this hand-built
minimum compatibility bootstrap, #25 was the bootstrap-superuser ownership
transition, so this run is **not** evidence that all 28 migrations applied as a
non-superuser. The new owner assertion, the additive-aware worker assertion and
the durable-foundation assertion each completed and rolled back. Frozen owner
assertion evidence is 100936 bytes / SHA-256
`05a3e4b95559981a1919a4dae83157ecef60f7485c1afd76150199a50f7990b8`
for the full file and 100156 bytes / SHA-256
`c8ad3fca9432afa1410807eec38c4c451ba885713a54ddec15149c26f1706bfa`
for its executable body. The additive-aware worker assertion is 158635 bytes /
SHA-256
`a2c1da6c7a94bd43f5a2d93ce7ecdbe5832fad53e2756d0b0cc4dc1d3b0bfe9c`
for the full file and 154903 bytes / SHA-256
`6ed296b0764cf80b13915758209797d2de8b4a247296652f3ea63ad01bd50b94`
for its executable body.
The final independent postcheck confirmed 13/13 forced-RLS tables, 27 owner
policies, three private RPCs, 19 direct function `EXECUTE` ACL entries including
those RPCs, hard-off settings and
zero non-settings rows. A true two-connection auth-session lock wait returned
`P0001 SESSION_REVOKED` after the session expired while blocked.
The final source gate passed 130 test files / 1522 tests, TypeScript, full lint,
the 63/63-page Next production build, the 73-file adapter sync check and
`git diff --check`.

This is local database/source evidence only. It is not hosted GoTrue or
PostgREST evidence, a retained Preview, a route, deployment, model/STT call,
vault consume or Production activation. Attempt listing, real
vault/KMS/retention and orphan recovery, the caller credential/grant/route,
hosted Auth/Data API validation, provider/model/STT integration, Points and
account deletion remain open. The subsequent source/local-only batch now
supplies graceful registration retirement; emergency revocation and its
in-flight grant/payload/purge recovery contract remain open.

### Worker-registration graceful retirement source/local boundary — 2026-08-24

Migration #29,
`20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql`,
is the fifth Production-unapplied generation migration. It deliberately leaves
the canonical worker registration immutable, digest-bound and
`status='APPROVED'`. A separate forced-RLS
`worker_registration_retirements` ledger records one append-only operational
retirement fact under the distinct non-login
`careslink_v1_generation_registration_control_executor`.

The control-executor-owned RPC accepts one operation UUID, one of the fixed
`ROTATED`, `DECOMMISSIONED` or `POLICY_SUPERSEDED` reasons and the exact unique,
sorted active-binding version set. It locks bindings before the registration,
rechecks the set and atomically retires those bindings with the ledger insert.
Exact replay is write-free; a stale or changed expected set fails closed. No
caller is granted this identity, and no retirement, binding, seed, credential,
route, registry entry or runtime activation is created by the migration.

This is graceful drain behavior, not an emergency kill switch. A committed
retirement stops new owner admission and new worker claim. It does not stop an
existing attempt's heartbeat, fence, payload authorization/consume, success
commit, failure settle, resolve or recovery, and it does not stop owner status
or cancellation. Terminal failed recovery history remains insertable. An
emergency revoke contract for in-flight authority remains a separate release
blocker.

The migration increases the private generation inventory to 14 forced-RLS
tables and adds the ninth current rollback-only suite; the owner suite had
already raised the historical seven-suite inventory to eight. The final clean
PostgreSQL 16.15 gate applied 29/29 migrations, passed all 9 suites, the
independent 14-table/four-role/hard-off/zero-fixture postcheck and both real
retirement/claim lock orderings. Production was not targeted, and no retained
Preview, deployment or paid runtime resource was created.

### Hosted migration-entry role restoration — 2026-08-25

The five Production-unapplied generation migrations now preserve their
file-entry migration actor across all 25 temporary owner/executor windows. The
capture is transaction-local; restoration is session-scope so it remains in
effect after the migration transaction commits. This removes the unsafe
assumption that PostgreSQL `RESET ROLE` returns from a Hosted transport login
to the preceding migration actor. #26 also grants and revokes the temporary
auth-reader schema `CREATE` privilege against the identifier-safe captured
actor rather than `session_user`.

A fresh local PostgreSQL 16.15 Hosted-like topology first proved the rollback
path, dynamic ACL path, post-commit role state and a full #25 apply. Hosted
diagnostic Previews then exposed the same unsafe exit in nine rollback suites:
they now capture their assertion-entry actor once and explicitly restore it at
all 82 completed role windows. The dedicated role-restoration suite now checks
the temporary direct table ACL rather than inherited effective privilege.

The final non-default, `persistent=false`, `with_data=false` Preview was
`hosted-role-restore-r5-20260825` (id
`d68d531a-55e6-4374-be68-494da7542c75`, ref
`eqqlvqqhvsogusqhzuaq`). One official Supabase CLI 2.115.0 remote reset applied
the exact 30-migration manifest and passed all 11 rollback suites. A separate
rollback-only postcheck retained 14 owner-correct forced-RLS generation tables,
the four locked role identities and exact bootstrap edges, both #26 readers and
all five #30 Portal definer functions under the entry actor, hard-off settings,
zero checked fixtures, and no API or schema-`CREATE` leak. Security advisors
reported zero generation findings; performance findings remain documented
advisories rather than release-boundary failures. The Preview was deleted and
its id/ref absence was verified. Production was never a SQL target, and no
deployment, activation, retained data or ongoing Preview charge remains.
The deleted-`r5` source snapshot gate passed the 11 direct contract files (162
tests), the full
134-file / 1,657-test Vitest suite, TypeScript, lint, the Next.js 16.2.9 webpack
production build with 63/63 static pages, the 73-file adapter check and diff
checks.

## Inactive shadow automation contracts

- The contract and migrations define generation/export job states. Source-only memory contracts model leases, recovery, retry policy, provider evidence and single-use payload grants, and the registered-worker v2 facade composes those boundaries without a payload locator. All five generation migrations remain Production-unapplied; deleted `r9` supplied isolated PostgreSQL 17.6 execution evidence for database-clock claim/heartbeat/fence/commit/settle/resolve/recover/authorize/consume logic and payload/grant/evidence/purge-outbox metadata, deleted `r20` supplied the three true two-session race results, and deleted `r21` supplied exact historical transient-retry/success replay through payload/outbox purge. The later local owner-repository gate covers the three private owner RPCs, and migration #29 adds only the non-login control-executor-owned graceful-retirement identity described above. There is still no caller grant. Normal consume deliberately settles `DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE` and returns no vault grant, locator or facts; the historical rollback-only `TEST_ONLY` `CONSUMED` fixture proves only scripted canonical transaction atomicity. There is still no payload vault, queue service, deployed worker, live retry loop or served cancellation endpoint.
- No worker automation may be scheduled yet. Deleted `r20` closed the PostgreSQL 17.6 true two-session claim/session/privacy race gate, deleted `r21` closed the fixed Attempt-2 historical replay gate, deleted `r22` closed the hosted registration-retention gate, the earlier isolated local PostgreSQL 16.15 run closed its recorded engine/serial/true-two-session version gate, and deleted `r5` closed its historical Hosted 30/30 migration, then-current 11/11 assertion and independent posture gate. Owner admission/enqueue/status/cancel and graceful worker-registration retirement now have source, local SQL and deleted-Hosted schema/transaction boundaries, but emergency revocation, attempt listing, nested database exact-key envelopes, account-delete/purge and orphan recovery, provider-start binding to a consumed grant plus fresh lease/heartbeat, sequential JSON numeric parsing hardening, and the payload-vault/KMS/retention, caller/route, hosted Auth/Data API, model/STT, Points and runtime-activation blocks remain unproved explicit governance.
- The source follow-up for the two #26 readers and five #30 Portal functions is
  complete: their seven exact `pg_proc.proowner` signature checks now live in
  the maintained worker and Portal-intake rollback suites. The enhanced worker
  body is 162,857 bytes / SHA-256
  `1c30fd7a8604ec8a279ac8d8cf00155bf54801ee15d91dc8ecbc7bc9bc9cf859`;
  the enhanced Portal-intake body is 39,728 bytes / SHA-256
  `2255331b99ff6c4ca05b3a79578c6daa601e26662633063aa004f43423e3729f`.
  Deleted `r5`'s independent postcheck remains historical Hosted owner-posture
  evidence, but `r5` did not execute these enhanced exact bodies. No fresh
  Hosted exact-body gate has occurred, and Production has not been touched.
- The memory Points reference store proves quote/reserve/commit/release semantics. The SQL draft exposes five `security definer` shadow RPCs only to `service_role`; those RPCs passed isolated branch tests for settlement, replay/conflict, source-lot release, expiry, insufficient balance and cross-owner denial. The migration remains unapplied to Production and no server route calls it.
- The legacy NDIS adapter remains pure. The server-only NDIS integration invokes it only after a successful legacy Save on an explicitly verified Preview. The RPC creates an owner-bound shadow revision and metadata-only outbox; optional read comparison records `MATCH/MISMATCH/MISSING/ERROR`. No call invokes OpenAI or settles Points.
- There is no automatic retry worker. `audit_ndis_shadow_reconciliation` is a service-role-only, read-only operator surface that reports IDs/status/timestamps/hashes. Live legacy rows remain the projection retry source; a legacy-schema canonical document whose source has disappeared while the lifecycle is still non-terminal is reported as `SOURCE_DELETE_CLEANUP_PENDING` for operator cleanup.
- Isolated database runs proved same-idempotency concurrency (`PROJECTED` + `REPLAYED`), serialized distinct revisions and retained failure evidence. A later protected App Preview proved `PROJECTED`/`MATCH`, same-key replay, provider B isolation and master kill-switch behavior with zero model calls. Projection/adapter failure now emits content-free `PROJECTION_ERROR`; no note text, participant fact, credential or secret is logged. Test data/users were cleared and temporary activation flags/deployments were removed without changing Production.
- Final pre-commit review hardened the Production-unapplied source beyond that Preview: mutation identity now includes source status/time and creation generation, replay must still point at the current revision, source locking precedes validation, comparison correlation reuse is conflict-safe, legacy Delete atomically carries its deleted generation into a strictly idempotent fail-safe canonical tombstone, PURGED remains terminal, and missed delete cleanup is operator-visible. Forward migrations `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048` passed on the retained branch, including real pre-identity backfill, orphan fail-close, PURGED repair, `SOURCE_DELETE_CLEANUP_PENDING` and same-ID/new-generation ABA fixtures, cleanup to zero and both updated rollback assertion suites. The earlier protected deployment is not evidence for the revised route bundle, so a new protected Preview remains required before promotion.
- The fourth disposable database, `r4` (`careslink-note-durable-preview-20260821-r4`, id `ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b`, ref `czqdjqdjghmmzukstprt`), was non-default, `persistent=false` and `with_data=false` under parent default `adocsnwnslxhxcjgbyee`, then deleted after the six rollback suites. Both its exact ID and ref were absent afterward, while the parent default still existed. Production was not used as the SQL target, and no Production action, deployment, runtime flag or API/executor grant was added or enabled.
- The worker gate used disposable `r9` (`v1-note-worker-rpc-r9`; id `a1571c30-a322-4cea-b332-b189804df195`; ref `hyczevivoakmflswmwlb`), a non-default, `persistent=false`, `with_data=false` PostgreSQL 17.6 child of default Production project `adocsnwnslxhxcjgbyee`. It passed 14/14 migrations, 7/7 rollback suites and the independent 12-table/9-RPC hard-off, zero-row, role/RLS/ACL postcheck. Security advisors were globally 23 INFO + 3 WARN, all three WARN pre-existing public `get`/`list`/`pull` functions ([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); generation scope had zero findings. Performance advisors were globally 144 INFO + 11 WARN; generation scope had 20 INFO—14 [unindexed composite foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) plus 6 [unused fresh indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)—and zero WARN/ERROR. Independent review reported P0/P1/P2(delete) = 0. The branch was exactly deleted and its ID/ref were absent afterward; the Production parent remained the default branch and healthy, and was never the SQL target.
- The true two-session worker gate used disposable no-data PostgreSQL 17.6 `r20` through the Session Pooler with verified client TLS. A temporary least-privilege runner passed `SKIP LOCKED`, session-revocation-first and privacy-authorization-first races. Management then committed runner `NOLOGIN`, drained only the exact idle pooler backends, removed the fixed fixtures/support schema/runner and passed the independent zero/posture postcheck. Security advisors were 26 global findings and zero generation findings. Performance advisors were 133 global findings; generation scope was 18 INFO with zero WARN/ERROR and zero concurrency-specific findings. The branch was deleted; Production remained `ACTIVE_HEALTHY` and was never the SQL target.
- The Attempt-2 historical replay gate used worktree-base HEAD `000f17af88eff9266a92e484ba2080335d20fd2d` and the exact 146488-byte worker assertion body with SHA-256 `bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`. Disposable `r21` (`v1-note-worker-rpc-r21`; id `688da83b-78e8-45fa-8646-b015822d59b0`; ref `kfgjxlilotpaxnozomqq`) was non-default, `persistent=false`, `with_data=false` and PostgreSQL 17.6 at the confirmed US$0.01344/hour Preview rate. It clean-applied 14/14 migrations and passed 7/7 rollback suites. Attempt 1's transient-retry acknowledgement replayed exactly while Attempt 2 was `RUNNING`, after Attempt 2 was `SUCCEEDED`, and after payload/outbox `PURGED`; Attempt-2 commit and resolve replayed exactly; a stale but otherwise valid Attempt-1 commit was rejected as `LEASE_EXPIRED`; pre-success directed side effects were absent, while every post-success replay/purge stage retained exactly one canonical/revision/sync/receipt/evidence/outbox row; and recovery returned zero work. The independent postcheck retained 12 tables, nine RPCs, hard-off settings, zero fixture rows, denied API access and two admin-only creator edges. Advisors matched `r9`: security was 23 INFO + 3 WARN globally with zero generation findings; performance was 144 INFO + 11 WARN globally with 20 generation INFO (14 foreign-key indexing findings + 6 unused-index findings). The exact branch was deleted, so no ongoing charge or accrued total is inferred; only the healthy default Production project remained, and Production was never the SQL target. No deployment, caller grant, runtime flag or activation was added.
- The registration-retention source batch is `20260823213144_harden_v1_note_generation_registration_retention.sql`, generated by Supabase CLI 2.115.0. Its single-column `attempts_registration_digest_idx` supports the named `attempts_registration_catalog_fk`, which binds every attempt digest to its immutable worker-registration digest using update/delete `RESTRICT`; the constraint is added `NOT VALID` and then explicitly validated. The batch adds no seed, caller grant, runtime entrypoint or Production capability. Historical `r9`/`r20`/`r21` remain prior 14/14 evidence; the current hosted proof is the separate deleted `r22` gate.
- At execution-source HEAD `4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf`, disposable `r22` (`v1-note-worker-rpc-r22`; id `0bc8db56-0e4a-42ec-9595-1f32a3d74a6b`; ref `wuzcjcfrkctelcnbbgtg`) was non-default, `persistent=false`, `with_data=false`, PostgreSQL 17.6 (`server_version_num=170006`) at the confirmed US$0.01344/hour rate. It clean-applied 15/15 migrations and passed 7/7 rollback suites with the exact current worker assertion body (153956 bytes; SHA-256 `1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb`) and durable assertion body (37547 bytes; SHA-256 `2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6`). The postcheck retained 12 tables, nine RPCs, hard-off settings, zero checked fixtures, denied API access, two admin-only creator edges and the exact validated FK/index. Security advisors reported 23 INFO + 3 pre-existing WARN globally and zero generation findings. Performance advisors reported 144 INFO + 11 WARN globally; generation scope contained 20 INFO (14 unindexed foreign keys + 6 unused indexes) and zero WARN/ERROR. The branch was deleted and both ID/ref were absent afterward, so no accrued total is inferred; Production remained default and `ACTIVE_HEALTHY`, and was never the SQL target. No deployment, caller grant or runtime activation was added.
- The OpenAPI file describes proposed `/v1` operations only and intentionally has no `servers` entry. It is not a callable tool/API surface.

## Background jobs, webhooks, email and schedules

| Capability | Current status |
|---|---|
| generation worker/queue | absent at runtime; all five generation migrations are Production-unapplied and exist on no retained Preview. The worker RPC migration contains nine private worker identities, the registration-retention migration adds its index/foreign key, the owner-runtime migration adds three private owner identities plus a default-empty admission binding, and migration #29 adds one separately owned graceful-retirement control identity plus the fourteenth forced-RLS table. Settings/catalog/registration remain fail-closed, no API/service role has `EXECUTE`, the canonical registration remains immutable `APPROVED`, and the source-only registry plus worker/owner database-adapter factories remain empty/`TEST_ONLY` |
| transcription worker | absent |
| export worker/artifact cleanup | absent |
| claim cleanup cron | absent; expired rows become unclaimable and are opportunistically cleaned |
| Points expiry/reconciliation job | absent |
| Stripe/Apple/Google webhook | absent |
| subscription reconciliation | absent |
| content publication/withdrawal job | absent |
| reminder/Daily Brief scheduler | absent |
| push/email delivery | absent |

Supabase Auth provider-managed authentication emails are infrastructure behavior, not an app-owned email automation. No `emails.md` or `cron.md` is created for non-existent workflows.

## Intended V1 automation (state contracts partly codified; runtime not implemented)

1. **Generation jobs**: queued/running/succeeded/failed/cancelled, owner-queryable, idempotent, persist result revision before Points commit.
2. **Transcription jobs**: explicit cloud fallback, short raw-audio TTL, transcript review, no background listening.
3. **Export jobs**: revision-bound renderer, short artifact TTL, safe cancellation/partial retry, no persistent file bytes after expiry.
4. **Points maintenance**: lot expiry/revoke/adjust through append-only entries, reservation expiry, reconciliation and alerting.
5. **Billing webhooks**: globally idempotent receipt/event processing with restore/refund and daily reconciliation.
6. **Content workflow**: editor/approver separation, translation/source validation, publish/correct/withdraw and cache invalidation.
7. **Daily Brief/notifications**: explainable candidate selection, preference/quiet-hours/frequency controls, safe payload and inbox.
8. **Data control jobs**: reauthenticated export, delete/tombstone, processor deletion and legal-hold exception tracking.

## Automation release gate

Before any target automation is enabled:

- define owner, input/output schema, idempotency key and terminal states;
- prove authentication/authorization before content or cost;
- document retention, retries, cancellation and dead-letter behavior;
- add metadata-only observability and correlation IDs;
- add budget/incident kill switch and a tested rollback path;
- verify cross-owner denial and no input/output in analytics/logs;
- obtain explicit production approval for migrations, providers and environment changes.
