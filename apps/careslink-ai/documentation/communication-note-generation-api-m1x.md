# Communication Note generation API M1x

## Status

M1x adds a real HTTP Route Handler boundary but does not activate generation.

- Path: `POST /api/ai-documents/communication-note/generate`
- Runtime: Node.js, dynamic, no-store responses
- Configuration: `CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED`
- Compile-time readiness: `false`
- Formal principal composition: `undefined`
- Formal strict-principal resolver: `undefined`
- Formal submitter composition: `undefined`
- UI connection: source-wired by M1y behind a second compile-time and runtime
  gate; both compile-time latches remain `false`
- Formal-route model, Points, database, payload-vault and worker calls: absent

The environment value is intentionally insufficient. Even when it is exactly
`true`, the compile-time latch keeps the formal route closed and returns
`503 PRODUCT_API_DISABLED` before reading request headers, cookies, identity or
body bytes.

## Frozen request contract

The source-test seam receives an injected strict Cookie-principal resolver. It
is not evidence of live Cookie/Auth/session authority. The request
requires `application/json` and a 16–128 character safe `Idempotency-Key`. The
entire body is streamed through a
96 KiB byte limit and then parsed as an exact object; duplicate JSON properties
and unknown properties are rejected:

```json
{
  "sourceLocale": "en",
  "cleanedFacts": {
    "occurred_at": "2026-09-01T14:30:00+10:00",
    "contact_channel": "phone",
    "parties_by_role": ["support worker", "family representative"],
    "observable_facts": "De-identified observable facts.",
    "action_taken": "The action that was actually taken.",
    "stated_outcome": "Optional attributed outcome.",
    "follow_up": "Optional agreed follow-up."
  },
  "privacyReview": {
    "reviewedNoIdentifiers": true,
    "processingAuthorityConfirmed": true
  }
}
```

`noteType`, owner/user/session IDs, authorization material and any `*Token`
field are not accepted from the body. The server fixes the Note type to
`communication` and the service code to `note.communication.generate`.

## Admission order and privacy boundary

The route order is fixed:

1. compile-time readiness plus the independent feature gate;
2. presence of a formal submission port;
3. presence of the formal strict-principal resolver;
4. Cookie-only strict principal admission: reject every `Authorization` header,
   verify claims, prove the exact Auth session plus Provider eligibility, then
   match the authoritative Auth user;
5. same-origin HTTPS mutation transport;
6. idempotency header before content parsing;
7. bounded JSON and exact-key validation;
8. exact Communication Note schema and both literal confirmations;
9. the M1w browser scanner rerun on the server;
10. the V1 canonical scanner and cleaned-facts SHA-256;
11. injected submission and strict owner-safe admission/current-job parsing.

Errors use fixed V1 vocabulary, a server correlation ID, `no-store`,
`nosniff`, and no reflected facts, provider response, secret or exception text.
Fresh source-test admission returns `202`; an exact idempotent replay returns
`200` with the current durable job, including a valid progressed or terminal
state. Responses contain only owner-safe job metadata and, after success, the
canonical document/revision identifiers and content hash. Facts, owner/session
identity, privacy proof, idempotency material, payload/vault and provider data
are excluded. Runtime output is checked for exact keys, state/timestamp ordering
and status-specific result/failure invariants before serialization.

## Deliberate non-integration

The strict-principal factory accepts only explicit Cookie Auth through one lazy,
request-scoped Cookie/authenticated Supabase client. It does not use the loose
Workspace-account role mapper. A separate source-only wrapper validates an
exact Vercel Preview and project ID, an exact 20-character Supabase ref distinct
from the pinned known Production ref, byte-exact canonical Supabase URLs and
matching `sb_publishable_` keys. It creates one client per admitted request and
fixes the order as `getClaims` → frozen configuration revalidation →
zero-argument `resolve_v1_current_session_status()` → `getUser`. The RPC receives
neither an argument object nor caller-supplied user/session IDs.

The Communication Note composition reads no dedicated or generic privileged
key, creates no privileged client and has no fallback to the legacy
two-argument service RPC. Its formal export remains `undefined`, the formal
principal resolver remains `undefined`, and the Route Handler imports only that
formal placeholder; it neither installs nor calls the executable wrapper
factory. Test environment/client injection also requires an explicit TestOnly
capability and is statically quarantined. The Route Handler additionally does
not import or call:

- the M1r–M1v Preview composition and cloud/provider bridges;
- `createTestOnlyCaresLinkV1NoteGenerationOwnerRepository`;
- `createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository`;
- the OpenAI Communication Note provider;
- memory or durable Points stores;
- a payload vault, PostgreSQL client, Supabase management API or GCP resource.

The M1r–M1v terminal port is synthetic Preview evaluation persistence, not a
product generation port. M1y adds a source-only submitter composition and the
route imports its formal placeholder, but that formal export remains
`undefined`. Its TestOnly seam fixes the order as privacy proof, stable
retention-bounded encrypted-payload staging and atomic 20-Point admission ending
at a durable `QUEUED` row. It never invokes a worker or provider. The later
terminal-settlement source described below completes the database transaction
boundary, but a future approved implementation must still install a registered
asynchronous worker and approved provider. The request thread must never bypass
that chain by calling the model directly. See
`documentation/communication-note-product-integration-m1y.md`.

