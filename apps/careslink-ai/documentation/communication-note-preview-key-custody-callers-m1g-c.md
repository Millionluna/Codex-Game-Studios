# Communication Note Preview key custody and callers M1g-c

> Successor note (M1g-g, 2026-08-29): the current source contract extends
> this historical four-caller baseline with an independently signed runner-
> terminal envelope, separate terminal signer custody and a fifth purpose-
> scoped `NOLOGIN` caller shell. See
> `communication-note-preview-signed-runner-terminal-port-m1g-g.md`.

## Status

M1g-c is a **source-only, default-off custody and least-privilege caller
contract** for the bounded synthetic Communication Note Preview evaluation. It
extends M1g-b without activating the evaluation. It defines the metadata that a
future application boundary must obtain from independently managed custody
systems and gives four inert database caller shells only the exact M1g-b RPC
surface they require.

| Boundary | M1g-c state |
|---|---|
| Custody policy version | `custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1` |
| Custody policy digest | `1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438` |
| Owner verification material | candidate metadata labelled `EXTERNAL_TRUST_REGISTRY_SNAPSHOT`, explicitly injected into the `TEST_ONLY` validator; public verification material only |
| Receipt signing material | explicitly injected digest of a non-exportable signer handle/reference; raw private key unavailable |
| Provider credential | explicitly injected digest of a temporary project service-account credential reference; raw bearer unavailable to this contract |
| Database callers | four `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS` shells with a 1/1/2/1 exact-RPC mapping |
| Content in custody metadata | none; identifiers and managed-handle/reference values are represented only by hashes/HMACs |
| Runtime importer or login-capable principal | absent |
| Role membership posture | no caller-to-executor/runtime, `INHERIT` or `SET ROLE` edge; PostgreSQL 16 may retain only a non-usable creator ADMIN bootstrap edge |
| Real key, provider call, paid spend, hosted mutation and deployment | absent |
| Key-custody / caller-identity readiness | `false` / `false` |
| Approved custody snapshot | `undefined` |

The version and digest above are literal source constants from
`communication-note-preview-key-custody.server.ts`; they are not environment
configuration or execution authority.

## Three distinct custody boundaries

M1g-c keeps verification, signing and provider access purpose-separated. No
single injected object is allowed to satisfy another purpose.

### Candidate owner verification metadata

The `TEST_ONLY` validator accepts one explicitly injected candidate object
labelled `EXTERNAL_TRUST_REGISTRY_SNAPSHOT`, containing only public Ed25519
verification material and bounded metadata needed by M1g-b. No registry loader
or independently authenticated input port exists. The source validator checks the exact
owner-authorization purpose and domain, owner-subject and tenant-scope HMACs,
key identifier, public-key fingerprint, key validity window, `ACTIVE` claim,
snapshot/reference SHA-256 shapes and an `observedAt` value that is not in the
future. The signed authorization remains bound to the caller-expected run. A
statement cannot add, replace or self-approve its verification key.

Those checks do **not** authenticate the registry source, bind either supplied
SHA-256 to fetched registry bytes, prove revocation-list completeness or impose
a maximum snapshot age. The descriptor is therefore candidate metadata, not
independent registry provenance or activation authority. Those controls remain
explicit activation blockers.

The snapshot is not stored in PostgreSQL by this batch and is not sourced from
an environment variable. Public verification material is not a private secret,
but it is still authority-bearing configuration and must come from the reviewed
external registry at activation time.

### Non-exportable CaresLink receipt signer

The receipt-signer descriptor accepts a SHA-256 reference to an opaque managed
key handle plus the bounded public verification snapshot. It binds the receipt
purpose/domain, key identifier hash and public-key fingerprint; requires
`nonExportable=true`, `exportAllowed=false` and
`genericSigning=PROHIBITED`; and rejects any claim that private material is
present. This source contract validates custody evidence only. It cannot invoke
the signer, export a key, sign a receipt, read private material or resolve the
managed handle.

The signer produces only a CaresLink internal observation. It does not turn an
OpenAI request ID into a provider signature, and it does not prove billing,
model execution, exact provider receipt or exactly-once delivery.

