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

### Self-review page → local database roundtrip (2026-09-07)

The existing green result page now has a reproducible, opt-in **local test
composition** that connects its real self-review HTTP handler, durable writer
and Product API readback to PostgreSQL 16. No product UI, formal route,
environment flag or migration manifest was changed. This completes the local
browser/database next step above, not Hosted activation.

Run from the app directory:

```sh
node scripts/browser-e2e/communication-note-recovery.mjs --database-review
```

The runner builds a no-HMR Next app in its own `/private/tmp/cl-job-browser-*`
directory and starts PG16 beneath that same root. It first reruns the 14 SQL
scenario groups with eight dependency migrations plus the unapplied candidate,
then resets only its synthetic fixtures. Startup verifies that the real document
projection has one current, unreviewed revision; the fixed `advance` operator
command inserts a valid second revision before moving the current pointer.
FK, CHECK and RLS constraints stay enabled.

The page uses a random-password, NOINHERIT/NOBYPASSRLS LOGIN without admin
privileges. Each of its three allowlisted RPCs gets a fresh private Unix-socket
connection and transaction-local `authenticated` role/claims. Document,
revision and confirmation arguments are parameterized; socket, role, claims,
operation names and credentials are never browser inputs. Auth issuance is
synthetic, while database provider/session checks, RLS, transactions and stored
readback are real. No Supabase service credential or external connection is used.
The fixed operator controls (`status`, `advance`, `revoke`, `restore`) exist only
on the runner's stdin, not as database-administration HTTP endpoints.

Native Safari verification passed on the final built fixture:

| Browser action | Real database / visible outcome |
| --- | --- |
| Load Simplified Chinese revision 1; check all three confirmations; advance the database while leaving the form open; submit | HTTP 409 `STALE_REVISION`; page asks to open the current version; zero review events |
| Open current revision 2 | All checkboxes reset; revision 2 requires its own review |
| Check all three and confirm revision 2 | HTTP 200; one immutable review event; a separate Product API read returns `CONFIRMED`; form is removed |
| Reload the browser page | A new database read still returns `CONFIRMED`; visible “已确认人工复核”; document remains a draft |
| Open a second synthetic document in English, check all three, delete the exact test session using stdin `revoke`, then submit | Current-session RPC returns `REVOKED`; HTTP 401; private draft disappears and browser reaches the synthetic sign-in boundary; event count stays at one |

Points ledger and generation-job counts remained zero. Screenshots and native
accessibility state were inspected for the green unreviewed and confirmed
views; native Safari console output was unavailable, so no console-clean or
automated browser-suite claim is made. Existing user tabs were preserved and
only the owned test tab was closed.

The first two browser attempts correctly failed closed because the fixture
asked the restricted role to inspect `unix_socket_directories` (42501). The fix
retained least privilege: the bootstrap operator attests that directory, and
runtime checks the already pinned/realpath-verified socket, actual role,
Unix-only connection and cluster identity. No `pg_read_all_settings` grant was
added. A subsequent build was stopped before browser testing to correct the
synthetic revision reset; only the final build supplies the successful evidence
above. All four owned runs reported database stop and directory removal; their
exact paths were checked absent and port 3395 had no listener after cleanup.

Verification: 74/74 focused tests, full **4,267 passed / 12 skipped in 275 files
(274 passed / 1 skipped)**, TypeScript, zero-warning lint, 64/64-page webpack
build, 108-chunk client-boundary scan and 73-file adapter sync passed. The exact
runtime-importer allowlist includes only the new server-only test fixture; no
product importer was added. This is not GoTrue/PostgREST, TLS, real Cookie/JWT
issuance, whole-chain Hosted, security-advisor or Offline/Online evidence. The
formal POST remains unbound/503; candidate promotion and external Data API
exposure still require separate review/authorization.

**Next local product slice:** implement editing saved Communication Note wording
and saving a new revision, with stale-base conflict handling and revision-bound
review reset. Preserve the green design, source facts, permanent draft status
and explicit save acknowledgement. Begin with local synthetic fixtures; do not
enable Hosted writes, AI calls or Points. Export and the remaining Note-type
application flows remain separate work, not completed by this roundtrip.

### Wording editor → new revision → fresh review (2026-09-07)

The local result page now supports explicit editing of English, Simplified
Chinese and Traditional Chinese wording. It retains the approved green visual
identity, Logo and typography. No automatic translation or new design direction
was introduced. Current revisions alone expose the editor; source facts, safety
lists, disclaimer, schema and privacy binding remain server-owned and unchanged.
Each text change clears the explicit wording confirmation. Saving creates a new
revision, never overwrites history, and requires a new revision-bound human
review. Both reviewed and unreviewed documents remain drafts.

The new Cookie-only POST contract accepts only the base revision and three
wording fields plus confirmation. The server authenticates with DOCUMENT_WRITE
before reading the bounded body, checks same-origin transport, validates exact
keys and text limits, rejects a stale base and scans all three fields for obvious
identifiers. This pattern scan is not a guarantee of de-identification. Only a
strictly validated server acknowledgement can navigate to the new revision;
that navigation performs a fresh authenticated read. Duplicate/concurrent
commands create one revision in the tested memory Product API. A late retry
after the current revision has advanced may return 409 rather than replay 200.
Lost acknowledgements do not trigger automatic retries or optimistic success.

Unsaved text exists only in mounted React memory, without autosave, offline
buffer or browser-storage backup. Navigation/discard warns before losing edits.
Access rechecks abort pending saves, clear the editor and explain the reset;
late responses cannot repopulate private content. Stale or uncertain saves lock
the editor and offer a fresh read. Successful/auth-terminal navigation bypasses
the unload warning before React cleanup, covered by a regression test and the
final built-browser run.

The implementation intentionally has **no default edit runtime binding**: the
formal `/revisions` route returns 503 without touching Auth or the request body.
Existing self-review permission does not grant editing. No database ACL,
migration, runtime switch or approved migration manifest changed. The existing
generic append RPC is not exposed or granted as a shortcut.

Reproduce the local synthetic browser flow from the app directory:

```sh
node scripts/browser-e2e/communication-note-recovery.mjs --edit
```

This guarded built-only mode uses the existing **memory Product API**, marked
`PROCESS_MEMORY_ONLY`, plus synthetic identity. It is mutually exclusive with
`--database-review`; no database edit roundtrip is claimed. The copied fixture
exists only in an owned loopback test root, with external fetch blocked and no
environment credentials copied.

Final built-browser checks proved: confirm revision 1 → edit all three texts →
save acknowledgement → exact revision 2 URL without an unload dialog → three
unchecked review confirmations → confirm revision 2 → refresh still confirmed.
Opening revision 1 then showed its unchanged original wording and no edit or
review controls. Viewport screenshots were inspected at 390×844, 768×1024 and
1280×900, with no horizontal overflow; the edit status uses an amber warning,
not a saved checkmark. Dedicated-tab warning/error logs were empty.

Safari initially submitted an edit successfully. After the user changed its
active page, a full-window accessibility read was denied; verification stopped
there and continued only in an isolated in-app local tab. The successful final
sequence above belongs to that dedicated tab, not a complete Safari gate.
Unrelated tabs were not inspected. The in-app viewport was reset and the owned
tab closed; the old Safari test tab was left untouched. Both owned fixture roots
were stopped and removed, their exact paths checked absent, and port 3395 was
verified free. The run's synthetic drafts/reviews were discarded with memory.

Verification: **65/65 focused tests**, full **4,319 passed / 12 skipped in 276
files (275 passed / 1 skipped)**, TypeScript, zero-warning lint, 64/64-page full
webpack build, 109-chunk client-boundary scan and 73-file adapter sync passed.
Both browser fixtures built 6/6 pages. Skipped release gates remain skipped.
This is local product interaction and contract evidence, not durable editing,
Hosted Auth/PostgREST, complete-chain migrations, Offline/Online, Production,
AI generation, Points or deployment evidence. Nothing was pushed or deployed.

**Next:** implement a separately scoped durable wording-edit writer and test it
on disposable local PostgreSQL, including atomic owner/current-base checks,
full-command idempotency, session revocation and privacy expiry across lock
waits, immutable source facts and revision-bound review reset. Keep the formal
route unbound and Hosted switches off; database permission exposure requires
its own review/authorization. Export and the other Note application flows remain
separate outstanding product work.

### Durable wording-edit writer / local PostgreSQL (2026-09-07)

The next local slice above now has an independent Cookie-authenticated writer
candidate and real PostgreSQL transaction evidence. It is **not installed in
the formal HTTP route** and is not yet connected to the browser fixture. The
existing memory editor and green visual identity are unchanged. No runtime
flag, Hosted permission, approved migration pin or deployed surface changed.

`createCommunicationNoteDurableEditWriter` uses one request-scoped Cookie client
for verified user, current session and the narrow `save_communication_note_wording`
RPC. Its dedicated edit switch, DOCUMENT_WRITE switch, durable/Product API
switches and exact non-Production Preview target must all pass. No self-review
or read-only capability substitutes for edit authority. It scans all three
wording fields, sends only the exact edit command/document/mutation identifiers,
validates the acknowledgement against the expected revision and treats abort,
unknown errors or lost acknowledgement as uncertain without retries. Source
facts, owner/session arguments, schema, proof and content hashes are not caller
overrides.

