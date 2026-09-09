# CaresLink AI Flows

> Current production flows are separated from the new **inactive shadow** contracts. A shadow artifact is not a served flow.

## 1. Authentication

### Current Web flow

1. User opens login/register with an allowlisted internal `next` and optional supported locale/source metadata.
2. Email/password uses Supabase Auth server actions. Google uses `signInWithOAuth` and a PKCE callback.
3. Callback exchanges the code for a server session and redirects only to a validated internal path.
4. The application reads the authenticated user and trusted `app_metadata.role`.
5. Provider routes deny missing/non-provider sessions; admin routes independently require admin.
6. Sign out calls Supabase server-side sign-out and then protected pages re-trigger the login gate.

**Deny cases**: unauthenticated AI POST returns 401 before body parsing/quota/OpenAI; provider cannot open admin content; user metadata cannot self-grant admin; external `next` is discarded; OAuth provider error details/fragments are not carried to the final URL.

**Gaps**: Microsoft/Apple, confirmed identity linking, device/session registry, single-device revoke, native PKCE token storage, email-change reauth and account-wide revocation.

## 2. NDIS Case Note input and Privacy Review

### Current flow

1. Authenticated provider selects structured facts or paste-Chinese mode.
2. Raw pasted text remains in current React state; it is not intentionally written to URL, local storage, analytics or admin surfaces.
3. Browser detector returns findings with matched ranges and a proposed cleaned/structured view.
4. Blocking findings must be removed/replaced; indirect findings require explicit review.
5. Two confirmations are unchecked by default: de-identification review and authority to process.
6. Minimum facts include support date/approximate time, support delivered, observable facts and action taken.
7. Only cleaned structured facts are used to construct the generation request.
8. Server repeats minimum-fact, confirmation and obvious-identifier validation and fails closed.

**Deny cases**: missing facts, unresolved blocking identifiers, missing confirmations, malformed body, unsupported locale, non-provider role. None of these should reserve credit or invoke OpenAI.

**Gaps**: only NDIS is supported; runtime has no persisted hash-bound `privacy_review_id`, five-type privacy schemas, `zh-Hant` or voice/transcript path. The shadow migration and shared contract model a hash-bound proof and three locales, but the migration was tested only on an isolated branch and is not connected to this flow.

## 3. Generation and legacy credits

### Current flow

1. Server validates session, provider role, body, privacy and minimum facts.
2. Client supplies an idempotency key; server reserves one legacy credit through a service-role RPC.
3. Server consumes account and IP daily abuse quota.
4. OpenAI Responses API is called synchronously with a strict JSON schema and `store:false`.
5. Server parses and safety-validates English draft, Simplified Chinese review, missing facts, neutral wording checks, follow-up prompts and disclaimer.
6. A 30-minute opaque claim is persisted.
7. Only after a usable claim exists does the server commit the credit.
8. Validation/model/network/unsafe-output/claim failures release the credit; abuse quota follows its separate existing policy.
9. Replaying a completed idempotency key returns the stable completed reservation/claim instead of a second charge/model call.

**Deny cases**: `login_required`, `provider_required`, privacy/minimum-fact codes, quota/rate limit, `credit_exhausted`, unsafe output, configuration/storage failure. Error bodies do not contain note content.

**Conflict with V1**: current plan is 3 credits per monthly period and one credit per generation. V1 requires one-time 300 welcome Points, versioned service rates, point lots and no parallel legacy balance truth.

### Communication Note owned local full-flow fixture (2026-09-08)

