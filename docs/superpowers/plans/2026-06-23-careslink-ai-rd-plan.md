# Careslink AI R&D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Careslink AI frontend demo into a production-ready MVP with real auth, Supabase data, provider readiness assessment, referral ops, AI profile generation, and role-based portals.

**Architecture:** Keep the current Next.js App Router frontend as the product shell. Introduce a repository/service layer so UI pages stop reading mock data directly, then swap the implementation from mock repositories to Supabase. Keep AI behind an adapter interface so mock AI, OpenAI, and later workflow-specific prompts can be changed without rewriting pages.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage/RLS, Vercel, Vitest, ESLint, OpenAI API later, optional image export via Satori/Playwright later.

---

## R&D Milestones

### M0: Current Demo Hardening, 2-3 Days

Purpose: make the current demo safer and easier to iterate before adding backend complexity.

Deliverables:

- `noindex` remains enabled.
- Basic password gate or preview access gate.
- Environment config template.
- Clear route map.
- Shared demo strategy and assessment modules tested.
- Vercel production deploy stable.

Core files:

- `apps/careslink-ai/src/app/layout.tsx`
- `apps/careslink-ai/src/components/app-shell.tsx`
- `apps/careslink-ai/src/lib/demo-strategy.ts`
- `apps/careslink-ai/src/lib/provider-assessment.ts`
- `apps/careslink-ai/.env.example`

Tests:

- `pnpm test`
- `pnpm lint`
- `pnpm build`

### M1: Data Access Layer, 3-5 Days

Purpose: stop pages from importing mock data directly, so backend migration is controlled.

Create:

- `apps/careslink-ai/src/lib/repositories/types.ts`
- `apps/careslink-ai/src/lib/repositories/mock-repository.ts`
- `apps/careslink-ai/src/lib/repositories/index.ts`

Repository functions:

- `listProviders()`
- `getProvider(providerId)`
- `listReferrals(filters)`
- `getReferral(referralId)`
- `listReferralMatches(referralId)`
- `listProviderAssessments(filters)`
- `getProviderAssessment(providerId)`
- `listSourceChannels(partnerId)`
- `listActivityLogs(filters)`
- `listRevenueTracking(filters)`

Migration order:

1. Provider directory.
2. Provider detail.
3. Provider portal.
4. Referral board.
5. Referral detail and matching.
6. Admin and partner dashboards.
7. Assessment pages.

Test strategy:

- Repository contract tests should pass against mock data first.
- Pages should not import `mock-data.ts` directly after migration.

### M2: Supabase Schema And RLS, 5-7 Days

Purpose: create real database foundation while preserving current UI.

Create:

- `apps/careslink-ai/supabase/schema.sql`
- `apps/careslink-ai/supabase/seed.sql`
- `apps/careslink-ai/src/lib/supabase/server.ts`
- `apps/careslink-ai/src/lib/supabase/client.ts`
- `apps/careslink-ai/src/lib/repositories/supabase-repository.ts`

Tables:

- `users`
- `business_partners`
- `network_participants`
- `providers`
- `provider_profiles`
- `provider_assessments`
- `provider_assessment_sections`
- `referral_sources`
- `referrals`
- `referral_matches`
- `share_cards`
- `source_channels`
- `activity_logs`
- `membership_plans`
- `revenue_tracking`

RLS roles:

- Admin: all rows.
- Business partner: rows where `source_partner_id` matches.
- Referral source: referrals and source channels they created or own.
- Provider: own provider profile, own matches, assigned referrals.
- Family user: public provider discovery only.

Critical RLS checks:

- A provider cannot read another provider's private assessment notes.
- A referral source cannot read all referrals.
- A business partner cannot see another partner's revenue tracking.
- HushCare family routes cannot access private referral pipeline data.

### M3: Auth And Role Routing, 4-6 Days

Purpose: move from demo role pages to real signed-in role portals.

Create:

