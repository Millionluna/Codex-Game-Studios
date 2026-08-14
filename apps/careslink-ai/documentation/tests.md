# CaresLink AI Test Evidence

> Evidence date: 2026-08-14. This document separates **Existing**, **Proposed**, and **Gaps**. Passing current tests does not mean Product Baseline V1.0 is implemented.

## Existing

### Pre-batch audited runtime baseline

Run against exact audited HEAD `f0d994dfc66d7373bbadbe106b3147d847c6c8d3`:

| Command | Result |
|---|---|
| `pnpm test` | 79 files, 546 tests passed |
| `pnpm exec tsc --noEmit` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; 52 static/dynamic routes enumerated |

The build emitted only the known multiple-lockfile workspace-root warning. No application code or deployment was changed during this audit.

### Inactive shadow batch verification

Run against the current uncommitted implementation-readiness worktree. The repository checks below are separate from the isolated database evidence that follows:

| Command | Result |
|---|---|
| focused shadow/save/delete suite | 14 files, 131 tests passed |
| `pnpm test` | 90 files, 653 tests passed; includes all prior 546 tests |
| `pnpm exec tsc --noEmit` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; 52 static/dynamic routes enumerated |
| `git diff --check` | passed after final documentation edits |

The source tests prove source/domain contracts. Separate guarded-live runs prove migration/database authorization and the protected NDIS save integration on an isolated Preview. They do not prove a served Product API or any Production V1 activation.

### Shared Product API implementation batches (local only)

The historical 90-file / 653-test result above remains the implementation-readiness baseline. The 2026-08-11 pre-E2E shared implementation snapshot added the versioned transport/OpenAPI contract, default-off `/v1` routes including canonical revision append at `PATCH /v1/documents/{documentId}`, canonical `GET /v1/sync/pull?cursor=` and atomic `POST /v1/privacy-reviews`, a request-scoped Supabase adapter, service-only active-session resolver, deterministic privacy scanner and replay/conflict/owner/cursor/tombstone tests, four native-auth routes that return fixed `501` envelopes with capability `false`, and static migration-contract checks. The former `/v1/documents/{documentId}/revisions` HTTP route is not retained. `POST /v1/sync/push` is reserved as an unserved `NOT_IMPLEMENTED` boundary without a frozen batch body:

| Command | Result |
|---|---|
| `pnpm test` | 103 files, 831 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 59/59, including the Product API routes, atomic privacy confirmation and four fixed native-auth `501` boundaries |

The route adapter is not Preview- or Production-served: its master and durable-adapter flags both default off, and runtime target verification accepts only an explicitly matched non-Production Preview Supabase ref. The default runtime now assembles request-scoped persistence and active-session validation, but missing configuration fails closed before any client is created. Mobile uses `Authorization: Bearer`; cookie authentication is an additional Web transport through the same adapter. Web cookie mutations require same-origin HTTPS plus JSON, Bearer mutations remain independent of browser Origin, and sync pull is `GET /v1/sync/pull?cursor=` with no mutation body. Sync push remains unserved and `NOT_IMPLEMENTED`. Privacy confirmation authenticates before body parsing, scans bounded canonical structured facts with policy `2026-08-11.preview.1`, returns locator-only findings, and persists only hash/proof metadata through a dedicated service-only adapter. Its scanner is deterministic, not a guarantee of complete de-identification. Confirmed proofs use a temporary 30-minute Preview TTL; this is not a Production product decision. Create and append bind that proof to owner/type/canonical `factsSummary` hash/schema/status/expiry in the tested adapters; changing only `englishDraft` is valid and changing `factsSummary` is stale. The dedicated Preview privacy secret does not fall back to the generic service-role key. These are source-level guarantees only: this batch does not establish a live database RPC grant or route E2E. The five native routes physically return structured `501` envelopes, while their capability constants remain `false`; this is a fail-closed boundary, not implementation or service evidence. The four mobile-sync document write-RPC execute grants remain withheld pending disposable-database canonical-hash vectors and server-equivalent Note schema validation. Consequently, these source tests do not prove database RLS, revoked-session integration, write availability, native authentication, cross-device sync or end-to-end behavior.

