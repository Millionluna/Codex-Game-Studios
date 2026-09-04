# Communication Note GCS authority handoff M2c

## Status

M2c is a source-only, default-off successor to the Google Cloud Storage part
of M2a. It removes raw provider credentials and caller-owned authenticated
transport from the private-object-store adapter boundary. It does not install
or activate a credential authority, an HTTPS transport, a bucket or a product
runtime composition.

- Adapter version:
  `gcs-private-object-store.communication.2026-09-03.m2c.v1`.
- Formal GCS private-object-store singleton: `undefined`.
- Readiness: `false`.
- Environment variables and `.env.example` entries: none.
- Cloud resources, live network calls, Preview or Production changes,
  deployment, real care data and model calls: none.

This checkpoint is local source-custody evidence only. It is not Google
identity, IAM, bucket-posture, network, deployment or activation evidence.

## Tokenless operation handoff

The constructor now accepts one frozen `authorizedOperationPort` instead of a
raw access-token port plus a caller-supplied authenticated HTTPS transport. For
each top-level `read`, `createIfAbsent` or `deleteIfBindingMatches`, the adapter:

1. revalidates the bounded injected bucket-posture claim;
2. creates a child abort signal and requests authority for the exact project,
   region, Preview runtime principal, GCS audience/scope, bucket, required
   permission-set hash and fixed time bounds;
3. requires the authority to call the consumer exactly once and synchronously
   with one frozen, exact, tokenless `{ request }` session;
4. requires the authority to return directly the exact opaque operation
   produced by that callback; and
5. adopts that operation itself exactly once, closing the child signal after
   success, failure or abort.

The callback covers one complete logical object-store operation. That permits
the same session to perform the metadata, generation-pinned media, upload and
response-loss recovery requests needed for that operation. A separate
top-level operation receives a separate authority request and session. Within
one adapter instance, WeakSets reject reuse of the exact session object or
request-function identity.

The session receives only an explicit request descriptor: method, exact GCS
URL, accepted media type, optional content type and length, body bytes,
redirect/retry policy, request byte cap, five-second request timeout and child
signal. It receives no generic header map, access-token value, bearer header,
credential-reference DTO or credential lifecycle fields. Any future provider
credential must remain private to the authority and its owned transport.

## Handoff misuse and cleanup

The source handshake fails closed before GCS I/O when the authority omits,
duplicates or defers the callback; returns a different or asynchronously
wrapped value; reads or Promise-assimilates the opaque result before returning
it; or otherwise competes for adoption. Retained operations and callbacks are
inert after the boundary closes. The complete logical operation has a
30-second deadline and each request has a five-second deadline. Root abort is
propagated; derived operation and request signals are aborted after settlement.

Mutable request and response copies are cleared on normal, failure, timeout and
late-response paths. The adapter does not receive a JavaScript token string at
all. A future authority may still hold immutable token strings internally;
JavaScript string zeroization must not be claimed there.

These rules prevent the GCS adapter from becoming a raw credential custodian.
They cannot prove that a future authority is honest, does not retain its own
capability, attaches the right credential, or uses a safe network transport.
Exact-identity consumption also does not detect a fresh wrapper around the same
underlying credential/capability or reuse across separate adapter instances;
the future private authority must enforce that lifecycle.

## Preserved object protocol

M2c preserves the M2a exact-object protocol:

- digest-derived object names under one configured prefix;
- metadata-first, generation- and metageneration-pinned reads;
- canonical JSON, strict metadata, byte bounds, SHA-256 and CRC32C checks;
- create-only multipart upload with `ifGenerationMatch=0`;
- same-name generation/metageneration CAS tombstones rather than an
  unqualified physical delete; and
- exact response-loss recovery without treating a bare `404` as deletion
  proof.

The injected bucket-posture digest remains only a self-consistent claim. The
permission-set hash is only an operation binding. Neither authenticates Google
Cloud control-plane state, IAM, bucket provenance or historical object state.

## Local evidence

Focused source tests cover the tokenless request shape, exact frozen authority
request, synchronous direct-return attack matrix, retained and late callback
inertness, one session across a multi-request logical operation, concurrent
top-level session isolation, request deadlines, late-response clearing and the
30-second bound across a multi-request recovery chain, plus the preserved
create/read/replay/CAS-tombstone protocol. Runtime-boundary and
post-build scanners keep both the historical M2a and current M2c server-only
markers out of product/client composition.

The focused gate passed **50/50 tests across 2 files**. The complete local
Vitest suite passed **3240/3240 tests across 224 files**. TypeScript, full
zero-warning ESLint, the optimized Next.js 16.2.9 Turbopack build with 64/64
generated pages, the 27-static-chunk M1r–M2c client-boundary scan, 73-file
adapter sync and diff checks also passed.

## Successor checkpoint

M2d later adds a source-only private GCS authority and GCS-specific owned HTTPS
transport while preserving this tokenless M2c adapter contract. That successor
addresses only the source-implementation portion of the first gate below. It
does not retroactively turn this M2c evidence into live Google identity, IAM,
DNS/TLS, bucket, Preview, deployment or activation evidence. The M2c counts
above remain the historical results for this exact checkpoint; M2d results are
recorded separately in the M2d note from its final same-revision validation.

## Remaining implementation and approval gates at the M2c checkpoint

Before formal composition, all of the following remain required:

1. implement a private GCS credential authority with upstream-expiry bounds,
   root-abort binding, operation-scoped one-use/replay lifecycle and an owned
   exact-allowlist HTTPS transport. The transport must pin exact
   endpoint/method/query/header/status profiles including `200`/`404`/`412`,
   public-address DNS resolution and connected peer, verify TLS/server name
   before header/body commit, reject redirects/retries/proxies/compression,
   bound bytes/deadlines and clean late responses;
2. close every remaining M2b live identity gate: exact Vercel Preview OIDC and
   custom audience through Google STS to the pinned service account, plus
   independently verified WIF, impersonation, KMS parent/version/IAM and
   least-privilege bucket IAM control-plane evidence;
3. authenticate the exact bucket, location, uniform bucket-level access,
   public-access prevention, soft-delete, versioning, retention, holds,
   lifecycle and post-change propagation state;
4. independently prove absence, expiry or purge of historical noncurrent,
   soft-deleted, retained and backup copies;
5. run the exact reviewed revision on a separately authorized disposable,
   no-data Preview and retain content-free setup, result and teardown evidence;
6. complete the Supabase purpose credential/session boundary, persistent
   maintenance, exact-version decrypt/consume, worker composition and a
   separately approved scheduler; compose the formal submitter, stager and
   maintenance only after that evidence is current, then review the UI/API
   activation gates;
7. separately approve model policy, budget, kill switch and model-call
   evidence; and
8. obtain separate deployment and Production approval. Real care data remains
   outside scope until those gates are closed.
