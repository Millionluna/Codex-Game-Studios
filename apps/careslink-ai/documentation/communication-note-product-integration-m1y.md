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

## Job-status Hosted r1 — stopped at Auth cleanup (2026-09-07)

At clean source `5e365b1`, the authorized single no-data Preview applied all
47 migrations atomically on PG17. Actual login/current-session identity, exact
read-role ACLs, missing/mismatched reads, three dedicated physical credential
lifecycles and old-JWT rejection after real session revocation passed. The
probe nevertheless returned `ok:false` because `authCleanup:false` in its final
account-cleanup block; credential cleanup and database close were true. The
coarse checkpoint does not establish the exact failed cleanup substep.

The batch stopped without a retry. The exact Preview was deleted, three CLI
absence checks plus an independent MCP listing confirmed only healthy default
Production, and no runtime/UI flag was activated. See the
[r1 execution record](communication-note-job-status-preview-batch.md#r1-hosted-execution--2026-09-07)
for exact identity, pins, result and evidence limits. This is not a full gate pass.

Next: isolate the Auth-cleanup branch and add safe per-step regression/evidence
locally. Do not create another Preview or install the green-page read composition
until a fresh authorized replay proves the complete cleanup path. No source
repair, provider/model call, Points operation, deployment or Production SQL was
part of r1.

## Job-status Auth cleanup corrected locally (2026-09-07)

The fixed Preview batch is now `2026-09-07.job-status-read-preview.2`. A new
cleanup helper binds the exact synthetic email/user, checks current sessions,
skips redundant sign-out only when none remain, and requires independently
verified zero sessions before and after Auth account deletion. Active sessions
still require exact token/owner/session binding and successful Auth sign-out.
Per-step bounded, redacted evidence distinguishes the main probe stage from the
cleanup checkpoint; failure remains fail-closed without retries or broad HTTP
error acceptance. The old `.1` authorization envelope is rejected.

The actual pinned SDK with synthetic HTTP reproduces a repeated-sign-out
`session_expired` failure that prevented the old cleanup from reaching deletion.
This is a proved local weakness, not proof of r1's exact historical cause.
The [local correction record](communication-note-job-status-preview-batch.md#local-auth-cleanup-correction--2026-09-07)
records the evidence and limitations. All 3,998 tests across 264 files and all
17 local PG16 scenarios passed, including real local foreign-key denial with
simulated Auth ports. TypeScript, zero-warning lint, offline pins and adapter
sync passed; the local cluster was removed.

No cloud resources were created, no migrations changed and no UI/Logo, runtime
flags, Production, Points or model integration was touched. Next: obtain fresh
one-Preview authorization and replay `.2` through complete Auth cleanup and
verified branch deletion. The real source-adapter/Cookie composition and green
job-page connection remain subsequent work, not already-completed functionality.

## Job-status Hosted r2 — cleanup passed, advisor evidence open (2026-09-07)

The fresh authorized no-data Preview ran clean source `b8dcb40` and batch `.2`.
All 47 migrations applied atomically on PG17; the actual Auth/read-role probe
returned `ok:true`. Real session revocation, old-JWT denial, all three physical
read-role cleanups, Auth account-delete acknowledgement, account absence and
independent zero-session checks passed. This closes the corrected probe's Hosted
cleanup gap, not the historical diagnosis of r1.

The subsequent temporary lifecycle's security-advisor collection failed without
usable report evidence. Raw errors were not retained; the subsequent local
diagnosis below confirms a missing-`--linked` argument error in the pinned CLI.
No advisor pass or specific vulnerability is inferred. The lifecycle stopped,
deleted the exact Preview and verified absence three times plus independently by
MCP and a NotFound child-project lookup. Thus the probe passed, branch cleanup
passed, but the enclosing lifecycle reported `ok:false` for advisor collection.
See the [r2 record](communication-note-job-status-preview-batch.md#r2-hosted-execution--2026-09-07).

Next: local application-integration development for the real independent read
transport and Cookie/current-session principal, with default-off flags and the
approved green UI unchanged. Correct the advisor collection contract locally and
collect it during the next necessary populated-flow integration Preview, not a
standalone repeat of the passed cleanup probe. Real adapter transport, populated
Hosted flow, browser composition, advisors and activation approval are still
open; no deployment, Production access, Points or model call was performed.

## Independent job recovery source composition — 2026-09-07

`communication-note-job-recovery-composition.server.ts` now composes the actual
Cookie principal resolver, purpose-scoped job-status adapter and fixed owner
repository code. The shared recovery reader accepts asynchronous dependency
resolution; its TestOnly wrapper retains its original capability validation.

The read composition has an independent default-off
`CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED` flag, expected Supabase ref
and expected Vercel project id, documented as false/blank in `.env.example`.
It also requires the Product API gate and exact Preview platform identity,
canonical matching URLs and matching publishable keys. It excludes Production
and does not depend on the generation or Points UI flags. Environment values
alone cannot install the formal reader.

Each request gets a fresh Cookie client and checks `getClaims` → zero-argument
current-session RPC → `getUser` before resolving any database dependency.
Only the verified owner/session reaches the fixed five-parameter status query;
bearer transport is rejected before client creation. Disabled/drifting config,
wrong target, revoked sessions, timeout, abort and cleanup failure withhold job
data. The whole request is bounded to 30 seconds, including dependency resolution;
the existing adapter still owns its acquire/query/destroy/revoke limits and cleanup.
Responses retain fixed private/no-store headers and never echo arbitrary SSR
header values. No UI, Logo, generation, Points or export code was changed.

Evidence: 37 composition tests exercise the real principal/adapter/repository
modules using **synthetic Auth, issuer, query and cleanup ports**. They cover all
five Communication Note job states, call ordering, fixed SQL/owner binding,
revocation, errors, independent gates, per-request freshness, late completion,
cleanup and cache headers. Together with recovery-reader, advisor and runtime
boundary tests, the focused gate passed 110/110. Runtime import auditing allows
only this additional server composition, not a client or formal route importer.

This is **source composition, not a live connection implementation**. The
`resolveDatabase` port must still be backed by a real short-lived credential
issuer and exclusive physical connection; synthetic receipts are not Hosted
cleanup evidence. `COMMUNICATION_NOTE_JOB_RECOVERY_COMPOSITION_READY` remains
`false`, and `COMMUNICATION_NOTE_GENERATION_FORMAL_JOB_RECOVERY_READER` remains
`undefined`; the actual GET still returns fixed 503 without reading auth/job data.
No new Preview, deployment, Production action or model call was performed.

The security report failure was also diagnosed locally and a bounded read-only
Management API / MCP collector with strict report parsing was added. See the
[advisor correction](communication-note-job-status-preview-batch.md#local-advisor-collection-correction--2026-09-07).
This does not turn r2 into a security-review pass.

Next: implement the server-owned short-lived job-status credential issuer and
exclusive physical read-connection dependency locally, then prove that dependency
through this composition. After local proof, prepare one necessary populated
synthetic-flow integration gate with browser Cookie checks and the corrected
read-only advisors; resource creation and formal activation remain separately
bounded by authorization. Do not repeat a cleanup-only Preview or start visual
redesign.

## Job-status physical issuer local proof — 2026-09-07

The local implementation now contains a dedicated PostgreSQL read-credential resolver,
an exclusive `pg.Client` opener and a LOCAL-only SQL broker fixture. The opener
uses explicit connection settings, direct PG17 with pinned-CA verified TLS,
one fixed parameterized query, monotonic/wall-clock expiry checks and hard close.
The issuer code performs acquire → backend bind → committed login fence, then
fence/finalize with authoritative residue checks before reporting cleanup.
No default reader or route imports this new module; readiness is still false.

This is **local implementation and real PG16 proof**, not a working Hosted
issuer. The broker SQL is guarded to the owned Unix-only PG16 test cluster,
uses an invoker-only operator function and is **not a Supabase migration or a
deployable management service**. A reviewed deployment migration and dedicated
management-authority/control-plane connection are still required separately.
The trusted server composition must independently bind the selected project ref,
target evidence and broker connection; the resolver does not establish that
external authority by accepting their injected ports.
There is no generic credential lookup or grant to product/API/read roles.
The existing 47-migration Hosted probe remains unchanged.

The real-engine gate contains nine tests, including the actual source
resolver/adapter/repository, owner/session denial, durable replay/cancellation
fences, committed-fence requirement, privilege checks and HTTP composition.
All nine passed through the actual local database. Its Auth and PG17/TLS metadata
remain explicit synthetic fixtures around a TestOnly LOCAL PG16/Unix opener;
this does not prove Hosted PG17, verified TLS, browser Cookie handling or a real
GoTrue session. Runtime credentials authenticate with SCRAM, not local trust.
The complete local runner passed all 18 recorded scenario groups with
`sourceIssuerTests:9`, `hostedVerified:false` and
`cleanup:{stopped:true,removed:true}`. Durable revocation was checked using
fresh broker connections, with zero remaining runtime roles/sessions/memberships.

Initial local `initdb` attempts failed before SQL with `could not create shared memory segment:
No space left on device`. Read-only inspection found all 32 kernel slots in use
(`kern.sysv.shmmni:32`). Segments `3866624` (key `0x00830d6f`, creator PID 1037)
and `3932161` (key `0x00830e6b`, creator PID 1413) had zero attachments; both
creator processes were absent at the check. After explicit owner authorization,
both exact ids, keys, ownership, creation times, zero attachment counts and absent
creator processes were rechecked. Only those two segments were removed and their
absence verified; this IPC removal is irreversible. No unrelated process was
stopped, kernel setting changed or project/database file deleted. Failed runs
reported their owned directories removed.

The first real-engine setup exposed a restricted-setting permission check. The
existing local bootstrap identity now attests the private cluster settings, then
switches to the non-superuser operator for fixture DDL; no new privilege grant was
added. A second runner issue incorrectly parsed ANSI-colored test summaries;
the gate now requires Vitest's structured JSON success and exact passed/total
counts rather than matching display text.

Next: prepare the reviewed, deployable dedicated issuer migration and trusted
Preview target/control-plane binding locally. Only then prepare one necessary
populated synthetic-flow integration gate with real browser Cookie checks and
the corrected read-only advisors. Cloud creation and formal activation remain
separately authorized. No cleanup-only Preview repetition, new visual design,
Production change, Points operation or model call is included in this batch.

## Dedicated issuer candidate and bound Preview service — 2026-09-07

`communication-note-job-status-preview-issuer.server.ts` now supplies a working
server-owned dependency factory. It authenticates one fixed, read-only Supabase
branch-list request with an `environment:read` OAuth token, requires exactly one
matching non-default/non-persistent/no-data branch with a healthy Preview project
and no scheduled deletion, and derives a short-lived target descriptor from that
response. Duplicate, missing, stale, unhealthy or mismatched targets fail closed.
The request is bounded to five seconds and 128 KiB, without redirects or retries.
The endpoint/scope and response fields were checked against the official
[branch-list reference](https://supabase.com/docs/reference/api/v1-list-all-branches).

The selected project ref and one pinned CA are used to construct **both** the
management connection and exclusive runtime read connection. Real HMAC-SHA256
binds project refs to a server-owned key; only selected content-free metadata is
hashed. Database custody is not consulted until branch validation succeeds, and
must return a credential for that exact project. There is no ambient PG/DSN
fallback, generic SQL, shared pool or product/API role-management grant.
Each control operation opens a new direct PG17/TLS-verified `postgres` connection,
checks the existing non-superuser management posture and permits one fixed
autocommit issuer RPC. Abort hard-closes the socket. This keeps the existing
management operator's privileges; it does not create another privileged LOGIN.

The CLI-generated migration
`20260907083608_add_communication_note_job_status_issuer.sql` is retained under
`supabase/migration-candidates/`, **outside automatic deployment**. It replaces
the duplicated local broker fixture with invoker-only durable lifecycle SQL,
forced RLS, exact operation fields, replay tombstones, committed fencing,
role/OID identity checks and zero-residue finalization. Unknown inherited ACLs
abort installation. The previous 47-migration Hosted manifest is unchanged.
The exact candidate is now applied by the owned local test runner, not a copied
or rewritten test implementation. The remaining local SQL file is only a guard
for the private PG16/Unix fixture.

Real local proof: all 18 scenario groups passed with **12/12 source-issuer tests**,
including candidate installation by a non-superuser, no added usage of the
product schema, extra-field denial and three acquire/cancellation races across
independent connections. The result reported `hostedVerified:false` and
`cleanup:{stopped:true,removed:true}`. Initial setup failures exposed an
unnecessary schema-name resolution privilege and a PL/pgSQL CASE-parenthesis
error; both were fixed without expanding privileges. The reporter now emits only
fixed setup SQLSTATE/position classifications when Vitest omits hook failures.

Additional unit proof: 25 target-service tests use synthetic HTTPS/custody ports;
10 control-connection tests use a mocked `pg.Client`; three tests guard migration
placement and safety. Together with the earlier 19 issuer tests, these are source
checks, **not live OAuth, TLS, secret custody or Hosted PG17 proof**. The complete
suite passed 4,116 tests with the 12 real-engine tests separately selected.
TypeScript, zero-warning lint, the 64-page webpack build, 107-chunk client scan,
adapter sync and unchanged check-only Hosted manifest also passed.

Deployment/activation remains unapproved and unperformed. Both issuer readiness
constants remain false; only the new server component and tests reference the
physical connectors, and no formal route imports the service. The actual GET is
still fixed 503. The green UI/Logo, Production, Points and model operations are
unchanged. This is a local service component and migration candidate, not a
deployed management service or browser-to-database end-to-end pass.

Next: wire the existing credential-custody interfaces to this bounded issuer
dependency locally and prepare the exact populated Communication Note recovery
integration gate. Review and promote the candidate into an explicit new manifest
only as part of that gate; do not silently extend the previous 47-migration
approval. Real GoTrue/browser Cookie checks, Hosted PG17/TLS, read-only security
advisors, resource creation and formal activation remain separately bounded.

## Managed custody wiring and recovery gate preparation — 2026-09-07

The new `communication-note-job-status-custody.server.ts` connects the existing
M1u workload verification, source-manifest verification, managed HMAC, OAuth
custody and pinned-CA/password custody protocols to the dedicated issuer and
Cookie/session recovery composition. Its GCP dependency is still explicitly
injected and source-only; the formal GCP factory and formal GET remain off.
There is no automatic credential discovery, exported HMAC key, new secret,
cloud connection, source-manifest signing or deployment in this batch.

The former raw-return token/password loaders have been removed. The fixed
branch-list request executes inside OAuth custody's callback; the control
connection opens inside database custody's callback. A single-consumption
ownership helper rejects absent/duplicate/unawaited callbacks, observes late
rejections, denies late secret delivery and closes late physical results after
cancellation or custody failure. It does not claim secure erasure of immutable
JavaScript strings. Both connectors continue using the same validated target/CA.

The project-ref binding now uses M1u's managed HMAC port rather than returning a
KMS key to application code. Every control operation creates and verifies a new
workload/custody bundle, including fence/finalize on the resolver's independent
cleanup signal after request cancellation. Existing M1u bundles require their
original root signal, so reusing the aborted request bundle would be invalid.
The control connection uses the exact existing custody-approved management
application name and retains the one-fixed-autocommit-RPC restriction.

Credential lifetime is explicit: the source is a
`STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD`, has `sourceExpiresAt:null` and requires
branch deletion or password reset for revocation. Its unique callback delivery
is capped at 60 seconds; the physical control connection is capped at 10 seconds
and hard-closed on cancellation. Neither limit revokes the static password.
This is separate from the issued runtime role's SCRAM/NOLOGIN/fence lifecycle.
No database role, grant or migration definition changed in this batch.

Local evidence: the existing real M1u adapter implementation now participates
in 13 new wiring cases. Synthetic external WIF/KMS/Secret Manager/HTTP responses
exercise successful target resolution, fresh cleanup custody, callback-only
static-password delivery, WIF/manifest/CRC/scope/CA failures, bundle reuse denial
and HTTP gate/anonymous/revoked/wrong-target/provider-failure ordering. Eight
ownership-helper cases cover cancellation, duplicate/absent/unawaited delivery
and late resource disposal. The issuer has 26 tests; the physical PG17 control
connector remains mock-tested, not Hosted-verified.

Full regression passed **4,138 tests, 12 separately selected skips, 271 files**.
The owned real PG16 runner passed all 18 scenario groups and 12/12 source issuer
tests, and reported `cleanup:{stopped:true,removed:true}`. TypeScript, zero-warning
lint, webpack (64/64 pages), the client-boundary scan and adapter sync passed.
These layers are not a browser-to-GCP-to-Hosted-PG17 end-to-end pass. Green UI,
Logo, Points, AI generation and Production are unchanged.

### Exact next recovery integration gate (prepared, not executed)

1. Use the existing green job page and only synthetic Communication Note jobs.
   Connect the actual client/HTTP composition in an explicitly test-only local
   harness; do not add a formal-route fixture or enable runtime flags by default.
2. Prove reload/close-reopen of the same job URL, queued/running polling,
   success-to-saved-draft navigation, failed/cancelled states, offline recovery,
   expired/revoked login and foreign-owner denial. A refresh is a read, never a
   second generation request, new job, payload write or Points operation.
3. Keep real browser evidence distinct from jsdom/in-process evidence. Browser
   cookies against real GoTrue, live workload/secret custody and direct PG17/TLS
   still need a separately authorized no-data Hosted gate and read-only advisors.
   The existing approved check-only manifest is still exactly 47 migrations.
   The unchanged candidate remains outside it:
   `20260907083608_add_communication_note_job_status_issuer.sql`, SHA-256
   `8e737fa2eade9b3a20a1f55d9eda90c25a7192db05cfda426e9e1059057b85a5`.
   Review a new explicit manifest before promotion; no new gate is authorized
   merely by this checklist.

## Green recovery flow — local real-browser evidence (2026-09-07)

The core local gate above now has actual in-app-browser evidence. The existing
green job/document pages, client loaders, HTTP recovery composition, purpose
adapter/repository and document projection ran in an owned temporary Next app.
Auth, credential receipts and SQL results were synthetic injected ports, not
real GoTrue, GCP custody or a physical database. This does not activate the
formal GET, which remains fixed 503 outside the temporary test copy.

Observed browser cases:

- Reload and close/reopen of the same successful job URL retained the saved
  result locator. Opening it selected the exact document and revision; reloading
  the document retained its synthetic English draft, both Chinese review
  versions, version 1 and the required human-review/draft notices.
- A second control tab changed queued to running to succeeded. The original
  task page advanced through polling without reload or another generation.
- Failed, cancelled, unavailable (503) and foreign-owner (404) states rendered
  their expected recovery/error views. Revoked (401) and anonymous sessions
  reached the synthetic login boundary with the encoded same-job return URL;
  reloading the other tab after logout did not expose the job view.
- English, Simplified Chinese and Traditional Chinese task views rendered.
  Browser inspection found an actual accessibility defect: the Traditional
  Chinese job/document routes kept `html lang="en"`. The initial bootstrap and
  client-navigation synchronizer now allow `zh-Hant` on precisely those route
  shapes. Browser reload and job-to-document navigation both reported
  `zh-Hant`; seven additional tests cover parity, fallback and route boundaries.
  The React review retained primitive effect dependencies and added no fetch,
  client dependency or visual redesign.

The [saved-draft screenshot](evidence/communication-note-recovery-2026-09-07.png)
is an actual browser capture of **synthetic data**, not a design mockup or a
live/Hosted account. Browser warning/error log inspections returned no entries
on the successful views. Next's development terminal did report a Fast Refresh
full reload during the test-login transition; no production-build error remained.

Reproduce from the app directory with:

```sh
node scripts/browser-e2e/communication-note-recovery.mjs
```

The runner binds only `127.0.0.1:3395`, refuses an occupied port, stages its own
`/private/tmp/cl-job-browser-*` copy, installs no dependency, copies no `.env`
and does not inherit ambient cloud credentials. Its test-only control routes,
fake login and GET wrappers exist only in that copy. An instrumentation guard
rejects outgoing server fetches; there is no generation route. Open the emitted
local URL to choose synthetic states. Use SIGINT/SIGTERM on this runner to stop
its child and remove only its owned copy. The completed run confirmed
`cleanup:{stopped:true,removed:true,sourceUnchanged:true}`; its test tabs closed,
and the user's original browser tab was left untouched. The fixture's 13 unit
preflight tests are separate from, and not a replacement for, browser evidence.

Regression: **4,158 passed, 12 skipped, 272 files (271 passed / 1 skipped)**.
The 12 independent real-engine tests were not rerun in this browser-only batch.
TypeScript, zero-warning lint, webpack (64/64 pages), client-boundary scan
(107 chunks), adapter sync and whitespace checks passed. The unchanged Hosted
check-only gate still covers 47 migrations with `hostedExecuted:false`.

Remaining: real browser offline/network-restoration behavior was not exercised;
the synthetic 503 is not offline evidence. Real GoTrue Cookie verification,
live custody, Hosted PG17/TLS and read-only advisors remain separate gates. No
Preview/cloud resource, Production data, AI model call, Points mutation, formal
runtime activation, deployment or push occurred. Next complete the bounded
offline recovery browser case, then prepare the exact no-data Hosted auth and
database integration gate for owner approval before creating resources.

### Connection interruption attempt — partial evidence (2026-09-07)

The next browser gate was attempted against the unchanged local synthetic
runner. It is **not an offline/online browser acceptance pass**. The connected
in-app browser advertises no network-emulation capability, the browser CLI is
not installed, and native access to the app's developer tools is unavailable.
No operating-system network setting, proxy, firewall or browser security
protection was changed to work around that limitation.

The bounded alternative stopped only the owned fixture process while a queued
job was polling. The port genuinely stopped accepting connections (the local
HTTP probe failed with connection refused), rather than returning a synthetic
503. The page replaced its job result with the unavailable view and Check status
button; clicking while the service was absent stayed unavailable. See the
[connection-interrupted capture](evidence/communication-note-connection-interrupted-2026-09-07.png).

Restoring the same loopback service did not provide a valid same-document
automatic-recovery observation: the development page had navigated to a browser
connection-error document, which the browser API could not inspect or navigate.
A newly opened tab at the original job URL loaded queued state, polled the
synthetic success transition, and opened the same document/revision 1 with the
review requirement. See the
[restored-service capture](evidence/communication-note-connection-restored-2026-09-07.png).
This proves re-opening after service restoration, not browser `online` event
delivery, uninterrupted component recovery or real database persistence. One
concurrent synthetic success-mode request reported 503 during this transition;
its cause was not classified, so the run is not recorded as an all-green matrix.

The focused loader (jsdom), client and fixture suites passed **40/40 tests**.
No application code or fixture source changed; no new full-suite/build or
real-engine result is claimed. Both owned local processes stopped and both
copies were removed with `sourceUnchanged:true`. The restored/control browser
tabs closed; the error-document tab could not be manually closed through the
API and was left unmarked for the browser tool's normal end-of-turn cleanup.
The user's original cloud-console tab was untouched. No cloud resource,
Production operation, model call, Points mutation, deployment or push occurred.

Next prerequisite: connect a browser/test environment with a documented,
tab-scoped Offline/Online control (with owner assistance if necessary), and
repeat against a local non-HMR build so development reconnect reloads cannot
confound the result. Keep automatic online-event recovery and the unclassified
fixture response open until that run; do not silently substitute this partial
connection-refusal evidence or activate the Hosted gate.

### Non-HMR browser handoff and cancellation diagnostics (2026-09-07)

The runner now accepts `--built`: it strictly type-checks/builds the owned
synthetic app and serves it with `next start`, without development HMR. This
is a **local release-mode test build**, not a Production deployment. The initial
attempt failed because the broad copied component set included unrelated pages'
imports. The fixture tsconfig now starts from every fixture route/layout and
checks all transitive imports; no `ignoreBuildErrors` setting is used. The
failed build cleaned up its copy. The corrected fixture built 6/6 static pages
and loaded the real green queued-job page without a console error or dev overlay.

The built copy alone includes a small network observer and a loopback-only
observation route. The observer does not synthesize network events, replace
fetch, mutate app state, read cookies/storage or record text/credentials. It
buffers at most 64 fixed event/UI codes, online/trusted booleans and a random
page-instance ID in memory; the server validates the exact bounded query and
same-origin/loopback headers before logging those fields. The visible diagnostic
panel is test-only and is absent from the formal build. These browser-reported
fields are test observations, not authorization or cryptographic attestations.

Job-read diagnostics now distinguish an aborted request from the intentionally
unavailable fixture and an unclassified 503, with acquire/query/cleanup booleans
only. A cancelled-request test proved fixed 503 with no synthetic database
acquisition. A 300-read concurrent stress case returned only 200s. These facts
do **not** retrospectively classify the previous uninstrumented 503; its exact
historical cause remains unproved.

Verification: fixture/diagnostic preflight **23/23**; full regression **4,168
passed, 12 skipped, 272 files**; TypeScript, zero-warning lint, formal webpack
build (64/64 pages), 107-chunk client scan and adapter sync passed. No application
source, auth/database permission, migration or formal runtime flag changed.
No cloud creation, Production data, AI, Points, deployment or push occurred.

At this handoff the owner agreed to operate Chrome/Edge's Offline/Online control.
The owned built service is intentionally still running on `127.0.0.1:3395` for
that immediate manual step; its final cleanup has **not** been performed yet.
The agent's smoke-test tab closed. See the
[ready-page capture](evidence/communication-note-built-network-ready-2026-09-07.png).

Reproduce/start: `node scripts/browser-e2e/communication-note-recovery.mjs --built`.
Open `http://127.0.0.1:3395/fixture-control/set?mode=queued` in the test browser,
wait for queued, switch Network throttling to Offline for about five seconds,
then No throttling for about five seconds. Keep the page open and do not refresh
or click Check status. If setup exceeds the bounded automatic-poll window,
reload while online before beginning the offline/online sequence. The expected
evidence is one unchanged page-instance ID, trusted OFFLINE/ONLINE events with
matching navigator state, UNAVAILABLE followed by CHECKING/QUEUED, and no
MANUAL_CHECK. Confirm the owner's visible result and reconcile the instrumented
HTTP reads before acceptance. Then stop only the validated owned runner PID and
confirm its cleanup receipt. Offline/online acceptance remains **pending** until
that evidence exists; a repeated instruction to execute is not evidence that
the user performed the browser action.

### Safari saved-draft review surface — bounded acceptance (2026-09-07)

The owner confirmed that Safari is their only installed browser and approved
continuing with the saved-draft/review flow. The Offline/Online test is deferred,
not passed or waived for release. No browser was installed and no network,
proxy, firewall or Safari preference was changed.

Using native Safari through the supported computer-use interface, the agent
followed the existing **Open saved draft** link from the synthetic succeeded
job `33333333-3333-4333-8333-333333333333`. It opened document
`44444444-4444-4444-8444-444444444444`, exact revision
`55555555-5555-4555-8555-555555555555`, version 1. The English draft, independent
Simplified/Traditional Chinese review texts, server-save acknowledgement and
persistent draft/review-required boundary rendered. Expanding source facts
displayed the synthetic event facts associated with the selected revision.
Switching English → Simplified → Traditional Chinese preserved both IDs and
version 1. Selecting the current version-history entry kept that same revision;
the fixture contains no second/historical revision, so this is not multi-version
history coverage. The final page was returned to Simplified Chinese.

The Safari screenshot showed the approved green identity/Logo, readable draft,
review and history panels, with no visible error overlay. Native Safari console
and per-request network details were not captured, so no console-clean or
document-HTTP-status claim is made. The existing content-free server diagnostics
reported successful synthetic job reads; they do not attest real Auth or database
persistence. No screenshot file containing unrelated user tab titles was added
to the repository.

**Important product boundary:** this page is the existing read-only review
surface. It displays `Self-review required` / `需要人工复核` and exposes no control
to submit a review confirmation. Opening/reading it did not record a human
review, and the agent did not attest care facts on the user's behalf. This is
not a complete review-confirmation/persistence flow. The existing result-page
scope above already lists self-review mutation as a separate, outstanding slice.

The view, loader (jsdom) and document-navigation suites passed **15/15 tests in
3 files**. Application/fixture source did not change; full regression, build,
real-engine and Hosted checks were not rerun. The owned built runner then stopped
and removed `/private/tmp/cl-job-browser-F6PZx5`, reporting `stopped:true`,
`removed:true`, `sourceUnchanged:true`; independent path absence was checked.
The owner's Safari and in-app tabs were not closed. Their already-rendered local
pages remain visible, but reloads require restarting the documented fixture.
No Production, cloud resource, model call, Points mutation, deployment or push
occurred.

**Next local implementation slice:** add an explicit, revision-bound self-review
confirmation interaction to the existing green Communication Note page, starting
with the current domain/contract and its tests. Persist/display confirmation only
after a server acknowledgement; keep the draft label, prevent historical/stale
revision confirmation, and handle failure without claiming success. Existing
Auth/default-off runtime boundaries stay in place; any required external
activation or permission expansion needs separate authorization. Browser
Offline/Online automatic recovery remains a release prerequisite to re-test in a
supported environment, not a reason to repeat this read-only Safari check.

### Revision-bound self-review interaction — local slice (2026-09-07)

The approved green result page now has an English/Simplified/Traditional Chinese
self-review form. All three domain confirmations (facts, wording/translation,
missing facts/follow-up) start unchecked and are required. The form names the
selected version, keeps the draft/non-professional-approval boundary, and offers
no write control for a historical or already-confirmed version.

Submission sends only the exact revision ID and three literal `true` values to
`POST /api/ai-documents/communication-note/documents/{documentId}/self-review`.
A random in-memory mutation UUID is reused for an explicit same-command retry;
there is no automatic POST retry, browser storage, draft text or owner/session
identity in the body. The client strictly binds the response to document,
revision and mutation, matching HTTP status and exact receipt keys. A write ACK
triggers the existing owner-scoped document re-read, not an optimistic status
change. Auth/not-found responses clear private content; stale revision directs
the user to the current version. A lost response explicitly leaves save status
uncertain. Access recheck/pagehide aborts the write, suppresses late callbacks
and discards checked confirmations even when the same document/revision returns.
This last reset required a per-access-generation component key: React batching
can otherwise preserve the old form despite an intermediate loading state.

The new HTTP adapter requires exact path/body, bounded 1 KiB body bytes,
JSON POST, same-origin Origin/Fetch Metadata, no Authorization header and a
canonical mutation UUID. It returns only fixed content-free failure envelopes
and private/no-store responses. Its writer contract requires one atomic active
provider-session/owner/Communication-type/writable-current-revision check and
idempotent confirmation. **The formal route installs no writer and always
returns 503.** It does not reuse DOCUMENT_DETAIL to write, grant a database role,
change a runtime flag, or fall back to a memory/service-role implementation.
The existing Product API and database still have no wired self-review mutation.
This is the UI/transport slice, not durable or release-ready review persistence.

The guarded owned loopback fixture alone binds a synthetic writer, storing at
most 64 receipts in that test server's process memory for the fixed test owner,
document and current revision. It repeats synthetic revoked/foreign/stale checks
before replay and exposes the confirmed status through the real document reader.
These receipts disappear when the process stops; refresh survival proves server
readback, not database persistence or cross-device durability.

Safari verified unchecked/two-check disabled state, three-check enabled state,
submission, `已确认人工复核` after readback, persistence across a page refresh
within the same local server process, and the retained draft label. The first
submission returned 400: content-free diagnostics showed correct browser Origin,
Fetch Metadata and JSON but an internal Next request URL origin. Only the guarded
fixture was corrected to normalize to its fixed loopback origin after exact Host
validation; foreign-Origin/Host denial tests remain green. Formal origin checks
were not relaxed. No native Safari console-clean claim is made.

Verification: **83/83 focused tests**; full **4,223 passed / 12 skipped in 273
files (272 passed / 1 skipped)**; TypeScript and zero-warning lint passed; formal
webpack build generated 64/64 pages and the client-boundary scan passed 108
chunks. The final no-HMR fixture built 6/6 pages. Next.js/Supabase guidance kept
the write binding absent until its own authorization boundary exists; React
review kept submission event-driven, abortable and scoped to an access generation.
No package, migration, permission or runtime-flag change was needed.

All three owned fixture runs stopped and removed their temporary directories,
each with `sourceUnchanged:true`, followed by independent path-absence checks.
No Hosted Preview, Production, real care data, AI model call, Points mutation,
deployment or push occurred. No real human care-review attestation was made.

**Next:** implement the durable, revision-bound self-review writer and readback
integration locally, including owner/session denial, stale/edit races, replay
after revocation, immutable audit events and draft lifecycle preservation. Real
database permissions, resource creation and activation require their own review
and authorization; do not enable the current route merely by wiring a fake
writer. Browser Offline/Online recovery remains a separate unpassed release gate.

### Self-review database persistence — local candidate (2026-09-07)

The revision-bound self-review now has a durable server writer candidate and
an actual PostgreSQL transaction, separate from the earlier process-memory
browser fixture. The formal POST route still installs no writer and returns
503; the green design, three-language copy, browser storage policy and permanent
draft label are unchanged.

`createCommunicationNoteDurableSelfReviewWriter` requires its dedicated
`CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED` flag, the master/durable
Product API gates, and an exact allowed non-Production Preview target. No flag
was enabled. It verifies claims, the zero-argument current-session RPC and Auth
user with the same Cookie client used to write; no service-role writer or
DOCUMENT_DETAIL/DOCUMENT_WRITE permission fallback exists. It transmits only
document/revision/mutation UUIDs and the three confirmations, strictly validates
the receipt and treats abort/lost ACK as uncertain without automatic retries.

The CLI-generated SQL is deliberately retained at
`supabase/migration-candidates/20260907114955_add_communication_note_self_review_shadow.sql`,
outside the unchanged, approved 47-migration manifest. It defines one
authenticated-only RPC with a least-privilege NOLOGIN/NOBYPASSRLS owner. New
owner RLS protects event SELECT/INSERT; it has no event UPDATE/DELETE, direct
Auth table, Points or generation capability. Column-level UPDATE grants are
needed for locks, with RLS update checks denying actual document/switch updates.
The only Auth helper grant reuses the existing user-before-session lock order.
Supabase/PostgreSQL guidance shaped these minimum grants, the empty search path
and transaction-level checks ([official function guidance](https://supabase.com/docs/guides/database/functions)).

The transaction checks a current verified Provider/session, both database
switches, owner, Communication type, IN_PROGRESS/shadow lifecycle and exact
current revision. It locks Auth user/session, switches, document, then the
owner/mutation advisory key. It rechecks real-time session/JWT expiry after
waiting before either replay or insert. Same-key retries produce one immutable
event; reusing a key for another document/revision is rejected. Current-version
changes and revocation are rechecked before old receipts can be returned.
The existing document reader derives CONFIRMED from the stored event; no draft
content, completion state, job or Points ledger is mutated.

Local PG16 passed **14 scenario groups**, applying eight exact dependencies and
this candidate as non-superuser `postgres` in an owned Unix-socket-only cluster.
Valid synthetic facts/privacy proofs were seeded with FK/CHECK/RLS constraints
enabled. Tests covered commit + independent-connection readback, rollback,
same-key replay and concurrent first submission, cross-document key collision,
foreign owner, wrong type/lifecycle, three required confirmations, stale/edit
races, provider role vs editable metadata, revoked/mismatched sessions, JWT and
session expiry during lock waits, and edit/revocation blocking until commit.
All temporary cluster runs stopped and removed their owned directories.

Verification: **67/67 focused transport/writer tests**, full **4,250 passed /
12 skipped in 274 files (273 passed / 1 skipped)**, TypeScript, zero-warning lint,
64/64-page webpack build, and 108-chunk client-boundary scan passed. The skipped
Hosted/real-engine gates were not converted into passes. No hosted database,
browser DB roundtrip, real care review, AI model, Points write, deployment or
push was involved. This does not prove the whole 47+candidate Hosted chain,
GoTrue/PostgREST/TLS, candidate security-advisor checks or release readiness.

**Next:** connect this real database writer/readback to the guarded local result
page fixture and verify checkbox → one saved review event → refreshed confirmed
state through the browser, including stale/revoked rejection. Keep the formal
route and Hosted/Production activation off. Candidate promotion, new external
ACLs and Data API write exposure require a separately reviewed authorization;
the database can verify a JWT, not attest how it reached the Cookie-only server
boundary. Offline/Online recovery remains a separate unpassed release gate.
