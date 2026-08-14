# Portal-first release checkpoint

Date: 2026-08-14

Branch: `codex/careslink-ai-mobile-sync-v1`
Base HEAD inspected: `fe5b708c488853418bfec3822369429e8fe9ff8f`

This checkpoint covers the AI Web Portal reality audit, release sequencing and
the local Referral workflow foundation. It does not modify the native App,
Main Website, Native Auth/M0 implementation or shared Product API routes. Those
are prerequisites recorded in the existing versioned contract documentation.
All Referral capabilities remain local, default-off and unapplied. No database,
Preview deployment or Production system was contacted.

## 1. Portal reality matrix

“Real” below means the source can persist to Supabase when its existing server
configuration is present. It does not mean current Preview or Production
availability.

| Portal surface | Current data | Real submit/update | Current safety and workflow gap | First replacement |
|---|---|---:|---|---|
| `/providers`, `/providers/[id]` | `mock-data` | No | Unknown IDs fall back to the first mock provider; no provider table, membership or RLS | Real provider detail after M0 membership; unknown IDs return 404 |
| `/providers/onboarding`, `/providers/review` | static/mock | No | Forms/buttons imply a save/review that does not occur | Add canonical provider profile and admin review command after identity proof |
| Provider profile generator | mixed: real `provider_drafts`, mock editing seed | Partial | Draft handoff can use an in-memory fallback and is not a canonical provider | Treat claimed draft only as intake seed |
| `/provider-portal` | mock referrals | No | Accept/decline/request-info controls do nothing; provider identity is not DB-bound | Owner-scoped offered referrals plus atomic response command |
| `/referrals`, `/referrals/intake`, `/referrals/[id]`, match page | mock plus pure scoring function | No | No referrals/matches/status/audit tables; invalid detail ID can show the first mock | First Portal workflow replacement: real intake, triage, offer and response |
| `/referral-source-portal` | mock | No | Buttons do not submit; apparent requests are lost | Reuse the same versioned create-referral command as intake |
| `/referral-workspace/*` | mixed real access/material/outreach stores | Yes, for those tools | These are AI access and outreach tools, not the referral pipeline; some stores have memory fallback | Preserve and later link by canonical referral ID |
| `/admin`, `/dashboard` | mock global metrics | No | Core pages have no real referral permission gate; must not receive real data yet | Add membership gate, then replace only the assignment queue |
| Admin access requests/material usage | real/mixed | Yes | Manages AI access/metadata, not providers or referrals | Reuse its auth-first action pattern, not its business schema |
| `/plan-and-usage` | legacy credits | Read-only | Current product is 3 legacy credits, not a 300-Point wallet | Do not show both systems; freeze 300-Point product rule before cutover |
| NDIS Case Note | real legacy server flow | Generate/save | Uses synchronous model and old credits; saved draft is flat JSON and canonical projection is best-effort | Preserve legacy while canonical write remains default-off |
| Other four Note types | catalog/contract only | No | Communication, Handover, Progress and Incident Factual lack complete server jobs and golden sets | Implement one type-specific job at a time after M0/M1 |
| `/ai-documents` | real legacy generated drafts | Delete only | Not canonical documents; store errors can appear as an empty list; no revision/export | Feature-gated canonical list only after current Preview evidence |
| Shared `/v1` documents/sync | local durable adapter | Default-off | Exact current migrations are unapplied; write grants withheld; no current base URL | M0 permits only me/list/pull after all identity/RLS gates pass |
| Library/Guides/Updates | absent | No | No page, store, content version or API | After referral + Notes/documents/export |
| Account export/delete | absent | No | No request/status/recovery flow | Later privacy/account slice |

Two immediate Portal safety rules follow from this matrix:

1. A page may not silently fall back from real storage to mock or process
   memory in a user workflow.
2. A missing record must return an explicit not-found state; it must never show
   the first fixture.

## 2. Activation dependencies

Referral activation depends on the separately versioned Native Auth/M0 and
shared Product API contract. This foundation does not alter those contracts,
routes, flags or grants. In particular:

- the existing workspace fallback role resolver is not authoritative for the
  new Portal roles;
- native redirect allowlists and the current Preview base URL remain absent;
- Product API operation flags remain default-off and document write grants
  remain withheld;
- `/v1/me`, current-session proof and cookie/Bearer identity parity must pass on
  the exact same disposable Preview revision before Referral can be enabled.

## 3. Referral vertical slice

### Additive data model

- `portal_organizations`
- `portal_organization_memberships`
- `portal_providers`
- `portal_referrals`
- separately protected `portal_referral_contacts`
- `portal_referral_matches`
- append-only `portal_referral_followups`
- `portal_mutation_receipts`
- append-only `portal_audit_events`
- `portal_referral_document_links`
- `portal_referral_exports`

Owner, actor and role always come from the active server session and current
database membership. They are forbidden in mutation bodies. Organization
status/type and provider approval are rechecked for every operation. Contact
name/phone/email is separated from the referral row and is hidden from a
provider until that exact approved provider accepts the offer. Before
acceptance, the provider sees no free-text summary; only one of three frozen
Preview region codes and one of three frozen service-type codes can be exposed.
The private summary also rejects copied contact names, email and phone-like
values. These are narrow structural guards, not a claim of complete
de-identification.

### State machine

```text
SUBMITTED → TRIAGED → OFFERED → ACCEPTED → IN_PROGRESS
          ↑          └─ provider decline ─┘

IN_PROGRESS → NOTE_LINKED → EXPORTED → COMPLETED
```

Match status is separate from match score:

