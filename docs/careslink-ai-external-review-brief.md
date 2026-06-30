# Careslink AI External Review Brief

> Confidential partner preview. Please do not redistribute screenshots, links, copied text, or implementation details without permission.

## Demo Links

Primary pitch page:

- https://demo.careslink.com.au/demo

Key product flows:

- Platform admin: https://demo.careslink.com.au/admin
- Free provider assessment: https://demo.careslink.com.au/provider-assessment
- Readiness report: https://demo.careslink.com.au/provider-assessment/report
- Referral source portal: https://demo.careslink.com.au/referral-source-portal
- Referral receiver / provider portal: https://demo.careslink.com.au/provider-portal
- HushCare family provider finder: https://demo.careslink.com.au/hushcare-provider-finder
- Share card preview: https://demo.careslink.com.au/share-cards

## One-Line Summary

Careslink AI is a B2B referral operating system for Australian aged care and NDIS service networks. It starts with one trusted business partner or group owner, turns scattered provider and referral information into structured data, and uses AI-assisted tools to improve provider readiness, matching, sharing, and follow-up.

## What This Is Not

- Not a public consumer marketplace at launch.
- Not a care delivery platform.
- Not a rostering or employment system.
- Not a payment platform.
- Not a clinical, legal, or plan-management advice tool.
- Not a provider certification or guarantee system.

## Core Product Thesis

The first product wedge is a free Provider Referral Readiness Assessment.

Instead of asking providers to pay to join a directory, Careslink offers a useful free assessment that helps providers understand whether their profile, service coverage, language capability, intake process, response time, and shareable materials are ready for referral partners.

This gives Careslink three assets:

- Structured provider data.
- Trust with providers and group owners.
- A practical path to monetization through AI profile packs, share cards, training, Provider Pro tools, partner dashboards, and agency CRM.

## Role Model

### 1. Platform Admin

Manages rules, provider review, source tracking, readiness pipeline, referral pipeline, network quality, and future commercial reporting.

### 2. Business Partner / Group Owner

Provides existing community or industry resources: WeChat groups, provider relationships, referral needs, industry judgment, and provider review support.

### 3. Referral Source

Can send referral needs into the system. This may be a support coordinator, case manager, community operator, group owner, or provider acting as a demand source.

### 4. Referral Receiver / Provider

Can receive matched referral opportunities, maintain capacity, update profile, respond to referrals, and generate profile/share materials.

### 5. Family / End User Via HushCare

Can search for suitable provider categories from the family-care context. HushCare should only pass voluntary service needs, suburb/postcode, language preference, urgency, and consent. It must not expose elder game scores, mistakes, reaction time, or ability inference.

## Current Demo Scope

The current demo is a frontend MVP with mock data. It demonstrates:

- Partner pitch page.
- Platform admin dashboard.
- Free provider assessment.
- Provider readiness report.
- Referral source portal.
- Provider receiver portal.
- Provider directory.
- Referral intake and matching.
- Share card preview.
- HushCare provider finder bridge.

It is not yet connected to real authentication, Supabase, payment, real AI, or production workflow automation.

## Intended Monetization Path

Do not lead with provider listing fees.

Suggested sequence:

1. Free provider readiness assessment.
2. AI bilingual profile and share card pack.
3. Referral readiness training / academy.
4. Provider Pro tools.
5. Partner dashboard licence.
6. Agency/team CRM.
7. Channel partner revenue share later.

## Main Review Questions

Please review from these angles:

1. Is the product positioning clear?
2. Is the free provider assessment a strong enough cold-start wedge?
3. Would a provider complete this assessment?
4. Would a group owner or channel partner see value in the readiness map and referral dashboard?
5. Are the role boundaries clear: admin, partner, referral source, referral receiver, family user?
6. Does the demo avoid risky language such as certification, guarantee, clinical advice, or quality endorsement?
7. Which page is most convincing?
8. Which page feels unnecessary or confusing?
9. What would you remove before showing this to a serious partner?
10. What must be built next to make this pilot-ready?

## Specific UX Review Requests

Please inspect:

- Whether the demo explains the business model without sounding like a generic directory.
- Whether the free assessment flow feels useful, not like a disguised sales form.
- Whether the readiness report gives enough value while not giving away the entire playbook.
- Whether the provider portal makes sense for both organizations and individual practitioners.
- Whether the referral source portal makes sense for a group owner or coordinator.
- Whether HushCare integration feels natural and privacy-safe.

## Specific Product Strategy Review Requests

Please evaluate:

- Cold-start feasibility.
- Provider acquisition path.
- Business partner incentives.
- Defensibility beyond frontend copying.
- Data assets created by the workflow.
- First paid product to test.
- Compliance and trust risks.

## Specific Technical Review Requests

Please evaluate the planned engineering path:

- Start with current Next.js frontend.
- Add a repository layer before Supabase.
- Add Supabase Auth, Postgres, Storage, and RLS.
- Add role-based access control.
- Add provider assessment workflow.
- Add referral workflow.
- Add AI adapter and prompt safety layer.
- Add HushCare lead bridge.

Known technical plans:

- R&D plan: `docs/superpowers/plans/2026-06-23-careslink-ai-rd-plan.md`
- Business execution plan: `docs/superpowers/plans/2026-06-23-careslink-ai-execution-plan.md`

## Review Output Format Requested

Please return feedback in this structure:

```md
## Overall Verdict

One paragraph: should this project continue, pivot, or narrow?

## Top 5 Strengths

1.
2.
3.
4.
5.

## Top 5 Risks

1.
2.
3.
4.
5.

## What To Change In The Demo

- Must change:
- Should change:
- Nice to have:

## What To Build Next

1.
2.
3.

## Monetization Opinion

Which offer should be tested first and why?

## Compliance / Trust Concerns

Any language, flow, or feature that feels risky.

## Final Recommendation

Clear next move for the founder.
```

## Copy-Paste Prompt For Another AI / Project

```text
Please review this product demo and concept as a product strategist, UX reviewer, and technical advisor.

Project: Careslink AI
Demo: https://demo.careslink.com.au/demo

Careslink AI is a B2B referral operating system for Australian aged care and NDIS service networks. It is not intended to start as a public consumer marketplace. The cold-start wedge is a free Provider Referral Readiness Assessment that helps providers improve their profile, intake process, language/service coverage, and referral partner readiness. The platform then turns provider data, referral needs, source tracking, matching, follow-up, and share cards into a partner-operated referral network.

Please review these pages:
- Platform admin: https://demo.careslink.com.au/admin
- Free provider assessment: https://demo.careslink.com.au/provider-assessment
- Readiness report: https://demo.careslink.com.au/provider-assessment/report
- Referral source portal: https://demo.careslink.com.au/referral-source-portal
- Provider receiver portal: https://demo.careslink.com.au/provider-portal
- HushCare family provider finder: https://demo.careslink.com.au/hushcare-provider-finder
- Share card preview: https://demo.careslink.com.au/share-cards

Please focus on:
1. Product positioning clarity.
2. Cold-start feasibility.
3. Whether the free assessment is a strong provider acquisition wedge.
4. Whether group owners/channel partners would see enough value.
5. UX clarity across roles.
6. Compliance/trust risks, especially around certification, guarantees, clinical advice, or service quality claims.
7. What should be removed, simplified, or built next.
8. Which monetization offer should be tested first.

Please return feedback using:
- Overall verdict
- Top 5 strengths
- Top 5 risks
- What to change in the demo
- What to build next
- Monetization opinion
- Compliance/trust concerns
- Final recommendation
```

