# CaresLink AI Automation

> Current-state automation inventory audited 2026-08-09; isolated database evidence updated 2026-08-21. No background worker, cron, payment webhook or notification automation exists in the audited application.

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

Source-only worker/provider policy schemas now define immutable digests, explicit timing/retry fields and content-free model usage/cost evidence. A source-only registered-worker v2 facade also proves authorize/consume, heartbeat/deadline, finish-reason, retry, fencing and response-loss ordering. A separate default-off adapter contract maps that facade to nine abstract privileged RPC calls and a one-time vault-consume port, while requiring composite success/failure acknowledgements. A CLI-generated private metadata migration now defines only dedicated roles, a forced-off settings row and RLS-forced jobs/attempts with zero callable functions and zero API/executor object or runtime grants. PostgreSQL 16+ may retain only the migration creator's automatic admin-only role edges; they have neither `SET` nor `INHERIT`. At exact HEAD `7f214429d9cdb3a2a6f16fd6b91d0bd9e67a038f`, fresh non-default `with_data=false` PostgreSQL 17 disposable `r4` clean-applied the same 13-file manifest 13/13. The durable rollback assertion and all five adjacent suites passed 6/6, including the privacy-bound Portal Referral fixture. Post-rollback zero-row, role, forced-RLS, zero-private-surface and privilege-denial checks passed with flags off; generation-scope advisors returned only three informational no-policy and seven informational unused-index findings, with zero warning/error. This proves the schema and cross-domain assertion gate, not adapter transactions, RPCs, workers, model/STT calls, Points or runtime availability. The runtime registry is empty, every factory is `TEST_ONLY`, and readiness is false. There is still no approved runtime model-policy registry, deployed worker, per-service budget threshold, validated fallback model switch, registered job cancellation control or central incident dashboard.

## Inactive shadow automation contracts

- The contract and schema draft define generation/export job states. Source-only memory contracts now model leases, recovery, retry policy, provider evidence and single-use payload grants, and the registered-worker v2 facade composes those boundaries without a payload locator. The private schema, owner/executor role topology, forced-off settings and metadata-only jobs/attempts exist in a Production-unapplied migration whose exact 13-file clean-apply, durable assertion and five adjacent cross-domain suites passed on deleted disposable `r4`. The adjacent RPC/vault adapter remains an injected source contract: no transaction-clock scheduler, function, execute grant, payload vault/table, one-time database grant, purge outbox, queue, deployed worker, live retry loop or cancellation endpoint exists.
- The memory Points reference store proves quote/reserve/commit/release semantics. The SQL draft exposes five `security definer` shadow RPCs only to `service_role`; those RPCs passed isolated branch tests for settlement, replay/conflict, source-lot release, expiry, insufficient balance and cross-owner denial. The migration remains unapplied to Production and no server route calls it.
- The legacy NDIS adapter remains pure. The server-only NDIS integration invokes it only after a successful legacy Save on an explicitly verified Preview. The RPC creates an owner-bound shadow revision and metadata-only outbox; optional read comparison records `MATCH/MISMATCH/MISSING/ERROR`. No call invokes OpenAI or settles Points.
- There is no automatic retry worker. `audit_ndis_shadow_reconciliation` is a service-role-only, read-only operator surface that reports IDs/status/timestamps/hashes. Live legacy rows remain the projection retry source; a legacy-schema canonical document whose source has disappeared while the lifecycle is still non-terminal is reported as `SOURCE_DELETE_CLEANUP_PENDING` for operator cleanup.
- Isolated database runs proved same-idempotency concurrency (`PROJECTED` + `REPLAYED`), serialized distinct revisions and retained failure evidence. A later protected App Preview proved `PROJECTED`/`MATCH`, same-key replay, provider B isolation and master kill-switch behavior with zero model calls. Projection/adapter failure now emits content-free `PROJECTION_ERROR`; no note text, participant fact, credential or secret is logged. Test data/users were cleared and temporary activation flags/deployments were removed without changing Production.
- Final pre-commit review hardened the Production-unapplied source beyond that Preview: mutation identity now includes source status/time and creation generation, replay must still point at the current revision, source locking precedes validation, comparison correlation reuse is conflict-safe, legacy Delete atomically carries its deleted generation into a strictly idempotent fail-safe canonical tombstone, PURGED remains terminal, and missed delete cleanup is operator-visible. Forward migrations `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048` passed on the retained branch, including real pre-identity backfill, orphan fail-close, PURGED repair, `SOURCE_DELETE_CLEANUP_PENDING` and same-ID/new-generation ABA fixtures, cleanup to zero and both updated rollback assertion suites. The earlier protected deployment is not evidence for the revised route bundle, so a new protected Preview remains required before promotion.
- The fourth disposable database, `r4` (`careslink-note-durable-preview-20260821-r4`, id `ecb8213c-f7fc-4dbd-96a9-db5cfb01d28b`, ref `czqdjqdjghmmzukstprt`), was non-default, `persistent=false` and `with_data=false` under parent default `adocsnwnslxhxcjgbyee`, then deleted after the six rollback suites. Both its exact ID and ref were absent afterward, while the parent default still existed. Production was not used as the SQL target, and no Production action, deployment, runtime flag or API/executor grant was added or enabled.
- The OpenAPI file describes proposed `/v1` operations only and intentionally has no `servers` entry. It is not a callable tool/API surface.

## Background jobs, webhooks, email and schedules

| Capability | Current status |
|---|---|
| generation worker/queue | absent at runtime; the schema-only migration is Production-unapplied and exists on no retained Preview, contains no RPC, and the source-only registry is empty with worker/database-adapter factories restricted to `TEST_ONLY` |
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
