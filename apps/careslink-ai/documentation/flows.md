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

Copy actions are available for current result/saved content. There is no DOCX, PDF or TXT renderer, revision-bound export job, artifact TTL, safe filename policy, export history or batch export.

### Inactive shadow contract

The schema draft separates `export_jobs` from append-only `export_events`, binds both to owner/document/revision and defines DOCX/PDF/TXT/COPY terminal states. It contains no renderer, artifact storage, download route or file bytes.

### Intended runtime / not implemented

Export must bind to a specific revision and shared renderer/template version. Record Copy excludes privacy findings, internal facts analysis, Points and model metadata by default. Portal downloads and App Share Sheet use the same artifact profile. External files are static snapshots and never sync changes back.

## 7. Points and entitlements

### Current reality

`account_entitlements` lazily creates a monthly `free` allowance. `credit_ledger` records grant/reserve/commit/release. The client can read only its own entitlement/ledger; service-role RPCs own writes and use transaction/advisory-lock/idempotency controls.

### Inactive shadow contract

The TypeScript shadow store and Production-unapplied migration define wallets, lots, versioned rates, quotes, allocation rows, reservations and an append-only ledger. On a disposable Supabase branch, real service-role RPC tests proved earliest-expiring lot allocation, quote/reserve/commit, quote/reserve/release to original lots, replay safety, conflicting replay rejection, expiry, insufficient balance and cross-owner denial. Real JWT tests proved owner-only reads and denied direct writes/RPC execution to anon, providers and a test-only platform service actor. No welcome lot was automatically granted and the current monthly credit system remains the sole runtime entitlement.

### Intended runtime / not implemented

One wallet owns multiple point lots. A versioned server rate catalog returns a quote before reservation. Reserve allocates from approved lots; successful persisted output commits; no usable result releases to the same lots. Free account receives one-time 300 welcome Points. Pro and top-ups arrive only through normalized entitlements after provider receipt verification. Existing credit history remains immutable and is migration-mapped, not rewritten.

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
two-backend response races. These are local post-review results only; the
deleted `cc1e53c` Hosted run does not cover this source, so a new authorized
no-data Hosted re-gate remains mandatory before merge or promotion.

## 12. Legacy Profile / Readiness / Referrals

These Web routes keep their current profile, access-code, guided material and outreach flow for regression compatibility. They are not part of App parity, do not create canonical AI Note documents and must not grant or debit the personal V1 Points wallet unless a future approved contract explicitly adds that service.

## 13. Legacy NDIS projection (Preview-only shadow)

`projectLegacyNdisDraftToCanonical` parses an existing `feature='ndis_case_note'` saved material through the current safe parser. The guarded server integration uses only that validated projection. It preserves English formal wording and available Simplified Chinese review wording, never invents original structured facts, and always leaves self-review `REQUIRED`; legacy `reviewed` or `archived` never becomes V1 approval.

The sequence is: legacy owner save -> deterministic source-version mutation identity -> service-role projection RPC -> metadata-only outbox -> optional hash comparison. The RPC obtains the source advisory lock before reading and row-locking the current legacy source. Replay is valid only while its projected revision is still current. Same content with a newer source status/timestamp updates mapping metadata without a revision; changed content, including A→B→A under a new source version, appends one revision. Stale source metadata/base returns `STALE`. `FAILED`, timeout, missing and mismatch never alter the legacy HTTP response. Reconciliation is read-only and operator-run; no background worker exists.

Historical isolated database evidence covers first projection, same-key replay, distinct-content concurrent revisions, malformed projection failure, match/mismatch/missing comparisons and reconciliation output. A later protected App Preview also proved legacy response parity, provider isolation and the kill switch. The source-version/CAS/delete hardening added by final pre-commit review postdates that deployment. It was forward-applied to the retained empty branch and passed updated transactional assertions for A→B→A, stale replay, comparison correlation reuse, source-bound owner RLS, strictly idempotent generation-bound tombstoning, same-ID/new-generation ABA, terminal PURGED preservation and metadata-only `SOURCE_DELETE_CLEANUP_PENDING` reporting. A new protected route-level Preview is still required before any Production promotion.