```text
CANDIDATE → OFFERED → ACCEPTED | DECLINED | WITHDRAWN | EXPIRED
```

A low matching score is not a provider decline. Unique partial indexes permit
at most one offered and one accepted provider per referral. Every mutation uses
an expected row version, an idempotency key and one append-only audit event.
Mutation responses and replay receipts contain only referral/match IDs, status,
version and timestamp; the request payload is represented by a SHA-256 hash,
not copied into the receipt. Contact data is obtained only through a newly
authorized read.

### Roles

| Role | Minimum visibility/action |
|---|---|
| Platform admin | Global workflow metadata; triage/offer; no implicit AI Note ownership |
| Partner operator | Tenant-scoped membership in a referral-source organization; only that tenant's referrals; triage/offer |
| Referral source | Create/read referrals in its organization; no provider assignment |
| Provider member | Minimal offered referral; respond only to its own offer; contact only after acceptance |

The foundation migration enables RLS but grants no table read/write privilege
and creates no state-changing RPC. Read policies and active-session membership
helpers are present for disposable-Preview testing. A later activation
migration must add narrow atomic commands that write business row, receipt and
audit in one transaction. Their execute grants remain withheld.

### Acceptance gates

- anonymous, wrong role, Source B and Provider B cannot read A;
- revoked session fails before request parsing;
- concurrent provider accepts result in exactly one accepted match;
- same-key replay is stable; changed payload conflicts; stale version is 409;
- each successful command writes exactly one metadata-only audit event;
- audit/receipt/correlation contain no contact, Note or token;
- a declined provider loses referral and child-row visibility immediately;
  an exact retry of the decline mutation may return only its original
  metadata-only ACK so transport idempotency remains stable;
- an offered provider can read only its own match and never another candidate;
- organization suspension/provider suspension fails closed on the next request;
- no authenticated direct write and no accidental function execute grant;
- Portal cookie and App Bearer resolve to the same principal/member;
- invalid route ID is not found, never fixture fallback.

### Rollback points

- app, operation and database gates all default off;
- migration is additive and does not import mocks or mutate legacy rows;
- activation grants must be in a separate migration;
- rollback disables capability/grants without deleting audit evidence;
- pages are replaced one at a time: intake, assignment, provider response,
  follow-up, then canonical document/export.

## 4. Shared contract boundary

The Referral foundation does not introduce a Portal-only document or sync
contract. Future referral-to-Note/document links must use the same versioned
canonical document IDs and Product API rules as the App. Sync push, document
writes and native auth remain outside this foundation and disabled. Any future
breaking contract change requires an impact fixture before App handoff.

## 5. Notes, 300 Points and later shared content

### AI Notes

The five shared codes are Communication, Handover, Progress, NDIS and Incident
Factual. Only the legacy NDIS flow currently has a real server generation/save
path. The other four are catalog contracts, not usable server jobs. After M0
and the referral persistence slice, implementation order is:

1. one type-specific async Note job with privacy proof and recovery;
2. canonical first/result revision and checkpoint;
3. revision-bound DOCX/PDF/TXT export;
4. repeat with golden input/output/privacy sets for each remaining type.

No real model call is authorized in this task.

### 300 Points

The live Portal source currently displays a legacy allowance of 3 credits. The
shadow Points model does not currently define or grant a 300-Point welcome or
monthly balance. “300 Points” therefore remains a product decision requiring
one precise definition: eligibility, one-time versus recurring, expiry,
refund/revoke behavior and rate catalog. Until that is frozen and reconciled:

- do not cut over;
- do not show old credits and new Points together;
- do not grant 300 Points in a migration;
- keep all Points operations contract-only/default-off.

Library, Guides, Updates, notifications and account export/delete follow the
Notes/document/export slice and use the same versioned contract, not Portal-only
sync rules.

## 6. First safe local batch and evidence

Referral foundation included in this batch:

- pure referral state machine with metadata-only replay, stale, A/B, declined
  access removal, multi-follow-up, role/provider eligibility, contact-summary
  rejection, frozen Preview catalog codes, sequential competing-decision
  rejection and failure rollback tests;
- unapplied Portal referral foundation migration with RLS and all writes withheld;
- rollback-only SQL assertions for A/B, contact visibility, revoked session and
  direct-write denial.

Formal local gates passed:

| Command | Result |
|---|---|
| focused Referral tests | 2 files / 28 tests passed |
| `pnpm test` | 107 files / 938 tests passed |
| `pnpm exec tsc --noEmit --incremental false` | passed |
| `pnpm lint` | passed |
| `pnpm build` | passed; Next static generation 61/61 |

The SQL assertion script has not been executed because no authorized fresh
disposable Preview target or credentials are present.

## 7. Disposable Preview entry criteria

Do not provide a base URL to App/Main until all are true at the same revision:

1. a fresh disposable non-Production Supabase branch is identified and approved;
2. the exact current migration set clean-applies;
3. transactional assertions and ACL/RLS/SECURITY DEFINER negatives pass;
4. Source A/B, Provider A/B, platform-admin and revoked-session fixtures prove
   organization, provider, contact and child-row isolation;
5. replay, stale-version and competing accept/decline behavior pass against the
   database implementation once narrow state-changing RPCs exist;
6. Web cookie and App Bearer resolve to the same principal and membership;
7. cleanup returns test users, sessions and Referral rows to zero;
8. Referral, Product writes, AI, Points, billing and sync push remain disabled
   until a separately reviewed activation migration and route slice exist.

The historical protected Preview evidence remains useful but does not satisfy
these exact-current-revision gates and is not Production approval.
