# Communication Note secure submission runtime M1z

## Status

M1z is a source-only, default-off security boundary for the future
Communication Note submission path. It adds reusable cryptographic, database
admission and payload-maintenance cores without making that path runnable.

- Formal Cookie principal: conditionally installed under the exact reviewed
  Preview binding; every failed binding leaves it `undefined`.
- Formal submitter composition: `undefined`.
- Formal encrypted-payload stager: `undefined`.
- Formal encrypted-payload maintenance: `undefined`.
- UI compile-time readiness: `false`.
- API compile-time readiness: `false`.
- Points admission repository readiness: `false`.
- Hosted/Supabase/Production migration application: none; isolated disposable
  local PostgreSQL 16 validation only.
- Cloud resources, deployment, real care data and model calls: none.

This is not deployment, activation, Preview or Production evidence, and it is
not a claim that Communication Note generation is ready to launch.

## Formal Cookie principal boundary

`communication-note-generation-principal-composition.server.ts` now exports a
formal composition by calling its guarded factory at module evaluation. The
factory constructs no Supabase client until a request arrives and returns a
resolver only when all of the following exact conditions hold together:

- the Communication Note principal, generation API and Product API master
  gates are exact `true`;
- the runtime is Vercel and both environment identities are `preview`;
- the platform project ID equals the separately configured expected project
  ID;
- the expected Supabase ref is a canonical 20-character ref and is not the
  pinned Production ref;
- server and public Supabase URLs are the same byte-exact canonical HTTPS
  origin for that ref; and
- server and public publishable keys are both present and equal.

The frozen configuration is revalidated during each request. Only then may one
request-scoped Cookie/authenticated client run the fixed
`getClaims -> snapshot revalidation -> resolve_v1_current_session_status() ->
getUser` sequence. Bearer credentials remain rejected. This conditional formal
installation does not activate the route because API readiness is still fixed
`false`, and the formal submitter remains absent.

## Provider-neutral encrypted staging core

`src/lib/v1/note-generation-encrypted-payload-stager.server.ts` supplies an
explicit injected-port factory. It performs no environment lookup and contains
no GCP, storage or model SDK adapter. Its source contract requires:

1. strict Communication cleaned-facts validation, a canonical hash recheck and
   a policy-bounded canonical byte limit before encryption;
2. a fresh random 32-byte data-encryption key and 12-byte IV for each new
   object;
3. AES-256-GCM with a 16-byte authentication tag and canonical additional
   authenticated data binding owner, idempotency, request, payload, retention,
   algorithm and immutable policy identities;
4. a fully qualified numeric KMS crypto-key-version resource. Aliases such as
   `latest` and `primary` are rejected;
5. an injected KMS-wrap port bound to the same additional authenticated data;
6. an injected private object-store port with atomic create-if-absent behavior;
7. exact replay for the same owner/idempotency/request binding and fail-closed
   conflict for a changed request or stored binding; and
8. exact-binding, idempotent abort only after the database explicitly reports
   that the payload was not accepted.

The public receipt exposes only `jobId`, `payloadId`, `payloadHandleHash`,
`payloadExpiresAt`, `payloadPolicyVersion`, `payloadPolicySnapshotHash`,
`encryptionProfileVersion`, `kmsKeyVersionResourceHash` and
`backupDispositionVersion`. It exposes no plaintext, data-encryption key,
wrapped-key bytes or physical object locator.

The existing payload-policy snapshot digest remains the canonical digest of
`policyVersion`, `encryptionProfileVersion` and
`backupDispositionVersion`. The exact numeric KMS resource is independently
hashed and bound through `kmsKeyVersionResourceHash`; it is not folded into the
historical catalog digest.

## Policy-bound 20-Point database admission source

`supabase/migrations/20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql`
is a Production-unapplied source migration. It adds the exact KMS key-version
resource hash to the private payload-policy/payload binding and defines a
19-argument private Communication Note plus fixed-20-Point admission function.
The wrapper requires the staged receipt's policy version, existing three-field
policy digest, encryption profile, KMS resource hash and backup disposition to
match one approved shadow catalog row and the final persisted job/payload state.
Deferred final-state checks prevent a paid Communication payload from
committing with an incomplete or changed binding.

The migration also defines
`careslink_v1_generation_points_admission_caller` as a credentialless
`NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` purpose shell. It receives only the exact
private function execution boundary and cannot fall back to the predecessor
Points coordinator or generic five-Note admission function. It is not a login
credential, Data API role, service-role grant or installed runtime caller.

`note-generation-owner-repository.server.ts` can adapt an explicitly injected
query capability to this 19-argument call. The factory creates no pool,
credential or connection, performs no environment lookup and remains formally
unwired with readiness `false`.

## Reconciliation and retention maintenance core

