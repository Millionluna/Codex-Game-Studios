# Communication Note generation API M1x

## Status

M1x adds a real HTTP Route Handler boundary but does not activate generation.

- Path: `POST /api/ai-documents/communication-note/generate`
- Runtime: Node.js, dynamic, no-store responses
- Configuration: `CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED`
- Compile-time readiness: `false`
- Formal submission port: `undefined`
- UI connection: absent
- Model, Points, database, payload vault and worker calls: absent

The environment value is intentionally insufficient. Even when it is exactly
`true`, the compile-time latch keeps the formal route closed and returns
`503 PRODUCT_API_DISABLED` before reading request headers, cookies, identity or
body bytes.

## Frozen request contract

The source-test seam models an injected, already-resolved provider account. It
rejects bearer credentials and accepts the request only over same-origin HTTPS,
but it is not evidence of live Cookie/Auth/session authority. The request
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
3. an injected resolved provider account and role in source tests;
4. cookie-only, same-origin HTTPS mutation transport;
5. idempotency header before content parsing;
6. bounded JSON and exact-key validation;
7. exact Communication Note schema and both literal confirmations;
8. the M1w browser scanner rerun on the server;
9. the V1 canonical scanner and cleaned-facts SHA-256;
10. injected submission and strict owner-safe admission/current-job parsing.

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

The Route Handler does not import or call:

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

## Remaining activation gates

- strict provider/session authority integrated with the durable Product API;
- live privacy-proof owner/type/schema/hash/expiry binding;
- Points quote/reserve/job/commit-or-release transaction contract;
- encrypted, retention-bounded payload vault and orphan/purge recovery;
- formal owner repository factory, least-privilege caller and `EXECUTE` grant;
- registered worker runtime and approved provider/model policy;
- same-revision disposable no-data Preview, deployment and rollback evidence;
- separate owner approval for any cloud spend, provider call or Production step.

M1x provides none of those approvals and changes no external resource.

## Local verification

- focused M1x plus runtime-boundary tests: 4 files / 62 tests;
- full Vitest suite: 202 files / 2,765 tests;
- TypeScript and full ESLint: passed;
- Next.js 16.2.9 webpack production build: passed, 64/64 static pages;
- `git diff --check`: passed.

These results are source/build evidence only. They do not represent a live
Preview, a model evaluation, a database gate or Production readiness.