- `apps/careslink-ai/src/lib/auth/roles.ts`
- `apps/careslink-ai/src/lib/auth/session.ts`
- `apps/careslink-ai/src/app/login/page.tsx`
- `apps/careslink-ai/src/app/auth/callback/route.ts`
- `apps/careslink-ai/src/proxy.ts`

Role destinations:

- `admin` -> `/admin`
- `business_partner` -> `/dashboard`
- `referral_source` -> `/referral-source-portal`
- `provider` -> `/provider-portal`
- `family_user` -> `/hushcare-provider-finder`

Do not rely only on `proxy.ts` for security. Every server-side repository function must verify role and ownership.

### M4: Provider Assessment Workflow, 5-7 Days

Purpose: make the free provider assessment a real acquisition and onboarding workflow.

Routes:

- `/provider-assessment`
- `/provider-assessment/report`
- `/providers/onboarding`
- `/providers/review`

Backend actions:

- `createProviderAssessment(input)`
- `updateAssessmentSectionScore(input)`
- `submitAssessmentForReview(providerId)`
- `approveProviderProfile(providerId)`

Assessment states:

- `draft`
- `submitted`
- `reviewed`
- `ready`
- `needs_info`

Output:

- readiness level
- overall score
- section scores
- top recommendations
- next actions
- profile reviewed badge

### M5: Referral Ops Workflow, 7-10 Days

Purpose: turn referral board into the operational center.

Routes:

- `/referrals/intake`
- `/referrals`
- `/referrals/[id]`
- `/referrals/[id]/matches`

Actions:

- `createReferral(input)`
- `updateReferralStatus(referralId, status)`
- `addReferralNote(referralId, note)`
- `assignProvider(referralId, providerId)`
- `recordProviderResponse(matchId, status)`

Matching v1:

- service type match
- suburb/region match
- language match
- funding support
- accepting new clients
- urgent capacity
- readiness score

Matching output:

- score
- reasons
- gaps
- recommended next action

### M6: AI Adapter And Prompt Layer, 4-7 Days

Purpose: connect real AI without hardcoding provider-specific prompts inside pages.

Create:

- `apps/careslink-ai/src/lib/ai/types.ts`
- `apps/careslink-ai/src/lib/ai/mock-ai.ts`
- `apps/careslink-ai/src/lib/ai/openai-ai.ts`
- `apps/careslink-ai/src/lib/ai/prompts/provider-profile.ts`
- `apps/careslink-ai/src/lib/ai/prompts/referral-summary.ts`
- `apps/careslink-ai/src/lib/ai/prompts/share-card.ts`

AI tasks:

- generate English provider profile
- generate Chinese provider profile
- generate elevator pitch
- generate WeChat copy
- generate referral partner recommendation
- summarize referral intake
- explain match reasons

Safety:

- AI cannot claim certification.
- AI cannot provide clinical or legal advice.
- AI output must pass forbidden-claims check.
- Keep human review before publishing provider copy.

### M7: Share Cards And Export, 4-6 Days

Purpose: make sharing useful for WeChat, WhatsApp, Xiaohongshu, and partner conversations.

Current:

- HTML/CSS preview.

Next:

- stable share-card route per provider/referral
- public share link
- QR placeholder
- image export later

Create:

- `/share-cards/[id]`
- `apps/careslink-ai/src/lib/share-cards/export.ts`

Do image export after workflow is validated. Use Satori or browser-based screenshot export later.

### M8: HushCare Bridge, 5-8 Days

Purpose: connect family-side discovery without violating privacy boundaries.

Routes:

- `/hushcare-provider-finder`
- later `/api/hushcare/referral-leads`

Allowed data from HushCare:

- family-selected service need
- suburb/postcode
- language preference
- urgency
- consent to contact

Forbidden data:

- game score
- mistakes
- reaction speed
- cognitive inference
- ability assessment

Output:

- create a referral lead
- suggest provider categories
- let family save/share provider with relatives

### M9: Partner/Admin Analytics, 4-7 Days