`src/lib/v1/note-generation-encrypted-payload-maintenance.server.ts` supplies a
second explicit injected-port core over content-free candidate DTOs. It has no
scheduler, environment lookup, cloud adapter or model call.

`reconcileStaged(limit, now)` uses an atomic candidate lease and exact admission
lookup:

- `ACCEPTED` confirms retention and must leave the candidate discoverable by
  the expiry index;
- `REJECTED` performs an exact-bound delete;
- `MISSING` and `AMBIGUOUS` remain deferred while `now < payloadExpiresAt` and
  may be deleted only when `now >= payloadExpiresAt`; and
- candidate, admission or delete binding mismatches are quarantined and never
  widened into a delete.

`sweepExpired(limit, now)` admits only candidates whose persisted expiry is at
or before `now` and uses the same exact delete binding. `DELETED` and
`ALREADY_DELETED` count as success only under the port contract's durable,
same-binding tombstone semantics. A bare object-store `NOT_FOUND` is not proof
of prior deletion and is quarantined. Unknown delete outcomes remain replayable,
so a committed delete followed by response loss can later resolve through the
exact tombstone. The maximum batch size is 100 and concurrent implementations
must lease disjoint candidates.

## Activation state

| Boundary | M1z state |
|---|---|
| Browser UI | compile-time closed; sends no reviewed facts |
| M1x API | compile-time closed; default request returns fixed no-store `503` before auth/body |
| Cookie principal | formal exact-Preview-conditional composition installed; no live Preview proof |
| Submitter | provider-neutral core exists; formal composition is `undefined` |
| Encrypted staging | provider-neutral core exists; formal stager and real adapters are absent |
| Database admission | migration and injected-query repository source exist; migration is unapplied to every Supabase project and no caller credential exists; isolated local PG16 evidence is non-runtime only |
| Maintenance | reconciliation/sweep core exists; formal singleton and scheduler are absent |
| Worker payload consumption | still has no usable encrypted-vault grant |
| Provider/model | no call path was added or invoked |

## Verification at this checkpoint

The M1z focused source gate passed **232/232 tests**. The complete local Vitest
suite passed **3101/3101 tests across 219 files**. TypeScript, zero-warning
ESLint, the 73-file adapter-sync check, `git diff --check`, the optimized Next.js
build and the M1r–M1u client boundary across 27 static chunks also passed.

The exact final migration also passed a disposable, passwordless,
private-Unix-socket PostgreSQL 16 Hosted-like gate. With zero historical paid
Communication rows it committed, created both KMS columns and left the caller
with only its single inert bootstrap-superuser ADMIN/non-INHERIT/non-SET edge;
all temporary SET edges were absent afterward. A second fresh cluster with one
synthetic paid Communication row failed at the explicit
`V1_POLICY_BOUND_ADMISSION_EXISTING_PAID_ROWS_UNSAFE` preflight and rolled the
whole migration back: no caller, KMS column or temporary membership remained.
The maintained PostgreSQL 16.15 terminal-settlement harness was then upgraded
to the 19-argument bound coordinator and passed all 21 selected migrations and
6/6 settlement/concurrency scenarios; SQL cleanup, posture postcheck, server
shutdown and temporary-root removal all completed successfully.

These results do not attest a Supabase/Hosted migration, cloud object, KMS
operation, hosted Cookie session, deployment, real care data or model request.

## Remaining implementation and approval gates

Before any activation claim, all of the following still require separate
implementation, review and current-revision evidence:

1. a real exact-version KMS wrap adapter and approved key custody/rotation
   policy;
2. a private object-store adapter with conditional create, private read,
   exact-binding deletion, durable tombstones, retention and backup behavior;
3. a credential/query adapter for the purpose-scoped `NOLOGIN` admission caller,
   without a service-role or generic database fallback;
4. persistent candidate, exact admission-lookup and exact-delete adapters for
   reconciliation/sweeping, plus a separately approved scheduler/operator;
5. application of the migration and same-revision active/revoked Cookie,
   policy-rotation, Points and cleanup tests on an authorized disposable no-data
   Preview;
6. formal submitter/stager/maintenance composition and owner job/document
   recovery without exposing private payload fields;
7. a worker consume path that can obtain a bounded, single-use vault grant;
8. provider/model policy, credential, budget/kill-switch and evidence approval;
   and
9. separate deployment and activation approval. Production and real care data
   remain outside this source batch.

## Relationship to earlier checkpoints

M1x froze the HTTP/Cookie boundary, and M1y connected the browser and TestOnly
submission order while leaving both formal compositions absent. M1z does not
rewrite those historical snapshots. It records the successor state: the formal
principal is now conditionally installed, while the submission, vault,
maintenance, database-caller, worker-consume and activation boundaries remain
closed.
