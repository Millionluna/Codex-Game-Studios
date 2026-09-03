# Communication Note secure submission provider trust M2b

## Status

M2b is a source-only, default-off trust-composition checkpoint for the M2a
exact-version Google Cloud KMS wrapper. It adds an owned provider HTTPS
transport, Vercel-to-Google workload-identity exchange and authenticated reads
of one exact parent `CryptoKey` plus one exact numeric `CryptoKeyVersion`. It
does not install that chain in the product runtime.

- Provider-trust readiness: `false`.
- Provider-HTTPS-transport readiness: `false`.
- Formal provider-trust singleton: `undefined`.
- Formal provider-HTTPS-transport singleton: `undefined`.
- Formal provider-trust preparation entrypoint: fixed
  `PRODUCT_API_DISABLED` failure before token or network work.
- Source execution seam: only the explicitly named `TEST_ONLY` preparation
  entrypoint, with the exact frozen test capability and caller `AbortSignal`.
- Product route, worker, submitter, stager and maintenance importer: none.
- New environment variables, manifests, schedules and migrations: none.
- Live provider evidence, cloud resource creation, Preview deployment,
  Production change, real care data and model calls: none.

The tests use mocked provider and Node HTTPS boundaries. This checkpoint is
local source and protocol evidence only; it is not evidence that the pinned
Google resources or IAM posture exist, that a Hosted Preview can obtain a
credential, or that any runtime may activate the adapter.

## Pinned workload-identity chain

The test-only preparation seam owns this closed sequence:

1. read the platform-provided Vercel OIDC token synchronously through the
   supported accessor (request-context header or Vercel-injected
   `VERCEL_OIDC_TOKEN`) and validate the exact team, project, Preview subject,
   issuer, audience and bounded lifetime;
2. request a custom-audience Vercel token with a fresh caller-generated `jti`,
   then cross-check its claims and actor binding against the base token;
3. exchange that token at Google Security Token Service for the one pinned
   Workload Identity Federation provider and `cloud-platform` scope;
4. call IAM Credentials for the pinned Preview runtime service account and a
   300-second access token;
5. use that posture-only token to fetch the exact parent `CryptoKey` and exact
   numeric `CryptoKeyVersion`;
6. call IAM Credentials again as an independent operation-credential request;
   and
7. retain the operation token only behind a private, one-use trust handle for
   one exact-version M2a `rawEncrypt` operation.

Local parsing checks the expected JWT header and claims, but does not claim a
second local JWKS signature verification. Authority is promoted only after
Google STS accepts that exact custom token. The two service-account credential
requests use the same pinned principal and scope. Their separate calls and
local lifecycles do not imply that Google must return different token strings,
and they are not independent IAM purpose isolation. The live WIF provider and
IAM bindings therefore remain an independent activation gate.

The parent key must be `RAW_ENCRYPT_DECRYPT`, with an
`AES_256_GCM`/`SOFTWARE` version template and no primary, rotation or external
backend posture. The numeric version must be the requested resource and be
`ENABLED`, `AES_256_GCM` and `SOFTWARE`, without import, destruction, external
protection or attestation fields that would widen the admitted posture. Unknown
control-plane fields fail closed.

The complete preparation chain has one absolute 30-second deadline. Every
individual provider request has an exact five-second deadline, zero automatic
retries and redirect rejection. Credential expiry cannot outlive its upstream
identity chain, and the authenticated KMS posture is bounded to at most 30
seconds. The retained operation credential is invalidated by expiry, explicit
discard or the exact root abort signal.

## Owned HTTPS boundary

`src/lib/v1/note-generation-google-cloud-provider-https-transport-m2b.server.ts`
uses owned `node:https` I/O. It does not use global `fetch`, Google client
libraries, Application Default Credentials, a service-account JSON file,
ambient proxy configuration, a custom agent, or the cached Vercel
custom-audience helper.

The transport admits only six method-and-resource profiles:

- `POST` to the exact Vercel custom-audience exchange URL;
- `POST` to the exact Google STS URL;
- `POST` to IAM Credentials for the pinned service account;
- `GET` of a parent key in the pinned project and region;
- `GET` of one numeric key version in that same project and region; and
- `POST` to `rawEncrypt` on one such numeric version.