Purpose: prove value to channel partners and future paid users.

Dashboards:

- provider assessment funnel
- referral pipeline
- supply gap map
- source quality
- provider response time
- accepted referral outcomes
- revenue tracking placeholder

Key metrics:

- invited providers
- completed assessments
- readiness levels
- missing document gaps
- referrals created
- referrals matched
- contacted
- accepted
- completed
- unable to serve

### M10: Production Readiness, 5-7 Days

Purpose: make MVP reliable enough for pilot users.

Required:

- error boundary pages
- loading states
- empty states
- audit logs
- database backups
- Vercel environment separation
- Supabase RLS tests
- basic access monitoring
- privacy/disclaimer pages

Routes/pages:

- `/privacy`
- `/terms`
- `/partner-preview-disclaimer`

## Engineering Sequence

1. Keep current demo as production preview.
2. Add password/access gate.
3. Extract repository layer.
4. Add Supabase schema and seed.
5. Add auth and role routing.
6. Migrate providers and assessments.
7. Migrate referrals and matches.
8. Add AI adapter.
9. Add share links/export.
10. Add HushCare lead bridge.
11. Add analytics.
12. Add production hardening.

## Release Plan

### Release 0.1: Demo Plus

- Current demo.
- Free assessment pages.
- Readiness report.
- noindex.
- Vercel deployment.

### Release 0.2: Private Pilot Backend

- Supabase providers.
- Supabase assessments.
- Basic auth.
- Admin/provider role routing.

### Release 0.3: Referral Ops Pilot

- Real referral intake.
- Matching v1.
- Provider response states.
- Source tracking.

### Release 0.4: AI Assisted Ops

- AI profile generation.
- AI referral summary.
- AI match explanation.
- AI share-card copy.

### Release 0.5: Partner Pilot

- Business partner dashboard.
- Readiness map.
- Referral analytics.
- Partner source attribution.

### Release 1.0: Paid Pilot

- Provider Pro feature gate.
- Agency/team view.
- Exportable share cards.
- Production terms/privacy.
- Pilot billing workflow, even if payment remains manual.

## Testing Plan

Unit tests:

- display helpers
- matching logic
- assessment scoring
- role permissions
- safe copy filtering
- AI output validation

Integration tests:

- provider assessment submission
- referral creation
- referral match creation
- provider response
- partner dashboard metrics

Build checks:

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

Manual route checks:

- `/demo`
- `/provider-assessment`
- `/provider-assessment/report`
- `/admin`
- `/dashboard`
- `/referral-source-portal`
- `/provider-portal`
- `/hushcare-provider-finder`
- `/referrals`
- `/share-cards`

## Team And Time Estimate

Solo founder/developer:

- Demo hardening: 2-3 days.
- Repository layer: 3-5 days.
- Supabase + auth: 10-14 days.
- Assessment workflow: 5-7 days.
- Referral workflow: 7-10 days.
- AI integration: 4-7 days.
- HushCare bridge: 5-8 days.
- Production hardening: 5-7 days.

Realistic MVP pilot: 6-8 weeks.

Small team:

- 1 full-stack engineer.
- 1 product/operator.
- 1 industry partner reviewer.
- optional designer for share cards and reports.

Realistic MVP pilot: 4-6 weeks.

## Immediate Next Sprint

Sprint length: 1 week.

Sprint goal: make the demo safer and prepare backend migration.

Tasks:

- [ ] Add password gate for public demo.
- [ ] Add `.env.example`.
- [ ] Create repository interfaces.
- [ ] Move provider directory to repository layer.
- [ ] Move assessment pages to repository layer.
- [ ] Add compliance copy helper.
- [ ] Add tests for forbidden claims.
- [ ] Keep Vercel production green.

Definition of done:

- Public demo still works.
- No pages import mock data directly for providers/assessments.
- Unsafe claims are test-blocked.
- `pnpm test`, `pnpm lint`, and `pnpm build` pass.
