# Communication Note secure submission provider adapters M2a

## Status

M2a is a source-only, default-off successor to the M1z secure-submission
runtime boundary. It implements three explicitly injected provider protocol
adapters, but does not install them in the product runtime.

- Formal Google Cloud KMS adapter: `undefined`; readiness `false`.
- Formal Google Cloud Storage adapter: `undefined`; readiness `false`.
- Formal Points-admission purpose caller: `undefined`; readiness `false`.
- Formal encrypted-payload stager, submitter and maintenance: still
  `undefined`.
- Product UI and API readiness: still `false`.
- New environment variables, routes, schedulers and manifests: none.
- Cloud resources, Supabase changes, deployment, real care data and model
  calls: none.

This checkpoint is implementation evidence for local source contracts only.
It is not cloud-posture, Hosted Preview, deployment or activation evidence.
The GCS credential-handoff description below records the historical M2a
checkpoint. M2c later replaced that raw-token DTO with a tokenless
authorized-operation handoff; see
`documentation/communication-note-secure-submission-gcs-authority-handoff-m2c.md`.

## Exact-version Google Cloud KMS wrapping

`src/lib/v1/note-generation-google-cloud-kms-wrap-adapter.server.ts` adapts
the M1z data-key-wrap port to one exact numeric
`CryptoKeyVersion:rawEncrypt` request. Its constructor requires the exact key
version pin plus a fresh, module-branded key-version posture attestation, an
injected synchronous single-use credential handoff and an injected bounded HTTPS
transport. It performs no environment, Application Default Credential or
control-plane discovery.

For each call the adapter:

1. accepts exactly one 32-byte data-encryption key and non-empty bounded AAD;
2. rejects aliases and every numeric key version other than the constructor
   pin before requesting a credential;
3. requires the branded posture to remain fresh and bound to that same numeric
   resource, with purpose `RAW_ENCRYPT_DECRYPT`, algorithm `AES_256_GCM`,
   `SOFTWARE` protection and `ENABLED` state, both before the request and before
   returning its result;
4. accepts only a short-lived token for the exact Preview runtime service
   account when custody synchronously calls the consumer exactly once and
   directly returns that exact opaque operation; reading `.then`, awaiting,
   assimilating, wrapping or replaying it before ownership transfer fails
   before HTTP;
5. sends the plaintext/AAD CRC32C values to the exact numeric `rawEncrypt`
   endpoint with redirects disabled, automatic retries fixed to zero and one
   absolute five-second abort deadline;
6. requires exact resource name, `SOFTWARE` protection, successful input
   integrity flags, a 12-byte IV, 16-byte tag, 48-byte ciphertext and matching
   response CRC32C values; and
7. returns a canonical, self-describing wrapped-key envelope containing the
   exact key version, IV, tag length, ciphertext and integrity values needed by
   a future exact-version `rawDecrypt` adapter.

The adapter clears its mutable plaintext, AAD, request-body and decoded
response copies. Fixed failures contain no provider body, token or key bytes.
This source contract does not acquire WIF credentials asynchronously. A future
live custodian must acquire and validate a fresh token upstream, then perform
the exact synchronous handoff without caching or exposing it; no such issuer or
custodian is installed here. The injected port contract also forbids retaining
the handed-off operation. The adapter makes a competing adoption fail before
HTTP and makes post-close use inert, but source alone cannot attest that a
future custody implementation did not retain the reference.
Cloud KMS does not return the configured algorithm in `rawEncrypt` responses,
so the envelope's algorithm assertion depends on the required constructor
posture rather than on the response. The module's posture factory only checks
the structure, exact-resource binding, bounded freshness and opaque evidence
digest of injected claims. It neither fetches nor authenticates Google Cloud
control-plane evidence. Its brand and
`VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED` status are
therefore not live trust, provisioning evidence or activation approval.

## Private Google Cloud Storage object protocol

