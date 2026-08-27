# CaresLink AI Variables

> Variable inventory audited from code on 2026-08-16. No secret values are recorded here. Product Baseline V1 target variables are not configured or authorized by this document.

## Classification

- **Public**: may be bundled only when intentionally browser-safe (`NEXT_PUBLIC_*`).
- **Server configuration**: non-secret but server-controlled; changing it can change behavior.
- **Server secret**: must remain in encrypted deployment/runtime storage and never be logged, copied into client code or committed.
- **Platform-provided**: supplied by Vercel/Node; application should not invent values.

## Current Supabase variables

| Variable | Class | Purpose / precedence | Failure behavior |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | browser/server project URL | auth and data paths fail closed |
| `SUPABASE_URL` | Server configuration | server override for project URL | server stores fail closed |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | preferred browser-safe key | auth unavailable if no supported key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | legacy browser-safe fallback | same |
| `SUPABASE_PUBLISHABLE_KEY` | Server configuration | server publishable fallback | same |
| `SUPABASE_ANON_KEY` | Server configuration | legacy server fallback | same |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | claims, quota, telemetry, server stores and RPCs | production private writes fail closed |

Optional table-name overrides currently recognized:

- `SUPABASE_PROVIDER_DRAFTS_TABLE`
- `SUPABASE_GENERATED_MATERIAL_DRAFTS_TABLE`
- `SUPABASE_GENERATED_MATERIAL_EVENTS_TABLE`
- `SUPABASE_NDIS_CASE_NOTE_CLAIMS_TABLE`
- `SUPABASE_TEMPLATE_COMPANION_EVENTS_TABLE`
- `SUPABASE_ACCESS_REQUESTS_TABLE`
- `SUPABASE_ACCESS_CODES_TABLE`
- `SUPABASE_AI_USAGE_EVENTS_TABLE`
- `SUPABASE_OUTREACH_TABLE`

Table overrides are server configuration. Production should normally use migration-defined defaults; an incorrect override can point code at an unreviewed schema.

## Current OpenAI and cost controls

| Variable | Class | Current role | Release note |
|---|---|---|---|
| `OPENAI_API_KEY` | Server secret | OpenAI Responses API | rotate on exposure; never `NEXT_PUBLIC_*` |
| `OPENAI_MODEL` | Server configuration | common fallback model | model change requires full safety/language/eval gate |
| `OPENAI_NDIS_CASE_NOTE_MODEL` | Server configuration | NDIS-specific override | falls back to `OPENAI_MODEL`, then audited code default |
| `OPENAI_PROFILE_REWRITE_MODEL` | Server configuration | legacy profile material | outside App V1 Note entitlement |
| `OPENAI_SHARE_CARD_MODEL` | Server configuration | legacy share card | outside App V1 Note entitlement |
| `OPENAI_REFERRAL_MESSAGE_MODEL` | Server configuration | legacy referral message | outside App V1 Note entitlement |
| `OPENAI_BILINGUAL_INTRO_MODEL` | Server configuration | legacy bilingual intro | outside App V1 Note entitlement |
| `OPENAI_HANDOVER_CHECKLIST_MODEL` | Server configuration | legacy checklist, not Handover Note | must not be treated as V1 Note catalog |
| `NDIS_CASE_NOTE_FINGERPRINT_PEPPER` | Server secret | pseudonymous account/IP quota hashes | rotation changes hash identity; use dedicated secret |
| `NDIS_CASE_NOTE_AUTH_DAILY_LIMIT` | Server configuration | current account abuse cap; default 3 | separate from legacy credit balance |
| `NDIS_CASE_NOTE_AUTH_IP_DAILY_LIMIT` | Server configuration | current IP abuse cap; default 20 | shared-network trade-off |
| `GUIDED_AI_RATE_LIMIT_PER_MINUTE` | Server configuration | legacy guided material burst limit; default 6 | not a Points rate |

Communication Note M1e/M1f deliberately add no model, endpoint, token-budget or
runner environment variable. The inactive synthetic-Preview contract is
source-bound to `gpt-5.4-mini-2026-03-17`, the closed AU-storage Responses
endpoint profile, the literal request/manifest/plan/runner digests and fixed
budget values; `OPENAI_MODEL` and every legacy override above are rejected as
fallbacks. The paid factories stay unavailable and accept neither an API key
nor a network transport. The contract-test factory accepts arbitrary trusted
test callbacks, which are not a credential or network security boundary. The
runner has no built-in API-key lookup, approved paid snapshot, durable approval
claim or runtime importer.