URLs, methods, lower-case header classes, bodies and response caps must match
the selected profile exactly. Before HTTPS, every DNS result must be a public
address; the approved result set is then pinned into the request lookup. The
connected peer must still be public, and normal certificate plus TLS server-name
verification remain mandatory. Private/mixed DNS answers, aliases, credentials
in URLs, query strings, redirects, oversized bodies/responses, late data,
timeouts and aborts all collapse to a fixed content-free failure.

Mutable request copies, provider response chunks and decoded response byte
copies are scrubbed after use or failure. Access tokens and JWTs are JavaScript
strings: the implementation drops its references as early as practical, but
JavaScript strings are immutable and cannot be reliably zeroized. M2b therefore
does not claim memory zeroization of token strings, process-memory isolation or
provider-side erasure.

## One-use authenticated composition

The public trust object contains only exact-resource metadata and SHA-256
references; it contains no access token, JWT, transport or M2a posture object.
Its authority is held in a private module `WeakMap` and is bound to that exact
frozen object identity, its exact root signal and its short trust window. A
clone, spread, proxy, accessor-shaped object, replay or second consumer cannot
recover the private authority.

This closes the M2a self-attestation bypass for this path. The public M2a
posture factory remains a lower-level source validator and cannot be supplied
to the M2b constructor. M2b privately constructs the M2a posture only after the
two authenticated control-plane reads, then privately supplies its separately
requested operation credential and owned HTTPS transport. A source-import quarantine
allows the M2a KMS module to be imported directly only by this M2b trust module;
M2b itself has no product runtime importer.

Consuming the trust handle constructs one single-use wrapper. Its sole successful
operation is the existing M2a exact-version KMS wrap; either success, failure,
abort or explicit discard destroys the retained source authority. These
source-level identity and lifecycle controls do not prove that a future host,
runtime or dependency cannot inspect process memory.

## Verification scope

The focused source suites cover:

- import-time inactivity, `READY=false`, `undefined` formal singletons and the
  fixed-failure formal factory;
- the M2a direct-import quarantine and absence of an M2b runtime importer;
- the exact Vercel custom-audience, STS, IAM, parent-key, numeric-version and
  `rawEncrypt` request order;
- independent posture/operation credential requests, upstream-expiry bounds, secret-free
  trust projection, WeakMap identity, one-use consumption and discard/abort;
- wrong identity claims, `jti`, STS shape, key/version resource or unsafe KMS
  state, plus caller-supplied M2a posture and object-shape attacks;
- all six transport profiles, SSRF and URL/header ambiguity rejection, DNS and
  connected-peer public-address checks, certificate/server-name verification,
  redirects, response limits, timeout, abort and late-response cleanup; and
- request/response byte-copy scrubbing and fixed content-free failures.

These suites do not call Vercel, Google, Supabase or a model. Passing them does
not establish live WIF issuance, IAM policy, KMS resource posture, provider
availability, billing behavior or deployment readiness.

References:

- [Vercel OIDC](https://vercel.com/docs/oidc)
- [Google Security Token Service token exchange](https://docs.cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token)
- [IAM Credentials generateAccessToken](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken)
- [Cloud KMS CryptoKey](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys)
- [Cloud KMS CryptoKeyVersion get](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/get)
- [Cloud KMS rawEncrypt](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/rawEncrypt)

## Remaining implementation and approval gates

1. provision the exact WIF provider, service account, parent key and numeric key
   version, then independently attest their current IAM/control-plane policy,
   including the WIF and service-account impersonation bindings and KMS IAM;
2. run the same reviewed revision once on an explicitly authorized disposable,
   no-data Preview and retain content-free evidence for the exact identity,
   resource and teardown posture;
3. retain M2c's completed tokenless GCS source handoff, implement its private
   credential authority and owned transport, and independently authenticate
   exact-bucket IAM, propagation, historical-version absence and
   retained/backup-copy expiry or purge;
4. implement the Supabase purpose credential issuer/revoker and exclusive
   Direct/Session Pooler connector with independently observed quiescence;
5. implement persistent maintenance adapters and a separately approved
   scheduler, then implement worker exact-version decrypt/consume and recovery;
6. compose formal submission only after all provider/database evidence is
   current, while keeping the Product UI and API activation gates closed;
7. separately approve the model policy, budget, kill switch and model-call
   evidence; and
8. obtain separate deployment and Production approval. Real care data remains
   outside scope until those gates are closed.