The source guard does not query Supabase branch/control-plane metadata. It does
not prove that the configured ref is disposable, non-default, healthy or a
child of Production; those remain live Preview evidence requirements.

## Communication Note atomic 20-Point admission — source only

Migration
`20260902063211_add_v1_communication_note_points_admission.sql` supplies the
unapplied private transaction that M1x previously left as a future boundary.
Fresh admission produces a `QUEUED` job at attempt 0, an `AVAILABLE` payload and
one reservation at the fixed `2026-08-09.v1-shadow` Communication rate of
exactly 20 Points. Same-key replay rechecks the binding, current session, privacy
authority and expiry state and writes nothing. An owner-wide advisory lock plus
deterministic lot order prevents oversubscription; any failure inside that
admission statement/transaction rolls back both domains.

The corresponding server adapter is fixed `READY=false`, TestOnly, opens no pool,
reads no database URL, and has no route importer or caller grant. Its result DTO
omits private binding and Points IDs. This is an API-minimization guarantee, not
a claim that public Points IDs are invisible: the authenticated owner retains
historical RLS reads of their own quote, reservation, allocation and ledger rows.

The admission batch initially left paid jobs quarantined in `QUEUED`; the
successor below now replaces that source-only quarantine with exact paid worker
and terminal rules. There is still no welcome grant or legacy-credit change.
A21 provides serial rollback-only evidence; separate local PostgreSQL 16.15
three-client evidence
covers fixed-20 same-key replay, different-key oversubscription, authority/
expiry failure and generic terminal-operation denial. It is not Hosted,
Production, deployment or activation evidence. Full evidence and cleanup facts
are recorded in `documentation/tests.md`.

## Communication Note atomic Points terminal settlement — source only

Migration
`20260902121601_add_v1_communication_note_points_terminal_settlement.sql`
keeps the existing API and worker envelopes unchanged while coupling paid
terminal state to Points. Success can commit the exact 20-Point reservation only
beside a verified canonical document/revision, sync change, mutation receipt,
provider evidence and purge request. Permanent failure and cancellation release
the exact source-lot allocation; retryable lease expiry keeps it `RESERVED`.
Exact terminal and admission replays revalidate the immutable aggregate and
write nothing.

The migration adds a separate `NOLOGIN`/`NOBYPASSRLS` settlement role but gives
it no runtime member. Generic Points terminal functions, API roles and the
admission purpose role cannot mutate a bound reservation. Claim/recovery,
heartbeat, authorize and fence replay use fresh post-lock clocks and the pinned
worker policy's provider/commit safety margins. Per-registration recovery turns
prevent paid/unpaid and paid queued/running starvation. This remains an
unapplied, default-off source boundary—not a route, provider call or activation.

The final isolated PostgreSQL 16.15 gate passed its exact 20-migration chain,
all six terminal/concurrency groups, permanent ACL postcheck and complete
teardown. The pinned hashes and scenario-level evidence are recorded in
`documentation/tests.md`; they are local evidence only.

## Remaining activation gates

- formal installation of the source-wired authenticated current-session
  principal composition plus live active/revoked-session evidence on a
  same-revision no-data Preview;
- trusted Provider role normalization compatible with the RPC's exact
  `app_metadata.role=provider` predicate;
- live privacy-proof owner/type/schema/hash/expiry binding;
- formal installation of the source-only atomic Communication
  admission/reservation and terminal-settlement repositories under an approved
  runtime principal;
- encrypted, retention-bounded payload vault and orphan/purge recovery;
- formal owner repository factory, least-privilege caller and `EXECUTE` grant,
  with session/privacy reauthorization inside the enqueue transaction;
- registered worker runtime and approved provider/model policy;
- independent UI activation plus an owner-authorized canonical document viewer;
- same-revision disposable no-data Preview, deployment and rollback evidence;
- separate owner approval for any cloud spend, provider call or Production step.

The authenticated current-session, atomic Points-admission and terminal Points
settlement migrations remain unapplied. Their source/local tests provide no live
Cookie/Auth/database evidence, none of the remaining approvals and no
external-resource change.

## Local verification

- authenticated current-session resolver/principal/composition/runtime-boundary
  tests: 4 files / 98 tests passed;
- full Vitest suite: 206 files / 2,860 tests passed;
- TypeScript and full ESLint: passed;
- Next.js webpack production build: passed, 64/64 static pages;
- Codex adapter sync: 73 files passed;
- fresh client-boundary scan: 100 static chunk files passed;
- `git diff --check`: passed.

These results are source/build evidence only. They do not represent a live
Preview, a model evaluation, a database gate or Production readiness.

The newer atomic-admission source/local evidence is intentionally reported
separately in `documentation/tests.md`; the historical M1x counts above are not
relabelled as an aggregate result for that later batch.
