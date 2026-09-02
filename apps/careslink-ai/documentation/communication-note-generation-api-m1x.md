# Communication Note generation API M1x

## Status

M1x adds a real HTTP Route Handler boundary but does not activate generation.

- Path: `POST /api/ai-documents/communication-note/generate`
- Runtime: Node.js, dynamic, no-store responses
- Configuration: `CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED`
- Compile-time readiness: `false`
- Formal principal composition: `undefined`
- Formal strict-principal resolver: `undefined`
- Formal submission port: `undefined`
- UI connection: absent
- Model, Points, database, payload vault and worker calls: absent

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

The strict-principal factory accepts only explicit Cookie Auth and lazy
session-status RPC client factories. It does not use the loose
Workspace-account role mapper. A separate source-only wrapper now validates an
exact Vercel Preview and project ID, an exact 20-character Supabase ref distinct
from the pinned known Production ref, byte-exact canonical Supabase URLs,
matching `sb_publishable_`
keys and a dedicated `sb_secret_` with no generic-key fallback or reuse. It
revalidates the frozen configuration before each lazy client boundary, and the
privileged client cannot be created until verified claims provide canonical
user/session UUIDs.

That dedicated secret is still service-role-equivalent, bypasses RLS and can
exercise broader project authority outside this single application-code RPC
surface. It is not database-level least privilege. The wrapper's formal export
remains `undefined`, the formal principal resolver remains `undefined`, and the
Route Handler does not import or call the wrapper. Test environment/client
injection also requires an explicit TestOnly capability and is statically
quarantined. The Route Handler additionally does not import or call:

- the M1r–M1v Preview composition and cloud/provider bridges;
- `createTestOnlyCaresLinkV1NoteGenerationOwnerRepository`;
- the OpenAI Communication Note provider;
- memory or durable Points stores;
- a payload vault, PostgreSQL client, Supabase management API or GCP resource.

The M1r–M1v terminal port is synthetic Preview evaluation persistence, not a
product generation port. A future approved implementation must stage a
retention-bounded payload, bind an active session and server privacy proof,
reserve 20 Points, call a formal owner admission repository, and let a
registered asynchronous worker invoke an approved provider. The request thread
must never bypass that chain by calling the model directly.

The source guard does not query Supabase branch/control-plane metadata. It does
not prove that the configured ref is disposable, non-default, healthy or a
child of Production; those remain live Preview evidence requirements.

## Remaining activation gates

- rewire the source-only composition to the subsequent zero-argument
  authenticated self-session RPC, using the Cookie/authenticated client and
  removing the legacy privileged-key/two-argument RPC path without fallback;
- formal installation of that least-privilege principal composition plus live
  active/revoked-session evidence on a same-revision no-data Preview;
- trusted Provider role normalization compatible with the RPC's exact
  `app_metadata.role=provider` predicate;
- live privacy-proof owner/type/schema/hash/expiry binding;
- Points quote/reserve/job/commit-or-release transaction contract;
- encrypted, retention-bounded payload vault and orphan/purge recovery;
- formal owner repository factory, least-privilege caller and `EXECUTE` grant,
  with session/privacy reauthorization inside the enqueue transaction;
- registered worker runtime and approved provider/model policy;
- same-revision disposable no-data Preview, deployment and rollback evidence;
- separate owner approval for any cloud spend, provider call or Production step.

The later RPC migration provides source/local SQL evidence only. M1x and that
migration provide none of the remaining approvals and change no external
resource.

## Local verification

- focused M1x/principal-composition, Product-auth, session-SQL contract and
  runtime-boundary tests: 9 files / 196 tests passed;
- full Vitest suite: 204 files / 2,837 tests passed;
- TypeScript and full ESLint: passed;
- Next.js 16.2.9 webpack production build: passed, 64/64 static pages;
- Codex adapter sync: 73 files passed;
- `git diff --check`: passed.

These results are source/build evidence only. They do not represent a live
Preview, a model evaluation, a database gate or Production readiness.
