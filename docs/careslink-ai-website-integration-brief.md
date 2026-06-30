# CaresLink AI Website Integration Brief

Date: 2026-06-25  
Project: CaresLink AI  
Audience: Website technical lead / implementation thread

## 0. Latest Cross-Thread Sync - 2026-06-29

Source thread: `Careslink AI`  
Primary controller thread: `Core`  
AI project path: `C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai`  
Current AI branch: `codex/auth-access-gate-v0.1`

### Current AI-Side Implementation Status

The CaresLink AI workspace now supports the public provider generator handoff contract:

```text
source=provider-profile-generator
draftId=<provider-draft-id>
```

The AI side can now:

- Accept provider generator handoff on `/referral-workspace/profile`.
- Persist provider drafts through `POST /api/provider-drafts`.
- Resolve provider drafts by `draftId` through `provider_drafts`.
- Reuse the same draft across:
  - `/referral-workspace/profile`
  - `/referral-workspace/health`
  - `/referral-workspace/materials`
  - `/referral-workspace/access`
- Use Supabase-backed storage when env vars are present.
- Fall back to a shared in-memory local store when Supabase env vars are absent.
- Keep private lead capture fields out of public URLs.
- Preserve the wording boundary: general business profile / operational support only; no approved, compliant, verified, guaranteed, certified, endorsed, or clinical-advice claims.

The AI workspace v0.2 pilot polish is now in place:

- Real Supabase provider sessions no longer show demo account cards, preview account shortcuts, legacy demo hub links, or seeded demo provider records in the main workspace navigation.
- `/auth/login` and `/auth/register` keep the real email/password Supabase flow and hide demo account selection cards.
- The left navigation is role-aware:
  - Provider sessions see `Workspace`, `Profile`, `Readiness`, `Materials`, and `Access`.
  - Admin sessions see `Access requests` and `Material usage`.
  - Demo query-param fallback still exists for local testing and can show legacy demo routes, but it is not used when a real Supabase session is present.
- `/referral-workspace` is now a provider cockpit instead of a demo overview. It shows profile summary, readiness status, access status, saved material count, latest copy/review/archive metadata when available, and next action buttons.
- Admin `/referral-workspace` resolves to an admin cockpit with access request and material usage entry points, without provider demo records.
- No new OpenAI endpoint, marketplace, referral booking flow, provider endorsement, compliance decision, payment, clinical, legal, or care-advice feature was added in this polish pass.

The AI workspace v0.3 provider cockpit + profile rewrite pilot is now in place:

- `/referral-workspace/profile` includes a profile quality layer with profile completeness, missing-field signals, referral-readiness prompts, and clear separation between provider-submitted information and AI-generated draft wording.
- `POST /api/guided-materials/profile-rewrite` is implemented as a guarded AI endpoint.
- The profile rewrite endpoint uses the same gates as existing guided materials: verified Supabase provider session, provider role, rate limit, active access code and daily quota, claimed provider draft ownership, and server-only `OPENAI_API_KEY`.
- Profile rewrite output is structured JSON only: `professionalEnglishDescription`, `shortEnglishSummary`, `chineseCommunityIntro`, `referralPartnerSummary`, `profileImprovementNotes`, and `disclaimer`.
- Successful profile rewrite calls record `ai_usage_events.feature = profile_rewrite` and save `generated_material_drafts.feature = profile_rewrite`.
- `/referral-workspace/materials` shows an `Improve profile wording` guarded panel. Demo/free/waitlist sessions can preview locked state; verified approved providers with claimed drafts can call the endpoint.
- Saved draft history can display profile rewrite fields and reuse the existing metadata-only copy workflow.
- `/admin/material-usage` can show `profile_rewrite` metadata without exposing generated content JSON.
- No marketplace, booking, lead resale, care delivery, payment, clinical, legal, compliance advice, provider endorsement, or quality verification workflow was added.

The AI workspace v0.7 referral operating loop MVP is now in place:

- Provider navigation now includes `Referral Pack` and `Outreach` alongside Workspace, Profile, Readiness, Materials, and Access.
- `/referral-workspace/referral-pack` gives providers a post-profile material surface with the basic provider intro plus saved generated material drafts, browser copy controls, and a metadata-only "mark as sent" path.
- `/referral-workspace/outreach` gives providers a lightweight tracker for recipient name, organisation, recipient type, channel, send status, last contacted date, next follow-up date, and notes.
- `src/lib/outreach-store.ts` provides the `OutreachStore` abstraction with memory fallback, Supabase adapter, schema SQL, record normalization, and metadata-only records. It does not store generated content JSON.
- `POST /api/outreach-records` records outreach metadata for verified Supabase provider sessions only. It checks provider role, optional generated material ownership, claimed provider draft context, and then redirects back with status.
- Demo/query-param accounts can preview the Referral Pack and Outreach table, but cannot save real outreach records.
- `/referral-workspace` cockpit now shows Referral Pack readiness, sent outreach count, pending follow-ups, and next actions that route providers into Referral Pack or Outreach after profile/readiness/access basics.
- `/referral-workspace/materials` now reads a larger recent generated draft history window so saved draft status such as reviewed/archived remains visible when multiple material types exist.
- The visible boundary copy was tightened to positive product scope: general business profile and operational support only, with provider review required before using saved profile or material drafts.
- No new OpenAI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added.

The AI workspace v0.8 pilot usability polish is now in place:

- Outreach records are now maintainable, not just append-only. `POST /api/outreach-records` supports `mode=update` for provider-owned records.
- Providers can update outreach status, last contacted date, next follow-up date, and notes from `/referral-workspace/outreach`.
- The update path verifies a real Supabase provider session and record ownership before saving.
- Demo/query-param accounts can preview the update controls but cannot save real outreach updates.
- `/referral-workspace/referral-pack` now groups material cards by type: profile intro, profile rewrite, referral message, share card, bilingual intro, and handover checklist.
- Referral Pack now has a clearer empty/generated-draft state: the provider can still use the basic profile intro and is guided to Materials when they need more tailored drafts.
- After a successful mark-as-sent action, Referral Pack presents a next action into Outreach.
- Cockpit follow-up wording now makes pending follow-up status clearer as a next action.
- No new OpenAI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added.

The AI workspace v0.9 real pilot readiness check is now complete:

- The remote Supabase project `adocsnwnslxhxcjgbyee` now has the `outreach_records` migration applied.
- `public.outreach_records` exists remotely and is used by the Supabase-backed outreach store.
- Local real Supabase provider-session smoke passed for outreach create, update, readback, and cleanup.
- Vercel Preview environment variables were aligned with Production for the AI workspace project so preview deployments can use the same Supabase auth and server-side stores.
- A new Vercel preview deployment is live at `https://careslink-8f3cr9107-millionlunas-projects.vercel.app`.
- Protected preview access can be opened through the temporary Vercel share URL `https://careslink-8f3cr9107-millionlunas-projects.vercel.app/?_vercel_share=pu9emw0hSgxNpockA60yV3U9df3mecNU` until 2026-06-30 12:48 PM.
- Real preview API smoke passed with a temporary Supabase provider user: `POST /api/outreach-records` saved metadata-only outreach, updated it to `follow_up`, read it back from remote Supabase, and cleaned up the test user and record.
- No new AI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added.

