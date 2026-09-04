# CaresLink AI Automation

> Current-state automation inventory audited 2026-08-09; source-only
> security-contract and isolated local database evidence updated through
> 2026-09-03. No background worker, cron, payment webhook or
> notification automation exists in the audited application.

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
- Communication Note M1z is also not automation. It conditionally installs the
  formal Cookie principal behind the complete exact Preview binding, but its
  UI/API compile-time latches remain `false` and the formal submitter and
  maintenance exports remain `undefined`. Its stager and maintenance factories
  require explicit injected ports and no scheduler imports them.

## Current approvals and human review

- Privacy findings and confirmations are user-reviewed before generation.
- AI output is always a user-reviewable draft, not an approved/compliant/verified record.
- Copy/save do not represent professional, clinical, legal, compliance or quality approval.
- Admin surfaces do not provide an approval workflow or full-content review.

## Current kill switches

| Control | Current effect | Limitation |
|---|---|---|
| Communication Note UI/API/principal gates | the formal Cookie principal can be constructed only when all exact Product/API/principal, Vercel Preview/project, non-Production Supabase ref, canonical URL and publishable-key checks agree | UI and API compile-time readiness remain `false`; the formal submitter, stager and maintenance are absent, so environment values cannot enable submission, storage, cleanup or model work |
| Remove/disable `OPENAI_API_KEY` | generation fails closed | coarse; no per-service incident mode |
| Google OAuth feature flag | hides/disables Google path honestly | not a session/device kill switch |
| account/IP quota | limits NDIS model volume | not a budget-aware cost circuit breaker |
| legacy access codes | gates legacy guided materials | not applicable to V1 Notes/Points |
| Vercel rollback | restores prior application deployment | database changes require separate additive rollback plan |
| V1 shadow master + dual-write flags | both exact `true`, Preview environment and exact non-Production Supabase branch ref are required | disabling either immediately prevents new shadow calls after redeploy; legacy save remains available |
| V1 shadow-read flag | enables only metadata hash/status comparison after successful projection | cannot enable write or replace the legacy response |
| Portal API + durable-adapter + independent operation gate | base gates exact `true`, `VERCEL_ENV=preview`, an exact non-Production Supabase ref, the selected intake/detail/assignment/provider-response/follow-up application gate, the master database row and its matching operation row are required | any failed gate stops before a client or private body read where applicable; the five operation slices do not enable one another, including through direct Data API calls. Exact-current Assignment retains its deleted-Preview Hosted Cookie evidence. Provider Response implementation source `f45b19c596edd0bdbe01eba17e6e5fa136df5225` adds active-offer-first selection, request timeouts, principal-boundary command clearing and 6/6 local true-concurrency scenarios. Exact gate source HEAD `44f3bd68699dc953e2666bf033dac2b5e26a4d30` passed the fresh no-data Hosted re-gate on deleted ref `nhupgyxczlvtddycrgyw`: 33/33 migrations, 14/14 rollback suites, real GoTrue SSR-cookie/Data API assertions 14/14 and exact-current active-first/non-null-cursor checks 2/2. Teardown left every Auth/Portal fixture domain at zero, all five then-current flags disabled, three deletion probes passed and Production remained healthy at 19 migrations. M1b remains default-off and Production-unapplied. Follow-up M1c adds a sixth default-off flag plus accepted-provider private detail and fixed-code mutation; its no-TCP, private-Unix-socket PostgreSQL 16.15 local lifecycle passed all 8/8 replay/competition/revocation/ownership races twice with exact cleanup and a SHA-pinned live harness. It still has no Hosted Auth/Data API evidence. No runtime is retained or deployed, and no merge, activation, history/audit/export automation or Vercel/Production deployment was added |

Source-only worker/provider policy schemas now define immutable digests, explicit timing/retry fields and content-free model usage/cost evidence. A source-only registered-worker v2 facade proves authorize/consume, heartbeat/deadline, finish-reason, retry, fencing and response-loss ordering. The default-off adapter maps that facade to nine privileged RPC calls and a one-time vault-consume port. The earlier CLI-generated metadata foundation passed its historical deleted-`r4` PostgreSQL 17 schema/cross-domain gate. At source HEAD `c7b70e9f84b9b804779039711b85cc7eda55bd57`, the subsequent `20260821071044_add_v1_note_generation_worker_rpc_shadow.sql` passed the exact deleted-`r9` PostgreSQL 17.6 migration/assertion gate: 14/14 migrations and seven rollback suites. Its executor-only RLS policies, object ACLs, nine executor-owned `SECURITY DEFINER` functions with `search_path=''`, hard-off settings and empty catalogs/registrations passed an independent postcheck. Deleted no-data `r20` later passed the three true two-session PostgreSQL 17.6 claim/session/privacy races through verified Session Pooler TLS, then removed the temporary runner, support surface and branch. Deleted no-data `r21` then passed the fixed Attempt-2 historical replay and post-purge lifecycle gate without duplicate canonical/evidence/outbox side effects. This is isolated schema/transaction evidence, not runtime automation: no API role or `service_role` has RPC `EXECUTE`, the runtime registry is empty, every factory is `TEST_ONLY`, and readiness is false. M1z now provides source-only encrypted staging and maintenance contracts, but there is still no approved runtime model-policy registry, deployed worker, live KMS/private-store/retention adapter, per-service budget threshold, validated fallback model switch, served job-cancellation control or central incident dashboard.

Communication provider-evaluation M1d introduced the server-only OpenAI
Responses request/parser contract, and M1e froze the exact model, AU-storage
endpoint profile, data posture and six-call/US$0.25 plan. M1f now literal-pins
the complete system prompt, strict schema and static request fields plus the
ordered three-fixture/two-run manifest. Its source-only one-shot runner
preflights all six input counts before dispatch, reserves the full uncached
2,400-output-token bound, runs serially with a dedicated one-attempt/no-retry
worker policy, reconciles provider usage through BigInt micro-USD accounting,
requires all checks plus 18 language-review results and emits a content-free
digest-bound report. Same-ID concurrent/replay calls reuse the same terminal
promise and a different ID is rejected after claim.

M1g-a adds source-reviewed exact JSON request-body pins without adding a paid
transport. Wire version
`wire.communication.openai.responses.2026-08-27.m1g-a.v1` and body-pin version
`pin.communication.openai.synthetic-request-body.2026-08-27.m1g-a.v1` bind six
ordered slots comprising three distinct `JSON.stringify` UTF-8 bodies. Raw
body SHA-256, UTF-8 byte length and semantic canonical digest are checked before
preflight and again by the branded provider. The provider passes that same
validated string without reserialization to the injected non-HTTPS mock. The
report validator compares the literal pins directly rather than rebuilding a
request. Bundle digest
`90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8`
is bound by runner version
`runner.communication.openai.synthetic-preview.2026-08-27.m1g-a.v2` and runner
digest
`a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4`.

This remains mock contract automation only. Paid readiness is false, the
approved runner policy is undefined and the paid factory always fails closed.
The executable factory accepts a branded provider plus token, reviewer, clock
and transport callbacks that are explicitly trusted test code, not a network or
credential security boundary. No runtime module imports the runner and there
was no provider traffic. The M1g-a pin covers the JSON request body and intended
application envelope, not full HTTP/TLS transport bytes. It is explicitly
`UNATTESTED_SOURCE_PIN_ONLY` and `NOT_EXECUTION_AUTHORITY`; external owner
approval and dispatch attestation remain absent. A durable atomic single-use
approval claim bound to the body-pin bundle and runner-policy digests, an
authenticated receipt proving the dispatched body matched, a temporary project
key and provider spend ceiling, attributable real reviewers, Australia
project-region/ZDR/Modified-Retention evidence, processing acknowledgement and
fresh pricing confirmation remain required before any separately authorized
paid synthetic run. Payload-vault retention, worker registration, route,
Points and Production authorization remain later blockers. See
`documentation/communication-note-preview-evaluation-runner-m1f.md` and
`documentation/communication-note-preview-request-body-pins-m1g-a.md`.

M1g-b now defines the next source-only authorization and observation boundary.
Its policy digest is
`7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9`.
An external owner authorization must be Ed25519-verified against an external
trust-registry snapshot whose purpose/domain/owner/tenant scope is enforced,
then bind the caller-expected run, exact source pins, six ordered slots,
synthetic-only input class, owner/tenant/run hashes, environment-evidence
hashes, bounded lifetime and cost limits. PostgreSQL does not independently
verify that signature; private forced-RLS ledgers persist only statements
already verified by the application boundary.

The durable sequence is one atomic authorization claim, then one reservation
for each next slot before external transport begins. The claim token is not
reissued after response loss, and reservation replay never reissues dispatch
authority. Calls remain serial with one attempt
per slot and no automatic retry; once transport starts, an unknown outcome is
recorded as `TRANSPORT_AMBIGUOUS` and permanently consumes the slot, while
preserving any partial status/correlation metadata without usage or cost.
Revocation may be appended after claim and blocks later reservations. Database
RPCs fail closed unless transaction isolation is `READ COMMITTED`, so every
post-lock revocation/time recheck uses a fresh command snapshot. Database locks
are held only for the short claim/reservation/receipt transactions, never
across external network work.