### Portal-first M0/M1 local checkpoint — 2026-08-14

The current Portal-first source snapshot adds the native M0 machine capability
crosswalk, an opaque fixed sync-push `501`, per-operation read/write gates and a
local-only Referral contract plus unapplied default-off/RLS foundation. The
Referral tests cover metadata-only replay hashes, role/organization/provider
eligibility, offered/declined provider isolation, fixed non-PII catalog codes,
repeated follow-up, stale state, failure rollback and sequential competing
decisions. They do not prove database transaction concurrency.

| Command | Result |
|---|---|
| `pnpm test` | 107 files, 938 tests passed; preserves the 90 / 653 historical baseline |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 61/61 |

The Portal migration and transactional assertion script were not applied or
executed. There is no current disposable Preview base URL, no native redirect
allowlist authority and no served Referral route/page replacement.

### Mobile V1 protected Product API Preview E2E — 2026-08-14

A protected, non-Production Preview exercised the default-off Product API against
the reviewed source snapshot with two synthetic password users. No Production
deployment, alias, database, migration or user data changed.

| Gate | Result |
|---|---|
| Protection and Auth | exact protection/bypass contract passed; both users passed create, authoritative pre-sign-in database proof, password sign-in and session-row proof |
| Five Note types | 5 privacy confirmations and replays, 5 document creates and replays, and 15 unique synthetic mutation identifiers exercised and tracked |
| Owner isolation | owner B received an empty list, exact initial pull cursor `sync.v1:0`, no owner-A get visibility and fixed cross-owner write denies |
| Revision and recovery | patch/replay, idempotency conflict, stale base, checkpoint/replay, aggregate recovery, pull/upsert, tombstone/replay and privacy-outbox exclusion passed |
| Shutdown | the guarded write window closed, all four temporary RPC grants were revoked, both sessions were revoked, and the prior JWT was rejected |
| Cost and scope | zero model calls, zero Points/Billing activity and zero Production changes |

Permanent, credential-free regression and application checks on the current
post-review worktree passed after the cleanup policy and evidence were saved.
They are later source/static evidence and do not imply that the historical
Preview ran the exact current SQL revision:

| Command | Result |
|---|---|
| `pnpm test:preview:e2e:policy` | 1 file, 13 tests passed |
| `pnpm test` | 104 files, 894 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation completed 59/59 |

The `5 / 5 / 15` counts are coverage evidence. The 15 identifiers include
successful, replay and expected conflict/deny paths; they do not mean 15 database
commits. Generated cleanup identifiers were held in memory or the temporary
recovery ledger. Synthetic request content passed through the disposable Preview
and was removed with the test rows; neither identifiers nor payloads are recorded
here.

The business matrix completed, but the original process then failed closed with
`E2E_CLEANUP_DEPLOYMENT_INCOMPLETE`. Post-incident review found two overly short
deployment-observation deadlines and an adjacent subsecond horizon edge case. After
the request-only retry and horizon policies were independently reviewed and locked,
one recovery-only action returned `cleanupComplete: true`. Three joint
deployment-absence samples, three Auth-absence samples and the final global-zero
audit passed. The ledger, primary manifest, recovery manifest, requests and staging
artifacts were all absent at the end. This split outcome must not be reported as a
single `ACTION=run` exit-zero.

This is Preview route evidence, not Production approval. It does not prove native
Auth, Points/Billing, model generation, cross-device/offline behavior or real-user
workflows. The repeatable cleanup policy is documented in
`documentation/mobile-v1-preview-e2e-runbook.md` and locked by credential-free
tests under `scripts/preview-e2e/`.

### Post-review hardening boundary