The AI workspace v1.0 production deployment is now live:

- Production deployment ID: `dpl_5xjWAkBYyjDeVHHCZSbzr4TsKpAx`.
- Production URL: `https://ai.careslink.com.au`.
- Vercel production deployment URL: `https://careslink-fdo75tnic-millionlunas-projects.vercel.app`.
- Production build completed successfully on Vercel and was aliased to `https://ai.careslink.com.au`.
- Production smoke passed for the login page and unauthenticated outreach API gate.
- Production real provider-session smoke passed with a temporary Supabase provider user: `POST /api/outreach-records` saved metadata-only outreach, updated it to `follow_up`, read it back from remote Supabase, and cleaned up the test user and record.
- No new AI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added during production deployment.

Post-smoke auth routing polish is now in place:

- `/auth/login?next=/admin/material-usage` now respects the safe internal admin next route for verified Supabase admin sessions.
- If no safe next route is present, verified admin sessions fall back to the admin cockpit at `/referral-workspace` instead of provider profile.
- Provider sessions still fall back to `/referral-workspace/profile`.
- Provider sessions are not redirected into admin routes from `next`.

The AI side also has the first draft-claiming implementation:

- `POST /api/provider-drafts/claim`
- Verified Supabase bearer users can claim an existing provider draft without sending a demo `accountId`.
- Local/demo provider accounts can still claim an existing provider draft only when demo auth is enabled and the store is not persistent Supabase.
- Claimed drafts store `owner_user_id`, `claimed_at`, and `status='claimed'`.
- Claimed drafts cannot be overwritten by later public handoff payloads.
- `/referral-workspace/profile`, `/health`, `/materials`, and `/access` can resolve the signed-in account's claimed draft even when no `draftId` is present in the URL.
- Admin demo accounts cannot claim provider drafts.
- Provider/admin role for real auth is read from Supabase `app_metadata` (`careslink_role` or `role`), not user-editable metadata.

The AI side now also has the first real Supabase login/register implementation:

- `@supabase/ssr` is installed and pinned at `0.12.0`.
- `/auth/login` has an email/password Supabase sign-in form.
- `/auth/register` has an email/password Supabase sign-up form.
- Auth forms preserve `source`, `draftId`, `next`, and `lang` handoff context.
- Workspace pages resolve the verified Supabase cookie session first, then fall back to local/demo query-param accounts for preview/development.
- Real session users are mapped into CaresLink workspace accounts via `auth.getUser()`.
- Provider/admin role continues to come only from Supabase `app_metadata`, not user-editable metadata.
- When a real Supabase UUID user opens a provider generator handoff draft, the workspace can auto-claim the unowned draft for that user so later draftId-free workspace visits can resolve the same provider draft.
- Demo account ids are not auto-claimed into `owner_user_id uuid`.

The AI side now also has the first persisted access-control foundation:

- `src/lib/access-control-store.ts` provides a memory fallback and Supabase adapter for `access_requests`, `access_codes`, and `ai_usage_events`.
- `/referral-workspace/access` can save a real queued access request for verified Supabase provider sessions.
- Demo/query-param accounts still see the access request form as a locked preview.
- `/admin/access-requests` reads stored access requests and falls back to seeded demo requests only for demo admin preview when no stored requests exist.
- Real provider workspace access state is derived from stored active access codes plus same-day AI usage events.
- Verified Supabase admin sessions can approve stored requests, which creates active `access_codes`.
- Verified Supabase admin sessions can decline stored requests without issuing access.
- Guided AI routes can call `getGuidedAiAccessDecision()` and `recordGuidedAiUsageIfAllowed()` before any model request to enforce active access and daily quota.
- The first guarded OpenAI route is now implemented: `POST /api/guided-materials/share-card`.
- The share-card route requires a verified Supabase provider session, active access code, remaining daily quota, server-side rate limit, claimed provider draft ownership, and server-only `OPENAI_API_KEY`.
- Successful share-card generations record a `share_card` event in `ai_usage_events`.
- Successful share-card generations are also saved to `generated_material_drafts`, and the API response includes `generatedMaterialDraftId`.
- The second guarded OpenAI route is now implemented: `POST /api/guided-materials/referral-message`.
- The referral-message route uses the same verified session, provider role, access code, daily quota, rate-limit, claimed draft ownership, and server-only OpenAI key gates before any model call.
- Successful referral-message generations record a `referral_message` event in `ai_usage_events`, save the generated JSON to `generated_material_drafts`, and return `generatedMaterialDraftId`.
- The third guarded OpenAI route is now implemented: `POST /api/guided-materials/bilingual-intro`.
- The bilingual-intro route uses the same verified session, provider role, access code, daily quota, rate-limit, claimed draft ownership, and server-only OpenAI key gates before any model call.
- Successful bilingual-intro generations record a `bilingual_intro` event in `ai_usage_events`, save the generated JSON to `generated_material_drafts`, and return `generatedMaterialDraftId`.
- The fourth guarded OpenAI route is now implemented: `POST /api/guided-materials/handover-checklist`.
- The handover-checklist route uses the same verified session, provider role, access code, daily quota, rate-limit, claimed draft ownership, and server-only OpenAI key gates before any model call.
- Successful handover-checklist generations record a `handover_checklist` event in `ai_usage_events`, save the generated JSON to `generated_material_drafts`, and return `generatedMaterialDraftId`.
- AI output is returned as draft material for user review only, with the boundary: general business profile / operational support only.
- `/referral-workspace/materials` now shows guided share-card, referral-message, bilingual-intro, and handover-checklist generator panels for access-enabled providers.
- `/referral-workspace/materials` also reads the latest saved `share_card` generated draft for the signed-in account and shows it as a reviewable saved draft after refresh.
- `/referral-workspace/materials` now lists recent saved generated drafts across `share_card`, `referral_message`, `bilingual_intro`, and `handover_checklist`, so providers can revisit outputs without another OpenAI call.
- Saved draft history cards now expand the key generated fields and include browser clipboard copy controls for the full draft or individual fields.
- Saved draft copy controls do not call OpenAI or consume quota.
- For verified Supabase provider sessions, saved draft copy controls record metadata-only `copy_all` and `copy_field` events through `POST /api/generated-material-events`.
- The generated material event API requires a verified Supabase provider session and ownership of the generated material draft before writing.
- Demo query-param accounts can preview copy controls but cannot create real generated material events.
- Verified Supabase provider sessions can mark generated material drafts as `reviewed` or `archived` from the Materials history list.
- Review/archive status actions also record metadata-only generated material events for verified Supabase provider sessions.
- `/admin/material-usage` now gives admin users a pilot usage review view for saved generated material metadata: user ID, provider draft ID, feature, status, timestamps, and copy/review/archive event counts.
- `/admin/material-usage` intentionally does not render generated content JSON, so admin review does not become provider endorsement, service quality review, or referral outcome evidence.
- Demo query-param accounts remain read-only for generated draft status actions.
- Free/waitlist providers still see locked previews only.
- Demo `user-approved` access can preview the controls but cannot call OpenAI; generation is enabled only for verified approved Supabase provider sessions with a claimed draft.