`src/lib/v1/note-generation-encrypted-payload-gcs-private-object-store.server.ts`
adapts the M1z private-object-store port to the Google Cloud Storage JSON API.
It derives the physical object name only from the configured prefix plus the
owner and idempotency digests. The physical bucket and object name are never
returned through the M1z receipt.

The protocol uses:

- metadata-first, generation-pinned and metageneration-pinned reads;
- canonical JSON bodies, strict metadata, byte limits and end-to-end CRC32C;
- multipart create with `ifGenerationMatch=0`;
- one exact bucket cross-bound across project/location policy, posture,
  credential scope and returned object metadata;
- fixed Preview runtime principal, least-privilege permission-set digest,
  short-lived single-use credential reference, zero automatic retries,
  redirect rejection and an adapter-enforced request deadline; and
- response-loss recovery by reading the current generation and revalidating
  the complete content binding.

An exact-binding logical delete does not issue an unqualified physical
`DELETE`. It first reads and verifies the current object, then atomically
replaces that same name with a canonical content-free tombstone under both
generation and metageneration match conditions. A replay is
`ALREADY_DELETED` only when that durable current tombstone proves the same
delete-binding hash. A bare `404`, different binding or changed generation is
never widened into proof of deletion.

The constructor rejects bucket posture evidence unless uniform bucket-level
access and public-access prevention are enforced, soft-delete retention is
zero, Object Versioning is disabled, retention/holds are absent, and the exact
lifecycle and backup-disposition identities match policy. The attestation must
also say the protection settings had already been effective for at least 30
seconds when observed and that historical noncurrent and soft-deleted object
versions were absent. It keeps the normalized exact-bucket claim and rechecks
its bounded freshness before every credential request. The adapter does not
obtain or authenticate that evidence itself, and the source tree contains no
deployed bucket or lifecycle rule.

A future live control-plane gate must prove the posture on the exact authorized
bucket and current revision after every relevant setting has propagated. It
must authenticate the injected history-absence claims and additionally prove
that no retained object or backup copy can outlive the encrypted-payload
policy. Turning off Object Versioning does not remove versions already created,
and changing a soft-delete policy does not shorten the retention already
attached to earlier deletions. The same-name tombstone protocol and a
self-consistent injected digest are therefore not live history-purge evidence;
composition requires a fresh inventory plus deletion/expiry evidence for any
prior history.

## Purpose-scoped Points-admission database caller

`src/lib/v1/communication-note-points-admission-purpose-caller.server.ts`
adapts the existing injected 19-argument Communication Note Points-admission
repository to a separately branded, single-use session lease. It deliberately
does not reuse the earlier runner-terminal credential resolver.

The adapter accepts only a fresh, secret-free, disposable/no-data Preview
target attestation and a dedicated resolver for
`COMMUNICATION_NOTE_POLICY_BOUND_POINTS_ADMISSION`. Each repository instance
can execute one enqueue only. Its lease must prove:

- PostgreSQL 17 on the exact non-default, non-persistent, Production-excluded
  target;
- direct or Session Pooler mode on port 5432 with full TLS verification and a
  pinned CA hash;
- one exclusive physical session, no transaction pooler, no prepared
  statements and no retry;
- a transient login role that may `SET ROLE` only to
  `careslink_v1_generation_points_admission_caller`, with no executor
  membership and no service-role fallback; and
- exactly one allowed RPC and its exact 19-parameter SQL statement.

The adapter bounds acquisition at five seconds, the single database statement
at 12 seconds, and session destruction and credential revocation at five
seconds each. An accepted lease and target must retain at least 25 seconds: the
12-second statement window, both sequential five-second cleanup windows and a
three-second scheduling margin.

