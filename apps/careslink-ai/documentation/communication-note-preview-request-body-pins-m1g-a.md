# Communication Note Preview request-body pins M1g-a

> Historical checkpoint: M1g-b now adds a separately default-off source
> contract for externally trusted owner Ed25519 authorization, an atomic
> single-use claim, per-slot reservation and CaresLink-signed internal dispatch
> observations. Its readiness remains `false`, approved keys/callers/transport
> are absent and `providerAttestation=ABSENT`. See
> `communication-note-preview-owner-authorization-m1g-b.md`.

## Status

M1g-a source-pins the exact JSON request-body strings used by the bounded,
synthetic Communication Note contract-test runner. It does **not** authorize or
perform a paid OpenAI call.

| Boundary | M1g-a state |
|---|---|
| Request serialization version | `wire.communication.openai.responses.2026-08-27.m1g-a.v1` |
| Request-body pin version | `pin.communication.openai.synthetic-request-body.2026-08-27.m1g-a.v1` |
| Request-body pin bundle digest | `90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8` |
| Runner version | `runner.communication.openai.synthetic-preview.2026-08-27.m1g-a.v2` |
| Runner digest | `a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4` |
| Ordered evaluation slots | 6 slots, comprising 3 distinct request bodies used twice each |
| Pin scope | OpenAI Responses JSON request body plus application-envelope policy; not HTTP/TLS transport bytes |
| Pin authenticity | `UNATTESTED_SOURCE_PIN_ONLY` |
| Execution authority | `NOT_EXECUTION_AUTHORITY` |
| External owner approval | absent |
| Dispatch attestation | absent |
| Paid readiness | `false` |
| Key, real network transport, route, worker and deployment | absent and unchanged |

The source name `wire` denotes the application-level request serializer. The
contract explicitly records
`APPLICATION_HTTP_ENVELOPE_NOT_TRANSPORT_BYTES`: it does not pin DNS, TLS, HTTP
framing, automatically added transport headers or bytes observed by OpenAI.

## Exact source pins

Each request is serialized once with `JSON.stringify`, encoded as UTF-8 without
a byte-order mark and measured before it can reach the injected transport. The
bundle independently records three values for every distinct synthetic body:

- SHA-256 of the exact UTF-8 JSON body;
- exact UTF-8 byte length;
- SHA-256 of canonical JSON for semantic comparison.

The raw-body hash is deliberately separate from the semantic canonical hash.
Reordering object keys, changing JSON whitespace or using a different
semantically equivalent serialization can preserve JSON meaning while changing the
exact body bytes; such drift fails the body pin.

| Synthetic fixture | UTF-8 bytes | Exact body SHA-256 |
|---|---:|---|
| `communication.en.phone-duration.v1` | 2,522 | `98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213` |
| `communication.zh-hans.mixed-video.v1` | 2,589 | `3692fa0e0fd7461829204ddb2767e3cb620aacf0a2c8db20baabd9d62d10d3d6` |
| `communication.zh-hant.in-person.v1` | 2,657 | `0ac00c5037388bd1d8d6d96a28a2d909369d6d75a7d93795d6e86e339da96fc1` |

The ordered bundle retains all six manifest slots rather than collapsing them
to a three-hash set. For each fixture, ordinals 1 and 2 intentionally bind the
same body hash and byte length. This source ordering remains subordinate to the
runner's six-call, serial, one-attempt and no-retry controls; the pins alone do
not enforce a durable call count.

The application envelope also records the intended `POST` method, closed
Australia Responses endpoint, JSON content type, redirect posture and allowed
header names. The runtime Authorization value is explicitly excluded from
source, reports and digests. Recording that intended envelope does not attest
that an Australia-scoped project exists or that any request was sent.

## Mock-only enforcement

The M1g-a runner validates every rendered request against the literal slot pin
before token preflight. The branded contract-test provider validates the same
slot again, then passes the already validated `JSON.stringify` string unchanged
to the injected non-HTTPS mock callback. It does not reserialize the request.
Any body, byte-length, semantic digest, fixture or ordinal mismatch fails
closed.

The content-free mock report binds the request-body pin bundle digest and, for
each slot, the exact body SHA-256, UTF-8 byte length and semantic canonical
digest. Its validator compares those values directly with the literal source
pins; it does not rebuild a request and then use that rebuilt request as its own
expected value.

These checks prove consistency inside the source-only mock contract. The
transport callback remains arbitrary trusted test code and is not a network,
credential or capability security boundary. There is no built-in HTTPS
transport, API key input, environment lookup, served route or product runtime
importer.

## Authenticity and approval limits

The bundle declares `UNATTESTED_SOURCE_PIN_ONLY` and
`NOT_EXECUTION_AUTHORITY`. Its fixed digest detects source drift against the
reviewed constant, but SHA-256 is not a signature and does not identify or
authenticate an approver. M1g-a contains no external owner signature, trusted
signing key, signature verifier, durable approval claim or authenticated
dispatch receipt.

Likewise, a mock report containing the body hashes is not proof that those
bytes reached OpenAI. Future paid execution still needs separate external owner
authorization bound to both the request-body pin bundle and runner-policy
digests, plus an authenticated execution receipt proving that the dispatched
body digest matched the authorized slot. Full transport evidence, temporary-key
teardown and attributable human review remain separate requirements.

## Remaining paid-call blockers

M1g-a closes only the source JSON request-body reproducibility gap. A separately
authorized disposable synthetic Preview still requires fresh external evidence
for:

1. an Australia-scoped OpenAI project, project-scoped Zero Data Retention and
   the required Modified Retention amendment;
2. owner acknowledgement of out-of-Australia processing and Structured Output
   schema residency limits;
3. immediate model availability and pricing reconfirmation;
4. a temporary key, provider-side spend ceiling and verified teardown;
5. approved callers and a deployed durable implementation of M1g-b's
   source-defined atomic single-use approval claim, bound to the body-pin
   bundle and runner-policy digests;
6. approved receipt-key custody and a deployed implementation of M1g-b's
   CaresLink-signed internal dispatch observation, plus real, attributable
   human semantic review. The internal observation is not provider attestation.

Until those gates close, request-body-pin readiness, paid runner readiness and
evaluation readiness remain `false`; every approved snapshot remains absent.
No real care data is permitted, and M1g-a adds no provider call, built-in or
real network transport, database or Points write, route, deployment or
Production change.

## Verification status

Focused source tests cover literal body bytes, UTF-8 lengths, raw versus
canonical digests, six-slot ordering, drift rejection, unchanged mock dispatch,
independent report validation, content-free evidence and runtime import
isolation. The final focused, full-suite, lint, production-build, TypeScript,
adapter-sync and patch checks are recorded in `documentation/tests.md`.
