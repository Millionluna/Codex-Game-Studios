# Careslink AI Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Careslink AI into a cold-startable B2B referral operating system for Australian aged care and NDIS providers, beginning with one strong channel partner and a free provider referral-readiness assessment wedge.

**Architecture:** The project should not begin as a broad marketplace. It should begin as a partner-operated referral ops layer: provider readiness assessment, profile generation, source tracking, referral matching, follow-up workflow, and partner reporting. HushCare remains the family-side discovery bridge, while Careslink owns B2B referral operations.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Vercel, mock data first, Supabase later, AI APIs behind mocked interfaces until workflow validity is proven.

---

## Operating Principles

- Start with one strong business partner and one real provider cluster.
- Do not charge provider entry first; use the free assessment to earn trust and data.
- Avoid certification language. Use "readiness", "profile reviewed", and "referral-ready profile completed".
- Avoid delivery-risk features in the MVP: no care delivery, rostering, payments, employment, clinical advice, or participant plan management.
- Track every source: partner, group, invite link, share card, recorder, and follow-up owner.
- Treat the first 90 days as proof of referral operations, not proof of a generic directory.

## Phase 0: Compliance And Positioning Guardrails, Week 0-1

**Files:**
- Modify: `apps/careslink-ai/src/app/layout.tsx`
- Modify: `apps/careslink-ai/src/components/share-card.tsx`
- Create: `apps/careslink-ai/src/lib/compliance-copy.ts`
- Test: `apps/careslink-ai/src/lib/compliance-copy.test.ts`

- [ ] **Step 1: Define forbidden claims**

Create tests that reject unsafe labels:

```ts
import { describe, expect, it } from "vitest";
import { isSafeProviderClaim } from "./compliance-copy";

describe("compliance copy boundaries", () => {
  it("rejects certification and guarantee language", () => {
    expect(isSafeProviderClaim("Certified provider")).toBe(false);
    expect(isSafeProviderClaim("Guaranteed service")).toBe(false);
    expect(isSafeProviderClaim("Referral-ready profile completed")).toBe(true);
    expect(isSafeProviderClaim("Profile reviewed by Careslink AI")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement safe copy helper**

```ts
const blockedTerms = ["certified", "guaranteed", "approved quality", "clinical advice"];

