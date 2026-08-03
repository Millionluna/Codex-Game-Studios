# Verification Map

## Existing coverage

| Use case | Rule and expected deny case | Evidence | Status |
| --- | --- | --- | --- |
| Browser Privacy Review | Matched ranges stay local; direct/indirect/evaluative clues are found and cleaned | `src/lib/ndis-case-note-browser-privacy.test.ts` | Existing automated |
| Full Chinese acceptance case | Names, phone, NDIS number block; location/context require review; observable facts remain | Same test file | Existing automated |
| Pre-generation closure | Missing date/facts, unresolved findings, or unchecked confirmations produce no request object | Same test file | Existing automated |
| Server bypass | Missing attestation/facts and crafted PII return `422` before session, quota, or OpenAI | `src/app/api/template-companion/ndis-case-note/route.test.ts` | Existing automated |
| Anonymous quota | First use succeeds; over-limit request returns `429`; failed generation still consumes paid-attempt quota | Route and store tests | Existing automated |
| OpenAI contract | Request uses `store:false`, strict schema, bounded output, controlled prompt | `src/lib/openai-ndis-case-note.test.ts` | Existing automated with mocked HTTP |
| Output safety | Malformed, PII, prohibited conclusions, and bilingual numeric mismatch reject the whole result | `src/lib/ndis-case-note-companion.test.ts` | Existing automated |
| Claim ownership | Expiry and same-owner binding; cross-owner claim denied | `src/lib/ndis-case-note-companion-store.test.ts`, save route tests | Existing automated |
| Provider save | Signed-out/admin denied; provider save idempotent and owner-scoped | Save route tests | Existing automated |
| Telemetry privacy | Events contain metadata and no generated content/input | Store/event route tests | Existing automated |
| Admin isolation | Material usage uses metadata and excludes NDIS case-note details | Admin/material store tests | Existing automated |
| Responsive product shell | Public task flow, unchecked confirmations, no demo cards | Companion static render plus guarded 1440/390 smoke | Existing automated/manual |

Current local gate result for this RC worktree: 76 Vitest files and 456 tests passed, followed by TypeScript, ESLint, and Next build.

## Release-candidate live checks

| Check | Type | Expected result |
| --- | --- | --- |
| One real OpenAI synthetic generation | Guarded live, 3 August 2026 | Passed locally: privacy gate `422`, server PII bypass `422`, safe generation `200`, six fields returned, numeric parity and output boundaries passed, repeat anonymous request `429` |
| Vercel Preview page and API | Guarded live | Public page `200`; PII denial `422`; safe generation `200` |
| Preview claim/login/save | Guarded live | Provider owns saved draft; second provider cannot claim/read it |
| Preview quota | Guarded live | Second anonymous attempt for same identity returns `429` |
| Preview cleanup | Manual/SQL verification | Temporary accounts, claims, drafts, events, and quota rows removed |

The local live check used only synthetic de-identified facts. Its evidence records statuses, field names and lengths, token counts, and cleanup state; it does not retain input or generated wording. The exact claim, quota, and telemetry rows created by that check were deleted and verified absent afterward.

## Gaps

| Priority | Gap | Exposure |
| --- | --- | --- |
| P1 | Heuristic privacy rules cannot cover every direct or indirect identifier | A user could submit an undetected identifying clue; manual review remains mandatory |
| P1 | Service-role owner filtering is not enforced by provider-facing RLS because provider roles have no direct table grants | A future server route omitting `user_id` could expose another owner's content |
| P2 | IP/device quota behavior varies behind shared proxies and privacy tools | False positives or lower abuse resistance |
| P2 | No end-to-end browser test is currently a repository CI job | UI interaction regressions rely on release smoke |
| P2 | This repository has no merge-gating workflow for the CaresLink AI test/build commands | Local/preview gates must be run explicitly before merge |
