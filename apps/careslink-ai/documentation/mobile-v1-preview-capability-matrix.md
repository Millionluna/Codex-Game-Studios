# Mobile V1 Preview Capability Matrix

This document separates local contract and handler evidence from database draft,
historical protected Preview and Production evidence for contract version
`1.0.0-shadow.1` and Note schema version `2026-08-09.v1-shadow`.
Nothing in this matrix authorizes a Production migration or deployment.

## Current status

- The TypeScript transport contract, OpenAPI document and default-off `/v1`
  handlers exist locally and pass source-level tests.
- Mobile uses `Authorization: Bearer` only. Cookie authentication is an
  additional Web transport through the same request-scoped shared adapter; it
  is not part of the Mobile transport contract.
- The canonical documents, revisions, checkpoints, sync and privacy migrations
  remain Production-unapplied. An earlier reviewed snapshot of the route and
  migration chain passed a protected non-Production Preview on 2026-08-14; its
  database and application feature flags are now off. The current committed
  hardening delta is source/static-tested only and has not been re-applied.
- In the current migration source, authenticated execute is granted only for
  list, get and pull; that exact revision has not been re-applied. The exact four
  write RPC grants were enabled only inside the earlier guarded E2E window, then
  revoked and proved absent.
- A physical `POST /v1/privacy-reviews` handler now performs an authenticated,
  atomic source-level confirmation behind the same default-off Preview gates.
  Its privileged RPC client accepts only a dedicated Preview privacy key and
  never falls back to the general service-role variable.
- A protected disposable Preview passed the Product API route matrix on
  2026-08-14. The original action then failed closed during deployment cleanup;
  one separately reviewed recovery-only action deleted the Preview with three
  joint absence samples and completed the final zero audit. There is no currently
  served Preview base URL; the retained non-Production Supabase schema baseline
  remains default-off and empty of synthetic users and Product data.
- Five physical native-auth routes return fixed structured `501` envelopes, but
  their capability constants remain `false`. Native PKCE callback,
  session/device inventory and revoke-one/revoke-all remain disabled boundaries;
  physical routes and session-row checks do not make those capabilities served.
- Production has no served Mobile V1 Product API evidence. The application
  flags remain default-off and the new migrations remain unapplied there.

## Capability matrix

The historical Preview column records behavior observed from the reviewed
pre-hardening snapshot. It is not execution evidence for the current committed
migration blobs.

| Capability | Local handler / contract | Migration / RPC draft | Historical protected Preview evidence (2026-08-14; deployment removed) | Production |
|---|---|---|---|---|
| Contract, version and headers | OpenAPI and TypeScript define contract `1.0.0-shadow.1`, client/min version `1.0.0`, correlation ID, idempotency and structured error envelopes | RPC DTO parsing is represented in the local adapter and static migration checks | Verified on the protected 2026-08-14 Preview; deployment removed after the gate | Not served |
| `GET /v1/me` | Handler and auth/session boundary exist; both application flags default off | The current draft keeps `resolve_v1_shadow_session_status` service-role-only and adds the stricter eligible-provider session helper; it has not been re-applied | Two real synthetic sessions and one revoked JWT path passed on the earlier baseline; deployment and users removed | Disabled and unapplied |
| Document list/get | Handlers, DTOs, owner-scoped cursors and adapter tests exist | The current draft grants authenticated execute for list/get and revokes direct canonical table reads; it has not been re-applied | Owner-A list/get and owner-B empty/deny paths passed; test rows removed | Unapplied and not served |
| Sync pull and tombstones | Pull is canonical `GET /v1/sync/pull?cursor=`; its contract and opaque owner-bound cursor/tombstone parsing exist. `POST /v1/sync/push` is reserved as `NOT_IMPLEMENTED` with no frozen batch body or served route | The current draft grants authenticated execute for pull and withholds tombstone write execute; it has not been re-applied | Initial cursor `sync.v1:0`, pull/upsert and tombstone/replay passed on the earlier baseline; test rows removed | Unapplied and not served |
| Atomic create plus initial revision | Handler requires idempotency and `privacyReviewId`, then binds the proof to owner, Note type, schema, status, expiry and the canonical hash of `content.factsSummary` | The current draft defines the atomic RPC but withholds its execute grant; the earlier baseline used a temporary guarded grant | Five Note creates plus replays passed; test rows removed | Unapplied and not served |
| `PATCH /v1/documents/{documentId}` revision append and stale-base conflict | Handler requires `privacyReviewId`; adapter maps stale base and idempotency conflicts to structured `409` errors. Changing only `englishDraft` keeps the proof valid; changing `factsSummary` makes it stale. No legacy `/revisions` HTTP route is retained | The current draft defines base-revision checks but withholds write execute; the earlier baseline used a temporary guarded grant | Patch/replay, idempotency conflict and stale base passed; test rows removed | Unapplied and not served |
| Checkpoint | Handler, adapter and replay/conflict contract exist | The current draft defines the RPC but withholds write execute; the earlier baseline used a temporary guarded grant | Checkpoint/replay and aggregate recovery passed; test rows removed | Unapplied and not served |
| Owner isolation | Owner is derived from verified auth; transport bodies do not accept `ownerId` | The current draft derives Product ownership from `auth.uid()` and requires a fresh eligible-provider Auth user plus active session; it has not been re-applied | A/B list, pull and get isolation, owner-A proof reuse deny and three cross-owner writes passed on the earlier baseline; both users removed | No new RLS or RPC applied |
| Authentication transport | Mobile uses Bearer only and keeps the credential in the Authorization header; Web cookie auth is an additional shared-adapter transport with same-origin mutation controls | Both transports reach the same owner-derived RPC surface | Bearer create/proof/sign-in/session/revocation passed; cookie parity was not part of this run | Not served |
| Atomic privacy confirmation | `POST /v1/privacy-reviews` accepts only user-confirmed cleaned structured facts, canonicalises and hashes them, applies deterministic scanner policy `2026-08-11.preview.1`, and returns locator-only `422 PRIVACY_REVIEW_REQUIRED` findings until every current finding is exactly retained with purpose. It never returns excerpts. The scanner is explicitly not a guarantee of complete de-identification. Confirmed proofs use a temporary 30-minute Preview TTL, not a Production product decision | The service adapter sends only owner/session metadata, hash, versions, confirmations, decisions and mutation ID to the service-only RPC contract | Five Note confirmations/replays, owner-A proof reuse by owner B denied, and outbox exclusion passed; proofs removed | Disabled and not authorized |
| Native auth/session/device management | Five physical routes return fixed `501` envelopes with capability `false` | No native PKCE exchange, device registry or revoke-one/revoke-all implementation exists | Physical `501` does not mean served; capability disabled | Capability disabled |
| Points cutover and model calls | Outside this Preview gate | No cutover is authorized by these drafts | Zero model calls and zero Points/Billing activity during the gate | Not authorized |

