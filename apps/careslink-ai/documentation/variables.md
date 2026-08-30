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

Communication Note M1g-c adds no environment variable and does not reuse
`OPENAI_API_KEY` for the bounded synthetic evaluation. Its server-only contract
accepts three explicitly injected, purpose-separated references: an external
owner-verification candidate snapshot containing only public verification
material; a digest of an opaque non-exportable CaresLink receipt-signer custody
reference; and a digest of a temporary, project-scoped OpenAI service-account
API-key reference. The raw receipt private key and raw provider bearer
credential are not valid contract values and must never be placed in a public
variable, repository file, database row, log, DTO or evidence artifact. The
candidate registry hashes are not an authenticated source, digest-to-bytes,
freshness or complete-revocation proof.

The M1g-c policy version
`custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1` and digest
`1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438`
are literal source values, not configuration. The approved custody snapshot is
`undefined` and both readiness latches are literal `false`. The four database
caller shells likewise require no password or URL: they are `NOLOGIN`
privilege bundles only. A future login-capable identity,
membership, secret-manager/KMS resolver, Preview-project binding, credential
rotation/expiry and teardown configuration all require separate review and are
not represented by placeholders in `.env.example`. A caller-supplied identity
HMAC is correlation/scope evidence and must not be treated as database or Auth
authentication.

Communication Note M1g-d also adds no environment variable. Its server-only,
pure `TEST_ONLY` validator accepts explicitly injected content-free candidate
evidence and cross-binds M1g-b authorization, M1g-c custody, six provider
evidence hashes, the exact 36-entry migration manifest and six database digest
pins, four caller-identity candidates, receipt-key lifecycle/teardown and the
18-review plan. It performs no environment
lookup, fetch/SDK call, secret/KMS/HMAC resolver, database connection or hosted
operation. A valid result remains `activationReady=false`; the live factory
always throws, the existing eight readiness constants remain `false` and the
existing six approved values remain `undefined`.

All receipt/provider/database/review observations must equal the exact
candidate/registry timestamp and follow authorization/credential issuance.
Database target/Production project-reference HMACs share a declared
purpose/version/key-reference and must differ, while every caller asserts no
superuser/role/database/replication/bypass-RLS attributes, no extra membership
and no direct table/sequence/function privilege. These are injected candidate
claims only, not authenticated control-plane inventory or PostgreSQL catalog
evidence; no environment variable can upgrade them into activation authority.

Its preflight version and literal policy digest are
`preflight.communication.openai.synthetic-preview.2026-08-29.m1g-d.v2` and
`791a4d893afd4e490ab0164a8f604589bcf8015d25e5723b4df210f8c0b44f67`.
They are source-integrity bindings, not configuration or approval.

The M1g-d service-account descriptor states
`providerEnforcedExpiry=ABSENT`. Its `operationalExpiresAt` and `teardownBy`
timestamps are CaresLink-controlled deletion deadlines, not a provider TTL and
not authorization to resolve the credential. The US$0.25 provider hard spend
limit requires a monthly interval and enforcing status, but remains a defence-
in-depth control rather than the per-run cap; the separate
six-slot, one-attempt, no-retry/no-fallback 250,000-micro-USD application limit
still applies. No M1g-d value belongs in `.env.example`, and no ordinary
environment variable can remove its five fixed activation blockers.