### Implemented AI-Side Components

```text
src/lib/public-provider-profile-generator.ts
  Canonical public provider draft payload builder.

src/lib/provider-draft-store.ts
  ProviderDraftStore abstraction, Supabase adapter, memory fallback, save/resolve helpers.

src/lib/provider-draft-local-handoff.ts
  localStorage handoff parser for same-origin public generator -> AI workspace transfer.

src/app/api/provider-drafts/route.ts
  Server route for saving provider drafts.

src/app/api/provider-drafts/claim/route.ts
  Server route for binding an existing draft to the verified Supabase or local demo provider account.

src/lib/referral-workspace-server-auth.ts
  Server-side auth adapter. Verifies Supabase bearer tokens through `auth.getUser()` and provides a controlled local demo fallback.

src/lib/supabase-server.ts
  Supabase SSR cookie client helper using publishable/anon auth env values only.

src/lib/referral-workspace-session.ts
  Workspace session gate. Verified Supabase cookie session wins before demo account fallback.

src/lib/referral-workspace-auth-actions.ts
  Pure login/register auth action helpers, safe redirect validation, and Supabase password auth calls.

src/app/auth/actions.ts
  Server actions for login/register form submissions.

src/app/auth/login/page.tsx
src/app/auth/register/page.tsx
  Real email/password auth forms, localized copy, handoff-preserving hidden fields, and no demo account cards in the visible login/register flow.

src/components/app-shell.tsx
  Role-aware workspace shell. Real provider sessions see only provider workspace routes, real admin sessions see only admin routes, and demo query-param fallback can still expose local preview/legacy demo routes.

src/components/provider-draft-handoff-persister.tsx
  Client-side bridge that reads localStorage handoff and posts it to the API.

src/app/referral-workspace/profile/page.tsx
src/app/referral-workspace/health/page.tsx
src/app/referral-workspace/materials/page.tsx
src/app/referral-workspace/access/page.tsx
  Workspace pages now mount the handoff persister and resolve drafts through draftId.

src/app/referral-workspace/page.tsx
  Provider cockpit for the signed-in workspace. It summarizes the claimed provider profile, readiness status, access state, saved generated material count, latest saved material metadata, and next actions without showing demo account/provider records to real sessions.

src/lib/access-control-store.ts
  Access request, access code, and AI usage audit store abstraction with Supabase adapter and memory fallback.

src/app/referral-workspace/access/actions.ts
  Server action for saving queued access requests for verified Supabase provider sessions.

src/app/admin/access-requests/page.tsx
  Admin queue reads stored access requests before seeded preview requests and shows real review actions only for verified Supabase admin sessions.

src/app/admin/access-requests/actions.ts
  Server action for approving or declining stored access requests. Approval creates an active access code.

src/app/admin/material-usage/page.tsx
  Admin-only saved material usage review page. Shows generated material metadata and summary counts without rendering generated content.

src/lib/guided-ai-rate-limit.ts
  In-memory server-side rate limiter for guided AI routes. Default is 6 requests per minute per account, configurable with `GUIDED_AI_RATE_LIMIT_PER_MINUTE`.

src/lib/openai-share-card.ts
  Server-only OpenAI Responses API adapter for structured share-card JSON output.

src/lib/openai-referral-message.ts
  Server-only OpenAI Responses API adapter for structured referral-message JSON output.

src/lib/openai-bilingual-intro.ts
  Server-only OpenAI Responses API adapter for structured bilingual-intro JSON output.

src/lib/openai-handover-checklist.ts
  Server-only OpenAI Responses API adapter for structured handover-checklist JSON output.

src/lib/openai-profile-rewrite.ts
  Server-only OpenAI Responses API adapter for structured profile-rewrite JSON output.

src/app/api/guided-materials/share-card/route.ts
  Protected API route for generating a provider share-card draft after login, ownership, access-code, quota, and rate-limit gates pass.

src/app/api/guided-materials/referral-message/route.ts
  Protected API route for generating a referral partner message draft after the same login, ownership, access-code, quota, and rate-limit gates pass.

src/app/api/guided-materials/bilingual-intro/route.ts
  Protected API route for generating a bilingual provider intro draft after the same login, ownership, access-code, quota, and rate-limit gates pass.

src/app/api/guided-materials/handover-checklist/route.ts
  Protected API route for generating a referral handover checklist draft after the same login, ownership, access-code, quota, and rate-limit gates pass.

src/app/api/guided-materials/profile-rewrite/route.ts
  Protected API route for improving provider profile wording after the same login, ownership, access-code, quota, and rate-limit gates pass.

src/components/guided-share-card-generator.tsx
  Client-side Materials panel for calling the guarded share-card endpoint, handling loading, success, login/access/quota/rate-limit errors, and showing newly generated draft fields for user review.

src/components/guided-profile-rewrite-generator.tsx
  Client-side Materials panel for calling the guarded profile-rewrite endpoint, handling loading, success, login/access/quota/rate-limit errors, and showing newly generated profile wording fields for user review.

src/components/guided-referral-message-generator.tsx
  Client-side Materials panel for calling the guarded referral-message endpoint, handling loading, success, login/access/quota/rate-limit errors, and showing newly generated draft fields for user review.

src/components/guided-bilingual-intro-generator.tsx
  Client-side Materials panel for calling the guarded bilingual-intro endpoint, handling loading, success, login/access/quota/rate-limit errors, and showing newly generated draft fields for user review.

src/components/guided-handover-checklist-generator.tsx
  Client-side Materials panel for calling the guarded handover-checklist endpoint, handling loading, success, login/access/quota/rate-limit errors, and showing newly generated draft fields for user review.

src/components/generated-draft-copy-button.tsx
  Client-side clipboard control used by saved generated draft history. It copies existing saved draft fields only, does not call OpenAI, and can post metadata-only copy events for verified provider sessions.

src/app/api/generated-material-events/route.ts
  Protected metadata-only API route for recording generated material copy events. It requires verified Supabase provider session ownership of the saved generated draft and never accepts or returns generated content.

src/app/referral-workspace/materials/page.tsx
  Server-rendered Materials workspace that reads the latest saved share-card draft and recent generated draft history from GeneratedMaterialDraftStore, displays reviewable summaries and copyable fields after refresh, and shows review/archive actions only for verified Supabase provider sessions.

src/app/referral-workspace/materials/actions.ts
  Server action for marking a signed-in provider's own generated material draft as reviewed or archived and recording metadata-only review/archive events.

src/lib/generated-material-draft-store.ts
  GeneratedMaterialDraftStore abstraction, memory fallback, Supabase adapter, schema SQL, record factory, and owner-guarded status update helper for persisted AI draft outputs.

src/lib/outreach-store.ts
  OutreachStore abstraction, memory fallback, Supabase adapter, schema SQL, record factory, and metadata-only outreach record helpers.

src/app/api/outreach-records/route.ts
  Protected POST route for saving and updating provider outreach metadata after verified Supabase provider session, generated material ownership checks, and outreach record ownership checks.

src/app/referral-workspace/referral-pack/page.tsx
  Provider-facing Referral Pack page that groups the basic provider intro and saved generated drafts into copyable, reviewable material types with a mark-as-sent form.

src/app/referral-workspace/outreach/page.tsx
  Provider-facing Outreach Tracker page for manual send/follow-up records, editable follow-up status, and next follow-up dates.

src/lib/generated-material-event-store.ts
  GeneratedMaterialEventStore abstraction, memory fallback, Supabase adapter, schema SQL, and record factory for metadata-only copy/review/archive events.
```

