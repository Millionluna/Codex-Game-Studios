# CaresLink AI Automation

> Current-state automation inventory audited 2026-08-09; isolated database evidence updated 2026-08-24. No background worker, cron, payment webhook or notification automation exists in the audited application.

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

Source-only worker/provider policy schemas now define immutable digests, explicit timing/retry fields and content-free model usage/cost evidence. A source-only registered-worker v2 facade proves authorize/consume, heartbeat/deadline, finish-reason, retry, fencing and response-loss ordering. The default-off adapter maps that facade to nine privileged RPC calls and a one-time vault-consume port. The earlier CLI-generated metadata foundation passed its historical deleted-`r4` PostgreSQL 17 schema/cross-domain gate. At source HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, the subsequent `20260821071044_add_v1_note_generation_worker_rpc_shadow.sql` passed the exact deleted-`r9` PostgreSQL 17.6 migration/assertion gate: 14/14 migrations and seven rollback suites. Its executor-only RLS policies, object ACLs, nine executor-owned `SECURITY DEFINER` functions with `search_path=''`, hard-off settings and empty catalogs/registrations passed an independent postcheck. Deleted no-data `r20` later passed the three true two-session PostgreSQL 17.6 claim/session/privacy races through verified Session Pooler TLS, then removed the temporary runner, support surface and branch. Deleted no-data `r21` then passed the fixed Attempt-2 historical replay and post-purge lifecycle gate without duplicate canonical/evidence/outbox side effects. This is isolated schema/transaction evidence, not runtime automation: no API role or `service_role` has RPC `EXECUTE`, the runtime registry is empty, every factory is `TEST_ONLY`, and readiness is false. There is still no approved runtime model-policy registry, deployed worker, payload vault/KMS/retention contract, per-service budget threshold, validated fallback model switch, registered job cancellation control or central incident dashboard.

## Inactive shadow automation contracts