A final pre-commit review found four gaps that the earlier Preview matrix did not
exercise: historical A→B→A content replay, source validation before the advisory
lock, same-content source metadata updates, and legacy deletion leaving canonical
content without its source mapping. The local source now uses a source-versioned
mutation identity, validates the current source after locking, requires replay to
still reference the current canonical revision, and binds NDIS canonical documents
to their legacy source so owner reads require a live source; a fail-safe server RPC
then tombstones the retained canonical record without deleting its audit content.
The readiness audit was also consolidated so historical failed Preview
attempts are not presented as current state.

The then-current NDIS revisions implementing the four changes above were applied
to the retained non-default branch and their then-current transactional assertions
passed. The later committed SQL additionally adds exact catalog postconditions,
private-schema ACL/object-set proofs and fresh eligible-provider session checks;
those later changes have source/contract-test evidence only and have not been
applied to that branch or any deployment.
Repository tests and static SQL assertions must pass locally, then the exact current
migration set and transactional SQL assertion files must clean-apply on a new or
rebuilt `with_data=false` branch before another protected Preview. The earlier
Preview evidence remains evidence for the earlier source only; it is not a release
approval for this hardened migration revision.

### Isolated Supabase guarded-live evidence

Target identity was verified before writing:

- branch ref `jtkicyqwdabhjzhdutve`, parent project ref `adocsnwnslxhxcjgbyee`;
- Supabase reported `with_data=false`, non-default branch and healthy status;
- branch URL ref differed from Production;
- pre-apply legacy rows were 0 and legacy column/constraint/policy/grant signatures were captured.

| Gate | Result |
|---|---|
| Fresh apply / reproducibility | passed twice, including branch reset to the parent migration and a second 44,028-character apply |
| Legacy safety | row counts remained 0; all four legacy schema signatures matched before/after |
| Objects and grants | 18/18 tables; 14/14 owner RLS policies; 14/14 owner SELECT grants; 0 authenticated writes; 5/5 service-role RPC grants; 0 anon/authenticated/public RPC grants |
| Database constraints | all 9 `shadow_only` checks present; `false` rejected; cross-owner document/revision/checkpoint/current-revision combinations rejected |
| Real JWT RLS | anon read/RPC 401; provider A/B each saw only own rows; test-only platform service actor saw 0; direct INSERT/PATCH/DELETE/RPC returned 403 |
| Points commit path | earliest-expiring lots allocated 20 + 30; one commit; replay did not duplicate ledger rows |
| Points release path | one release restored the exact source lots; replay stable; different reason/event rejected |
| Failure paths | expired quote, expired lot/insufficient balance, cross-owner quote/reservation, fixed-rate/idempotency conflicts and release-after-commit rejected |
| Ledger and welcome | append-only application boundary held; no automatic 300-point welcome lot |
| Service-role boundary | positive writes only through five RPCs; direct table INSERT/UPDATE/DELETE denied |

No model call, legacy credit mutation, Production database write, environment change, deployment, commit or push occurred. Fixture credentials were test-only and are not recorded here. The reusable schema/grant assertion script is `supabase/tests/v1_shadow_contract_assertions.sql`.

Cleanup evidence: 3 test users, 3 identities, 9 sessions, 9 refresh tokens, 2 documents, 2 revisions, 2 wallets, 4 lots, 6 quotes, 2 reservations, 4 allocations and 8 ledger rows were removed. Post-cleanup counts for every shadow business table, legacy table and orphan auth/session check were 0; deleted password grant returned 400. The dedicated branch was then deleted, and the branch list returned only the default main project.

### NDIS integration database gate (second disposable branch)

The application-layer integration was tested separately on branch `qkciaecjwidtbujzwzln`, which Supabase reported as non-default, `with_data=false`, healthy and parented to `adocsnwnslxhxcjgbyee`. The branch cost confirmation was `0.01344/hour`; the branch was deleted after the run.