### Validation Completed On AI Side

```text
Full tests after Supabase session cookie auth work: 200 passed
Typecheck after Supabase session cookie auth work: passed
Lint after Supabase session cookie auth work: passed
Build after Supabase session cookie auth work: passed
Focused tests after auth bridge work: 47 passed
Full tests after auth bridge work: 180 passed
Typecheck after auth bridge work: passed
Lint after auth bridge work: passed
Build after auth bridge work: passed
Local smoke after auth bridge work: save draft -> demo claim -> profile without draftId resolves latest claimed provider; invalid bearer returns 401 without demo fallback
Local smoke before claim work: API save -> profile draftId-only readback passed
Supabase remote check: provider_drafts exists, RLS enabled, service_role read/write only
Focused tests after guarded share-card AI endpoint: 15 passed
Full tests after guarded share-card AI endpoint: 233 passed
Typecheck after guarded share-card AI endpoint: passed
Lint after guarded share-card AI endpoint: passed
Build after guarded share-card AI endpoint: passed
Focused tests after Materials UI share-card wiring: 20 passed
Typecheck after Materials UI share-card wiring: passed
Lint after Materials UI share-card wiring: passed
Focused tests after generated material draft persistence: 14 passed
Full tests after generated material draft persistence: 240 passed
Typecheck after generated material draft persistence: passed
Lint after generated material draft persistence: passed
Build after generated material draft persistence: passed
Focused Materials saved draft readback test: 1 passed
Referral workspace page tests after saved draft readback: 19 passed
Full tests after saved draft readback: 241 passed
Typecheck after saved draft readback: passed
Lint after saved draft readback: passed
Build after saved draft readback: passed
Focused tests after referral-message guided material: 27 passed
Full tests after referral-message guided material: 249 passed
Typecheck after referral-message guided material: passed
Lint after referral-message guided material: passed
Build after referral-message guided material: passed
Focused tests after generated draft history list: 26 passed
Full tests after generated draft history list: 251 passed
Typecheck after generated draft history list: passed
Lint after generated draft history list: passed
Build after generated draft history list: passed
Focused tests after generated draft review/archive actions: 31 passed
Full tests after generated draft review/archive actions: 256 passed
Typecheck after generated draft review/archive actions: passed
Lint after generated draft review/archive actions: passed
Build after generated draft review/archive actions: passed
Focused tests after bilingual-intro guided material: 28 passed
Full tests after bilingual-intro guided material: 264 passed
Typecheck after bilingual-intro guided material: passed
Lint after bilingual-intro guided material: passed
Build after bilingual-intro guided material: passed
Focused tests after handover-checklist guided material: 28 passed
Full tests after handover-checklist guided material: 272 passed
Typecheck after handover-checklist guided material: passed
Lint after handover-checklist guided material: passed
Build after handover-checklist guided material: passed
Focused tests after saved draft copy workflow: 23 passed
Full tests after saved draft copy workflow: 275 passed
Typecheck after saved draft copy workflow: passed
Lint after saved draft copy workflow: passed
Build after saved draft copy workflow: passed
Focused tests after admin material usage review: 26 passed
Full tests after admin material usage review: 278 passed
Typecheck after admin material usage review: passed
Lint after admin material usage review: passed
Build after admin material usage review: passed
Production smoke after admin material usage review: public generator landing -> draft preview -> auth register handoff -> workspace profile -> workspace health -> workspace materials access preview all returned 200 and preserved provider draft handoff/boundary copy
Focused tests after copy/reuse telemetry: 24 passed
Full tests after copy/reuse telemetry: 293 passed
Typecheck after copy/reuse telemetry: passed
Lint after copy/reuse telemetry: passed
Build after copy/reuse telemetry: passed
Real provider smoke after copy/reuse telemetry: temporary Supabase provider user -> public draft save API -> bearer claim API -> approved access code seed -> saved handover checklist seed -> Supabase SSR cookie session -> profile/health/materials pages returned 200 -> copy_field event API persisted metadata -> admin material usage page showed metadata without generated content; temporary smoke data cleanup confirmed 0 residual provider_drafts/generated_material_drafts/generated_material_events/access_codes rows
Focused tests after v0.2 pilot polish: 41 passed
Full tests after v0.2 pilot polish: 298 passed
Typecheck after v0.2 pilot polish: passed
Lint after v0.2 pilot polish: passed
Build after v0.2 pilot polish: passed
Focused tests after v0.3 profile rewrite pilot: 28 passed
Full tests after v0.3 profile rewrite pilot: 305 passed
Typecheck after v0.3 profile rewrite pilot: passed
Lint after v0.3 profile rewrite pilot: passed
Build after v0.3 profile rewrite pilot: passed
Focused auth routing tests after admin smoke fix: 13 passed
Full tests after admin smoke fix: 308 passed
Typecheck after admin smoke fix: passed
Lint after admin smoke fix: passed
Build after admin smoke fix: passed
```

Local smoke URL:

```text
http://127.0.0.1:3000/referral-workspace/profile?source=provider-profile-generator&draftId=main-handoff-smoke-global-20260626&account=user-free
```

### Public Site Responsibility