`handler exists`, `migration drafted` and `source tests pass` must never be
reported as `served`, `Preview E2E passed` or `Production connected`.

## Disposable Preview preflight

Before any live database or route check, record metadata-only evidence that:

1. The exact Supabase target currently exists, is healthy, non-default,
   non-Production, disposable for this run and was created without Production
   data.
2. The target project ref differs from the known Production ref. The ref parsed
   from the target HTTPS Supabase URL exactly equals both the reviewed branch ref
   and `CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF`.
3. The Vercel target is a protected Preview with no Production alias. No current
   Preview base URL may be inferred from an old deployment or a Supabase URL.
4. Migration history and aggregate zero-row counts are captured from the
   disposable target without reading row content. Auth users/sessions, canonical
   Product data, mobile-sync fixtures and Points rows must start at zero.
5. The migration files and rollback assertion file match the reviewed hashes and
   are applied only to the verified disposable project ID. Never rely on an
   implicit CLI link or a URL/credential copied from another environment.
6. The database flag and both application flags begin disabled. No write grant,
   model call, Points cutover or Production configuration change is included.
7. If privacy proof issuance is exercised, the dedicated
   `CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY` is present only on the
   exact protected Preview target; the general service-role key is not used as
   a fallback.

Stop immediately if the target identity is missing or ambiguous, the target ref
matches Production, the URL/ref comparison fails, the branch contains copied or
unexpected data, or a Preview deployment would affect a Production alias.

## Gates required before notifying Mobile or Main to enable

All of the following must pass on the same disposable Preview revision:

1. Migrations clean-apply in timestamp order and the transactional SQL assertions
   roll back every fixture.
2. RLS/grant inspection proves no direct authenticated table writes, service-only
   session resolution, authenticated list/get/pull only, and zero authenticated
   write-RPC execute grants.
3. Real branch JWTs prove owner A/B isolation, `/v1/me`, Mobile Bearer behavior
   and the additional Web cookie parity, replay, stale-revision and idempotency
   conflicts, owner-bound cursors, tombstones and revoked-session cleanup.
4. The protected App Preview returns the frozen version/min-client/correlation
   headers and structured envelopes without putting tokens in URLs, logs,
   analytics, errors or persisted document content.
5. The privacy matrix proves authentication before body parsing, A/B owner
   isolation, idempotent replay/conflict, expiry, every scanner finding type,
   exact UTF-16 locator matching, safe `422` envelopes and no raw/excerpt leak.
6. Test users, sessions and data are removed; aggregate counts return to zero;
   database and application flags return to disabled; the disposable deployment
   and branch are removed unless a new explicit retention decision is recorded.

Even after these gates, write capability remains disabled until a separately
reviewed migration grants the four write RPCs after canonical-hash vectors,
server-equivalent Note validation and privacy-proof binding have passed. Native
PKCE/session/device/revoke remains disabled until its own frozen contract,
implementation and Preview evidence exist.

## Evidence sources

- `contracts/careslink-v1-shadow.openapi.yaml`
- `src/lib/v1/transport-contract.ts`
- `src/lib/v1/product-api-runtime.server.ts`
- `src/lib/v1/product-api-supabase.server.ts`
- `src/lib/v1/privacy-review-scanner.server.ts`
- `src/lib/v1/privacy-review-route.server.test.ts`
- `src/lib/v1/privacy-review-memory.test.ts`
- `supabase/migrations/20260810131648_add_v1_mobile_sync_shadow.sql`
- `supabase/tests/v1_mobile_sync_shadow_assertions.sql`
- `documentation/ndis-shadow-preview-runbook.md`
- `documentation/mobile-v1-preview-e2e-runbook.md`
- `documentation/tests.md`
- `scripts/preview-e2e/deployment-cleanup-policy.mjs`