Communication Note M1g-e also adds no environment variable or secret name.
Its policy version
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-e.v2` and
digest
`4649f620bc60425d5ca40d308d167110befd4a29c772e9877ddbeac5eaaa3531`
are literal source-integrity bindings. They do not configure the registration,
six-slot runner preflight, five-minute claim window, reservation/transport,
receipt/persistence or runner-acceptance sequence. The only callable surface
validates an explicitly injected, content-free test transcript. It does not
resolve the M1g-c database identities, claim token, HMAC keys, receipt private
key, OpenAI credential or Supabase target; it does not call a database, KMS,
provider or transport. The live coordinator factory always throws.

Communication Note M1g-f likewise adds no environment variable or secret name.
Its terminal policy version
`policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1`
and digest
`4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a`
bind a source-only database contract. The terminal executor has no fifth caller,
login, credential, membership or runtime execute authority. No environment
value can manufacture those missing custody/runtime boundaries or a trusted
terminal row; `DURABLE_RUNNER_TERMINAL_STATE_ABSENT` remains a runtime-evidence
blocker, not configuration.

No environment value may supply or infer a database-attested reservation
timestamp. The M1g-f source migration returns the stored `reserved_at`, but no
trusted runtime invokes that result or supplies it to M1g-e. M1g-e output remains
`coordinatorReady=false`, `activationReady=false` and
`dispatchCapability=ABSENT`, with pre-run approval and post-run acceptance
false. Nothing from this batch belongs in `.env.example`.

Communication Note M1g-g is the source-only successor to M1g-f and also adds
no environment variable or secret name. It selects an independent Ed25519
terminal trust root with purpose `CARESLINK_RUNNER_TERMINAL` and domain
`CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL`, adds the fifth dormant
`careslink_v1_preview_runner_terminal_caller` shell and replaces the unsigned
two-argument terminal RPC with the signed three-argument boundary. The new
signed-terminal runtime and PostgreSQL ports accept only explicitly injected
test dependencies; they create no connection, inspect no environment and
resolve no key, credential or HMAC secret.

The terminal private signing key must not be exported into an ordinary
environment variable. A string in the environment cannot become an approved
purpose-scoped signing-key snapshot, M1g-c custody/trust-registry observation
or valid signature. Likewise, a database username/password or token value in
the environment cannot create the reviewed login identity, fifth-caller role
membership, exact target binding, rotation or teardown evidence. The verifier
identity HMAC is only a scope/correlation binding; an arbitrary hexadecimal
environment value cannot authenticate a caller or activate the RPC. None of
these categories may be inferred from `OPENAI_API_KEY`, a Supabase service-role
key or an existing feature flag, and no placeholder for them belongs in
`.env.example`.

M1g-g remains default-off because its test-only signing-key snapshot is not yet
cross-bound to a validated live M1g-c custody/trust-registry resolver and its
verifier HMAC is not cross-bound to a fifth-caller credential/identity
resolver. These are activation blockers that require a separately reviewed
resolver and identity-provisioning batch; environment configuration cannot
close them. The fixed terminal, custody, derived preflight and coordinator
digests are respectively
`d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa`,
`f537dc64e3c57a34b6db6d0d1c871c38a70bcb51c4d071e625b026f840a309ca`,
`491481513a67198cba91babc3c172fc1f326f9ee7bdd883b3d1208c639bdaf73`
and
`f6609c2f357b5fda92ae5aa1b459dfb1e32b7893c3e8436e0e94a8ffa2bbe675`;
they are source-integrity bindings, not configuration or approval. No Hosted,
provider/model, deployment or Production capability is introduced.

Communication Note M1g-h adds no persistent environment variable, secret name
or `.env.example` entry. Its disposable-Preview commands take four explicit
CLI-only assertions: the expected Preview ref, expected PostgreSQL major, an
absolute CA path and the expected CA SHA-256. For the recorded attempt those
were `hspkccjobyqmoomiidjp`, `17`,
`/Users/milliohusky/Downloads/prod-ca-2021.crt` and
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
They are invocation evidence, not product configuration, approval or a secret
resolver.

Bounded Supabase branch JSON enters through stdin only. Credential-bearing
child configuration enters through an anonymous fd3 pipe and process memory,
and the one-test worker receives a strict environment allowlist. Ambient `PG*`
values, `NODE_TLS_REJECT_UNAUTHORIZED=0`, Production/mismatched refs and
unverified CA bytes fail closed. The random database password exists only in
memory and belongs to a short-lived role that the harness is designed to set
`NOLOGIN`, drain, revoke and drop.

The Hosted sequence stopped before creating that role and the whole no-data
Preview was deleted. No branch JSON, URL, password or certificate body was
written to an environment file or evidence document. Registry/composition
statuses remain test-only, readiness remains `false`, and an environment value
cannot manufacture an approved trust registry, custody provenance, signing key,
database identity or passing Hosted gate. Detailed boundaries are in
`documentation/communication-note-preview-hosted-runner-terminal-identity-m1g-h.md`.

Communication Note M1g-i adds no product/deployment environment variable,
secret name or `.env.example` entry. Its one-shot test parent creates only
process-local enable, fd3 config and fd4 fixed-status variables for the scrubbed
child, and no credential is placed in an environment variable. Its migration
and fixed-stage rollback diagnostics change only the source/database contract
and test evidence. Transactional migration policy
`2026-08-29.preview-transactional-migrations.6` has manifest digest
`60314eb32f7ac26027862e30b27e60460cf4d17d49061126f4366b08a0cbd3a2`;
disposable identity policy `2026-08-29.preview-runner-terminal-identity.2`
cross-binds a healthy, no-data, non-default, non-persistent Preview, its exact
Production parent and its credential target before credentials, CA bytes or a
connection may be used. These are test invocation policies, not environment
configuration. The preflight version
`preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5` with
digest `0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1`
and coordinator version
`coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5` with
digest `1f93fa2c0ba207a28cb706d922acc10bba8305f16c83c7973c70ae4d7ac7e5c2`
are source-integrity pins, not runtime configuration or approval. No
environment value can replace the still-absent live trust/custody and caller
credential resolvers. Readiness remains `false` and approved values remain
`undefined`.

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