| Gate | Result |
|---|---|
| Migration reproducibility | foundation + integration applied; branch reset to parent `20260804115230`; both applied again |
| Transaction assertions | `v1_shadow_contract_assertions.sql` and `v1_ndis_shadow_integration_assertions.sql` passed before and after reset |
| Legacy safety | generated drafts, entitlements and legacy ledger stayed at 0 before fixtures; generated-material column signature `a8f2575c37929a5a7144c03c644917e4` matched before/after apply |
| Integration grants | three tables had RLS; zero anon/authenticated table grants; zero public/anon/authenticated RPC grants; exactly three service-role RPC grants |
| Integrity | three `shadow_only` checks; composite source-owner/document/revision FKs present; invalid owner/target fixtures rejected by assertions |
| Same-key concurrency | one call returned `PROJECTED`, the concurrent call `REPLAYED`; one document/revision identity |
| Distinct-content concurrency | advisory lock serialized the two calls as revisions 2 and 3; no silent overwrite |
| Failure/reconciliation | malformed projection returned `FAILED` + `SHADOW_WRITE_FAILED`; audit reported failed/missing source metadata without body content |
| Shadow read | controlled calls returned `MATCH`, `MISMATCH` and `MISSING` as expected |
| Legacy credits / Points | no entitlement/credit rows were changed; Point wallet/lot/quote/reservation/allocation/ledger counts remained 0; no welcome grant |
| Anonymous REST | canonical and integration reads returned `401`; service-only RPCs were not exposed and returned `404` |
| Supabase advisors | security/performance findings were INFO/WARN platform or FK-index advisories; existing Preview hot-path indexes were retained and no mechanical bulk indexing was added |

The fresh integration JWT/App Preview gate did **not** complete. Official branch signup required email confirmation and produced no session. A direct SQL Auth fixture produced a GoTrue compatibility error; patching Auth token internals was rejected and not attempted. The fixture and one unconfirmed official-signup user were deleted. The available branch tooling exposed publishable keys but not a branch-only server secret, so no honest Vercel Preview could be configured. No Preview deployment or environment value was created.

Cleanup evidence for the second branch: Auth users, identities, sessions and refresh tokens; legacy drafts/credits; canonical documents/revisions/checkpoints; links/outbox/comparisons; claims/events/quota; and all Point tables were each verified at 0. The branch was deleted and the branch list returned only default `main`.

### Protected App Preview E2E (retained baseline branch)

The final application gate used branch `odrdlsrdlmtjczhmsbnj` (ID `5ce82f14-2a98-4f23-9022-8ece9ff2397b`), which Supabase identified as non-default, `with_data=false` and parented to `adocsnwnslxhxcjgbyee`. Both migrations were present. Production database, Vercel target and alias were not changed.

| Gate | Result |
|---|---|
| Guard on, parser-valid save | unchanged legacy 200/save behavior plus one `PROJECTED` canonical revision |
| Shadow read | metadata-only comparison returned `MATCH`; canonical content was not served to the browser |
| Idempotency replay | same request/key reused the existing projection and did not add a revision |
| Owner isolation | provider B saw and affected zero provider A legacy/canonical resources |
| Master kill switch | legacy Save succeeded while shadow links/documents/revisions/outbox/comparisons stayed unchanged |
| Model/cost | zero OpenAI calls; existing legacy credits and every Point table remained unchanged |
| Projection failure evidence | parser/adapter failure is caught at the projection boundary and logs only `PROJECTION_ERROR` plus non-content status metadata |
| Cleanup | A/B Auth users and all test-tagged rows were verified at zero; five test deployments and six activation/test env values were removed |

