# Communication Note Preview activation preflight M1g-d

## Status

M1g-d adds a **server-only, pure, `TEST_ONLY` activation-preflight
validator** for the bounded synthetic Communication Note Preview evaluation.
It cross-binds the source and candidate evidence assembled by M1g-b and M1g-c,
but it does not authenticate an external system, approve an activation or make
the paid evaluation executable.

| Boundary | M1g-d state |
|---|---|
| Preflight version | `preflight.communication.openai.synthetic-preview.2026-08-28.m1g-d.v1` |
| Preflight policy digest | `81ab3c3bac64f2f9205c2eb358e298d440e3735e5a9c0ed07a842058e6947e53` |
| Capability | `TEST_ONLY_CANDIDATE_VALIDATION` |
| Input | explicitly injected, content-free candidate plus already-verified M1g-b authorization and validated M1g-c custody snapshot |
| Observation consistency and freshness | candidate, owner-registry, receipt-custody, provider, database and human-review observations share one exact timestamp; it cannot be future, must be no earlier than authorization issuance/effectiveness or provider-credential issuance, and may be at most 5 minutes old |
| Candidate lifetime | at most 15 minutes and never beyond the owner authorization expiry |
| Provider evidence | six pairwise-distinct SHA-256 bindings for region, retention, Modified Retention, processing acknowledgement, model/pricing and monthly hard spend limit |
| Database evidence | exact, boundary-safe 36-migration manifest; four M1g-b/M1g-c migration/assertion artifact pins; candidate-only common-domain HMAC metadata for Preview/Production project references |
| Caller candidates | four ordered login-identity candidates, each bound to exactly one M1g-c caller shell and its 1/1/2/1 RPC mapping, with complete unprivileged-role/direct-ACL assertions |
| Receipt-key lifecycle | non-exportable active candidate plus access-log, rotation/revocation and teardown-plan evidence digests |
| Human review | 18 attributable reviews planned; results not started and final run approval absent |
| Valid candidate result | `activationReady=false` with five fixed blocked reasons |
| Live factory | always throws the fixed unavailable error |
| Migration | none |
| Environment, network, secret or runtime capability | absent |

The preflight policy digest is literal-pinned in the source module. It is an
integrity binding for this source contract, not a signature, owner approval or
external attestation.

## What the validator cross-binds

The validator accepts plain data only. Proxies, accessors, custom array
prototypes, unexpected keys, non-canonical timestamps, malformed hashes and
content-bearing extensions fail with the fixed unavailable error. Traversal is
bounded by array length, object-key count, depth and total node count before
canonicalization. A successful result is recursively frozen and contains only
the rebuilt candidate, its canonical digest, `activationReady=false` and the
fixed blocker list.

### M1g-b authorization and M1g-c custody

The candidate repeats the exact M1g-b authorization digest and signature
digest. It also carries the canonical SHA-256 of the complete validated M1g-c
custody snapshot. The supplied authorization and custody snapshot are
revalidated together, including authorization/run/project/temporary-credential
bindings, before any later candidate section is accepted.

This proves consistency between injected source objects only. M1g-d does not
operate the owner trust registry, authenticate its delivery channel, perform a
signing ceremony or independently establish the truth of an evidence digest.

### Owner trust and receipt-key lifecycle

The owner-trust candidate binds:

- the M1g-c registry snapshot and registry-reference SHA-256 values;
- the SHA-256 of the fetched registry bytes, which must equal the supplied
  snapshot digest;
- the exact registry observation time;
- separate authenticated-delivery, complete-revocation and attributable
  signing-ceremony evidence digests.

The registry observation must equal the overall candidate observation and be
no more than 5 minutes old. Receipt-custody, provider, database and human-review
sections must repeat that exact timestamp. It cannot precede authorization
issuance, authorization effectiveness or provider-credential issuance. These
checks establish candidate timestamp consistency only: no evidence digest is
recomputed from canonical external bytes or an independently authenticated
attestation. They do not prove that delivery, revocation, provider settings,
database posture or ceremony evidence was produced by an independent
authority. External provenance remains blocked.

The receipt-custody candidate must match the M1g-c custody reference, key ID
hash and Ed25519 public-key fingerprint. It remains
`NON_EXPORTABLE_ACTIVE_CANDIDATE`, with `privateKeyMaterialPresent=false` and
`exportAllowed=false`, and carries separate access-log, rotation/revocation and
teardown-plan digests. The validator cannot resolve the handle, access private
key material, sign a receipt, inspect KMS/HSM logs, rotate a key or perform
teardown.

### Six provider evidence bindings