The receipt is a CaresLink-signed, content-free internal observation, not an
OpenAI attestation. It keeps the client request identifier, OpenAI
`x-request-id` and Responses `response.id` as pairwise-distinct HMACs, checks
the full durable reservation binding and exactly recomputes fixed-price cost,
then declares
`providerAttestation=ABSENT`. It is explicitly not proof of an exact provider
receipt, billing, model execution or exactly-once delivery. Both M1g-b
readiness latches are fixed `false`; approved owner/receipt keys and caller
grants are absent. There is no key, HTTPS transport, real call, spend, human
review workflow, hosted database mutation, route, worker, deployment or
Production activation. See
`documentation/communication-note-preview-owner-authorization-m1g-b.md`.

M1g-c adds the next source-only custody and database-caller boundary. Its
version is
`custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1` and its
policy digest is
`1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438`.
Three explicitly injected, purpose-separated descriptors represent an external
owner-verification snapshot, a non-exportable CaresLink receipt-signer custody-
reference digest and a temporary OpenAI project service-account credential-
reference digest. They contain only bounded metadata, hashes/HMACs and public
fingerprints; raw bearer credentials and private signing keys are rejected. The
contract reads no environment variable, creates no key or service account,
performs no signing and does not resolve a managed-secret reference. Supplied
registry hashes remain candidate metadata rather than authenticated registry,
freshness or revocation evidence.

The source migration
`20260828034704_add_communication_note_preview_custody_callers_shadow.sql`
adds four dormant `NOLOGIN` roles. Authorization registration and revocation
each have their own one-RPC shell, dispatch has one shell for the claim plus
reservation pair, and receipt persistence has one one-RPC shell. Each shell
gets only exact function `EXECUTE` plus private-schema `USAGE`; it gets no table
access, executor-role membership, API/service-role privilege or login. The
roles therefore describe least-privilege bundles but cannot run automation
until a separately reviewed login-capable identity and membership are
provisioned. PostgreSQL 16 may retain only a non-usable creator ADMIN bootstrap
edge with `INHERIT=false` and `SET=false`; this does not permit execution or
`SET ROLE`. A caller-supplied identity HMAC is a statement binding only, not
database authentication.

Both M1g-c readiness latches remain `false`, its approved custody snapshot is
`undefined`, and no route, worker, queue, cron or product runtime imports the
source boundary. There is no real owner/receipt key,
OpenAI credential, provider call, spend, hosted Supabase mutation, Vercel
configuration, deployment or Production change. Final source/local gate
evidence is frozen in `documentation/tests.md`: 4/33 focused and 160/2,179
full tests, TypeScript, lint, a 64/64-page Webpack production build and the
PostgreSQL 16.15 dual-role-topology rollback gate passed. See
`documentation/communication-note-preview-key-custody-callers-m1g-c.md`.

M1g-d adds only a server-only, pure `TEST_ONLY` activation-preflight validator.
Its policy digest is
`791a4d893afd4e490ab0164a8f604589bcf8015d25e5723b4df210f8c0b44f67`.
It cross-binds the M1g-b authorization, M1g-c custody snapshot, six pairwise-
distinct provider evidence hashes, the exact 37-migration manifest and six
artifact pins, four ordered caller-identity candidates, non-exportable receipt-key
lifecycle/teardown evidence and the attributable 18-review plan. Evidence may
be at most five minutes old; receipt, provider, database and review sections
must share the exact candidate/registry observation and cannot predate the
authorization or provider credential. A candidate may remain live for at most
15 minutes without outliving the owner authorization. The database descriptor
also requires one purpose/version/common-key-reference claim for distinct
Preview and Production project-ref HMACs, and complete unprivileged caller-role
and direct-ACL assertions. Those values remain injected candidate consistency,
not independent control-plane or PostgreSQL-catalog attestation. Even a valid
candidate returns `activationReady=false` with five fixed blockers. The
existing eight readiness constants stay `false`, the existing six approved
values stay `undefined`, and the live factory always throws.

The provider credential has no asserted provider-enforced TTL:
`operationalExpiresAt` and `teardownBy` are CaresLink operational controls only.
The US$0.25 provider hard limit must report monthly interval and enforcing
status; it is defence in depth, not the per-run cap
and not a substitute for the six-slot/no-retry 250,000-micro-USD application
ceiling. M1g-d adds no migration, environment lookup, fetch/SDK, resolver,
database/Hosted action, route, deployment, paid call or Production capability.
See
`documentation/communication-note-preview-activation-preflight-m1g-d.md`.

M1g-e adds a source-only reserve-before-dispatch **transcript validator**, not
an automation runtime. Version
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-e.v2` and
policy digest
`4649f620bc60425d5ca40d308d167110befd4a29c772e9877ddbeac5eaaa3531`
pin the future order: registered authorization candidate, exact six-slot runner
preflight, then a fresh claim with at least five minutes of authorization life
remaining. Each serial slot requires a claim/authorization/run-bound fresh
reservation before optional transport, followed by a verified CaresLink-signed
receipt and receipt-persistence candidate. A `COMPLETED` result may advance only
after an explicit runner acceptance binds authorization/run/claim/reservation,
receipt digest/signature, exact fixture/body/preflight/usage/cost, seven true
critical checks and passed `en`/`zh-Hans`/`zh-Hant` reviews. Provider HTTP
errors, ambiguous transport and local pre-dispatch aborts are terminal and
cannot retry. An exact receipt-persistence replay proves only the same candidate
record; it never re-authorizes transport.

A provider-completed slot whose runner evidence, golden evaluation, human
review or final report fails is represented by a mutually exclusive,
parent/receipt-bound `RUNNER_SLOT_FAILED_TEST_CANDIDATE`; it is terminal and
cannot retry or continue. M1g-f now defines the source-only durable terminal
ledger and requires `COMPLETED + ACCEPTED` before a later reservation, but its
executor has no runtime caller. The transcript state is still injected only, so
`DURABLE_RUNNER_TERMINAL_STATE_ABSENT` remains a fixed runtime-evidence blocker.

For `COMPLETED` and `PROVIDER_HTTP_ERROR`, receipt observation must remain within
the policy's 30-second application-transcript candidate interval after transport
entry. Delayed `TRANSPORT_AMBIGUOUS` remains allowed but terminal. Cross-role
reuse is rejected across static evidence and client, transport, runner-provider,
runner-candidate, receipt and fixture values. The runner provider-request hash
and receipt correlation HMACs deliberately remain
`UNATTESTED_NO_SHARED_IDENTIFIER`; neither attests the other.

The validator reruns M1g-d and M1g-c validation and cryptographically verifies
the injected Ed25519 receipt envelope, but all database event states remain
explicitly unattested test claims. M1g-f makes
`reserve_communication_note_preview_dispatch` return the database `reserved_at`
value, but M1g-e has no runtime database port and never observes that result.
The injected `databaseReservedAtCandidate` therefore cannot close the durable
reservation binding, and `DATABASE_ATTESTED_RESERVED_AT_ABSENT` remains fixed.
The same transcript cannot supply the absent durable runner terminal state;
`DURABLE_RUNNER_TERMINAL_STATE_ABSENT` also remains fixed.
M1g-e executes no callback, RPC, transport or signer; reads no environment;
adds no migration or runtime importer; and leaves coordinator, activation,
dispatch, pre-run approval and post-run acceptance closed. See
`documentation/communication-note-preview-reserve-before-dispatch-coordinator-m1g-e.md`.

M1g-f adds only a CLI-generated private-schema migration, rollback assertion
and source policy. It creates no scheduled worker, queue, cron, Edge Function,
login identity or automatic retry. Without a fifth purpose-scoped caller and
reviewed runtime adapter, its terminal RPC cannot be reached by product code.
See `documentation/communication-note-preview-durable-runner-terminal-m1g-f.md`.

The historical M1g-g source-only checkpoint was the separately reviewed
successor that filled those two contract shapes without activating automation.
It chose an independent
Ed25519 terminal trust root with purpose `CARESLINK_RUNNER_TERMINAL`, adds the
fifth `NOLOGIN` caller shell and replaces the unsigned two-argument terminal
RPC with the exact signed three-argument form
`persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)`.
The caller gets only private-schema `USAGE` plus exact RPC `EXECUTE`; it has no
login-capable member or executor-role membership. The caller identity HMAC is
only a scope/correlation binding and never substitutes for the independently
verified signature.

The new signed-terminal runtime port verifies the envelope before persistence,
and the PostgreSQL port can invoke only the exact parameterized function
through an injected query capability. Both are test-only source ports: they do
not construct a database connection, inspect environment variables, resolve a
credential or signing key, schedule work, call a provider or expose a product
runtime importer. Readiness remains `false` and approved ports/signing material
remain absent. Its test-only signing-key snapshot is not cross-bound to a live
M1g-c custody/trust-registry resolver, and its verifier HMAC is not cross-bound
to a fifth-caller credential/identity resolver; these remain activation
blockers rather than end-to-end automation evidence. At that historical
checkpoint, the local PostgreSQL 16.15 gate clean-applied 38/38 migrations; the
then-current migration and rollback-assertion SHA-256 values were
`b095785331c848d02cabc417eb3131fe2f9328564abef6fc0dd35bccd2980c5a`
and
`f8e8307718e3bdf0835b93cdac075279ae4f5ba3dbab287af46e1280ce587ad5`.
The then-revised preflight/coordinator bindings remained non-authoritative and
used digests
`491481513a67198cba91babc3c172fc1f326f9ee7bdd883b3d1208c639bdaf73`
and
`f6609c2f357b5fda92ae5aa1b459dfb1e32b7893c3e8436e0e94a8ffa2bbe675`.
No Hosted Supabase action, real provider/model call, deployment or Production
change occurred. See
`documentation/communication-note-preview-signed-runner-terminal-port-m1g-g.md`.

The historical M1g-h checkpoint composed those source ports with a
content-free, branded test registry and a disposable-Preview identity harness.
It was test orchestration, not a worker, queue, cron, retry loop or product
automation. Registry and composition statuses remain
`TEST_ONLY_VALIDATED_NOT_APPROVED` and
`TEST_ONLY_COMPOSED_NOT_APPROVED`; live readiness stays `false` and all
approved values stay absent.

The local PostgreSQL 16.15 harness proved a source-valid signed
`FAILED`/`CANCELLED` terminal, fresh insert, write-free exact replay, altered
valid-signature conflict and final six-ledger counts `1/0/1/1/1/1`. The
corresponding M1g-h Hosted run did not reach that terminal path: its preceding
18-file rollback bundle returned `SCHEMA_ROLLBACK_ASSERTION_FAILED`, so the
one-time LOGIN, no-write identity probe and signed runtime-to-PostgreSQL gate
were skipped. The no-data Preview was deleted and Production remained healthy.
`ACCEPTED` is still blocked by the source nine-key versus stored receipt
six-key usage mismatch. No provider transport, model call, paid model spend,
deployment, retained identity or automatic action occurred. See
`documentation/communication-note-preview-hosted-runner-terminal-identity-m1g-h.md`.

Current M1g-i closes that contract mismatch without activating automation. The
signed terminal continues to carry nine exact usage keys; migration 39 removes
only the three reconciliation labels for exact comparison with the receipt
ledger's six facts and has SHA-256
`3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e`.
Migrations 37 and 38 now keep their grants, locks and cleanup inside explicit
repository transactions; their current SHA-256 values are
`09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432`
and
`4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f`.
The ordered migration entries SHA-256 is
`a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2`.
Transactional policy `2026-08-29.preview-transactional-migrations.6` binds
manifest
`60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`
and removes only the 19 known explicit wrappers in memory before running the
full chain in its own transaction.

Identity policy `2026-08-29.preview-runner-terminal-identity.2` now requires a
canonical in-memory `metadata` plus projected `credentials` envelope before the
destructive reset runner can read the CA or connect. The target ref, credential
ref, direct host and pooler user must cross-bind; metadata must have exact
`with_data=false`, `is_default=false`, `persistent=false` and
`status=ACTIVE_HEALTHY` values plus the source-pinned Production
`parent_project_ref`. Rotated/default Production, another parent, data-bearing
or persistent targets fail closed. Preflight/coordinator versions are now
`preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5` and
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5`, with
digests
`0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1`
and
`1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2`.