The owner intentionally retained the empty branch as a dedicated Preview schema baseline. Preview base URL and the two existing branch keys remain configured; the keys were checked only for non-empty presence and were never printed. Activation flags are absent. The temporary env-pull file was deleted and verified absent. Production alias remained on its pre-cleanup deployment. Final database hardening was forward-applied under registry versions `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048`. A real synthetic pre-identity row was backfilled from its link, an unidentifiable orphan was tombstoned and owner-hidden, a simulated historical PURGED row remained terminal, a simulated missed tombstone appeared as metadata-only `SOURCE_DELETE_CLEANUP_PENDING` without owner visibility, and a same-ID/new-generation ABA fixture proved write-free replay and generation isolation. The fixtures were removed, and the updated foundation/integration assertions passed in rollback transactions. Every Auth/legacy/canonical/integration/Point count remained zero. The earlier protected deployment predates the revised route bundle and is not route-level promotion evidence for it.

This does not prove a live, data-bearing cross-migration upgrade. The `20260810072017` to `20260810072952` boundary is not atomic, and a pre-existing PURGED row's original `updated_at` cannot be reconstructed after the corrective update without snapshot evidence. Production testing must start from a zero-row preflight under a maintenance/snapshot gate, or use a separately reviewed transactional/squashed plan and restoration manifest.

### Existing coverage by requirement area

| Area | Current evidence | Related V1 IDs actually supported |
|---|---|---|
| Auth and redirects | `src/app/auth/actions.test.ts`, `src/app/auth/callback/route.test.ts`, `src/lib/google-oauth.test.ts`, server-auth/session tests | `AI-AUTH-001` partial, `AI-AUTH-002` partial, `AI-AUTH-003`; `APP-AUTH-001/002/006/008` partial/reusable |
| Role navigation/deny | `src/components/app-shell.test.tsx`, `src/lib/referral-workspace-auth*.test.ts`, admin/provider page tests | `AI-PERM-001/002` partial; `APP-NFR-001` partial |
| Browser privacy | `src/lib/ndis-case-note-browser-privacy.test.ts`, Companion component tests | `AI-PRIV-001`, `AI-IN-001` partial; `APP-NOTE-010/015` partial |
| Server minimum facts/privacy | NDIS route, request and companion tests | `AI-IN-003`, `AI-PRIV-002`; `APP-NOTE-014/015` partial |
| Structured output/safety | `src/lib/openai-ndis-case-note.test.ts`, `src/lib/ndis-case-note-companion.test.ts` | `AI-TYPE-004`, `AI-GEN-005/006/009` partial; `APP-NOTE-004/018/019` partial |
| Credit transaction/idempotency | `src/lib/account-credit-store.test.ts`, NDIS route tests, migration contract assertions | primitive for `AI-GEN-002/004/007`, `AI-PTS-006`; `APP-PTS-003` reusable |
| Claims/save/owner isolation | Companion store/save/draft route tests, generated material store tests | `AI-DOC-006` partial; `APP-DOC-001` partial |
| Metadata-only telemetry | event route/store and pilot funnel contract tests | `AI-DATA-005/006`, `AI-NFR-009` partial; `APP-NFR-002/012` partial |
| Locale/UI/visual structure | i18n, page, brand font, shell and Companion component tests | current `en`/`zh-Hans` only; V1 `zh-Hant` remains untested/conflicting |
| SEO boundary | `src/app/seo-policy.test.ts`, page metadata tests | confirms AI noindex and Core SEO ownership; not an App V1 capability |
| Legacy regression | provider drafts, guided materials, outreach, referral/profile tests | protects Web legacy scope; does not satisfy five Note/App requirements |
| V1 transport, privacy and route contract | `src/lib/v1/shared-contracts.test.ts`, `openapi-shadow-contract.test.ts`, `transport-contract.test.ts`, `product-api-route.server.test.ts`, `privacy-review-scanner.server.test.ts`, `privacy-review-route.server.test.ts`, `privacy-review-memory.test.ts` | three locales, five Note codes, version/min-client/correlation/error headers, scanner/locator/no-leak/proof-binding behavior and default-off routes; no Production-served API |
| Canonical document shadow | `src/lib/v1/canonical-document-shadow.test.ts` | owner deny, immutable revision sequence, stale base, full-request idempotency, checkpoint, self-review invalidation and tombstone/purge domain rules |
| Points shadow | `src/lib/v1/points-shadow.test.ts` | lot ordering/expiry, quote boundaries, reserve/commit/release, replay, insufficient balance and cross-owner deny in memory |
| Legacy NDIS projection | `src/lib/v1/legacy-ndis-adapter.test.ts` | deterministic read-only projection, no approval upgrade, no invented facts and metadata-only migration candidate |
| Production-unapplied SQL boundary | `src/lib/v1/v1-shadow-migration-contract.test.ts`, `mobile-sync-migration-contract.test.ts`, isolated historical guarded-live evidence | additive/no legacy DML, owner isolation and explicit grants are source-checked; the new mobile-sync migration/assertions are unapplied and unexecuted |
| Runtime isolation | `src/lib/v1/runtime-boundary.test.ts` | audited NDIS routes and the new `/v1` adapter are the only allowed server boundaries; `/v1` remains disabled without explicit adapters |