Supabase CLI 2.115.0 generated
`supabase/migration-candidates/20260907132707_add_communication_note_wording_edit_shadow.sql`.
It remains outside the approved 47-migration directory. The public facade is
SECURITY INVOKER; the SECURITY DEFINER implementation lives in a private schema
and runs as a NOLOGIN/NOINHERIT/NOBYPASSRLS executor. No API role receives schema
USAGE or either function's EXECUTE in the candidate. The local fixture alone
grants an authenticated test path, then revokes it before cleanup. This follows
the skill's least-privilege and fixed-search-path guidance
([Supabase function security](https://supabase.com/docs/guides/database/functions)).

The executor has owner-scoped RLS and only the columns/tables required for
revision insertion, current-pointer update, sync-change insertion and mutation
receipt insertion. It cannot directly read Auth tables, write review events,
complete/delete documents or mutate Points/jobs. Lock-only column grants on
privacy proofs, base revisions and switches have denying UPDATE checks.
The independent edit database flag defaults false.

The transaction locks current Provider user/session, switches, document,
owner/mutation key, base revision and privacy proof. It derives all immutable
fields from the saved base and checks type/lifecycle, version/hash/facts schema,
privacy owner/hash/schema/status/expiry and exact three-text command shape.
Real time is rechecked after locks and after potential write waits; failures
roll back the revision, pointer, sync entry and receipt together. Same-key
replays compare the full-command fingerprint and require the saved revision to
remain current plus live Auth/privacy; advanced versions return stale. Cross-
document key races admit one command. Old review events remain immutable, while
the existing read projection derives REQUIRED for the new revision.

The SQL additionally applies conservative identifier patterns for direct local
callers. This is defense in depth, not exact parity with the TypeScript scanner,
and neither scanner guarantees complete de-identification. External Data API
exposure remains unapproved: JWT database checks do not prove Cookie transport.

Reproduce from the app directory:

```sh
node scripts/preview-e2e/communication-note-self-review-local-pg16.mjs --edit
```

The fixed runner creates a private Unix-socket-only PG16 cluster, applies eight
dependencies plus the self-review and edit candidates as non-superuser
`postgres`, and passes **33 scenario groups (14 self-review + 19 edit)**. Its
bootstrap operator temporarily grants only the migration entry's prerequisite
schema USAGE and revokes it afterward; the application executor is not elevated.
All FK/CHECK/RLS constraints stay enabled. The matrix covers independent commit
readback, original facts/history preservation, review reset, rollback, duplicate
and concurrent commands, stale-base and cross-document conflicts, owner/type/
lifecycle denial, current Provider metadata, revoked sessions, malformed and
privacy-bearing input, proof binding, session/JWT/privacy expiry during waits,
revocation/disable lock winners and locks held through commit. Points/jobs and
review-event writes remain absent for editing.

Initial attempts exposed the missing migration-entry schema permission, a
leftover synthetic revision from the preceding review race, and an invalid
expiry test seed that violated the existing exact 30-minute constraint. These
fixtures were corrected without disabling constraints or expanding application
privileges. Every owned run reported stopped/removed. The final exact root was
independently checked absent. CLI `db advisors --db-url` targeted only that local
socket and returned `results: []` with JSON output; an earlier legacy output
parse failure was not counted as a pass. This is a local candidate catalog
check, not a complete Hosted security-advisor or GoTrue/PostgREST/TLS gate.

Verification: **86/86 focused edit tests**, full **4,361 passed / 12 skipped in
277 files (276 passed / 1 skipped)**, TypeScript, zero-warning lint, 64/64-page
webpack build, 109-chunk client scan and 73-file adapter sync passed. The exact
runtime-importer allowlist adds only this server-side writer candidate. No
Hosted/Production operation, browser/database edit test, real care data, AI
generation, Points mutation, push or deployment occurred.

**Next:** connect this durable writer and independent database readback to the
owned local editor browser fixture. Verify edit → one persisted new revision →
fresh review → reload, plus stale/revoked save rejection, then clean up. Keep
formal binding, candidate promotion and Hosted activation off. Export and the
remaining Note-type application flows are still separate outstanding work.

### Wording editor / real local database roundtrip (2026-09-08)

The previous next step now has a built browser-to-PostgreSQL roundtrip. The
formal revision route remains unbound/503. Only the temporary fixture composes
the existing page, edit handler, durable writer, independent read and self-review
paths. The approved green styling, Logo and three-language presentation did not
change. No candidate SQL, approved migration, runtime flag or Hosted ACL changed.

The handler accepts an explicit injected writer after its existing transport,
Cookie DOCUMENT_WRITE, body, base revision, facts and privacy checks. It validates
the exact receipt again and never falls through to generic append or memory on
a failed, malformed, lost or aborted durable result. The local composition shares
one synthetic Cookie client between authorization, read and write. Its additional
owned-root edit guard admits only the three fixed parameters of the narrow edit
RPC. Every RPC uses a fresh unprivileged LOGIN connection, transaction-local
authenticated role/claims and the private Unix socket; draft text is not logged.

Reproduce from the app directory:

```sh
node scripts/browser-e2e/communication-note-recovery.mjs --database-edit
```

This built-only mode first passes **33 PG16 scenario groups (14 review + 19
edit)**, then resets only its new synthetic data with FK/CHECK/RLS constraints
still enabled. The existing memory-only `--edit` and review-only
`--database-review` modes remain separate. Fixed stdin controls are `status`,
`advance`, `revoke` and `restore`; in edit mode `advance` represents a second
editor through the real narrow RPC, not a direct current-pointer update.

One owned run, `/private/tmp/cl-job-browser-V9PNag`, supplied this evidence:

- Reviewed revision 1 → three-text wording edit → HTTP 200 and exactly one
  persisted revision 2, one mutation receipt and one sync entry. Source facts
  stayed fixed and the new revision required a fresh review.
- Fresh three-checkbox confirmation → second review event → browser reload
  independently read the same saved wording and CONFIRMED status. The permanent
  draft notice remained visible. Historical revision 1 retained its original
  wording and exposed no edit/review controls.
- A second-editor RPC committed revision 3 while the browser still edited
  revision 2. The stale save returned 409 and froze the form without applying
  its text. An independent dedicated tab read revision 3 and the concurrent
  wording, not the rejected stale text.
- Deleting the fixed synthetic session before a later save returned 401. The
  page cleared its private edit fields and navigated to the synthetic sign-in
  boundary without an unload dialog. Final aggregate readback remained revision
  3, two edit receipts, two sync entries and two review events, with the session
  absent and zero Points ledger entries or generation jobs.

**Remaining browser limitation:** clicking the stale form's “open current
version” link triggered a browser-control timeout around its native unsaved-change
confirmation; subsequent scoped inspection also timed out. That confirmation /
navigation is not a passed gate. A second dedicated local tab was used only for
independent current-version readback and the revoked-session test. No unrelated
Safari or native app surface was inspected. The successful-flow screenshots
were inspected at the unchanged desktop viewport; scoped warning/error logs on
the normal flow and final sign-in tab were empty. No new responsive or real
Offline/Online evidence is claimed.

Both owned tabs closed. Shutdown reported database stopped, temporary root
removed and formal source hashes unchanged; an independent check confirmed the
exact root absent and port 3395 no longer listening. Only disposable synthetic
test data was removed; it was not retained for recovery.

Verification: **121/121 focused tests**, full **4,379 passed / 12 skipped in
277 files (276 passed / 1 skipped)**, TypeScript, zero-warning lint, 64/64-page
webpack build, 6/6-page fixture build, 109-chunk client-boundary scan and 73-file
adapter sync passed. Auth issuance is synthetic; database Auth-session metadata,
RLS, SQL transactions and persisted readback are real. This does not prove real
Cookie/JWT issuance, Hosted GoTrue/PostgREST/TLS, whole-chain migration or runtime
activation. No Hosted/Production operation, real care data, AI generation,
Points mutation, push or deployment occurred.

**Next:** implement the Communication Note Copy/TXT export slice against a
specific saved revision, preserving the draft notice and required human-review
boundary. Keep the native discard-confirmation interaction as an explicit
pending browser acceptance item. Formal binding, candidate promotion, Hosted
activation and the other four Note-type application flows remain separate work.

### Communication Note Copy / TXT Record copy (2026-09-08)

The first export product slice is implemented locally. It follows the approved
2026-08-09 baseline's `AI-DOC-007/015/016/017`, `APP-NOTE-025/026` and
`APP-DOC-006/008/009` requirements, not the old legacy copy/telemetry path. This
is **not the complete GA-0 export service or a native file-delivery pass**.

The approved green result page now has an inline export section with explicit
English, Simplified Chinese and Traditional Chinese UI copy. Existing fonts,
Logo, tokens and button vocabulary are preserved. The default `RECORD_COPY`
profile includes only the English Note plus document type, numeric version,
saved timestamp, explicitly labelled device export time, English language,
persistent draft notice and static-copy/human-review warnings. It excludes
Chinese review translations, cleaned facts, privacy findings, missing-fact
prompts, internal disclaimer fields, hashes, full IDs, Points and model metadata.
The filename uses Note type, date, short canonical ID and revision, never a
participant name or draft text.

`communication-note-export.ts` provides the shared plain-text profile with
template version `communication-record-text.2026-09-08.1`. Copy and UTF-8 TXT
consume the same renderer; with the same explicit export time they produce
identical text. Unicode and saved wording are preserved, not paraphrased or
silently reformatted. Empty, oversized, control-bearing and recognizably
formatted Markdown/HTML inputs fail the conservative plain-text guard and ask
for editing/review. This is not a general Markdown conversion engine.

Each action reuses the existing no-store Cookie document GET with the exact
document/revision locator. It requires a current, SERVER_ACKNOWLEDGED revision
with CONFIRMED self-review, then checks the fresh ID, number, hash and English
wording against the displayed version. Stale, revoked, missing, unavailable,
reset-review and misbound responses produce no export artifact. Auth/not-found
results clear the private page. Historical export remains explicitly unavailable
because the current read projection does not expose historical self-review
evidence. Unsaved editing hides export controls; focus/access-generation changes
abort pending preparation. The existing Auth/RLS reader remains the server-side
access boundary; the client renderer does not establish a new authorization
service or an irrevocable guarantee after data has left the page.

Clipboard writing is requested within the user click, with promise-backed
`ClipboardItem` data for browsers supporting it. The data promise completes only
after fresh authorization; no clipboard read or legacy `execCommand` fallback
exists. This follows the documented asynchronous ClipboardItem representation
and WebKit user-activation requirement
([MDN ClipboardItem](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem),
[WebKit clipboard API](https://webkit.org/blog/10855/async-clipboard-api/)).
TXT uses a local Blob URL and revokes it after 60 seconds, on access loss,
unmount, failure or replacement. The UI says download **started**, never that a
file was saved. There is no public URL, upload, persistent file-byte cache,
browser storage, analytics payload, new export API, database mutation, Points
charge or model invocation. Successful exports do not change document lifecycle
or self-review; this slice does not yet record durable export events.

Verification:

- **88/88 focused tests** cover rendering/minimization, Unicode, filenames,
  exact-version fresh reads, status/receipt rejection, copy denial, synchronous
  ClipboardItem invocation, aborted/lost access, duplicate clicks, TXT byte
  parity, failed download cleanup, Blob TTL, all three locales and edit/review
  integration. A test-only FileReader timeout was corrected by using real timers
  for that asynchronous browser API; the initial failed run is not a pass.
- Final full regression: **4,446 passed / 12 skipped in 279 files (278 passed /
  1 skipped)**. TypeScript, zero-warning lint, 64/64-page webpack build,
  109-chunk client-boundary scan and 73-file adapter sync passed.
- One built 6/6-page `--edit` fixture at `/private/tmp/cl-job-browser-QX92oH`
  used synthetic identity and PROCESS_MEMORY_ONLY storage. The dedicated in-app
  tab proved disabled export before review, review confirmation, clipboard API
  success feedback and TXT-start feedback. Mobile 390×844, tablet 768×1024 and
  desktop 1280×900 had equal client/scroll widths; screenshots were inspected,
  buttons were 44 pixels high and keyboard focus was visible. All three locale
  labels appeared correctly and scoped warning/error logs were empty. A final
  inline-format rejection expansion was then verified by the full suite/build;
  it did not change the visually tested layout or synthetic plain-text case.
- **Unpassed:** the in-app host did not emit a download event or supply a file;
  the exact expected filename was not found in the local Downloads folder. Its
  separate virtual clipboard reported no data when attempting to paste the
  webpage-written copy into the test-only field. Native Safari cross-app paste
  and actual TXT file save/open therefore remain acceptance items. API success,
  Blob byte tests and a started message are not substitutes for those outcomes.
- The temporary viewport was reset, owned tab closed and fixture stopped.
  Cleanup reported source hashes unchanged/root removed; independent checks
  confirmed the exact root absent and port 3395 closed. Only disposable synthetic
  state was removed, with no retained recovery copy.

Next.js, React and Impeccable guidance kept the action/state boundary scoped and
the existing visual identity intact. Supabase security guidance was used to
review the reused request-scoped, private/no-store Cookie boundary
([SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide));
no Auth code, package, migration, grant, flag, Hosted/Production setting, push or
deployment changed. No new real PostgreSQL/Hosted claim is made by this batch.

**Next:** add the DOCX export renderer using the same minimal saved-revision
profile. Keep native Safari copy/TXT acceptance, native discard-confirmation
navigation and real Offline/Online checks explicitly pending. PDF, bilingual
review export, historical review evidence, batch export, durable export history,
native sharing and Hosted activation are separate remaining work.

## Communication Note DOCX Record copy (2026-09-08)

The current self-reviewed Communication Note now has **Download DOCX** alongside
Copy/TXT, with explicit English, Simplified Chinese and Traditional Chinese UI.
The approved green UI, logo and typography are unchanged. Editing hides exports;
unreviewed and historical versions remain disabled. Each click reuses the exact
revision's fresh private Cookie read; stale revision, review reset, revoked
session, not-found and aborted reads never fall back to the displayed copy.

`communication-note-export-docx.ts` consumes the existing minimal Record copy
payload and retains its template `communication-record-text.2026-09-08.1`, profile,
wording and field order. Word paragraphs represent LF/CRLF/CR line breaks and
native tabs preserve tab characters. XML-invalid characters are rejected across
all formats, not silently replaced. The file contains English Note text and the
same fixed version/time/language/draft/static-copy notices, with the draft notice
also repeated in the page header. It contains no review translations, private
checks, source facts, Points, model metadata, participant-based filename,
external relationship, macro, embedded image or provider/owner author metadata.
The custom properties contain only the public export template/profile identifiers.

The `docx` dependency is pinned to **9.7.1** in the pnpm lockfile and loaded only
after the DOCX action's successful fresh read. Its supported browser ArrayBuffer
packer is used rather than a custom ZIP writer
([official Packer API](https://docx.js.org/api/classes/Packer.html)). The browser
checks cancellation before loading, before/after packing and before download.
TXT and DOCX share local Blob cleanup: 60 seconds, access loss, unmount, replacement
or failed click. A download-start message is not a saved-file receipt. No export
API, persistent byte cache, database write, lifecycle/self-review mutation,
Points charge, model call, public link, Hosted/Production change, push or deployment
was added. PDF is not implemented by this batch.

Verification:

- **110 focused tests** and the full **4,468 passed / 12 skipped across 280 files
  (279 passed / 1 skipped)** cover byte/field parity, independent ZIP/DEFLATE and
  XML parsing, Unicode/tabs/spaces, long text, private-field exclusion, safe
  filenames, packer failure, exact access/revision/review denial, duplicate
  actions, cancellation, retry, Blob MIME/TTL/cleanup and all three locales.
- TypeScript, zero-warning lint, 64/64-page webpack build, 111-chunk private-client
  boundary scan and 73-file adapter sync passed. The final extra historical-DOCX
  assertion changed tests only and passed the final full regression.
- The actual product renderer, including pinned docx 9.7.1, was bundled by the
  existing Vite toolchain into an isolated QA directory and executed with the
  bundled Node runtime. A short Unicode fixture (one page) and a long fixture
  (three pages) were rendered by the packaged LibreOffice renderer and **all four
  final page images** inspected. Independent Python ZIP CRC, python-docx complete
  paragraph parity and PDF text/page/header checks passed. Rendered PDFs are QA
  intermediates, not evidence of a product PDF export feature.
- The initial renderer environment omitted Chinese glyphs despite intact DOCX
  text. A task-local Fontconfig file exposed existing macOS CJK/emoji fonts to
  the bundled renderer; the same DOCX then rendered Chinese/emoji correctly.
  No fonts were installed, embedded or uploaded, no desktop LibreOffice was
  used and no app wording was rewritten. Earlier fixture-build/missing-input
  diagnostic failures are not counted as verification passes. Cross-machine
  font substitution and native Microsoft Word opening still require acceptance.
- One 6/6-page built, PROCESS_MEMORY_ONLY fixture at
  `/private/tmp/cl-job-browser-euLBVO` proved disabled-before-review → confirmed
  review → actual client DOCX-start feedback, all three locale controls, 44-pixel
  targets and visible keyboard focus. Inspected 390×844, 768×1024 and 1280×900
  layouts had equal client/scroll widths; scoped warning/error logs were empty.
  This verifies browser execution, not native delivery or a real database.
- The dedicated tab was closed and viewport reset. The fixture reported stopped,
  removed and source unchanged; independent checks found its exact root absent
  and port 3395 closed. Only its disposable synthetic state was removed.

Documents guidance drove real-file pagination/Unicode verification; Next.js,
React and Impeccable guidance kept lazy loading, action state and the existing
button/visual conventions intact.

**Next:** implement PDF export using the same revision-bound minimal profile.
Keep native Safari Copy/TXT/DOCX save/open, actual Microsoft Word compatibility,
native discard-confirmation navigation and real Offline/Online acceptance pending.
Bilingual/historical review export, batch export, durable export history, native
sharing, other Note applications and Hosted activation remain separate work.

## Communication Note PDF Record copy (2026-09-08)

The current self-reviewed revision now offers **Download PDF**, alongside
Copy/TXT/DOCX, in all three existing UI languages. The approved green identity,
logo and fonts are unchanged. PDF reuses the same minimal English Record copy,
template/profile, field order, safe filename and fresh exact-revision Cookie
read. Editing hides exports; unreviewed/historical versions remain disabled.
Denied access, stale revisions, review reset, duplicate clicks and cancellation
cannot download the displayed stale copy or silently substitute another format.

The lazy browser renderer uses `pdf-lib@1.17.1` and `fontkit@2.0.4` to create
selectable text on Letter pages with one-inch horizontal margins. It wraps long
words at grapheme boundaries, represents tabs with half-inch stops, preserves
logical paragraphs and repeats **Draft – review required** on every page.
The 200-page cap and unsupported-grapheme check fail explicitly before a Blob is
created; DOCX/TXT remain available by a separate user action. No screenshots,
review translations, internal checks, source facts, Points/model metadata,
owner author identity, links, attachments, scripts or forms are added to files.

The two pinned, unmodified Noto font assets and OFL licenses live in
`public/export-fonts`; the UI does not use them. They are fetched only on PDF
export from fixed same-origin public paths with no credentials/referrer/query
or redirects, then checked for exact size and SHA-256. Text font first load is
8,331,336 bytes; the 1,982,596-byte emoji font is loaded only when the text font
does not cover the record. Only used glyphs enter the PDF. Public font caching
contains no document content. This is not universal Unicode/emoji-sequence,
PDF/A, tagged-PDF, archival-standard or native-reader compatibility certification.

Initial real rendering exposed invalid/missing CJK glyphs with the older
`@pdf-lib/fontkit@1.1.1` fork; those failed files are not acceptance evidence.
The final code uses maintained Fontkit 2 and a small, tested bridge from its
[documented subset encode API](https://github.com/foliojs/fontkit#subsets)
to pdf-lib's older stream serialization interface. No experimental converted
fonts or font-build Python dependencies were added to the application.

Verification:

- **141 focused tests**; final full regression **4,499 passed / 12 skipped**,
  283 files (282 passed / 1 skipped). Coverage includes actual PDF bytes/font
  structures, shared text/order, Unicode, long words/pages, unsupported glyphs,
  page cap, font integrity/failure, serialization bridge, exact revision/access
  denial, duplicate/cancel/retry, MIME/filename and 60-second Blob URL cleanup.
- TypeScript, zero-warning lint, 64/64-page webpack build, 115-chunk private-client
  boundary scan and 73-file adapter check passed. The last stream-test type
  correction changed no production source; final regression passed afterward.
- The actual bundled product renderer produced a one-page synthetic Unicode
  file (51,349 bytes) and a three-page long record (11,183 bytes). Independent
  pypdf checks confirmed complete non-whitespace text/order, repeated notices,
  embedded fonts, no active content and no author identity. Packaged Poppler
  rendered all **four final pages**, which were visually inspected. A task-local
  Fontconfig configuration exposed **no system font directories**, preventing
  installed fonts from disguising missing embedded font content.
- A 6/6-page built PROCESS_MEMORY_ONLY fixture at
  `/private/tmp/cl-job-browser-hTKmpQ` passed unreviewed disablement → confirmed
  synthetic review → actual client PDF generation/start feedback. Three locale
  controls, 390/768/1280 widths, 44-pixel targets, visible keyboard focus and
  inspected mobile/tablet/desktop layouts passed; console warnings/errors and
  framework overlays were absent. This is not native download delivery proof.
- Owned tab closed, viewport reset and fixture stopped/removed with unchanged
  source hashes. Independent checks confirmed the exact root absent and port
  3395 closed. Only disposable synthetic fixture state was removed.

PDF guidance required actual-file text and full-page visual checks; Next.js,
React and Impeccable guidance kept lazy loading and existing button conventions.
No export endpoint, persistent document-byte cache, export-history write,
lifecycle/review mutation, Points charge, AI call, database operation,
Hosted/Production change, push or deployment occurred.

**Next:** consolidate four-format export acceptance, including native Safari
clipboard paste and actual TXT/DOCX/PDF save/open. Microsoft Word compatibility,
native discard-confirmation navigation and real Offline/Online remain unpassed.
Durable export history, bilingual/historical/batch export, native sharing, other
Note applications and Hosted activation remain separate remaining work.

## Communication Note native Safari export acceptance (2026-09-08)

The four-format browser delivery gate passed on source `609cb4f`, using native
Safari and only the disposable PROCESS_MEMORY_ONLY fixture at
`/private/tmp/cl-job-browser-80m9QR`. The synthetic revision was saved at
`2026-09-07T16:01:24.311Z` (2026-09-08 in Melbourne). No application source or
approved green visual identity changed in this acceptance batch.

- Before self-review, Copy/TXT/DOCX/PDF were all disabled. The synthetic source
  facts and English/review-language text were inspected; the three test
  confirmations enabled the local review action. Its successful response
  enabled all four exports while retaining **Draft – review required**.
- Safari Copy was followed by a real Command-V into a new empty native TextEdit
  document, not by injecting expected text. The complete English Record copy,
  version, saved/export times and static-copy notices were present; private
  source facts, review translations and internal metadata were absent. The
  unsaved synthetic paste document was discarded afterward.
- The localhost download permission prompt was allowed for this authorized
  test. Safari's native download list and independent filesystem checks both
  showed completed TXT/DOCX/PDF files. Two earlier DOCX files already existed
  and were left untouched; Safari saved this batch's DOCX with a `-2` suffix.
  The application still correctly reports download **started**, not a receipt
  that a file was saved. The saved-file proof below is test evidence only.
- The actual downloaded TXT and DOCX opened in native TextEdit with complete
  readable body text and notices. The actual PDF opened in native macOS Preview
  as one readable page. TextEdit opening is not Microsoft Word or Word-layout
  compatibility evidence; native Word remains untested.
- Independent UTF-8/OOXML/pypdf checks passed for all ten required text fields,
  their order and seven excluded fixture/internal fields. The three formats
  matched after accounting for distinct click timestamps, whitespace and the
  PDF's separate repeated header. DOCX ZIP integrity/header and absence of
  macros, embedded objects and external relationships passed. PDF embedded
  fonts and absence of actions, forms, attachments and annotations passed.
  The first ad-hoc order assertion counted the separate PDF header as the body
  notice; correcting that check passed without changing the file or renderer.
- Packaged LibreOffice rendered this downloaded DOCX and packaged Poppler
  rendered this downloaded PDF. Both one-page outputs were visually inspected
  in full: no clipped text, overlap or missing glyphs. This complements, rather
  than substitutes for, the native opening evidence above. QA render copies
  are not user deliverables or Microsoft Word evidence.

The retained synthetic files in the local Downloads directory are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `communication-note_2026-09-07_44444444_v1.txt` | 534 | `7aa77d92fa55ae844cf0d2d43578b752abcc0d207f544ebeeb3ccfe7c479b1ff` |
| `communication-note_2026-09-07_44444444_v1-2.docx` | 10,076 | `63e8f2bdc249439f32ed86f2a74555c7b868b98a11c0e0857e7e54ad89924c3f` |
| `communication-note_2026-09-07_44444444_v1.pdf` | 8,673 | `76b766306d30832b2aced50797bc1ab38540183665bf97df0aeab964a9ed850c` |

Only the owned Safari test tab and native inspection windows were closed. The
fixture reported stopped/removed/source-unchanged; independent checks confirmed
its exact root absent and port 3395 closed. Other browser tabs and existing
downloads were preserved. No real database, Hosted/Production, AI model, Points
write, push or deployment was used. Browser/PDF/Documents skill guidance drove
actual cross-app, saved-file and whole-page checks instead of toast-only proof.

**Next local implementation slice:** revision-bound export history with minimal
version/format/start-time metadata and honest initiated/failed semantics, not
record bodies or a fabricated file-save receipt. Review the existing inactive
event contract before implementing; database activation remains separately
gated. Microsoft Word compatibility, native discard-confirmation navigation and
real Offline/Online remain unpassed and must not be inferred from this gate.

## Communication Note revision-bound export history local slice (2026-09-08)

Implemented the local history interface, strict wire contract and uninstalled
trusted server port on top of `f439a53`. This is **not durable export history**:
the formal GET/POST route returns `UNAVAILABLE` before reading the request body
when no binding is installed. There is no environment-based durable fallback,
new database/schema/role grant, Hosted activation or browser-persistent cache.

### Behaviour and trust boundary

- Copy/TXT/DOCX/PDF keep the existing exact saved/reviewed-revision access check
  and green UI. History reporting occurs only after native/browser work, so
  Clipboard user activation is preserved. Outcomes are `COPY_REPORTED`,
  `DOWNLOAD_INITIATED` or `FAILED`; none proves that a file was saved, remains
  available, or has been professionally approved. The inactive legacy event
  contract's `DOWNLOADED`/`SHARED` states are deliberately not reused.
- A report body contains only `revisionId`, `format`, `outcome` and `startedAt`;
  an attempt UUID travels in the idempotency header. The server supplies the
  revision number, `recordedAt`, pinned template version and `RECORD_COPY`
  profile. Device start times are untrusted and explicitly labelled. Record
  bodies, source facts, review translations, owner IDs, filenames and raw
  errors are not accepted in history payloads or returned in entries.
- Every history read explicitly requests one selected revision, with at most
  its latest 20 reports ordered by server time and ID. Old-version metadata is
  readable after access validation, but does not enable historical export.
  Empty, pending, unavailable and partial-history views are translated in all
  three locales. Existing history is cleared while a fresh read is pending.
- History writes/reads are private same-origin Cookie requests with no-store
  responses. Guards reject bearer/cross-origin/malformed/oversized requests;
  strict parsing also binds response IDs, exact fields, template and outcome.
  Each client operation is bounded to five seconds; no automatic retry,
  re-export, background beacon or optimistic history entry is created. Access
  loss aborts work and drops late data. A lost history receipt leaves the
  export result unchanged and displays a separate warning.
- A future durable port must transactionally recheck active provider Cookie
  session, owner, document type and non-deleted lifecycle on every read, write
  and replay. Writes additionally require the exact current reviewed revision;
  replay is scoped to owner/attempt and rejects altered reports. This is a
  dedicated write capability, not an expansion of `DOCUMENT_DETAIL` authority.
  These transaction requirements are **not yet a database implementation**.

### Evidence

- **135 focused tests**; full regression **4,590 passed / 12 skipped** across
  285 files (284 passed / 1 skipped). TypeScript, zero-warning lint,
  64/64-page webpack build, 116-chunk private-client boundary scan, 73-file
  adapter check and `git diff --check` passed.
  Contract, HTTP, fixture and component tests cover strict minimisation,
  replay, access denial, deletion/review reset, timeout and post-export logging
  failure. The list parser explicitly projects response fields so caller-only
  `signal`/`fetcher` fields cannot accidentally escape into a response.
- Only the owned 6/6-page local fixture at
  `/private/tmp/cl-job-browser-znk7Ik` installed the memory-backed port, capped
  at 128 events with immutable same-attempt receipts. The UI explicitly stated
  that records disappear when the test server stops.
- The actual browser passed: empty history while unreviewed; inspected
  synthetic review; TXT download initiation; version-1 report; page reload and
  server readback; wording edit to version 2 with empty history; reopening
  version 1 with its original report and disabled historical exports. This
  proves the bounded browser/server flow, not durable or cross-device storage.
- English, Simplified and Traditional Chinese views were inspected. At
  390/768/1280 widths there was no horizontal overflow, new/existing export
  buttons were 44 pixels high and keyboard focus remained visible. No captured
  browser warning/error or framework overlay appeared. Next.js/React guidance
  preserved route/client boundaries; Impeccable guidance retained the approved
  visual identity and separated uncertain history from successful export.
- Owned tab closed, viewport reset, fixture stopped/removed with unchanged
  source hashes; independent checks confirmed its exact root absent and port
  3395 closed. Only disposable synthetic state was removed. Existing native
  Safari tabs and earlier Downloads were untouched. No real care data, AI
  call, Points write, database operation, push or deployment occurred.

**Next:** implement a dedicated, still-uninstalled durable history write/read
candidate with real disposable local PostgreSQL tests for ownership, active
session, revision/review, deletion and idempotent replay/concurrency. Keep the
formal route hard-off until its separate activation gate. Microsoft Word,
native discard-confirmation navigation and real Offline/Online remain unpassed;
this slice does not close those gates or implement the other Note applications.

## Communication Note durable export history candidate (2026-09-08)

Implemented a dedicated durable read/write adapter and CLI-generated candidate
`20260908014022_add_communication_note_export_history_shadow.sql` on top of
`6dbd49b`. The candidate remains in `supabase/migration-candidates`, not the
approved migration manifest. **Both formal HTTP handlers remain unbound.**
No retained database, Preview/Production project, AI model or Points was used.

### Storage and authorization

- `careslink_communication_history.reports` is a private, RLS-enabled table
  with exactly 12 columns: owner, attempt, document, revision, revision number,
  format, outcome, device start time, server record time, template, profile and
  shadow marker. No body, facts, translation, filename, file URL or raw error is
  stored. A composite owner/attempt primary key deduplicates reports across
  documents; the revision read index matches owner/document/revision and
  descending server time/attempt ID. Document/revision deletion cascades remove
  dependent reports; tombstoned documents cannot serve existing history.
- The private definer uses an isolated NOLOGIN/NOINHERIT/NOBYPASSRLS executor
  and empty `search_path`. Metadata-only column grants cannot read revision
  content or privacy proofs, and there are no direct Auth, Points or legacy
  artifact-table grants. Document/flag UPDATE column permissions permit row
  locks only; `WITH CHECK(false)` prevents mutation. Reports are append-only
  for this executor, with no UPDATE/DELETE/TRUNCATE privilege.
- Two public invoker-only facades expose the narrow record/list signatures but
  receive **no API-role execution grant**. The candidate grants no private
  schema usage or executor membership to application callers. All local caller
  capabilities used by the tests were temporary and removed with the cluster.
- Record, list and replay share active verified Provider/session checks, then
  locked independent history/mobile-sync switches and an owner-bound document
  SHARE lock. A transaction-scoped owner/attempt advisory lock serializes
  competing reports; the unique key remains authoritative. Expiry and session
  validity are checked with wall-clock time again after possible waits and
  before returning. Edits, review changes and deletion serialize through the
  existing document lock convention; application callers cannot directly append
  review events or change the document pointer.
- Writes require the exact current revision and its latest confirmed review,
  including on replay. Changed format/outcome/device time or document/revision
  reuse of an attempt fails. Historical metadata reads do not require or grant
  permission to re-export the old version. Readback uses one bounded 21-row
  snapshot to return the latest 20 and `hasMore`, sorted by server time rather
  than the untrusted device clock. Template/profile/revision number and record
  time are assigned server-side; only browser-reported outcomes are claimed.
- The server-only adapter requires a dedicated disabled-by-default capability,
  existing durable Product API gate and exact non-Production Preview target.
  It uses one request-scoped verified Cookie client for auth/session/RPC, never
  owner/session body parameters, generic document-write authority, service-role
  fallback or automatic retry. A lost/aborted receipt remains uncertain.

### Verification and limits

- **123 focused tests** passed, including 42 new durable adapter cases; final
  full regression **4,632 passed / 12 skipped**, 286 files (285 passed / 1
  skipped). The exact current-session importer inventory was updated for this
  one uninstalled module, without broadening the allowed import pattern.
  Final TypeScript, zero-warning lint, 64/64-page webpack build, strengthened
  116-chunk client-boundary scan, 73-file adapter check and `git diff --check`
  all passed.
- The fixed `--history` runner passed **35 real local PostgreSQL 16 scenarios**
  (14 dependency regressions, 21 history groups): non-superuser candidate DDL,
  defaults/ACLs/RLS/column grants, independent committed readback, concurrent
  first submission/cross-document collision, altered replay, rollback, all
  format/outcome pairs, foreign owner, type/lifecycle/revision, review reset,
  active Provider/session and forged user-metadata rejection, latest-20 order,
  index eligibility and expiry/revocation/edit/deletion lock races. Reads and
  writes both held session, switch and lifecycle locks until commit. Unrelated
  revisions, review events, sync receipts, Points and generation jobs were
  unchanged by the history operations.
- Supabase CLI 2.115.0 local security advisors returned `results: []`. The
  migration was generated with `supabase migration new`, moved out of active
  migrations before editing and applied transactionally only in the disposable
  fixture. No migration-history record or Hosted manifest was changed.
- An initial test-only column-count assertion stopped the first run; it was
  replaced with an exact column-name assertion. The failed cluster
  `/private/tmp/cl-export-history-To6HDW` and complete passing cluster
  `/private/tmp/cl-export-history-258NVC` both stopped and were removed; exact
  directory absences were independently verified. No TCP listeners or caller-
  supplied database targets were accepted. Only disposable synthetic data and
  roles were removed; existing files and databases were untouched.
- Supabase guidance drove explicit grants/RLS separation and the private
  definer boundary; PostgreSQL guidance drove lock order and composite indexing.
  Relevant official references were checked: [function security](https://supabase.com/docs/guides/database/functions),
  [grant changes](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
  and [PG16 locking](https://www.postgresql.org/docs/16/explicit-locking.html).
  Next.js guidance added client-bundle exclusion checks for the history RPC
  names and enable flag. No page, visual identity or browser flow changed.

This proves an uninstalled durable candidate on real local PostgreSQL, not
Hosted Auth/PostgREST/TLS, a retained schema, cross-device history or a complete
browser-to-durable-history flow. **Next:** bind the existing export UI to this
candidate only inside an owned disposable local database fixture, and verify
export → durable report → refresh/readback plus denied-access handling. Keep
formal routes hard-off and do not promote or deploy as part of that local gate.

## Communication Note export history / real local browser roundtrip (2026-09-08)

The existing green result/review/export page now has a reproducible **owned
local test binding** to the durable history candidate. Run
`node scripts/browser-e2e/communication-note-recovery.mjs --database-history`
from this app. This is not a formal route activation or a retained database.
The runner accepts no database target or credentials: it creates its own
Unix-socket-only PostgreSQL 16 cluster and a built loopback app on port 3395.
Synthetic Cookie identity replaces Hosted Auth issuance only; active sessions,
review, wording edits, history transactions and independent reads use real SQL.

### Test binding and isolation

- The explicit history mode composes the 14 self-review, 21 history and 19
  wording-edit scenario groups (**54 passed**) before resetting only its own
  synthetic fixture. It installs narrow history RPC/schema permissions only
  there. The runtime LOGIN is non-admin/NOINHERIT/NOBYPASSRLS; direct review
  and history table reads are denied. History RPCs require the extra
  `CARESLINK_LOCAL_HISTORY_DATABASE=OWNED_UNIX_SOCKET_ONLY` guard as well as
  the existing exact owned-root, Unix-socket and non-Hosted guards.
- The bridge invokes the existing durable adapter through the real HTTP
  handler, current-session resolver and parameterized record/list RPCs. Extra
  owner arguments, arbitrary SQL/RPCs, mismatched Host/Origin and Bearer
  credentials fail before database access. Fixed rejections are preserved;
  diagnostics contain operation/status metadata, never Note text or credentials.
- The formal export-history route joins the runner's source-isolation checks.
  It and the formal review/edit routes remain unbound/hard-off. No migration
  candidate, approved manifest, product component, CSS, Logo or model setting
  was changed. Outbound server fetch is disabled in the owned copy.
- Fixed stdin controls `history-off` / `history-on` toggle only the local
  history switch. Existing `revoke` / `restore` affect only the fixture session;
  `status` returns aggregate version/format/outcome counts, not content.

### Browser and independent database evidence

An isolated in-app-browser tab exercised the built fixture, not the user's
Safari session or existing tabs:

1. Version 1 started with empty history, review required and all four export
   buttons disabled. After inspecting synthetic facts and confirming review,
   TXT export produced one committed `DURABLE` report. A whole-page reload and
   explicit history refresh returned that same record; there was no memory-only
   warning or false claim that a file had been saved.
2. Copy, DOCX and PDF added exactly one report each. The database independently
   contained four version-1 reports: `COPY_REPORTED` for Copy and
   `DOWNLOAD_INITIATED` for each file format. This run verifies browser reports,
   not native saved-file/open or cross-app clipboard evidence; those remain
   bounded by the separate earlier Safari acceptance record.
3. With the history switch off, another TXT download was initiated but its
   report returned 503. The page retained the download-start message and showed
   a separate unconfirmed-history warning. Restoring the switch and refreshing
   history still returned exactly four reports: no automatic retry, retroactive
   write or repeated export occurred.
4. A real wording save created version 2 and one edit/sync receipt. Its history
   was initially empty and review reset to required. Opening version 1 retained
   all four reports while disabling old-version exports. After a new version-2
   review, one TXT report appeared only in version 2, including Simplified and
   Traditional Chinese readback of the same record.
5. Deleting the fixture session while version-1 history was visible made the
   next history read return 401 and replaced the entire private view with the
   synthetic sign-in boundary. No Note or history remained visible. Restoring
   the session required a new authorized page read. Browser warning/error logs
   were empty; no framework overlay appeared.
6. Final independent SQL observation: **5 reports across 2 revisions, 2 review
   events, 1 wording receipt and 1 sync change; zero Points ledger entries and
   zero generation jobs**. Supabase CLI 2.115.0 security advisors against this
   exact local Unix socket returned `results: []` while the test capability was
   installed. The CLI's generic “remote database” label does not describe the
   transport: the explicit percent-encoded socket path and PostgreSQL target
   attestation prove local-only access.

### Verification, cleanup and remaining scope

- Focused tests: **147 passed**, including 34 owned-database bridge tests.
  Full regression: **4,644 passed / 12 skipped**, 286 files (285 passed /
  1 skipped). TypeScript, zero-warning full lint, 64/64-page webpack build,
  116-chunk client-boundary scan, 73-file adapter sync and diff checks passed.
  The owned browser fixture separately built all 6 static pages.
- Initial combined runs stopped after the matrices because the bootstrap
  readback probe omitted JWT `exp`. The new history SQL correctly rejected it
  with `AUTH_REQUIRED`; the probe now supplies a bounded synthetic expiry.
  No security check was weakened. Fixed checkpoint/error-code diagnostics were
  added to make future failures actionable without printing private payloads.
- All four attempts stopped their owned PostgreSQL processes and removed their
  own temporary roots. The first attempt predates root-name logging; its
  cleanup reported `removed/sourceUnchanged: true`. Named diagnostic roots
  `/private/tmp/cl-job-browser-KkGHYS`, `/private/tmp/cl-job-browser-kXuRUj` and
  passing root `/private/tmp/cl-job-browser-yvfpV6` were independently confirmed
  absent, and port 3395 was independently confirmed closed. The test tab was
  closed. No existing database, user tab or prior native export file was removed.
- Supabase least-privilege guidance kept grants disposable and runtime access
  narrow; Next.js guidance kept Node-only handlers confined to the built test
  copy; browser-verification guidance required actual page actions and a visual
  check. The approved green identity was preserved.

This closes the **local browser → durable history → reload/readback** gate,
not Hosted Auth/PostgREST/TLS, formal activation, cross-device recovery or
release readiness. No push, deployment, Hosted/Production change, real care
data, AI call or Points write occurred.

**Next local integration slice:** join the existing facts-entry, job-status and
saved-result/review/export pages in one owned synthetic end-to-end fixture.
Use explicit synthetic admission/worker outputs, not real AI or a Production
binding, and distinguish this UX evidence from real generation/Points evidence.
The original five-Note launch scope and separately approved activation gates
remain unchanged.

## Communication Note fixed synthetic full-flow integration (2026-09-08)

`node scripts/browser-e2e/communication-note-recovery.mjs --flow` now joins the
existing facts composer, task page and real-local-database result/review/export
page inside one built, owned loopback fixture. **This is UX integration evidence,
not real generation, durable task admission or Points accounting.**

- Every page carries a test notice: no AI or Points charged, simulated task
  progress, pre-seeded result, disposable local database. The instructions give
  the only accepted English facts. The displayed 100 available / 0 reserved /
  20-Point cost is explicitly demonstration data. Other input locales do not
  enable submission in this fixed fixture; result-page locales remain available.
- The unchanged composer performs minimum-fact/privacy review and both explicit
  confirmations. The owned POST bridge checks exact loopback Host/Origin,
  Fetch Metadata and method before adapting the request to the existing
  HTTPS-only **test factory**. This internal URL substitution is not TLS
  evidence and never relaxes the formal handler.
- The real principal resolver checks the synthetic Cookie identity and real
  local active-session RPC. The existing generation handler repeats schema,
  privacy and confirmation validation; the test submitter then accepts only
  the exact fixed facts and English locale, and compares them with the strict
  saved-document reader's source facts before returning one synthetic task.
- The task stores only idempotency/request digests, creation time and bound
  result metadata in process memory. Concurrent same-key submission produces
  one created acknowledgement; exact replay returns the same job. Another key
  conflicts, changed facts are rejected, and replay rechecks authorization.
  No request facts/key are logged or persisted by this test adapter.
- Progress is explicitly time-derived `QUEUED` → `RUNNING` → `SUCCEEDED` over
  16 seconds. Status GET only reads metadata and rechecks the exact saved
  revision; it never enqueues, writes Points, invokes a worker or generates
  content. Result/read/review/edit/history routes are inaccessible before the
  synthetic admission has completed, even if their fixed UUIDs are known.
- Formal composer/page/generation-route sources and readiness latches join the
  runner's source-isolation checks and remain unchanged. The exact test-factory
  importer inventory now permits this one server-only owned fixture, with guard
  and no-provider/no-raw-query assertions; there is no wildcard allowance.

### Acceptance and cleanup

The isolated in-app-browser tab exercised empty-form rejection (five required
fields), exact fact entry, privacy review and both confirmations, submission,
automatic queued/running/succeeded observations, full task-page reload without
resubmission, and the link to the exact saved revision. The result's source facts
matched all submitted fields. Four exports were disabled before review; after
synthetic review, TXT export was initiated and its one durable history record
survived a whole-page reload. Session revocation then removed all private result
and history content and showed the synthetic sign-in boundary. Browser warning/
error logs were empty. The existing green components and Logo were not edited.

Independent database observations before review and after export proved **zero
generation jobs and zero Points ledger entries**. The final cluster had one
review event, one version-1 TXT `DOWNLOAD_INITIATED` report, zero wording receipts
and zero sync changes. Only this TXT browser report was re-exercised in the full
flow; this does not extend prior native save/open or four-format acceptance.

Verification: **23 new flow tests**, 57 flow/database-bridge focused tests,
44 flow/runtime-boundary focused tests; final full suite **4,667 passed / 12
skipped**, 287 files (286 passed / 1 skipped). TypeScript, zero-warning lint,
64/64-page webpack build, 116-chunk client-boundary check, 73-file adapters and
diff checks passed. The owned fixture also passed the 54 database scenario
groups and its separate build (5 static pages plus dynamic flow routes).
Initial test-only type errors and the expected exact-importer inventory failure
were corrected before final verification; no product security gate was opened.

The single owned root `/private/tmp/cl-job-browser-uhNRAL` stopped and was
removed with `sourceUnchanged: true`; its absence and closed port 3395 were
independently checked. The test tab was closed, with other user tabs preserved.
No new SQL candidate, Hosted/Production change, push, deployment, model call or
Points write occurred. Next.js guidance kept the test routes server-only;
Supabase guidance preserved fresh session checks; browser guidance required
actual form, navigation, refresh and denied-access evidence.

**Next local implementation slice:** replace synthetic task admission with the
existing real local database enqueue / 20-Point reservation path, and verify
exact retry does not reserve twice. Keep synthetic data, model calls off and
formal/Hosted activation closed. Terminal settlement, real worker/model output,
Hosted identity/TLS and the five-Note launch gates remain separate evidence.

## Communication Note real local admission and Points browser gate (2026-09-08)

The next local slice is complete via explicit `--admission`; the earlier
`--flow` remains a separately labelled simulated-progress fixture. Formal
routes, readiness latches, components and green Logo are unchanged.

### Implemented boundary

- The unchanged composer uses the real zero-argument Points preview RPC. One
  fixed synthetic owner starts with **30 adjustment Points**, not a welcome
  entitlement, purchased credit or legacy-credit conversion.
- The route retains actual body/privacy validation and fresh owner/session
  checks, accepts only the pinned English synthetic facts, and injects the
  existing 19-parameter policy-bound admission repository. PostgreSQL atomically
  creates the queued job and reserves 20 Points. Only hashes and metadata reach
  the admission SQL; no facts/key are logged or stored by this adapter.
- A separate SCRAM runtime LOGIN can SET only the admission caller and job
  status caller. It has no table, worker/executor, authenticated or service-role
  membership. Each request attests the owned Unix socket/cluster, uses exact
  parameterized SQL, bounds statement/lock time and closes its connection.
- The owner-controlled setup adds 12 existing migrations after the review
  fixture's minimal chain, including their required Preview isolation roles.
  Migrations run as non-superuser `postgres`. Only this attested fresh local
  database relaxes the generation default-off constraint and seeds synthetic
  policy receipts. All document, ledger, FK, RLS and deferred binding constraints
  remain enabled. No new migration/candidate or Hosted permission is added.
- Payload/KMS/provider receipts are explicitly synthetic: there is **no payload
  vault, real encryption attestation, worker, model call or generated result**.
  Jobs stay genuinely `QUEUED`, attempt 0. The unrelated seed document's read,
  review, edit and export-history endpoints return not-found in this mode.

### Verification and limits

The fixed lost-ack probe suppresses the first successful admission response.
The actual browser showed the original composer's locked fields and “Retry exact
request”; retry returned the same PostgreSQL job with `created: false`. Before
and after retry, independent operator observations showed **1 job, 1 admission,
1 RESERVE event, 20 reserved and 10 available**, with zero terminal ledger events.
The two ledger rows were the synthetic GRANT and the single RESERVE.

Whole-page task reload recovered the same queued job without POST. The balance
page and composer reloaded **10 available / 20 reserved**, with the insufficient
balance message and disabled new-submit control. Revoking the synthetic session
removed private task state and showed sign-in; it did not release or charge
Points. Browser warning/error logs were empty on the verified loaded pages.
One test-instruction link click did not navigate during the browser check;
explicitly loading its observed URL succeeded. This is not claimed as a new
product-navigation acceptance result.

Eight additional real PostgreSQL rollback scenarios cover purpose-only rights,
atomic admission, same-key/new-candidate replay, changed-request conflict,
insufficient balance, session mismatch, the real purpose status reader and
restoration of the fresh browser balance. The existing 14 review scenarios also
passed. New bridge tests: **23**; full suite **4,690 passed / 12 skipped** across
288 files (287 passed / 1 skipped). TypeScript, zero-warning lint, 64/64-page
webpack build, 116-chunk client-boundary scan and 73-file adapter check passed.
Local security Advisors returned no issues.

Two initial dependency-preflight failures were cleaned before retry; inspection
identified the required existing custody and signed-terminal caller migrations.
The successful owned root `/private/tmp/cl-job-browser-hVaEor` and failed roots
`/private/tmp/cl-job-browser-234BaY`, `/private/tmp/cl-job-browser-7Zwx4g` were all
stopped/removed and independently checked absent; port 3395 was closed. Only the
owned browser tab was closed. No Hosted/Production mutation, real payment, model
call, push or deployment occurred. Supabase/Postgres guidance kept fresh sessions
and purpose-only privileges; Next/browser guidance required server-only seams
and actual replay/refresh evidence.

**Next bounded slice:** connect real local task terminal settlement to the
browser fixture: success commits the reservation, failure/cancellation releases
it, and terminal replay must not settle twice. Use fixed synthetic outcomes only;
real payload/KMS, worker/model execution, Hosted activation and the five-Note
launch gates remain separate. This admission gate is not a launch approval.

## Communication Note real local terminal settlement browser gate (2026-09-08)

The explicit `--settlement` fixture now connects the previous real local
admission path to the existing terminal RPCs. `--settlement-check` runs the
database matrix without starting Next. Product routes, green components/Logo,
formal activation and Hosted/Production configuration remain unchanged.

### Boundary and implemented behavior

- Terminal authority exists only in the parent process behind four fixed stdin
  commands: `settle-failure`, `settle-cancel`, `settle-success`, `settle-replay`.
  The separate non-superuser runtime has direct EXECUTE on exactly six existing
  claim/authorize/fence/success/failure/cancel RPCs, no role memberships or direct
  table access. Its random password and replay tokens are never passed to Next.
- Admission still atomically reserves 20 of 30 synthetic adjustment Points.
  Failure/cancellation releases 20; success atomically saves one canonical
  document/revision and commits the reservation. Replaying the exact terminal
  arguments changes neither response nor aggregate ledger/document state.
- Success is **authored synthetic content**, not an AI response. The real
  payload-consumption port remains unbound. An explicitly test-only parent
  update marks only the exact synthetic owner/job/payload/attempt/grant consumed
  and supplies a synthetic grant hash; provider evidence is synthetic too.
  No RLS, FK, timing or terminal consistency constraints are disabled.
- This fresh fixture seeds a 5-second lease / 10-second attempt and minimum
  payload window, with its exact recalculated policy digest. The earlier
  admission-only policy remains unchanged. Initial success preflights caught
  the shorter lease/window and missing grant-hash constraint; the test receipts
  were corrected, not the existing migrations or database safety rules.
- The only result bridge is a server-only GET for the newly settled document
  and revision. Its mode-0600, exclusive-created metadata file contains those
  two IDs only; malformed/symlinked/unrelated bindings deny access. Fresh
  session/owner SQL checks still run. Review/edit/history writes remain closed
  in this mode, and exports remain disabled pending self-review.

### Verified result

The standalone PostgreSQL matrix passed **9 terminal scenarios**, in addition
to 14 existing review and 8 admission scenarios. Each terminal outcome, exact
replay and rejected second command without a queued job was checked. Final
counts: 3 jobs/reservations/settlements, 1 COMMIT, 2 RELEASE, **10 available /
0 reserved**; only success added a document and revision.

An independent browser run used the unchanged composer for all three jobs.
The first deliberately lost admission acknowledgement recovered with the exact
same request. The UI then showed Failed, Cancelled and Saved, with 30/0 after
each release and 10/0 after success. The actual new result opened/reopened at
version 1 with fixed synthetic wording, `Self-review required` and disabled
Copy/TXT/DOCX/PDF. Revoking the synthetic session and reloading removed private
content and showed sign-in, without another Points event. Warning/error logs
were empty on verified loaded pages. This does not attest real model quality,
real vault/KMS, Hosted identity, or successful review/export for this new result.

The 21 new bridge/boundary tests passed; full suite **4,711 passed / 12 skipped**,
289 files (288 passed / 1 skipped). Typecheck, zero-warning lint, 64/64-page
Turbopack build, 32-chunk client-boundary scan and 73-file adapter check passed.
The initial sandboxed build could not bind its internal process port; the
authorized local retry passed. Local security Advisors returned no findings.

Owned roots `cl-job-browser-bhG97L`, `cl-job-browser-91uqyq`,
`cl-job-browser-WxXSjG`, `cl-job-browser-xT17LY`, `cl-job-browser-pdgChD`,
`cl-job-browser-ypH3Mh` and `cl-job-browser-VxWs6V` under `/private/tmp` were
independently checked absent; the last matrix and browser runs confirmed
PostgreSQL stopped and source unchanged. The owned browser tab was closed;
other user tabs were preserved. No Hosted mutation, actual payment, AI call,
push or deployment occurred. Supabase/Postgres guidance preserved purpose-only
rights and existing constraints; Next/browser guidance kept the terminal
operator outside Next and required actual navigation/access evidence.

**Next bounded implementation:** connect this newly settled local draft to the
already tested durable self-review and export-history path, so the actual new
document can complete the local application flow. Keep fixed synthetic facts,
no model calls and formal/Hosted activation closed. Five-Note launch completion,
real provider/vault integration and billing remain separate work.

## Communication Note settled draft review and export integration (2026-09-08)

The new opt-in `--settlement-review` joins actual local admission and terminal
settlement to the existing durable self-review/export-history adapters. It does
not alter `--settlement`, formal product routes, green components/Logo, SQL
migrations/candidates or Hosted/Production activation.

### Implementation and scope

- One server-only bridge accepts only the newly settled document identified by
  the existing exclusive-created, mode-0600 metadata file. The owned-root,
  realpath, exact-key and UUID checks are shared with the original result GET.
  No pre-seeded document is exposed through this bridge.
- Three independent mode guards, exact route/method selection, loopback Host,
  same-origin transport and POST Origin checks precede dispatch. Only document
  GET, self-review POST and export-history GET/POST are connected. The untouched
  request goes to the existing bounded parser, current-session/provider/owner
  checks and transaction-level current-revision/review checks.
- The owned local database installs the existing history candidate and its
  narrow temporary capability. It does not install or enable wording editing.
  No terminal password or parent operator enters Next; no process-memory history
  fallback is added. Review/history operations cannot settle or charge Points.
- The fixed success content, payload-consumption receipt and provider evidence
  remain synthetic. Browser confirmation simulates a test user's interaction;
  it is not an actual person's review or professional approval of care content.

### Verification

`--settlement-review-check` passed **61 database scenarios**: 14 review,
21 history, 8 admission, 9 terminal and 9 newly settled-draft integration cases.
The new cases cover required review/empty durable history, unreviewed report
denial, exact review/report replay, changed replay denial, foreign access,
revocation, history-switch closure/recovery and unchanged Points/jobs/revisions/
content. Only one review event and one synthetic report are added. The initial
run stopped on a test expectation: the existing document SQL emits
`SESSION_REVOKED`, while review/history emit `AUTH_REQUIRED`. The assertion was
corrected without changing the authorization contract; that root was cleaned.

The independent browser run submitted the fixed facts, recovered the deliberately
lost admission acknowledgement, settled success once and replayed it unchanged.
The new version opened with review required and all four export buttons disabled.
After the three simulated confirmations, the actual database returned CONFIRMED.
Clicking TXT yielded `DOWNLOAD_INITIATED` and exactly one durable history entry.
Full page reload preserved review status; explicit history refresh recovered the
same entry. Disabling history cleared the displayed list and explained that the
user should refresh later, not export again; re-enabling restored the one entry.
Session revocation plus reload removed private content and showed sign-in.
The final browser counts stayed **1 job, 1 RESERVE, 1 COMMIT, 1 review, 1 TXT
report, 10 available / 0 reserved**. No extra generation, revision or charge was
created by review/history operations. Verified loaded pages had no warning/error
logs; the intentional history-off request returned 503 as expected.

This browser evidence covers initiation/reporting, not confirmed OS file saving,
opening or clipboard delivery. No native export compatibility is newly claimed.
The draft remains a draft after confirmation. Editing and version-isolation for
this newly generated result are not enabled by this slice.

The 20 new bridge tests passed; full suite **4,731 passed / 12 skipped** across
290 files (289 passed / 1 skipped). Typecheck, zero-warning lint, 64/64-page
Turbopack build, 32-chunk client-boundary scan and 73-file adapter check passed.
Local security Advisors found no issues. Owned `/private/tmp` roots
`cl-job-browser-5iz33E`, `cl-job-browser-8hZ1bi` and `cl-job-browser-IsOkPN` were
stopped/removed and independently checked absent; port 3395 had no listener.
Only the owned browser tab was closed. No push, deployment, model call or Hosted/
Production mutation occurred. Supabase/Postgres guidance preserved narrow roles
and fresh transactions; Next/browser guidance kept the bridge server-only and
required actual navigation, refresh and access-denial checks.

**Next bounded implementation:** connect wording edits for this new local draft,
then verify a new version requires a new self-review and retains the old
version's separate export history. Keep synthetic inputs, AI calls off and
formal activation closed. Real provider/vault integration, remaining Note types
and billing are not completed by this local flow.

## Communication Note settled draft wording edit and version history integration (2026-09-08)

The opt-in `--settlement-edit` continues the actual newly settled local draft
through the existing wording editor. The original `--settlement` and
`--settlement-review` modes retain their narrower routes. No formal product
route, green component/Logo, SQL migration/candidate or Hosted activation changes.

### Implementation and scope

- Two independent edit guards enable the existing revisions POST adapter and
  wording-edit capability only in the owned disposable database. The untouched
  request still passes the existing bounded parser, fresh session/owner checks
  and transaction-level base-revision/idempotency checks. Terminal authority
  remains parent/stdin-only, outside Next.
- The exclusive mode-0600 result binding still identifies only the actual newly
  settled document. Edit mode allows selection of its later revisions; the
  existing document projection and history SQL validate revision membership.
  No result metadata is rewritten and no caller-selected document is exposed.
- Saving changes only the three wording fields, appends one revision and
  requires a new self-review. Source facts, privacy binding and the old revision
  stay unchanged. The generation job remains anchored to its original version,
  including after a terminal receipt replay following the edit.

### Verification

`--settlement-edit-check` passed **89 real local database scenarios**: 14 review,
21 history, 19 existing edit, 8 admission, 9 terminal, 9 settled-review and 9 new
settled-edit cases. The extension covers exact edit replay, changed replay and
stale-base denial; unchanged facts/original version; fresh review required;
separate version histories; foreign/revoked denial; and terminal replay without
extra Points, jobs or documents. The actual document ends with two revisions,
two review events and one export report per revision.

An independent production-built browser fixture completed fixed admission,
lost-response recovery and successful settlement. Version 1 was test-reviewed
and a TXT download initiated. The unchanged editor saved the fixed English,
Simplified and Traditional Chinese wording as version 2. All four export buttons
were disabled again and the new version's history was empty. Opening version 1
showed its original wording and its one TXT report, with historical editing and
export still unavailable. Returning to version 2 required three fresh simulated
confirmations; TXT initiation then added only a version-2 report. Full reload
preserved the new wording/review, and history refresh restored that same report.

Final browser observations: **1 job, 1 RESERVE, 1 COMMIT, 10 available / 0
reserved**, two review events and exactly one `DOWNLOAD_INITIATED` TXT report
for each version. Editing and terminal replay added no charge. Revoking the
synthetic session and reloading showed sign-in with private content removed.
Verified loaded pages had no warning/error logs. These are simulated test-user
confirmations and browser initiation reports, not a real person's review,
professional approval or confirmed OS file saving/opening. No AI was called.

Eight new bridge tests passed (28 in the file); the full suite passed **4,739 /
12 skipped** across 290 files (289 passed / 1 skipped). Typecheck, zero-warning
lint, 64/64-page Turbopack build, 32-chunk client-boundary scan and 73-file adapter
check passed. Local Unix-socket security Advisors returned no findings. Owned
`/private/tmp/cl-job-browser-5YtpkI` and `cl-job-browser-Mty6tL` were stopped,
removed and independently checked absent; port 3395 had no listener. Only the
owned browser tab was closed. No push, deployment or Hosted/Production mutation
occurred. Supabase/Postgres guidance preserved temporary narrow permissions and
short transactions; Next/browser guidance preserved the server-only boundary
and required actual save, version navigation and reload/access checks.

**Next bounded implementation:** connect a document-list/revisit entry for this
locally saved draft so it can be found and reopened after leaving the result
page. Preserve the green design, synthetic inputs and no-AI/local-only boundary.
Formal edit/history activation, real provider/vault integration, the remaining
Note types and billing remain separate work; this is not a five-Note launch gate.

## Communication Note saved draft list and revisit integration (2026-09-08)

The new `--settlement-list` connects a reusable, three-locale saved-drafts surface
at `/ai-documents` **only in the disposable local app**. The formal workspace
still uses its existing legacy draft store; no formal page/API route, migration,
retained permission, Hosted/Production flag or deployment is changed.

### Implementation and boundary

- The existing `list_v1_shadow_documents` RPC supplies owner-scoped metadata
  through the existing non-superuser runtime and fresh cookie/session checks.
  The fixture's RPC allowlist adds this read only when its independent list
  guard is enabled. No table grant, new SQL function or document-content read
  is needed for the list.
- The server filters to the exact newly settled document from the existing
  private result binding. Unrelated seed documents, other Note types, deleted
  records and documents without a saved revision are not displayed. A missing
  result before settlement gives an empty list; invalid bindings/backend errors
  give unavailability. A paginated response fails closed, so this fixed single-
  document fixture cannot be mistaken for a complete general-purpose catalog.
- The response contains only document ID, version number, source locale and
  update time. Exact-key parsing rejects content, review approvals, duplicate
  IDs and malformed metadata. The browser does not display raw IDs or source
  text, persist metadata in device storage, submit generation or change Points.
- The list's normal link rechecks and opens the **current** version. The original
  task-result link remains pinned to the revision created by generation. List
  rows do not imply a self-review confirmation or permission to export.
- Reuse the committed green tokens, reverse Logo and controls. English,
  Simplified and Traditional Chinese include empty, loading, failure and refresh
  states. Requests are GET/no-store, bounded by an eight-second client timeout.
  Focus, auth-storage, online and persisted-page return reauthorize; hide/offline
  clears the list and stale/aborted responses cannot restore it. Offline shows
  retryable unavailability rather than an indefinite checking message.

### Verification and limits

`--settlement-list-check` passed **94 real local PostgreSQL scenarios**: the
previous 89 plus five list cases covering current edited-version metadata,
absence of wording/review approval, foreign-owner exclusion, revoked-session
denial and unchanged ledger/documents/history on repeated reads. This uses the
existing narrow runtime, not application access through the bootstrap role.

Independent browser evidence: empty list → create fixed synthetic task → recover
lost admission acknowledgement → terminal success → leave task page → find the
actual new version 1 in the list → open/edit/save version 2 → return using Logo →
reload list → reopen current version 2 with review still required and TXT export
disabled. Three-locale navigation and manual list refresh passed. Revoking the
synthetic session then refreshing the list cleared metadata and showed sign-in.
Final browser counts were **1 job, 1 RESERVE, 1 COMMIT, 10 available / 0 reserved**;
the one wording edit added one revision, and no review/export report was created
by list access. Loaded pages had no warning/error logs. The later offline-copy
adjustment is covered by DOM-event tests, not a new native network-toggle claim.

The 55 new tests passed; full suite **4,794 passed / 12 skipped**, 293 files
(292 passed / 1 skipped). Typecheck, zero-warning lint, 64/64-page production
build and 32-chunk client-boundary scan passed. Local security Advisors returned
no findings. Owned `/private/tmp/cl-job-browser-BGYbku` and
`/private/tmp/cl-job-browser-0ZDon2` were stopped/removed and independently checked
absent; port 3395 had no listener. The dedicated browser tab was closed while
other tabs were preserved. No AI, real care data, payment, push or deployment.

Impeccable guidance preserved identity and a restrained metadata list; committed
foreground/canvas and primary-action text contrast measured 11.94:1 and 12.18:1.
Supabase/Postgres guidance kept existing minimal grants and short transactions;
Next/React/browser guidance required private state clearing and actual revisit
checks. No accessibility certification, native offline/cross-device recovery,
real human review or formal catalog activation is claimed.

**Next bounded implementation:** add a local entry for the in-progress generation
task so leaving before completion does not lose the path back to its status.
Keep fixed synthetic data, no AI/provider calls and no Hosted activation. The
remaining Note types, real provider/vault integration and billing remain open.

## Communication Note in-progress task workspace entry (2026-09-08)

`--workspace-task` extends the saved-list fixture with a three-locale task entry.
This is **one actual admission per owned local run**, not a general task catalog,
production activation or durable cross-device recovery implementation. The
formal legacy workspace, routes, migrations, grants and feature flags remain
unchanged. Existing green tokens, Logo, typography and controls are preserved.

### Implementation

- The parent preallocates one random candidate job ID before starting Next and
  passes it in server-only fixture environment. The actual atomic admission uses
  that ID. No locator write follows SQL commit, so a lost response cannot create
  a gap between a committed task and its locator. Other fixture modes continue
  to use their existing random-candidate/replay behavior. This mode intentionally
  does not support a second task after completion.
- Workspace GET first uses the existing guarded metadata list and fresh
  cookie/session checks. It then reads the exact candidate through the existing
  purpose-only job-status repository, including a fresh principal and SQL
  owner/session validation. A strict NOT_FOUND means no visible task; denial,
  invalid data and read errors are not invented progress or empty successes.
  No new SQL function, table grant, worker authority or application bootstrap
  access is introduced. The existing terminal controller stays outside Next.
- Strict opt-in parsing exposes only task ID, status and created/updated times
  alongside the existing draft metadata. No facts, wording, request key, result
  hash, failure details or review approval are returned. The task ID appears
  only in its normal status link, not as visible list text or browser storage.
- Queued/running/saved/failed/cancelled labels are localized. Reading or returning
  cannot start/retry generation, confirm review or change Points. The local
  create link is hidden while a task exists or access/state is unknown.
- Both entries share the existing eight-second timeout, abort/stale-response
  handling and focus/storage/online/page lifecycle checks. Auth failure clears
  tasks and drafts together before sign-in. The workspace refresh is manual or
  lifecycle-driven; the task detail retains its existing bounded polling.
  These two server reads are not claimed as a single transactional snapshot.

### Verification

`--workspace-task-check` passed **98 real local PostgreSQL scenarios**: 54
review/history/edit, 12 admission/task (previous eight plus pre-admission
NOT_FOUND, foreign-owner denial, revoked-session denial and repeated exact-task
reads), nine terminal, nine settled-review, nine settled-edit and five saved-list
cases. All matrix data is disposed; the browser run starts fresh.

Browser sequence on the independent owned run:
empty workspace → one fixed synthetic admission → deliberately lost 503
acknowledgement → **leave without retrying** → workspace finds the real queued
task → full reload and EN/zh-Hans/zh-Hant navigation → open original task →
operator synthetic success → workspace shows saved task plus its new draft →
open current version with self-review required and TXT disabled → return →
revoke synthetic session → refresh clears both entries and shows sign-in.

Task `f06c4a2d-1dc1-4a7d-88f6-c84059d56a1f` remained the same throughout;
the new draft was `9fd8bb52-ed2c-484b-aab2-39263b327cf6`. Final observations:
**one job, one admission, one RESERVE, one COMMIT, 10 available / 0 reserved**.
No review event or export report was created. The single edit receipt/sync
change is the generation save, not a wording edit. Initial and completed page
screenshots retained the green identity; inspected pages had no warning/error
logs. The post-run harness instruction clarification and semantic h3 adjustment
are covered by updated tests; no new native offline, mobile viewport, real human
review, OS export or AI-provider claim is made.

The 57 new tests passed (135 across the five focused files). Full suite:
**4,851 passed / 12 skipped**, 294 files (293 passed / one skipped). Typecheck,
zero-warning lint, 64-page Turbopack build, 32-chunk client-boundary scan and
73-file adapter check passed. Security Advisors on the exact owned Unix socket
returned no findings, not a Hosted audit. Owned roots
`/private/tmp/cl-job-browser-9ngifZ` and `/private/tmp/cl-job-browser-r4U18o`
were stopped/removed and checked absent; port 3395 was released and only the
dedicated browser tab was closed. No push, deployment, cloud mutation, real data,
AI, vault/KMS or payment operation occurred.

Supabase/Postgres guidance kept the existing narrow roles; Next/React/browser
guidance required real readback and private-state clearing. Impeccable guidance
kept the committed identity and simple task/list hierarchy.

**Next bounded implementation:** give task detail a direct return-to-workspace
path and verify the complete Communication Note navigation loop, still using
local synthetic data. Formal multi-task catalog/activation, real provider/vault,
the other Note types and billing remain separate unfinished work.

## Communication Note workspace navigation loop (2026-09-08)

Task detail now returns directly to `/ai-documents?lang=<locale>` through its
Logo and labelled return link, including loading, queued/running, terminal and
missing/unavailable states. Invalid-ID language links also use the clean
workspace destination. Failed/cancelled tasks retain their separate, explicit
new-note link; returning never invokes it. Destinations are fixed application
paths, not browser history, referrers or supplied return URLs. Exact job,
revision and status-check links remain unchanged.

Browser verification found the adjacent draft header still linked back to the
composer and downgraded Traditional Chinese to English on Logo return. Both
draft-header exits now use the same localized workspace destination, including
content-free and invalid-ID states. The return controls keep the existing green
style, have a visible keyboard focus ring and a 44px minimum target. No save,
edit, review, export, auth or Points logic changes.

The formal legacy workspace and data/feature bindings remain unchanged. The
complete three-locale task/list destination is still wired only by the owned
`--workspace-task` fixture; preserving `lang=zh-Hant` in these links does not
translate or activate the formal legacy workspace. This is navigation work,
not multi-task catalog, provider or five-Note launch completion.

Verification:

- 45 new view tests cover three languages, all job states, saved/content-free
  drafts, invalid IDs, exact task/revision links and distinct new-note actions.
  Full suite: **4,896 passed / 12 skipped**, 294 files (293 passed / one skipped).
  Zero-warning lint, TypeScript/build, 64 static pages, 32-chunk client boundary
  and 73-file adapter checks passed.
- Both independent browser runs passed the existing 66-scenario local database
  preflight (54 review/history/edit plus 12 admission/task). No new SQL, grants,
  migrations or harness mode was added; the prior 98-scenario matrix remains
  earlier evidence, not a newly rerun matrix in this slice.
- Initial run checked English return, Simplified Logo return, Traditional task
  return and discovered the draft-header inconsistency. After fixing it, a
  fresh run proved actual admission with lost acknowledgement → workspace →
  same task → synthetic success → exact saved draft → Traditional workspace
  via return link → reopen current draft → workspace via Logo → task → revoke
  session → return → sign-in with no private content. No test-control detour
  was needed within that final task/draft/workspace loop.
- Final run task `d72d0ee9-74ab-4124-88d9-27a4b0246d5f`, document
  `b55361fd-b17c-4dd8-8f9d-9aca12474da6`: **one admission/job/RESERVE/COMMIT,
  10 available / 0 reserved**, zero review events/export reports. The generated
  draft still required self-review and TXT stayed disabled. Navigation caused
  no extra save, generation or settlement. No real human-review, provider,
  native offline or mobile viewport claim is made.
- Inspected pages had no warning/error logs. Security Advisors on each exact
  owned Unix socket found no issues. `/private/tmp/cl-job-browser-Vc0JxL` and
  `/private/tmp/cl-job-browser-t9ejwJ` were stopped, removed and checked absent;
  port 3395 was released. Only the two owned browser tabs were closed. No push,
  deployment, Hosted/Production mutation, real data, AI or payment operation.

Impeccable guidance kept the committed identity and consistent return action;
Next/React/browser guidance required actual navigation and unchanged private
read boundaries. Supabase guidance preserved fresh session checks.

**Next bounded implementation:** build an owner-isolated, minimal-metadata
multi-task list contract and read path to replace the single-candidate fixture
entry. Develop and verify locally with synthetic data first; no Hosted grants,
activation, deployment or AI calls are implied. Other Note types and billing
remain unfinished.

## Communication Note owner-isolated multi-task workspace (2026-09-08)

The owned `--workspace-task` fixture now replaces its preallocated singleton
with a real owner-scoped PostgreSQL task list. Each admission gets a new random
candidate; exact-request replay still uses the existing idempotent admission
RPC. No browser request key or task locator is required to recover a lost reply.

The reusable `communication-note-task-list.ts` contract exposes only `jobId`,
status, creation/update times and a position cursor. Pages contain at most 20
tasks, sorted by `(created_at DESC, id DESC)` with full microsecond precision.
The cursor never chooses an owner, page size or Note type. Duplicate, unordered,
out-of-page, malformed or excessive responses fail closed. Older-page reads
replace the visible list; refresh/lifecycle reauthorization returns to latest.
Pending, failed or revoked reads remove both task and draft metadata. No task
polling, browser persistence, generation retry or Points mutation is added.

The CLI-created SQL remains in `supabase/migration-candidates`, **outside the
unchanged 47-file Hosted migration manifest**. It creates private NOLOGIN,
NOINHERIT, NOBYPASSRLS caller/executor roles. The executor receives seven
metadata columns only, forced owner/type RLS, a matching partial keyset index
and the existing fresh provider-session helper. It rechecks wall-clock session
freshness after acquiring auth locks and after reading the page. The caller
receives only this RPC, with no table, payload, owner-executor or write access.
The candidate grants no LOGIN/runtime membership or Data API execution. The
existing strictly local parent alone binds its attested Unix-socket test role.
This is not a hosted grant/activation or new Production migration.

The green Logo, typography, three locales and same-language navigation are
retained. Multiple tasks show status and timestamps, with explicit older/latest
page controls. Creating another Note is a separate action, available only after
successful list authorization; the existing composer still checks Points and
privacy. Success continues to say review is required. Impeccable guided use of
the existing compact list layout; Supabase guidance kept least-privilege and
fresh-session boundaries, and Next/React/browser guidance kept stale reads out
of the rendered surface.

Verification:

- Full suite: **4,942 passed / 12 skipped**, 296 files (295 passed / one skipped),
  a net 46 additional cases. TypeScript, zero-warning changed-file lint, Next
  64-page build, 32-chunk client boundary and 73-file adapter checks passed.
- `--workspace-task-check`: **110 local PostgreSQL scenarios**. Twelve new list
  cases cover 25 owner tasks across 20/5 pages with timestamp ties, a foreign
  task and another Note type, foreign cursor reuse, new same-owner session,
  revoked/mismatched/expired sessions, provider-role removal, input bounds,
  narrow ACLs, index use and unchanged Points on repeated reads. Parent-only
  extra metadata/payload/proof fixtures are not paid admissions or AI output;
  all FK/CHECK constraints are checked and the probe transaction is rolled back.
  Initial test-data FK mistakes were corrected without weakening constraints.
- Real browser flow: empty workspace → first admission with deliberately lost
  response → return without retry → original queued task → synthetic failure
  releases 20 Points → second independent admission → workspace shows both
  tasks newest first → synthetic success → Traditional workspace → saved draft
  → same-language return → revoke session → refresh → sign-in. Pagination clicks
  are covered by DOM tests and database pages, not claimed as a >20-row browser
  run. No native offline, mobile viewport, real AI or human-review claim.
- Final browser tasks: `fba5f4f0-8dde-4a83-8053-5352e4c909b1` (FAILED) and
  `c90658e3-40a7-4554-8681-ee90ea2ddcda` (SUCCEEDED); saved document
  `07a2e5cb-ddbc-453c-80dc-f17fb966ff5f`. Exactly two admissions/reserves,
  one RELEASE and one COMMIT; **10 available / 0 reserved**. Zero review events
  or export reports. The one save receipt/sync change is generation persistence,
  not a wording edit. Export buttons remain disabled pending human self-review.
- No browser warning/error logs; Security Advisors on the exact owned Unix
  socket reported no issues. All owned roots from these runs were stopped and
  removed, including final `/private/tmp/cl-job-browser-mX0KjS`; tab 30 closed,
  port 3395 released. No push, PR, deployment, Hosted/Production, real data,
  provider, KMS/vault or payment operation.

**Still deliberately local:** the formal legacy workspace/API binding is
unchanged. The saved-draft section still uses the one-settled-document fixture;
the new task catalog does not attest a general saved-document catalog or
cross-device browser E2E. The historical single-task parser/view mode remains
for regression coverage but is no longer the workspace fixture entry.

**Next bounded implementation:** replace the one-settled-document list with a
current-user Communication Note saved-draft catalog, preserving minimal metadata,
pagination, exact-current-version links and fresh review/access checks. Develop
and verify locally first; no external activation or AI call is implied. Other
four Notes, real model integration and billing remain separate unfinished work.

## Communication Note current-owner saved-draft catalog (2026-09-08)

This supersedes the exact-settled-document restriction for **listing and GET
navigation** in `--workspace-task`. The reusable server projection now calls
the existing, freshly authenticated Product API `listDocuments` with a fixed
20-row limit. It reuses `public.list_v1_shadow_documents`; no SQL migration,
new database role, grant, table SELECT or Hosted manifest change is needed.
The cursor is `document.v1:<uuid>`, a position in the current owner's existing
metadata list, never identity or read authority. The RPC rechecks an active
session and rejects foreign/unknown cursors. The adapter validates source
metadata; the catalog also validates page size, order and continuation.

Only live Communication Notes with a saved current revision reach the browser,
as canonical ID, current revision number, source locale and update time. No
facts, document text, review approval, credentials or Points are in the list.
Other Note types, tombstones/deleted records and revisionless rows are filtered
server-side. The existing RPC excludes PURGED records. Its order is stable
UUID order, **not newest-update order**; all three locales say so. A source
page containing other types or deleted records can produce fewer than 20 or
zero visible drafts. Its continuation remains usable, and the empty-page copy
does not falsely claim that the user has no saved documents anywhere.

Task `before` and draft `draftAfter` cursors are independent. Paging one keeps
the other's position; explicit task-latest/draft-first controls reset only that
section. Manual refresh, focus/storage/online and lifecycle reauthorization
reset both positions and clear all old metadata. Timeouts, errors, revoked
sessions and delayed replies cannot restore old entries or pagination controls.
No browser storage, polling, generation retry or write port was added. The
fixed transport rejects extra/duplicate queries, bearer/cross-origin requests
and caller-supplied owner/type/limit fields before either database list read.

Current-version links carry the document ID and UI locale, not a pinned
revision. The owned fixture routes catalog GETs through the existing general
document reader, which rechecks current session, owner, document type/lifecycle
and revision membership in real SQL. **Edit, self-review and export/history
actions remain limited to the exact newly settled fixture document.** Merely
listing/opening another seeded document does not widen those writes. The
historical singleton-list fixture remains for regression coverage. Formal
workspace/API activation is still unchanged and no real worker is enabled.

Verification:

- Full suite: **4,979 passed / 12 skipped**, 297 files (296 passed / one skipped),
  37 new cases. TypeScript, zero-warning changed-file lint, 64-page Next build,
  32-chunk client boundary and 73-file adapter checks passed.
- `--workspace-task-check`: **118 local PostgreSQL scenarios**, including eight
  new rollback-only catalog scenarios. Two original plus 23 synthetic drafts
  traverse disjoint 20/5 pages. Checks cover minimal metadata, other types and
  tombstones, foreign/mismatched/revoked sessions and foreign cursors, current
  revision metadata, unknown cursor denial and absence of authenticated table
  SELECT. Seed constraints remain enabled and all extra rows are rolled back.
  Existing task/settlement/edit/review/list matrices continue to pass.
- Browser: current-owner list shows two independent seeded drafts, opens
  `11111111-1111-4111-8111-111111111111` version 1 in English and
  `44444444-4444-4444-8444-444444444444` version 1 in Traditional Chinese,
  returns with the same locale, renders Simplified Chinese, then clears both
  sections and reaches sign-in after session revocation and refresh. Both
  documents remain self-review REQUIRED with exports disabled. No warning or
  error logs. >20-row paging is SQL/DOM evidence, not a browser pagination claim.
- Browser database ends with **30 available / 0 reserved Points**, zero
  admissions/generation jobs, reserves/terminal events, review events, edit
  receipts, sync changes or export reports. The initial single Points ledger
  entry is the fixed synthetic test grant, not a real purchase or charge.
- Security Advisors on the exact owned `AjOjt8` Unix socket reported no issues.
  Both owned roots (`zcYgoT`, `AjOjt8`) were stopped and removed; tab 31 closed
  and port 3395 released. No push, PR, deploy, Production/Hosted, real care data,
  AI/provider, KMS/vault or payment operation.

Impeccable guided reuse of the established green Logo/typography and compact
three-language list. Supabase guidance kept the existing narrow RPC and fresh
session checks; Next/React/browser guidance kept server dependencies and stale
responses out of the client. This is not five-Note completion, real AI/credit
billing readiness, mobile/offline or cross-device E2E evidence.

**Next bounded implementation:** wire the verified multi-task/multi-draft
workspace into the formal app behind an explicit default-off feature gate,
preserving the legacy workspace and fail-closed runtime. Verify locally before
any separate Hosted capability binding, Preview or deployment authorization.

## Communication Note default-off formal workspace route (2026-09-08)

The verified workspace is now wired into the **formal source app**, replacing
the previous browser-only page/HTTP handler composition. This is route wiring,
not a Hosted activation. `CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED` is a
server-only, exact-`true` UI switch; absent, false, differently cased, public or
query-string flags leave the legacy workspace unchanged. The existing admin
workspace is retained, with no self-redirect loop. No flag was set in Vercel,
Supabase, Production or any existing environment file.

When selected, the page resolves its account from the server Supabase session,
never from a demo/account query. Signed-out users receive a fixed safe login
next path; provider queries are canonicalized to one supported locale. Admins
fall back to the existing page. The client receives only locale, safe login
link and `MULTI` mode: no owner, session, draft metadata, text or credentials are
serialized into its initial props. Existing green branding and the three-language
surface are reused without a redesign. Legacy Credits/NDIS behavior remains
covered with the new flag off.

The new formal `GET /api/ai-documents/communication-note/documents` is dynamic,
Node-only and non-cacheable. It uses the shared `communication-note-workspace`
server composition. Its source-installed runtime is **still undefined**: even
with the UI flag true, the actual formal GET returns fixed metadata-free 503
without parsing requests, authenticating or opening a connection. Environment
flags cannot install a purpose-reader credential, database grant or writer.
No live data/connection was added, and other generation/recovery/worker formal
capabilities remain unchanged.

The explicit read-only composition accepts a fresh principal resolver and a
factory exposing exactly document-list/task-list methods, with no enqueue,
SQL, edit or other write port. It binds both readers to the same server identity,
rejects bearer/cross-origin transport, authenticates before cursor parsing,
keeps the fixed two independent positions/20-row limit, aborts before or between
reads, and strictly validates output. A failed/revoked read clears the entire
response, never partial drafts or a previous page. All API responses have
private/no-store, no-referrer, noindex/nofollow, nosniff and Cookie/Authorization
Vary. The page also has private/no-store/no-referrer/noindex headers and metadata.

The owned `--workspace-task` runner now copies the actual source page, its
server shell and the actual API route unchanged. Only the disposable copy's
runtime module is bound to the existing fixed Unix-socket fixture ports and its
process receives the UI opt-in. Document reads verify that the separately
rechecked cookie user/session still matches the principal bound to the task
reader. The legacy shell's unused sign-out import has a deny-only synthetic
action, not real Auth mutation code. Source hashes attest that these copied
bindings do not leak back into the real app. The historical singleton-list
mode is preserved separately.

Verification:

- Full **5,027 passed / 12 skipped**, 299 files (298 passed / one skipped),
  48 added tests. TypeScript, zero-warning changed-file lint, Next build and
  32-chunk client-boundary checks passed. The build reports **63 generated
  entries** and includes the new dynamic API route; the existing application
  routes remain in the build output.
  The 73-file adapter sync check and diff checks passed.
- Tests cover the actual formal GET with UI flag absent/true but runtime absent,
  no-I/O disabled handling, old workspace/Points markup, admin fallback, safe
  three-locale auth/redirect props, transport/owner/cursor validation, narrow
  ports, revocation, abort and no partial responses. Early mock/import/string
  expectations were updated for the new source wiring without weakening gates.
- Both local fixture starts passed **74 existing PostgreSQL preflight scenarios**
  (54 review/history/edit, 12 admission, 8 catalog). The first owned build lacked
  the legacy shell's sign-out import; it stopped/cleaned before serving. The
  deny-only local stub fixed the harness; no Auth capability was broadened.
  No SQL migration, role, grant or Hosted manifest change was made this turn.
- Browser on the source-routed copy: two saved drafts → separate fixed synthetic
  admission with deliberately lost response → return without retry → find the
  original queued task → task status → parent-only synthetic cancellation and
  release → workspace → Traditional current saved draft → same-language return
  → Simplified workspace → revoke session → refresh → sign-in with old metadata
  cleared. Job `2a6eb9ac-b913-4ce5-b9f7-53fe1c6f52fc` ends CANCELLED; exactly one
  admission/RESERVE/RELEASE, zero COMMIT, **30 available / 0 reserved**. Two seed
  documents remain version 1; zero review events, edit receipts, sync changes
  or export reports. The opened draft remains review REQUIRED, exports disabled.
- Browser warning/error logs were empty. HTTP page headers were checked directly.
  Exact-socket Security Advisors found no issues. Both owned roots (`U2M8hK`,
  `kK5Te6`) were stopped/removed, tab 32 closed and port 3395 released. No actual
  AI/provider call, KMS/vault, real payment or care data; no push, PR or deploy.

Next/React guidance kept the shell server-authenticated and its props minimal;
Supabase guidance retained fresh-session and read-only capability boundaries;
browser guidance required the source-routed UI check, not build success alone.
This is not Hosted Auth/worker readiness, five-Note completion, credit billing,
cross-device, mobile or native-offline evidence.

**Next bounded implementation:** implement the formal **read-only runtime
adapter/composition** behind the same default-off gate, binding authenticated
document and purpose-scoped task reads to one user/session. Keep credentials,
Hosted grants, feature activation, generation and deployment outside that local
implementation until separately authorized and verified.

## Communication Note read-only workspace database adapter (2026-09-08)

`createCommunicationNoteWorkspaceDurableRuntime` now assembles the real Cookie
principal resolver, existing strict document RPC parser and fixed task-list
repository. It is a server-only, lazy factory: no connection at import/factory
time, ambient secret lookup, broad Product API runtime, write method or Points
operation. The formal runtime export **remains undefined** and the actual GET
still returns metadata-free 503 even when environment flags are set.

The adapter requires the existing workspace/Product API opt-ins, exact matching
Preview Supabase/Vercel targets and publishable keys; Production, malformed or
drifting configuration is denied. One Cookie client and user/session identity
are scoped to each request. An authenticated context cannot be transferred to
another request or used to construct readers twice. The document reader permits
only `list_v1_shadow_documents`, fixed page size 20 and the validated position
cursor. Its other Product API methods never escape or reach the Cookie client.

The task reader requires an explicit server-installed port for
`COMMUNICATION_NOTE_JOB_LIST_READ` and
`careslink_v1_generation_job_list_caller`. It receives only the seven repository
parameters and an abort signal, never browser SQL or identity fields. The
single-job status, admission and worker ports are not substitutes. Wrong target,
purpose, role, extra properties, accessors and proxies fail closed. The port's
labels are **not physical-connection or credential-custody attestation**; the
provider must settle only after its own connection/lease cleanup. No such
Hosted provider, credential issuer, runtime membership or grant was installed.

The same Cookie client rechecks claims, current session and user before either
list and after task completion. Changed/revoked identity suppresses both lists.
The shared HTTP handler now bounds the whole read to 30 seconds, propagates an
abort signal and discards late results without retry. The signal is closed on
every outcome. Underlying transports remain responsible for cancellation and
cleanup; a timeout is not evidence that a remote statement was terminated.
This follows the existing strict session boundary and [Supabase session
guidance](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).

Verification:

- **5,078 passed / 12 skipped**, 300 files (299 passed / one skipped), 51 new
  tests. The focused adapter/HTTP/fixture set passed 111 cases. TypeScript,
  zero-warning lint, formal Next build (63 generated entries), 32-chunk client
  boundary, 73-file adapter sync and diff checks passed. The client scan now
  includes the workspace target and purpose markers.
- Initial test fixtures used an invalid lifecycle enum and an outdated request
  identity assertion; those were corrected, not the response validation. The
  existing current-session importer allowlist explicitly gained this one
  default-off server adapter. No privileged-client importer was allowed.
- The unchanged `--workspace-task-check` passed **118 existing local PostgreSQL
  scenarios**, then stopped and removed `/private/tmp/cl-job-browser-jrYyUh`.
  No SQL migration/candidate, role, permission or Hosted manifest was edited.
- The owned browser copy now uses the actual new adapter with synthetic target
  configuration and fixed Unix-socket ports. Startup passed 74 SQL preflight
  cases. Browser: English workspace with two version-1 seed drafts / no tasks
  → Traditional workspace → exact current draft (review REQUIRED, exports
  disabled) → same-language return → parent-only session revocation → refresh
  → login with both lists cleared. A separate fixed foreign-cookie **HTTP**
  request returned both lists empty with private headers. No browser account
  switching, mobile, native offline or >20-row browser run is claimed.
- Browser warnings/errors were empty; the owned build passed the expanded
  client scan across 39 chunks. Exact-socket Security Advisors found no issues.
  Final readback: 30 available / 0 reserved Points, zero admissions/jobs/reserve
  or terminal events, zero review/edit/sync/export events; seed revision remains
  1. No composer submit, model/provider, KMS/vault, real payment or real data.
- `/private/tmp/cl-job-browser-Kdx2vn` was stopped and removed with source hashes
  unchanged, owned tab 33 closed and port 3395 released. No push, PR, deployment
  or external environment change. Existing green design/Logo were not changed.

Supabase/Next guidance kept request-local authentication and narrow server
capabilities; browser guidance required checking the actual source-routed copy.
This is local adapter evidence, not Hosted activation or completion of all five
Notes, live AI generation or credit billing.

**Next bounded implementation:** implement and locally verify the task-list
purpose port's physical connection, cancellation and cleanup boundary. Keep
credential issuance, Hosted grants, runtime binding, feature activation and any
Preview/Production deployment separate and explicitly authorized.

### Communication Note task-list physical cancellation and cleanup (2026-09-08)

The preceding local implementation is complete. The new server-only
`communication-note-workspace-task-postgres.server.ts` implements the existing
four-field list-purpose port. It is lazy, single-use and owner/session-bound;
only the fixed seven-parameter, 20-row task statement can execute. Cursor
positions retain microsecond precision. No generic SQL, pool, ambient database
credential or single-job-status credential reuse is exposed.

The injected non-Production direct target requires PG17, port 5432, the expected
database and certificate-verified TLS with a copied, digest-pinned CA. Both
physical sessions attest the runtime LOGIN's restricted flags, connection limit
2, exactly one set-only list-caller membership, and the caller's lack of parent
memberships. The separately named TestOnly constructor accepts only the owned
PG16 Unix fixture path and attests its cluster. Neither constructor installs
itself into the formal runtime; `COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME`
remains undefined and `COMMUNICATION_NOTE_TASK_POSTGRES_READY` remains false.

Each execution opens its same-LOGIN cleanup connection first, then one read
connection. The main connection alone activates the list caller. Read lifetime
is bounded to 10 seconds, with separate connect, query, statement, lock and idle
timeouts. The statement is autocommit, not a read-only transaction, because the
existing fresh-session helper takes auth row locks. The SQL candidate, its RLS
and privileges are unchanged.

Cancellation destroys the owned read transport. A separate cleanup deadline
(4.5 seconds, independent of the cancelled request) then terminates only that
invocation's backend and checks its absence. Selection binds database, same
LOGIN, random application nonce and, once known, PID plus microsecond backend
start. It does not terminate arbitrary same-user sessions. The same unprivileged
LOGIN can perform this cleanup without adding `pg_signal_backend`; no privileged
control connection is introduced. A positive termination wait follows
[PostgreSQL's termination semantics](https://www.postgresql.org/docs/17/functions-admin.html),
not just a client disconnect or cancellation signal. Cleanup failure withholds
metadata; only exact `SESSION_REVOKED` survives successful cleanup, without raw
database errors. Both client connections close and retained password references
are cleared on completion (not a claim of secure memory zeroization).

**Credential boundary still open:** the port consumes a server-injected delivery
valid for at most 90 seconds. Delivery expiry and local reference clearing do
not revoke the source password, prevent another port from reusing that source,
or attest credential custody/direct grants. No issuer, durable NOLOGIN fence,
Hosted role/membership, cloud credential, target approval or activation was
added. Those remain separate prerequisites before any Hosted binding.

Verification:

- Full **5,130 passed / 24 skipped**, 302 files (300 passed / two opt-in files
  skipped). Added 51 physical-port unit cases and one source-boundary case.
  Covers fixed inputs, one-shot/concurrent reuse, captured inputs, target/TLS/
  role checks, connect failure, pre/mid-read abort, late connection/result,
  independent cleanup wait/deadline/failure, safe errors and secret references.
- The explicit command
  `CARESLINK_TASK_POSTGRES_LOCAL=OWNED_UNIX_ONLY node node_modules/vitest/vitest.mjs run scripts/browser-e2e/communication-note-task-postgres.local.test.mjs`
  passed **12 actual-source PG16 tests** after the existing **118 fixture
  scenarios**. Three synthetic task rows, microsecond cursor pagination, foreign
  ownership, revoked/expired sessions, blocked auth-row cancellation, server
  lock timeout, actual cleanup-connection loss, unrelated-session survival,
  excess membership, direct-table denial and HTTP-core composition passed.
  Cookie Auth/document replies in the HTTP-core test are mocks; its task port,
  task SQL and fresh-session checks are real. No new browser run is claimed.
- Every new transport case checks zero runtime sessions and unchanged ledger,
  reservations, jobs, reviews and edits. Cancellation also checks zero locks for
  the read PID while its unrelated blocker transaction remains alive. The local
  fixture creates then explicitly removes each synthetic LOGIN; this is fixture
  teardown, **not implemented production credential revocation**. Both local
  test runs stopped and removed their owned databases. Earlier synthetic fixture
  setup/settlement activity is not attributed to the read-only transport.
- TypeScript, zero-warning lint, webpack Next build (63 generated entries),
  expanded client scan (117 static chunks), 73-file adapter sync and diff checks
  pass. Two existing pg importer allowlists gained exactly this server module;
  the new test proves no formal source imports it. An initial comment-matching
  test false positive was corrected to detect actual Pool construction.
- No migration/candidate, Hosted manifest, formal binding, remote permission,
  cloud resource, environment or green visual/Logo change. No push/PR/deploy,
  real care data, AI/provider, KMS/vault or payment call.

Supabase connection-limit/idle-timeout/least-privilege guidance informed the two
bounded purpose sessions; Next.js guidance kept them server-only and unbound.
This completes the local physical read boundary, not live AI or five-Note launch.

**Next bounded implementation:** replace the owned local workspace browser
fixture's broad admission-connection bridge with this separate list-only port,
then verify list refresh, pagination/navigation and cancelled reads through the
actual workspace page. Keep formal/Hosted activation and credential issuance
separate; no deployment is part of that next local slice.

### Communication Note dedicated task port in the local workspace (2026-09-08)

The owned workspace now uses the actual physical task-list port, not the broad
admission connection. Its separate test-only delivery module validates the owned
environment and passes the server-resolved principal, fixed Unix socket and
list-only LOGIN to the source constructor. Only safe outcome/abort flags are
logged. Credentials do not enter the page, HTTP response or client bundle.
The local admission LOGIN lost its list-caller membership, and its query bridge
no longer accepts the task-list statement. No Hosted permission was changed.

The parent-owned fixture installs one restricted list LOGIN, with connection
limit 2 and set-only caller membership, and never copies its operator into Next.
Fixed stdin-only controls provide synthetic pagination rows and a bounded lock
probe; no new HTTP mutation endpoint was added. `task-seed` runs three existing
synthetic terminal outcomes, then adds 22 metadata catalog clones without extra
reservations or charges. The resulting 25 tasks are not 25 AI generations.
`task-lock` holds only this disposable job table, observes exact runtime backend
locks and automatically releases within 45 seconds. Teardown always attempts
role cleanup before the mandatory cluster shutdown/removal.

Verification:

- Full **5,143 passed / 24 skipped**, 303 files (301 passed / two opt-in files
  skipped), including 13 new delivery tests; focused bridge/admission/runner/
  delivery tests: **98 passed**. TypeScript, zero-warning lint, formal webpack
  Next build (63 generated entries), 117-chunk formal client boundary, 39-chunk
  owned client boundary, adapter sync (73 files) and diff checks pass.
- `--workspace-task-check` passed the existing **118 real PG16 scenarios** plus
  the new dedicated-role guards. Its LOGIN was explicitly removed, then
  `/private/tmp/cl-job-browser-2dTRkQ` was stopped and removed.
- Actual source-routed page in `/private/tmp/cl-job-browser-tCDbP2`: initial
  empty task list/two seed drafts; seeded 25 tasks/three drafts; English first
  page **20**, second page **5**, union **25 distinct task links**; returning to
  latest reproduced the same first page; refresh retained 20. Traditional
  Chinese also passed 20/5 pagination, and Simplified Chinese recovered 20.
- During the fixed table lock, Refresh showed the actual loading state. Clicking
  the Simplified language link left that page. The parent observed its real
  task backend waiting on a lock, then disappearing after approximately **480
  ms**, with **zero locks while the blocker remained held**. The source port
  reported `returned:false, aborted:true`. The new page's read also failed
  closed during fault injection; no success was claimed until unlock/refresh.
  After recovery, runtime sessions and locks were both zero.
- Opened a listed FAILED task, read its actual status, returned to the same
  Traditional-language workspace/latest 20 tasks, and opened current seed
  draft version 1. Review remained REQUIRED and all four export controls were
  disabled; no human confirmation or export was performed. Parent-only session
  revocation followed by Refresh cleared both lists and displayed sign-in.
- Browser warning/error captures were empty. Exact owned-socket Supabase
  Security Advisors returned no issues. Read-only browser operations preserved
  the post-seed baseline: 10 available / 0 reserved synthetic Points, three
  admissions/reserves/terminals, seven ledger entries, 25 jobs, zero reviews,
  one mutation receipt/one sync change from the synthetic setup, no export
  reports, and the opened seed draft remained revision 1.
- Owned tab 34 was closed; existing user tabs were not closed. SIGINT teardown
  reported the individual LOGIN cleanup as unconfirmed, but the database
  process exit and entire owned directory removal were confirmed, with tracked
  source unchanged. This is whole-fixture disposal evidence, not a credential
  revocation receipt. Both temporary roots are gone and port 3395 is released.

Supabase/Next.js guidance kept the dedicated role and credential module isolated
to the owned server copy. The browser skill's CLI was unavailable; the existing
CUA browser integration performed the actual UI, screenshot and console checks
without installing software. No production TSX, green design/Logo, SQL migration,
formal binding, online environment, actual model/provider, KMS/vault, payment,
push/PR or deployment changed.

**Remaining limitation / next bounded implementation:** this fixture reuses one
fixture-lifetime source password; each delivery's 60-second expiry does not
revoke it. Implement and locally verify task-list-specific single-use credential
issuance/revocation before considering a formal or Hosted binding. Do not reuse
the status purpose's authority or treat these UI tests as all-five-Note launch
approval. Production and real AI generation remain out of scope.

### Communication Note local single-use task credentials (2026-09-08)

The previous fixture-lifetime task password is replaced in `--workspace-task`.
The owned parent now runs `communication-note-task-credential.database.mjs` on
one private, mode-0600 Unix socket inside its mode-0700 temporary directory. The
Next copy receives only a fixture-scoped IPC capability, not a bootstrap client
or reusable task database password. Only fixed issue/revoke operations, bounded
JSON and the two synthetic Cookie identities are accepted. The issuer attests
the exact owned PG16 data directory, cluster, no TCP listener and bootstrap
identity before changing anything. It rechecks real provider/session state on
issuance; no status-purpose membership or generic SQL endpoint is added.

Each execution uses a random request ID, gets one new list-only LOGIN with a
60-second password/delivery expiry and connection limit two (reader + independent
cleanup observer), runs the actual existing physical source port, then revokes
before returning metadata. A private RLS-enabled table contains issuance and
revocation tombstones but no passwords. Concurrent or later duplicate delivery
IDs never replay a secret. Limits are four active leases, eight pending IPC
requests and 512 receipts per disposable run; these are fixture guardrails, not
production capacity or availability policy.

Revocation commits NOLOGIN, password removal and membership revocation first,
terminates only the receipt's exact owned role/OID sessions, verifies absence,
then drops that LOGIN and records REVOKED. Successful read data is withheld if
the matching receipt is missing, malformed, late after abort, or uncertain.
Lost issuance replies are cleaned using the already known request ID; an
independent monotonic expiry timer also covers abandoned consumers. A failed
cleanup of an owned lease stops further issuance. Repeating a confirmed revoke
is safe and does not reissue the credential. PostgreSQL password expiry is not
session termination; both are tested separately in this implementation. See
[PostgreSQL CREATE ROLE](https://www.postgresql.org/docs/16/sql-createrole.html)
and [ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html).

Verification:

- Full **5,148 passed / 34 skipped**, 304 files (301 passed, three opt-in files).
  The bridge now has 18 tests; bridge + workspace projection: **44 passed**.
  TypeScript, zero-warning full lint, formal webpack build (63 generated
  entries), formal/owned client boundaries (117/39 chunks), 73-file adapter
  sync and diff checks passed. No formal application source, TSX or migration
  changed. The new marker scan covers the IPC capability/socket/private table.
- Explicit `CARESLINK_TASK_CREDENTIAL_LOCAL=OWNED_UNIX_ONLY` real-PG suite:
  **10 passed**, with the existing **118** setup/settlement/catalog scenarios.
  Covers exact source reads, one-delivery concurrent replay, wrong scope and
  identity, true Auth-session expiry, capacity, least privilege, old-password
  denial, two-session termination/zero locks with an unrelated live canary,
  actual blocked-read cancellation, and real 60-second abandoned-consumer
  expiry. Deliberate DROP dependency failure leaves REVOKING/NOLOGIN/no password,
  denies new issuance, and only reports success after verified cleanup.
  The Points/reservation/job/review/edit baseline remains unchanged. The first
  implementation attempt found SQLSTATE 42P08 on a shared text/regrole parameter;
  an explicit text cast fixed it. Failed and successful fixtures were disposed.
- Built actual-page test in `/private/tmp/cl-job-browser-3ghTio`: empty tasks →
  fixed three synthetic terminal outcomes plus 22 no-charge catalog clones →
  English **20/5**, **25 distinct links**. Each refresh/page read issues a new
  role and receives its own successful revocation receipt. During a locked read,
  language navigation removed the old backend in ~**273 ms**, with zero locks
  while the blocker remained held; `aborted:true, revoked:true, returned:false`.
  The new page's fault-time read failed closed and was also revoked. Unlock +
  Simplified refresh returned 20 tasks; Traditional navigation returned 20.
  Session revoke + refresh cleared lists and displayed sign-in. Console
  warnings/errors were empty and the existing green Logo/layout was retained.
- Final browser inventory: **seven REVOKED receipts; zero active roles,
  sessions or locks**. Business baseline: 10 available / 0 reserved synthetic
  Points, three admissions/reserves/terminals, seven ledger entries, 25 jobs,
  zero reviews/export reports and one setup receipt/sync change. Supabase
  Security Advisors on the exact owned Unix socket returned no issues.
- Tab 35 closed, existing user tabs untouched. SIGTERM sent only to the verified
  parent PID let the broker confirm `activeLeases:0`, then stop PG and remove
  the owned root with tracked source unchanged. Port 3395 was confirmed free.

Supabase/PostgreSQL guidance informed the least-privilege grants, explicit
login barrier and independent termination proof; Next.js guidance kept IPC and
secrets server-only. Browser verification used the available CUA integration
because the skill CLI was not installed; no software was installed.

This remains a local parent-operated prototype: its reusable IPC capability is
not production identity/custody, its tombstones last only until fixture disposal,
and a parent crash/SIGKILL, restart/reconciliation, externally supervised expiry,
Hosted PG17/TLS and managed issuance/revocation have NOT been verified. SQL
password expiry blocks future password login but does not guarantee cleanup if
the issuer process dies. No Hosted grants, Production, live AI, KMS/vault,
payments, push/PR or deployment changed; this is not five-Note launch approval.

**Next bounded implementation at that checkpoint (completed below):** extract the verified single-read lease lifecycle
into a default-off formal server adapter with typed issue/revoke receipts and
failure tests. Keep the local Unix operator outside that adapter; actual managed
custody, Hosted permissions and runtime activation remain separately gated.

### Communication Note default-off server task lease adapter (2026-09-09)

Added `communication-note-workspace-task-lease.server.ts`; the owned bridge now
calls this actual application-source lifecycle instead of maintaining its own.
It is lazy, single-use and server-only. Absent/false enablement does no I/O.
Explicit constructor binding accepts only a non-Production project and trusted
Cookie principal. `COMMUNICATION_NOTE_TASK_LEASE_READY` remains false and
`COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME` remains undefined; no environment
flag installs an issuer or activates the formal route.

Issue and revoke bind to the same frozen random request ID, exact project,
owner/session, list-only purpose and caller role. Exact receipt shapes reject
extras, getters/proxies and mismatched scopes. The source opens only after
validating the list-specific role, 43-character password and 20–90-second delivery
validity. The port exposes only its existing four fields; the existing repository
still parses the returned rows and metadata. No SQL, operator, network endpoint
or model client was added to this adapter.

Issue/read/revoke have independent 8/15/8-second asynchronous deadlines.
Cancellation aborts issue/read but never independent revoke. Ambiguous issuance
is revoked by the known scope. No metadata is released without a matching
REVOKED receipt, active caller signal and wall-clock/monotonic freshness.
Falsy exceptions are failures. Only the physical source's exact SESSION_REVOKED
error survives after successful cleanup; other errors are sanitized. Clearing
the adapter's own password reference is not secure JavaScript memory erasure.

A trusted custody provider must make its revoke receipt a terminal fence:
pending issuance cannot later deliver a usable credential, future issuance for
that ID is denied, the password is disabled, sessions are removed and a durable
tombstone exists. Shape/binding validation does not prove the provider performed
those operations. Promise deadlines suppress late results but do not kill an
external process or preempt a blocked event loop. External expiry supervision
and restart reconciliation remain necessary. Local IPC envelope translation is
test-only, not Hosted attestation; the parent retains its own bounded Unix
operations, privileged SQL and expiry timer outside Next.

Verification:

- New lifecycle **84 passed**; with the bridge **102 passed**. Scope substitution
  on both receipts, malformed credentials/inputs, one-use concurrency,
  ambiguous/falsy failures, cancellation in each phase, pending cleanup,
  all three deadlines, late fulfillment/rejection, expiry/clock rollback and
  formal non-installation are covered.
- Full **5,232 passed / 34 skipped**, 305 files (302 passed, three opt-in).
  TypeScript/full lint passed; formal webpack build generated 63 entries and
  the updated client-boundary scan passed 117 static chunks. Adapter sync
  checked 73 files; diff checks passed.
- The existing owned PG16 suite now exercises this actual adapter: **10 passed**
  with its 118 setup/settlement/catalog checks. Real reads, replay rejection,
  role/password revocation, two-session termination, zero locks with a canary,
  blocked-read cancellation, real 60-second orphan expiry and failed-DROP
  receipt withholding passed. Business snapshot unchanged; fixture stopped and
  removed, with no matching test/database process or port-3395 listener left.
- No page was reopened in this source-only batch. Earlier browser results are
  historical evidence, not a new same-revision browser run.

Workspace recovery preceded validation: the temporary worktree's Git pointer
and 1,167 old tracked files were missing; commit `cd29787` and the new adapter
survived. Only missing files were restored, without overwriting survivors.
The worktree moved intact to
`/Users/milliohusky/Documents/ChatGPT/Careslink/worktrees/ai-points-ui-v1`.
Dependencies were replenished from the unchanged frozen lock with install
scripts disabled. Build tracing is pinned to this app's directory so the nested
worktree does not infer the unrelated parent main site.

Supabase/Next.js guidance informed the server-only credential boundary and
continued default-off wiring. No TSX/green design/Logo, SQL migration, Hosted
permissions, Production, live model/provider, KMS/vault, payment, push/PR or
deployment changed. This is not five-Note launch approval.

**Next bounded step at that checkpoint (completed below):** implement and verify local custody recovery after issuer
interruption/restart, with supervised expiry and pending-receipt reconciliation.
Use only disposable local databases; managed custody, Hosted PG17/TLS and formal
activation still require separate evidence/authority.

### Communication Note supervised local credential recovery (2026-09-09)

The owned workspace now runs its fixed Unix credential broker in a separate Node
child. A parent-only supervisor keeps the database inspection connection, checks
heartbeat/expiry every 500 ms, and observes the specific ChildProcess's exit.
The child receives its fixture root/capability over private Node IPC, not argv
or inherited environment. Operator modules, fault controls and database access
remain outside the copied Next application; there is no new browser/HTTP route.

Two session advisory locks enforce one supervisor and one issuer per exact
owned PG16 cluster. A new issuer validates the private schema owner, version,
RLS and ACLs, then reconciles every unfinished receipt before listening. It
never redelivers a prior password. Recovery commits the login/password barrier,
terminates only the receipt's matching role-name/OID sessions, verifies absence,
and atomically drops the role with its REVOKED tombstone. A role-OID mismatch or
incompatible catalog stops startup without deleting a merely same-prefix role.
The session fence is released on connection loss; see
[PostgreSQL advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).
Password removal and existing-session termination remain separate operations;
see [ALTER ROLE](https://www.postgresql.org/docs/16/sql-alterrole.html).

After an unexpected issuer exit, the supervisor confirms child close and checks
that its nonce-named PostgreSQL backend is absent before spawning a replacement.
No externally supplied PID is accepted. Missing heartbeat for more than two
seconds triggers termination/recovery. Independently observed receipt expiry,
with a monotonic cap and one-second grace, catches lost child timers even when
heartbeats remain healthy. Recovery revokes all outstanding leases, including
ones not yet expired; active readers may therefore fail closed and retry later.
This is not a promise of exact 60-second session termination: polling, database
query/termination and restart deadlines add latency.

Automatic recovery is capped at six attempts per disposable run. A failed startup
stays FAILED with no issuer listener; it does not silently retry or claim cleanup.
Stop performs cleanup-only reconciliation after terminating the owned child,
without opening IPC for new issuance. A stale Unix socket is removed only after
the issuer lock is held and its exact path/type/owner/mode have been checked.
The private test catalog is now V2; incompatible older disposable catalogs are
rejected, not upgraded. No product migration was added.

Verification:

- New ordinary policy suite: **26 passed**, covering owned-root/capability and
  database attestation, bounded expiry calculations, process scope and operator
  non-copying. Full suite: **5,258 passed / 41 skipped**, 307 files (303 passed,
  four explicitly opt-in database files).
- New real process suite: **7 passed**, repeated after adding explicit recovery
  reason and child-close checks. Includes competing supervisor/issuer rejection;
  actual SIGKILL after issuance commit but before delivery; interruption after
  the revoke barrier and during uncommitted DROP; actual SIGSTOP heartbeat loss;
  genuine 60-second expiry with every issuer timer suppressed; and a changed
  receipt OID that leaves startup failed without harming a same-prefix canary.
  Tests assert PROCESS_EXIT, HEARTBEAT_LOST and EXPIRY_OVERDUE where applicable.
- Restarted issuance works only after reconciliation, old IDs do not redeliver,
  old passwords fail, owned sessions/locks disappear, repeated revoke is safe,
  and an unrelated live role/connection survives. The final intentionally
  corrupted receipt was restored only inside the owned fixture so cleanup-only
  disposal could be verified. Business Points/reservation/job/review/edit
  snapshots remained unchanged.
- Existing real credential suite: **10 passed**, with its existing 118 setup
  checks. Normal independent expiry, least privilege, browser-request abort,
  DROP dependency failure and source-read behavior remain intact.
- TypeScript/full lint, formal webpack build (63 entries), extended client
  boundary (117 chunks), 73-file adapter sync and diff checks passed.
  Supabase CLI 2.115.0 Security Advisors on the exact owned
  `/private/tmp/cl-job-browser-Z693AB/pg/socket` reported **no issues**.
  Its generic “remote database” CLI label refers to the explicit --db-url mode,
  not a Hosted connection. All disposable roots/processes were stopped/removed.

Run the new opt-in suite with:
`CARESLINK_TASK_CREDENTIAL_RECOVERY_LOCAL=OWNED_UNIX_ONLY pnpm exec vitest run scripts/browser-e2e/communication-note-task-credential-recovery.local.test.mjs --bail 1`.
Supabase/PostgreSQL guidance informed the role/OID scope, short transactional
barriers, private RLS/ACL checks and session-lock ownership. No packages were
upgraded. No application UI, green Logo, formal runtime enablement, Hosted
permissions, Production, real care data/model, KMS/vault, payment, push/PR or
deployment changed. No new browser run is claimed.

Limits: the supervisor and PG database must remain alive/reachable for this
local recovery evidence. Simultaneous supervisor/host failure, PG crash recovery,
durable external service identity/storage, Hosted PG17/TLS and production
availability are not proved. This does not approve launch of all five Notes.

**Next bounded step:** exercise the Communication Note workspace in the built
browser fixture using this supervised chain: task list/pagination → result and
review navigation → displayed Points, plus cancellation/recovery. Keep synthetic
data, the existing green design and formal runtime off; do not deploy.

### Communication Note supervised browser acceptance — partial (2026-09-09)

Source `2a20b15`, unchanged application files. Ran
`node scripts/browser-e2e/communication-note-recovery.mjs --workspace-task`
against the newly owned `/private/tmp/cl-job-browser-2d1fYR` PG16 Unix cluster
and loopback-only built Next server on port 3395. The existing in-app browser
provided screenshots, DOM and console evidence because the dedicated
agent-browser CLI was unavailable; no browser software was installed.

Story: owner workspace → actual documents GET handler → synthetic Cookie/session
adapter → supervised one-use task credential → real local PostgreSQL metadata
→ task status → exact saved revision/review, with Points unchanged by reading.
Only the owned copy supplies the guarded runtime/Auth adapters. The source
workspace, API route and UI are copied unchanged; no ambient environment file
or live provider is loaded and outward fetch is denied.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Initial UI | Passed | Existing green CaresLink Logo; empty task list, two setup drafts; 30 available / 0 reserved Points; no console warning/error or error overlay. |
| Workspace → API → PG → UI | Passed | Cookie session ACTIVE, document-list RPC and dedicated physical task reads; each completed task read logged `returned:true, revoked:true`. |
| Task pagination | Passed | Fixed parent seed: 25 tasks (three terminal outcomes plus 22 catalog-only clones); browser pages 20 + 5, 25 unique links, overlap 0, return-to-latest works. Three saved drafts after seed. |
| Task → saved result/review | Passed | Successful task opened the exact acknowledged document/revision. English, Simplified and Traditional Chinese review navigation retained that revision; return-to-workspace retained locale. |
| Human-review boundary | Passed, navigation only | All three review confirmations remained unchecked; confirmation and Copy/TXT/DOCX/PDF buttons remained disabled in all three locales. No human-review submission, edit or export was performed. |
| Displayed Points | Passed before fault injection | Test balance and actual composer showed 10 available / 0 reserved; composer displayed the 20-Point cost and insufficient-balance notice. Read/navigation observation still had 7 ledger entries, 3 admissions/reserves/terminals, 25 jobs, 0 reviews/exports and the setup-only 1 edit receipt / 1 sync change. |
| Physical cancellation | Passed | While the parent held the jobs lock, refresh then language navigation removed the old reader/locks in 258 ms; `returned:false, revoked:true, aborted:true`. The replacement read timed out under the still-held lock in 993 ms and also revoked without returning data. |
| Unlock → refresh recovery | Not completed | Operator command ordering error caused the diagnostic status query itself to fail and the runner to clean up, before recovery could be tested. |

Before fault injection, repeated observer snapshots showed zero runtime roles,
sessions and locks; the last receipt inventory had only REVOKED receipts.
The owned build and its client-boundary scan passed across 39 static chunks.
The startup reported the 54-check review/history/edit matrix, 12-check admission
matrix and eight-check draft catalog matrix; the fixed seed reported nine
terminal-settlement checks. The earlier 5,258-test full suite and formal build
were not rerun or newly claimed in this browser-only batch. No new Security
Advisors run was performed.

The first unexpected failure was in test orchestration, not an observed
application assertion: the operator sent `task-status` before `task-unlock`.
`workspaceTaskController.status()` includes a count from the jobs table while
another owned connection holds ACCESS EXCLUSIVE. Its owner connection has
`lock_timeout=1000`, and the stdin queue awaits each command before starting
the next. Consequently the diagnostic SELECT cannot complete while that lock
is held, and the queued unlock cannot run first. This source-supported
diagnosis matches the generic `Fixed local database control failed` output;
the runner suppresses the underlying SQLSTATE, so no captured SQLSTATE is
claimed. PostgreSQL documents the relevant
[SELECT / ACCESS EXCLUSIVE conflict](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-TABLES).

Per full-story verification's stop-at-first-failure rule, no further acceptance
or application change was attempted. Cleanup logged lock release, supervisor
`activeLeases:0`, PostgreSQL stopped, and
`stopped:true, removed:true, sourceUnchanged:true`. Independent checks found the
exact temporary root absent, no listener on 3395 and no owned runner/issuer/PG
process. Only the newly created browser tab 36 was closed; user tabs 1 and 12
were left unchanged. Final post-fault business counters and session-revocation
UI recovery were not reached and are not claimed.

**Next bounded step at this checkpoint (completed below):** repeat only the interrupted cancellation/recovery tail
in a fresh owned synthetic fixture. Observe cancellation via the existing
catalog-only monitor, then issue `task-unlock` and wait for its release marker
before `task-status` or business `status`; refresh and verify recovered task
metadata, unchanged Points and zero residual roles/sessions/locks. Finish the
fixed synthetic session-revoke/re-authentication boundary and cleanup. Do not
raise timeouts, weaken locks, alter business code, enable the formal runtime,
deploy, or call a model to compensate for the operator ordering mistake.

### Communication Note supervised browser recovery tail — passed (2026-09-09)

Completed the preceding interrupted tail at source `4d80230`. Its application
and test scripts are unchanged from `2a20b15`; only the preceding acceptance
documentation differs. No implementation, lock, timeout or permission change
was needed. The corrected operator sequence was sufficient.

Ran the existing `--workspace-task` built fixture in newly owned
`/private/tmp/cl-job-browser-d4wlG9`, PG16 Unix-only and Next on 127.0.0.1:3395,
using temporary in-app browser tab 37. Dedicated browser CLI remained absent;
no software was installed. Initial green UI/Logo, meaningful content and empty
browser warning/error logs passed. The fixed parent seed alone produced 25
synthetic tasks, three saved drafts, 10 available / 0 reserved Points, seven
ledger entries and three admissions/reserves/terminal events.

| Boundary | Result and evidence |
| --- | --- |
| Browser cancellation → PG cleanup | Refresh followed by English → Simplified Chinese navigation while the owned jobs blocker was held. Old reader and locks disappeared in 253 ms; log: `returned:false, revoked:true, aborted:true`. |
| Lock timeout → safe UI | Replacement read timed out in 1,003 ms under the still-held blocker, revoked its credential and returned no data. UI showed unavailable with no task/draft links, not a stale successful list. |
| Unlock → status → refresh recovery | Issued `task-unlock` alone and observed `workspace-task-lock-released` before querying status. Refresh recovered the same ordered 20 first-page task IDs as the pre-fault baseline. No diagnostic failure or automatic shutdown occurred. |
| Recovered read → business state | Completed read logged `returned:true, revoked:true`; five receipts were REVOKED, zero runtime roles/sessions/locks, 25 tasks. Points and all business counters matched the seed baseline. |
| Session revoke → auth boundary | Fixed parent `revoke` removed only the owned synthetic session. Refresh observed session REVOKED and navigated to `/auth/login?lang=zh-Hans&next=%2Fai-documents%3Flang%3Dzh-Hans`; task and draft link counts were both zero. No additional task credential was issued (receipt count stayed five). |
| Synthetic identity restore → fresh read | Fixed parent `restore`, then reopening the known workspace URL, recovered exactly the same ordered task IDs and three draft links. This is fixture session restoration, not a real password/OAuth/GoTrue sign-in test. |
| Final state → disposal | Six receipts, all REVOKED; roles/sessions/locks 0; Points 10/0; seven ledger entries, three admissions/reserves/terminals, 25 jobs, review/export events 0, setup-only edit receipt/sync change 1/1. Test balance UI independently showed 10/0. |

The copied webpack build and 39-chunk client-boundary scan passed. Startup
reported the 54-check review/history/edit, 12-check admission and eight-check
draft catalog matrices; seed reported nine terminal checks. No new full-suite,
formal-build or Security Advisors result is claimed. Supabase changelog and
current session documentation were consulted; this run continues to validate
the active session row, not just a still-valid JWT. No relevant hosted changelog
change required an adjustment to this fixed local test.

Closed only tab 37, leaving user tabs 1 and 12 untouched. After rechecking the
owned runner PID/cwd, sent SIGTERM to that parent only. Cleanup-only supervisor
reconciliation reported active leases 0, PG stopped and
`stopped:true, removed:true, sourceUnchanged:true`. Independent checks confirmed
the exact root absent, port 3395 free, no owned runner/issuer/PG process and no
application source changes. All disposable synthetic data was removed.

Together with the preceding partial run, this closes the bounded local built
workspace/result/review/Points and cancellation/recovery acceptance at the same
application revision. It does not enable the still-undefined formal workspace
runtime, prove Hosted PG17/TLS/custody or real Auth, perform a real generation,
or approve the five-Note release. No push, PR, deployment, Production operation,
real care data, model call, payment or new cloud resource occurred.

**Next proposed app-facing slice:** connect the Communication Note workspace
to the existing `/plan-and-usage` Points page and verify the return navigation,
using the established green design. Reuse the existing balance/NOT_READY/
UNAVAILABLE states; do not fabricate a balance, duplicate the wallet, add
purchasing, or activate the formal runtime. Keep implementation and synthetic
verification local; managed custody/Hosted activation remain separately gated.

## Communication Note workspace to Points navigation (2026-09-09)

Implemented the preceding app-facing slice on top of `821bc66`. The authenticated
multi-task workspace now offers a read-only Points entry only when the existing
server Points UI switch is enabled. The client receives one boolean, not a
balance or account identifier. Existing green branding, Logo and typography
remain unchanged; no new wallet, mutation route or purchase control was added.

`communicationLang` accepts exactly one of `en`, `zh-Hans`, `zh-Hant`. It is
navigation context, never a return URL or access authority. The Points page
preserves that context through reload, its language switcher and safe pending
login/register links. Its primary return link performs a full navigation to the
fixed workspace path, where access and metadata are checked afresh. Unknown,
duplicate and URL-shaped context is ignored; demo accounts cannot use it to
authenticate or read Points. The legacy Credits branch is unchanged.

The existing Points shell supports English and Simplified Chinese only.
Traditional Chinese entry explicitly says “英文”, opens English Points with an
explanation, and returns to the Traditional Chinese workspace even after a
Points-page language change. This is an explicit fallback, not a claim of a
translated Traditional Chinese Points page. Existing AVAILABLE (including real
zero), NOT_READY, AUTH_REQUIRED and UNAVAILABLE balance handling remains intact.

Verification:

- Final complete suite: 5,291 passed, 41 skipped; 304 passing files and four
  opt-in skipped files. Full ESLint and TypeScript checks passed. Existing
  Points-markup import mocks and the audited server flag-importer list were
  updated; both sides of the importer comparison are now sorted consistently.
- Owned built fixture copied the actual workspace and Points pages unchanged.
  Only its Points UI flag was enabled; the Product API/Points runtime remained
  closed. Webpack build and the 40-chunk client-boundary scan passed.
- In temporary browser tab 38, all three workspace languages entered Points
  and returned correctly. Traditional Chinese context survived Points reload
  and English → Simplified Chinese switching. At 390px, both pages had no
  horizontal overflow; entry/return controls measured 44px high. Return loaded
  the two existing synthetic draft entries. Browser warning/error logs: empty.
- The Points page correctly displayed UNAVAILABLE, not the fixture admission
  balance. Unit/markup tests cover all four balance states and login context;
  this run does not attest real sign-in or a live Points read.
- Independent fixed status: synthetic Points stayed 30 available / 0 reserved;
  one setup ledger entry, no admissions/reserves/terminals/jobs/review/edit/sync
  events. Six task-read receipts were REVOKED, runtime roles/sessions/locks zero.
- Reset the temporary viewport and closed only tab 38. Verified parent 93210
  was stopped; cleanup reported active leases zero, PostgreSQL stopped and
  `removed:true, sourceUnchanged:true`. Independent checks found owned root
  `/private/tmp/cl-job-browser-ItEfIw` absent and port 3395 free. Disposable
  synthetic data was removed; user tabs 1 and 12 were left untouched.

Formal workspace/runtime activation, Hosted custody/Auth and release gates are
still open. No push, PR, deployment, cloud resource, real AI call, payment or
Production operation occurred.

**Next proposed app-facing slice:** add a Points-page route from the composer’s
insufficient/not-ready balance guidance, with an explicit warning before leaving
unsubmitted facts. Reuse this navigation and current balance handling; do not
put facts in URLs/storage, imply that purchase is available, or activate runtime.

## Communication Note composer Points entry and leave guard (2026-09-09)

Implemented the next local UI slice on `174128d`. The composer offers the
existing read-only Points route when its snapshot is NOT_READY, UNAVAILABLE or
insufficient, and after a server `POINTS_INSUFFICIENT` response even when the
page-load snapshot was sufficient. No balance is changed on the client. The
entry is withheld while a generation request is pending. It reuses the fixed
locale-only URL and explicit Traditional Chinese → English Points label; the
Points page returns to the workspace, not to a restored unsent composer.

Owned full-page links (Points, Logo, workspace, language and privacy) now warn
before discarding any entered field. Pending/uncertain submissions use separate
copy: leaving does not cancel a server task and loses the page-only retry
request, so check the workspace before another generation. Cancelling preserves
facts, privacy checks and exact retry bytes/key. Confirming an owned link
suppresses a second generic unload prompt; successful admission also permits
the existing job redirect without an inappropriate discard warning.

`beforeunload` is registered only while input or a locked request exists.
`pagehide` and persisted `pageshow` clear page-only inputs, checks and request
state, abort the local request and ignore its late result. No persistent storage,
fact-bearing URL, server cancellation, new auth authority or purchase was added.
This is not an autosave guarantee: browsers control unload prompts and may not
fire lifecycle events when a mobile process is killed. See the current
[beforeunload documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
Existing green styling, typography and Logo are preserved.

Verification and remaining boundary:

- Complete suite: 5,308 passed, 41 skipped; 305 passing and four opt-in skipped
  files. Full lint/typecheck, 73-file adapter sync and diff checks passed.
  Unit/jsdom coverage includes all seven dirty fields, three locale prompts,
  cancellation, allowed departure without double prompt, refresh warning,
  lifecycle reset, late ACK suppression, unchanged exact retry, sufficient /
  insufficient / unavailable / not-ready states and server insufficient errors.
- Owned `--workspace-task` webpack fixture and 40-chunk client scan passed.
  Browser tab 39 initially rendered the unchanged green composer without
  warning/error logs. At 30/0 synthetic Points no entry was shown. The fixed
  parent seed produced the standard 10/0 baseline; reload visibly showed the
  new entry and explanation with generation still disabled.
- **Browser acceptance is partial.** After entering one synthetic follow-up
  and clicking View Points, browser control timed out. The dialog API returned
  no handle; subsequent screenshot/AX access also timed out. Native Codex-app
  automation was denied and was not bypassed. Thus neither the rendered native
  confirmation nor its cancel/accept, real Back/refresh and narrow-layout tail
  is claimed as passed. No product changes were made just to bypass this test
  limitation. The browser-verification stop condition was respected.
- Database counters stayed at the seed baseline: 10 available / 0 reserved,
  seven ledger entries, three admissions/reserves/terminals, 25 tasks, reviews /
  exports zero, setup edit/sync 1/1. Runtime roles/sessions/locks and receipts zero.
- Verified parent 97923 was stopped. Cleanup reported active leases zero,
  PostgreSQL stopped and `removed:true, sourceUnchanged:true`; independent checks
  confirmed `/private/tmp/cl-job-browser-1xbHZA` absent, port 3395 free and owned
  processes gone. The temporary database and all synthetic database data are
  removed. Tab close timed out; a fresh inventory still listed temporary tab 39
  alongside untouched user tabs 1 and 12. Do not claim browser cleanup complete.

Next: manually dismiss/close the remaining temporary test page, then recreate
the same local fixture for supervised cancel/accept, refresh/Back and three-
locale narrow-layout acceptance. Keep these gates pending until observed.
No push, PR, deployment, Production data, real AI, payment or hosted change.

## Composer Points browser follow-up (2026-09-09)

Verification-only follow-up on `96603be`; no product or test-runner changes.
The old tab 39 responded again. Its one synthetic field was explicitly cleared,
then the tab was closed; inventory confirmed only untouched user tabs 1 and 12.
This does not establish how the earlier native confirmation was dismissed.

Recreated the fixed `--workspace-task` fixture in
`/private/tmp/cl-job-browser-iBrg48`, with owned browser tab 40. Startup passed
the 54 review/edit/history, 12 admission and eight catalog scenarios, webpack
build and 40-chunk client boundary scan. The previous 5,308-test full-suite
result remains the source baseline; the full suite was not rerun this time.

Observed browser evidence:

- Default-size green composer rendered meaningful content with no initial
  warning/error logs. The fresh 30/0 snapshot hid Points guidance; the fixed
  seed and reload showed the 10/0 insufficient snapshot and disabled generation.
- With all facts empty, English, Simplified Chinese and Traditional Chinese
  Points entries each navigated to the expected locale-only URL; browser Back
  returned to the corresponding composer with empty fields. This is an
  **empty-form round trip**, not evidence for discarding dirty inputs.
- At 390 × 844, all three Points guidance regions were visually legible,
  document width equalled 390 and entry height was 44 pixels. Traditional
  Chinese explicitly labelled its English destination; Points retained
  `communicationLang=zh-Hant` and a Traditional Chinese workspace return link.
- The actual Points page stayed UNAVAILABLE because its runtime remains closed;
  no fabricated balance or purchasing capability was substituted.

A later attempt to switch back to Simplified Chinese and restore the default
viewport timed out and reset browser control; fresh inventory still showed tab
40 on the Traditional Chinese composer. A separate viewport-reset/inspection
attempt and final tab acquisition also timed out. The session stopped there:
**tab 40 closure and viewport restoration are unconfirmed**, and native dirty-
input cancel/accept, dirty refresh and post-discard Back remain pending. No
synthetic facts were entered into tab 40, no dialog was triggered in this run,
and no native-app restriction was bypassed.

Fixed parent status showed unchanged seed counters: 10/0 Points, seven ledger
entries, three admissions/reserves/terminals, 25 jobs, reviews/exports zero,
setup edit/sync 1/1, runtime roles/sessions/locks and receipts zero. Parent 1275
was identified with its owned PG child and application cwd, then stopped.
Cleanup reported active leases zero, PostgreSQL stopped, `removed:true` and
`sourceUnchanged:true`. Independent checks confirmed the owned root absent and
port 3395 free. All disposable database data was deleted; browser cleanup is
separate and is not claimed complete.

Next: close the remaining owned test tab and restore normal browser sizing,
then use a supervised browser session for native cancel/accept, dirty refresh
and Back acceptance. Do not repeat the completed three-locale/narrow checks or
activate any hosted runtime to work around browser-control failures.

### Supervised confirmation handoff (2026-09-09)

A fresh inventory confirmed tab 40 gone and only user tabs 1 and 12 present.
The viewport reset then succeeded. The same unmodified local fixture was
recreated at `/private/tmp/cl-job-browser-BcF6NH` (parent 3315, terminal session
73048). Startup matrices/build and the 40-chunk scan passed. Its fixed seed
retains the same 10/0 baseline and zero runtime roles/sessions/locks/receipts.

Owned tab 41 shows the Simplified Chinese composer at default browser sizing,
with no initial warning/error logs. Only `contact_channel` was filled with
`本地合成测试，无真实资料`; generation is disabled. The tab is visible and marked
for handoff. The user is asked to click View Points, choose Cancel, and report
whether the synthetic text remains. **No native-dialog outcome is claimed.**
The fixture is intentionally still running for this supervised continuation,
not cleaned yet. Do not recreate it or repeat the completed locale/layout checks.
After acceptance or abandonment, validate parent ownership again and stop the
fixed parent, verify database/root removal, and close only this owned tab.

### Retry after interruption (2026-09-09)

The user requested another attempt after an interrupted turn. Inventory now
contained only user tab 1; tabs 12 and 41 were absent. Terminal 73048 no longer
existed, no owned process or listener remained, and `pg_ctl status` confirmed
the old database stopped. The abandoned `/private/tmp/cl-job-browser-BcF6NH`
directory was removed and absence verified; it contained disposable test data.

The unchanged fixed fixture was recreated at `/private/tmp/cl-job-browser-CZRJ8M`
(parent 6713, terminal 3371). Startup matrices/build and 40-chunk scan passed.
Visible owned tab 42 rendered the Simplified Chinese composer without initial
warning/error logs; only the same synthetic contact-channel text was entered.
One actual View Points click was attempted. It timed out in
`Input.dispatchMouseEvent`; the separate dialog API returned no handle. Native
Cancel/accept and subsequent dirty-input lifecycle behavior are still pending.
No further automatic click or native-app bypass was attempted. The app request
to show this exact tab returned `queued`, not proof that it was foreground.

The fixed status controls initially showed the unchanged 10/0 seed baseline and
zero runtime roles/sessions/locks/receipts. Tab 42 was retained for manual testing.

Manual result: after the field was found empty, the synthetic contact-channel
text was refilled and visually confirmed beside View Points. No further refresh
or navigation was initiated by the agent before the user's click. The user
reported no dialog, and a fresh browser inspection confirmed navigation to
`/plan-and-usage?lang=zh-Hans&communicationLang=zh-Hans`. **The observed dirty-input
leave-warning path failed acceptance.** This is no longer merely a pending
automation-dialog test. The cause (event/state handling versus native-dialog
handling) is not yet established; unit tests mocking confirmation do not resolve
that gap. Cancel preservation, dirty refresh and post-discard Back remain unproved.

Verification stopped at this boundary. Final fixed status retained the 10/0 seed
baseline, zero runtime roles/sessions/locks, and four REVOKED task receipts.
After revalidating parent 6713, its cwd and owned PG child, fixed cleanup exited
successfully with zero active leases, PostgreSQL stopped, `removed:true` and
`sourceUnchanged:true`. Independent checks confirmed the owned root, processes
and port 3395 listener absent; owned tab 42 was closed. Disposable synthetic data
was deleted; no Production or hosted resources were changed and no model ran.

Next proposed repair: a page-owned accessible confirmation for guarded in-app
links, preserving the established green design, then cancel/accept verification.
Refresh/tab-close protection remains a separate browser-native check. No product
code was changed for this observation; do not repeat the same native-dialog test
or mark the guard complete before a repair and new evidence.

### Page-owned composer leave confirmation repair (2026-09-09)

Replaced the composer's `window.confirm` with a labelled HTML dialog for owned
in-app links. The original click is stopped before the dialog opens. Keep editing
and Escape preserve facts, local review/confirmations and the exact retry request;
only Discard inputs and leave permits full-page `location.assign`. The successful
job acknowledgement still uses replace navigation. Pagehide/persisted return
clear pending confirmation along with page-only state. Refresh/tab-close still
use the existing native beforeunload guard and are not newly browser-accepted.

The dialog reuses the fixed green palette, fonts and existing button styles.
Initial focus is on Keep editing; Tab/Shift+Tab wrap across the two buttons,
and cancellation restores focus after the modal closes. Body/secondary-action
contrast is 13.70:1, primary-action text 12.18:1 (hover 7.92:1). This is focused
accessibility evidence, not a certification. No animation or dependency added.
Implementation reference: [HTML dialog modality and focus](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

Verification: 5,316 tests passed, 41 skipped (305 passing / four skipped files),
typecheck and targeted ESLint passed. The owned webpack build and 40-chunk client
boundary scan passed; adapter sync checked 73 files. New coverage includes dialog
semantics, initial/return focus, cancellation, exact locked retry preservation,
single accepted navigation, modifier/new-tab exclusions and keyboard wrapping.
jsdom models only dialog open/close; real modality was checked separately.

Browser evidence on final tab 44: English, Simplified Chinese and Traditional
Chinese dirty-input Points flows show the correct dialog, cancel preserves input,
accept reaches the correct Points locale/fallback without a second prompt, and
Back returns an empty composer. At 390px, all three dialog widths were 352px with
44px buttons and no document overflow. Enter opens the dialog; Escape restores
input/focus; both keyboard wrap directions passed on the final build. Captured
warning/error logs were empty. Points remained unavailable honestly: its runtime
was not activated and the browser never submitted generation.

Two verification caveats were resolved without hiding failures: the first build's
last-button Tab escaped the modal focus range, so that fixture was stopped before
adding explicit wrapping and retesting. Later the English DOM/AX input readout
returned empty even before opening, while screenshots visibly retained the
original text plus subsequently typed text after cancellation. Visual evidence,
not that inconsistent readout, established retention; the post-discard screenshot
showed the placeholder again. The readout's underlying cause is not asserted.

Both owned fixtures (`NFPX1M`, parent 8313; `g2YkPF`, parent 9516) were cleaned by
their fixed parent handlers after ownership validation. Cleanup reported zero
active leases, PostgreSQL stopped, root removed and tracked source unchanged.
Independent checks found both roots/processes absent and port 3395 free. Tabs 43
and 44 were closed and the viewport override reset. Final counters stayed at the
10/0 seed baseline, seven ledger entries, three admissions/reserves/terminals,
25 jobs, zero reviews/exports/runtime roles/sessions/locks/credential receipts.
Only disposable synthetic data was removed. No hosted resources, Production,
real care data, model calls, commits, pushes or deployments were involved.

Pre-commit review (2026-09-09) found no blocking issue in this repair. The same
product source passed 5,316 tests (41 skipped), typecheck, full ESLint, 73-file
adapter sync and whitespace checks again. No new product change, browser run or
temporary environment was needed; the existing same-source browser evidence is
retained. Commit scope is the six implementation/test files and three evidence
documents only, with no push or deployment.

The next independent native check is recorded below; the in-app flow was not repeated.

### Safari native composer departure acceptance (2026-09-09)

Product source `6ff5871` passed the separate native boundary in one new Safari
tab on the local Simplified Chinese composer. Actual field click/keyboard input
preceded Cmd+R and Cmd+W; no synthetic beforeunload dispatch or forced tab-close
API was used. Both actions displayed Safari's origin-labelled confirmation.
For each, 留在页面 retained the exact synthetic text and original URL. Accepting
离开页面 after refresh reloaded an empty composer; accepting it after tab-close
removed only the owned test tab. The original two tabs and active tab were restored.
Native accessibility output and screenshots agree on these outcomes. An initial
Chinese automation input did not enter the field; verified ASCII synthetic input
was used before testing. This does not establish the input-tool failure's cause.

The existing fixed fixture `XFKQII` passed its 54 review/edit/history, 12 admission
and eight catalog scenarios, owned webpack build/typecheck and 40-chunk client
scan. Browser generation/review submission was never invoked; displayed Points
stayed 30 available / zero reserved. No task seed or runtime activation was added.
After parent/child ownership checks, parent 11007's fixed cleanup exited zero,
reported zero active leases, PostgreSQL stopped, root removed and source unchanged.
Independent checks found the owned root, all three processes and port 3395 absent.
Only disposable local synthetic data was removed; it can be recreated by the runner.

This is desktop Safari / dirty-input evidence only, not Chrome/Edge/mobile,
force-quit, or pending-request acceptance. Browser-native prompts require prior
interaction and are not guaranteed for every lifecycle exit; see
[MDN beforeunload limitations](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#usage_notes).
No product edit, model call, hosted/Production change, commit, push or deployment.
Next: review and locally commit this evidence-only update; do not repeat passing
composer leave tests or expand runtime authority.

### Traditional Chinese Points page (2026-09-09)

The Points-only page body, shell, entry labels, four balance states and number/UTC
date formatting now support `zh-Hant`. Three-language switching and reload retain
the original Communication Note workspace locale; its Points entry no longer
falls back to English. Login/register and untranslated legacy destinations remain
explicitly labelled English, with the Traditional Chinese Points return preserved.
Legacy Credits locale parsing and the static page title are unchanged. The fixed
green identity is retained; only Points language controls wrap and gain 44px targets.

Verification: 5,334 tests passed / 41 skipped (305 passing / four skipped files),
typecheck, full ESLint, 73-file adapter sync, owned webpack build and the 40-chunk
client boundary scan passed. Tests cover all four states, actual zero, formatting,
nine display/return-locale combinations, signed-out links and strict invalid-locale
fallback. An initial full-suite failure exposed changed en/zh-Hans auth `next`
links; their original contract was restored without loosening the fixed probe.

Final in-app browser tab 45 passed language switching, reload, workspace return
and re-entry. The Traditional Chinese unavailable state stayed honest: formal
Points runtime was not enabled. Widths 320, 390, 700, 768, 899, 1024, 1366 and 1440
had no horizontal overflow; the 390px menu language targets measured 44px. Captured
warning/error logs were empty. Other balance states and auth return links have
rendered-test coverage, not live authentication acceptance. This is focused
localization/responsive evidence, not a full accessibility or launch certification.

Both owned fixtures (`Ap3P4i`, parent 12348; `TITG1Q`, parent 12877) were cleaned
through their fixed handlers after ownership checks. The first stopped before
browser testing to restore the auth-link contract. Final observations had zero
generation/review/edit/sync/admission/reserve/terminal events, zero runtime
sessions/locks/roles/task rows, the 30/0 synthetic seed balance and one revoked
list-read credential receipt. Cleanup exited zero with no active leases,
PostgreSQL stopped, roots removed and tracked source unchanged. Independent checks
confirmed the owned roots/processes and port 3395 absent; tab 45 was closed and
the viewport reset. Only disposable synthetic data was removed and is recreatable
with the runner. No real care data, model calls, hosted/Production writes, runtime
activation, commit, push or deployment occurred.

Pre-commit review (2026-09-09) found a pre-existing clock race in the task-list
factory test: its expiry was only 1ms beyond the 90-second limit, so real elapsed
time could move it into the accepted interval before validation. The invalid-input
test now freezes time using the existing fake-timer facility; all rejection/no-I/O
assertions and product expiry/security logic remain unchanged. Its 51 tests and
the full suite then passed (5,334 passed / 41 skipped), as did typecheck, full ESLint,
adapter sync and whitespace checks. React/Next.js review found no blocking issue
or need to change product source, so the same-source browser evidence above is
retained without another fixture. This local commit contains the 11 localization
implementation/test files, the two-line clock stabilization and three evidence
documents. No push, deployment or runtime activation is included.

### PR #37 self-review late-lock expiry fix (2026-09-09)

Review found that the self-review candidate checked JWT/session expiry before
reading or inserting `self_review_events`, but those operations could still wait
on a relation/index/FK lock. The candidate now repeats the wall-clock JWT and
locked active-session checks after all event work, before returning a receipt.
Failure raises `AUTH_REQUIRED` in the same transaction, rolling back a new event
and denying an expired replay. This retains the existing strict session contract;
see [Supabase session validation](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).
Privileges, RLS, owner/revision checks, lock order and default-off gates are unchanged.
The SQL remains an unpromoted candidate; no approved hosted manifest was changed.

The fixed local PG16 runner now has three additional regressions: JWT expiry
during a late event-table wait before insertion, session `not_after` expiry at
the same point, and JWT expiry during replay. Each observes the actual blocked
event-table lock after the document lock, then releases it after confirmed
database-clock expiry. Independent readback proves the event rows are unchanged;
valid-session replay still succeeds afterwards. The first regression failed
against the original SQL before the fix; all **17 scenario groups** passed after
the fix using `node scripts/preview-e2e/communication-note-self-review-local-pg16.mjs`.
Both owned Unix-socket-only synthetic clusters were stopped and removed.

Full verification: **5,334 tests passed / 41 skipped**, TypeScript and ESLint
passed. Existing database least-privilege/default-off ACL assertions also passed.
The initial Supabase CLI advisor scan was blocked because even its help command
required a persistent telemetry configuration write in the user's directory.
After the user explicitly authorized that local configuration write, CLI 2.115.0
version/help checks succeeded without upgrading or using alternate configuration.
The existing fixed runner was then rerun with `--history`, exercising **38 scenario
groups** (17 self-review and 21 export-history) and security advisors against only
its owned Unix-socket database. All groups passed; advisors was available and
returned `results: []`. The synthetic cluster `/private/tmp/cl-export-history-kJXgiX`
was stopped and removed, with its absence independently checked. This removes
only recreatable test data and is not hosted/Production advisor clearance.
The full 5,334-test suite, TypeScript and ESLint passed again on the same source.

The reviewed local commit is limited to the candidate SQL, local regression
scenarios and this evidence record. No push, PR mutation, deployment, runtime
activation, AI call, real care data or Production access is included. Next:
publish the fix to the existing Draft PR #37 in `Millionluna/Codex-Game-Studios`
only after user confirmation; do not merge or deploy.

### PR #37 client save/export request deadlines (2026-09-09)

Local follow-up fixes the two review findings where an edit save or export
reauthorization could remain pending indefinitely. Both now use one 30-second
deadline covering the request and response body. A child AbortController cancels
only that operation; a promise race settles even if transport ignores abort.
Timers and parent listeners are cleaned after completion, failure or cancellation.
There is no automatic retry and cancellation does not imply server rollback.

An edit timeout returns `UNAVAILABLE`, retaining all three edited texts and the
existing unknown-save warning/current-version recovery link. Save remains locked
against resubmission; discard is available. Export preflight timeout returns a
sanitized `UNAVAILABLE`, unblocks controls and creates no export-history report.
Late reads/ACKs cannot trigger navigation, copy or download. A fresh user action
gets an independent request and must reauthorize its exact revision again.
Existing green UI, Cookie transport, strict receipts, version/self-review checks
and default-off gates are unchanged; no component or server contract was changed.

Verification: 12 new real-component/client jsdom regressions first failed against
the original source, then passed with the fix. The final 22 added tests also cover
cleanup, parent cancellation, late resolution/rejection and a new explicit export
while the previous read finishes late. Both stalled fetch and stalled JSON are
covered for edit, TXT/DOCX/PDF and both clipboard paths. Browser APIs are mocked;
this is deterministic behavior coverage, not live Safari/clipboard acceptance.
Full suite: **5,356 passed / 41 skipped** (307 passing / four skipped files).
TypeScript, full ESLint, adapter sync and whitespace checks passed.

Pre-commit review (2026-09-09) found no blocking issue in this bounded diff.
The same-source full suite, TypeScript, full ESLint, 73-file adapter sync and
whitespace checks passed again. Next.js client-boundary review confirmed the
deadline helper adds no server-only imports or changed component boundaries.
The local commit is limited to these seven implementation/test/evidence files.
No push, PR mutation, deployment, hosted database, Production access or AI model
call is included. Next: publish to the existing Draft PR #37 in
`Millionluna/Codex-Game-Studios` after user confirmation; do not merge or deploy.

### PR #37 successor: Preview read-only workspace composition (2026-09-10)

The new local development branch `codex/careslink-workspace-preview-readonly`
starts at the merged development baseline `0da677c`. The server-only Preview
composition now joins the existing request-local Cookie/current-session reader,
document-list RPC, fixed task-list repository, one-use credential lease and
pinned-TLS direct PG17 reader. These are the actual source implementations, not
an additional process-memory data store or a replacement UI.

Installation requires an explicit server binding for the exact Supabase ref and
Vercel project, copied CA bytes with their matching digest, and dedicated
list-purpose custody issue/revoke functions. It accepts no arbitrary SQL/open
callback, operator credential, environment-discovered password, status-purpose
reuse or local-Unix fallback. The existing Preview configuration guard is shared
with the durable adapter; it is rechecked before issuance and opening the reader.
Request cancellation, configuration drift and logout never disable the independent
revocation phase. Each request retains its own authenticated identity and lease;
metadata is withheld until physical cleanup, the terminal revocation receipt and
the final current-session check succeed.

The formal runtime now invokes that guarded factory, but its immutable
`HOSTED_WORKSPACE_READ_BINDING` remains `undefined`. Importing the actual route
with every Preview flag enabled still creates no Cookie client, credential or
database connection and returns `503 UNAVAILABLE`. No readiness latch was opened.
The green design/Logo, generation, write/self-review/export-history installation,
Points spending and payment behavior are unchanged.

Verification: **59 new deterministic composition tests**, **5,415 full-suite
tests passed / 41 skipped** (308 passing / four skipped files), TypeScript and
full ESLint passed. The local Next.js 16.2.9 webpack build completed 63/63 generated
entries; the expanded client-boundary scan passed across 117 static chunk files.
Adapter synchronization (73 files) and whitespace checks passed. Coverage includes
two simultaneous identities, cursor/transport rejection, CA/target mismatch,
configuration drift, revoked sessions, failed/incorrect revocation receipts,
physical cleanup failure, abort, stalled issuance/revocation and a late driver
result after the read deadline. Old textual assertions were updated to the new
unbound-installation shape; behavioral default-off checks were retained and an
all-flags-enabled fresh module import was added.

External Cookie transport, custody and the `pg` driver are mocked in the new
composition matrix; real TLS, hosted SQL/roles, certificate provenance and durable
custody supervision are **not** established by these tests. No database fixture,
schema/grant change, cloud resource, hosted migration, deployment, real care data,
AI call or Points operation was performed. Supabase [session](https://supabase.com/docs/guides/auth/sessions)
and [SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
guidance informed request-local verified authentication; Next.js guidance kept
the assembly server-only.

**Next bounded implementation:** supply the dedicated task-list Preview custody
adapter, including terminal fencing and independently owned recovery after issuer
interruption. Reuse the reviewed lifecycle contract, not a static password or the
single-job status credential. Any hosted grant/issuer installation, disposable
Preview creation and actual runtime activation remain separate authorization and
verification gates.

### Task-list Preview custody source — local lifecycle verified, not activated (2026-09-10)

The dedicated server-only issuer source now supplies the task-list custody
issue/revoke contract and a fixed-statement SQL broker. Recovery takes over a
durable epoch, fences and finalizes every recorded unfinished lease, then permits
issuance. Old service instances cannot issue after an epoch takeover. One-use
request tombstones prevent delayed issuance after cancellation. Credentials are
random, list-purpose-only, SCRAM-authenticated, limited to two connections and
60 seconds; only the SCRAM verifier is sent to SQL, never the plaintext password.
The proposed private ledger retains scope/OID/state/expiry, not reusable secrets.

Revocation first commits `NOLOGIN`/null password, then on a fresh transaction
terminates only the receipt-matched role's sessions and drops that role with
RESTRICT. A terminal receipt requires zero roles, sessions and memberships.
Failed issue cleanup is independent of the cancelled page signal. The external
supervisor must own restart recovery and periodic expiry/fenced-lease sweeping;
this source-only core is **not a deployed supervisor**. The SQL broker accepts a
trusted fresh control opener but does not establish hosted PG17/pinned TLS,
target identity, OAuth/control custody or process-independent supervision itself.
No such physical hosted opener was installed in this batch.

The CLI-generated SQL is quarantined in `migration-candidates/`, not automatically
applied. The formal workspace binding remains `undefined`, issuer readiness is
false and product source imports none of the new issuer. No UI, Logo, AI
generation, real care data, Points/payment, hosted role, Production, deployment
or PR was changed. No commit or push is included in this validation batch.

Verification: **44 new offline protocol/connection/runner tests passed**, full suite
**5,459 passed / 53 skipped** (309 passing / five skipped files); TypeScript,
full ESLint and 73-file adapter sync passed. The protocol fake is in-memory and
proves neither real SQL semantics nor OS-process recovery. Tests caught and
corrected a mismatched Production-ref literal in the new candidate, a physical
close error that was not sanitized, and cover prompt cleanup of fenced leases.
The local Next.js 16.2.9 webpack build completed 63/63 generated entries; the
expanded server-only boundary check passed across 117 client chunk files.

All **12 opt-in PG16 tests passed**, covering actual SCRAM/connection limits, committed
fencing, old-password denial, live-session termination, a terminated control
backend, lost acknowledgements, stale epochs, OID substitution, private ACL/RLS
and a real 60-second expiry. The source issue-instance/control-loss scenarios
inject transport faults; only the pending-finalization probe terminates an
actual PostgreSQL backend. This does not prove a hosted service supervisor or
an OS-killed issuer process automatically recovers itself.

The first handoff was blocked before SQL installation by exhausted macOS SysV
slots (32/32). Following explicit user authorization, a one-off helper verified
IPC ID `35061761` as a 56-byte PostgreSQL header (magic `679834894`), owned by the
current user, created by exited PID `3328`, with zero other attachments. It
rechecked the header/ownership/dead creator while pinning a read-only attachment
before removing that exact segment. The other 31 existing segments were left
untouched; no existing database file or kernel setting was changed. The removed
segment was an orphaned runtime header, not persisted database contents.

The newly created `/private/tmp/cl-task-issuer-hZ4nEf` cluster ran all 12 tests
and zero-residue assertions, then stopped at the advisor JSON parsing step.
The runner used the legacy `--output json` status-variable flag, corrected to
the CLI's `--output-format json`. It now additionally fails on **any** finding
(`--fail-on info`), records bounded failure diagnostics, and has an offline
regression for the invocation. No database permissions were loosened for this.

A complete rerun on `/private/tmp/cl-task-issuer-BuHD0e` returned **`ok: true`,
`passed: 12`, advisor `results: []`, `stopped: true`, `removed: true`**. Both
new clusters were removed after their runs. The normal offline test command
still skips these 12 opt-in tests; their real execution is recorded separately
and is not hidden inside the offline pass count. These are local security-advisor
results only, not Hosted advisors or a full Supabase/PG17 migration-chain proof.

Supabase role guidance and Postgres least-privilege/short-transaction guidance
informed the isolated invoker surface and committed fence. PostgreSQL documents
that even the default mmap setup requires a small SysV segment; switching mmap
settings would not have removed the system-wide allocation requirement.
See [PostgreSQL kernel resources](https://www.postgresql.org/docs/16/kernel-resources.html).

Pre-commit review (2026-09-10): no blocking finding in the eight-file custody,
private SQL, test/runner, client-boundary and evidence diff. No implementation or
SQL change was required during this review. The same source passed the full
5,459-test offline suite (53 opt-in skips), TypeScript, full ESLint, the 63-entry
webpack build, 117-chunk client-boundary scan, 73-file adapter sync and whitespace
checks again. A fresh owned PG16 fixture at `/private/tmp/cl-task-issuer-tmRlDV`
reran all 12 real database tests and returned advisor `results: []`, `ok: true`,
`stopped: true`, `removed: true`. No existing IPC cleanup was performed in this
review. Scope is a local commit only, with no push, PR mutation or deployment.

**Next:** publish `codex/careslink-workspace-preview-readonly` to
`Millionluna/Codex-Game-Studios` and open a Draft PR against
`codex/careslink-ai-documents-v1-auth-gate` after user confirmation. Do not merge
or deploy. Keep the candidate unpromoted and the formal runtime closed. Hosted
target/control custody, pinned PG17/TLS transport, independently owned supervision
and activation still require their own evidence and authorization; the local
test result is not a substitute for those gates.

### PR #38 merged; dedicated task Preview control connector — 2026-09-10

PR #38 was explicitly authorized, marked ready and merged into
`codex/careslink-ai-documents-v1-auth-gate` as `769c747`; its parents are
`0da677c` and the reviewed `899e694`. The source branch was retained. No deployment
or candidate promotion occurred. Local follow-on development now starts from
that exact merge on `codex/careslink-task-preview-control`.

`communication-note-task-preview-control.server.ts` implements the previously
missing physical opener for the task-list issuer's fixed SQL broker. Every
operation obtains a fresh custody scope and performs one authenticated read of
the fixed Supabase branch-list endpoint using `environment:read`. Exactly one
matching branch ID/ref must be healthy, non-default, non-persistent, created
without copied data and not scheduled for deletion. Only then is separate
task-control database custody consulted, with a short-lived content-free evidence
digest. OAuth does not supply the database password. The generic exactly-once
custody handoff helper is reused; job-status credentials and SQL are not reused.

Each connection derives the direct `db.<ref>.supabase.co:5432` endpoint and copied
pinned CA, requires certificate/hostname validation, PG17, the existing
non-superuser `postgres` control posture, zero prepared transactions and an empty
search path. It checks READ COMMITTED and the driver's idle ReadyForQuery status
before and after its single parameterized task-issuer operation. It accepts no
DSN, pool, arbitrary SQL, role switch, local fallback or environment-discovered
credential. The underlying admin password remains static: delivery expiry is
not source revocation. This component creates no new privileged LOGIN or grant.

The existing two-second broker operation budget includes branch validation,
custody and connection/SQL work; close has a separate bounded acknowledgement.
Timeout, abort, malformed custody, wrong target, failed physical close, concurrent
reuse and late results withhold success. Cancellation hard-closes the owned
socket; a late replacement stream is also destroyed. Recovery/revocation use
fresh independent operation contexts, not the aborted page's context. The
supervisor must still recover unresolved durable leases; this connector neither
installs nor proves that supervisor. Hosted latency feasibility is unverified.

Verification: **100 new offline tests passed**, including real issuer + broker +
connector composition against simulated SQL replies, interrupted issuance and
independent cleanup, and the real pinned `pg` constructor's startup parameters
with all IO methods replaced. These are not TLS handshakes or SQL-engine tests.
Full suite: **5,559 passed / 53 skipped** (310 passing / five skipped files).
TypeScript, full ESLint, 63/63 generated webpack entries, the 117-chunk client
boundary scan, 73-file adapter check and whitespace checks passed. The existing
exact pg importer lists now include only this additional server-only connector;
separate tests prove it has no product importer. No boundary assertion was removed.

The Supabase/Postgres skills informed the fixed target, least-privilege control
posture and short autocommit lifetime; Next.js guidance kept the adapter
server-only. References: [branch-list API](https://supabase.com/docs/reference/api/v1-list-all-branches),
[Postgres SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement),
[node-postgres TLS configuration](https://node-postgres.com/features/ssl),
[PG17 connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html).

All readiness latches remain false and `HOSTED_WORKSPACE_READ_BINDING` remains
undefined. No SQL candidate/approved migration, UI/Logo, Points/payment or model
operation changed. No Hosted database, live custody/CA/OAuth integration, cloud
resource, Production, deployment, commit or push was used in this batch.
**Next:** review and locally commit this bounded connector/test/evidence change;
do not push or deploy. Authentic custody/workload and CA provenance, the approved
Hosted migration chain, physical PG17/TLS evidence and independent supervision
remain separate gates before activation.

Pre-commit review (2026-09-10): the seven-file connector/test/boundary/evidence
diff has no blocking finding for this source-only, uninstalled scope. No
implementation or SQL change was required. Fresh verification passed all
5,559 offline tests (53 skips), TypeScript, full ESLint, the 63-entry webpack
build, 117-chunk client-boundary scan, 73-file adapter check and whitespace
checks. Startup option escaping and idle ReadyForQuery semantics were checked
against the PostgreSQL 17 protocol/connection documentation and the pinned pg
implementation; this is still not physical PG17/TLS or Hosted latency evidence.
The authorized handoff is one local commit only. Next, after user confirmation,
publish `codex/careslink-task-preview-control` to `Millionluna/Codex-Game-Studios`
and create a Draft PR against `codex/careslink-ai-documents-v1-auth-gate`.
Do not merge, deploy, promote a migration or activate the formal runtime.

### PR #39 merged; dedicated task Preview service lifecycle — 2026-09-10

PR #39 was authorized and merged into
`codex/careslink-ai-documents-v1-auth-gate` as `2090364`, with exact parents
`769c747` and reviewed connector commit `f682642`. The source branch was retained;
no deployment occurred. The following local-only batch builds on that same
reviewed source tree without changing the connector, SQL candidates or bindings.

`communication-note-task-preview-service.server.ts` now composes the task issuer
into an explicitly owned, inert-on-construction Node service lifecycle. `start()`
must complete durable recovery before request admission. A single non-overlapping
five-second sweep loop runs independently of page/request cancellation. It blocks
new issue admission while sweeping, but still permits scoped revoke requests.
Outstanding work is bounded locally (four issue admissions; eight total requests
for revoke admission); the unchanged SQL ledger remains authoritative for the
four unfinished lease limit. Malformed or pre-aborted requests are rejected before
issuer IO without shutting down a healthy service.

Successful maintenance renews a 15-second monotonic health deadline. Request
admission, delivery, health reads and the sweep callback also check freshness,
so delayed timer callbacks cannot make stale health acceptable. A wall/monotonic
clock divergence over one second fails closed. Referenced timers keep the owned
service process alive until explicit shutdown; no global process handler or
module-level background work is installed. Timer timing is not a hard realtime
guarantee; an external host must still detect a blocked/dead process.

Any uncertain custody, recovery or maintenance failure closes admission, cancels
owned issue/maintenance work, joins pending bounded operations, and attempts one
independent cleanup pass. `stop()` uses the same join/drain path. The issuer's new
`drain()` inventories only its existing epoch and revokes even unexpired leases;
it never performs `start`/`ready`, takes over a successor, or reopens issuance.
The service owns no separate SQL connection or secret cache. It reuses the
existing per-operation broker/control closure and the committed fence followed by
separate finalize acknowledgements. Any nonzero role/session/membership count,
unknown startup outcome or unavailable/stale-epoch inventory leaves
`cleanupConfirmed: false`. Clean stop acknowledges this instance's admitted work,
not global zero activity in a successor. Stop before start confirms only that the
instance performed no IO. A failed service remains terminal even if cleanup
succeeds: the owner must inspect `finished`/content-free `health()` and arrange a
new recovered instance; there is no recursive restart/takeover loop.

Verification: **46 new offline tests passed** (190 related tests total). The full
suite passed **5,605 tests / 53 opt-in skips**, with 311 passing / five skipped
files. TypeScript, full ESLint, the 63-entry webpack build, 117-chunk client-boundary
scan, 73-file adapter check and whitespace checks passed. Coverage includes
startup gating, expired/fenced cleanup, cancelled pages, overlapping maintenance,
pending issue cancellation and shutdown, stale-instance shutdown, wrong scopes,
clock jumps, delayed callbacks, residual acknowledgements, bounded failures and
fresh-instance recovery over a protocol fixture. Two additional tests compose the
real service, issuer, broker and control connector with mocked external IO. These
are **not** real SQL-engine/TLS, process-kill/restart or Hosted latency evidence.
The existing follow-up browser test emitted React `act(...)` warnings but passed;
no unrelated UI test/code was changed.

Local review found no blocking issue for this **uninstalled source-only scope**.
Supabase/Postgres guidance informed exact-purpose, minimal-privilege cleanup and
separate short transactions; Next.js guidance kept the service server-only and
outside route lifetime. See [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles),
[short transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html)
and [Node timer lifetime/timing](https://nodejs.org/api/timers.html).

All readiness constants remain false and `HOSTED_WORKSPACE_READ_BINDING` remains
undefined. This is a service lifecycle implementation, **not an installed external
supervisor**. Authentic task-control custody/workload/CA provenance, an authenticated
service transport, independent process monitoring/restart ownership and Hosted
PG17/TLS/full migration-chain evidence remain outstanding before activation.
No new cloud resource, real database permission/migration, model/Points operation,
UI/Logo change, push, PR mutation or deployment occurred in this batch.

**Next local development:** bind the dedicated service to task-specific control
custody and an explicit service-host boundary; verify startup, shutdown and
process-loss recovery without product activation. Batch implementation, tests and
review together. Publishing a new change to the public repository or creating a
disposable Hosted Preview remains a separately scoped action; no new deployment
or Production authorization is implied.

### Dedicated service-process owner and local process-loss evidence — 2026-09-10

The next local batch adds `communication-note-task-preview-host.server.ts`.
`createTaskPreviewCustodiedService` explicitly composes the existing task-only
control opener, fixed SQL broker and service lifecycle. Construction is inert;
the caller must provide task custody and a pinned CA. This is **not** an authentic
managed-custody implementation or a provenance attestation. Inspection found the
existing M1u GCP database-secret policy allows a different application name;
this batch neither broadens it nor disguises task control as that application.

`ownTaskPreviewServiceProcess` is an explicit, one-lifecycle-only POSIX Node main
process owner. Importing it has no process side effects. It requires an unstarted
service, completes recovery before its `ready` promise resolves, handles SIGTERM,
SIGINT and inherited-parent IPC disconnect with the existing joined drain, and
removes only its own handlers. Failed/unconfirmed cleanup produces a failing
exit code; successful cleanup cannot overwrite a pre-existing failure code.
Startup or requested shutdown exceeding 40 seconds forces a failing exit with
unknown cleanup. These timers cannot supervise their own dead or blocked process.
No Next.js route, listener, authenticated transport, cloud entry point, ambient
secret discovery or external restart daemon is installed. All readiness latches
remain false; `HOSTED_WORKSPACE_READ_BINDING` remains undefined.

Verification: **27 additional passing tests**, comprising 18 process-owner unit
cases, two full custody/service/broker/control composition cases with offline IO,
and seven tests that launch and terminate actual owned Node children. The latter
compile the actual service/issuer/host sources and keep a **simulated protocol
ledger in the parent**. They cover graceful SIGTERM/SIGINT, actual SIGKILL after
issuance or committed-protocol issue/fence acknowledgements are lost, recovery
before successor readiness, unknown-cleanup failure and failed startup without
self-restart. They prove process behavior, **not SQL durability, TLS or Hosted
supervision**. A child is considered closed only after its close event, never
merely because `kill()` returned true. Synthetic passwords are not sent over IPC.

The fixed disposable Unix-only PG16 runner now targets the prior 12 SQL cases
plus eight process cases, serially. This batch could not execute them: initdb was
first sandbox-denied, then the permitted attempt failed with shared-memory
`No space left on device`. Both owned temporary directories were removed, no
cluster remained, and no other task's IPC/system resources were changed. Docker
was unavailable as a fallback. The real database/parent-disconnect case remains
an explicit opt-in skip; the previous 12-case result is not being represented as
a new run. No Hosted fallback was attempted.

Full suite: **5,632 passed / 54 skipped**, 313 passing / five skipped files.
Fresh focused verification: 217 passed / one SQL-dependent skip. TypeScript,
full ESLint, the 63-entry webpack build, 117-chunk client scan, 73-file adapter
check and whitespace checks passed. Existing unrelated React act warnings remain.
Local review found no blocking issue for this uninstalled source/process scope;
real SQL cleanup remains unverified in this batch.

Supabase/Postgres guidance preserved the exact-purpose custody policy and separate
short cleanup transactions; Next.js guidance kept process ownership out of the
web runtime. Signal/exit handling follows the
[Node process documentation](https://nodejs.org/api/process.html#signal-events)
and [child-process closure semantics](https://nodejs.org/api/child_process.html#event-close).
No migration candidate, approved manifest, real database permission, green UI/Logo,
Points balance, model invocation, cloud resource, commit, push or deployment changed.

**Next:** implement and test the dedicated task-control credential/workload policy
without enabling the shared M1u secret factory or product routes. Its authentic
provider binding, CA provenance and independent authenticated service supervision
remain approval/verification gates. Rerun the fixed 20-case SQL/process fixture
when local shared-memory capacity is available; do not clear other tasks' resources
or create a Hosted Preview implicitly. This batch remains an uncommitted local diff.

### Task-control custody policy and callback delivery — 2026-09-10

This local batch adds `communication-note-task-preview-custody.server.ts`, a
task-specific credential policy/delivery layer implementing the existing control
custody interface. It does **not** implement or activate a cryptographic workload
verifier or a cloud secret provider. Those remain explicit trusted adapter ports;
echoing a request hash or returning a VERIFIED status is not authentication.
No M1u/job-status secret factory, application allowlist or deployed IAM policy was
changed. The new custody readiness constant is false and no product source imports
the factory. Tests explicitly compose it with the existing inert service factory.

Each invocation snapshots the exact Preview ref/branch, pinned CA hash, source
revision/manifest, expected workload identity, credential policy and OAuth
app/grant references. A fresh nonce and canonical request digest bind replies to
that invocation. The provider must independently authenticate and attest these
bindings before either secret is consumed. The finite state machine allows only
verification → one environment:read OAuth handoff → fresh branch attestation →
one database-password handoff → closed. OAuth is restricted to the connector's
fixed GET branch-list endpoint and is never treated as a database password.

The database target must exactly match the purpose, branch, CA, fresh two-second
observation interval and recomputed connector evidence. Database delivery retains
the actual static-password semantics: delivery expiry does not revoke LOGIN;
only branch deletion or password reset revokes that source credential. Providers
must await exactly one callback; zero, repeated, unawaited, late or failed handoffs
withhold success. The outer connector owns/disposes any connection opened before
a provider's eventual failure. Owned handoff fields are cleared after callback
use; this is not a promise to erase immutable strings or a provider's copies.

One two-second, cancellation-aware, wall/monotonic-checked lifetime bounds the
whole custody invocation; it does not extend the existing connector budget.
Foreign signals, reused capabilities, malformed/accessor/proxy input, stale or
mismatched proof, clock divergence, timeout and provider failure close the
invocation. Independent cleanup gets a new verified invocation and nonce. Local
review corrected proof lifetime to be measured from verification time instead
of the earlier request start, with a delayed-verification regression test.

Verification: **90 new passing cases** (84 custody unit cases and six additional
real-source composition cases with simulated external IO). The composition covers
successful issuance/stop, cancelled issuance and independent cleanup, invalid
workload/branch, duplicate password delivery and provider failure after connection
creation. It asserts fresh verification for every control operation and that no
shared old custody callback is used. Full suite: **5,722 passed / 54 skipped**,
314 passing / five skipped files. TypeScript, full ESLint, 63-entry webpack build,
117-chunk client boundary scan, 73-file adapter sync and whitespace checks passed.
Existing unrelated React act warnings remain. These are not cloud identity,
real database/TLS, latency, or installed-supervisor evidence. The prior PG16
shared-memory blocker was not retried or bypassed in this custody-only batch.

Supabase guidance kept OAuth and database credentials separate and prevented
public/client secret exposure; Next.js guidance preserved the server-only boundary.
The changelog was checked; no relevant breaking change applied. See
[Supabase OAuth integrations](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)
and [OAuth app scopes](https://supabase.com/docs/guides/platform/oauth-apps/oauth-scopes).
No UI/Logo, Points, model invocation, migration, database permission, cloud resource,
commit, push or deployment changed. The previous uncommitted host batch is preserved.

**Next:** implement the concrete task-only workload-verification and secret-provider
adapter behind these tested ports, beginning with local cryptographic/provider
contract tests. Authentic identity/source/CA provenance and independent service
transport/supervision still need verified binding before any activation. Creating
or changing cloud identities/secrets/IAM, a Hosted Preview, or Production remains
outside this local development authority. The fixed SQL/process test remains due
when the local environment can support it.

### Concrete task-only OIDC/GCP custody adapter, not installed — 2026-09-10

`communication-note-task-preview-gcp.server.ts` now implements the previously
abstract workload/provider ports behind the existing custody policy. Its factory
is inert; it is not imported by a product entry point, and all readiness flags
and `HOSTED_WORKSPACE_READ_BINDING` remain closed/undefined. The task-only WIF
provider, service account, HMAC key version and two regional secret versions are
**candidate source contracts**, not evidence that resources exist or authorization
to provision them. No shared M1u/job-status identity, secret or allowlist is reused.

An explicitly trusted host callback must await one delivery of its workload JWT.
The adapter locally verifies the RS256 signature with a pinned, canonical RSA
public key and exact issuer/audience/subject/key ID; it requires bounded fresh
claims and rejects alternate algorithms, remote key headers and audience arrays.
It then exchanges the JWT through the fixed Google STS endpoint and impersonates
only the task service account with a requested ten-minute access-token lifetime.
The STS request carries no Authorization header. Google credentials are confined
to one two-second custody operation, never cached or discovered from env/ADC.

Before any secret read, KMS must verify an independently supplied HMAC over the
canonical source/identity/policy/CA/Preview/OAuth binding and fixed resource set.
The exact numeric key version, success and all integrity flags are checked.
The intended runtime permission is verification only, never signing or key
administration. This code cannot establish that such IAM is actually installed.
Likewise, a valid JWT and signed manifest do **not** prove the running process is
the approved artifact: issuer-key provenance, trusted host token delivery and
actual source/CA provenance still require independently verified host binding.

Only fixed numeric regional Secret Manager versions can be read. Their names,
CRC32C-protected payloads and exact task/branch/CA or OAuth app/grant envelopes
must match before callback delivery. OAuth remains environment:read only; the
database password retains static source semantics (handoff expiry is not LOGIN
revocation). The connector still independently checks the actual branch before
requesting its password. Explicit Node HTTPS transport verifies TLS, refuses
redirects/retries, limits JSON and decoded-secret sizes, sanitizes failures and
destroys only owned requests on completion/abort. Owned byte buffers and handoff
fields are cleared; immutable JavaScript strings cannot be guaranteed erased.

Verification: **134 new passing cases**, including 132 adapter/crypto/transport
cases and two full service/issuer/broker/connector/policy/adapter compositions.
JWT signatures are generated and verified with actual local RSA keys; the KMS
test double checks an actual test HMAC, not an echoed VERIFIED value. Google
HTTPS, Supabase branch HTTP and PostgreSQL protocol replies are simulated.
Success and cancelled issuance both independently reverify seven control
operations, finalize the simulated lease and close every owned connection.
Negative coverage includes invalid signed claims/keys, altered manifest/CA/grant,
failed integrity, wrong secret target, malformed/oversized/redirected responses,
late or repeated token callbacks, consumer failure, timeout and independent
cleanup after cancellation. These are not live cloud/IAM/TLS/SQL/latency evidence.

Full suite: **5,856 passed / 54 skipped**, 315 passing / five skipped files.
TypeScript, full ESLint, 63-entry webpack build, 117-chunk client-boundary scan,
73-file adapter sync and whitespace checks passed. Existing unrelated React act
warnings remain. Review tightened canonical public-key and timestamp parsing and
cleared response buffers on failure; no blocking finding remains for this
uninstalled local scope. The previously blocked PG16 fixture was not retried.

Supabase guidance kept OAuth and database credentials separate and server-only;
Next.js guidance kept this Node adapter outside product/client entry points.
The implementation was checked against Google's
[STS token exchange](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token),
[service-account tokens](https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken),
[KMS MAC verification](https://cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/macVerify)
and [regional secret access](https://cloud.google.com/secret-manager/docs/reference/rest/v1/projects.locations.secrets.versions/access),
and the installed JOSE verifier contract. No real credential was obtained, cloud
resource created, IAM/database permission changed, migration run, model called,
Points/UI/Logo changed, commit made, branch pushed or deployment performed.

**Next:** after confirmation, locally commit the reviewed service-host, custody
policy and concrete-provider batches together; do not push or deploy. Authentic
host/identity/source binding, authenticated service transport, independent
supervision and real database/full migration-chain evidence remain separate
activation gates. Resource provisioning, IAM changes and a disposable Hosted
Preview require their own exact scope; this local implementation is not that
authorization.

Local commit handoff (2026-09-10): the user confirmed combining the three local
service-host/custody-policy/GCP-provider batches into one commit on
`codex/careslink-task-preview-control`, following the existing local service
commit `6d53325`. The reviewed scope is exactly 14 files. Fresh pre-commit checks
passed **5,856 tests / 54 skips**, TypeScript, full ESLint, the 63-entry webpack
build, 117-chunk client-boundary scan, 73-file adapter sync and whitespace checks,
including all eight newly added files. No implementation fix or expanded scope
was needed. Unrelated files in the parent workspace are excluded. The real
database/Hosted identity/supervision gates above remain unresolved and disabled;
the fixed PG16 fixture was not rerun. No push or deployment is authorized here.

**Next after separate confirmation:** publish the reviewed branch to
`Millionluna/Codex-Game-Studios` and create a Draft PR against
`codex/careslink-ai-documents-v1-auth-gate`. Include both the earlier local service
commit and this host/custody batch; disclose the remaining physical-test and
activation gates. Do not use the unrelated `Millionluna/Careslink` remote, merge,
deploy, provision resources, change IAM or activate product runtime bindings.

### PR #40 merged; authenticated task-service entry — 2026-09-10

The user authorized making PR #40 ready and merging it into the existing
`codex/careslink-ai-documents-v1-auth-gate` development branch. GitHub confirmed
merge commit `625d212`; its source tree matches reviewed head `a131f1c` exactly.
The task branch was retained. The current local branch was subsequently
fast-forwarded to that exact merge commit, with no source changes from the sync.
The connected Careslink AI Vercel project remained Git-unlinked; no deployment,
runtime activation or infrastructure change was requested or performed.

This local batch adds `communication-note-task-preview-transport.server.ts`:
an inert HTTP Request/Response handler for the dedicated service owner, **not an
installed listener or Next.js route**. Its two exact POST paths accept bounded
`application/jwt` bodies for task-list lease issue and revoke only. It rejects
Cookie/Origin/Bearer fallbacks, alternate paths/methods/targets, ambiguous lengths,
oversized/non-byte/invalid-UTF8 bodies and unexpected signed fields. Rejected or
cancelled request streams are released. Errors are content-free, responses are
no-store, and no CORS access is granted.

Each command is locally verified with an explicitly pinned RSA public key and
exact issuer, backend subject, audience, key ID and task-specific JWT type. The
signature binds the operation, exact Preview/scope and Cookie user/session to a
fresh random service-instance ID. This is a **delegated backend assertion**, not
direct verification of a Supabase user session: the independently trusted signer
must verify Cookie identity before issue and permit exact-scope cleanup after
page cancellation or session loss. No signing key, signer, OIDC fallback, remote
key discovery, Supabase Auth change or real credential is introduced.

Assertions have at most 30 seconds lifetime, at most ten seconds age, and at least
eight seconds remaining at admission. Issue/revoke each have a 256-entry replay
budget and four pending request slots; live IDs are never evicted to admit new
ones, and issue saturation does not consume revoke capacity. Check-and-consume
is atomic before custody IO. Timed-out pending work retains its slot until it
settles; its result cannot become success. Wall/monotonic clock divergence closes
this handler permanently. One handler is allowed per service object; a new
instance ID invalidates prior assertions after restart. These process-local
controls do not claim distributed replay persistence.

The seven-second request deadline fits within the existing eight-second caller
phase. Unknown, late, cancelled or malformed issue outcomes trigger independent,
bounded exact-scope revoke, never using the aborted page signal. Responses are
restricted to the validated scope and short-lived task credential or terminal
REVOKED receipt. Failed cleanup remains the service owner's durable-recovery
responsibility; a response lost after successful delivery still requires the
caller's finally-revoke and independent issuer maintenance. Owned buffer/copy
clearing does not promise erasure of immutable JavaScript strings.

Verification: **97 new passing tests**, including two compositions using the
actual service/issuer and a real one-use workspace lease. RSA signatures are real
local cryptography; HTTP Requests/Responses run in memory and the database ledger
is simulated. Coverage includes concurrent replay, instance binding, scope/claim
tampering, capacity isolation, body cancellation, late results, malformed receipts,
clock jumps and separate concurrent sessions. Final full suite: **5,953 passed /
54 skipped**, 316 passing / five skipped files. TypeScript, full ESLint, the
63-entry webpack build, 117-chunk client-boundary scan, 73-file adapter check and
whitespace checks passed. Existing unrelated React act warnings remain. Local
review tightened unread-body cleanup, byte/length validation and config parsing;
no blocking finding remains for this uninstalled local scope.

Supabase guidance preserved verified-user authorization and separation of user
JWTs from backend assertions; Next.js guidance kept the service outside public
routes and client bundles. Signature checking uses the installed JOSE verifier;
see [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts) and
[JOSE jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md).
The new readiness latch remains false and `HOSTED_WORKSPACE_READ_BINDING` remains
undefined. A Request URL labeled HTTPS is not TLS evidence. Private TLS, signer
and host/instance provenance, independent supervision and real SQL/full migration
chain evidence remain activation gates. The blocked PG16 fixture was not retried.
No UI/green branding, Points, AI call, Production data, migration, real permission,
cloud resource, new commit, push or deployment changed in this batch.

**Next local development:** implement the application-backend custody client for
this protocol: consume exact-command assertions from a separately trusted signer,
use a fixed authenticated HTTPS service/instance binding, validate bound responses,
and retain independent revoke without retries or fallback. Keep the caller free
of issuer/control imports and real private signing keys. Review the resulting
caller/entry batch together before a separately authorized publication; do not
activate product bindings or provision resources implicitly.

### Application-backend authenticated task client — 2026-09-10

The preceding next step is now implemented locally on `625d212`, together with
the still-uncommitted authenticated-entry batch. No new branch or commit was
created. `communication-note-task-preview-client.server.ts` supplies the existing
task-lease custody interface without importing the service host, issuer, control
opener, GCP provider or any database driver. Construction is inert and the client
readiness latch remains false. No product route or runtime binding is installed.

The new `communication-note-task-preview-protocol.server.ts` shares only wire
constants, scope/receipt grammar and assertion verification between entry and
client. The original issuer implementation is unchanged; parity tests preserve
the same Preview/purpose/role/identity/request-ID scope checks. The endpoint's
97 regression tests still pass after extraction, and it no longer imports the
issuer merely to parse a request.

Each client instance is bound to one already-verified Cookie principal and one
lease scope, with at most one issue and one revoke. It constructs a fresh exact
command containing operation, service origin/instance, scope, times and random
nonce, then consumes one assertion from a separately trusted signing provider.
The local RSA verifier checks the signature and complete command equality before
network IO. There is no private key, signer implementation, user-JWT/OIDC fallback,
remote key discovery, credential cache or implicit application authorization.
The host still has to establish signer/key and authenticated instance provenance.

HTTPS is a single explicitly owned Node request to one fixed DNS hostname and
standard TLS port. It uses only the pinned CA bytes (hash checked), hostname
verification and exact leaf public-key fingerprint, with TLS 1.2/1.3 and HTTP/1.1
ALPN. The request body is sent only after secureConnect confirms an authorized,
non-resumed socket and matching peer key. The same socket and identity are checked
again on response and completion. Agent:false avoids global-agent pooling and
environment-proxy configuration in the installed Node 22.23.2 runtime. No redirect,
retry, alternate destination, generic fetch, Cookie or Authorization fallback is
available. CA PEM wrapping differences are accepted without permitting appended
certificates/private keys or changing the exact input-byte hash requirement.

The 7.5-second operation deadline includes signing, TLS and response consumption
and fits inside the existing eight-second lease phase. Cancellation destroys
owned requests and suppresses late signer/results; wall/monotonic freshness is
checked again even after the signer finishes awaiting HTTP. Responses require
HTTP 200, no-store JSON, bounded headers/body, exact lengths and unambiguous JSON;
redirect/cookie/encoded responses, incomplete streams and unbound or malformed
credentials are rejected. Owned body buffers and failed-delivery credential copies
are cleared; immutable strings are not claimed erased.

Revoke can fence a scope whose issue outcome is unknown, including before issue.
It aborts a pending issue but uses the independently supplied cleanup signal.
Wrong-scope or duplicate calls do not cancel an already admitted issue or consume
the valid cleanup opportunity. There is no retry after a revoke attempt and no
physical-cleanup claim on failure. The existing workspace lease's finally phase
remains responsible for invoking revoke, while the dedicated service owner retains
durable maintenance/recovery after caller or service process loss.

Verification: **87 additional passing tests**; **184 client/entry tests** together.
Two new complete compositions exercise the actual client, authenticated entry,
service, issuer and one-use workspace lease for successful and cancelled reads.
Both follow issue → read → independent fence/finalize, leave zero simulated live
roles/sessions/memberships, clear the caller credential copy and keep the service
healthy. RSA signatures, X509 parsing, hostname and public-key checks use real
local primitives. Node HTTPS events/sockets and the SQL ledger are simulated:
this does **not** prove a real TLS handshake, external signer, actual SQL engine,
deployed private network, host watchdog or production readiness.

Final full suite: **6,040 passed / 54 skipped**, 317 passing / five skipped files.
TypeScript, full ESLint, the 63-entry webpack build, 117-chunk client-boundary scan,
73-file adapter synchronization and whitespace checks passed. Existing unrelated
React act warnings remain. Review fixed overly strict PEM wrapping and ensured
rejected duplicate calls cannot abort the admitted operation; their regression
tests pass. No blocking finding remains for the uninstalled local caller/entry
scope. The previously blocked real PG16 fixture was not rerun.

Supabase guidance kept backend assertions separate from verified user sessions and
database credentials; Next.js guidance kept the caller server-only and free of
control-plane imports. TLS verification follows the official
[Node HTTPS public-key pinning pattern](https://nodejs.org/api/https.html) and
[TLS hostname verification](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert).
No green UI/Logo, Points/payment, AI invocation, migration, database permission,
Production data, cloud resource, deployment, push or PR state changed.

**Next:** review and locally commit the combined authenticated entry/protocol/client
batch and its tests/evidence. Keep both endpoints and the product runtime disabled;
do not push or deploy in that step. Actual TLS/host/signer bindings, independent
supervision and real database/full migration-chain evidence remain activation
gates, not authorization to create cloud resources or change Production.

### Combined authentication batch local-commit review — 2026-09-11

The user authorized reviewing and locally committing the preceding client/entry
batch on `codex/careslink-task-preview-control`, based on `625d212`. Review covers
exact-command signature/scope validation, independent cancellation and cleanup,
bounded replay/IO, pinned TLS options and server-only import boundaries. No
blocking finding remains for this uninstalled scope; no implementation changes
were needed during this review. The eight-file commit scope is the client and
its tests, shared protocol, authenticated entry and its tests, service import
guard, client-bundle guard and this handoff document.

Fresh verification on 2026-09-11: **184 client/entry tests passed**; full suite
**6,040 passed / 54 skipped**, 317 passing / five skipped files. TypeScript,
full ESLint, the 63-entry webpack build, 117-chunk client-boundary scan and
73-file adapter synchronization passed. Existing unrelated React act warnings
remain. Local Git hooks contain only samples and no custom hooks path is set.

Supabase security guidance preserved the distinction between verified user
identity and delegated backend assertions; Next.js guidance preserved Node-only
execution and browser-bundle exclusion. The official Supabase changelog was
rechecked; none of the listed breaking changes requires modifying this batch.
No live database or TLS handshake evidence is claimed by these offline tests.
The client/entry readiness latches remain false and
`HOSTED_WORKSPACE_READ_BINDING` remains undefined. No push, PR change, deployment,
new cloud resource, real permission change, Production access, UI change or AI
invocation is included in this local-commit step.

**Next, with separate publication authorization:** push this reviewed local
commit to `Millionluna/Codex-Game-Studios` and create a draft PR against
`codex/careslink-ai-documents-v1-auth-gate`, retaining the uninstalled state and
explicit TLS/signer/host, independent-supervision and real database/full-chain
activation gates. Do not use `origin` (`Millionluna/Careslink`), merge or deploy.

### Backend assertion signer local adaptation — 2026-09-11

The preceding authentication/client batch was published and merged through
[PR #41](https://github.com/Millionluna/Codex-Game-Studios/pull/41) into
`codex/careslink-ai-documents-v1-auth-gate`. This implementation starts from local
merge commit `cec8664`, whose tree matches reviewed source commit `c84e0cf`.
This step adds only the previously agreed local signer adaptation and offline
tests; it does not authorize installing a signer or enabling the application.

`communication-note-task-preview-signer.server.ts` is an inert Node-only adapter
with `COMMUNICATION_NOTE_TASK_PREVIEW_SIGNER_READY = false`. The backend must
construct it once per lease after independently verified Cookie authentication,
pinning that user/session, the explicit non-Production project, service instance,
issuer/audience/subject and dedicated RSA public key. A principal-shaped object
alone is not authentication. No private key, key discovery, environment lookup,
SDK, network operation or product runtime binding is included in this module.

The adapter constructs the canonical protected header and exact JWS signing input
itself. Its injected dependency receives only the fixed RS256 algorithm, pinned
key ID and owned input buffer, and must complete exactly one awaited raw-signature
handoff. The actual RSA signature and full command are verified locally before
any assertion reaches the caller. There is no arbitrary payload/digest-signing
entry point, token cache or assertion return value. The shared protocol now
reuses exact unsigned claim/scope validation; received assertions still undergo
cryptographic verification first. Unsigned validation is explicitly not proof
of authenticity.

Each provider admits at most one issue and one exact-scope revoke, using distinct
nonces. Revoke can precede an unknown issue and remains available after page
cancellation. Invalid or duplicate calls do not abort an already admitted issue
or consume its valid cleanup opportunity. Signing has a two-second deadline;
the complete operation, including the assertion consumer, is bounded at 7.5
seconds with cancellation, monotonic/wall-clock and freshness checks. Missing,
duplicate, unawaited, invalid, late or throw-after-handoff signatures never reach
the caller. Owned buffers/references are cleared, without claiming erasure of
immutable strings or dependency copies. Already-started consumer IO is not
rolled back: caller finally-revoke and independent service recovery remain
mandatory.

Verification: **72 new signer tests** and **two new composed failure tests**;
**258 signer/client/entry tests passed**. Four compositions now exercise the
actual signer, client, authenticated entry, service, issuer and workspace lease
for success, cancellation after read, signing failure and cancellation during
signing. The latter two send no issue assertion and never open the read port;
independent revoke still completes fence/finalize. All four leave zero simulated
live roles/sessions/memberships. RSA signing and verification use temporary,
locally generated 2048-, 2049- and 4096-bit keys; no deployment key is loaded. HTTPS
events/sockets and the SQL ledger remain simulated, so these tests do not prove
an actual TLS handshake, external signing service, SQL engine or hosted recovery.

Final full suite: **6,114 passed / 54 skipped**, 318 passing / five skipped files.
TypeScript, full ESLint, the 63-entry webpack build, 117-chunk client-boundary
scan, 73-file adapter synchronization and whitespace checks passed. Existing
unrelated React act warnings remain. Review corrected non-byte-aligned RSA
signature sizing and covered elapsed deadlines even before timer callbacks run.

Supabase guidance kept verified user identity separate from backend assertions;
Next.js guidance kept the adapter server-only and excluded from browser bundles.
The cryptographic framing follows [JWS](https://www.rfc-editor.org/rfc/rfc7515.html)
and [RS256](https://www.rfc-editor.org/rfc/rfc7518.html#section-3.3). The existing
client/entry readiness flags remain false and `HOSTED_WORKSPACE_READ_BINDING`
remains undefined. No UI/Logo, Points/payment, AI call, migration, database role,
Production data, cloud resource, dependency, deployment or remote Git state was
changed. The implementation step did not create a commit.

**Next:** review and locally commit this signer batch and its evidence, without
push, deployment or activation. Actual key custody and authenticated-principal
binding, private TLS/host/instance provenance, independent supervision and real
database/full migration-chain evidence remain separate activation gates. The
previously blocked PG16 fixture was not retried and no fallback Preview created.

### Backend signer local-commit review — 2026-09-11

The user authorized reviewing and locally committing the six-file signer batch
on `codex/careslink-task-preview-control`, based on `cec8664`. Review covered
exact-command/public-key validation, one-use scope binding, signature handoff,
deadlines, cancellation-independent cleanup and server-only import boundaries.
No blocking finding remains for the uninstalled scope; no implementation change
was needed in this review. The commit includes the signer and its tests, client
composition tests, shared protocol, client-bundle guard and this evidence.

Fresh verification: **6,114 passed / 54 skipped**, 318 passing / five skipped
files. TypeScript, full ESLint, the 63-entry webpack build, 117-chunk client-boundary
scan, 73-file adapter synchronization and whitespace checks passed. Existing
unrelated React act warnings remain. Supabase guidance preserved the distinction
between user authentication and delegated backend signatures; Next.js guidance
preserved Node-only execution and browser-bundle exclusion. Git hooks contain
only samples and no custom hook path is configured. The readiness flags and
undefined product binding remain unchanged; no external key, database, cloud
resource, Production access, push, deployment or feature activation is included.

**Next, with separate publication authorization:** push the reviewed local
commit to `Millionluna/Codex-Game-Studios` and create a draft PR against
`codex/careslink-ai-documents-v1-auth-gate`. Do not use `origin`
(`Millionluna/Careslink`), merge or deploy. The previously documented real-key,
authenticated-principal, TLS/host, supervision and database evidence gates remain.

### PR #42 merged; request-local authenticated task assembly — 2026-09-11

The signer batch was published and merged through
[PR #42](https://github.com/Millionluna/Codex-Game-Studios/pull/42). Merge commit
`3d5a568bfa975a7f63b4e73ffc8f15407470244d` has the same code tree as reviewed
`31fc94d`. This batch starts from that merge in the new task worktree on
`codex/careslink-workspace-request-auth`; the original
`codex/careslink-task-preview-control` worktree remains unchanged at `31fc94d`.

`communication-note-workspace-task-client.server.ts` supplies an uninstalled
server-only assembly for the existing workspace handler and durable Cookie /
current-session resolver. It accepts only explicit fixed non-Production target,
database CA, service CA/SPKI, issuer/key/instance and signing-dependency bindings.
There is no public principal input, assertion endpoint, credential discovery,
global registration or product installation. Construction snapshots public
configuration without creating a user client or invoking Auth/signing/network IO.
The client's existing host/CA validation is shared through an IO-free snapshot
helper, so assembly and each client use the same validation rules.

The existing Preview composition now additionally supports a synchronous,
server-owned custody factory. Only the durable runtime's authenticated read path
calls it, after current-session verification. Every read creates a fresh signer
and HTTP client pinned to that verified user/session and fixed service instance;
the runtime still exposes only principal resolution and request-bound readers.
Repeated factory returns of the same custody object are rejected using weak
identity tracking, without a global lease/credential map. The prior explicit
multi-lease custody binding remains supported. Function references and CA bytes
are snapshotted, and configuration is rechecked after factory construction.

The existing single-use lease and PG17 reader continue to own the fixed metadata
query and physical-session cleanup. Revoke retains its independent signal after
page cancellation, logout, configuration drift or signing failure. Successful
metadata remains withheld until cleanup, terminal revoke and the final
current-session check succeed. Failed revoke is not a cleanup acknowledgment;
independent service supervision remains mandatory.

Verification: **45 new passing tests** (35 authenticated assembly compositions /
boundaries and ten custody-factory cases); **362 focused tests passed** across
five signer/client/entry/composition files. Coverage includes sequential refresh,
two concurrent users, changed user/session, missing/revoked Auth, caller-supplied
identity and transport rejection, logout/cancellation/configuration drift during
read, signature failure/timeout, failed terminal revoke, reused custody, mutated
binding and all-flags-enabled formal-route nonactivation. Import guards now
allow only the exact new uninstalled assembly and still reject a product importer.

Final full suite: **6,159 passed / 54 skipped**, 319 passing / five skipped files.
TypeScript, full ESLint, the 63-entry webpack build, 117-chunk client-boundary
scan, 73-file adapter synchronization and whitespace checks passed. Existing
unrelated React act warnings remain. Validation used Node 22.23.2 and existing
installed dependencies copied into this worktree; the pre-existing process test's
parent-provided esbuild 0.25.12 and platform binary were also copied locally.
No package manifest/lockfile or source-worktree dependency was changed, and no
environment file was copied.

These tests execute the real source Auth/session resolver, signer, client,
authenticated entry, service/issuer, lease and PG cleanup implementations. External
Auth replies, HTTPS events and SQL/PG results are simulated; RSA signatures use
temporary locally generated keys. This does not establish live Cookie identity,
actual TLS/SQL, installed key custody, instance provenance or hosted recovery.
Supabase's current changelog and SSR/session guidance were checked; Next.js
guidance preserved Node execution and the server/client boundary. The blocked
PG16 fixture was not retried and no replacement Preview was created.

`COMMUNICATION_NOTE_WORKSPACE_TASK_CLIENT_READY` and the existing readiness flags
remain false; `HOSTED_WORKSPACE_READ_BINDING` remains undefined. No UI, Logo,
three-language content, real care data, AI call, Points/payment, schema/role/IAM,
real key, cloud resource, deployment or feature activation is included.

Local review completed on 2026-09-11 with no blocking findings for this
uninstalled scope. Review traced verified request ownership into each fresh
signer/client, configuration and callback snapshots, fixed host validation,
independent finally-revoke, cleanup-failure data suppression and exact import
boundaries. Existing tests cover these paths with the simulated external
boundaries stated above. No applicable engine or ADR reference was found.
Implementation and tests were unchanged during review; passing test/build
evidence was retained, and adapter synchronization and whitespace checks were
rechecked for the authorized ten-file local commit. The original source worktree
remains clean at `31fc94d`. This step includes no remote publication or deployment.

**Next:** separately authorize publishing this reviewed local commit as a new
draft PR to `Millionluna/Codex-Game-Studios` against
`codex/careslink-ai-documents-v1-auth-gate`. Actual key custody, external
authenticated-identity/host binding, independent recovery and real database/full
migration-chain evidence remain activation conditions, not authorization to
provision or enable anything.

### PR #43 merged; uninstalled dedicated HTTPS service host — 2026-09-11

[PR #43](https://github.com/Millionluna/Codex-Game-Studios/pull/43) was merged as
`2da9e35d533f55445c2e5bc8a12a302d94e2386c`. Its tree matches reviewed `96a8abd`.
The current worktree was aligned to that merge, then this local development
batch started on `codex/careslink-task-preview-https`. The original source
worktree remains clean on `codex/careslink-task-preview-control` at `31fc94d`.

`communication-note-task-preview-https.server.ts` adds a dedicated Node HTTPS
assembly around the existing authenticated endpoint and service lifecycle.
Construction snapshots explicit service/identity, listener and TLS bindings,
without listening, starting recovery or registering process handlers. It checks
the leaf certificate's exact DNS SAN, validity, certificate/SPKI hashes and
matching RSA private key; the TLS key must differ from the assertion-signing key.
Bindings accept a loopback test port or a private IPv4 address on port 443. They
do not establish workload/host provenance or authorize an installed listener.

Start waits for service recovery before listening. The existing dedicated
process owner can own this assembly's start/stop/health/finished interface.
Explicit stop closes admission and the endpoint, destroys owned connections
including incomplete handshakes, and starts service drain independently of
request cancellation. Completion joins listener closure with the service's
cleanup outcome. Startup/drain are bounded to 35 seconds, inside the existing
40-second process-owner ceiling. Unknown drain outcomes remain failed, and a
late successful result cannot retroactively change the reported outcome.

TLS is restricted to 1.2/1.3, exact SNI and HTTP/1.1 ALPN. The listener caps raw
connections at 16, handshake/header waits at one second, requests at seven
seconds and each connection at 7.5 seconds. It accepts only the two exact signed
POST paths, a fixed Host and explicit bounded Content-Length. Raw duplicate or
unknown headers, Cookie/Bearer/forwarded identity, transfer encoding, alternate
targets, upgrades, CONNECT and expectation negotiation are rejected. Header
count is rejected explicitly rather than silently truncated; bytes are also
bounded. Each connection handles at most one request. The raw connection cap is
shared; it does not promise a reserved network slot for cleanup callers.

Responses retain bounded JSON/no-store framing and no credential logging. A
successful issue response that fails before flush stops the host and drains the
service. A response lost after flush still requires the existing caller's
finally-revoke and independent durable recovery. Owned PEM and request/response
buffer copies are cleared; native TLS state and immutable copies are not claimed
to be erased. No certificate issuance or external key discovery is added.

Verification: **50 new passing tests** and **205 focused tests passed** across
HTTPS, host, transport and service files. Actual Node TLS sockets use a temporary
local CA/leaf certificate and loopback ephemeral ports; the tests verify CA/SPKI,
SNI/ALPN rejection, signed issue/revoke, concurrent scopes/replay, raw malformed
requests, slow headers/body, handshake/connection caps, disconnect propagation,
failed response flush, conflicting bind, pending/failed drain and lifecycle
deadlines. The existing process-owner code is composed with the real listener,
using a simulated process-signal emitter for that test. Existing real child-
process tests remain separate. The issuer ledger/SQL boundary is simulated;
these tests do not establish live Supabase Auth, real database cleanup, hosted
TLS/key custody, private-network reachability or external supervision. The
request-local workspace client remains covered by its separate composition tests.

Final full suite: **6,209 passed / 54 skipped**, 320 passing / five skipped files.
TypeScript, full ESLint, webpack build (63 entries), client-boundary scan (117
chunks), adapter synchronization (73 files) and whitespace checks passed.
TypeScript was rerun after the build completed to avoid racing generated Next
types. Existing unrelated React act warnings remain. Tests used Node 22.23.2 and
the existing dependencies; local TLS required permission beyond the default
sandbox's loopback-listen restriction. All temporary TLS fixture directories
were removed. The blocked PG16 fixture parameter was explicitly unset for the
full suite; the fixture was not retried and no replacement Preview was created.
Implementation followed the [Node 22 HTTPS interface](https://nodejs.org/download/release/v22.17.0/docs/api/https.html)
and [HTTP timeout/connection-close semantics](https://nodejs.org/download/release/latest-jod/docs/api/http.html).

The new HTTPS readiness flag and all existing readiness flags remain false;
`HOSTED_WORKSPACE_READ_BINDING` remains undefined. Exact import guards allow only
this uninstalled composition, which itself has no product importer. No UI/Logo,
three-language content, real care data, AI call, Points/payment, database role,
migration, IAM, installed key, cloud resource, deployment or activation changed.
No package manifest, lockfile or environment file changed.

Local commit review on 2026-09-11 found no blocking implementation issue for the
uninstalled scope. Review strengthened existing tests: raw-request and TLS
rejection cases now carry valid signed assertions; a valid additional TLS request
proves connection-cap rejection; test timeouts are no longer treated as expected
TLS rejection. Partial-body and pipelining cases also include a valid assertion
that must not reach custody. The HTTPS implementation remained unchanged.
Review reruns passed: 205 focused tests, 6,209 full-suite tests / 54 skipped,
TypeScript and changed-test ESLint. Existing build/client-bundle evidence remains
applicable. No applicable engine or ADR
reference was found; the six-file scope and original source worktree are intact.

**Next, after this authorized local commit:** separately authorize publication
to `Millionluna/Codex-Game-Studios` as a draft PR against
`codex/careslink-ai-documents-v1-auth-gate`. This review/commit step includes no
push or deployment. Real identity/key/host provenance, independent supervision
and database/full migration-chain evidence remain activation conditions.

### PR #44 merged; local workspace/TLS/process integration — 2026-09-11

[PR #44](https://github.com/Millionluna/Codex-Game-Studios/pull/44) merged as
`84ed8de3979289981f5affc06ce92e8d1b589b4d`, with the same tree as reviewed
`4f11fbb`. The current worktree was aligned to that merge and this local batch
started on `codex/careslink-task-https-integration`. The original source worktree
remains clean on `codex/careslink-task-preview-control` at `31fc94d`.

The previous workspace assembly used simulated HTTPS events, while actual TLS
and actual child-process lifecycle tests were separate. The new
`communication-note-workspace-task-https.process.test.ts` and test-only
`scripts/preview-e2e/communication-note-task-https-local-child.mjs` join these
boundaries. No production implementation or configuration change was required.

The actual workspace handler, current-session resolver, request-local signer,
HTTP custody client, task lease and PG reader lifecycle execute in the parent.
The child bundles the actual HTTPS endpoint, service/issuer and dedicated process
owner. Only external Auth replies, PG query/session results and the issuer
ledger protocol are simulated. The parent retains that simulated ledger across
child termination; this is not PostgreSQL persistence or physical role cleanup.

Requests use real Node HTTPS sockets and locally generated temporary CA/leaf
certificates. A test-only address adapter maps the fixed `.invalid` origin to
the child's `127.0.0.1` ephemeral port, retaining the canonical Host, SNI,
CA/SPKI validation, ALPN and cancellation behavior. It does not simulate TLS
events or relax the production client. The fixture proves local wire behavior,
not real DNS, private-network reachability or port-443 deployment. Child startup
uses an isolated environment and no database fixture option or credential.
Temporary TLS material is removed after actual process closure; owned key buffers
are cleared. Test child stdout/stderr must remain empty, and SCRAM verifiers
are excluded from the simulated ledger IPC payload.

**25 new integration tests passed.** They cover refresh and concurrent users;
missing/revoked identity, changed session and cross-principal client rejection;
logout/cancellation and issue-signing failure with independent revoke;
successful metadata withheld until the real HTTPS revoke reply; real
SIGTERM/SIGINT with an issued lease; listener closure preceding a pending drain
acknowledgment; real SIGKILL after simulated issue/fence commit; recovery before
a successor opens its TLS listener; lost issue reply; failed revoke/drain and
recovery; failed startup; stale instance, wrong CA/SPKI and invalid local address
mapping rejection using valid assertions; and formal-route nonactivation.
Tests use actual close events and exit codes, and reject test timeouts rather
than treating them as denial or cleanup evidence.

The first IPC-loss run exposed a Node 22.23.2 parent-disconnect limitation:
`ChildProcess.disconnect()` produced disconnect/exit and closed stdout/stderr,
but no ChildProcess close event. The observed behavior matches the open
[Node issue #65646](https://github.com/nodejs/node/issues/65646).
The final fixture closes the real IPC channel from the child, exercising the
production owner's native disconnect handler and retaining the parent's actual
close event. With the simulated broker connection gone, cleanup remains
unconfirmed and the child exits with code 1; a fresh child recovers the retained
ledger. This proves child-initiated IPC loss, not parent-initiated disconnect or
actual parent death. The parent-initiated close boundary remains unverified on
this Node version. No Node patch, fabricated close event or exit-only substitute
was introduced, and no timeout was counted as cleanup acknowledgment.

Verification: **433 focused tests passed / one existing test skipped** across
nine workspace/client/signer/HTTPS/host/service/transport files. Final full
suite: **6,234 passed / 54 skipped**, 321 passing / five skipped files. TypeScript,
full ESLint plus final changed-file lint, webpack build (63 entries),
client-boundary scan (117 chunks), adapter synchronization (73 files) and
whitespace checks passed. TypeScript ran after the build to avoid generated-type
races. Existing unrelated React act warnings remain. Validation used Node
22.23.2 and existing dependencies; the temporary certificate fixture requires
`/usr/bin/openssl` and the process suite is POSIX-only. No dependencies changed.

The complete suite explicitly unset `CARESLINK_TASK_ISSUER_LOCAL_SOCKET`; the
blocked PG16 fixture was not retried and no replacement Preview was created.
The [Supabase changelog](https://supabase.com/changelog) and
[current-session guidance](https://supabase.com/docs/guides/auth/sessions) were
checked; external Auth remains simulated and the existing session recheck is
preserved. Next.js runtime guidance kept the process owner outside the product
web process. Node's [child-process lifecycle documentation](https://nodejs.org/download/release/v22.17.0/docs/api/child_process.html)
informed the distinction between exit, stdio closure and close acknowledgment.

All readiness flags remain false and `HOSTED_WORKSPACE_READ_BINDING` remains
undefined. Hosted identity/key/workload provenance, independent external
supervision and actual database/full migration-chain evidence remain unresolved.
This batch includes no UI/Logo/three-language content changes, real care data,
AI call, Points/payment, database role/migration, IAM, installed signing key,
cloud resource, deployment or activation. No environment file changed.

Local review on 2026-09-11 found no blocking issue for this uninstalled
test/evidence scope. Review traced actual Node HTTPS transport, process closure,
independent drain, fixed local address routing, isolated child configuration and
temporary-key cleanup. The tests now also require explicit issue/revoke network
attempts for stale-instance and CA/SPKI rejection, and check complete principal
bindings and distinct request IDs for refresh/concurrent reads. This prevents
empty-array checks from standing in for the claimed transport evidence.
No production code changed. No configured engine or applicable ADR reference was
found. The IPC trigger limitation remains explicit rather than being treated as
parent-death coverage.

Review verification passed: 25 integration tests, the full suite with 6,234
passed / 54 skipped, TypeScript and changed-file ESLint. Existing build and
client-boundary results remain applicable because
only test assertions and this handoff changed. The three-file local commit
retains all disabled readiness flags and the untouched source worktree.

**Next, after this authorized local commit:** separately publish the reviewed
commit as a draft PR to `Millionluna/Codex-Game-Studios`, based on
`codex/careslink-ai-documents-v1-auth-gate`. This step includes no push, merge,
deployment or activation.

### PR #45 merged; independent process-exit observation probe — 2026-09-11

[PR #45](https://github.com/Millionluna/Codex-Game-Studios/pull/45) merged as
`c92eea8786333ccf21e3c100dc649c64a228dd74`. Its tree
`03eb93b393be5a97ab3b37fffc4b6cc68c5ae14c` is identical to reviewed `69ab617`.
The current worktree was aligned to that merge, then this authorized local
batch started on `codex/careslink-task-process-observation`.

The minimal probe answers one missing question: can an observer that survives
the launcher independently confirm the service process's exit after the
launcher actually terminates? On this macOS host, the answer is **yes**, using
a pre-registered `kqueue` process filter. This is a local feasibility result,
not an installed supervisor or a claim about PostgreSQL cleanup.

The test controller owns two separate children: a Node launcher and a Python
observer. The launcher forks the service. The service runs the actual
`ownTaskPreviewServiceProcess` with a simulated service lifecycle and a real
loopback TCP listener. Parent/child IPC is fd 3; an independently inherited
test-control channel is fd 4. The latter remains open across launcher death
so the controller can hold and release explicit drain/exit barriers. It is a
test capability and is not evidence that a deployed control plane survives.

The observer registers `EVFILT_PROC` / `NOTE_EXIT` before launcher termination.
After registration, the controller challenges the service through its original
IPC channel and checks the fixture nonce, child PID and parent PID. The observer
reports a matching kernel event; it does not signal a PID, poll process names,
reap an orphan, infer an exit code, or fabricate a Node close event. Apple
documents [the process filter and exit notification](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kevent.2.html);
the Python API is described in [select / kqueue](https://docs.python.org/3.9/library/select.html).

**Seven new tests passed.** Normal launcher termination is an explicit exit with
code 0; abnormal termination sends actual SIGKILL through the controller's
owned launcher handle. Both cases produce real child IPC loss, stop the real
listener, and retain the service behind a drain barrier. A refused connection,
parent exit or IPC EOF cannot open the successor gate. Even after the simulated
owner reports confirmed cleanup, the service remains alive behind the exit
barrier and the gate stays closed. Only the matching kernel notification,
successful observer completion, actual launcher/stdio closure, control-channel
closure and confirmed simulated cleanup permit one successor to start.

The other cases preserve failure after unconfirmed cleanup, zero-time observer
timeout, and actual observer SIGKILL. For timeout and observer loss, a separate
observer is used solely for teardown: even after the target and all channels
are closed and simulated cleanup succeeds, its evidence cannot replace the
failed observer in the original successor gate. Product import guards verify
that neither probe entry point is installed in application code.

Local review found and fixed a completion-channel validation gap: the original
successor guard could accept earlier valid messages even after the same stream
reported a parsing error. A new real-process regression sends malformed JSON
after confirmed simulated cleanup and before actual control-channel EOF. The
old guard admitted a real successor; the regression joined and cleaned up that
successor before reporting failure. The revised guard rejects sticky errors
from all three evidence channels and errors on either owned process handle.
The regression now passes even though genuine kernel exit, descriptor closure
and simulated cleanup evidence are all present.

The initial run found that the system Python 3.9.6 `kqueue` object does not
support a `with` context manager. That run failed without producing exit
evidence. The helper now closes the queue explicitly in `finally`; tests also
close both sides of the independent control channel. This changes only the
test fixture. The previously recorded Node parent-disconnect limitation is
not relabeled as fixed, and parent-initiated `ChildProcess.disconnect()` remains
a separate unverified boundary.

Verification on macOS / Node 22.23.2 / system Python 3.9.6: **39 passed / one
existing test skipped** across the new probe, existing host-process tests and
Workspace/TLS process integration tests. Full suite: **6,241 passed / 54
skipped**, 322 passing / five skipped files. TypeScript, changed-file ESLint,
adapter synchronization (73 files) and whitespace checks passed. This batch
adds only test fixtures, a test file and this handoff; the prior unchanged
production build/client-boundary evidence remains applicable.

The test suite explicitly unsets `CARESLINK_TASK_ISSUER_LOCAL_SOCKET` and does
not retry the blocked PG16 fixture. New successful runs await real process and
channel closure before deleting their temporary bundles. Fixture deadlines
are forced failure, never cleanup acknowledgments. No certificate, credential,
Auth reply, SQL result or lease ledger is needed by this minimal probe.

Limits: this mechanism is macOS-specific and the suite is skipped elsewhere.
It does not verify Linux/Windows supervision, actual service/issuer recovery,
the combined Workspace/TLS chain under launcher death, live Auth, physical SQL
cleanup, host/workload/key provenance, or an independent deployed supervisor.
The simulated cleanup flag is explicitly distinct from the kernel exit event.
All readiness flags remain false and `HOSTED_WORKSPACE_READ_BINDING` remains
undefined. No product implementation, dependency, environment file, source
worktree, cloud resource, database role/migration, IAM, installed key, real care
data, AI call, Points/payment, deployment or activation changed.

Local code review is complete after the correction above, with no remaining
blocking findings for this test-only scope. The seven tests cover the stated
acceptance boundaries using explicit lifecycle barriers and real process/
channel events. No engine is configured and no applicable ADR reference was
found. The probe introduces no production dependency or runtime installation;
the existing architecture and readiness limits remain applicable.

**Next, after this authorized local commit:** publish the reviewed four-file
commit as a draft PR to `Millionluna/Codex-Game-Studios`, based on
`codex/careslink-ai-documents-v1-auth-gate`. Publication is a separate batch.
Then use the probe's explicit observation boundaries to scope integration
with the actual Workspace/TLS service and retained simulated ledger; do not
count this minimal probe as that integration or as production readiness.

### PR #46 merged; Workspace/TLS recovery after actual launcher death — 2026-09-11

[PR #46](https://github.com/Millionluna/Codex-Game-Studios/pull/46) merged as
`d9bdec51855234f1559113f6681a96672a9e3f20`; its tree
`8ff8323a855df4c9833bcd5ad471ff9b68a3ad32` matches reviewed `dad443d`.
The authorized local implementation uses
`codex/careslink-workspace-task-parent-exit` and the scope in
[the parent-exit QA plan](communication-note-workspace-task-parent-exit-qa-plan.md).

The new fixture combines the actual Workspace client/handler, HTTPS service,
issuer lifecycle and process owner. A disposable Node launcher sits between
the test controller and service. The controller retains the same simulated
ledger Map across generations. Broker calls still traverse launcher IPC;
launcher death really removes that broker path. An independently inherited
fd 4 carries only test identity/lifecycle messages and explicit barriers, never
replacement SQL/broker replies. The unchanged Python observer is owned by the
surviving controller and registers kernel exit observation before termination.
The original service identity is challenged over its original IPC after arming.

**Thirteen new process tests passed.** Four cases cross normal launcher exit
with actual SIGKILL, each at a real request's committed issue/fence checkpoint.
The interrupted Workspace request returns 503 without task metadata. Native
IPC loss triggers the actual service owner; HTTPS closes its listener and
requests. The old owner reports FAILED with cleanup unconfirmed because its
broker connection is gone. The old ISSUED/FENCED lease stays in the original
Map. No lease is re-seeded or erased to manufacture successful recovery.

The combined fixture distinguishes permission to **start a recovery process**
from permission to **listen for requests**. It requires matching kernel exit,
successful completion of the original observer, actual launcher/control/HTTPS
closure, valid evidence channels and settled old RPC/request work before one
recovery process can start. An explicit exit-release event must also precede
closure; a fixture watchdog exit cannot stand in for the completed protocol.
Old cleanup remains unconfirmed throughout. The PR #46 strict successor guard
is unchanged and would still reject that old cleanup outcome.

The actual issuer/service/HTTPS startup path then supplies the second condition.
Each core case holds the successor's inventory operation and later its
committed finalize reply. Inspection at both barriers observes no listening
TCP server, no advertised address, no ready event and no new issue. Even zeroed
simulated lease counts do not release readiness while the finalize reply is
held. Only after actual recovery runs start/inventory/fence/finalize/ready does
the HTTPS adapter listen with a new instance ID.

Every core case then sends correctly signed old-instance assertions to the
successor's **new** TLS address with valid CA/SPKI and handshake properties.
They are rejected without new issuance. Fresh bindings return the synthetic
user's task through Workspace and actual HTTPS issue/revoke. Holding the
finalize reply proves successful task metadata is withheld until the real
HTTPS revoke reply confirms simulated cleanup. The PG reader's mock objects
also record end/destroy and cleared credential references; these remain
object-lifecycle observations, not physical database cleanup evidence.

The other nine cases cover a still-live service after native IPC loss and
listener/owner completion, observer timeout or actual observer SIGKILL,
malformed completion frames after valid evidence, recovery failure at
inventory/finalize/ready, generation-bound delayed replies, and product import
guards. A held old RPC blocks recovery startup until it settles. Its reply
closure remains tied to the retired handle/nonce and cannot satisfy the new
generation. Teardown-only observers never replace original failed evidence.

Initial full-suite validation exposed two test sequencing failures. The new
port probe could run after IPC disconnect but before HTTPS listener closure,
returning ECONNRESET. It now waits for the real owner's completion, which joins
HTTPS listener closure, before checking connection refusal. A pre-existing
HTTPS autonomous-stop test could request service stop after client response
end but before the server's response finish. That test now waits for the real
ServerResponse finish and its promise continuations, then requests stop. Its
STOPPED/confirmed-cleanup/restart-rejection assertions remain intact; the
response status is additionally checked. Neither fix changes production code,
manufactures an event, accepts a reset as confirmed closure, or extends a
production timeout.

Final validation: **102 passed / one existing skip** across the new suite and
four related TLS/process suites. Full suite: **6,254 passed / 54 skipped**,
323 passing / five skipped test files. TypeScript, changed-file ESLint and
adapter synchronization (73 files) passed. Production source and dependencies
are unchanged, so the existing build/client-boundary evidence remains
applicable. The original 25 Workspace/TLS tests and seven minimal process
observer tests remain unchanged and pass.

The new suite is explicitly macOS-only. Auth, SQL results and ledger state
remain simulated; the controller survives these tests. Actual PostgreSQL
durability/cleanup, Linux/Windows observation, controller/host death,
parent-initiated disconnect's previous Node close limitation, real workload/
key provenance and deployed supervision remain unverified. All readiness
flags stay false and HOSTED_WORKSPACE_READ_BINDING stays undefined. No blocked
PG16 retry, replacement Preview, source-worktree change, real care data, AI
call, Points/payment, database role/migration, IAM/key installation, cloud
resource, deployment or activation is included.

The five-file local review is complete: **APPROVED WITH SUGGESTIONS**, with no
required changes. It checked the actual lifecycle implementations, both
recovery conditions, original observer failure retention, delayed RPC binding
and resource teardown. No referenced ADR or configured engine applies. The
concentrated test-protocol/recovery predicates remain a readability suggestion;
no production behavior or already-validated test changed during review. The
QA plan records the findings and verified final logs. This review record is
included in the local commit; publication has not occurred.

**Next:** push the reviewed local commit to `Millionluna/Codex-Game-Studios`
on `codex/careslink-workspace-task-parent-exit` and create a draft PR against
`codex/careslink-ai-documents-v1-auth-gate`. Publication is a separate step.

### PR #47 merged; parent-initiated IPC disconnect diagnostic plan — 2026-09-11

[PR #47](https://github.com/Millionluna/Codex-Game-Studios/pull/47) completed
draft publication, final diff review, ready-for-review transition and ordinary
merge to `codex/careslink-ai-documents-v1-auth-gate`. It merged at
`2026-09-11T11:09:00Z` as `c5a366c3078eaed5de2e3940aa06d9a62affd3b6`, with
parents `d9bdec51855234f1559113f6681a96672a9e3f20` and reviewed
`c80f11701dfcfb2c92737c6a05e2a4cf5e49f660`. Its tree
`6b8dfcf8601420e6680647fea40f094cfdafc2c7` exactly matches the reviewed head.
The verified merge contains five files, 931 insertions and one deletion.

GitHub reported MERGED; no GitHub check runs or reviews were present at the
final pre-merge check. Local evidence remains 102 related tests passed / one
existing skip, and 6,254 full-suite tests passed / 54 skipped. TypeScript,
changed-file ESLint, adapter synchronization and whitespace checks had passed.
The remote PR patch matched the reviewed local patch before promotion. These
are the merged batch's results, not new verification of the next stage.

The current worktree now starts from the verified merge on
`codex/careslink-workspace-task-parent-disconnect`. The separate source worktree
remains at `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9` without changes.

The authorized planning step selects the already-recorded **parent-initiated
ChildProcess.disconnect() while the launcher remains alive** boundary.
PR #45 covered child-initiated IPC loss and PR #47 covered actual launcher
death. The next diagnostic should establish the missing trigger's own event
sequence instead of treating either earlier path as its evidence.

The new [parent-disconnect QA plan](communication-note-workspace-task-parent-disconnect-qa-plan.md)
defines an estimated ten local tests: parent/child disconnect controls, actual
Workspace issue/fence interruption, the still-live service exit barrier,
observer timeout/SIGKILL, corrupted control evidence, a delayed old RPC reply,
and formal-runtime/import boundaries. Actual modules remain in use, while
Auth, PG replies and the controller-owned ledger remain simulated.

The diagnostic separates original kernel exit verification, the service's
native ChildProcess close event, actual pipe closure, owner cleanup and
teardown-only evidence. The launcher owns separate service stdout/stderr
pipes and stays alive through observation. A bounded close observation window
may report NOT_OBSERVED_IN_WINDOW, never an inferred close acknowledgment or
recovery permission. Test-resource disposal can use verified process/pipe
closure without rewriting the separately recorded Node close limitation.

Node 22.23.2 remains installed. Its
[official lifecycle documentation](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html#event-close)
and the still-open [Node issue #65646](https://github.com/nodejs/node/issues/65646)
were checked on 2026-09-11. They inform this diagnostic design; no new local
reproduction has run in this planning step. The plan neither patches Node nor
adds a successor-start policy, and both prior recovery guards stay unchanged.

This batch edits only this handoff and adds the QA plan. No new process/TLS
tests, production changes, commits, pushes or deployments are included in the
planning step. The blocked PG16 fixture is not retried and no replacement
Preview is created. Real database cleanup/durability, controller/host death,
other platforms, installed identity/key provenance and deployed supervision
remain unverified. All readiness flags stay false and
HOSTED_WORKSPACE_READ_BINDING stays undefined.

**Next:** implement the bounded local diagnostic fixture and estimated ten
tests from the plan, beginning with parent/child disconnect controls and their
actual resource teardown; then validate the request/failure matrix before
code review and a local commit.

### Live-parent IPC disconnect diagnostic implemented locally — 2026-09-11

The [parent-disconnect QA plan](communication-note-workspace-task-parent-disconnect-qa-plan.md)
is now implemented in a new test-only launcher/service fixture and a ten-test
Workspace process suite. The four-file batch includes those two files, the
plan and this handoff. Its local commit on
`codex/careslink-workspace-task-parent-disconnect` is based on merged `c5a366c`;
publication is a separate step.

The launcher owns the actual service process and separate stdout/stderr/fd-4
pipes. It installs native disconnect/exit/close and pipe end/close listeners
before startup, binds forwarded evidence to the original nonce/PIDs and
monotonic message sequences, and stays alive after the service exits. The
controller challenges both original service identity after observer arming
and live launcher identity before disconnect and after service exit. Broker
traffic still uses native IPC; fd 4 accepts only fixed test-control actions.

Both initial controls passed. On Node v22.23.2 / darwin arm64, parent-initiated
disconnect produced matching kernel exit, native exit code 1 and actual
service pipe closure, but no ChildProcess close within the post-closure 250ms
observation window. Child-initiated disconnect produced one genuine close.
The final full run records the same distinction across eight parent-triggered
process cases and one child-triggered control. Absence within that window is
reported as NOT_OBSERVED_IN_WINDOW, not permanent absence, a Node repair, a
close acknowledgment or permission to recover.

Actual Workspace requests drive issue/fence commit checkpoints. Parent
disconnect yields 503 without taskPage while preserving ISSUED/FENCED state
and the epoch in the original simulated ledger. The actual owner reports
FAILED with cleanupConfirmed=false because broker IPC is unavailable. TLS
issue and mock PG object end/destroy/credential disposal are checked, without
claiming physical database cleanup. A separate exit barrier proves listener
and owner completion can precede service exit.

Observer timeout and actual observer SIGKILL keep the original exit evidence
unverified even after a teardown-only observer confirms resource disposal.
A malformed real control frame after valid completion evidence likewise
keeps diagnostic/control evidence unverified, independently of valid kernel
exit. Six of the nine process reports have complete diagnostic evidence;
these three intentional fault reports remain UNVERIFIED. All nine confirm
test-resource teardown. The tenth test is the disabled formal-route/import
guard and starts no process. No diagnostic result rewrites the owner's failed
cleanup outcome.

A held committed issue reply settles without delivery after disconnect. Its
original reply is also replayed through the still-live original launcher,
which reports protocol-dropped without forwarding to the disconnected service
or changing ledger state/epoch. This fixture has no successor entry point;
the earlier strict successor and parent-exit recovery guards remain unchanged.

Validation: **112 passed / one existing skip** across six related files;
full suite **6,264 passed / 54 skipped**, 324 passing / five skipped test
files. The full run started at local 21:52:01 and took 19.20 seconds. TypeScript,
changed-file ESLint and adapter synchronization (73 files) passed. A trailing
blank line found by the new-file whitespace check was removed. No production
implementation or dependency changed, so prior production build/client-boundary
evidence remains applicable. The original 25 Workspace/TLS, seven exit-observer
and 13 parent-death tests are unchanged and pass.

The full verbose log at `/private/tmp/careslink-parent-disconnect-full.log`
contains all nine diagnostic summaries. Each fixture waits for verified
service exit, actual service-pipe/request closure and actual launcher/observer
close before deleting its owned temporary files; the final temporary-prefix
inventory was empty. Node close absence stays separately recorded. The source
worktree remains unchanged. All readiness flags stay false and
HOSTED_WORKSPACE_READ_BINDING remains undefined; real SQL/Auth, production
supervision and the other previously stated limits remain unverified.

The four-file local review is complete: **APPROVED WITH SUGGESTIONS**, with no
required changes. It checked event ownership, independent observation,
sticky failure evidence, retired RPC handling and resource disposal. No
configured engine or referenced ADR applies. The long launcher message
dispatcher and concentrated test-protocol branches remain readability
suggestions for later extensions. All nine diagnostic records agree with
the reported outcomes. Review changed documentation only; the validated
implementation and original suites are unchanged. This record is included
in the local commit.

**Next:** push the reviewed local commit to `Millionluna/Codex-Game-Studios`
on `codex/careslink-workspace-task-parent-disconnect` and create a draft PR
against `codex/careslink-ai-documents-v1-auth-gate`. Publication is separate.

### PR #48 merged; controller-death diagnostic plan — 2026-09-12

[PR #48](https://github.com/Millionluna/Codex-Game-Studios/pull/48) completed
draft publication, final diff/evidence review, ready-for-review transition and
ordinary merge into `codex/careslink-ai-documents-v1-auth-gate`. It merged at
`2026-09-11T22:31:01Z` (2026-09-12 08:31:01 +10:00 in Melbourne) as
`a3a71512990cd3dd1d3efd05afe8ccac88632fc7`. Its parents are
`c5a366c3078eaed5de2e3940aa06d9a62affd3b6` and reviewed
`dc18c0b4d24861b55ad44ae9168011d80eb0014c`; its tree
`67a22a8c4bcd68e8ea06fe6060761954d3b881fa` exactly matches the reviewed head.
The merge contains four files, 1,031 insertions and no deletions.

The final remote patch matched the reviewed local patch. GitHub reported
MERGED; no check runs or external reviews were present before merge. The
review had no required changes, with only the previously recorded readability
suggestions. Local evidence remains 112 related tests passed / one existing
skip, and 6,264 full-suite tests passed / 54 skipped. TypeScript, changed-file
ESLint, adapter synchronization (73 files) and whitespace checks passed.
These are the merged batch's results, not tests executed for the new plan.

The nine process reports retain their separate meanings: eight parent-triggered
paths reported NOT_OBSERVED_IN_WINDOW for native service close, while the child
control observed one close. Six diagnostic reports were VERIFIED and three
intentional fault reports remained UNVERIFIED. All nine confirmed test-resource
teardown; none changed the actual owner FAILED / cleanupConfirmed=false result.
The tenth test covered the disabled formal route/import boundary.

This worktree now starts from verified `a3a7151` on
`codex/careslink-workspace-task-controller-exit`. The protected source worktree
remains clean at `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`.

The authorized planning step selects the existing **process-controller death**
gap. PR #47 killed the launcher; PR #48 kept it alive while disconnecting its
service. Both retained their outer controller. The new
[controller-exit QA plan](communication-note-workspace-task-controller-exit-qa-plan.md)
defines an estimated 13 local Integration tests: normal controller exit and
SIGKILL, each at issue/fence commit checkpoints, an alive-service exit barrier,
two observer faults, two invalid audit-frame cases, a delayed old RPC reply,
and the disabled formal-runtime/import boundary.

The proposed ownership chain is T -> R -> L -> S. T survives as the test auditor
and owns R plus separate launcher/service kernel observers; R owns L and L owns
the actual service. T retains the real Workspace request driver and explicitly
simulated Auth/PG/ledger state outside the killed controller. Broker traffic
has only the native T/R/L/S IPC route. R death must break that route; dedicated
T/L and T/S audit sockets cannot substitute broker replies. This is a test of
the surviving Workspace consumer when its process controller is lost, not a
test of a crashed Workspace request handler or persistent database storage.

The plan preserves the existing local launcher's parent-IPC-loss strategy and
the actual service/HTTPS/process-owner implementations. It requires independent
L/S exit registration and fresh identity challenges before R death. R's actual
ChildProcess exit/close, L/S kernel exit, owner cleanup and audit-socket closure
remain separate observations. Native descendant exit codes or close events
unavailable after their original owners die must remain UNVERIFIED; neither a
kernel event nor a socket EOF can manufacture them. Teardown-only watchers may
not repair failed original evidence, and must be armed while their targets are
still alive. No new successor or recovery admission policy is proposed.

This planning step changes only this handoff and adds the QA plan. No new
process tests have run, and no product, dependency or existing-suite change,
commit, push or deployment is included. Node remains v22.23.2; the plan cites
the version's official lifecycle documentation checked on 2026-09-12 without
claiming any new reproduction or upstream fix.

The blocked PG16 fixture is not retried and no replacement Preview is created.
Outer auditor/host death, real database durability/cleanup, other platforms,
installed workload/key provenance, deployed supervision and controller-loss
recovery policy remain unverified. Readiness flags stay false and
HOSTED_WORKSPACE_READ_BINDING stays undefined; the protected source worktree
and all previously stated real-data, billing, cloud and deployment boundaries
remain unchanged.

**Next:** implement the bounded controller-death fixture and estimated 13 tests,
beginning with the two CE-01 controls and verified resource teardown; then run
the request/fault matrix and regressions, record actual results, and proceed to
code review and a local commit as the following stage.

### Controller-death diagnostic implemented locally — 2026-09-12

The [controller-exit QA plan](communication-note-workspace-task-controller-exit-qa-plan.md)
is implemented in a new test-only three-role fixture and a 13-test Workspace
process suite. Together with this handoff and the plan, the batch contains four
files on `codex/careslink-workspace-task-controller-exit`, based on merged
`a3a7151`. The review record is included in this batch's local commit;
publication is a separate step.

The outer test auditor T owns the disposable controller R and two independent
kernel observers. R owns L, which owns the actual service S. Fresh challenges
over the original IPC chain and separate bound audit connections attest L/S
after observer registration. T drives the actual Workspace/TLS request and
retains explicit mock Auth/PG responses and the original ledger Map. Native
T/R/L/S IPC is the only broker route; audit sockets never deliver broker replies.

The two initial normal/SIGKILL controls passed. The complete matrix covers both
death modes at ISSUE_COMMITTED/FENCE_COMMITTED, a still-live stopped service
after R/L exit, original launcher-observer timeout and service-observer SIGKILL,
wrong-nonce/repeated-sequence audit frames, a held old reply, and the disabled
formal-runtime/import boundary. Request cases return 503 without taskPage and
retain the original ledger state/epoch. Fenced request cases observe both the
mock PG cleanup connection and reader, with end/destroy and credential erasure.

Validation uncovered two fixture/test issues. The initial PG count expected one
object despite the actual reader's independent cleanup connection; it now
asserts two and retains each object's lifecycle checks. An intermittent IPC
send error arrived before native disconnect while connected still appeared
true. The fixture's process.exit(1) callback cut off owner completion. A fixed
failure record identified IPC_SEND_FAILED during the diagnostic full run.
The broker callback now rejects its own pending RPC and lets the real service
and owner complete failed drain. Upstream relay send errors likewise leave the
owned-child stop policy to native disconnect. This changes only the new fixture,
not product shutdown, Node accounting, timeout values or existing test guards.

Final related suites: **125 passed / one existing skip** across seven files,
starting at local 11:07:19 and taking 10.15 seconds. Final full suite:
**6,277 passed / 54 skipped**, 325 passing / five skipped files, starting at
11:08:28 and taking 22.62 seconds. TypeScript, changed-file ESLint, adapter
synchronization (73 files) and whitespace checks passed. Each final run actually
recorded two broker-send failures while the affected service still completed
owner failure reporting and verified resource teardown. Production code,
dependencies, the original suites and both existing recovery guards are unchanged;
production build/client-boundary checks were not repeated.

The full log contains 12 process reports: eight complete diagnostics and four
expected UNVERIFIED fault reports. The original O-L timeout and O-S SIGKILL each
retain their own failed exit evidence; wrong-nonce and repeated-sequence audit
frames retain audit failure despite verified kernel exit. All 12 keep actual
owner FAILED / cleanupConfirmed=false and confirm final test-resource teardown.
Both descendants' native exit codes/signals/close remain UNVERIFIED with
ORIGINAL_OWNER_EXITED: no kernel or audit event is relabeled as an original
parent's ChildProcess event. The thirteenth test starts no process.

The final logs are `/private/tmp/careslink-controller-exit-focused-final.log`
and `/private/tmp/careslink-controller-exit-full-final.log`. Successful final
fixtures joined every required process, stream and listener before deleting
their temporary roots. Two earlier failed-run roots, `cl-task-controller-75ZRdn`
and `cl-task-controller-5mppdT` under `/private/tmp`, remain as explicitly retained
failure evidence. They are not reported as successful teardown; the QA record
distinguishes their evidence limits. A final read-only process check and source
worktree check accompany the handoff. The protected source remains clean at
`31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`.

No real Auth/SQL, PG16 retry, replacement Preview, care data, AI, Points/payment,
database role/migration, IAM/key installation, cloud resource, deployment or
activation is involved. Readiness remains false and HOSTED_WORKSPACE_READ_BINDING
remains undefined. The audit process survives, the ledger is an external mock,
and audit/barrier facilities alter test observability; this does not verify host
death, real database durability/cleanup, deployed supervision or successor policy.

The four-file local review is complete: **APPROVED WITH SUGGESTIONS**, with no
required changes. It checked the real lifecycle implementations, original
observer identity, native-event ownership, sticky audit failures, retired RPC
handling and the retained failed-run records. Both final runs' complete set of
12 reports matches the documented results, including two actual broker-send
failures per run. No configured engine or referenced ADR applies. The dense
test-protocol and message-validation conditions remain a readability suggestion
for future extensions. Review only updated documentation and command examples;
the validated implementation remains unchanged. Adapter, whitespace, four-file
scope and protected-source checks accompany the local commit.

**Next:** push the reviewed local commit to `Millionluna/Codex-Game-Studios`
on `codex/careslink-workspace-task-controller-exit` and create a draft PR against
`codex/careslink-ai-documents-v1-auth-gate`. Publication is a separate step.

### PR #49 merged; controller-loss recovery admission plan — 2026-09-12

[PR #49](https://github.com/Millionluna/Codex-Game-Studios/pull/49) completed
draft publication, remote diff/evidence review and the ready-for-review
transition, then merged normally into `codex/careslink-ai-documents-v1-auth-gate`
at `2026-09-12T01:39:47Z` (2026-09-12 11:39:47 +10:00 in Melbourne).
The merge commit is `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9`, with parents
`a3a71512990cd3dd1d3efd05afe8ccac88632fc7` and reviewed head
`c092b23d5ada6756327a8a09ce40beb3e3afef67`. Its tree
`14fa0ef18752eb75daa073181cc7becdf9b6933b` exactly matches that reviewed head:
four files, 1,137 additions, no deletions. The remote target points to this
merge; no admin override, auto-merge or branch deletion was used.

The remote patch and all four blobs matched the local reviewed commit. There
were no required changes, with the recorded readability suggestions retained.
GitHub had no check runs or external reviews before merge. Local evidence is
**125 related tests passed / one existing skip** and **6,277 full-suite tests
passed / 54 skipped**, plus TypeScript, changed-file ESLint, 73-file adapter
synchronization and whitespace checks. These are the merged batch's results,
not a new execution of the recovery-admission plan below.

Each final run preserved 12 process reports: eight VERIFIED and four expected
UNVERIFIED faults, all with confirmed test-resource teardown. Two actual
broker-send errors per run exercised the corrected RPC rejection path. Old
owner FAILED / cleanupConfirmed=false was never rewritten; descendant native
exit codes, signals and close stayed UNVERIFIED / ORIGINAL_OWNER_EXITED.
The earlier failed roots `cl-task-controller-75ZRdn` and
`cl-task-controller-5mppdT` under `/private/tmp` remain separately retained
evidence with their original documented limits.

This worktree has fetched and switched to verified merge `d5ef6a2` on the new
local branch `codex/careslink-workspace-task-controller-recovery`. The protected
source worktree remains clean at `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`.

The next selected gap is **recovery admission after controller loss**, using
the surviving auditor T and the existing actual issuer/service/HTTPS startup
path. The new [controller-recovery QA plan](communication-note-workspace-task-controller-recovery-qa-plan.md)
defines an estimated 14 local Integration tests. It combines #49's two
original descendant observers and separate audit evidence with #47's
distinction between starting recovery and admitting requests. It is a new
test-local orchestration rule to validate, not an already deployed policy or
permission implied by a VERIFIED diagnostic summary.

The proposed guard requires the old R's actual exit/close, both originally
attested L/S observers' successful kernel-exit/close evidence, valid closed
audit channels, owner and explicit exit-release records, listener closure,
settled old requests/transports/RPCs, and an unconsumed admission. It consumes
admission before creating a single new R/L/S chain. Original observer failure,
bad audit evidence, a still-live service or a held old RPC must prevent any new
process/socket or broker-start side effect. Teardown-only evidence cannot
repair failed original evidence, and failed startup cannot reuse admission.

The old owner's failed cleanup stays unchanged. The new chain uses fresh
handles, nonce, audit paths and observer attestations while retaining the same
simulated ledger Map. Actual recovery must run start/inventory/fence/finalize/
ready under a new epoch. At inventory, committed-finalize reply and ready-reply
checkpoints, the actual service must still have no listener or published ready
binding. Only completed recovery can expose HTTPS; stale instance requests are
rejected, and a fresh binding must complete its own real request and simulated
PG/lease cleanup. Late old replies remain bound to the original dead R/nonce.

The plan reuses the existing controller-exit three-role fixture and Python
observer unchanged and adds one separate process test file. It covers the four
death/checkpoint combinations, a live service barrier, two original observer
faults, two invalid audit frames, three recovery-operation failures, an old
held reply and the disabled formal-runtime boundary. The original #45–#49
suites, strict successor and parent-exit recovery guards remain unchanged.
Named validators can improve the new harness without refactoring old suites.

Auth, SQL and retained state remain simulated; this does not establish
database durability or physical cleanup, host/auditor death, installed
supervision, production recovery authorization, workload/key provenance or
other-platform behavior. There is no blocked PG16 retry, replacement Preview,
real Auth/database role/migration, IAM/key installation, care data, AI,
Points/payment, cloud resource, deployment or activation. Readiness remains
false and HOSTED_WORKSPACE_READ_BINDING remains undefined.

This authorized step only synchronized the merged base and changed two
documents: this handoff and the new QA plan. No new test was run and no product,
fixture, dependency, commit or remote publication is included. The plan's
estimated counts must be replaced with actual results after implementation.

**Next:** implement the new joint process suite, first proving one nonempty
SIGKILL/ISSUE_COMMITTED recovery and both generations' resource teardown; then
expand the 14-case matrix, run relevant/full regressions and static checks,
and update QA/M1Y before the following review/local-commit stage.

### Controller-loss recovery admission implemented locally — 2026-09-12

The [controller-recovery QA plan](communication-note-workspace-task-controller-recovery-qa-plan.md)
is now implemented as one new 14-test process suite. The batch contains this
handoff, that plan and the new test file. It reuses the existing controller-exit
three-role fixture and Python observer unchanged; product modules, dependencies,
the previous suites and both earlier successor/recovery guards are unchanged.

Each generation retains its own controller handle, nonce, audit sockets,
original observers, Workspace requests and broker RPCs. The new local
startControllerRecovery checks those original objects, consumes admission
synchronously and only then constructs the next chain. Verified diagnostics
or a teardown flag alone are insufficient. A live service, failed original
observer, corrupted audit record or pending old RPC prevents any new generation,
process/socket registration or broker start. A used admission cannot be reused
while construction is pending or after recovery fails.

The initial SIGKILL/ISSUE_COMMITTED control passed before the complete matrix.
All four normal/SIGKILL and issue/fence combinations now retain the original
nonempty Map and recover through the actual issuer/service/HTTPS path under a
new epoch. Real inspect challenges at inventory, committed-finalize reply and
ready-reply barriers show STARTING, null address and no listener. Only completed
recovery publishes the new binding. Old-instance Workspace requests return 503
without another issue or PG reader; fresh requests wait for their own revoke
reply before returning 200. The delayed old reply remains bound to its dead
R/nonce while the new generation is actually recovering.

The first full matrix reported **11 passed / three failed**. All three failures
were in teardown of a successor whose startup had already failed: the actual
owner had removed its SIGTERM handler and disconnected IPC, so terminating R
first could let L's SIGTERM end S before barrier release. The failed records
show EPIPE, verified kernel exits and missing exit-release; they do not provide
S's original-parent exit signal, which remains unknown for that failed run.

The fix changes only the new harness's failed-startup teardown. It validates
startup failure, owner FAILED and NEVER_OPENED, releases S first, waits for the
original observer and still-live L's native child-close with code=1/signal=null,
then terminates R/L. Old controller-death triggers and the actual fixture policy
are unchanged. The reports distinguish this service-first cleanup from normal
controller-first cleanup, and preserve the native events actually observed.
The three never-opened failed generations also reject another recovery attempt.

Final related suites: **139 passed / one existing skip**, eight files passed,
starting at Melbourne 12:04:41 and taking 12.71 seconds. Final full suite:
**6,291 passed / 54 skipped**, 326 passing / five skipped files, starting at
12:05:15 and taking 25.29 seconds. Both exited 0. The separate corrected matrix
passed all 14 cases. TypeScript, new-file ESLint, 73-file adapter synchronization
and whitespace checks passed. Production build/client-boundary checks were not
repeated because product code and dependencies did not change.

Both final runs contain 22 generation reports: 13 initial generations and nine
one-time recovery admissions, producing six READY and three FAILED successors.
Eighteen diagnostic reports are VERIFIED; the two original-observer failures
and two invalid-audit cases remain UNVERIFIED. Nineteen listeners closed and
three never opened. All 22 confirm resource teardown, settled RPCs/requests,
closed request/audit streams and actual owner FAILED / cleanupConfirmed=false.
The three startup failures have observed S native exit/close; all remaining
unavailable descendant native events retain ORIGINAL_OWNER_EXITED. Twenty
recovery refusals verify the corresponding absence of startup side effects.

Logs are `/private/tmp/careslink-controller-recovery-focused.log` and
`/private/tmp/careslink-controller-recovery-full.log`; the QA record lists the
initial control, failed/corrected matrix and static-check logs. Successful runs
deleted their own temporary roots after verified teardown. The first failed
matrix root `/private/tmp/cl-task-controller-m4PfOY` remains with its original
incomplete-release evidence; subsequent success does not relabel that run.
The two earlier PR #49 failed roots also remain separate. Final read-only
process inventory found no matching live fixture/observer, and the other tested
temporary prefixes were empty. The protected source worktree remains clean at
`31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`.

This validates a local recovery-admission harness with a surviving T and
simulated Auth/SQL/ledger. It does not establish durable database cleanup,
host/auditor death, installed supervision or production recovery authorization.
The blocked PG16 fixture was not retried; there was no replacement Preview,
real data/Auth/database role/migration, IAM/key installation, AI, Points/payment,
cloud deployment or activation. Readiness remains false and
HOSTED_WORKSPACE_READ_BINDING remains undefined. No commit or publication was
performed in this implementation step.

**Next:** review the three files and original validation evidence, then create
a local commit if no required changes remain. Push and PR publication follow
as a separate stage.

### Controller-loss recovery admission reviewed for local commit — 2026-09-12

The three-file batch was reviewed through the repository code-review workflow,
including the full new suite, QA/M1Y changes and the unchanged actual
issuer/service/HTTPS/owner and fixture paths. Verdict: **APPROVED WITH
SUGGESTIONS; no required changes**. No engine is configured and no numbered ADR
reference or corresponding story applies. Testability was reviewed within this
task, without a delegated or external approval.

The review confirms synchronous one-time admission, original observer and
closed-channel evidence, generation-bound broker replies, retained simulated
state and actual recovery before listening. The failed-startup service-first
cleanup obtains S's real native close before terminating R. Neither a successful
successor nor teardown-only observation rewrites failed original evidence.

The original final logs were parsed again: each contains 22 generation reports,
18 VERIFIED / four UNVERIFIED diagnostics, six READY / three FAILED successors,
and 20 refused admissions. The 14-case matrix, **139 related passes / one skip**
and **6,291 full-suite passes / 54 skips** remain the final implementation's
evidence. The three first-run CR-05 EPIPE failures and retained roots remain
separate. The protected source is still clean at
`31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`.

An additional read-only ESLint check at complexity 10 / function length 40
reported **zero errors and 11 warnings**: ten complexity warnings in local
protocol/evidence/startup/cleanup helpers and one length warning for the outer
describe callback containing the test registrations. This differs from the
clean default ESLint result. The QA review records exact lines and values.
Named validators, less compressed statements and extracted synthetic fixture
data remain nonblocking suggestions; the review does not claim all six game
coding-standard checks passed. Product interfaces and earlier guards are
unchanged, and no implementation edit required repeating runtime tests.

This review record accompanies the local commit of exactly the new test,
controller-recovery QA and this handoff, with parent `d5ef6a2`. Adapter,
whitespace, staged-scope and source-worktree checks accompany the commit.
All previously documented local-only limits and disabled readiness remain.

**Next:** push the reviewed local commit to `Millionluna/Codex-Game-Studios`
on `codex/careslink-workspace-task-controller-recovery` and create a draft PR
against `codex/careslink-ai-documents-v1-auth-gate`, carrying the actual test
results, first-run failure and remaining limits. Publication is a separate step.