The current focused source gate passed 5 files / 79 tests plus targeted lint,
Node syntax and diff checks. The complete current source gate then passed 172
files / 2,321 tests, TypeScript, zero-warning ESLint, the 73-file adapter sync
check and the 64/64-page Webpack build. A fresh isolated PostgreSQL 16.15 gate
passed 39/39; migrations 37 and 38 were deliberately sent statement by
statement without an ad hoc outer wrapper and succeeded through their repository
transactions, A03 passed, and the final postcheck found zero terminal rows
and zero residual `SET` membership edges. The earlier 172 files / 2,315 tests
and deleted r20 Hosted result remain attributed only to artifact set `4e84823`.
Exact-current execution source `02949d1a666fa8aa0496d3e995f1dd88c52a29a0`
then passed a fresh no-data PostgreSQL 17 gate on deleted Preview
`careslink-note-terminal-m1g-i-v5-r2-20260830` (id
`0e63cac9-d1dc-4096-9f65-c36de91c85fa`; ref `yrsgxbxislyenblphfdl`): pinned
19-row baseline, transactional 39/39 policy `.6`, A01–A18, identity `.2`,
signed `ACCEPTED`/replay/`IDEMPOTENCY_CONFLICT`, independent 39-row plus
`[1,0,1,1,1,1]` and zero-role/session postcheck, and final security/performance
Advisors with 0 ERROR. The branch was deleted and three listings showed only
default Production `ACTIVE_HEALTHY`. This closes exact-current Hosted evidence
through the pinned repository runner; native Supabase CLI migration apply
remains an unproved transport. Activation, dispatch and live resolver readiness
remain false/absent; no worker, retry, provider transport, deployment or
Production action is enabled.
See
`documentation/communication-note-preview-terminal-accepted-usage-m1g-i.md`.

M1j adds a source-only/TestOnly resolved-custody and fifth-caller binding; it
does not schedule or activate automation. Its public factory is
unconditionally disabled, readiness is `false`, and the approved target,
custody resolver, caller-credential resolver and runtime port remain
`undefined`. The TestOnly path requires module-branded dependencies and a
WeakMap-backed, one-physical-session, single-use PostgreSQL 17 lease. It
cross-binds the owner authorization, custody/trust snapshot, disposable target
and fifth caller; applies `READ COMMITTED`, four separate transaction-local
timeouts and `SET LOCAL ROLE`; compares one backend PID and transaction ID;
checks exact caller and SECURITY DEFINER executor role/membership posture,
schema, relation/column/sequence and terminal-RPC metadata/ACL posture; and
performs only one persistence attempt. Lease reference, session binding,
runtime role and module-local query identity are atomically single-consumed.

The monotonic clock is checked initially, after each resolver, before entering
the database, before the RPC, before commit and when validating the release
report. Authorization expiry caps the trust resolution, which together with
the target caps the lease. Custody/acquire settle within 5 seconds, each
main-transaction database operation within 12 seconds, and rollback/reset/
revoke within an independent 5 seconds; every call gets a fresh AbortSignal. BEGIN or COMMIT
response ambiguity triggers one rollback attempt and never an automatic RPC
retry. Credential acquire response loss still produces an idempotent cleanup
request keyed by the acquisition digest. A digest-bound TestOnly release report
must be returned before success. With no returned binding it may report either
the paired destroyed/revoked result or the paired not-acquired/not-issued
result; every accepted report must also claim that the acquisition digest is
tombstoned and future issuance is blocked. Those fields remain TestOnly
resolver self-report, not independent control-plane proof that a durable fence
won against late issuance, a live role was dropped or all sessions were
terminated. The JS watchdog proves bounded caller settlement only; a live
adapter must bind abort to driver cancellation/session destruction and use
durable cross-process replay protection plus acquisition-digest fencing.

M1j adds no worker, queue, cron, Edge Function, environment lookup, network/
SDK adapter, migration, product importer, provider/model call, Hosted action,
deployment or Production change. Approved control-plane target evidence, live
custody and credential/session adapters with a durable late-issuance tombstone,
and an independent post-release zero-role/session check remain automation
activation blockers. See
`documentation/communication-note-preview-live-custody-caller-resolver-m1j.md`.

M1k supplies a TestOnly/local implementation of the fifth caller's durable
acquisition and release boundary; it still does not schedule or activate any
automation. An isolated PostgreSQL broker serializes each acquisition digest,
creates at most one short-lived runtime LOGIN, binds one physical backend and
atomically commits an irreversible tombstone plus OID/name-bound `NOLOGIN`
before session destruction, role revocation and independent zero-residue
inspection. Resolver release remains in the fixed order tombstone → local
destroy → finalize → independent inspect → M1j receipt.
Acquire-response loss and concurrent cleanup use the durable digest rather than
an in-process lease object.

The disposable private-socket PostgreSQL 16.15 harness passed six scenarios;
postcheck observed three terminal metadata tombstones and zero runtime roles,
sessions and memberships before its server and temporary directory were
removed. The real matrix included a proven advisory-lock waiter for concurrent
tombstone/acquire and rejected both a wrong-application bind and an old-password
reconnect after the committed login fence.
The broker SQL is a verification artifact under `scripts/preview-e2e`, not a
Supabase migration or service. Readiness remains `false`, the approved resolver
is `undefined`, and no worker, queue, cron, Edge Function, environment/SDK/
network adapter, product importer, Hosted Preview, provider/model call,
deployment or Production action was added. A live step must separately migrate
and repin the broker on PostgreSQL 17, guard the terminal RPC with the same
ACTIVE fence, and complete the remaining four caller purposes. See
`documentation/communication-note-preview-durable-caller-credential-resolver-m1k.md`.

M1l supplies binding
`binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1` with digest
`cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115`
and durable resolver `resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2`
with digest `e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e`.
It supplies the formal additive migration source that M1k intentionally left
isolated, but it still schedules and activates nothing. At the M1l checkpoint,
the source tree had 40 migrations; the 40th creates the private, forced-RLS,
hash-only durable broker and preserves the existing three-argument terminal RPC
behind a shared transaction fence. Runtime bind changes the 45–90-second SCRAM role to
`NOLOGIN`; terminal writes then re-attest the ACTIVE acquisition, role/OID,
PID/backend start, fixed application, authorization/run/HMAC and expiry while
holding that shared fence. Tombstone and finalize take the matching exclusive
fence. Resolver Abort now requires a connection-bound cancel and both cancel
and query settlement within 250 ms, otherwise that driver is permanently
quarantined.