- The contract and migrations define generation/export job states. Source-only memory contracts model leases, recovery, retry policy, provider evidence and single-use payload grants, and the registered-worker v2 facade composes those boundaries without a payload locator. Both private migrations remain Production-unapplied; deleted `r9` supplied isolated PostgreSQL 17.6 execution evidence for database-clock claim/heartbeat/fence/commit/settle/resolve/recover/authorize/consume logic and payload/grant/evidence/purge-outbox metadata, deleted `r20` supplied the three true two-session race results, and deleted `r21` supplied exact historical transient-retry/success replay through payload/outbox purge. There is still no caller grant. Normal consume deliberately settles `DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE` and returns no vault grant, locator or facts; the rollback-only `TEST_ONLY` `CONSUMED` fixture proves only scripted canonical transaction atomicity. There is still no payload vault, queue service, deployed worker, live retry loop or cancellation endpoint.
- No worker automation may be scheduled yet. Deleted `r20` closed the PostgreSQL 17.6 true two-session claim/session/privacy race gate, and deleted `r21` closed the fixed Attempt-2 historical replay gate. PostgreSQL 16, owner A/B runtime integration, catalog/registration retention, nested database exact-key envelopes, account-delete/purge recovery, provider-start binding to a consumed grant plus fresh lease/heartbeat, sequential JSON numeric parsing hardening, and the payload-vault/caller/runtime activation blocks remain explicit governance.
- The memory Points reference store proves quote/reserve/commit/release semantics. The SQL draft exposes five `security definer` shadow RPCs only to `service_role`; those RPCs passed isolated branch tests for settlement, replay/conflict, source-lot release, expiry, insufficient balance and cross-owner denial. The migration remains unapplied to Production and no server route calls it.
- The legacy NDIS adapter remains pure. The server-only NDIS integration invokes it only after a successful legacy Save on an explicitly verified Preview. The RPC creates an owner-bound shadow revision and metadata-only outbox; optional read comparison records `MATCH/MISMATCH/MISSING/ERROR`. No call invokes OpenAI or settles Points.
- There is no automatic retry worker. `audit_ndis_shadow_reconciliation` is a service-role-only, read-only operator surface that reports IDs/status/timestamps/hashes. Live legacy rows remain the projection retry source; a legacy-schema canonical document whose source has disappeared while the lifecycle is still non-terminal is reported as `SOURCE_DELETE_CLEANUP_PENDING` for operator cleanup.
- Isolated database runs proved same-idempotency concurrency (`PROJECTED` + `REPLAYED`), serialized distinct revisions and retained failure evidence. A later protected App Preview proved `PROJECTED`/`MATCH`, same-key replay, provider B isolation and master kill-switch behavior with zero model calls. Projection/adapter failure now emits content-free `PROJECTION_ERROR`; no note text, participant fact, credential or secret is logged. Test data/users were cleared and temporary activation flags/deployments were removed without changing Production.
- Final pre-commit review hardened the Production-unapplied source beyond that Preview: mutation identity now includes source status/time and creation generation, replay must still point at the current revision, source locking precedes validation, comparison correlation reuse is conflict-safe, legacy Delete atomically carries its deleted generation into a strictly idempotent fail-safe canonical tombstone, PURGED remains terminal, and missed delete cleanup is operator-visible. Forward migrations `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048` passed on the retained branch, including real pre-identity backfill, orphan fail-close, PURGED repair, `SOURCE_DELETE_CLEANUP_PENDING` and same-ID/new-generation ABA fixtures, cleanup to zero and both updated rollback assertion suites. The earlier protected deployment is not evidence for the revised route bundle, so a new protected Preview remains required before promotion.
- The fourth disposable database, `r4` (`careslink-note-durable-preview-20260821-r4`, id `ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b`, ref `czqdjqdjghmmzukstprt`), was non-default, `persistent=false` and `with_data=false` under parent default `adocsnwnslxhxcjgbyee`, then deleted after the six rollback suites. Both its exact ID and ref were absent afterward, while the parent default still existed. Production was not used as the SQL target, and no Production action, deployment, runtime flag or API/executor grant was added or enabled.
- The worker gate used disposable `r9` (`v1-note-worker-rpc-r9`; id `a1571c30-a322-4cea-b332-b189804df195`; ref `hyczevivoakmflswmwlb`), a non-default, `persistent=false`, `with_data=false` PostgreSQL 17.6 child of default Production project `adocsnwnslxhxcjgbyee`. It passed 14/14 migrations, 7/7 rollback suites and the independent 12-table/9-RPC hard-off, zero-row, role/RLS/ACL postcheck. Security advisors were globally 23 INFO + 3 WARN, all three WARN pre-existing public `get`/`list`/`pull` functions ([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); generation scope had zero findings. Performance advisors were globally 144 INFO + 11 WARN; generation scope had 20 INFO—14 [unindexed composite foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) plus 6 [unused fresh indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)—and zero WARN/ERROR. Independent review reported P0/P1/P2(delete) = 0. The branch was exactly deleted and its ID/ref were absent afterward; the Production parent remained the default branch and healthy, and was never the SQL target.
- The true two-session worker gate used disposable no-data PostgreSQL 17.6 `r20` through the Session Pooler with verified client TLS. A temporary least-privilege runner passed `SKIP LOCKED`, session-revocation-first and privacy-authorization-first races. Management then committed runner `NOLOGIN`, drained only the exact idle pooler backends, removed the fixed fixtures/support schema/runner and passed the independent zero/posture postcheck. Security advisors were 26 global findings and zero generation findings. Performance advisors were 133 global findings; generation scope was 18 INFO with zero WARN/ERROR and zero concurrency-specific findings. The branch was deleted; Production remained `ACTIVE_HEALTHY` and was never the SQL target.
- The Attempt-2 historical replay gate used worktree-base HEAD `000f17af88eff9266a92e484ba2080335d20fd2d` and the exact 146488-byte worker assertion body with SHA-256 `bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac`. Disposable `r21` (`v1-note-worker-rpc-r21`; id `688da83b-78e8-45fa-8646-b015822d59b0`; ref `kfgjxlilotpaxnozomqq`) was non-default, `persistent=false`, `with_data=false` and PostgreSQL 17.6 at the confirmed US$0.01344/hour Preview rate. It clean-applied 14/14 migrations and passed 7/7 rollback suites. Attempt 1's transient-retry acknowledgement replayed exactly while Attempt 2 was `RUNNING`, after Attempt 2 was `SUCCEEDED`, and after payload/outbox `PURGED`; Attempt-2 commit and resolve replayed exactly; a stale but otherwise valid Attempt-1 commit was rejected as `LEASE_EXPIRED`; pre-success directed side effects were absent, while every post-success replay/purge stage retained exactly one canonical/revision/sync/receipt/evidence/outbox row; and recovery returned zero work. The independent postcheck retained 12 tables, nine RPCs, hard-off settings, zero fixture rows, denied API access and two admin-only creator edges. Advisors matched `r9`: security was 23 INFO + 3 WARN globally with zero generation findings; performance was 144 INFO + 11 WARN globally with 20 generation INFO (14 foreign-key indexing findings + 6 unused-index findings). The exact branch was deleted, so no ongoing charge or accrued total is inferred; only the healthy default Production project remained, and Production was never the SQL target. No deployment, caller grant, runtime flag or activation was added.
- The OpenAPI file describes proposed `/v1` operations only and intentionally has no `servers` entry. It is not a callable tool/API surface.

## Background jobs, webhooks, email and schedules

| Capability | Current status |
|---|---|
| generation worker/queue | absent at runtime; both generation migrations are Production-unapplied and exist on no retained Preview. The later migration contains nine private RPC identities but settings/catalog/registration stay fail-closed, no API/service role has `EXECUTE`, and the source-only registry plus worker/database-adapter factories remain empty/`TEST_ONLY` |
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