### Temporary OpenAI project credential reference

The provider-credential descriptor accepts only a SHA-256 reference to a
separately managed, temporary project service-account API key. Metadata binds
the project, service-account and API-key HMACs, scopes-evidence digest,
issue/expiry/revoke-by times and maximum six-call plan. The key lifetime is at
most 30 minutes, `revokeBy` equals expiry, administration and automatic renewal
are disabled, and the key must cover the bounded owner-authorization window.
Project, service-account and API-key HMACs must be pairwise distinct. The
contract rejects expired, unbounded, raw or exportable bearer values.

M1g-c does not read `OPENAI_API_KEY`, create a service account, issue a key,
perform an OpenAI request or prove provider-side spend controls. The future
transport may resolve the opaque reference only after a separate activation
review; secret resolution is outside this source batch.

### Purpose-separated HMAC key references

Caller identity and provider correlation use distinct HMAC-SHA256 domains,
versions and key-reference digests:

- `hmac.communication-note.preview-caller-identity.2026-08-28.m1g-c.v1` for
  caller statement bindings;
- `hmac.communication-note.preview-provider-correlation.2026-08-28.m1g-c.v1`
  for provider correlation identifiers.

The two references must differ and neither descriptor may contain raw HMAC key
material or permit export. A caller identity HMAC remains an application-level
binding; it is never a substitute for a login-capable database principal.

## Content-free metadata rules

Custody and caller evidence may contain fixed policy identifiers, timestamps,
bounded enums, UUIDs, SHA-256 values, HMACs, public-key fingerprints and digests
of opaque managed handles/references. It must not contain:

- prompt text, cleaned facts, generated Note content or provider response
  bodies;
- raw owner, tenant, run, project, request or provider response identifiers;
- raw claim tokens, database passwords, OpenAI bearer keys or private signing
  keys;
- URLs containing credentials, secret-manager response payloads, signing
  material or arbitrary provider errors.

Hashes and HMACs provide bounded matching or correlation only. In particular,
a caller-supplied identity HMAC is **not database authentication**. It does not
prove `current_user`, a Supabase Auth session, a JWT subject or possession of a
database credential. A future live caller must first authenticate through a
separately reviewed connection identity and may then be checked against the
expected HMAC-bound statement.

## Four inert database caller shells

Migration
`20260828034704_add_communication_note_preview_custody_callers_shadow.sql`
adds no custody table, credential row, seed, login or runtime connection. It
creates four dormant roles and maps them to the five existing M1g-b definer
functions:

| Caller shell | Exact M1g-b operation count | Allowed operation |
|---|---:|---|
| `careslink_v1_preview_authorization_registration_caller` | 1 | persist an application-verified owner authorization |
| `careslink_v1_preview_authorization_revocation_caller` | 1 | persist an application-verified owner revocation |
| `careslink_v1_preview_dispatch_caller` | 2 | claim one authorization and reserve the next exact slot |
| `careslink_v1_preview_receipt_caller` | 1 | persist an application-verified CaresLink receipt |

Each shell is `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER` and `NOBYPASSRLS`. It gets
only private-schema `USAGE` and `EXECUTE` on its named function set. It receives
no table, sequence, broad function, role-owner, API, Auth or service-role
privilege; it cannot `SET ROLE` to an M1g-b executor. `PUBLIC`, `anon`,
`authenticated`, `service_role`, `authenticator` and the listed API/runtime
roles remain outside these caller shells. When a
non-superuser `CREATEROLE` migration actor creates these roles on PostgreSQL
16+, PostgreSQL may retain one creator ADMIN bootstrap edge per new caller with
`INHERIT=false` and `SET=false`; this is a grant-management edge, not a caller,
executor or runtime execution path. The live assertion permits only that exact
server-created shape and rejects every usable or unexpected edge around all
four callers and all three M1g-b executors.

The four roles therefore document exact future privilege bundles without
creating a usable connection identity. Granting membership to a real login,
issuing a database credential, adding a pooler mapping or making any runtime
adapter import remains a separate, reviewed activation action.