The current inherited-role binding supersedes M1j's `SET LOCAL ROLE` runtime
model. The runtime role is `INHERIT=true`; its outbound terminal-caller edge is
`ADMIN=false`/`INHERIT=true`/`SET=false`. A separate PostgreSQL 16/17
`CREATEROLE` creator edge is inbound and inert: `member=postgres`, superuser
grantor, `ADMIN=true`/`INHERIT=false`/`SET=false`. The client transaction sends
no `SET ROLE`: outside the wrapper both `current_user` and `session_user` are
the runtime; inside the `SECURITY DEFINER` wrapper `current_user` is the
executor and `session_user` remains the runtime. SQL `SET ROLE` and
`set_config('role',...)` are forbidden.

Migration-time and acquire/bind/wrapper checks use cluster-wide `pg_shdepend`
to require zero static-caller ownership and exact ACL dependencies only for the
current database generation schema and terminal wrapper. They also reject any
generation-column privilege via `has_any_column_privilege` and re-attest that
both wrapper and inner have the exact executor owner, `SECURITY DEFINER`, empty
`search_path` and exact ACL. The runtime inherits only the exact terminal wrapper and has no generation
table, sequence, column or other-function privilege.

The formal migration remains Production-unapplied and default-off. The current
private-socket PostgreSQL 16.15 harness passed six scenarios with four issued-
and-revoked acquisitions and zero runtime role/session/membership/API-privilege
residue. Its second-database runtime-owned large-object case observed the first
finalize fail with SQLSTATE `2BP01`, routine `DropRole`, while preserving
TOMBSTONED/`NOLOGIN`/membership/remote residue. After the unique owner dependency
was removed, finalize and inspect succeeded with zero residue. The SQL order is
independently designed to fail closed—durable tombstone and
`NOLOGIN` precede `DROP ROLE`, and `REVOKED` follows only successful deletion—
and the same-revision Hosted/PG17 cross-database proof is now closed. Deleted
no-data/non-default/non-persistent Preview r5 (branch ID
`5f088eac-ac66-4625-8f4c-c9e7d9b02c2a`, ref `ucdmoxqzruohiqmsokfv`) passed the
40/40 single-transaction pipeline, A01–A18, pinned-CA child and independent
postcheck. It proved direct-login inherited caller execution without `SET ROLE`,
bind-time `NOLOGIN`, terminal `ACCEPTED`, exact replay/conflict behavior, the
large-object `2BP01`/`DropRole` rollback fence and controlled cleanup, and zero
runtime role/session/membership/API/verifier/temporary-database residue. Three
final branch lists left only healthy default Production; Production was never
the SQL target. Broker-scoped Security and Performance Advisor findings were
zero, while global findings and pre-existing generation lint errors remain and
must not be described as a globally clean Advisor/lint result.
The atomic pin set is now frozen and passed 53/53 focused checks: migration
`64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa`;
transactional `2026-08-30.preview-transactional-migrations.7` with 40 entries,
20 wrappers and manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`;
ordered basenames/entries `f9905d27a907045dfd6e7677e54c50af84be06a194535682bcf9dc4859657d4f` /
`7006c0ef8cb62d9596fdd236ffd3357d16338370e9d1437f54a58eb668b4b250`;
A03 `0f8192bccf46101103c301fcfd2b00cb818dd6725425a952777f697db8ea8172`;
rollback `2026-08-30.preview-schema-rollback-assertions.5` manifest
`e0b5f30f9a4c33bf04020a4d11453c87a52321b69c6edd74982446b0fadd58fe`;
preflight/coordinator
`4447c071fa37ab21f23624a4d3d4d28b2ee9ba2e1ef4c9be969bf9a0481de2f3` /
`570544bf700997a0ba90e06422019c237a01835ba8b75ff70bed5348cdf4bf02`.
These are source-integrity pins plus deleted-Preview evidence only; readiness is `false`,
approved adapters remain
absent, and no worker, queue, cron, Edge Function, provider/model call or
product route was enabled. See
`documentation/communication-note-preview-runtime-credential-broker-m1l.md`.

### Approved runtime adapters M1m — source only

M1m supplies the previously absent adapter composition as server-only,
default-off source: authenticated disposable-Preview target and pinned-CA
resolution; one-use callback delivery of a short-lived management credential;
fresh exclusive management sessions for broker operations; fresh exclusive
runtime PostgreSQL sessions with connection-bound hard-close cancellation; and
same-sealed-target composition into the durable resolver/runtime port. The
management and runtime clients are always separate, no session is pooled or
retried, and cancellation makes the exact client non-reusable.

This does not schedule or activate a worker. Approved exports remain
`undefined`, readiness remains `false`, and the concrete database client and
credential transport are TestOnly injections. There is no product importer,
environment lookup, DSN, direct `pg`/Supabase/OpenAI SDK import, log sink,
provider/model traffic, Hosted Preview execution, deployment, Production
migration or Production data action. Exact importer quarantine and synthetic
adapter tests are present. Final local closeout passed M1m focused 99/99,
runtime-boundary 12/12, the full 184-file / 2,518-test suite, TypeScript, full
ESLint, whitespace checks and the 64/64-page Next.js Webpack production build.
This remains source evidence only and schedules no automation.

### Approved runtime adapters M1n — default-off Hosted harness source

M1n adds the missing source-pinned harness that can, after a separate paid
Preview authorization, drive the high-level M1m
`bundle.runtimePort.persist(...)` path with a real injected `pg.Client`.
The outer runner reuses the audited disposable-branch policy and a shared
anonymous child channel. FD3 carries bounded public config, FD4 the pinned CA,
FD5 a bound binary static-password delivery and FD6 one fixed status. No
credential is placed in environment variables, argv, logs or JSON evidence.
Its canonical 66-path source manifest covers the runner/channel, current static
import closure, package/pnpm lock/tsconfig, setup SQL and all 40 migrations.
The caller-provided reviewed SHA-256 must match before stdin is read or any
database Client is constructed; the child independently recomputes it. The
manifest is deliberately not described as complete Node/Vitest/node_modules
transitive-integrity evidence.

The management credential contract now truthfully distinguishes the static
Supabase branch admin password from its one-read delivery envelope. The source
password has no asserted expiry, is not single-use, and is revoked only by a
branch password reset or branch deletion; only the delivery is bounded to
30-second age and 60-second lifetime. No KMS/Vault, rotation, short-lived
underlying credential, full process-memory zeroization or server-side SSL
enforcement claim is made.
The terminal broker audit row intentionally retains one SHA-256 verifier hash
after an issued credential is revoked; that hash is not password/SCRAM material.
Never-issued rows must retain a null verifier hash.

The harness and all formal runtime surfaces remain `READY=false`, with approved
exports absent and no product importer. This batch did not create a Preview,
connect Hosted PostgreSQL, deploy, migrate Production, call a model/provider or
schedule work. The future live runner is intentionally not an automation: its
caller must separately create/apply/verify an exact no-data PG17 Preview and,
after success or failure, delete that exact branch and confirm its absence.
Abort/timeout negative paths are not live-tested by this harness batch. See
`documentation/communication-note-preview-approved-runtime-hosted-harness-m1n.md`.
The local/default-off closeout passed 10 focused files / 151 tests, the complete
187-file / 2,547-test suite, TypeScript, full ESLint, Node syntax, whitespace,
the 73-file adapter sync and the 64/64-page Webpack production build; final
independent review reported P0=0 and P1=0. None of those checks scheduled work
or contacted Hosted PostgreSQL.

### Approved runtime adapters M1o — post-review hardening source

M1o provides candidate fixes for the three findings recorded during PR #16
review without activating the Hosted gate. The fixes still require
same-revision final review and are not yet recorded as closed. Each management
open now generates a cryptographic
256-bit delivery nonce; the injected transport must echo it exactly, and the
factory atomically reserves only its SHA-256 plus monotonic expiry in a bounded
256-entry registry. Expired entries are pruned before reserve, while duplicate
or full-registry delivery fails before another Client is constructed. The
underlying Supabase branch-admin password remains static and reusable at its
source; this protection applies only to one delivery envelope inside one
factory process.

The outer runner now bounds admin `Client.end()` to two seconds and attempts to
destroy the exact verified TLS stream on rejection or timeout. Direct network
fallback can continue only after graceful close or a destroy call that returns
without throwing and synchronously leaves `stream.destroyed === true`; a
missing, throwing or silent no-op destroy fails closed before a Session Pooler
Client is constructed. Final close failure maps to the fixed cleanup failure
and still requires caller-owned exact branch deletion.
The shared child channel also converts any synchronous input `.end(payload)`
throw into one fixed pipe failure, immediately clears payload/timers, requests
SIGKILL through the owned ChildProcess handle and invokes destroy on every
channel. It waits for child close or an independent one-second cleanup deadline;
the deadline retries handle-owned hard kill and channel destruction, unrefs the
child and removes data, exit and stateful listeners before returning the fixed
failure. Content-free terminal error sinks remain until actual child close so a
late emitter error cannot escape the fixed boundary; no raw PID signal is used.

Readiness remains false, approved exports remain absent, and no Preview,
Hosted database, deployment, Production mutation, provider/model call or
automation ran. The final M1o candidate source revision is
`7a0f19f782670acf663fd087a3e460df92048e2d2406b05efe20d900a182e011`.
It passed 10 focused files / 169 tests and the complete 187-file / 2,565-test
suite. TypeScript, full ESLint, three Node syntax checks, whitespace, the
73-file adapter sync and the 64/64-page Webpack build also passed; independent
same-revision source review remains the final handoff gate.

### Approved runtime adapters M1p — first Hosted attempt and driver fix candidate

On 2026-08-31 a separately authorized, no-data, non-default, non-persistent
Supabase Preview ran the first full-gate attempt at the confirmed Micro price of
`US$0.01344/hour`. Control-plane identity, pinned-CA TLS, PostgreSQL 17 and the
exact 40/40 single-transaction migration gate passed. The full child then
returned fixed status
`M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_DRIVER_INVALID` before synthetic
setup, runtime-role creation, broker lifecycle or product work. Consequently,
there is no Hosted persist/PID/cleanup pass and no runtime automation was
activated.

The failure was a Vitest 4.1.9/Vite 8 loader false negative: the absolute
dynamic import of the pinned `pg@8.23.0` CommonJS entry produced a Proxy module
namespace even though its `default.Client` was a valid non-Proxy constructor.
The local candidate now uses Node `createRequire` for that already validated
absolute package entry and retains the exact version, path, constructor,
prototype and method checks. Its new source revision is
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`.
It passed 5/5 live-file tests, 97/97 focused tests, the full 187-file / 2,566-test
suite, TypeScript, full ESLint, the 73-file adapter sync and the 64/64-page
Webpack build.

