# Communication Note GCS private authority M2d

## Status

M2d is a source-only, default-off successor to the M2c tokenless GCS handoff.
It adds a private credential-authority implementation and a GCS-specific owned
Node HTTPS transport without installing either in the product runtime.

- Private-authority version:
  `google-cloud-gcs-private-authority.communication-note.2026-09-04.m2d.v1`.
- GCS HTTPS transport version:
  `google-cloud-gcs-https-transport.communication-note.2026-09-04.m2d.v1`.
- Private-authority readiness:
  `CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_READY = false`.
- GCS HTTPS transport readiness:
  `CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_READY = false`.
- Private-authority source status: `SOURCE_GCS_PRIVATE_AUTHORITY_NOT_COMPOSED`.
- GCS HTTPS transport source status: `SOURCE_GCS_HTTPS_TRANSPORT_NOT_COMPOSED`.
- Formal private-authority export:
  `CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D = undefined`.
- Formal GCS HTTPS transport export:
  `CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D = undefined`.
- Formal preparation path: fixed failure before OIDC, credential or network
  work.
- Private-authority execution entrypoint: explicitly `TEST_ONLY`; the transport
  factory is quarantined to that authority and source tests, with neither
  module available to product runtime importers.
- New environment variables, `.env.example` entries, migrations and schedules:
  none.
- Cloud resources, live network calls, Preview or Production changes,
  deployment, real care data and model calls: none.

M2d is local source and mocked-protocol evidence. The words "private
authority" and "owned transport" describe code ownership and the intended
credential boundary. They do not attest that Google issued a token, that IAM
permits an operation, that a bucket has the required posture or that any HTTPS
request reached Google.

## Private authority boundary

The M2c private-object-store adapter remains tokenless. M2d consumes its exact
authorized-operation request and supplies one fresh request capability for one
complete top-level `read`, `createIfAbsent` or `deleteIfBindingMatches`.
Credential acquisition completes privately before the synchronous M2c
consumer handoff. The authority then returns the consumer's exact opaque
operation directly; it does not read, await, wrap, Promise-assimilate or retain
that operation.

The source-only preparation path binds the exact Vercel Preview identity,
custom audience, Google STS exchange, pinned Preview service account, GCS
audience and scope, project, region, bucket, object prefix, required permission
set, upstream expiry and root signal. Each prepared handle and each derived
authorized-operation port are one-use. A GCS operation credential is requested
independently for that operation and is not a reused KMS operation token.

For the Vercel-to-STS-to-IAM identity exchange only, the authority reuses M2b's
owned provider-protocol HTTPS transport. It does not consume or compose the M2b
KMS trust handle, and that source reuse is not live provider or IAM evidence.

The outward handle and authorized-operation port contain no access token,
bearer header, service-account JSON, generic header map or credential lifecycle
DTO. Token and `Authorization` construction remain private to the authority and
its GCS transport. JavaScript token strings are immutable, so releasing their
references is not a reliable zeroization guarantee and must not be described
as one.

## GCS HTTPS transport boundary

The M2d transport is a GCS-only Node HTTPS implementation. Its admitted
profiles are limited to the exact `storage.googleapis.com` metadata, direct
generation-pinned media and multipart-upload endpoints needed by M2c. Method,
path, query, content headers, authorization class, body presence, response byte
cap and admitted `200`, `404` and `412` statuses are profile-specific.

The source transport requires all DNS answers to pass the public-address gate;
IPv6 is additionally fail-closed to the 15 Google-published prefixes in the
`goog.json` snapshot created `2026-09-03T13:03:54.692807` with sync token
`1788465834692`. It pins the approved resolution into the request, rechecks the
connected peer and preserves normal certificate and server-name verification
before secret headers or body bytes are committed. Redirects, automatic
retries, proxy configuration, compression, generic agents and caller-selected endpoints are rejected. Each request is
bounded to five seconds inside the M2c 30-second logical-operation deadline.
Root, operation and request aborts fail closed; mutable request, response and
late-response copies are bounded and cleared, while public failures remain
content-free.

These are source invariants exercised through mocked provider, DNS, TLS and
HTTPS boundaries. They are not a packet capture, Google response, billing
record or independently observed network result.

## Import and client boundaries

The M2d authority is the sole permitted non-test source importer of the M2c GCS
contract and the M2d GCS transport. The M2b provider-protocol transport has only
the historical M2b KMS trust module and this M2d authority as non-test source
importers. The M2d GCS transport does not import either authority, and no
product route, worker, submitter, stager, maintenance composition or scheduler
imports either M2d module. The M2c adapter does not learn about M2d and
continues to accept only its tokenless authorized-operation port.

Post-build scanning retains the historical M2a and current M2c markers and adds
both M2d version and source-status markers. This is a client-bundle and source
import quarantine, not proof of process-memory isolation or deployed runtime
composition.

## Verification status

The completed focused source gate covers cold import and fixed-failure formal
paths; exact authority requests; tokenless projections; clone, replay,
concurrency, expiry and abort lifecycle; synchronous direct return; exact GCS
transport profiles; DNS/TLS precommit; redirect/retry/proxy/compression denial;
authority-owned operation expiry, consumer-failure in-flight abort, globally
reachable address admission, late completion, byte clearing and fixed error
projection; plus an
M2c multi-request response-loss recovery operation using one session and a
fresh authority/port for the next top-level operation.

The final same-revision local gate passed **25/25 M2d tests across 2 files**
(13 authority and 12 transport), **105/105 focused regression tests across 5
files**, and **3265/3265 complete Vitest tests across 226 files**. TypeScript and
full ESLint with zero warnings passed. The Next.js 16.2.9 Turbopack production
build generated 64/64 pages, the client-boundary scan passed across 27 static
chunks, Codex adapter sync passed across 73 files, and `git diff --check`
passed. The first sandboxed build attempt was denied when Next tried to bind a
temporary local port; the same build succeeded with the required elevated local
execution permission. That restriction was environmental and not a code
failure.

All provider, DNS, TLS and HTTPS effects in the source tests were mocked. These
local results make no live network, Vercel/Google token, WIF/IAM, bucket,
Preview, cloud-resource, billing, deployment, Production, real-care-data or
model-call claim.

## Remaining implementation and approval gates

Before formal composition, all of the following remain required:

1. independently prove the exact live Vercel Preview OIDC and custom-audience
   exchange through Google STS to the pinned service account, including current
   WIF and service-account impersonation IAM;
2. independently verify least-privilege KMS and bucket IAM and the exact KMS
   parent/version control-plane posture. Mocked M2b or M2d exchanges are not
   that evidence;
3. authenticate the exact bucket, location, uniform bucket-level access,
   public-access prevention, soft-delete, versioning, retention, holds,
   lifecycle and post-change propagation state;
4. independently prove absence, expiry or purge of historical noncurrent,
   soft-deleted, retained and backup copies;
5. refresh and review the pinned Google IPv6 snapshot, then run the exact
   reviewed revision on a separately authorized disposable, no-data Preview and
   retain content-free identity, IAM, DNS/TLS, GCS operation and teardown
   evidence;
6. complete the Supabase purpose credential/session boundary with independently
   observed quiescence, persistent maintenance, exact-version decrypt/consume,
   worker composition and a separately approved scheduler;
7. compose the formal submitter, stager and maintenance only after all provider,
   bucket and database evidence is current, then separately review the UI and
   API activation gates;
8. separately approve model policy, budget, kill switch and model-call evidence;
   and
9. obtain separate deployment and Production approval. Real care data remains
   outside scope until those gates are closed.
