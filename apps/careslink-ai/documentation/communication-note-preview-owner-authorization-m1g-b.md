# Communication Note Preview owner authorization M1g-b

## Status

M1g-b defines a **source-only, default-off shadow contract** for externally
authorized execution of the bounded synthetic Communication Note Preview
evaluation. It closes the source-design gap between the M1g-a request-body
pins and a future disposable paid run; it does not make that run available.

| Boundary | M1g-b state |
|---|---|
| Authority policy version | `authority.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1` |
| Authority policy digest | `7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9` |
| Authorization authenticity | external owner Ed25519 signature, verified against an external trust-registry snapshot |
| Authorization lifetime | at most 15 minutes; at least 5 minutes must remain when the durable claim is created |
| Durable execution authority | one atomic claim for one authorization and one run; the raw claim token is returned only on the first successful insert |
| Dispatch authority | one durable reservation per ordered slot, created before any external transport starts |
| Retry posture | one attempt per slot, serial slot order, no automatic retry; ambiguous transport permanently consumes the slot |
| Receipt authenticity | `CARESLINK_SIGNED_INTERNAL_OBSERVATION` |
| Provider attestation | `ABSENT` |
| Application readiness | `false` |
| Approved owner/receipt keys | absent |
| Real key, real provider call, paid spend, route, worker and deployment | absent |
| Hosted database or Production change | absent |

The implementation constants
`CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY` and
`CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY` remain
literal `false`. Both approved signing-key snapshots remain `undefined`. No
environment variable, database seed, runtime importer or feature flag can turn
this source contract into execution authority.

## External owner authorization

The authorization statement is canonical JSON signed as UTF-8 bytes prefixed
with `CARESLINK-V1-ED25519\n`. Its Ed25519 public key is selected only from an
external, independently controlled trust-registry snapshot. A statement or
envelope cannot supply, replace or approve its own trusted key.
The snapshot is runtime-validated for the `OWNER_AUTHORIZATION` purpose, the
authorization domain, and the exact owner-subject and tenant-scope HMACs. The
caller must also provide and match the expected owner, tenant and run bindings.
The separate `CARESLINK_DISPATCH_RECEIPT` key purpose cannot verify an owner
authorization, and an owner key cannot verify a dispatch receipt.

The signature binds one authorization ID, a nonce hash, owner-subject HMAC,
tenant-scope HMAC and run-ID hash to:

- the exact M1g-a request-body pin bundle and runner-policy digests;
- the evaluation-plan, request-template, manifest, golden-fixture and worker
  policy digests;
- `openai.responses`, `gpt-5.4-mini-2026-03-17`, the closed Australia-storage
  endpoint profile and the endpoint URL digest;
- exactly six ordered fixture/run slots, including each raw JSON-body SHA-256,
  UTF-8 byte length and semantic canonical digest;
- the fixed six-call, one-attempt, no-retry and no-fallback budget, including a
  projected 120,780-micro-USD upper bound under the 250,000-micro-USD cap;
- synthetic, deidentified golden fixtures only, with
  `realCareDataAllowed=false`;
- hashes or HMACs of the Australia project, ZDR, Modified Retention, processing
  acknowledgement, price/model, spend-limit and temporary-credential evidence;
- the signing-key identifier hash and public-key fingerprint, plus a bounded
  issue/not-before/expiry window.

SHA-256 values provide integrity and correlation only. They do not authenticate
an owner. Authorization authenticity comes from a valid Ed25519 signature under
the separately trusted external key, and the approved key registry is not part
of M1g-b.

## Durable database boundary

The source migration uses the private `careslink_v1_generation` schema and
separate least-privilege, non-login, non-superuser, non-bypass-RLS roles:

- `careslink_v1_preview_authorization_executor` for already-verified owner
  statements and revocation records;
- `careslink_v1_preview_dispatch_executor` for the single-use claim and ordered
  dispatch reservations;
- `careslink_v1_preview_receipt_executor` for already-verified signed internal
  receipts.

The authorization, revocation, claim, reservation and receipt ledgers are
private, append-only and protected with enabled plus forced RLS. API roles,
including `anon`, `authenticated` and `service_role`, receive no schema usage,
table access or function execution through this migration. Security-definer
functions use an empty search path and narrow grants; their ownership is not a
caller grant.

All five authority RPCs require PostgreSQL `READ COMMITTED` and reject
`REPEATABLE READ` or `SERIALIZABLE` with
`UNSUPPORTED_TRANSACTION_ISOLATION`. Their lock-then-recheck guarantees depend
on each command observing a fresh post-wait snapshot; a future caller must not
override that isolation level.

The database does **not** establish owner-signature trust and does not perform
Ed25519 trust-registry verification. The application-side ingress must first
verify the exact statement and external trust snapshot. The database then
recomputes canonical digests, validates the fixed M1g-b statement shape and
persists the already-verified statement, signature and verifier evidence. The
function name and audit fields must not be used to claim that PostgreSQL
independently authenticated the owner.

Claiming locks the parent authorization row, checks current database time,
revocation and remaining lifetime, and inserts a unique claim before returning
an opaque token once. Only the token SHA-256 is stored. Exact response-loss
replay returns no token and no renewed execution authority; a second claim for
the same authorization or run fails closed.

Revocation remains appendable after a claim. It serializes on the same parent
authorization lock as reservation: a revocation committed first blocks every
future slot reservation, while a reservation committed first remains consumed
and may still receive its terminal receipt. Revocation never releases or
reissues a claim or slot.