The injected candidate snapshot carries one identity HMAC and one credential-
reference SHA-256 for each caller shell. All eight values must be pairwise
distinct, and every caller descriptor repeats the exact purpose, caller role,
executor owner and RPC list above while fixing `databaseLogin=false` and
`executorMembershipEnabled=false`. The owner-registry, receipt-signer,
provider-credential, two HMAC-key and four caller-credential references are
also pairwise distinct, preventing a single managed reference from being
asserted across custody purposes.

The caller shells do not change M1g-b's transaction rules. All five functions
still require `READ COMMITTED`, retain their executor ownership and narrow
table privileges, and perform their existing lock-then-recheck logic. No row
lock spans provider transport.

## Runtime boundary

The M1g-c TypeScript contract remains server-only and explicitly injected. No
route, component, product runtime, worker, cron, queue consumer or deployment
entrypoint imports it. The approved custody snapshot remains `undefined`; key-
custody and caller-identity readiness remain literal `false`; and the only
validator is named `TEST_ONLY`. Ordinary environment variables cannot promote
an injected test/support descriptor into an approved custody binding.

The migration is additive source only and Production-unapplied. This batch
performs no hosted Supabase mutation, Vercel configuration change, deployment,
OpenAI control-plane action, real signature or provider call. It also creates
no retained Preview resource and stores no business or care data.

## Verification handoff

The maintained source gate must cover:

- strict, exact-key validation for all three custody descriptors, including
  purpose separation, authorization/project scope, time windows, the candidate
  `ACTIVE` claim, content-free values and immutable policy digests; authenticated
  registry provenance, a freshness ceiling and complete revocation evidence
  remain activation blockers;
- rejection of raw secrets, bearer-shaped values, exportable receipt keys,
  cross-purpose handles, global/user credentials and caller identity HMACs
  presented as authentication;
- absence from all runtime importers and fail-closed readiness/factory paths;
- migration/static assertions for the four exact roles, 1/1/2/1 function ACL
  mapping, no login, usable `INHERIT`/`SET`, caller-to-executor/runtime,
  table/API/service-role privilege, and preserved M1g-b function ownership plus
  `search_path=''` posture; the only tolerated membership is PostgreSQL 16's
  exact non-usable creator ADMIN bootstrap edge;
- a clean local migration and rollback assertion with zero fixtures and no
  secret-bearing data.

The exact final source/local evidence—focused and full test counts, build mode,
PostgreSQL manifest hashes, artifact byte lengths and rollback results—is
recorded in `documentation/tests.md`. It creates no activation authority.

## Remaining activation blockers

M1g-c closes only the source design for custody descriptors and caller privilege
bundles. A separately approved disposable synthetic Preview run still requires:

1. an operated external owner trust registry, independently attributable
   signing ceremony, authenticated snapshot-delivery path, digest-to-bytes
   binding, freshness ceiling and complete revocation evidence;
2. a real non-exportable receipt key in approved server-side KMS/HSM custody,
   including rotation, revocation, access logging and teardown procedures;
3. a temporary OpenAI project service account with least-privilege scope,
   provider-side spend ceiling, exact Preview-project binding and verified
   immediate teardown;
4. separately provisioned login-capable database identities or pooler mappings,
   explicit membership in only the required caller shell, credential rotation,
   connection confinement and audit evidence;
5. clean same-revision migration/rollback and protected non-Production
   application evidence, with Production excluded;
6. fresh Australia project-region, Zero Data Retention, Modified Retention,
   processing acknowledgement, model availability, price and owner-spend
   evidence;
7. a reviewed transport that reserves before dispatch, signs every terminal or
   ambiguous result, never retries an ambiguous slot and exposes no secret;
8. attributable human semantic reviewers and a separate final run approval.

Until all blockers are closed, the bounded evaluation cannot make a paid call,
and no real care data is permitted.

## Successor M1g-e

The follow-on [M1g-e reserve-before-dispatch coordinator transcript
contract](communication-note-preview-reserve-before-dispatch-coordinator-m1g-e.md)
revalidates the injected M1g-c custody snapshot and verifies test-only receipt
signatures, but resolves no managed key, credential or caller identity and
creates no runtime capability.
