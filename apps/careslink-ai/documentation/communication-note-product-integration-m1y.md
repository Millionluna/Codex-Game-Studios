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
4. The browser freezes one JSON body and one caller-owned idempotency key until
   it receives a validated admission. While that first response remains
   uncertain in the mounted page, a manual retry replays the exact bytes and
   key. A validated admission moves to the owner job URL and drops that replay
   material instead of using the mutation as a status poll.
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
9. The route returns only `{ created, job }`. Once the response identifies the
   job, its owner-safe state is read through the separate metadata-only status
   boundary. The browser never decrements a displayed balance itself.
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
- No draft facts, request keys or content hashes are placed in URLs, browser
  storage, history, logs, beacons or client-side cache APIs. After admission,
  the URL carries only the non-secret job UUID and explicit UI locale.
- Only one status-read timer can exist. After 40 automatic GET checks, polling
  pauses and offers one real owner-status read. Unmount aborts only a pending
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
7. Install and prove the owner-authorized status reader against a separately
   approved no-data Preview. The canonical document viewer and source-level job
   recovery page now exist, but their formal read composition remains
   default-off and unproved against Hosted Auth/database state.
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

The saved result surface accepts only an exact canonical/revision link. Its URL
contains only the document UUID, revision UUID and explicit UI locale; it
contains no facts, content hash, job ID or idempotency key.

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

## Owner job recovery page slice (2026-09-07)

The source-level owner job route now exists at
`/ai-documents/communication-note/jobs/{jobId}`. The composer stops replaying a
successful admission as a status poll: after the first validated `{created,
job}` response, it clears the in-memory request-body/key reference and replaces
the page with the canonical job URL containing only the job UUID and explicit
locale. If that initial response is still uncertain, the same mounted composer
retains one exact-request manual replay path; no replay material is written to
browser storage or history.

The job page is independent of the Points, composer and generation UI gates.
Its server component first requires a real Supabase provider account, then
validates and canonicalises the job UUID and query. Malformed identifiers do
not bypass authentication or become an account/job oracle. Signed-out return
paths, canonical redirects and language links contain only validated job UUIDs
and one supported locale. The page and GET boundary are private/no-store,
no-referrer, no-sniff and non-indexable.

After that server gate, the client loader performs only owner-scoped,
same-origin metadata GETs. It permits one in-flight request and one timer,
checks `QUEUED` and `RUNNING` at 1.5-second intervals, pauses after 40 automatic
checks, and stops automatically for `SUCCEEDED`, `FAILED` or `CANCELLED`.
Focus, restored visibility, cross-tab Auth storage changes, restored network
and BFCache restoration clear the visible state before reauthorization;
`pagehide` and unmount abort and clear pending work, while request generations
discard late responses.

The green CaresLink status surface reports no percentage or completion estimate.
Success links the exact server-acknowledged document/revision and keeps
`Draft – review required` visible. Failed and cancelled jobs expose only a
clean new-note navigation, without pretending to retry, cancel or refund.
Unavailable state offers a real GET check; forbidden and missing jobs share one
content-free not-found description. English, Simplified Chinese and Traditional
Chinese copy are explicit.

This slice recovers a known job after refresh and after later status-response
loss. It cannot recover an initial admission response lost before the browser
receives the job UUID. Solving that case without persisting the idempotency key
requires a separately reviewed owner-scoped recent-job discovery boundary.
The source status composition remains default-off; no Preview, deployment,
Production mutation, real care data, Points mutation or model call is included.

Verification for this slice: 15 focused files / 218 tests and the complete 260
files / 3,883 tests passed. TypeScript, full zero-warning ESLint, the Next.js
16.2.9 Webpack production build with 64/64 generated pages, the 107-static-chunk
client-boundary scan, 73-file Codex adapter sync and `git diff --check` passed.
A temporary synthetic local-only route received a desktop browser,
accessibility-tree, console and framework-overlay check and was deleted after
inspection. This remains local source/build evidence only.

## Communication-only job-status database slice (2026-09-07)