The public CaresLink side should treat provider profile generation as a top-of-funnel entry into CaresLink AI.

Minimum public side contract:

```text
/provider-profile-generator
  Public acquisition and profile generation entry.

/provider-profile-generator/new
  Draft creation flow.

/provider-profile-generator/preview/[draftId]
  Public-side preview of the draft before entering AI.

/auth/register?source=provider-profile-generator&draftId=<id>
  Registration entry preserving the handoff.

/referral-workspace/profile?source=provider-profile-generator&draftId=<id>
  AI workspace entry after registration/login/demo account state.
```

Public side must not put private lead capture fields into the URL, including:

```text
email
phone
contactPerson
private notes
internal source notes
```

If public site and AI workspace are same-origin, public side may write a sanitized handoff record to localStorage:

```text
localStorage key:
careslink-ai-provider-draft:<draftId>
```

If public site and AI workspace are deployed on different domains, do not rely on cross-domain localStorage. Use one of:

- `draftPayload` URL handoff for small sanitized public-only payloads.
- Server-to-server draft creation endpoint.
- Future authenticated claim flow after registration.

### Shared Data Contract

Supabase table:

```text
public.provider_drafts
public.access_requests
public.access_codes
public.ai_usage_events
public.generated_material_drafts
public.generated_material_events
```

Important fields:

```text
id text primary key
source text
draft_payload jsonb
status draft | claimed | archived
owner_user_id uuid nullable
created_at timestamptz
updated_at timestamptz

access_requests:
id text primary key
user_id uuid
provider_draft_id text nullable
profile_name text
entity_type individual | organisation
referral_direction receive | send | both
requested_code_type text
status queued | approved | declined
created_at timestamptz
updated_at timestamptz

access_codes:
id text primary key
user_id uuid
access_request_id text nullable
code_type text
status active | revoked | expired
daily_quota integer
expires_at timestamptz nullable

ai_usage_events:
id text primary key
user_id uuid
provider_draft_id text nullable
feature text
input_token_count integer
output_token_count integer
created_at timestamptz

generated_material_drafts:
id text primary key
user_id uuid
provider_draft_id text nullable
feature text
status draft | reviewed | archived
content jsonb
created_at timestamptz
updated_at timestamptz

generated_material_events:
id text primary key
user_id uuid
provider_draft_id text nullable
generated_material_draft_id text
feature text
event_type copy_all | copy_field | mark_reviewed | archive
field_key text nullable
created_at timestamptz
```

Access model:

```text
service_role: select, insert, update, delete
anon: no direct table select
authenticated: no direct table select
RLS: enabled
```

### Current AI-Side Next Step

After Supabase session-cookie auth, draft persistence, draft ownership, access requests, admin review actions, quota guard, rate limiting, the guarded share-card/referral-message/bilingual-intro/handover-checklist/profile-rewrite AI endpoints, the Materials UI generators, generated material draft persistence, latest saved share-card readback, generated draft history list, copyable saved draft fields, review/archive actions, admin material usage metadata review, v0.2 pilot cockpit polish, and v0.3 profile quality/profile rewrite polish are in place, the next AI implementation should be:

```text
Run a real provider/admin visual pilot smoke using the public generator -> auth -> provider cockpit -> profile quality -> profile rewrite/materials -> saved draft history -> admin material usage flow
```

Goal:

Do not add more material types yet. Use the provider cockpit, profile quality layer, profile rewrite panel, admin metadata view, generated material event counts, and direct pilot observation to learn whether providers understand and reuse the profile rewrite workflow.

Remaining work:

```text
- Coordinate final public-site routing and CTA handoff into `/auth/register` or `/referral-workspace/profile` with `source=provider-profile-generator&draftId=<id>`.
- Run visual QA with a real Supabase provider session and a real Supabase admin session to confirm no demo navigation leaks into true sessions.
- If adding another material type later, follow the same route gates as the existing guided routes before any model call.
- Keep AI output as user-reviewed draft material only.
- Decide whether queued vs declined should be visible to providers beyond the existing access state panel.
- If copy/reuse learning matters after the first smoke, review the new metadata-only generated material events before adding another AI endpoint.
```

### Current Product Boundary

Do not make AI output public or reusable as if approved content. Generated materials remain provider-reviewed drafts unless a later publishing workflow is explicitly designed.

All paid/controlled AI capability should sit behind:

```text
registered user -> claimed provider draft -> access request/code -> quota -> AI generation
```

## 1. Executive Summary

CaresLink AI should be integrated into the existing CaresLink website as the new logged-in provider workspace.

The existing CaresLink public website should act as the public acquisition and explanation layer. CaresLink AI should become the product layer behind registration/login.

Recommended relationship:

```text
Existing CaresLink website
  -> public homepage
  -> positioning
  -> trust boundary
  -> signup/signin CTA

CaresLink AI
  -> registered provider workspace
  -> referral profile
  -> readiness diagnosis
  -> locked/guided materials
  -> access code / waitlist
  -> admin review queue
```

This is not a consumer marketplace, not a service provider directory, and not a provider endorsement product. It is a referral readiness and referral communication operating workspace for aged care and NDIS providers.

## 2. Product Positioning

CaresLink AI is a B2B referral readiness workspace for Australian aged care and NDIS providers.

The core job is to help a provider prepare structured, shareable, referral-ready information before asking for, receiving, or sending referrals.

It helps organise:

- Provider profile
- Individual vs organisation identity
- Receive referrals / send referrals / both
- Service area
- Languages
- Intake method
- Capacity / availability
- Handover requirements
- Referral readiness signals
- Shareable referral materials
- Access code / waitlist status

Important positioning boundary:

CaresLink AI does not certify providers, endorse provider quality, provide clinical advice, provide compliance advice, or guarantee referral outcomes.

## 3. How It Should Fit With The Current CaresLink Website

The current public CaresLink site should be reframed as the top-of-funnel entry point.

Recommended public site role:

- Explain what CaresLink AI is
- Make the provider problem clear
- Show the value of a referral-ready profile
- Explain trust/compliance boundaries
- Drive users to register or sign in
- Keep older CaresLink pages as secondary or legacy links

Recommended logged-in product role:

- Let providers create or view their structured profile
- Diagnose referral readiness gaps
- Preview locked materials
- Apply for access code
- Let approved users use guided materials later
- Let admin review access requests

## 4. Recommended Information Architecture

```text
/
  Public homepage
  Main CTA: Create free provider profile
  Secondary CTA: Sign in

/auth/register
  Registration entry point
  First version can be preview/demo
  Later should connect to real auth

/auth/login
  Login entry point

/referral-workspace
  Logged-in workspace overview
  Shows profile summary, readiness score, locked materials, access state

/referral-workspace/profile
  Provider profile builder / profile preview
  Must support individual and organisation
  Must support receiving referrals, sending referrals, or both

/referral-workspace/health
  Referral readiness diagnosis
  Shows profile completeness and communication gaps

/referral-workspace/materials
  Referral materials area
  Free users see preview/locked states
  Approved access-code users can later use AI-guided generation

/referral-workspace/access
  Access code / waitlist request page
  Explains cost control and misuse prevention

/admin/access-requests
  Admin-only review queue
  Used to approve/waitlist/decline access requests in future
```