The exact failed Preview was deleted immediately and three sequential branch
listings showed only the healthy default Production branch, revoking the
Preview's static admin credential. No Production connection or mutation, real
data, deployment or provider/model call occurred. The candidate remains
default-off and requires same-revision review plus a new paid-Preview approval
before another full Hosted run.

### Approved runtime adapters M1p — corrected Hosted positive-path pass

After PR #18 merged, the reviewed source revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`
ran on a second separately authorized no-data, non-default, non-persistent PG17
Preview at the confirmed `US$0.01344/hour` Micro price. The exact 40/40
single-transaction migration gate passed first. A fresh anonymous credential
delivery then drove the complete Hosted runner successfully over a Direct 5432
connection with actual `pg@8.23.0` and client-pinned CA verify-full TLS.

The fixed evidence records real M1m composition, an `ACCEPTED` terminal, the
factory-scope cross-open replay-protection contract with five fresh deliveries,
zero terminal runtime
role/session/membership/API privileges and one hash-only verifier tombstone.
It also remains explicit that Abort, timeout, adversarial replay and Session
Pooler fallback paths were not live-tested; server-side SSL enforcement was not
attested; the static branch-admin password was present in process memory during
the run and is not attested short-lived or rotated; process-memory zeroization
and complete transitive dependency integrity are not attested; and
activation/readiness remain false.

The caller immediately deleted the exact Preview after success. Three
sequential independent branch listings showed only the healthy default
Production branch, revoking the Preview credential. No Production connection
or mutation at the database layer, real-data access, deployment, provider/model
call or automation activation occurred. Production parent interaction was
limited to disposable branch create/get/list/delete control-plane operations.

### Approved runtime adapters M1q — Hosted timeout/Abort negative-path pass

On 2026-08-31, after a fresh explicit authorization at the then-current Micro
Compute price of `US$0.01344/hour`, the caller created the no-data,
non-default, non-persistent PG17 Preview
`m1q-communication-note-hosted-negative-paths-r1-20260831` (branch id
`c1c404d3-e45d-44a2-b474-af3b52b7c13a`, child ref
`htylsaspsskufkgjginz`) under parent `adocsnwnslxhxcjgbyee`. Control-plane
metadata reported `with_data=false` and `ACTIVE_HEALTHY`. The pinned Server root
certificate SHA-256 was
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.

The exact 40/40 single-transaction migration gate passed with manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`.
The first two full-runner attempts then failed before the first scenario setup
because the setup SQL did not parse. Both attempts rolled back their complete
transactions and independent postchecks found zero generation/broker ledger
rows and zero temporary runtime roles. The source fix completed five `DO`
blocks with `END;` and parenthesized the top-level `CASE` expression used by an
`IF`. A PG17 parse-only diagnostic subsequently returned `{"parsed":true}` and
rolled back its transaction; two independent reviews ended at P0=0, P1=0 and
P2=0.

The corrected, source-pinned revision
`8b84b0aa633892a2da9bf157702f005c06b48d3b98a2f1aef2bff78082b552b7`
then passed gate
`COMMUNICATION_NOTE_M1Q_APPROVED_RUNTIME_ADAPTERS_HOSTED_NEGATIVE_PATHS` over a
Direct 5432 connection with actual `pg@8.23.0`. The live evidence covers exactly
three domain-separated scenarios: positive, PostgreSQL statement timeout and
runtime-watchdog Abort. It proves no terminal writes for either negative
scenario; a real SQLSTATE `57014` timeout while the backend was in transaction,
followed by rollback and session reset on the same live client; the targeted
watchdog callback and an exact-stream hard close before the broker tombstone;
three revoked acquisitions, three drained PIDs, three hash-only verifier
tombstones and zero terminal runtime roles, sessions, memberships or API
privileges. Hash-only verifier residue is not zero credential residue; raw
password, SCRAM verifier and DSN residue remained forbidden.

The evidence deliberately keeps
`sourceRevisionTransitiveClosureAttested=false`,
`underlyingCredentialShortLived=false`,
`underlyingCredentialExpiryAttested=false`, `rotationTested=false`,
`highLevelDatabaseSettlementDeadlineWallClockTested=false`,
`externalCallerAbortLiveTested=false`,
`processMemoryZeroizationAttested=false` and
`branchDeletionVerifiedByRunner=false`; caller-side deletion is recorded
separately below. It also preserves `activationApproved=false`, `ready=false`
and absent approved exports. It does not authorize a scheduled automation,
Product API importer, deployment or Production activation.

After the gate, the caller deleted the exact branch successfully. Three
sequential independent listings each showed only default `main` in
`ACTIVE_HEALTHY`, which revoked the branch credential and stopped further
branch charges; actual accrued cost remains subject to Supabase billing. No
Production SQL or data access, Vercel deployment, provider/model call or real
care data was involved. The historical M1p revision and its positive-only
Abort/timeout-false evidence remain unchanged.

### Product runtime composition M1r — source only

M1r promotes exact `pg@8.23.0` to a production dependency and adds one
server-only, default-off product composition module. Its static named import
provides a traceable dependency edge when a future approved Node server entry
makes the module reachable. The module validates the actual package version,
constructor/prototype data methods and Proxy posture without constructing a
Client, then privately injects that constructor into both M1m client slots.
Downstream M1m operations still create separate management/runtime instances.

The formal factory always rejects with fixed `PRODUCT_API_DISABLED`;
`READY=false`, the approved export is absent and no route, component, Product
API or automation imports the module. Cold import and the formal factory perform
no environment/DSN, credential or target discovery; M1r owns no such lookup and
its sole TestOnly path delegates only explicit injected resolver/transport ports
to M1m. This batch invoked no real resolver/credential/database connection, SQL,
Preview, Production migration, deployment, schedule or provider/model call.
M1r closes only the runtime-package and product-composition source gate; Product
API wiring, approved target/control-plane/credential/deployment identities and
all live Production/provider gates remain separate.

Local closeout passed the 3-file / 36-test M1r/M1m/runtime-boundary focus, the
complete 188-file / 2,578-test suite, TypeScript, full ESLint, 73-file adapter
sync, 64/64-page Webpack build and a 24-client-chunk negative leak scan. None of
those checks schedules work or makes this module a reachable product entry.

### Product runtime identities M1s — source only

M1s adds one server-only, default-off outer composition around M1r. A TestOnly
call first validates an injected, five-minute-bounded deployment identity for
the exact source revision, target ref and CA digest. It then requires one atomic
authenticated control-plane identity + branch observation and derives a
canonical content-free evidence digest. Project-ref HMAC, pinned-CA loading and
each management credential custody call are privately wrapped with the same
source revision, deployment identity evidence and control-plane evidence before
M1r/M1m can consume them.

The formal factory remains fixed `PRODUCT_API_DISABLED`; `READY=false`, the
approved export is absent and App Route/component importers remain zero. M1s
does not import `pg`, Supabase/OpenAI SDKs or network modules and performs no
environment discovery. It accepts no PAT, OAuth token, API secret, DSN,
password, host or CA body as composition configuration. The underlying branch
admin password is still explicitly static and reusable: the 60-second bound is
only the one-use delivery envelope, while source expiry remains `null` and
source revocation remains branch delete or password reset. No real deployment
identity, Management API adapter, KMS/HMAC, CA store or secret-manager transport
is implemented or claimed by this source contract.

Local closeout passed the 4-file / 76-test M1s/M1r/M1m-target/runtime-boundary
focus, the complete 189-file / 2,609-test suite, TypeScript, full ESLint,
73-file adapter sync, the 64/64-page Turbopack production build and the expanded
24-client-chunk M1r/M1s negative leak scan. Package and lock files stayed exact
to M1r. The run created no Supabase resource, SQL connection, migration,
deployment, schedule or provider/model call.

### Product runtime platform protocol adapters M1t — source only

M1t is the implemented server-only, default-off protocol layer outside
M1s. Its formal factory remains fixed `PRODUCT_API_DISABLED`; `READY=false`,
the approved export is absent and no Product API route, component or automation
may activate it. Provider SDKs, credentials and cloud resources remain outside
this source slice.

The only allowed Supabase control-plane request is an authenticated, no-query,
no-redirect, zero-retry `GET /v1/projects/{production_ref}/branches` using exact
OAuth App scope `environment:read`, pinned app/grant reference digests and an
enforced endpoint allowlist. `branching_development_read` belongs to the
separate fine-grained-token model and is not claimed on this OAuth token. PAT is
forbidden. `GET /v1/branches/{branch_id_or_ref}` is also forbidden because its
official branch-config response schema includes `db_pass` and `jwt_secret`,
which would collapse the control-plane and credential-custody boundaries before
M1s can assert content-free evidence.

Vercel OIDC alone does not attest the source revision; M1t therefore requires a
separate managed source-manifest attestation bound to the workload, target and
CA digest. The minimal target is Direct-only
`db.{child_ref}.supabase.co:5432/postgres`. PostgreSQL 17 requires both the
deployment-attested source pin and M1m's later database-session check; this
source handoff supplies no live PG17 evidence. Managed HMAC, pinned CA,
Management API credential and static branch-admin password remain distinct
injected protocol ports. No KMS or Secret Manager provider has been selected.

The completed local source gate passed M1t 33/33, the focused M1r/M1s/M1t
4-file / 84-test set, the full 190-file / 2,643-test suite, TypeScript, full
ESLint, `git diff --check`, the 64/64-page production build and the 24-chunk
M1r/M1s/M1t leak scan. These checks used no real provider credential, API,
database or cloud resource.
M1u requires separate provider, cost and resource authorization before any
workload federation, KMS key, OAuth credential, CA custody, secret version,
live Management API observation, database connection or deployment is created.
See
`documentation/communication-note-preview-product-runtime-platform-adapters-m1t.md`.

### Product runtime GCP adapters M1u — source closeout, live blocked

M1u selects Google Cloud for M1t's first concrete provider adapter and now has
a default-off, injected-client TestOnly protocol seam, but no concrete provider
runtime or live gate exists yet. GCP project `careslink-m1u-security` (project
number `288554824534`) has been created without a linked billing account;
regional KMS/Secret resources are pinned to `australia-southeast1`. Consequently
the pinned WIF pool/provider, runtime service account, IAM bindings, KMS key
ring/keys/versions and regional Secret Manager secrets/versions have not been
created. API enablement is not attested by this handoff. Vercel Team issuer is selected
for exact team `millionlunas-projects` / project `careslink-ai`; there is no M1u
Preview deployment or successful federation. A subsequently authorized batch
created Supabase OAuth App `Careslink AI M1u Preview` with website
`https://careslink.com.au`, localhost callback
`http://localhost:32119/m1u/supabase/oauth/callback` and only
`environment:read`. Raw client id is omitted; its inventory marker is SHA-256
`4b7a6fef8101c33fee65eae04d24cae31f59770773a21cb61af8299702bda77b`.
The one-time client secret was not persisted to the workspace, environment or a
credential store and remains an owner custody/rotation handoff. No authorization
grant, access token or refresh token exists.