Communication Note M1g-a likewise adds no environment variable. It source-binds
wire version `wire.communication.openai.responses.2026-08-27.m1g-a.v1`, body-pin
version `pin.communication.openai.synthetic-request-body.2026-08-27.m1g-a.v1`,
bundle digest
`90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8`,
runner version
`runner.communication.openai.synthetic-preview.2026-08-27.m1g-a.v2` and runner
digest
`a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4`
in source. No API-key, signing-key, signer, external-approval, endpoint override
or runtime-enablement variable is introduced. The pin is
`UNATTESTED_SOURCE_PIN_ONLY`, is `NOT_EXECUTION_AUTHORITY` and cannot be promoted
through environment configuration.

Communication Note M1g-b also adds no environment variable. Authority policy
digest
`7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9`
is literal-pinned in source. The approved external-owner signing-key snapshot,
approved CaresLink receipt-signing-key snapshot and both readiness latches are
respectively `undefined`, `undefined`, `false` and `false`. A trusted owner key,
receipt key, claim token, database role credential, temporary OpenAI key,
provider request/response identifier or activation switch must not be added as
an ordinary environment fallback. The source-only verifier accepts an
explicitly injected external trust-registry snapshot for tests/support; that
snapshot must enforce the disjoint owner/receipt purpose and, for owner keys,
the exact owner/tenant scope. Injection is not an approved runtime registry or
execution authority. M1g-b
therefore cannot be activated by setting `OPENAI_API_KEY`, `OPENAI_MODEL` or any
existing CaresLink flag.

## Current auth, URL and feature variables