The successor migration `20260906233034` adds the private
`get_v1_communication_note_job_status(uuid,uuid,uuid,text,text)` wrapper.
Its dedicated NOLOGIN/NOINHERIT/NOBYPASSRLS executor has no table privilege:
it may call only the existing owner status reader. That reader retains forced
owner RLS and both lock-aware fresh-session checks. The wrapper hides every
non-Communication Note with the same `NOT_FOUND` used for foreign and missing
jobs. Its empty search path, exact EXECUTE grants and separate caller follow
the [Supabase function-privilege guidance](https://supabase.com/docs/guides/database/functions)
and [owner RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

`careslink_v1_generation_job_status_caller` receives only private schema USAGE
and EXECUTE on that wrapper. It cannot call the generic five-Note reader,
enqueue/cancel functions, Points operations, or read tables directly. Neither
new role receives runtime membership or LOGIN. PostgreSQL 16 may retain the
creator's bootstrap ADMIN-only edge, with INHERIT and SET both false; the
migration checks this explicitly instead of claiming no administrative edges.

The injected server repository captures only a validated Cookie principal and
accepts `get({jobId})`. It sends five bound parameters through one fixed SQL
statement, validates the exact metadata envelope and UUID, and strips no
unexpected backend fields. Driver text and permission errors become fixed
unavailable responses; only the exact supported database codes survive.

The independent `COMMUNICATION_NOTE_JOB_STATUS_READ` adapter uses separately
branded target, resolver and session capabilities. It preserves the established
bounded acquire/query/destroy/revoke lifecycle without sharing Points admission
credentials. Each read uses one physical session, one statement and no retry.
Unique acquisition nonces distinguish requests started in the same millisecond;
timeout, abort, late completion, cleanup failure and request abort during cleanup
all prevent a successful response. Destruction and revocation must provide
bounded evidence of termination and an issuance tombstone. The adapter itself
opens no connection: a real credential issuer/transport must still be installed
and proved before formal composition can use it.

The new source adapter and recovery reader both remain default-off; the formal
recovery reader is still `undefined`. The migration and current source manifests
are now pinned at 47 files. Updating these pins does not update historical
Hosted evidence or authorize activation. The future recovery composition must
use an independent read flag and the strict Cookie/current-session principal
core; disabling new generation must not disable access to existing jobs.

Local database verification runs with
`node scripts/preview-e2e/communication-note-job-status-local-pg16.mjs`.
It creates its own Unix-socket-only PostgreSQL 16 cluster and accepts no target
arguments or database URL. Ten actual dependency migrations run through a
non-superuser CREATEROLE actor. Nine scenarios verify role attributes and ACLs,
all five states, no read mutation, hidden foreign/missing/other-Note jobs, expired
sessions, denied generic/write access and expiry while waiting on an Auth row
lock. The synthetic metadata fixture bypasses only FK triggers during setup;
CHECK constraints, production reader bodies and forced RLS remain intact.
This does not prove the admission lifecycle, Hosted Auth, PostgreSQL 17, TLS or
credential issuance. The owned local cluster and fixtures are removed after
process-exit confirmation.

Next: prepare the same-revision disposable no-data Preview gate for the exact
wrapper ACLs, actual session revocation and dedicated runtime credential
issuance/cleanup. Only after that evidence should the read composition be
installed in the existing job route. No deployment, Production access, real
care data, Points mutation or model call is part of this source slice.

Verification: the new repository/adapter gate passed 58 tests across 2 files;
the related source/manifest gate passed 151 tests across 7 files; the full suite
passed 3,941 tests across 262 files. TypeScript, full zero-warning lint,
64-page Webpack build and 107-static-chunk client-boundary scan passed. The
fixed local PostgreSQL runner passed all 9 scenarios and confirmed cleanup.

## Fixed no-data job-status Preview gate prepared (2026-09-07)

The [fixed batch contract](communication-note-job-status-preview-batch.md) and
`scripts/preview-e2e/communication-note-job-status-preview.mjs` are now runnable.
Default execution is offline check-only; live execution needs a fresh approved
disposable target and memory-only credentials. No Preview was created or tested
as part of this preparation slice. The new gate uses actual Auth sessions and
short-lived job-status-only logins, but only missing-job reads: it creates no
job/payload or Points mutation. After actual session revocation it requires both
the current-session RPC and the dedicated reader to reject the old session.

The probe is deliberately separate from the production credential issuer. It
does not fabricate issuer tombstone/destroy receipts for the source adapter;
source-adapter transport, populated Hosted RLS and browser Cookie composition
remain unverified and explicitly false in evidence. The operator must delete
the approved Preview and verify absence even after a failed/ambiguous run.
The formal recovery route, green visual identity and readiness flags are unchanged.

Next: obtain fresh one-batch authorization, run the fixed no-data Preview gate
and verify deletion. After reviewing that evidence, install and verify the real
read transport/Cookie composition and populated synthetic job flow before
connecting the existing job route. The probe alone is not a release gate pass.