The WIF plan pins exchanged-token `aud` to the provider-specific
`https://iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`,
while `google-auth-library` uses the distinct external-account resource audience
`//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`.
Neither may fall back to Vercel's normal team audience at exchange time.

M1u also corrects the control-plane authorization model: Supabase OAuth App
scope `environment:read` and fine-grained-token permission
`branching_development_read` are different models. This runtime chooses the
OAuth app scope plus pinned app/grant metadata SHA-256 attestations and the exact
list-branches endpoint allowlist; it does not claim that an OAuth token carries a
fine-grained permission. Raw app/grant IDs, client secrets and tokens stay out of
evidence and logs.

`READY=false`; version is
`gcp-adapters.communication.openai.synthetic-preview.2026-09-01.m1u.v1` and
policy digest is
`5a0b358626f1864cd13584e4abadf79254e5d365911b28586666e58a76c76c36`.
The completed local source gate passed M1u/runtime-boundary 2 files / 24 tests,
the focused M1s/M1t/M1u/runtime-boundary 4-file / 102-test set, the full
191-file / 2,667-test suite, TypeScript, full ESLint, `git diff --check`, the
64/64-page production build and the 24-chunk M1r/M1s/M1t/M1u leak scan. This is
source-only evidence; live source revision and live resource evidence remain
`TBD`.

The earlier OAuth evidence, database-custody request-shape and explicit
`nbf`/name-claim mismatches are closed, together with descriptor-safe hostile
input rejection, uint32 CRC, monotonic clock, credential freshness, KMS success
integrity and X.509 CA validation. M1v subsequently closed the source-only
provider-bridge and M1u→M1t composition gaps with default-off TestOnly ports;
this does not change the GCP or deployment live status. Provisioning/live remains NO-GO
because the independent source-manifest signer/artifact pipeline, GCP billing
and resources, Supabase OAuth secret custody/rotation, canonical app/grant
references, grant/live intake plus rotated-token writer,
Node transport live evidence and one-time no-data Preview gate do not exist.
The runtime service account may not silently receive source-manifest signing
authority, and source wiring is not evidence of a live provider call.
No Preview/Production database, SQL/migration, real data, deployment or AI call
was involved. Billing linkage, Google APIs/resources/IAM, KMS/secret versions,
Supabase OAuth secret custody/rotation and grant, any Vercel Preview deployment and every live branch
operation remain separate action-time confirmation blockers. See
`documentation/communication-note-preview-product-runtime-gcp-adapters-m1u.md`
and
`documentation/communication-note-preview-product-runtime-provider-bridges-m1v.md`.

### Product runtime provider bridges M1v — source wired, live blocked

M1v adds two default-off source bridges without enabling a formal runtime. The
GCP bridge uses the exact direct-REST chain
`@vercel/oidc` → Vercel custom-audience exchange → Google STS → runtime
service-account impersonation → pinned KMS/Regional Secret Manager calls. Every
operation is zero-retry, no-redirect, five-second bounded and receives the same
root `AbortSignal`; exact project/provider/service-account, numeric key/secret
versions and response/CRC boundaries remain pinned. Its version is
`gcp-rest-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1` and
policy digest is
`c116c449fb025ecaca156e952d37b812c7dd272258120f677c8cef1e202326e3`.

The Supabase bridge consumes a one-use OAuth intake credential, proactively
refreshes exactly once per bundle and serves only the `environment:read`
list-branches GET. A 401 revokes local use without refresh or replay. A rotated
refresh token is deliberately not persisted because no reviewed writer exists.
Its version is
`supabase-management-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1`
and policy digest is
`2c4c87bb7a15f3b101fd78c4438f44ed8b2e6dd28f782a615b92f87029e43c68`.

Injected-transport source tests compose the actual M1u→M1t→M1s→M1r→M1m
modules without constructing a PostgreSQL Client or consuming the terminal
database credential. Both formal bridges remain absent with `READY=false`,
deployment/activation false. No GCP resource, live credential, provider exchange,
database, deployment, real care data or model call is evidence of this source
slice. A later authorized batch created only the scoped Supabase OAuth App; its
one-time secret was not persisted and no grant/token exists. GCP remains blocked
by missing billing and resources. Remaining gates are the independent signer
artifact/revision handoff, OAuth secret custody/rotation, canonical app/grant
references, grant/live intake and rotated-token writer,
Node transport live evidence, then an explicitly confirmed one-time no-data
Preview/live/delete cycle.

The M1v closeout passed 6 focused files / 82 tests, the full 194-file /
2,683-test suite, TypeScript, full ESLint, the 73-file Codex-adapter sync check,
`git diff --check`, the 64/64-page production build and a fresh 24-chunk
M1r/M1s/M1t/M1u/M1v server-only leak scan.

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

### Communication Note generation HTTP boundary M1x

M1x adds the physical
`POST /api/ai-documents/communication-note/generate` request boundary without
adding an automation runtime. Its independent environment flag is gated again
by a compile-time `READY=false` latch, and the formal strict-principal resolver
and formal submission port are both `undefined`. The default handler therefore
returns a fixed, no-store
`503 PRODUCT_API_DISABLED` before authentication or body access, including when
the environment value is accidentally set to exact `true`.

The source-only strict-principal factory replaces the loose Workspace-account
test seam. It rejects every `Authorization` header before Auth work, then uses
one request-scoped Cookie/authenticated Supabase client to verify Cookie JWT
claims, revalidate the frozen configuration, call the zero-argument
`resolve_v1_current_session_status()` RPC and match the authoritative Auth user.
The RPC receives no caller identity. The same client is used in the fixed
`getClaims → snapshot revalidation → current-session RPC → getUser` order, and
the frozen full principal is passed to the submission boundary without being
returned or logged. A separate source-only wrapper still requires exact Vercel
Preview/project identity, a configured ref distinct from the pinned known
Production ref, canonical Supabase URLs and matching publishable keys. It reads
no dedicated or generic privileged key, creates no privileged client and has no
fallback to the legacy two-argument service RPC. The formal wrapper export
remains `undefined`; M1y makes the route import only that placeholder without
calling or installing the executable factory. The authenticated
current-session migration remains unapplied, so this is not live
Cookie/Auth/database evidence. The wrapper does not query Supabase branch
provenance or health.

The route then
validates same-origin HTTPS, bounded JSON, an idempotency header, exact
Communication facts, both privacy confirmations and two server-side privacy
scanners before accepting a strictly owner-safe admission response. Fresh
admission returns `202`; exact replay
returns `200` with the current durable job state, including valid terminal state.
Duplicate JSON properties and unsafe/temporally inconsistent job envelopes fail
closed. The request path invokes no M1r–M1v composition, OpenAI provider,
worker, Points store or cloud bridge. M1y's uninstalled TestOnly submitter uses
only an owner-repository contract plus explicit privacy/payload ports and stops
at durable `QUEUED` admission. No schedule, retry worker, model call, database
connection, Preview, Production resource or deployment was added.