| Variable | Class | Purpose | Boundary |
|---|---|---|---|
| `CARESLINK_GOOGLE_OAUTH_ENABLED` | Server configuration | honest Google OAuth release gate | provider must also be configured in Supabase/Google |
| `NEXT_PUBLIC_CARESLINK_AI_BASE_URL` | Public | canonical AI origin and safe callbacks | exact origin; no BOM/whitespace |
| `NEXT_PUBLIC_APP_URL` | Public | legacy/base URL fallback | internal redirect allowlist still applies |
| `NEXT_PUBLIC_SITE_URL` | Public | optional public URL fallback in existing config/docs | must be an expected CaresLink origin |
| `APP_URL` | Server configuration | server URL fallback | no open redirects |
| `CARESLINK_PROVIDER_DRAFT_ALLOWED_ORIGINS` | Server configuration | comma-separated Core handoff origins | exact allowlist only |
| `CARESLINK_ENABLE_DEMO_AUTH` | Server configuration | local/test demo auth | must be false/unset in production |
| `NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV` | Public feature setting | local legacy navigation | must be false/unset for real users |
| `CARESLINK_ALLOW_COMPANION_MEMORY_STORE` | Server configuration | development-only store fallback | production code rejects missing durable store |
| `CARESLINK_V1_PRODUCT_API_ENABLED` | Server configuration | master gate for the local shared `/v1` route adapter | only exact `true` passes the first application gate; default/unset is off |
| `CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED` | Server configuration | independent gate for request-scoped Supabase persistence and active-session validation | only exact `true`; also requires the master gate, verified Preview target, server configuration, the unapplied database migration and its separate default-off database flag |
| `CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF` | Server configuration | binds the Product API runtime to one reviewed Preview branch | must exactly match the ref parsed from the server Supabase URL; missing/mismatch, non-Preview Vercel environment and the known Production ref all fail closed before any client is created |
| `CARESLINK_V1_PRODUCT_API_M0_READ_ENABLED` | Server configuration | operation gate for only `GET /v1/me`, `GET /v1/documents` and `GET /v1/sync/pull` | exact `true` is insufficient alone and remains `false` in the example; it never enables detail or writes |
| `CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED` | Server configuration | future independent gate for `GET /v1/documents/{id}` | default/unset is off; not part of the Mobile M0 read slice |
| `CARESLINK_V1_PRODUCT_API_PRIVACY_REVIEW_ENABLED` | Server configuration | future independent gate for atomic privacy review | default/unset is off; also requires the dedicated Preview service role and DB evidence |
| `CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED` | Server configuration | future independent gate for create/PATCH/checkpoint/tombstone | default/unset is off; current database write RPC grants remain withheld |
| `CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY` | Server secret | dedicated key for the atomic privacy-review confirmation RPC on one reviewed Preview target | unset by default; no fallback to `SUPABASE_SERVICE_ROLE_KEY`; the runtime repeats the exact non-Production Preview/ref guard before creating this privileged client |
| `CARESLINK_V1_NATIVE_AUTH_ENABLED` | Reserved server configuration name | future Preview-only native PKCE/session/device/revoke gate | **do not configure**; default/unset is off and the compile-time implementation latch is `false`, so even exact `true` cannot enable a token exchange or revoke runtime |
| `CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF` | Reserved server configuration name | future exact-ref binding for the native-auth Preview boundary | **do not configure**; currently used only by injected static tests, and no matching ref can bypass the compile-time disabled latch or target Production |
| `CARESLINK_PORTAL_REFERRAL_API_ENABLED` | Server configuration | master gate for the Portal Referral route slice | only exact `true`; default/unset is off and is insufficient without every other Portal gate |
| `CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED` | Server configuration | independent gate for the request-scoped cookie Supabase adapter | only exact `true`; no memory fallback and no `service_role` fallback |
| `CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED` | Server configuration | operation gate for only source referral list and create | only exact `true`; it does not enable source detail or any later workflow operation |
| `CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED` | Server configuration | independent operation gate for an authenticated referral source to read one referral created by its own organization | only exact `true`; the base/durable gates and exact disposable-Preview ref must also pass; it does not enable intake, triage, offer, response, follow-up or audit |
| `CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED` | Server configuration | independent operation gate for operator assignment queue/detail, triage, provider candidates and offer | only exact `true`; the base/durable gates and exact non-Production Preview ref must also pass. Because Assignment M1a still shares `/referrals` with source-role pages, its page latch also requires the intake and source-detail UI gates to be off; API operation authorization remains independent. It does not enable intake, source detail, provider accept/decline, follow-up, audit, document/export or assignment acceptance |
| `CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_ENABLED` | Server configuration | independent operation gate for an approved provider member's metadata-only offer inbox and ACCEPT/DECLINE response | only exact `true`; the base/durable gates and exact non-Production Preview ref must also pass. It does not inherit Assignment, Intake or Source Detail authorization and does not enable private provider detail, follow-up, audit, notification, document/export or Note/Points operations |
| `CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_ENABLED` | Server configuration | independent operation gate for an approved provider member to read one exactly assigned accepted referral and record a fixed-code follow-up | only exact `true`; the base/durable gates and exact non-Production Preview ref must also pass. It does not inherit Provider Response, Assignment, Intake or Source Detail authorization and does not enable history, scheduling, free text, audit listing, notifications, document/export or Note/Points operations |
| `CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF` | Server configuration | binds the Referral runtime to one reviewed disposable Preview branch | must exactly match the ref parsed from the server Supabase URL; non-Preview, missing/mismatch and the known Production ref fail closed before client construction |
| `CARESLINK_V1_SHADOW_ENABLED` | Server configuration | master NDIS shadow kill switch | exact `true`; insufficient alone; unset/off outside disposable Preview |
| `CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED` | Server configuration | permits post-legacy-save projection | exact `true`; requires master + `VERCEL_ENV=preview` + verified branch ref |
| `CARESLINK_V1_NDIS_SHADOW_READ_ENABLED` | Server configuration | permits metadata-only hash/status comparison | exact `true`; cannot enable independently of dual-write |
| `CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF` | Server configuration | binds the runtime to the one approved development branch | non-secret project ref; must equal the ref parsed from server Supabase URL and must not be Production |
| `CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS` | Server configuration | bounds shadow latency after legacy success | optional, clamped 250-5000 ms; default 1500 ms |

The two reserved native-auth names are intentionally absent from `.env.example` because the capability is not activatable. Adding placeholders would incorrectly imply that configuration is an approved next step. Their guard tests use synthetic in-memory objects only; no deployment environment or secret is read.