Before each external dispatch, the database locks the claim and creates one
unique reservation for the next exact slot. The previous slot must have a
terminal `COMPLETED` receipt. A reservation response lost after commit cannot
be replayed into a second dispatch authority. Network/provider work occurs only
after the short reservation transaction commits and never while a database row
lock is held.

Once transport has started, a timeout, connection loss, partial/truncated
response, crash or unknown provider outcome is `TRANSPORT_AMBIGUOUS`: that slot
remains consumed and must not be retried. The receipt may preserve an observed
HTTP status and either observed correlation HMAC, but it carries no usage or
cost because a complete terminal provider response was not verified. This
safety rule prevents an application retry from pretending to provide
exactly-once semantics when the provider-side result is unknown.

## Signed internal dispatch observation

Each reservation can receive one content-free CaresLink Ed25519 receipt whose
statement is checked against the complete durable reservation binding:
authorization digest, claim, run, reservation, exact slot, fixture, ordinal,
request-body digests and length, client-request HMAC and reservation time. The
only outcomes are:

- `COMPLETED`;
- `PROVIDER_HTTP_ERROR`;
- `TRANSPORT_AMBIGUOUS`;
- `LOCAL_PRE_DISPATCH_ABORTED`.

The receipt keeps three identifiers distinct and stores only HMACs:

- CaresLink's client request identifier;
- OpenAI's `x-request-id` response header when observed;
- the Responses body `response.id` when observed.

Neither OpenAI identifier is a signature, receipt, idempotency key or proof of
execution. The CaresLink signature authenticates only CaresLink's bounded
application/TLS-client observation. Every receipt therefore states:

- `authenticity=CARESLINK_SIGNED_INTERNAL_OBSERVATION`;
- `providerAttestation=ABSENT`;
- `transportScope=APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION`;
- `notProofOf=[EXACT_PROVIDER_RECEIPT, BILLING, MODEL_EXECUTION, EXACTLY_ONCE]`.

Only a completed 2xx observation may carry provider usage and a non-zero
calculated cost upper bound. The application and database both recompute that
value with the fixed integer-ceiling M1f/M1g-a pricing formula, including
cached-input and Australia-residency uplift rates, and require exact equality.
Provider HTTP errors and ambiguous outcomes carry no usage and a null cost;
local pre-dispatch aborts carry no usage and an explicit zero cost. The
calculated completed cost remains an upper-bound reconciliation value, never
an invoice or Points settlement record.

## Privacy and evidence boundary

The authorization and receipt ledgers contain metadata, hashes, HMACs, public
signatures and bounded status fields only. They must not contain prompt text,
cleaned facts, generated Note content, provider response bodies, raw project or
request identifiers, raw claim tokens, API keys or private signing keys.

M1g-b creates no real credential, key-management integration, environment
lookup, HTTPS transport, OpenAI call, human-review workflow, Points write,
route, worker registration, Vercel deployment, retained Preview or hosted
Supabase mutation. Source and local tests are not evidence that a trusted owner
signed an authorization, that OpenAI received a body, or that a provider
charged or executed anything.

## Local validation evidence

The exact source batch passed 158 Vitest files / 2,163 tests, TypeScript,
ESLint, the 64/64-page production build through Next.js webpack, the 73-file
Codex-adapter sync check and `git diff --check`. The focused authority,
migration-contract and runtime-boundary gate passed 3 files / 26 tests.

A fresh disposable PostgreSQL 16.15 cluster listening only on a private Unix
socket clean-applied all 35 repository migrations. The 90,143-byte authority
migration has SHA-256
`94f83498ea04053e7238a95bb9be0bb8a38ad0a76fa0e751390419800da51f7f`;
the 65,918-byte rollback assertion has SHA-256
`cb98ff81ed8d6211cb6ddffcf02d5fde882c60e9f5f07f09b0833c354fa3f1d7`.
The assertion completed with `ROLLBACK_ASSERTION=PASS`, left zero fixture rows
and separately proved that all five RPCs reject `REPEATABLE READ`.

A second fresh private-socket PostgreSQL 16.15 cluster applied the exact 35-file
manifest with SHA-256
`4676531ac4f87ed1d7caf7e949f9663581ca1b1c7707bf2ea7f42cf3b908a986`
and passed three true two-backend races. A concurrent claim visibly waited on
the first transaction and only one backend received a claim token. A
revocation-first race made reservation wait, then reject with
`AUTHORIZATION_REVOKED` and create no reservation. The inverse race committed
the reservation first, then the waiting revocation, retaining one reservation
and one revocation in timestamp order. Both clusters used synthetic metadata
only; no TCP listener, hosted resource or provider transport was involved, and
all race-gate resources were stopped and removed.

## Remaining activation blockers

A separately approved disposable synthetic Preview run still requires:

1. a real external owner trust registry and independently managed signing
   ceremony, plus a CaresLink receipt key in approved server-side key custody;
2. reviewed caller identities and grants for the three private database roles,
   clean migration and rollback evidence, and an explicit non-Production target;
3. a temporary project-scoped OpenAI key, provider spend ceiling and verified
   teardown;
4. fresh Australia project-region, Zero Data Retention, Modified Retention,
   processing-acknowledgement, model-availability and pricing evidence;
5. a reviewed transport implementation that reserves before dispatch, records
   every terminal or ambiguous outcome and never retries an ambiguous slot;
6. attributable real human semantic review and a separate final run approval.

Until every blocker is closed, readiness stays `false`, no real care data is
permitted and the M1g-b artifacts remain source-only shadow evidence.