## 5. Current Prototype State

Current app path:

```text
apps/careslink-ai
```

Current implementation includes a demo auth/access gate using URL query params. This is not real authentication yet.

Example local URLs:

```text
http://127.0.0.1:3000/auth/login?lang=zh-Hans
http://127.0.0.1:3000/auth/register?lang=zh-Hans
http://127.0.0.1:3000/referral-workspace?lang=zh-Hans
http://127.0.0.1:3000/referral-workspace?lang=zh-Hans&account=user-free
http://127.0.0.1:3000/referral-workspace/materials?lang=zh-Hans&account=user-approved
http://127.0.0.1:3000/admin/access-requests?lang=zh-Hans&account=user-admin
```

Current demo account states:

```text
user-free
  Free provider preview
  Can view workspace/profile/readiness/locked materials

user-waitlist
  Provider preview waiting for access

user-approved
  Provider preview with access-code style guided materials enabled

user-admin
  Admin preview account
  Can view admin access request queue
```

Important current boundary:

```text
?access=code
```

should not unlock guided materials by itself. Access should come from account/access state, not a public URL flag.

## 6. Required User Roles And Access States

The product should not treat all providers as the same type.

Provider identity:

```text
individual
organisation
```

Referral direction:

```text
receive
send
both
```

Auth/access states:

```text
signed_out
  Can see public homepage, login, register
  Cannot see provider profile data or materials

free_provider
  Can create/view profile
  Can view readiness diagnosis
  Can view locked/preview materials
  Cannot use AI generation

waitlist_provider
  Same as free provider
  Has submitted access request

approved_provider
  Can use guided materials within quota
  Future: AI drafting enabled

admin
  Can view access request queue
  Can review provider access requests
```

## 7. MVP Requirements

### P0 Requirements

- Public homepage explains CaresLink AI clearly
- Main CTA goes to registration
- Login/register routes exist
- Provider workspace requires account context
- Profile page supports individual and organisation
- Profile page supports receive/send/both referral direction
- Readiness diagnosis page exists
- Materials page shows free locked preview
- Access code / waitlist page exists
- Admin access request page exists
- Admin page is not visible to normal provider accounts
- Multilingual UI support: English and Simplified Chinese
- Trust boundary is visible in product pages

### P1 Requirements

- Real authentication
- Real provider account records
- Real persisted provider profile
- Real access request submission
- Admin approval/waitlist/decline actions
- Invite code / access code model
- Basic quota model for AI usage

### P2 Requirements

- OpenAI API integration
- AI-assisted profile rewriting
- AI-generated share card drafts
- AI-generated referral message drafts
- Bilingual provider intro drafts
- Referral handover checklist drafts
- Source attribution and referral partner tracking

## 8. Homepage Integration Recommendation

The homepage should shift from generic CaresLink content to a clear CaresLink AI entry point.

Recommended homepage structure:

### Hero

Headline:

```text
CaresLink AI
```

Subheadline:

```text
Referral-ready provider profiles for aged care and NDIS providers.
```

Supporting copy:

```text
Create a structured provider profile, check referral readiness, and prepare shareable referral materials before asking for, receiving, or sending referrals.
```

Primary CTA:

```text
Create free provider profile
```

Secondary CTA:

```text
Sign in
```

### Trust Boundary

Show near the top of the page:

```text
CaresLink does not certify providers, endorse service quality, provide clinical advice, provide compliance advice, or guarantee referral outcomes.
```

### Product Modules

Show four modules:

```text
1. Provider Profile
   Structure provider identity, service area, languages, intake method, and referral direction.

2. Readiness Diagnosis
   See missing referral communication signals before sharing your profile.

3. Referral Materials
   Preview share cards, referral messages, bilingual intros, and handover checklists.

4. Access Code
   Request guided AI access after profile readiness is clear.
```

### Existing Content

Existing CaresLink pages can remain, but should be visually secondary.

Recommended labels:

```text
Legacy demo
Existing provider tools
Previous assessment demo
Provider directory preview
```

Do not let the homepage feel like a consumer marketplace or provider directory.

## 9. Technical Integration Questions For The Website Lead

Please assess:

- Can the current site support `/auth/*` routes?
- Is there an existing auth system to reuse?
- Should auth be Supabase, Auth.js, Firebase, custom backend, or existing stack?
- Where should provider profile data live?
- How should access codes and invitation codes be stored?
- How should admin roles be managed?
- How should AI quota and rate limiting be enforced?
- How should multilingual routing be handled?
- Should existing pages be moved under legacy navigation?
- Which pages should be public vs logged-in?
- Which backend route should own OpenAI calls?

## 10. Suggested Data Model

This is a first-pass model for implementation planning.

```text
users
  id
  email
  name
  role: provider | admin
  created_at

provider_profiles
  id
  user_id
  entity_type: individual | organisation
  name
  referral_direction: receive | send | both
  service_areas
  languages
  description
  intake_method
  availability
  response_time
  suitable_for
  handover_requirements
  created_at
  updated_at

access_requests
  id
  user_id
  provider_profile_id
  requested_code_type
  source_invite
  reason
  status: queued | waitlist | approved | declined
  admin_note
  created_at
  reviewed_at
  reviewed_by

access_codes
  id
  user_id
  code_type
  status: active | revoked | expired
  daily_quota
  created_at
  expires_at

ai_usage_events
  id
  user_id
  provider_profile_id
  feature
  input_token_count
  output_token_count
  created_at
```

## 11. OpenAI API Integration Recommendation

Do not put OpenAI API into the fully public/free flow.

Recommended sequence:

```text
Phase 1
  Deterministic preview only
  No OpenAI cost

Phase 2
  Real auth and saved profile
  Still no AI generation for public users

Phase 3
  Access code approval
  Add quota and rate limit

Phase 4
  OpenAI API for approved users only
```

Initial AI features should be scoped:

- Rewrite provider profile summary
- Draft share card
- Draft referral partner message
- Draft bilingual provider intro
- Draft handover checklist

Every AI output should be labelled as draft content for user review.

## 12. Compliance And Trust Boundaries

Avoid these claims:

- Certified provider
- Recommended provider
- Verified quality
- Guaranteed referral
- Clinical recommendation
- Compliance approved
- Best provider
- Trusted by regulator

Use safer language:

- Self-submitted profile
- Referral communication readiness
- Profile completeness
- Draft material
- User-reviewed content
- Access to guided drafting
- Not a quality endorsement

