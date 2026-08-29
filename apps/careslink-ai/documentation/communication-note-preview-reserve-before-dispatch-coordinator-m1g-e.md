# Communication Note Preview reserve-before-dispatch coordinator M1g-e

## Status

M1g-e adds a **server-only, pure, `TEST_ONLY`, content-free transcript and
transition validator** for the bounded synthetic Communication Note Preview
evaluation. It describes the source contract that a future
reserve-before-dispatch coordinator would have to satisfy. It is not that
runnable coordinator and creates no execution capability.

| Boundary | M1g-e state |
|---|---|
| Coordinator version | `coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-e.v2` |
| Coordinator policy digest | `4649f620bc60425d5ca40d308d167110befd4a29c772e9877ddbeac5eaaa3531` |
| Capability | `TEST_ONLY_TRANSCRIPT_VALIDATION` |
| Input | explicitly injected plain-data transcript plus M1g-d candidate, already-verified M1g-b authorization, validated M1g-c custody snapshot and caller-supplied `now` |
| Output authenticity | `UNATTESTED_INJECTED_TEST_TRANSCRIPT` |
| Database source contract / runtime evidence | M1g-f reserve-result and runner-terminal structures are present in source; no trusted database result, terminal row or RPC call is supplied to this validator |
| Receipt check | CaresLink Ed25519 dispatch-observation signature verified against the injected `TEST_ONLY` custody snapshot |
| Provider attestation / wire-byte authority | `ABSENT` / `ABSENT` |
| Coordinator / activation readiness | `false` / `false` |
| Dispatch capability | `ABSENT` |
| Pre-run approval / post-run acceptance | `false` / `false` |
| Live factory | always throws the fixed unavailable error |
| Callback, environment, database or network port | none |
| Migration, hosted mutation, deployment or Production change | none |

The version and policy digest are literal source pins. They bind this source
contract only; they are not owner approval, database evidence, provider
attestation or authority to spend.

## What the validator cross-binds

Before it accepts a transcript, M1g-e revalidates the supplied M1g-c custody
snapshot and reruns the M1g-d activation preflight with the supplied candidate,
verified M1g-b authorization and custody snapshot. M1g-d must still return
`activationReady=false`; M1g-e does not suppress or reinterpret its five fixed
blockers.

The transcript then has to repeat the exact source bindings for:

- the M1g-d activation-preflight policy and canonical candidate digest;
- the M1g-b authority policy and verified authorization/run digests;
- the M1g-c custody policy and canonical custody-snapshot digest;
- the request-body-pin bundle, runner, evaluation plan, request template,
  manifest, golden-fixture and worker policy digests;
- the source-pinned provider, model, endpoint profile and endpoint URL digest.

Before a claim candidate is accepted, the transcript must also include an
exact six-slot runner preflight. Each slot repeats its fixture, ordinal and
request-body pins and supplies an integer input-token count from `1` through
`10,000`. The preflight fixes the projected cost at `20,130` micro-USD per
call, `120,780` micro-USD for six calls and the M1g-b maximum at `250,000`
micro-USD. These remain injected `UNATTESTED_TEST_ONLY` values, not a provider
quote or permission to spend.

These comparisons detect inconsistent injected objects. They do not establish
the external provenance of a trust-registry snapshot, provider setting,
database row, credential, managed key or human approval.

Input traversal permits plain data only and is bounded by array length, object
key count, depth and total node count. Proxies, accessors, aliases, custom
prototypes, unexpected keys, malformed hashes or UUIDs, non-canonical
timestamps and ordering inversions fail with one fixed sanitized error. A
successful result is rebuilt and recursively frozen.

## Candidate transition contract

M1g-e accepts only the following content-free candidate sequence:

1. one authorization-registration candidate bound to the M1g-c registration
   caller identity;
2. one exact six-slot runner-preflight candidate before the claim;
3. one fresh-claim candidate bound to the M1g-c dispatch caller identity and
   the authorization, run, authority-policy, request-body-pin and runner-policy
   parents, with at least the M1g-b minimum five minutes of authorization life
   remaining at the claim observation;