### Current live/read-only evidence

- Supabase migrations, tables, RLS flags, policies, grants, function grants and aggregate row counts were checked read-only.
- Vercel production deployment/SHA and runtime error aggregates were checked read-only.
- Synthetic users and shadow fixtures existed only on isolated branches and were fully cleared; no Production user/data was read or changed.
- The protected App Preview gate used zero model calls. Temporary Preview flags/deployments were removed afterward; the clean isolated branch was retained by owner decision, and Production remained unchanged. The then-current NDIS post-review hardening passed on that retained branch, but the later exact catalog/private-schema/provider-session hardening and route bundle postdate that evidence and must receive a new same-revision protected Preview before promotion.

## Proposed

The following suites are required before the corresponding V1 slice can be called implemented.

### Contract and compatibility

- Parse/lint the new contract-only OpenAPI and add generated Web/App SDK fixtures; current tests check vocabulary/absence of a production server but do not parse or serve it (`AI-FND-001/002`, `AI-NFR-010`, `APP-COMPAT-001`).
- Stable error envelope, locale/fallback, idempotency and correlation tests (`AI-NFR-008/009`, `APP-NFR-007/012`).
- Current plus previous two client schema compatibility and force-upgrade response tests.

### Identity and permission

- Microsoft/Apple and confirmed identity-linking tests; duplicate/relay email cases (`AI-AUTH-001/002`, `APP-AUTH-002/003`).
- Device registry, revoke-one/revoke-all, token refresh and high-risk reauth tests (`AI-AUTH-004/005`, `APP-AUTH-004-007`).
- Every target private table: owner A CRUD, owner B deny, admin deny/body isolation, revoked-session deny and service-role grant inspection (`AI-PERM-001/002`, `APP-NFR-001`).
- Repeat provider A/B JWT owner-RLS checks with the integration migration present, using confirmed branch users created through a supported Auth path. The second branch could not satisfy email confirmation without bypassing Auth.

### Five Note types and privacy

- Independent schema/minimum/output/facts/safety golden sets for all five types (`AI-TYPE-001-005`, `APP-NOTE-001-005`).
- Disposable-database and protected-Preview confirmation of the source-tested
  `privacy_review_id` owner/type/canonical-hash/schema/status/expiry/revision
  binding and locator-only failure envelopes (`AI-PRIV-003/004`).
- English/zh-Hans/zh-Hant parity, mixed-language input and explicit fallback tests (`AI-IN-002`, `AI-GEN-005`, `APP-NFR-007`).
- Incident-specific refusal tests for reportability, safeguarding, blame, risk rating and regulatory conclusions.

### Canonical documents and recovery