Suggested persistent disclaimer:

```text
Information is based on self-submitted provider details. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide legal, clinical, medical, compliance, financial, or other professional advice.
```

## 13. Recommended Build Phases

### Phase 1: Public Site Integration

- Reframe homepage around CaresLink AI
- Add CTA to register/login
- Add clear trust boundary
- Keep older CaresLink content as secondary/legacy

### Phase 2: Real Auth

- Implement registration
- Implement login
- Implement provider/admin roles
- Protect workspace and admin routes

### Phase 3: Persisted Provider Profile

- Save provider profile to database
- Support individual/organisation
- Support receive/send/both fields
- Add basic profile completion state

### Phase 4: Access Code And Waitlist

- Implement access request submission
- Implement admin review queue
- Implement approved/waitlist/declined states
- Implement quota model

### Phase 5: AI Guided Materials

- Add OpenAI server-side calls
- Add rate limits
- Add daily quota
- Add audit logging
- Keep AI output as drafts only

### Phase 6: Referral Operating System

- Add referral source attribution
- Add partner/referrer sharing
- Add referral tracking
- Add matching workflow
- Add channel reporting

## 14. Acceptance Criteria For Next Implementation Thread

The next implementation thread should be able to pick one of these tasks:

### Option A: Pilot Usage Review

Acceptance criteria:

- Admin can see saved generated material activity by user, provider draft, feature, status, and created date.
- The view does not expose private lead/contact details unnecessarily.
- The report separates draft generation activity from referral outcomes.
- The trust boundary remains visible: generated content is draft material for user review, not provider endorsement.
- English and Simplified Chinese remain supported if surfaced in the workspace UI.
- Demo query-param accounts still do not spend OpenAI or perform real writes.

### Option B: Profile Rewrite Or Trust-Copy Drafting

Acceptance criteria:

- New endpoint uses the same verified session, provider role, claimed draft ownership, access code, quota, and rate-limit gates.
- Output is persisted in `generated_material_drafts` with a distinct feature key.
- Copy avoids approved/compliant/verified/guaranteed/certified/endorsed language.
- UI appears as another guarded Materials panel, not a public generator.
- Tests, typecheck, lint, and build pass.

### Option C: Provider Pilot Smoke And Feedback

Acceptance criteria:

- Run the public generator -> auth/register -> profile -> health -> materials path with at least one real provider-style draft.
- Confirm the provider understands self-submitted profile, draft material, and no-endorsement boundaries.
- Observe whether they copy share card, referral message, bilingual intro, or handover checklist outputs.
- Record which next material type or editing workflow they ask for first.

## 15. Recommended Immediate Next Step

The next best engineering step is:

```text
Run a provider pilot smoke and review saved material usage before adding another AI material type.
```

Reason:

The AI side now has four guarded guided generators and copyable saved draft fields. The next product risk is not lack of material types; it is whether providers understand, trust, copy, and reuse the generated drafts. Add profile rewrite or trust-copy drafting only if pilot behavior points there.

## 16. v0.4 Pilot Polish Update

Completed in the CaresLink AI workspace:

- Provider cockpit now opens with clear next actions: review profile details, check referral readiness, request or confirm workspace access, and generate or review materials once access is active.
- Simplified Chinese copy was polished on the provider cockpit and profile quality layer. The workspace title now uses "服务商工作台" rather than mixed English/Chinese wording.
- Profile quality now separates provider-submitted information from AI-generated draft wording in both English and Simplified Chinese.
- Public generator handoff banner copy was tightened so imported drafts feel like a real workspace handoff, not a demo/database placeholder.
- Cockpit metrics, latest material activity, saved material count, access status, and admin cockpit copy now localize for Simplified Chinese.
- Real provider/admin session boundaries remain intact: demo account switches and legacy demo shortcuts are only available through demo fallback contexts.
- Product boundary remains unchanged: general business profile and operational support only; no marketplace, booking, lead resale, provider endorsement, compliance, clinical, legal, or care advice.

Verification completed:

- `pnpm test` passed: 53 files, 310 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

Core public site coordination:

- No public generator UI change is required from this AI-side polish.
- Optional Core copy alignment: when handing users into AI, use language like "Continue in CaresLink AI to review profile details and readiness" rather than promising verification, certification, compliance approval, referral matching, booking, or service quality assessment.

## 17. v0.4.1 Chinese Materials Copy Polish

Completed in the CaresLink AI workspace:

- Simplified Chinese materials copy was tightened to remove mixed provider-facing terms such as "profile 文案", "provider 资料", "Provider 摘要", and "access request".
- Profile rewrite copy now uses natural Chinese wording: "优化资料文案", "生成资料改写", and "资料改写已生成，等待复核".
- Guided material descriptions now refer to "服务商资料", "服务商复核", and "转介沟通文案".
- Login/register/gate preview copy was adjusted from mixed English terms to Chinese equivalents such as "访问申请", "访问码", and "服务商预览账号".
- No endpoint, material type, auth, access, quota, marketplace, booking, payment, clinical, legal, compliance, or referral workflow behavior was changed.

Verification completed:

- Focused i18n test passed.
- Focused materials/workspace rendering and guided generator component tests passed.
- `pnpm test` passed: 53 files, 311 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

## 18. v0.5 Okana-Inspired Provider Workspace Polish

Completed in the CaresLink AI workspace:

- Provider workspace now uses a compact three-zone cockpit structure: provider navigation, operational work area, and a right-side access/material/activity rail.
- The authenticated workspace no longer uses the oversized landing-style hero pattern.
- Demo/pilot provider navigation no longer exposes legacy demo routes by default.
- `/referral-workspace`, `/referral-workspace/profile`, `/referral-workspace/health`, `/referral-workspace/materials`, and `/referral-workspace/access` now follow a consistent workspace pattern.
- Admin sessions that directly open provider workspace subpages are routed to the admin role gate instead of seeing provider content or provider actions.
- The materials page keeps the existing guarded guided draft workflow only. No new OpenAI endpoint or material type was added.
- Chinese provider-facing copy was polished from demo/internal wording to preview/workspace wording, including access and materials states.
- Admin material usage remains metadata-only and does not show generated content JSON.
- Product boundary remains unchanged: general business profile and operational support only; no marketplace, booking, lead resale, provider endorsement, compliance, clinical, legal, or care advice.

Browser smoke completed:

- `http://127.0.0.1:3000/referral-workspace?account=user-approved&lang=zh-Hans`
- `http://127.0.0.1:3000/referral-workspace/materials?account=user-approved&lang=zh-Hans`
- `http://127.0.0.1:3000/referral-workspace/materials?account=user-free&lang=zh-Hans`
- `http://127.0.0.1:3000/admin/material-usage?account=user-admin&lang=zh-Hans`