The provider candidate must match the M1g-b authorization and M1g-c custody
bindings for the exact project, service-account credential reference and
source-pinned model. It fixes an active Australia project, Zero Data Retention,
the required Modified Retention amendment, processing acknowledgement and the
reviewed model/pricing evidence. The following six hashes must match the
corresponding M1g-b values and be pairwise distinct:

1. `regionEvidenceSha256`;
2. `retentionEvidenceSha256`;
3. `modifiedRetentionAmendmentSha256`;
4. `ownerProcessingAcknowledgementSha256`;
5. `modelAndPricingEvidenceSha256`;
6. `monthlyHardSpendLimit.evidenceSha256`.

These checks detect inconsistent candidate assembly. They do not query OpenAI,
bind the digests to authenticated provider-control-plane response bytes, prove
that a setting is currently active or turn evidence hashes into provider
attestation.

### Exact database manifest and caller candidates

M1g-d adds no migration. It pins the previously tested source artifacts:

| Database evidence | Exact pin |
|---|---|
| Migration count | `36` |
| Ordered migration basenames | `5bb377df2075029d3bce3aaf70e303bc7441b76e9d011cee9ba202872331232e` |
| Canonical ordered migration entries (`name`, UTF-8 byte length, per-file SHA-256) | `97e6e7be1907ae1b43bb8698f00e4a708a2c5b95f6875fe453aa43bbf0839fad` |
| M1g-b authority migration | `94f83498ea04053e7238a95bb9be0bb8a38ad0a76fa0e751390419800da51f7f` |
| M1g-c custody-caller migration | `e6b77e76406d8db1d68ad6e8da0d9d2dd88521c713047c0415aa60d29243d432` |
| M1g-b authority assertion | `9b1e0088e7e39b81e248815e8ce6e939f29220830feda2d177ffd230892b39db` |
| M1g-c custody-caller assertion | `7fa7fa9d4c9667005b36c1f72c95aaf2418131d05037b5ea347f83e0bfcf16d2` |

The target candidate must state that it is disposable, non-default,
non-persistent, `withData=false`, non-Production, has zero fixture rows and has
zero active backends before the run. It also states one fixed
`HMAC-SHA256` purpose/version and one common key-reference digest for both the
target-project and Production-project reference HMACs; the two HMAC values must
differ and the database HMAC key reference must be purpose-separated from the
caller/provider HMAC domains. API roles receive no execution authority.

All project-reference HMAC values and the common-key reference are supplied by
the candidate. The validator neither resolves that key nor recomputes either
HMAC against an independently trusted project inventory. Consequently
`productionExcluded=true` and differing HMACs are structural claims, not an
attestation that the target is outside Production. Independent control-plane
provenance remains required under
`EXTERNAL_PROVENANCE_NOT_AUTHENTICATED`.

Four ordered caller candidates repeat the exact M1g-c purpose, caller shell,
executor and RPC list. Each candidate states:

- a distinct login-identity HMAC and `loginCapability=true`;
- no raw credential material, and `roleInherit=false`;
- `superuser=false`, `createRole=false`, `createDb=false`,
  `replication=false` and `bypassRls=false`;
- caller membership with `ADMIN=false`, `INHERIT=false` and `SET=true`;
- no executor-role, API-role or other caller-shell membership;
- no direct table, sequence or function privileges;
- `activeBackendCount=0` at preflight.

The database section also carries distinct session-confinement,
credential-rotation, membership-teardown and zero-backend-absence evidence
digests. These are candidate assertions only. The validator does not create a
login, issue a password, grant membership, open a database connection, inspect
Hosted Supabase or remove a backend.

These fields remain candidate assertions. The related M1g-c custody identities
are still `databaseLogin=false`, so a matching HMAC does not prove an actual
PostgreSQL login, credential possession, role membership or current catalog/
ACL/backend state. A later authorized operation needs an independently trusted
snapshot of role attributes, `pg_auth_members`, object ACLs and active backends.

### Cross-purpose digest isolation

The validator rejects reuse across all semantically distinct authorization,
custody, owner-trust, receipt, provider, database, caller and human-review
digests/HMACs/references. This includes service-account scope evidence, both
existing M1g-c HMAC-key references, provider service-account/key identity
HMACs, all four caller credential references, all six database artifact pins
and all four caller login HMACs. The sole intentional equality is
`fetchedRegistryBytesSha256 == registrySnapshotSha256`; it establishes only a
candidate digest equality, not bytes provenance.

### Human semantic review plan

The candidate binds an attributable reviewer plan and assignment through two
separate SHA-256 values. It requires 18 reviews, matching the six slots and
three language outputs, while keeping `resultsStatus=NOT_STARTED` and
`finalRunApproval=ABSENT`. A source runner callback or synthetic test reviewer
is not final human-review evidence. Review results and a final run approval must
be supplied only in a later, separately authorized operation.