Cleanup is fail-closed even after acquisition, query or response failure. The
session-destruction receipt must prove termination, zero active statements,
`SETTLED_OR_CANCELLED` in-flight disposition and non-reusability. The separate
revocation/tombstone receipt must prove the acquisition digest is tombstoned,
future and late issuance are atomically blocked, active-session count is zero,
all issued sessions are terminated, in-flight statements are settled and the
credential is revoked or was never issued. Those receipts, the resolver and
the connection implementation remain injected claims/capabilities: M2a does
not create a database credential, role membership, connection, pool or
Supabase control-plane operation, and source validation is not live quiescence
evidence.

## Provider constraints frozen by this source

- Cloud KMS `rawEncrypt` operates on an exact `CryptoKeyVersion`; AES-GCM
  returns the authentication tag appended to ciphertext and requires the IV
  for later `rawDecrypt`.
- Cloud Storage generation/metageneration preconditions provide the
  read-modify-write comparison boundary; `ifGenerationMatch=0` is create-only
  while a live object exists.
- Cloud Storage soft delete retains overwritten objects as well as deleted
  objects and is enabled for seven days by default on new buckets unless
  explicitly disabled. Object Versioning can separately retain noncurrent
  generations. Both are therefore required off and propagated, with historical
  noncurrent/soft-deleted versions proved absent, for this temporary encrypted
  payload policy.
- Supabase Direct and Session Pooler connections use port 5432 and retain a
  physical session. Transaction Pooler uses port 6543 and is incompatible with
  this caller's session-level role binding.

References:

- [Cloud KMS rawEncrypt](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/rawEncrypt)
- [Cloud Storage request endpoints](https://docs.cloud.google.com/storage/docs/request-endpoints)
- [Cloud Storage JSON API status codes](https://docs.cloud.google.com/storage/docs/json_api/v1/status-codes)
- [Cloud Storage request preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions)
- [Cloud Storage soft delete](https://docs.cloud.google.com/storage/docs/soft-delete)
- [Cloud Storage Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning)
- [Supabase Postgres connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)

## Verification at this checkpoint

The final focused gate passed **149/149 tests across 7 files**. The complete
local Vitest suite passed **3169/3169 tests across 222 files**. TypeScript,
zero-warning full ESLint, the optimized Next.js 16.2.9 Turbopack build with
64/64 generated pages, the M1r–M1v client boundary across 27 static chunks,
73-file adapter sync and tracked/untracked diff checks also passed.

Independent protocol/security review first identified late credential/session
work, incomplete response-buffer clearing, unproved KMS algorithm posture,
GCS propagation/history gaps and the redirecting `alt=media` endpoint. The
reviewed source now uses the direct `/download/storage/v1` media path and fails
closed on those conditions; the final scoped review has no remaining P0/P1/P2
finding. No live network, Supabase, GCP, Hosted Preview or Production test
belongs to this batch.

## Remaining implementation and approval gates

1. implement and independently review the real WIF credential custodians,
   bounded HTTPS transports and authenticated, exact-resource KMS posture
   issuer;
2. provision and attest the exact KMS version and exact private bucket IAM,
   then capture fresh post-propagation bucket posture plus absence, expiry or
   purge of every prior noncurrent/soft-deleted/retained/backup copy;
3. implement the Supabase purpose-caller credential issuance/revocation
   migration and exclusive Direct/Session Pooler connector with independently
   evidenced session/statement quiescence;
4. implement persistent maintenance candidate, admission lookup and
   exact-delete adapters plus a separately approved scheduler;
5. apply the unapplied migrations and run same-revision active/revoked Cookie,
   policy rotation, Points, KMS, storage and cleanup tests on one explicitly
   authorized disposable no-data Preview;
6. implement worker exact-version decrypt/consume and owner recovery without
   exposing private fields;
7. compose the formal submitter/stager/maintenance only after all evidence is
   current, then review the browser/API activation gates;
8. approve provider/model policy, budget, kill switch and model-call evidence;
   and
9. obtain separate deployment and Production approval. Real care data remains
   out of scope until those gates are closed.