Verification completed:

- Focused workspace tests passed: 4 files, 47 tests.
- Full test suite passed: 54 files, 329 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

Core public site coordination:

- No public generator UI change is required from this AI-side polish.
- Core can keep positioning the public generator as the front-door profile generator and use CaresLink AI as the logged-in workspace for profile quality, readiness, access, and reviewable guided materials.

## 19. v0.6 Real Provider UI Cleanup

Completed in the CaresLink AI workspace:

- Real provider workspace/profile pages no longer show the internal referral role matrix, seeded provider records, seed-set language, or internal relevance labels in normal provider sessions.
- Provider-facing role guidance is now shown as "Your referral role" / "你的转介角色" with role-specific completion checklists.
- Demo/query-param provider sessions now default to the current account profile instead of seeded Alex/Harbour records unless an explicit internal demo path is used.
- Profile review copy was tightened from seed/internal matrix language to current-profile review language.
- Regression tests now assert that provider pages do not expose internal matrix, seeded provider, or relevance wording.
- Product boundary remains unchanged: general business profile and operational support only; no marketplace, booking, lead resale, provider endorsement, compliance, clinical, legal, or care advice.

Verification completed:

- `pnpm test` passed: 54 files, 332 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

Core public site coordination:

- No public generator UI change is required from this cleanup.
- Core can keep sending provider drafts into CaresLink AI; the AI workspace now presents role/readiness guidance in provider-facing language rather than internal referral-system language.

## 20. v0.9 Real Pilot Readiness

Completed in the CaresLink AI workspace:

- Applied the remote Supabase migration `create_outreach_records` to project `adocsnwnslxhxcjgbyee`.
- Verified `public.outreach_records` exists in the remote Supabase database.
- Verified local real Supabase provider-session outreach flow: create outreach metadata, read it back, update status to `follow_up`, and clean up the temporary record and auth user.
- Added the required AI workspace environment variables to Vercel Preview because they were previously configured only for Production.
- Deployed a fresh Vercel preview after Preview env alignment.

Current preview deployment:

```text
https://careslink-8f3cr9107-millionlunas-projects.vercel.app
```

Temporary protected preview access:

```text
https://careslink-8f3cr9107-millionlunas-projects.vercel.app/?_vercel_share=pu9emw0hSgxNpockA60yV3U9df3mecNU
```

The temporary access link expires on 2026-06-30 at 12:48 PM.

Verification completed:

- `pnpm test` passed: 55 files, 339 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- Vercel preview build passed.
- Preview real provider API smoke passed:
  - temporary Supabase provider user created;
  - Vercel protected preview cookie established;
  - Supabase auth cookie accepted by preview API;
  - `POST /api/outreach-records` created a metadata-only outreach record and redirected with `outreachStatus=saved`;
  - update mode changed the record to `follow_up` and redirected with `outreachStatus=updated`;
  - remote Supabase readback returned `follow_up` with `next_follow_up_at = 2026-07-05`;
  - temporary user and outreach record were cleaned up.

Product boundary:

- No new OpenAI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added.
- The outreach tracker remains metadata-only and should not be positioned as a referral marketplace or referral outcome guarantee.

Core public site coordination:

- No public generator UI change is required for this v0.9 readiness pass.
- Core can keep sending users to CaresLink AI after profile generation. AI workspace now has a verified preview path for provider outreach metadata create/update.

## 21. v1.0 Production Deployment

Completed on 2026-06-30:

- Deployed the CaresLink AI workspace to Vercel Production.
- Production deployment ID: `dpl_5xjWAkBYyjDeVHHCZSbzr4TsKpAx`.
- Production deployment URL: `https://careslink-fdo75tnic-millionlunas-projects.vercel.app`.
- Production alias: `https://ai.careslink.com.au`.

Pre-production verification:

- `pnpm test` passed: 55 files, 339 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- Vercel production build passed.

Production smoke:

- `https://ai.careslink.com.au/auth/login?lang=en` returned 200 and rendered the CaresLink login page.
- Unauthenticated `POST /api/outreach-records` returned a safe `303` redirect with `outreachStatus=login-required`.
- Real provider-session production smoke passed:
  - temporary Supabase provider user created;
  - Supabase auth cookie accepted by production API;
  - `POST /api/outreach-records` created a metadata-only outreach record and redirected with `outreachStatus=saved`;
  - update mode changed the record to `follow_up` and redirected with `outreachStatus=updated`;
  - remote Supabase readback returned `follow_up` with `next_follow_up_at = 2026-07-06`;
  - temporary user and outreach record were cleaned up.

Product boundary:

- No new OpenAI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added during production deployment.
- The production workspace remains positioned as general business profile and operational support only.

Core public site coordination:

- Core can now link production AI CTA targets to `https://ai.careslink.com.au`.
- Public generator handoff should continue passing `source=provider-profile-generator`, `draftId`, `lang`, and safe auth/register/login next parameters as already agreed.

## 22. v1.1 Referral Pack-First Workspace Polish

Completed in the CaresLink AI workspace:

- Reframed the authenticated provider workspace around the main pilot job: prepare a Referral Pack, record who received it, follow up, and fix referral blockers.
- Updated provider navigation and shell copy so `Referral Pack` and `Outreach` are first-class provider routes before secondary profile/material routes.
- Updated login and registration side previews to position the workspace as a Referral Pack workspace rather than a generic readiness dashboard.
- Polished `/referral-workspace` provider cockpit copy and next actions around Referral Pack preparation, outreach recording, access status, saved drafts, latest activity, and referral blockers.
- Polished `/referral-workspace/profile` as the Referral Pack source-quality layer.
- Polished `/referral-workspace/materials` wording so guided drafts are framed as drafts that can feed the Referral Pack.
- Polished `/referral-workspace/referral-pack` with target-oriented send framing for support coordinators, case managers, other providers, community groups, and family contacts.
- Polished `/referral-workspace/outreach` as a follow-up assistant with follow-up queue before recent sends, and prevented records with a next follow-up date from duplicating in both sections.
- Updated English and Simplified Chinese tests/copy for the new product framing.

Verification completed:

- Focused tests passed: 4 files, 63 tests.
- `pnpm test` passed: 55 files, 339 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

Product boundary:

- No new OpenAI endpoint, material type, marketplace, booking, lead resale, payment, clinical, legal, compliance advice, provider quality review, or referral outcome workflow was added.
- Basic Referral Pack and Outreach remain provider-owned operational surfaces based on self-submitted information and metadata-only tracking.

Core public site coordination:

- No public generator UI change is required for this AI-side v1.1 polish.
- Core can continue sending generated profiles into CaresLink AI, but CTA/handoff copy should now emphasize "continue to prepare your Referral Pack" rather than only "review profile" or "check readiness".