A future activation batch must formally install the reviewed strict-principal
composition only after trusted Provider roles are normalized and server privacy
authority, retention-bounded payload custody, terminal Points settlement and a
formal owner admission caller are bound. The source-only successor below now
rechecks session/privacy and couples durable admission to a fixed 20-Point
reservation. The later terminal-settlement source safely unquarantines that
paid lane, but both remain unwired. M1x does not permit
the HTTP request thread to call a model directly. See
`documentation/communication-note-generation-api-m1x.md` and
`documentation/communication-note-generation-principal-composition.md`.

### Communication Note secure submission runtime M1z — source only

M1z adds provider-neutral secure-submission cores without scheduling or
activating them. The formal Cookie principal is now installed as a conditional
source composition: it resolves only after exact Product/API/principal gates,
Vercel Preview/project identity, canonical non-Production Supabase ref/URLs and
matching publishable keys pass. The request-scoped Cookie client remains lazy,
and the API compile-time latch still prevents request/auth/body access. The
formal submitter remains `undefined`.

The encrypted-payload stager core validates the canonical Communication facts
and their hash/size before generating a fresh 32-byte DEK and 12-byte IV. It
uses AES-256-GCM with a 16-byte tag, canonical AAD and a fully qualified numeric
KMS key-version resource. KMS wrapping and atomic private-object
create-if-absent are injected ports. Exact owner/idempotency/request replay
returns the original safe receipt; changed requests and stored-binding drift
fail closed. The receipt contains only IDs, hashes, expiry and immutable policy
versions—never plaintext, a DEK, wrapped-key bytes or an object locator. The
formal stager export remains absent.

The new Production-unapplied migration defines a 19-argument private
policy-bound Communication Note + fixed-20-Point admission function and a
separate credentialless `NOLOGIN` caller shell. It atomically binds the existing
three-field payload-policy digest plus encryption profile, exact KMS-version
hash and backup disposition to the approved catalog and final job/payload row.
The caller receives no login, Data API identity, service-role fallback or
runtime membership. The owner repository now has a provider-neutral
injected-query factory, but it opens no pool and resolves no credential; its
readiness remains `false`.

The maintenance core exposes `reconcileStaged(limit, now)` and
`sweepExpired(limit, now)` over injected atomic-lease, exact-admission and
exact-delete ports. Accepted payloads are retained, rejected payloads are
deleted, and missing/ambiguous admission remains untouched before expiry and is
deleted only at or after expiry. Any candidate/admission/delete binding mismatch
is quarantined. Only `DELETED` or a durable same-binding `ALREADY_DELETED`
tombstone is success; bare `NOT_FOUND` is not. Unknown delete results remain
replayable. The formal maintenance singleton is `undefined`, and there is no
cron, worker or scheduler.

The M1z focused source gate passed 232/232 tests, and the complete local suite
passed 3101/3101 across 219 files. TypeScript, zero-warning ESLint, optimized
Next.js build, the 27-static-chunk client boundary, 73-file adapter sync and
diff checks also passed. No migration or grant was applied to a Supabase/Hosted
database, no cloud/KMS/Secret Manager/private store was created, no Preview or
Production resource was changed, no deployment occurred and no real care data
or model request was used. At the M1z checkpoint, actual KMS,
private-object-store, purpose-caller query credential and maintenance
persistence adapters remained required. See
`documentation/communication-note-secure-submission-runtime-m1z.md`.

The exact final migration passed a private-Unix-socket PostgreSQL 16
Hosted-like empty-state commit. A separate synthetic paid-row cluster hit the
explicit non-retroactive-history preflight and rolled the migration back with
no caller, KMS column or temporary SET membership left behind. This is local
schema/transaction evidence only, not a Supabase/Hosted apply or runtime.
The corresponding PostgreSQL 16.15 terminal-settlement harness now uses the
19-argument bound coordinator and passed its 21 selected migrations plus 6/6
concurrency/settlement scenarios with complete SQL and filesystem teardown.

### Communication Note provider adapters M2a — historical source checkpoint

M2a supplies default-off protocol implementations for exact-version Cloud KMS
wrapping, an exact private GCS bucket and one-shot Points admission over a
purpose-scoped physical PostgreSQL session. KMS construction now requires a
fresh module-branded exact-resource posture claim; GCS rechecks its normalized
exact-bucket posture before each credential request and requires injected claims
that settings were effective for at least 30 seconds with no historical
noncurrent or soft-deleted versions; and the database adapter requires at least
25 seconds of lease/target validity for its 12-second query, two sequential
five-second cleanup windows and a three-second scheduling margin. Database
cleanup receipts must report
session termination, zero active statements, settled/cancelled in-flight work,
atomic late-issuance blocking, zero active sessions and complete revocation or
non-issuance.

These are validation boundaries over explicitly injected capabilities and
claims, not live trust. No authenticated WIF/control-plane issuer, exact KMS or
bucket resource, post-change bucket propagation proof, historical
noncurrent/soft-deleted/retained/backup-copy purge evidence, database credential
issuer/connector or independently observed quiescence exists. Formal adapters
remain `undefined`, readiness remains `false`, and nothing is scheduled or
deployed.

### Communication Note provider trust M2b — source only

M2b narrows the KMS half of the M2a boundary to one owned provider sequence:
exact Vercel Preview OIDC claims, a fresh custom audience and `jti`, Google STS,
the pinned WIF provider, and two pinned service-account impersonations. The
first credential request authenticates the exact parent `CryptoKey` plus numeric
`CryptoKeyVersion`; a second independent credential request can cross the private WeakMap
boundary only once for one M2a `rawEncrypt`. Caller-supplied M2a posture or
credentials are not accepted.

Google STS acceptance is the authentication authority for the exact custom
token; local claim parsing is not a separate JWKS-verification claim. Both
service-account credential requests use the same principal and scope, so their
separate local lifecycles are not independent IAM purpose isolation and do not
assume Google returns different token strings.

The exact-allowlist Node HTTPS transport performs public-address DNS preflight,
pins resolution into each request, rechecks the connected peer, verifies TLS,
rejects redirects and retries, bounds every request to five seconds and the
whole preparation chain to 30 seconds, and applies endpoint-specific byte and
header limits. Mutable body/chunk copies are scrubbed. Immutable JavaScript JWT
and access-token strings cannot be reliably zeroized; M2b drops references but
makes no string-zeroization claim.

Formal factories/singletons remain closed (`READY=false`, singleton exports
`undefined`, formal preparation fixed-failure). Only the exact `TEST_ONLY`
capability can run the source seam, which has no route, worker or scheduler
importer. The tests use mocked provider/HTTPS boundaries; no live cloud call,
resource, deployment, Preview/Production change, real care data or model call
belongs to this batch. M2c later removed the GCS raw-token DTO from the adapter
source boundary, and M2d later supplies its source-only private GCS
authority/transport. Live composition and independent WIF/IAM/KMS and bucket
control-plane attestation remain required before formal composition. See
`documentation/communication-note-secure-submission-provider-trust-m2b.md`.

### Communication Note GCS authority handoff M2c — source only

M2c changes the GCS object-store adapter to request one tokenless authorized
session for each complete top-level operation. The authority must synchronously
call exactly one consumer and directly return its exact opaque operation;
pre-reading, awaiting, Promise-assimilating, wrapping, duplicating or deferring
that operation fails before GCS I/O. One accepted session may issue all bounded
metadata, media, upload and response-loss recovery requests required by that
logical operation. Separate and concurrent top-level operations receive
separate sessions, and their child signals close at settlement.

The adapter no longer receives a raw access-token DTO, generic header map or
caller-owned authenticated transport. Its formal singleton remains
`undefined`, readiness remains `false`, and no product runtime imports it. The
injected authority session, clock and bucket-posture claim are not provider
trust. No private credential issuer, owned GCS transport, live WIF/IAM,
authenticated exact-bucket propagation/history/backup proof, cloud resource,
Preview, deployment, Production change, real care data or model call belongs to
this batch. See
`documentation/communication-note-secure-submission-gcs-authority-handoff-m2c.md`.
The local gate passed 50/50 focused tests, 3240/3240 complete tests, TypeScript,
zero-warning ESLint, the 64/64-page production build, the 27-chunk M1r–M2c
client-boundary scan, adapter sync and diff checks.

### Communication Note GCS private authority M2d — source only

M2d adds a private, one-use authority and a GCS-only owned Node HTTPS transport
for the M2c authorized-operation contract. Its `TEST_ONLY` preparation path
binds the exact Preview identity, custom audience, Google STS exchange, pinned
runtime service account, GCS scope, bucket/prefix, permission set, upstream
expiry and root signal before projecting a tokenless authorized-operation port.
Each top-level GCS logical operation requires a separately prepared credential;
the authority then performs the exact synchronous direct-return M2c handoff.

The transport source limits metadata, direct media and multipart upload to
exact endpoint/method/query/header/status profiles. It requires public-only
pinned DNS with Google-published IPv6-prefix admission and a public connected
peer, preserves TLS/server-name verification
before private header/body commit, rejects redirects, retries, proxies and
compression, and bounds request/operation time, bytes and late cleanup. Raw
tokens and `Authorization` remain private to the authority/transport and do not
enter the M2c DTO, logs, evidence or client configuration.

