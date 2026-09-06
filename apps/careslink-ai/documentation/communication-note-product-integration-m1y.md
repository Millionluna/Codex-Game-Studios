# Communication Note product integration M1y

## Status

> Historical M1y snapshot: the bullets below describe the M1y closeout and are
> not rewritten as later capabilities arrive. The current M1z successor has
> conditionally installed the formal Cookie principal behind the complete exact
> Preview binding, while UI/API readiness remain `false` and the formal
> submitter/maintenance remain absent. See
> `documentation/communication-note-secure-submission-runtime-m1z.md`.

M1y connects the existing Communication Note page to the M1x generation API
in source, and connects that API to an explicit product-submission composition.
It does not activate generation.

- Page: `/ai-documents/communication-note`
- API: `POST /api/ai-documents/communication-note/generate`
- Cost: fixed `20 Points`, rechecked and reserved only by the database admission
- Handoff: durable database job in `QUEUED`; the request thread never calls a
  worker, provider or model
- API compile-time readiness: `false`
- UI compile-time readiness: `false`
- Formal principal composition: `undefined`
- Formal submitter composition: `undefined`
- Deployment, Preview mutation, Production mutation and model calls: none

The UI now has its own server-owned gate,
`CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED`. Exact `true` cannot
activate it: the independent UI and API compile-time latches are both `false`,
and the two formal server compositions are absent. The default page therefore
continues to show the browser-memory-only workflow and sends no facts.

## Frozen product path

When all future activation gates are separately reviewed, the source path is:

1. The server page requires the existing provider workspace session and loads
   only the Points snapshot used for preflight display.
2. The browser validates the structured facts, removes obvious identifier
   matches and requires both privacy/authority confirmations.
3. The UI gate and an `AVAILABLE`, affordable Points snapshot are required
   before the submit button can send anything.
4. The browser freezes one JSON body and one caller-owned idempotency key. All
   automatic status checks and manual uncertain-response checks replay those
   exact bytes and that exact key. Inputs remain locked after submission.
5. M1x rejects Bearer credentials, resolves an exact Cookie principal, checks
   same-origin HTTPS mutation transport, bounds and strictly parses the body,
   and repeats both the composer review and canonical privacy scan server-side.
6. The submission composition obtains an owner/type/schema/hash/version-bound
   privacy proof. A conforming issuer must replay the same proof for the same
   owner/idempotency/facts binding and reject a changed binding.
7. The exact canonical cleaned facts are staged through a future encrypted,
   retention-bounded vault port. A conforming stager must return the same
   receipt for an exact replay and reject the same owner/idempotency binding
   with a different request hash. Only payload IDs and SHA-256 bindings cross
   into database admission; no vault locator is returned to the route.
8. The purpose-scoped Points repository performs one atomic database admission:
   reauthorize the current session and privacy proof, accept the staged payload,
   reserve exactly 20 Points and persist a fresh attempt-zero `QUEUED` job.
9. The route returns only `{ created, job }`. The browser may replay the same
   request to observe the current owner-safe job state. It never decrements a
   displayed balance itself.
10. A separately registered asynchronous worker may later claim the durable
    row. It is not imported, invoked or scheduled by the page, client, route or
    M1y submitter composition.

## Response-loss and cleanup rule

An admission exception is ambiguous: the transaction might have committed and
the response might have been lost, or a retry might be using a session revoked
after the first commit. M1y therefore never purges staged facts on an exception.
The stable encrypted payload remains bounded by its original expiry for exact
replay, expiry cleanup or reconciliation.

Cleanup is requested only after a successful admission envelope has passed
strict exact-key, job-state, timestamp and binding validation and explicitly
states `payloadAccepted=false`. A malformed envelope, private extra field,
created job in a progressed state or cleanup failure maps to the fixed
default-off error and cannot leak private database/vault fields.

## Browser and response boundary

- Cleaned facts exist only in React memory until the independently gated submit.
- No draft facts or identifiers are placed in URLs, browser storage, history,
  logs, beacons or client-side cache APIs.
- Only one polling timer can exist. After 40 automatic status replays, polling
  pauses and offers an exact-request manual check. Unmount aborts only a pending
  browser request and clears polling; it does not claim to cancel a durable
  server job.
- Server errors use the fixed M1x vocabulary and localised fixed UI copy; raw
  exception, database, provider and vault messages are not rendered.
- Successful responses expose only job metadata and canonical
  document/revision IDs plus content hash after terminal success. Generated
  document content is not returned by this endpoint.

## Deliberately absent activation pieces

The source connection is not a runnable product until all of the following are
implemented and separately approved:

1. Install the formal Cookie-principal and submitter compositions under an
   exact reviewed non-Production target.
2. Implement and approve the idempotent encrypted payload-vault stager,
   retention/expiry sweeper, explicit-rejection purge and reconciliation path.
   Its receipt and database admission must atomically agree on the selected
   payload-policy digest, encryption profile, KMS key/version and backup
   disposition so a policy change cannot mislabel staged ciphertext.
3. Install the purpose-scoped Supabase Points admission repository and its
   least-privilege caller/grants after same-revision no-data Preview evidence.
4. Replace the worker payload-consume boundary that currently settles
   `PAYLOAD_UNAVAILABLE` instead of returning a usable vault grant.
5. Either implement a separately reviewed Communication-only registration
   contract, or complete and approve the policies for all five Note types
   required by the current aggregate registration. Its catalog/runtime
   activation set remains empty or closed.
6. Approve the provider/model policy, credentials, budget/kill switch and
   model-call evidence. M1y makes zero model calls.