export function isSafeProviderClaim(claim: string) {
  const normalized = claim.toLowerCase();
  return !blockedTerms.some((term) => normalized.includes(term));
}
```

- [ ] **Step 3: Apply noindex**

Keep the current `robots: { index: false, follow: false }` setting until the public marketing site is ready.

- [ ] **Step 4: Source-check regulatory assumptions**

Use official sources before changing positioning:

- NDIS Commission platform provider guidance.
- NDIS provider registration guidance.
- Aged Care Quality and Safety Commission provider registration guidance.

Expected outcome: internal one-page risk note explaining why the MVP is a referral ops and provider-readiness tool, not a care marketplace.

## Phase 1: Provider Readiness Wedge, Week 1-3

**Files:**
- Modify: `apps/careslink-ai/src/lib/provider-assessment.ts`
- Modify: `apps/careslink-ai/src/app/provider-assessment/page.tsx`
- Modify: `apps/careslink-ai/src/app/provider-assessment/report/page.tsx`
- Test: `apps/careslink-ai/src/lib/provider-assessment.test.ts`

- [ ] **Step 1: Run 20 free assessments manually**

Target provider segments:

- Chinese-speaking NDIS support coordination.
- Aged care transport and social support.
- Personal care and domestic assistance.
- Allied health providers with bilingual capacity.

Capture for each provider:

- Service type.
- Region/suburb/postcode.
- Languages.
- Funding support.
- Accepting new clients.
- Urgent capacity.
- Intake owner.
- Response time.
- ABN and insurance status.
- Existing profile quality.
- Willingness to receive referrals.

- [ ] **Step 2: Produce one-page readiness report**

Report sections:

- Profile clarity.
- Service coverage clarity.
- Intake response readiness.
- Chinese-speaking family fit.
- Share card readiness.
- Referral partner confidence.

Required CTA:

- Generate AI profile.
- Generate share card.
- Join provider review queue.
- Set referral capacity.

- [ ] **Step 3: Measure conversion**

Targets:

- 20 providers invited.
- 12 providers complete assessment.
- 8 providers agree to be listed internally.
- 5 providers accept generated profile/share card.
- 3 providers become candidates for Pro tools.

## Phase 2: Partner Pilot, Week 2-6

**Files:**
- Modify: `apps/careslink-ai/src/app/admin/page.tsx`
- Modify: `apps/careslink-ai/src/app/referral-source-portal/page.tsx`
- Modify: `apps/careslink-ai/src/lib/provider-assessment.ts`
- Modify: `apps/careslink-ai/src/lib/mock-data.ts`

- [ ] **Step 1: Sign one pilot partner**

Ideal partner:

- Owns or influences at least one active aged care / NDIS provider group.
- Can introduce 20-50 providers.
- Sees real referral needs weekly.
- Is willing to co-create assessment criteria and review source quality.

Offer:

- Free setup for first provider assessment batch.
- Partner dashboard preview.
- Future channel share tracking, not immediate referral fee promise.

- [ ] **Step 2: Create partner operating ritual**

Weekly workflow:

- Monday: review new provider assessments.
- Wednesday: review active referrals and matching gaps.
- Friday: update provider readiness map and next invite targets.

Required dashboard metrics:

- Providers invited.
- Assessments completed.
- Ready providers.
- Missing insurance/profile/contact gaps.
- Priority suburb/service gaps.
- Referrals created.
- Referrals matched.
- Referrals accepted.
- Referrals completed or closed.

- [ ] **Step 3: Validate the partner value story**

Interview prompts:

- "Which part of your group resource is hardest to manage today?"
- "Would this readiness map help you know who to invite next?"
- "Would your providers accept a free readiness report?"
- "What would make you pay for this as a partner dashboard?"

Success signal:

- Partner asks to use the dashboard for the next provider batch.

## Phase 3: Referral Ops MVP, Week 4-8

**Files:**
- Modify: `apps/careslink-ai/src/app/referrals/intake/page.tsx`
- Modify: `apps/careslink-ai/src/app/referrals/page.tsx`
- Modify: `apps/careslink-ai/src/app/referrals/[id]/matches/page.tsx`
- Modify: `apps/careslink-ai/src/lib/referral-matching.ts`
- Test: `apps/careslink-ai/src/lib/referral-matching.test.ts`

- [ ] **Step 1: Keep matching simple**

Rules:

- Region match.
- Service type match.
- Language match.
- Accepting new clients.
- Urgent capacity.
- Funding type support.
- Readiness score.

- [ ] **Step 2: Show reasons, not black-box AI**

Every match must show:

- Why this provider matched.
- What gaps remain.
- Whether partner review is required.

- [ ] **Step 3: Track status**

Statuses:

- New.
- Pending Match.
- Matched.
- Contacted.
- Accepted.
- Completed.
- Unable to Serve.
- Closed.

Minimum success metric:

- 10 real referrals logged.
- 7 matched to at least 2 providers.
- 5 contacted.
- 3 accepted by a provider.

## Phase 4: Commercialization Test, Week 6-10

**Files:**
- Modify: `apps/careslink-ai/src/lib/demo-strategy.ts`
- Modify: `apps/careslink-ai/src/app/demo/page.tsx`
- Modify: `apps/careslink-ai/src/app/provider-portal/page.tsx`

- [ ] **Step 1: Test paid offers in order**

Offer order:

1. AI profile and share card pack.
2. Referral readiness training session.
3. Provider Pro tools.
4. Partner dashboard licence.
5. Agency team CRM.

- [ ] **Step 2: Do not lead with referral fees**

Positioning:

- "We help you become easier to refer to."
- "We help partners manage trusted provider supply."
- "We help providers respond faster to real referral opportunities."

- [ ] **Step 3: Pricing probes**

Probe ranges:

- AI profile/share card pack: AUD 99-299.
- Group training: AUD 500-1500 per session.
- Provider Pro: AUD 49-149/month.
- Partner dashboard: AUD 299-999/month.
- Agency CRM: AUD 499-1999/month.

Success signal:

- At least 3 providers agree that one paid offer is reasonable after receiving the free report.

## Phase 5: HushCare Bridge, Week 8-12

**Files:**
- Modify: `apps/careslink-ai/src/app/hushcare-provider-finder/page.tsx`
- Reference: `C:\Users\ASUS\Documents\aged care games\design\hushcare`
- Reference: `C:\Users\ASUS\Documents\aged care games\hushcare-wechat-miniprogram`

- [ ] **Step 1: Keep family-side privacy boundary**

Do not expose:

- Game scores.
- Mistakes.
- Reaction time.
- Performance ratings.
- Ability assessment.

Allowed trigger:

- Family voluntarily searches for support.
- Family saves a provider.
- Family asks for help understanding aged care or NDIS pathways.

- [ ] **Step 2: Turn family discovery into B2B lead**

Lead fields:

- Suburb/postcode.
- Service need.
- Language preference.
- Funding type.
- Urgency.
- Preferred contact method.
- Consent to be contacted.

Success signal:

- 5 family-side discovery leads can be converted into structured referral records without exposing sensitive game data.

## Phase 6: Real Backend, Week 10-14

**Files:**
- Create: `apps/careslink-ai/src/lib/supabase/server.ts`
- Create: `apps/careslink-ai/src/lib/supabase/schema.sql`
- Create: `apps/careslink-ai/src/lib/auth/roles.ts`
- Modify: all pages currently reading mock data.

- [ ] **Step 1: Keep mock interfaces stable**

Before adding Supabase, define repository functions:

- `listProviders()`
- `getProvider(id)`
- `listReferrals()`
- `getReferral(id)`
- `listAssessments(partnerId)`
- `createReferral(input)`
- `updateReferralStatus(id, status)`

- [ ] **Step 2: Add role-based visibility**

Roles:

- Admin sees all.
- Business partner sees own channels.
- Referral source sees own referrals.
- Provider sees own profile and assigned/matched referrals.
- HushCare family user sees public provider discovery only.

- [ ] **Step 3: Migrate gradually**

Order:

1. Providers.
2. Assessments.
3. Referrals.
4. Matches.
5. Source channels.
6. Activity logs.
7. Revenue tracking.

## 90-Day Success Criteria

- One committed pilot partner.
- 30 providers invited.
- 20 readiness assessments completed.
- 10 providers internally listed.
- 10 real referrals logged.
- 3 accepted referral outcomes.
- 3 providers willing to pay for profile/share/training.
- One partner willing to continue using the dashboard.

## Do Not Build Yet

- Payments.
- Worker rostering.
- Care delivery workflows.
- Participant plan management.
- Clinical recommendations.
- Public open marketplace.
- Provider star ratings.
- Consumer reviews.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-06-23-careslink-ai-execution-plan.md`.

Two execution options:

1. Subagent-Driven: dispatch a fresh worker per phase, review between phases, best for speed.
2. Inline Execution: execute phase-by-phase in this thread, best for tight founder control.