## Time and provider-control semantics

All section observations must equal the owner-registry/candidate observation.
That timestamp cannot be future, may be at most 5 minutes old and cannot
precede authorization issuance/effectiveness or provider-credential issuance.
The candidate must still be live at validation time, may last no more than 15
minutes from its observation and may never outlive the verified owner
authorization. This is timestamp consistency, not external evidence freshness
or authenticity.

The OpenAI project service-account candidate explicitly records
`providerEnforcedExpiry=ABSENT`. Its `operationalExpiresAt` and `teardownBy`
values are CaresLink operational controls bound to the M1g-c `expiresAt` and
`revokeBy` values; they are **not a claim that the provider automatically
expires the API key**. A later operation must delete the temporary credential
or service account and verify absence by the approved deadline.

The provider hard spend limit is fixed at US$0.25 (`25` cents), requires the
provider interval `MONTH` and enforcement status `ENFORCING`, and is described
as a **monthly provider-side defence-in-depth limit**. It is not the per-run budget
and cannot replace M1g-b's application-enforced six-slot, one-attempt,
no-retry/no-fallback reservation contract and maximum 250,000-micro-USD run
ceiling. Both controls must agree; neither is execution authority.

## Readiness and blocked reasons

A structurally valid M1g-d candidate still returns `activationReady=false`.
The five blockers are literal, ordered and non-removable by candidate input:

1. `EXTERNAL_PROVENANCE_NOT_AUTHENTICATED`;
2. `RUNTIME_IDENTITIES_NOT_PROVISIONED`;
3. `KEY_RESOLVERS_AND_TRANSPORT_ABSENT`;
4. `HUMAN_REVIEW_NOT_COMPLETED`;
5. `FINAL_RUN_APPROVAL_ABSENT`.

All eight existing Communication evaluation readiness constants remain literal
`false`:

- provider readiness;
- Preview-evaluation readiness;
- runner readiness;
- request-body-pin readiness;
- execution-authority readiness;
- receipt-attestation readiness;
- key-custody readiness;
- caller-identities readiness.

All six existing approved values remain `undefined`:

- approved Preview evaluation;
- approved runner policy;
- externally approved request-body pin;
- approved owner signing key;
- approved receipt signing key;
- approved key-custody snapshot.

M1g-d does not add another readiness switch or approved snapshot. Its policy and
result carry `activationReady=false`, and its live factory always throws.

## Explicit non-goals and external-effects boundary

M1g-d does not add or perform any of the following:

- environment-variable lookup or an `.env.example` placeholder;
- `fetch`, OpenAI SDK construction, HTTPS or provider control-plane access;
- API-key, database credential, KMS/HSM handle or HMAC-key resolution;
- trust-registry loading, receipt signing, service-account creation or deletion;
- SQL execution, migration, seed, table, role, grant or Hosted Supabase change;
- route, component, worker, queue, cron, product-runtime importer or feature
  flag;
- Vercel configuration, deployment, retained Preview, paid call, spend or
  Production change;
- real care data, prompt text, cleaned facts, generated Note content, provider
  response body, raw identifier, bearer credential or private key.

No candidate digest, policy digest, source test or local build can be presented
as evidence that an external control is live.

## Verification handoff

The maintained source gate must prove:

- exact-key plain-data validation, fixed error behavior, immutable output and
  canonical candidate digest;
- exact M1g-b authorization and M1g-c custody cross-bindings;
- exact shared section observation time, five-minute candidate freshness,
  post-authorization/credential issuance ordering, 15-minute maximum candidate
  lifetime and owner-authorization expiry confinement;
- six pairwise-distinct provider evidence bindings and the separate monthly
  defence-in-depth versus per-run budget semantics;
- all six boundary-safe database pins, the 36-migration count, the candidate-
  only project-reference HMAC domain claim, the four ordered caller candidates,
  their full unprivileged/direct-ACL posture and zero-data/non-Production claim;
- KMS lifecycle/teardown and attributable human-review plan bindings without
  claiming that their external evidence is authentic;
- the fixed five blockers, `activationReady=false`, eight false readiness
  constants, six undefined approved values and always-failing live factory;
- absence of environment, fetch/SDK, secret resolution, database, route,
  deployment and paid-call capability.

Final exact test/build/security evidence belongs in `documentation/tests.md`.
This document intentionally does not pre-record prospective validation counts.

## Remaining activation work

A future disposable synthetic run still needs authenticated external
provenance; provisioned and independently audited runtime identities; approved
KMS/HSM, HMAC and credential resolvers; reviewed reserve-before-dispatch HTTPS
transport; completed attributable human reviews; explicit final run approval;
and verified teardown/absence evidence. Every such step requires separate
authorization. Production and real care data remain excluded.