- Promote the tested memory document rules into database/server integration: first-input creation, accepted revision/save ack, base-revision 409, restore-as-new-revision and tombstone propagation (`AI-DOC-001/002/008-013`, `APP-SYNC-001-010`).
- Browser recovery buffer and native encrypted DB/outbox lifecycle tests, including kill process, token expiry and network switch (`APP-OFF-001-003`).
- Generation job close/reopen/cross-device recovery and exactly-once persistence/settlement tests (`AI-GEN-003/004/007`).

### Points and Billing

- Add concurrent SQL transaction races for reserve/commit/release and rate-version rollover. The isolated serial RPC/RLS matrix has passed, but concurrency remains unproved (`AI-PTS-001-007`, `APP-PTS-001-005`).
- Legacy-credit migration replay/reconciliation/rollback tests (`AI-MIG-002/003`).
- Stripe/Apple/Google receipt uniqueness, webhook replay, restore, refund/revoke and daily reconciliation tests (`AI-ENT-001`, `AI-BILL-001-005`, `APP-PAY-001-005`).

### Export

- Same revision rendered to DOCX/PDF/TXT/Copy with stable order, draft labels and no internal fields (`AI-DOC-007/014-018`, `APP-DOC-005-010`).
- Safe filename, short-lived unguessable URL, expired/revoked/cross-owner deny, cancellation cleanup and batch partial-retry tests.

### Content, actions and notifications

- Published/corrected/withdrawn content state, source/checked-date/translation completeness and CDN invalidation tests (`AI-LIB-001-005`, `AI-PUB-001-003`).
- Save/Follow/Guide progress/version migration/checklist/reminder sync tests (`AI-ACT-001`, `AI-REM-001`, `AI-GUIDE-001-003`).
- Daily Brief eligibility/explanation/no-empty-message and Note-content exclusion tests (`AI-BRIEF-001`, `APP-LIB-013/014`).
- Safe push payload, preferences, timezone/DST, frequency cap, inbox deep link, fatigue and withdrawal tests (`AI-NTF-001-007`, `APP-NTF-001-011`).

### Data control and operations

- Reauthenticated account export/delete, processor cleanup, legal-hold exception and subscription-separation tests (`AI-DATA-001-004`, `APP-DATA-001-003`).
- PITR restore drill proving no duplicate document revisions or ledger commits (`AI-NFR-005`, `APP-NFR-010`).
- Cost telemetry/redaction, budget threshold/kill switch and validated-model fallback tests (`AI-COST-001-007`).
- iOS/Android accessibility, secure storage, backup exclusion, app-switcher, crash/network and store review matrix tests.

## Gaps

1. No native App exists, so no iOS/Android unit, integration, E2E, accessibility, offline, purchase or store tests exist.
2. The OpenAPI/TypeScript contract and default-off durable `/v1` route adapter now exist, but there is no Preview- or Production-served Product API, generated client package, schema registry or previous-version compatibility fixture.
3. The current worktree passes 938 tests across 107 files (with 104 / 894 and 103 / 831 retained as prior source-level batches and 90 / 653 as the historical baseline), but the four additional Note types have only catalog metadata/prohibited-decision contracts, not input/output/privacy/generation golden sets.
4. Canonical document/revision/checkpoint states exist as memory/domain contracts plus historical isolated schema/RPC evidence and a new unapplied mobile-sync migration draft; there is no Production schema activation, editor, renderer or cross-device recovery E2E.
5. Points lots/rates/reservations passed isolated serial database tests but remain shadow-only. There is no runtime entitlement integration, welcome eligibility decision, concurrent reservation proof or legacy-credit conversion/reconciliation test.
6. No payment provider sandbox, webhook replay, refund or reconciliation harness exists.
7. No content editorial state, Guide, Daily Brief, notification or email/cron service exists.
8. No signed PIA/data-map/subprocessor/NDB evidence is represented in automated tests.
9. Current production refresh-token errors need a reproducible stale-cookie/session recovery test before V1 release.
10. Build/test success is not a production V1 greenlight; migration, Preview/live safety and explicit owner approval remain mandatory.