7. Add owner-authorized job recovery plus a canonical document/detail viewer so
   a page reload can recover the job and terminal success can open the saved
   draft; M1y keeps replay material only in memory and displays only job state.
8. Pass current-revision browser/API/Auth/database/worker/Points/payload tests on
   a disposable no-data Preview, then obtain separate deployment and activation
   approval. Production and real care data remain outside that approval.

No environment variable should be configured as a shortcut around these
gates. Source tests exercise only explicit TestOnly factories and capabilities.

## Verification

- focused M1y application, UI/client, route, composition and runtime-boundary
  gate: 8 files / 135 tests passed;
- full Vitest suite: 216 files / 3,049 tests passed;
- TypeScript and zero-warning full ESLint: passed;
- Next.js 16.2.9 Webpack production build: passed, 64/64 generated pages;
- built-client boundary: 100 static chunk files passed;
- Codex adapter synchronization: 73 files passed;
- `git diff --check`: passed;
- independent UI and integration/security reviews: zero remaining P0/P1/P2.

These results are also recorded in `documentation/tests.md`. They are
source/build evidence only and do not constitute Preview, Hosted, provider,
model, real-data or Production evidence.

## Saved-result read slice (2026-09-07)

`GET /api/ai-documents/communication-note/documents/{documentId}` now selects
the current saved revision, or the exact revision named by `?revisionId=`.
It reuses the existing cookie/active-session Product API runtime and
`DOCUMENT_DETAIL` capability. The existing default-off, target and database
gates are unchanged. Reading does not consult Points, submit a job, invoke a
model, create a revision or write browser storage.

The response includes the selected content, revision identity/hash, language,
version metadata and the persistent draft notice. It omits owner/session IDs,
privacy-proof IDs, mutation IDs and checkpoint/job internals. Current-version
self-review status comes from the Product API; historical versions use
`UNKNOWN`, never the current revision's confirmation. Missing translations
remain absent. Missing, deleted, foreign-owner and non-Communication documents
do not expose content. All responses are private/no-store and non-indexable.

This is the result-reader/API portion of item 7 above, not completion of that
item. The canonical result page, success link, job recovery after reload,
editing, self-review mutation and export UI remain outstanding. Local tests use
synthetic data, the memory Product API and mocked RPC transport through the real
Supabase response parser; no hosted database or generation was exercised.

Verification for this slice: 2 focused files / 42 tests and the full 245 files /
3,727 tests passed. TypeScript, zero-warning lint on the added files, adapter
sync (73 files) and `git diff --check` passed. No browser page or production
build was exercised for this API-only slice.

## Canonical result-page slice (2026-09-07)

The owner-scoped result route now exists at
`/ai-documents/communication-note/documents/{documentId}`. It preserves the
approved green CaresLink identity and reverse Logo, and does not depend on the
generation UI, composer or Points flags. The server page first requires a real
Supabase provider account; demo-account query parameters are not accepted.

Private content is not serialized into the initial page HTML. After the server
gate, a same-origin client loader calls only the fixed document-detail API with
`credentials=same-origin` and `cache=no-store`. Its strict response parser
checks the exact status envelope, canonical/revision binding, three-locale
shape, version ordering, current-version binding, Communication-only fact
schema, content hash syntax, server save acknowledgement and the current versus
historical self-review discriminant. Invalid, late and superseded responses
cannot render backend text or an older principal's document.

After the provider gate, malformed document/revision identifiers return a
content-free not-found surface without mounting the loader. Extra query keys,
unsupported locale values and non-canonical UUID casing are redirected to the
fixed URL containing only a supported locale and validated document/revision
UUIDs; arbitrary query text is never forwarded to the private API.

The loader clears rendered content before rechecking on window focus, restored
visibility, cross-tab storage changes and BFCache page restoration. It also
clears and aborts on `pagehide`. The page path has explicit
`private, no-store`, no-referrer, no-sniff and no-index response headers. An API
`AUTH_REQUIRED` response replaces the current history entry with a fixed safe
login return path; `NOT_FOUND` and `UNAVAILABLE` remain distinct content-free
states.

The result surface renders the exact selected revision, English draft,
independent Simplified and Traditional Chinese review versions, explicit
missing-translation states, confirmed cleaned facts, review prompts and version
history. `Draft – review required` remains permanently visible.
`SERVER_ACKNOWLEDGED` is described only as saved, and `CONFIRMED` remains a
human self-review of a draft. Historical revisions display only `UNKNOWN` and
never inherit current confirmation. Generated `content.disclaimer` is not used
as a trusted product boundary. No edit, copy, self-review mutation or export
control is simulated.

Terminal `SUCCEEDED` generation state now exposes one exact canonical/revision
result link. Its normal click uses replace navigation to discard the composer
history entry and its in-memory facts. The URL contains only the document UUID,
revision UUID and explicit UI locale; it contains no facts, content hash, job
ID or idempotency key.

This completes the canonical result page and known-success entry portion of
item 7. It does not add owner-authorized queued/running job recovery after a
reload or lost terminal response. Editing, persisted self-review mutation,
saved-document indexing and revision-bound Copy/TXT/DOCX/PDF export also remain
separate slices.

Verification for the combined read/page slice: 8 focused files / 115 tests and
the complete 251 files / 3,779 tests passed. TypeScript and full zero-warning
ESLint passed. The Next.js 16.2.9 Webpack production build completed 64/64
generated pages and included both the result page and API as dynamic routes;
the client-boundary scan passed across 105 static chunks. A temporary synthetic
local-only route was used for a desktop browser visual and accessibility-tree
check, returned HTTP 200 without a Next error overlay or server error, and was
deleted immediately afterward. No Preview, deployment, hosted Supabase read,
Production mutation, real care data or model call was used.