4. one to six exact source-pinned slot records in ascending slot order;
5. for each slot, a fresh reservation candidate bound to the claim,
   authorization and run before any transport event;
6. an optional transport entry, followed by a verified terminal receipt and a
   receipt-persistence candidate;
7. for `COMPLETED` only, exactly one runner-acceptance or runner-failure
   candidate after receipt persistence; only acceptance may precede another
   slot.

Reservation UUIDs and client-request HMACs must be pairwise distinct. Every
slot fixes attempt number `1`, `automaticRetry=false` and the exact fixture,
ordinal, raw-body digest, UTF-8 length and semantic request digest from M1g-b.
The raw claim token is prohibited from the transcript and result.

A reservation UUID may not reuse the claim UUID. The validator rejects
cross-role value reuse across static source/preflight/authorization/custody
evidence, client-request HMACs, transport OpenAI request/response HMACs, runner
provider-request hashes, runner candidate digests, receipt digest/signature
hashes and canonical fixture digests. This purpose separation prevents an
injected SHA-256-shaped value from being relabelled as unrelated evidence,
correlation or fixture identity; it is consistency checking, not proof of any
external identifier's provenance.

Client-request HMACs, transport-correlation HMACs, runner provider-request
hashes and receipt digest/signature hashes are globally unique. Same-role
runner candidate-digest repetition and canonical fixture-digest repetition are
allowed, while either value remains prohibited from reuse in another role.

For `COMPLETED`, `PROVIDER_HTTP_ERROR` and `TRANSPORT_AMBIGUOUS`, a matching
`TRANSPORT_ENTERED_TEST_CANDIDATE` event is mandatory. A
`LOCAL_PRE_DISPATCH_ABORTED` receipt requires `transport=null`. For
`COMPLETED` and `PROVIDER_HTTP_ERROR`, the signed receipt observation must be
no more than the policy's 30-second application-transcript candidate interval
after transport entry. A delayed `TRANSPORT_AMBIGUOUS` observation remains
allowed because ambiguity is already terminal and cannot retry. This timing is
not provider deadline attestation.

Any non-completed receipt is terminal, requires both runner result fields to be
`null` and forbids another slot. A `COMPLETED` receipt is not sufficient to
advance: its receipt must first be persisted and the slot must receive the
exact runner acceptance described below. Provider completion followed by a
runner failure is separately represented as terminal and no-retry. An
all-completed transcript is accepted only when all six slots are present and
every slot has runner acceptance.

Receipt persistence may be labelled either a first-insert candidate or an exact
replay candidate. The replay label never creates another transport event or
dispatch authority. Because no persistence RPC runs, both dispositions remain
unattested assertions in injected test data.

## Runner acceptance before continuation

Each `COMPLETED` slot requires
`RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE` after receipt persistence. The candidate
cross-binds the authorization digest, run-ID hash, claim UUID, reservation UUID,
receipt digest and receipt-signature SHA-256. It must also repeat the exact
golden-fixture digest, body pins and runner-preflight input-token count; reconcile
provider usage to the signed receipt; and repeat the receipt's calculated cost
upper bound. The validator checks accumulated completed cost and the worst-case
cost of all remaining slots against the 250,000-micro-USD run ceiling.

All seven critical checks must be exactly `true`:

- `STRICT_SCHEMA`;
- `SHARED_OUTPUT_PRIVACY`;
- `DATE_TIME_PARITY`;
- `NUMERIC_PARITY`;
- `DECISION_LANGUAGE`;
- `REFUSAL_ABSENT`;
- `HUMAN_SEMANTIC_GROUNDEDNESS`.

The three ordered human reviews for `en`, `zh-Hans` and `zh-Hant` must also be
present and passed. These are injected test candidates, not completed
attributable external human review or post-run evaluation approval;
`postRunEvaluationAccepted` remains `false`.

The runner's `providerRequestIdHash` and the receipt's OpenAI correlation HMACs
have no authenticated common identifier. The exact relationship is therefore
`UNATTESTED_NO_SHARED_IDENTIFIER`: equality is not accepted as a shortcut, and
neither field attests the other or proves a provider response.