This adds no active automation. Both M2d readiness latches remain `false`, both
formal exports remain `undefined`, the formal preparation path fails before
OIDC/network work and no product runtime imports either module. Provider, DNS,
TLS and HTTPS effects in source tests are mocked. The final same-revision local
gate passed 25/25 M2d tests across 2 files, 105/105 focused regressions across 5
files and 3265/3265 complete tests across 226 files, plus TypeScript,
zero-warning ESLint, the 64/64-page Next.js 16.2.9 Turbopack build, 27-chunk
client scan, 73-file adapter sync and diff check. The initially sandboxed build
was denied only by temporary-local-port binding policy and passed on the
permitted rerun. No live WIF, IAM, bucket, GCS, Preview, deployment, Production,
real-care-data or model-call claim belongs to this batch. See
`documentation/communication-note-secure-submission-gcs-private-authority-m2d.md`.

### Communication Note atomic 20-Point admission — source only

Migration
`20260902063211_add_v1_communication_note_points_admission.sql` adds the sixth
Production-unapplied durable-generation migration and the fifteenth forced-RLS
private generation table. Its Communication-only private coordinator admits a
durable job and reserves the fixed `2026-08-09.v1-shadow` rate of exactly 20
Points in one transaction. Fresh admission produces a `QUEUED` job at attempt 0,
an `AVAILABLE` payload, one `RESERVED` reservation and one exact `RESERVE`
ledger/allocation set; same-key replay rechecks session, privacy, expiry and the
binding and writes nothing. Owner-wide advisory locking and deterministic lot
selection prevent oversubscription.

The fifth generation purpose role is `NOLOGIN`/`NOINHERIT`/`NOBYPASSRLS`. On
PostgreSQL 16 it has zero runtime members and retains only the unique
creator-management edge from `postgres` with `ADMIN=true`, `INHERIT=false` and
`SET=false`; the migration-time `SET` edge is revoked. Temporary `TRIGGER`
privilege ends false. The adapter remains `READY=false` and TestOnly, creates no
pool, reads no database URL and is imported by no route. No API or service role
receives coordinator execution.

At this checkpoint a marked paid job stayed `QUEUED` and was quarantined from
claim, recovery, attempts, cancellation and legacy Points commit/release. The
successor below replaces that temporary source quarantine. The DTO still omits
private binding and Points IDs, although the authenticated owner can
historically read their own public Points row IDs under existing RLS. No welcome
grant or legacy-credit rule changes.

The current transactional migration manifest covers 44 migrations. The Hosted
schema-rollback runner remains A01–A20; A21 passed only as a standalone,
isolated-local serial rollback-only 34-`DO`/6-savepoint assertion and is not
part of that Hosted runner or concurrency evidence. A separate fresh-empty
PostgreSQL 16.15 run applied #1–#43 in individual
transactions; its exact Hosted-compatible `postgres` schema `USAGE` bridge was
needed after #25, then revoked so final effective schema `USAGE` and `CREATE`
were false. A separate 15-PID runner passed five three-client lock-wait
scenarios: one-create/two-replay same-key reservation; one-success/one-
`POINTS_INSUFFICIENT` different-key oversubscription; and session, privacy and
payload-expiry failures with zero writes. The last maps to
`PRIVACY_REVIEW_STALE`. Generic bound-reservation commit/release was denied.

Two cleanup attempts exposed distinct foreign-key ordering bugs—first
binding↔job, then job↔payload—and each whole transaction rolled back without
damage. The third, corrected exact-scoped cleanup committed with both protection
triggers enabled (`O`), the job/payload foreign key validated, every scoped
fixture/business/Points row at zero, runner/support absent and temporary schema
`USAGE` revoked;
the cluster was deleted. Static concurrency coverage passed 1 file / 12 tests.
No Hosted or Production database, new Preview, deployment, activation, model
call or real care data is represented.

### Communication Note atomic Points terminal settlement — source only

Migration
`20260902121601_add_v1_communication_note_points_terminal_settlement.sql`
adds the seventh Production-unapplied generation migration, two forced-RLS
private tables and the sixth non-login purpose role. It gives that role no
runtime member and grants no API or generic Points terminal capability.

Paid claim/recovery, heartbeat, payload authorization and fence replay now
revalidate the exact reservation with fresh post-lock clocks. Authorization
must retain the approved policy's provider deadline plus commit safety margin;
fence replay and success must retain the commit margin. Per-registration turns
alternate paid/unpaid work and paid queued/running expiry, including batch size
one, with empty-lane fallback.

Successful terminalization appends exactly one 20-Point `COMMIT` only in the
same transaction as the canonical document/revision, sync change, mutation
receipt, provider evidence and purge request. Permanent failure/cancellation
appends one `RELEASE` and restores the exact source lots. Retry leaves the
reservation `RESERVED`. Same-idempotency and response-loss replay reassert the
immutable aggregate and write nothing; the old owner/worker JSON envelopes are
unchanged. The migration remains default-off, unwired and Production-unapplied,
with no deployment, provider request, model call or real care data.

The final isolated PostgreSQL 16.15 gate applied the exact 20-migration
dependency chain and passed all six terminal/concurrency groups, including
unmarked `QUEUED`/`RUNNING`/`FAILED` cross-surface denial, deterministic
recovery fairness and permanent ACL checks. Exact cleanup, graceful stop and
temporary-root deletion all passed; `documentation/tests.md` records the pinned
hashes and scenario evidence.

## Inactive shadow automation contracts

- The contract and migrations define generation/export job states. Source-only memory contracts model leases, recovery, retry policy, provider evidence and single-use payload grants, and the registered-worker v2 facade composes those boundaries without a payload locator. All eight generation migrations remain Production-unapplied; deleted `r9` supplied isolated PostgreSQL 17.6 execution evidence for database-clock claim/heartbeat/fence/commit/settle/resolve/recover/authorize/consume logic and payload/grant/evidence/purge-outbox metadata, deleted `r20` supplied the three true two-session race results, and deleted `r21` supplied exact historical transient-retry/success replay through payload/outbox purge. The later local owner-repository gate covers the three private owner RPCs, migration #29 adds the non-login control-executor-owned graceful-retirement identity, admission adds the fifth purpose role/private binding table, terminal settlement adds the sixth purpose role plus settlement/recovery-turn tables, and M1z adds the source-only policy/KMS-bound admission caller—none has a runtime credential. There is still no installed caller. Normal consume deliberately settles `DENIED_SETTLED` / `PAYLOAD_UNAVAILABLE` and returns no vault grant, locator or facts; the historical rollback-only `TEST_ONLY` `CONSUMED` fixture proves only scripted canonical transaction atomicity. M1z supplies provider-neutral encrypted staging and maintenance cores; M2a adds default-off exact-version KMS, private GCS and one-shot Points-admission source adapters. M2c removes raw credentials from the GCS adapter handoff, and M2d adds a source-only private authority and GCS transport without installing either. Their posture brands, source identity checks and cleanup results are not live trust; they still have no installed WIF or database credential issuer, authenticated exact-resource/provenance proof, bucket propagation/history-purge evidence, independently observed database quiescence, formal composition, queue service, deployed worker, live retry loop or served cancellation endpoint.
- No worker automation may be scheduled yet. Deleted `r20` closed the PostgreSQL 17.6 true two-session claim/session/privacy race gate, deleted `r21` closed the fixed Attempt-2 historical replay gate, deleted `r22` closed the hosted registration-retention gate, the earlier isolated local PostgreSQL 16.15 run closed its recorded engine/serial/true-two-session version gate, and deleted `r5` closed its historical Hosted 30/30 migration, then-current 11/11 assertion and independent posture gate. Owner admission/enqueue/status/cancel and graceful worker-registration retirement now have source, local SQL and deleted-Hosted schema/transaction boundaries; Communication has source/local fixed-20 admission and terminal-settlement boundaries plus M1z encrypted-staging, exact policy/KMS admission and maintenance source cores. M2a's provider protocol adapters remain uncomposed and unproved against live resources; M2c narrows the GCS source handoff and M2d supplies only its default-off source authority/transport. Emergency revocation, attempt listing, account-delete/purge and orphan recovery, sequential JSON numeric parsing hardening, live credential/IAM/network proof, caller/route, hosted Auth/Data API, model/STT and runtime-activation blocks remain explicit governance gaps.
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
- The memory Points reference store proves quote/reserve/commit/release semantics. The SQL draft exposes five `security definer` shadow RPCs only to `service_role`; those RPCs passed isolated branch tests for settlement, replay/conflict, source-lot release, expiry, insufficient balance and cross-owner denial. The Communication-only successors now provide source/local atomic fixed-20 admission and terminal commit/release while keeping generic terminal RPCs blocked. All remain unapplied to Production and no server route calls either coordinator.
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
| generation worker/queue | absent at runtime; all eight generation migrations are Production-unapplied and exist on no retained Preview. M1z adds the source-level encrypted stager, exact policy/KMS-bound admission shell and reconciliation/sweep core; M2a adds default-off KMS/GCS/purpose-session protocol adapters, M2c removes raw credentials from the GCS source handoff and M2d adds a quarantined source authority/transport. M2d installs no formal authority or transport and supplies no live credential, IAM/network proof, authenticated exact resource, propagated/history-clean bucket evidence, independently observed database quiescence, scheduler, formal composition or usable worker vault grant. Paid jobs remain default-off, settings/catalog/registration remain fail-closed, no API/service role has the new coordinator `EXECUTE`, and the formal submitter/maintenance plus worker runtime remain absent |
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