The explicit `--flow` browser runner now joins facts entry → confirmed privacy
review → one synthetic task → exact pre-seeded result → real local self-review
and export history. The task and 100/20-Point display are clearly labelled
simulations; progress does not write a database job, reserve Points or call AI.
Only fixed English synthetic facts are accepted, matched against the existing
local result. Refresh does not resubmit, and active-session checks protect task
and result reads. The formal generation gates remain off.
See [the bounded full-flow evidence](communication-note-product-integration-m1y.md#communication-note-fixed-synthetic-full-flow-integration-2026-09-08).

### Communication Note real local admission fixture (2026-09-08)

The separate `--admission` mode connects the unchanged composer to the existing
real PostgreSQL policy-bound admission and Points preview RPCs. Fixed synthetic
facts → current-session/privacy validation → atomic queued job + 20-Point
reservation → deliberate lost acknowledgement → exact same-request retry → same
queued job. Refresh never submits; the actual balance changes 30/0 → 10/20 and
stays unchanged on retry. No worker runs, so no result route is available and no
terminal charge/release is claimed. Synthetic policy receipts are not vault/KMS
evidence. The owned database is removed on shutdown; formal runtime remains off.
See [local admission evidence and next terminal-settlement slice](communication-note-product-integration-m1y.md#communication-note-real-local-admission-and-points-browser-gate-2026-09-08).
Real provider/model output and Hosted activation are not proved by this fixture.

### Communication Note real local terminal settlement fixture (2026-09-08)

The separate `--settlement` mode joins real local admission to fixed stdin-only
terminal RPCs: queued → failed/cancelled releases 20 Points; queued → claimed →
synthetic payload-consumption receipt → fenced → succeeded saves a canonical
draft and commits 20 Points. Exact terminal replay changes no ledger/document
state. The browser opens only the actual new result and rechecks owner/session;
self-review/export-history mutation is not enabled in this mode. The success
wording and provider evidence are synthetic; no real worker, model, vault or
KMS runs. The separate `--settlement-check` matrix needs no browser. All test
data is destroyed at shutdown and formal activation stays off.
See [terminal settlement evidence and next review/export slice](communication-note-product-integration-m1y.md#communication-note-real-local-terminal-settlement-browser-gate-2026-09-08).

### Communication Note settled draft review/export fixture (2026-09-08)

The new `--settlement-review` mode continues the real-local successful task:
new canonical draft → required review → three test-user confirmations → durable
self-review → TXT download initiation → durable report → refresh/readback of
the same review and history. Review/history add no Points events. Only the new
settled document can reach these routes; editing remains closed. History-off
clears the visible list, recovery reads it without another export, and revoked
sessions cannot read private content. This uses synthetic content/identity and
does not attest human content quality or OS file delivery. The separate
`--settlement-review-check` runs 61 database scenarios and cleans its cluster.
See [the settled-draft review/export evidence](communication-note-product-integration-m1y.md#communication-note-settled-draft-review-and-export-integration-2026-09-08).

### Communication Note settled draft edit/version fixture (2026-09-08)

The separate `--settlement-edit` mode adds wording edits for only that newly
settled document: reviewed version 1 with its own TXT report → save new wording
as version 2 → review required and exports disabled → fresh review → independent
version-2 report. Historical navigation preserves version 1's original wording
and report without carrying over review/export authority. Reload restores the
new version's saved content/review; history refresh reads the same report.
Existing parsers and SQL enforce ownership, revision membership, active session,
base revision and replay. The generation job keeps its original version anchor;
editing/review/export and terminal replay do not charge Points. The opt-in
`--settlement-edit-check` proves 89 local database scenarios. All test data is
deleted; formal activation, real model calls and OS delivery claims stay closed.
See [the settled-draft editing evidence and next revisit entry](communication-note-product-integration-m1y.md#communication-note-settled-draft-wording-edit-and-version-history-integration-2026-09-08).

### Communication Note saved-list revisit fixture (2026-09-08)

`--settlement-list` wires the new saved-list surface only in the disposable
local workspace: empty → task/save → leave → list current-version metadata →
open with fresh access/self-review checks → edit → return/reload → open latest
version. The task's original result link remains revision-pinned. The list uses
the existing owner-scoped metadata RPC, then filters to the exact newly settled
document; it never fetches draft wording or grants review/export authority.
Three locales, retryable failures, lifecycle clearing and eight-second timeout
are supported. Revoked-session refresh removes the list. Reading generates no
job/Points/review/export write. `--settlement-list-check` proves 94 database
scenarios; the formal legacy workspace, general catalog/pagination, Hosted and
real provider activation remain unchanged.
See [saved-list evidence and the next in-progress task entry](communication-note-product-integration-m1y.md#communication-note-saved-draft-list-and-revisit-integration-2026-09-08).

### Communication Note in-progress task entry fixture (2026-09-08)

`--workspace-task` adds one server-preallocated local admission locator before
Next starts. Empty → actual admission → lose response → leave without retry →
workspace exact-task read → queued detail → operator synthetic success → saved
task plus current draft → open with fresh review/access checks. No browser
request key, facts storage, task enumeration or new SQL privileges are needed.
The workspace reuses the green three-locale surface; auth failure clears both
task and draft metadata. Refresh does not submit, settle or charge. A present or
unknown task hides this fixed mode's new-generation link. The mode is one task
per disposable run, not formal multi-task or cross-device recovery. The check
mode passed 98 real local database scenarios. See [task-entry evidence and next
navigation slice](communication-note-product-integration-m1y.md#communication-note-in-progress-task-workspace-entry-2026-09-08).

### Communication Note direct workspace navigation (2026-09-08)

Task and saved-draft headers now return directly to the same-language workspace
through both Logo and labelled return link. Invalid-ID exits also remain on a
fixed workspace path. A failed task's explicit new-note action stays separate;
returning never submits generation. The local loop is workspace → task → exact
saved version → workspace → current saved version. Existing reauthorization on
each destination and exact-version/review rules remain in place. The final
browser run confirmed Traditional Chinese no longer switches to English on
draft return, and revoked-session return shows sign-in without private data.
The general multi-task catalog and formal workspace activation remain open.
See [navigation verification](communication-note-product-integration-m1y.md#communication-note-workspace-navigation-loop-2026-09-08).

### Communication Note owner-isolated multi-task workspace (2026-09-08)

This supersedes the singleton `--workspace-task` wiring above. Fresh cookie
provider/session → private purpose RPC → current owner's Communication tasks
(newest first, 20 per page) → exact task → saved version → same-language
workspace. Cursor pagination carries position only, never owner identity.
Refresh and lifecycle changes reauthorize from the latest page; pending/failed
or revoked reads clear both sections. A separate create action can admit a new
task, while status reads never submit/retry generation or charge Points.

The real browser proved two independent tasks after a lost acknowledgement and
a failure/release, followed by success/commit and revoked-session clearing.
The new SQL remains an unactivated local candidate outside the pinned Hosted
manifest. The reusable UI preserves the existing green identity and three
languages. Formal workspace activation and the general saved-draft catalog are
still pending; the draft section retains its exact-settled-document fixture.
See [multi-task scope and verification](communication-note-product-integration-m1y.md#communication-note-owner-isolated-multi-task-workspace-2026-09-08).

### Communication Note current-owner saved-draft catalog (2026-09-08)

This supersedes the singleton saved-draft section above: fresh cookie/session
→ existing Product API document list (20 metadata rows, stable UUID order)
→ server-side live Communication Note filter → current-version document link
→ existing fresh-session/owner reader → same-language workspace. Filtered empty
pages retain their next cursor. Tasks and drafts have independent page controls;
refresh or lifecycle reauthorization clears both and restarts at their first
pages. Listing never shows wording, changes review state or charges Points.

The browser proved two independent current-version reads, three workspace
locales and revoked-session clearing. SQL proves 25 documents across 20/5 pages.
No new migration or permissions were added; formal app activation remains off.
Only catalog GET navigation was broadened in the owned fixture: editing,
self-review and export/history still require the exact settled-document guard.
The next slice is default-off formal workspace wiring with local validation.
See [catalog scope and verification](communication-note-product-integration-m1y.md#communication-note-current-owner-saved-draft-catalog-2026-09-08).

### Communication Note default-off formal workspace route (2026-09-08)

The formal `/ai-documents` page now chooses the new workspace only with an
exact server-side opt-in, preserving the legacy page by default and the admin
branch. Server account auth precedes canonical locale routing; private metadata
still loads through its own fresh-session HTTP boundary. Page/API responses
are private/no-store/no-referrer/noindex. No demo/account query selects an owner.

The actual formal list API uses a shared read-only composition but its source
runtime remains undefined, so a UI flag alone always produces a safe 503 and no
data IO. The owned local browser copy binds only the two narrow existing readers
and verifies task/draft navigation and revoked-session clearing through the real
page/API files. No source credential, hosted role or writer is activated.
The next slice is a default-off read-only runtime adapter, not deployment or
generation activation. See [formal route scope](communication-note-product-integration-m1y.md#communication-note-default-off-formal-workspace-route-2026-09-08).

### Communication Note read-only workspace database adapter (2026-09-08)

The default-off adapter now binds one request-local Cookie client and verified
user/session to the existing document-list RPC and task-list repository. Both
reads stay fixed to 20 rows and independent position cursors. Reauthorization
before reads and after completion rejects identity changes/revocation; the
30-second handler deadline discards late results without retry or partial data.

Task reads require a separate list-purpose server port, not a single-job status
or generation credential. The formal runtime is still undefined: configuration
cannot install a physical connection, role grant or credential issuer. The
owned source-routed browser copy passed real local reads, current-draft return
and revoked-session clearing without any admission, Points or review writes.
Next is local task-port connection/cancellation/cleanup implementation, not
Hosted activation. See [adapter evidence](communication-note-product-integration-m1y.md#communication-note-read-only-workspace-database-adapter-2026-09-08).

### Communication Note task-list physical cancellation and cleanup (2026-09-08)

The local list-purpose port now opens an independent same-LOGIN cleanup
connection before its single-use read connection. Both attest the narrow role
and target; only the read session activates the list caller and fixed statement.
Abort closes that transport, then independently bounded cleanup targets its
random nonce plus known PID/start and checks that the backend is gone. Errors,
timeouts and uncertain cleanup suppress metadata; no other session is targeted.

Twelve actual-source PG16 transport tests (including blocked auth-row cancel,
cleanup connection loss and HTTP-core composition) pass. This is not credential
issuance/revocation or live binding: formal runtime remains undefined. The next
local slice replaces the owned workspace browser fixture's broad test connection
with this dedicated list-only port, then exercises actual-page refresh,
pagination/navigation and cancellation without deploying. See
[physical-port scope and evidence](communication-note-product-integration-m1y.md#communication-note-task-list-physical-cancellation-and-cleanup-2026-09-08).

### Communication Note dedicated task port in the local workspace (2026-09-08)

The owned workspace's server-resolved principal now reaches the real single-use
task port via a separate local credential module; the admission bridge and LOGIN
can no longer read task lists. Actual page tests cover 25 distinct tasks across
20/5 pages, refresh/latest return, three locales, task/current-draft navigation,
and revoked-session clearing. During locked-read navigation, the real backend
and locks disappeared in ~480 ms; unlock/refresh recovered the new page.

This historical checkpoint changed only the owned fixture, not the formal
binding or green UI. Its fixture-lifetime password limitation is replaced by
the following local credential slice, not by Hosted activation. See
[owned integration evidence](communication-note-product-integration-m1y.md#communication-note-dedicated-task-port-in-the-local-workspace-2026-09-08).

### Communication Note local single-use task credentials (2026-09-08)

Owned Next read → private parent Unix issuer → fresh-session check → one new
60-second/two-connection list LOGIN → actual source read + connection cleanup →
NOLOGIN/password removal → exact owned-session termination → LOGIN removal +
private revocation tombstone → only then release task metadata. Every refresh
or page gets a distinct request/credential; duplicate delivery never returns a
secret. Lost response or browser cancellation still triggers cleanup; an
independent expiry timer handles abandonment while the parent remains alive.
Uncertain cleanup withholds data and closes further issuance for that fixture.

The built page passed 20/5 pagination, three locales, cancellation/recovery and
session-revocation clearing, ending with seven REVOKED receipts and no active
task roles/connections/locks. The formal binding is still undefined. Next is a
typed default-off server lease adapter (completed below), not copying the local database operator
into the app. Managed custody, crash/restart cleanup, Hosted grants and live AI
remain separate. See [local lifecycle evidence](communication-note-product-integration-m1y.md#communication-note-local-single-use-task-credentials-2026-09-08).

### Communication Note default-off server task lease adapter (2026-09-09)

The local bridge now calls the actual application-source lifecycle:
validated Cookie/query scope → bounded issue → validate credential/source →
bounded read → independent bounded revoke → exact receipt/freshness/cancellation
check → release metadata. Missing or uncertain revocation never returns data;
late responses cannot turn a timed-out read into success. Formal wiring remains
undefined; the local database operator stays outside the application.

84 new unit tests and 10 real owned-PG tests passed. Typed receipt validation is
not managed custody evidence: the trusted provider must enforce a terminal fence.
Next at this checkpoint: local issuer interruption/restart and supervised orphan reconciliation (completed below).
See [adapter evidence and limits](communication-note-product-integration-m1y.md#communication-note-default-off-server-task-lease-adapter-2026-09-09).

### Communication Note supervised local credential recovery (2026-09-09)

Owned parent supervisor → private issuer child → one-use source credential.
Unexpected exit, lost heartbeat or overdue receipt → terminate only that child
→ verify its PG backend gone → acquire issuer fence → reconcile unfinished
receipts → open Unix IPC again. Any mismatch or failed cleanup stops issuance.
No password is replayed and no role is selected by name-prefix alone.

The supervisor's expiry check survives a lost child timer. Seven real process
scenarios and ten existing real database scenarios passed; the production
runtime remains unbound. This still depends on the supervisor and local PG
surviving, not a durable Hosted custody service. Next: same-revision built-page
workspace/result/review/Points acceptance on synthetic data.
See [process recovery evidence](communication-note-product-integration-m1y.md#communication-note-supervised-local-credential-recovery-2026-09-09).

### Communication Note supervised browser acceptance — partial (2026-09-09)

At source `2a20b15`, the built owned PG16 fixture passed workspace empty state,
25-task pagination (20 + 5, no duplicate), success → exact revision → three-locale
review navigation, and displayed 10 available / 0 reserved Points after the
fixed synthetic seed. Reading did not create review/export or Points events;
all review confirmations and export buttons remained gated. Green design and
Logo were unchanged. Physical page-leave cancellation revoked the one-use
credential and removed waiting locks in 258 ms.

Recovery acceptance stopped because the operator mistakenly requested a jobs
table count before releasing the intentionally held jobs lock. The diagnostic
timed out and the runner cleaned up safely; application failure is not inferred.
Next: repeat only the remaining local cancellation/recovery tail with
`task-unlock` completed before `task-status`, then fixed session revocation and
final business/cleanup checks. No formal runtime or Hosted activation.
See [partial acceptance evidence](communication-note-product-integration-m1y.md#communication-note-supervised-browser-acceptance--partial-2026-09-09).

### Communication Note supervised recovery tail — passed (2026-09-09)

The corrected local sequence passed without application changes: cancel read
→ observe physical cleanup (253 ms) → complete `task-unlock` → refresh → same
ordered task IDs. Fixed synthetic session revoke → refresh cleared both lists
and reached the locale-preserving login URL. Fixture identity restoration then
recovered the same tasks and three drafts. Points remained 10 available / 0
reserved with no new business writes; six leases were REVOKED and residual
roles/sessions/locks were zero. Owned PG/server/root and tab 37 were disposed.
This completes the interrupted local gate, not real Auth/Hosted activation.

Next proposed app-facing slice: workspace ↔ existing `/plan-and-usage` Points
navigation, reusing the green design and current readiness states, without
wallet duplication, purchases or formal-runtime activation.
See [completed tail evidence](communication-note-product-integration-m1y.md#communication-note-supervised-browser-recovery-tail--passed-2026-09-09).

## 4. Save, history and delete

### Current flow

1. Generated output is referenced by an opaque claim token; content is never placed in the URL.
2. Provider save endpoint validates session, provider role and claim ownership.
3. Result is stored as a `generated_material_drafts` row with `feature='ndis_case_note'`.
4. On an explicitly guarded isolated Preview only, the server attempts a canonical shadow projection after the legacy save. The response continues to use only the legacy row even when projection, shadow write/read or timeout handling fails; the server records only a content-free status/reason such as `PROJECTION_ERROR`.
5. AI Documents lists owner rows; provider can copy and delete an owned draft.
6. Owner RLS denies cross-account SELECT/DELETE, while server routes also check owner and feature.
7. Admin material usage shows metadata/aggregates, not full content JSON.

**Deny cases**: expired/unknown/already-claimed/cross-owner claim; wrong feature; cross-owner draft read/delete; admin/support content browsing.

**Gaps**: canonical projection occurs only after explicit Save, not first input. The local Preview slice creates shadow revisions/checkpoints but does not expose them as save acknowledgements or user content. Its hardened migration records the NDIS legacy source generation on the canonical document and requires that exact `(owner, ID, created_at)` generation to remain present for owner reads. After owner deletion, the legacy response stays authoritative while a fail-safe, replay-safe server RPC tombstones exactly the deleted generation; the same ID can later create an independent generation. If cleanup misses, reconciliation reports `SOURCE_DELETE_CLEANUP_PENDING`. Physical purge, an automatic cleanup worker, general editor autosave, user-visible conflict resolution and account-wide deletion remain absent.

## 5. Draft sync and recovery

### Current reality

- Generated result recovery is an opaque claim plus saved material row.
- Provider profile generator has a separate draft handoff store.
- Neither is a canonical AI Note draft/revision protocol.
- There is no native local UUID mapping, encrypted outbox, server checkpoint, base-revision conflict or cross-device draft recovery.

### Local Preview shadow contract

`createMemoryCanonicalDocumentShadowStore` proves the domain rules for owner-bound create/read, immutable revisions, idempotency, stale-base rejection, checkpoints, revision-bound self-review and tombstone/purge transitions. The isolated repository/RPC slice persists an NDIS projection after legacy Save and compares hashes server-side. Protected Preview evidence covered `PROJECTED`, `MATCH`, same-key replay, provider B isolation and the master kill switch. No browser receives the canonical payload, and the legacy row remains the only response/reload source.

### Intended runtime / not implemented

First valid input creates a canonical document ID. Each mutation carries idempotency key and base revision. Server returns accepted revision, server time and stable save state. Portal keeps only a PIA-approved short-lived recovery buffer for unacknowledged changes; App uses encrypted local DB/outbox. A 409 creates an explicit conflict workflow rather than last-write-wins.

## 6. Export

### Current reality

Legacy result/saved-content Copy actions remain separate. As of 2026-09-08,
the source-only Communication Note result flow also supports Copy/TXT/DOCX/PDF
for the current saved, self-reviewed revision. Each click rechecks access and
that exact revision, then produces the minimal English Record copy with draft
and static-copy notices. Editing hides exports; unreviewed/historical versions
are disabled. Safe filenames and bounded browser Blob URL cleanup are present;
DOCX/PDF renderers load lazily. There is no durable export job/event history,
hosted artifact storage/download URL, batch export or Hosted activation.

The local export-history slice now reports minimal version-bound browser events
after an authorised export and explicitly reads the selected revision's latest
20 reports. Outcomes are `COPY_REPORTED`, `DOWNLOAD_INITIATED` or `FAILED`, not
legacy `DOWNLOADED`/`SHARED` or saved-file receipts. History failure does not
change the export result or automatically retry/re-export. Its private GET/POST
route remains hard-off without a dedicated trusted binding; only the owned
synthetic memory fixture installs a process-memory binding and labels that limitation.
An uninstalled durable read/write candidate now passes real disposable local
PostgreSQL tests, including ownership/session checks and concurrent replay.
Its private RLS table and private definer remain outside the approved migration
manifest; API roles receive no candidate grants. There is no retained database
installation or browser-persistent cache. The explicit owned `--database-history`
mode additionally proves the existing page's real local PostgreSQL write/read
roundtrip, reload, revision isolation, switch failure and session-revocation
clearing. Its synthetic identity, database and caller grants are discarded at
shutdown; it is not Hosted Auth or formal activation evidence.
See the [local history evidence](communication-note-product-integration-m1y.md#communication-note-revision-bound-export-history-local-slice-2026-09-08).
See also the [durable candidate evidence](communication-note-product-integration-m1y.md#communication-note-durable-export-history-candidate-2026-09-08).
The [local durable browser evidence](communication-note-product-integration-m1y.md#communication-note-export-history--real-local-browser-roundtrip-2026-09-08)
records all four formats and the independent version-bound row counts.

The bounded native Safari synthetic gate passed real cross-app paste and actual
TXT/DOCX/PDF saving/opening. DOCX opened in TextEdit, not Microsoft Word. See the
[acceptance scope](communication-note-product-integration-m1y.md#communication-note-native-safari-export-acceptance-2026-09-08).

### Inactive shadow contract

The schema draft separates `export_jobs` from append-only `export_events`, binds both to owner/document/revision and defines DOCX/PDF/TXT/COPY terminal states. It contains no renderer, artifact storage, download route or file bytes.

### Intended runtime / remaining work

All export paths must bind to a specific revision and shared renderer/template
version. The local Communication Note Record copy already excludes privacy
findings, internal facts analysis, Points and model metadata; external copies
are static snapshots and never sync changes back. Hosted durable event history
integration and separately gated activation,
bilingual/historical/batch exports, artifact delivery controls and App Share
Sheet integration remain separate work. A browser's download-start result must
not be represented as proof that the user saved a file.

## 7. Points and entitlements

### Current reality

`account_entitlements` lazily creates a monthly `free` allowance. `credit_ledger` records grant/reserve/commit/release. The client can read only its own entitlement/ledger; service-role RPCs own writes and use transaction/advisory-lock/idempotency controls.

### Inactive shadow contract

The TypeScript shadow store and Production-unapplied migration define wallets, lots, versioned rates, quotes, allocation rows, reservations and an append-only ledger. On a disposable Supabase branch, real service-role RPC tests proved earliest-expiring lot allocation, quote/reserve/commit, quote/reserve/release to original lots, replay safety, conflicting replay rejection, expiry, insufficient balance and cross-owner denial. Real JWT tests proved owner-only reads and denied direct writes/RPC execution to anon, providers and a test-only platform service actor. No welcome lot was automatically granted and the current monthly credit system remains the sole runtime entitlement.

The source-only Communication Note page now has a read-only preview boundary for the current authenticated Provider session. A zero-argument database RPC derives the owner from the active session, pins the server-owned Communication Note rate to 20 Points and returns only that owner's shadow-wallet `available` and `reserved` totals. The server accepts only the exact response contract and fails closed after 1.5 seconds; the UI labels the surface not active. These shadow values must not be described as a consumable real balance. This slice creates no quote, reservation or welcome grant, does not grant/debit or replace legacy credits, and cannot invoke a model, save a Note or export an artifact. Its migration is Production-unapplied, and no Preview or Production deployment was performed.

#### Communication Note atomic 20-Point admission — source only

The next source-only coordinator now rechecks the current session and privacy
authority, admits the Communication durable job and reserves exactly 20 Points
within one database transaction. Fresh admission leaves the paid job `QUEUED`
with attempt `0`; exact replay revalidates the private binding and is write-free.
An owner-wide advisory lock and deterministic lot allocation prevent two keys
from oversubscribing the wallet. Any admission, authority or balance failure
rolls back the durable job, payload and every Points write together.

The route still imports no admission adapter, `READY=false`, and no caller grant
or pool exists. The response DTO returns no quote, reservation, allocation,
ledger or private binding ID. Authenticated owners may still read the IDs on
their own public Points rows under the existing RLS policies; only the private
job-to-Points binding is inaccessible. No welcome grant or legacy-credit
behavior changes.

#### Communication Note atomic terminal Points settlement — source only

The next Production-unapplied migration admits marked paid jobs to the existing
registered-worker path only while their exact 20-Point reservation remains live.
A successful worker terminal transaction must persist and cross-check the
canonical document and first revision, sync change, mutation receipt, provider
evidence and purge outbox before it commits that reservation. Permanent failure
or cancellation releases the exact allocation back to its original lots. A
retryable lease expiry leaves the reservation `RESERVED` and requeues the same
job; no second quote, reservation or `RESERVE` ledger row is created.

Fresh post-lock clocks guard heartbeat, authorization, fence replay and success
commit, including the approved worker policy's provider and commit safety
margins. Recovery alternates paid and unpaid work, then paid queued and running
work, per registration so one backlog cannot permanently retain reserved
Points. Old worker/owner envelopes remain unchanged, and generic Points
commit/release continues to reject the bound reservation.

The entire flow remains source/local only and unreachable from a product route:
no runtime principal receives the settlement purpose role, no Hosted or
Production migration was applied, and no deployment, model call or real care
data was used.

### Intended runtime / not implemented

One wallet owns multiple point lots. A versioned server rate catalog returns a quote before reservation. The source successors above now model atomic Communication admission, reservation and terminal commit/release, but they must not be activated until formal runtime-principal installation, disposable no-data Hosted evidence, product integration and separate activation approval are complete. Free account receives one-time 300 welcome Points only after its separate eligibility and migration decisions are implemented. Pro and top-ups arrive only through normalized entitlements after provider receipt verification. Existing credit history remains immutable and is migration-mapped, not rewritten.

## 8. Billing

### Current reality

No Stripe checkout/customer portal, Apple IAP, Google Play Billing, receipt verification, webhook, restore, refund or reconciliation exists. The old price-interest control is a metadata-only fake door and is not an entitlement or payment implementation.

### Intended / not implemented

Web/Apple/Google purchases normalize to one entitlement service and grant idempotent point lots. Purchase claims and provider events are globally unique and replay-safe. Existing active entitlement blocks duplicate subscription. Refund/revoke removes only eligible unused lots and never deletes existing Notes. Daily reconciliation compares provider cash/receipts, entitlements and ledger.

## 9. Content, Guides and Daily Brief

### Current reality

Core publishes static public resources/articles/updates. The AI app has no canonical Content API, logged-in Library, Save/Follow/read state, Guide progress, Explain service or Daily Brief.

### Intended / not implemented

Core HTML and Web/App feeds consume one versioned content source. Published items carry stable ID/revision/locale/source/checked date/status. Logged-in state syncs Save, Follow and Guide progress. Daily Brief chooses at most three explainable candidates from unread relevant updates, in-progress guides, followed topics and user reminders; Note content is excluded.

## 10. Notifications

### Current reality

There is no app-owned notification preference, push token, in-app inbox, email fallback, digest schedule, quiet hours, frequency suppression or deep-link delivery service.

### Intended / not implemented

Security, reminders, content/digest, Points and marketing are separate preferences. Payloads contain only opaque IDs and safe type. Daily/Weekdays/Weekly/Off is explicit; content push is normally capped at one proactive item per day. Open requires reauthentication and resolves to a safe resource/recovery state.

## 11. Portal Referral intake, Assignment M1a and Provider Response M1b (inactive runtimes)

When every default-off application gate and the exact non-Production Preview ref pass, the browser first requests a metadata-only source list. The server creates a request-scoped cookie Supabase client, rejects Bearer authorization and calls the database authorize RPC before enabling private inputs. The database revalidates its separate flag, Auth session/user and one active referral-source membership. Only then may create atomically write the referral, separately protected contact, metadata-only audit and idempotency receipt; the UI renders only the metadata ACK/list. An authorization-boundary failure disables further submission. This path uses no OpenAI call, Points, service role, worker or background retry. It remains source/local only, with all gates and the database flag off and no hosted deployment.

The independently gated source-detail read closes that intake loop without
opening assignment. When both operation gates are enabled, the durable metadata
list links to the exact UUID detail page. A canonical referral UUID is sent to
the existing GET route; a detail-specific preauthorization RPC and the read RPC
each refresh the same database session and membership context, check master +
detail, and the latter returns the
private summary/contact only when the referral belongs to that exact source
organization. A missing UUID and another tenant's UUID both become the same
not-found result. Error bodies are never parsed into browser detail state, and
the durable page never falls back to a mock record. This is also source/local
only and does not enable triage, offer, provider response, follow-up or audit.

The same migration adds `referral_intake_v1` and replaces the old private
intake gate helper, so authenticated callers cannot bypass the application by
calling Data API list/create directly while only master + detail is enabled.
Intake authorize/list/create now require master + intake; neither operation gate
opens the other.

Assignment M1a adds a third independent operation gate. With every Preview and
assignment gate open, `/referrals` reads a maximum of 50 `SUBMITTED`, `TRIAGED`
or `OFFERED` referrals from the caller's database-derived operator scope. A
platform admin in one active PLATFORM organization receives the global queue;
a partner operator in one active REFERRAL_SOURCE organization receives only
that source tenant. Zero, multiple or mixed operator contexts fail closed. The
queue contains only referral/source metadata. Opening
`/referrals/{id}/matches` performs a separate authorized detail read before
rendering summary/contact, and missing/cross-tenant identifiers share the same
not-found result. Gate-on pages do not fall back to legacy mock data.

Because `/referrals` is still shared with the source-role surface, the
page-level Assignment latch additionally requires both source-role UI gates to
be off. A simultaneous UI configuration therefore fails closed instead of
sending a source user into the operator queue. The request-scoped Assignment
API operation gates remain independent and still enforce database-derived
operator authorization.

From `SUBMITTED`, triage atomically advances the expected row version to
`TRIAGED`. The next authorized candidate read returns only IDs and trimmed
display names for active approved providers with AVAILABLE/LIMITED capacity,
the exact region/service and at least one active provider member. Offer reuses
that same eligibility authority, serializes the referral and its matches, and
either promotes one existing `CANDIDATE` or creates one `OFFERED` match. It
advances the referral to `OFFERED` but deliberately leaves
`assigned_provider_id` null. Each mutation writes one metadata-only audit row
and one hashed idempotency receipt; exact replay is stable, changed payload is a
conflict and stale version refreshes the authoritative detail. Provider
accept/decline, follow-up, audit listing, document/export and completion remain
outside M1a.

Provider Response M1b adds a fourth independent operation gate without opening
the operator or source surfaces. After the base, durable, exact Preview-ref and
provider-response gates pass, `/provider-portal` requests at most 50 offers for
the exact database-derived approved provider through
`GET /api/portal/referral-offers` and
`portal_referral_provider_response_offers(integer,uuid)`. Each item contains only match and
referral IDs, frozen region/service codes, match/referral status and referral
row version. This is one bounded first-page snapshot: live `OFFERED` rows are
selected before `ACCEPTED` history, then the strict DTO is returned in ascending
match-ID order. The frozen cursor argument rejects non-null values; M1b does not
yet expose pagination. It never includes source identity, summary or contact
and never falls back to a legacy provider fixture.

An `OFFERED` item can be answered at
`POST /api/portal/referral-offers/{matchId}/response` with only `ACCEPT` or
`DECLINE`, the expected referral version and a transport idempotency key; the
database mutation is
`portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)`.
The request-scoped Cookie
adapter rejects Bearer before client creation; the database independently
revalidates the Auth session, one active `provider_member`, its active PROVIDER
organization and its APPROVED provider binding. `ACCEPT` atomically advances
both match and referral to `ACCEPTED` and sets `assigned_provider_id` from that
database context. `DECLINE` marks the match `DECLINED`, returns the referral to
`TRIAGED` and leaves it unassigned. Each success writes one hash-only receipt
and metadata-only audit event; stable replay returns the original ACK. Private
provider detail, follow-up, notifications, audit listing, document/export and
Note/Points remain outside M1b. While a response is pending, manual refresh and
other offer decisions are locked. If transport outcome is uncertain, the UI
retains the exact original command and idempotency key within the same browser
authorization epoch; other decisions stay blocked until an authoritative
refresh resolves it or the same response is replayed for receipt-safe
reconciliation. Focus, visible-tab, auth-storage and persisted-page lifecycle
events synchronously clear the old projection and command before
reauthorization. Even when a new user belongs to the same provider and sees the
same offer, the prior user's key is never restored; a still-actionable offer
must create a new command.

Follow-up M1c adds a fifth independently gated application operation without
widening the M1b inbox or the operator/source roles. An eligible accepted item
links to `/provider-portal/referrals/{referralId}` only while the Follow-up gate
is open. The nested page has no mock fallback and loads
`GET /api/portal/provider-referrals/{referralId}`; the database returns private
summary/contact only for the exact assigned approved provider with one coherent
accepted match and `ACCEPTED | IN_PROGRESS` state. The page records one fixed
outcome through `POST /api/portal/referrals/{referralId}/follow-ups`, then
re-reads authoritative detail.

The client never accepts free text, a due date, actor/provider identity or
history. Network uncertainty retains only referral/status/version, outcome and
the same idempotency key, not summary/contact. Any failed authoritative read
clears the private snapshot and replay key; focus, visible-tab, auth-storage and
persisted-page events synchronously clear state before reauthorization. Render
state is also bound to the current referral ID, so a reused A→B component cannot
briefly expose A's contact or submit A's command under B's URL.

At historical pre-review exact source
`cc1e53cc88666a3e3f18ac55058295db408535ee`, this M1b flow passed a separate
deleted no-data Hosted gate on Preview ref
`aupndcptwlqmjlgeifdj`: 33/33 migrations, 14/14 rollback suites and the real
local-HTTPS Next/GoTrue SSR-cookie/Data API matrix with independent Provider A
and B sessions. The matrix covered no-cookie and Bearer denial, exact
tenant-scoped/no-PII inboxes, cross-provider not-found, invalid transport, stale
and idempotency conflicts, stable ACCEPT/DECLINE replay, exact final lists/database
hashes and global-session revocation of saved old cookies, including Provider
A's Cookie carrying a still-unexpired access JWT. Teardown
left the four Auth tables and 11 Portal business tables at zero, all five flags
off/Preview-only and all three append-only triggers enabled; three consecutive
probes confirmed deletion. Security advisors returned 21 INFO / 17 WARN,
including three narrow authenticated M1b `SECURITY DEFINER` WARN; performance
advisors returned 105 INFO / 24 WARN, with zero ERROR. Production remained
unchanged at 19 migrations. This closes only the disposable Hosted evidence
gate: M1b remains default-off and Production-unapplied, with no retained
Preview/runtime, deployment, merge or activation. Private accepted detail,
follow-up, notifications, audit listing and document/export remain outside the
flow.

Post-review source `f45b19c596edd0bdbe01eba17e6e5fa136df5225`
adds the active-offer-first bounded snapshot, 10-second request/body timeout,
principal-boundary lifecycle clearing, unique safe action names and a retained
local-only PostgreSQL 16 concurrency harness. It passed 8 focused files / 271
tests, the full 143-file / 1,935-test suite, TypeScript, lint, the 64/64-page
production build, 73-file adapter sync and diff checks. PostgreSQL 16.15 passed
the seven-migration chain, all four Portal rollback suites and 6/6 real
two-backend response races. Exact gate source HEAD
`44f3bd68699dc953e2666bf033dac2b5e26a4d30` then passed the post-review Hosted
re-gate on deleted no-data Preview `portal-provider-response-m1b-r2-20260826`
(id `fb2e7d39-436d-48d5-a890-ad53b23b1fc6`; ref
`nhupgyxczlvtddycrgyw`). The exact 33/33 migration chain and 14/14 rollback
suites passed, followed by the historical real Cookie/Data API assertions
14/14 and exact-current active-first/non-null-cursor checks 2/2. The final
postcheck left four Auth tables and all 11 Portal fixture domains at zero, all
five flags off/Preview-only, all three append-only triggers enabled, zero API
Portal table grants and zero temporary migration roles. Final Advisors were
21 INFO / 17 WARN / 0 ERROR for security and 106 INFO / 24 WARN / 0 ERROR for
performance. Three consecutive deletion probes found both branch id and ref
absent; Production remained the default `ACTIVE_HEALTHY` project at the same
19 migrations.
This closes the post-review Hosted evidence prerequisite only; it does not
authorize merge, deployment, activation or Production application.
The later focus/sign-in UI recovery in the current PR postdates exact gate
source `44f3bd6`, has local-only evidence and is not claimed by that gate.

## 12. Legacy Profile / Readiness / Referrals

These Web routes keep their current profile, access-code, guided material and outreach flow for regression compatibility. They are not part of App parity, do not create canonical AI Note documents and must not grant or debit the personal V1 Points wallet unless a future approved contract explicitly adds that service.

## 13. Legacy NDIS projection (Preview-only shadow)

`projectLegacyNdisDraftToCanonical` parses an existing `feature='ndis_case_note'` saved material through the current safe parser. The guarded server integration uses only that validated projection. It preserves English formal wording and available Simplified Chinese review wording, never invents original structured facts, and always leaves self-review `REQUIRED`; legacy `reviewed` or `archived` never becomes V1 approval.

The sequence is: legacy owner save -> deterministic source-version mutation identity -> service-role projection RPC -> metadata-only outbox -> optional hash comparison. The RPC obtains the source advisory lock before reading and row-locking the current legacy source. Replay is valid only while its projected revision is still current. Same content with a newer source status/timestamp updates mapping metadata without a revision; changed content, including A→B→A under a new source version, appends one revision. Stale source metadata/base returns `STALE`. `FAILED`, timeout, missing and mismatch never alter the legacy HTTP response. Reconciliation is read-only and operator-run; no background worker exists.

Historical isolated database evidence covers first projection, same-key replay, distinct-content concurrent revisions, malformed projection failure, match/mismatch/missing comparisons and reconciliation output. A later protected App Preview also proved legacy response parity, provider isolation and the kill switch. The source-version/CAS/delete hardening added by final pre-commit review postdates that deployment. It was forward-applied to the retained empty branch and passed updated transactional assertions for A→B→A, stale replay, comparison correlation reuse, source-bound owner RLS, strictly idempotent generation-bound tombstoning, same-ID/new-generation ABA, terminal PURGED preservation and metadata-only `SOURCE_DELETE_CLEANUP_PENDING` reporting. A new protected route-level Preview is still required before any Production promotion.