## Runner failure and the missing durable continuation gate

After a signed `COMPLETED` receipt, the transcript may instead contain a
content-free `RUNNER_SLOT_FAILED_TEST_CANDIDATE` bound to the same
authorization, run, claim, reservation, receipt digest/signature and slot. Its
post-receipt reason is limited to cancellation, provider-evidence failure,
golden-evaluation failure, human-review failure or final report failure. It is
terminal and `noRetry=true`; it cannot coexist with runner
acceptance or precede another slot.

M1g-f now defines a private, forced-RLS, append-only runner-terminal ledger and
replaces the reserve RPC so a later slot requires a durable `ACCEPTED` terminal;
`FAILED` permanently consumes the run. The terminal executor has no runtime
caller or membership, however, and this validator still receives only an
injected candidate rather than a trusted RPC result. The injected failure
candidate therefore remains labelled `ABSENT_TEST_CANDIDATE_ONLY`, and
`DURABLE_RUNNER_TERMINAL_STATE_ABSENT` remains a runtime-evidence blocker.
Transcript ordering cannot substitute for the database lock boundary or prove
that a terminal row exists.

## Receipt verification and evidence limits

For every slot, the validator invokes the existing M1g-b `TEST_ONLY` receipt
verifier. The Ed25519 signature must validate under the receipt public key in
the supplied M1g-c custody snapshot and bind the exact:

- authorization digest, claim UUID and run-ID hash;
- reservation UUID, slot index, fixture and run ordinal;
- request-body SHA-256, byte length and semantic digest;
- client-request-ID HMAC;
- outcome, transport observation, bounded usage/cost fields and no-retry rule.

The verifier separately requires the signed receipt's `observedAt` to be no
earlier than the supplied candidate reservation time. That timestamp is not a
field in the signed receipt statement and is not thereby authenticated.

This cryptographically verifies a CaresLink-signed internal dispatch
observation. It does not verify an OpenAI signature, exact provider receipt,
billing, model execution or exactly-once delivery. Provider attestation remains
`ABSENT`.

The returned transcript is content-free and does not retain the raw receipt
signature or envelope. It also contains no claim token, request body, prompt,
cleaned facts, generated Note, provider response, raw API key, private key,
bearer credential or raw external identifier.

## `databaseReservedAt` remains a runtime-evidence gap

M1g-f's source migration now makes
`reserve_communication_note_preview_dispatch` return the database-written
`reserved_at` value on both fresh insert and exact replay; replay still grants
no dispatch authority. M1g-e has no database port and therefore still accepts
only a `databaseReservedAtCandidate`, marks the reservation and persistence
evidence `UNATTESTED_TEST_ONLY`, and labels the receipt's database binding
`CANDIDATE_TIMESTAMP_NOT_DURABLY_ATTESTED`.

The timestamp is range- and order-checked and supplies a lower bound for the
receipt observation time, but it is neither a signed receipt field nor proof of
the durable database row. `DATABASE_ATTESTED_RESERVED_AT_ABSENT` consequently
remains a fixed coordinator blocker until a separately reviewed runtime invokes
the new reserve result and supplies that trusted value without relabelling an
injected timestamp. A read-after-reserve lookup must not be introduced as a
substitute dispatch authority.

The transcript also contains no authenticated revocation observation. Its
ordered timestamps and exact `now` value are validation-clock consistency
checks only, not live dispatch freshness authority. In a future executable
path, authorization revocation and expiry must still be rechecked by the
durable reserve RPC under its lock and fresh database wall clock before that
RPC can grant a reservation. An injected transcript cannot simulate or replace
that linearization point.

## Readiness and blocked reasons

The five M1g-e blockers are literal, ordered and non-removable by transcript
input:

1. `ACTIVATION_PREFLIGHT_REMAINS_BLOCKED`;
2. `PRE_RUN_DISPATCH_APPROVAL_ABSENT`;
3. `PURPOSE_SCOPED_RUNTIME_PORTS_ABSENT`;
4. `DATABASE_ATTESTED_RESERVED_AT_ABSENT`;
5. `DURABLE_RUNNER_TERMINAL_STATE_ABSENT`.

The result retains `coordinatorReady=false`, `activationReady=false`,
`dispatchCapability=ABSENT`, `preRunDispatchApproved=false` and
`postRunEvaluationAccepted=false`. All earlier Communication Note readiness
and approval latches also remain unchanged. The live factory always throws.

## Explicit external-effects boundary

M1g-e exposes no callback or runtime port and performs no:

- authorization registration, durable claim, reservation, receipt or runner-terminal write;
- Supabase client construction, SQL execution, migration, role/grant change or
  Hosted Supabase mutation;
- environment lookup, credential or managed-key resolution, receipt signing,
  HTTPS request, OpenAI SDK call or provider control-plane operation;
- route, component, worker, queue, cron or product-runtime registration;
- Vercel configuration, deployment, retained Preview, paid call, spend,
  Production change or real-care-data processing.

The runtime-boundary gate quarantines the module to its focused source test. A
synthetic transcript assembled by tests is not evidence that any transition
occurred outside the process.

## Verification handoff

The maintained source gate must prove:

- the literal policy digest, fixed blocked reasons, preserved readiness and
  approval latches, and always-failing live factory;
- M1g-b/M1g-c/M1g-d source cross-bindings and mandatory M1g-d revalidation;
- registration → exact six-slot runner preflight → parent-bound fresh claim
  with at least five minutes remaining authorization → serial reservation →
  optional transport → signed receipt/persistence ordering;
- exact serial slots, fresh candidate states, unique identifiers, one attempt,
  no automatic retry and no continuation after a non-completed receipt;
- mandatory completed-slot runner acceptance bound to authorization/run/claim/
  reservation/receipt evidence, exact fixture/body/preflight/usage/cost, all
  seven critical checks and the three ordered locale reviews;
- terminal provider-completed runner failure with mutually exclusive
  acceptance/failure fields, plus the source-present but runtime-unobserved
  durable runner-terminal gate;
- cross-role purpose separation across static evidence, client/transport/
  provider correlation, runner candidates, receipts and fixture digests;
- explicit `UNATTESTED_NO_SHARED_IDENTIFIER` between the runner provider hash
  and receipt correlation HMACs;
- transport absent only for local pre-dispatch abort and present for every
  other receipt outcome;
- the 30-second candidate interval for `COMPLETED` and
  `PROVIDER_HTTP_ERROR`, while delayed `TRANSPORT_AMBIGUOUS` remains terminal;
- Ed25519 rejection of signed receipt drift across every signed reservation
  binding, plus separate rejection of candidate reservation-time drift or
  event-order inversion;
- exact-only receipt-persistence replay without new dispatch authority;
- explicit preservation of the live reserve RPC's future revocation/freshness
  linearization responsibility;
- bounded plain-data input, fixed errors, immutable content-free output and
  absence from every product runtime importer;
- absence of callback, database, network, environment, migration, deployment,
  paid-call and Production capability.

Final exact test, build and security evidence belongs in
`documentation/tests.md`. This document intentionally does not pre-record
prospective validation counts.

## Remaining activation work

A future separately approved, disposable synthetic Preview run still needs
authenticated external provenance; provisioned purpose-scoped runtime
identities and credential/key resolvers; a database-attested reservation time;
a fifth purpose-scoped terminal caller plus authenticated runtime port for the
source-defined database runner acceptance/failure gate; a reviewed executable
reserve-before-dispatch transport; completed attributable human review;
explicit final run approval; and verified teardown/absence evidence.
Production and real care data remain excluded.

## Successor source boundary

The source-only database continuation contract is specified in
[`communication-note-preview-durable-runner-terminal-m1g-f.md`](./communication-note-preview-durable-runner-terminal-m1g-f.md).
It does not make this transcript validator executable and does not satisfy either
runtime-evidence blocker.