The database capability rows `referral_workflow_v1`, `referral_intake_v1`,
`referral_source_detail_v1`, `referral_assignment_v1` and
`referral_provider_response_v1` and `referral_follow_up_v1` are separate Portal
gates. Migration source defines all six rows as
`enabled=false, preview_only=true`; none of the
operation migrations activates a row. Direct Data API calls require master plus
their matching operation row, so
intake, source detail, assignment, provider response and follow-up cannot open
one another. Assignment, Provider Response and Follow-up introduce no new
secret.

The privacy proof TTL is a code/contract constant of 1800 seconds for this
temporary Preview gate. It is not configured through an environment variable
and is not a Production retention or product decision.

## Platform-provided variables

`NODE_ENV`, `VERCEL_ENV`, `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are used for secure cookies and deployment-aware internal callback origins. Deployment-specific values must not be copied between Preview and Production by hand.

## Secret handling and rotation

| Secret | Rotation impact | Minimum response |
|---|---|---|
| Supabase service role | all server-side private data/RPC access | revoke/rotate, redeploy, audit server logs and privileged actions |
| Dedicated Preview privacy-review key | Preview-only proof issuance | revoke/rotate, keep the Product API gates off, inspect metadata-only proof issuance and redeploy only to the exact reviewed Preview |
| OpenAI API key | model access and spend | rotate, check provider usage/cost, redeploy |
| fingerprint pepper | pseudonymous quota identity | rotate, expect counters to start a new hash epoch, record change metadata |

Publishable Supabase keys are not secrets, but their RLS boundary must be treated as hostile-client accessible. OAuth client secrets are managed by Supabase/Google and must not be read into application logs or this inventory.

The protected App Preview gate used branch-specific configuration for non-default branch `odrdlsrdlmtjczhmsbnj`; no Production secret was read or copied and no secret value was written to repository or evidence. After E2E, Preview `NEXT_PUBLIC_SUPABASE_URL` was fixed to that branch, the two existing branch key values were left unchanged, and a controlled audit checked only presence/non-empty state. The six temporary activation/test variables were removed. The retained base connection is inactive because the master/dual-write/read flags are absent. Any future activation must repeat the exact Preview/ref guard and cleanup sequence in `documentation/ndis-shadow-preview-runbook.md`.

The mobile-sync migration also defines a database-side `mobile_sync_v1` feature flag that defaults off. It is not an environment variable and the migration has not been applied; setting the application flag alone cannot create a durable or served Product API.

## Intended V1 configuration (mostly not present)

The following are configuration **categories**, not approved variable names or current environment entries:

- Product API version/minimum client version and additional feature flags; the local `/v1` master/durable gates and NDIS shadow flags are defined but remain unset/off, while the mobile-sync database migration and flag remain inactive;
- canonical Note schema/privacy/prompt/model/parser policy versions;
- Points rate catalog version and quote/reservation TTL;
- generation/transcription/export queue and artifact TTL;
- cloud transcription provider limits/retention;
- Stripe/Apple/Google product and webhook verification configuration;
- content publication/CDN version and withdrawal controls;
- notification provider, quiet-hours scheduler and per-category kill switches;
- retention/tombstone/export/deletion workflow controls;
- cost budgets, alert thresholds and validated-model kill switches.

These must be introduced only with their owning contract, test and production-change approval. Billing or provider secrets must never be invented from placeholders.

## Go-live checklist

1. Confirm target Vercel project/scope without printing values.
2. Confirm public origins are exact HTTPS origins, trimmed and BOM-free.
3. Confirm all secrets are server-only and absent from client bundles, logs and git diff.
4. Confirm demo/memory fallback flags are false in Production.
5. Confirm Google button is shown only when provider configuration and callback allowlist are live.
6. Confirm Supabase project and applied migration set match the release manifest.
7. Run auth/role/owner/privacy/Points negative smoke before any model call.
8. Record model/policy/rate versions and kill-switch owner.
9. Production must have all V1 shadow flags unset/false; the code additionally denies `VERCEL_ENV=production` and the known Production Supabase ref.
10. Do not add Points/Billing variables or promote the shadow schema until a separate Production approval is issued.
