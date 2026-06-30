# PRD: CaresLink AI v1.1 Referral Pack-First Workspace

Date: 2026-06-30  
Owner: CaresLink AI / Core PM  
Status: Draft for review  
Production baseline: `https://ai.careslink.com.au`

## 1. Summary

CaresLink AI v1.1 reframes the logged-in provider workspace from a profile management dashboard into a Referral Pack-first operating workspace.

The goal is to make the product feel immediately useful after a provider creates or imports a profile: prepare a sendable referral pack, copy the right version for a referral partner, record who received it, and know when to follow up.

This release does not add a marketplace, booking, referral matching, payment, provider ranking, quality endorsement, clinical advice, legal advice, or compliance assessment.

## 2. Contacts

| Name | Role | Comment |
| --- | --- | --- |
| Alex / CaresLink founder | Product owner | Owns pilot positioning, provider feedback, and go-to-market direction. |
| Core PM thread | Website / public funnel owner | Owns public generator, public preview, CTA copy, and handoff into AI. |
| CaresLink AI thread | AI workspace implementation owner | Owns logged-in workspace, Referral Pack, Outreach, access, admin, and Supabase-backed workspace flows. |
| Pilot providers | Target users | Small aged care and NDIS providers, especially multilingual providers relying on community referrals. |

## 3. Background

### Current state

CaresLink AI already has:

- Supabase login/register.
- Provider draft handoff from the public profile generator.
- Provider cockpit.
- Profile page.
- Readiness/health page.
- Guided materials with access gates and quota.
- Referral Pack page.
- Outreach tracker.
- Admin access requests and material usage pages.
- Production deployment at `https://ai.careslink.com.au`.

### Current problem

The product has useful pieces, but the experience still feels like a backend workspace:

```text
Profile -> Readiness -> Materials -> Outreach
```

That sequence is logical internally, but it is not the way providers think.

Providers are more likely to think:

```text
What can I send to referral partners?
Who should I send it to?
How do I follow up?
What is missing that makes people hesitate to refer to me?
```

### Why now

The product has enough infrastructure to create a more compelling first-use loop without adding large new backend scope:

- Profile data exists.
- Saved material drafts exist.
- Copy events exist.
- Outreach metadata records exist.
- Access gating exists.

v1.1 should use those assets to sharpen the core job: help providers become easier to introduce.

## 4. Objective

### Objective

Make CaresLink AI feel like a practical referral growth workspace instead of an AI profile dashboard.

### Product promise

```text
Prepare a referral-ready pack, send it to the right people, and track follow-up.
```

### Customer benefit

Providers should leave the first session with a concrete business action completed:

- A referral pack prepared.
- A piece of copy copied.
- A referral partner/contact recorded.
- A follow-up status set.

### Business benefit

This gives CaresLink AI a stronger reason for providers to return. It also creates behavioral data that can support future referral network features without prematurely becoming a marketplace.

### Key results

For the next pilot cohort, measure:

1. **Activation:** At least 50% of registered provider users open Referral Pack during their first workspace session.
2. **Action:** At least 30% of registered provider users copy pack content or mark a pack item as sent.
3. **Follow-up:** At least 20% of registered provider users create or update an outreach record.
4. **Return use:** At least 15% of activated users return within 7 days to view or update Outreach.
5. **Comprehension:** In pilot interviews, at least 7 out of 10 providers can describe the product as a tool for preparing and tracking referral communication, not only generating a profile.

## 5. Market Segments

### Primary beachhead

Small-to-mid aged care and NDIS providers who rely on warm referrals, community groups, support coordinators, case managers, other providers, or multilingual networks.

Best first wedge:

```text
Chinese / multilingual aged care and NDIS providers in Australia who need professional English and community-language referral communication.
```

### User types

| User type | Need | v1.1 fit |
| --- | --- | --- |
| Provider receiving referrals | Wants to explain services clearly and make referral partners comfortable introducing them. | Strong fit. Referral Pack and Outreach directly support this job. |
| Provider sending referrals | Wants to prepare clear context before introducing a person to another provider. | Partial fit. v1.1 should not optimize for sender workflows yet, but should preserve profile fields for send/both. |
| Individual provider / sole trader | Needs simple, fast, low-admin help. | Strong for copy/send/follow-up if the UI is lightweight. |
| Organisation provider | Needs more structured pack and team-ready wording. | Strong if pack looks professional and reviewable. |
| Admin / CaresLink operator | Needs to approve access and inspect usage metadata. | Existing scope remains. v1.1 should not expand admin content review. |

### Not the first target

- Families looking for providers.
- A public provider directory.
- A booking marketplace.
- A compliance or certification workflow.
- Large enterprise providers needing CRM-level sales tooling.

## 6. Value Propositions

### Main value proposition

CaresLink AI helps aged care and NDIS providers prepare referral-ready communication and track follow-up, using their self-submitted provider profile and reviewable AI-assisted drafts.

### Provider jobs-to-be-done

1. When I want referral partners to understand my service quickly, help me create a clear pack I can send.
2. When I send my provider information to someone, help me track who received it and when I should follow up.
3. When my profile is incomplete, tell me which missing details would make referral partners hesitate.
4. When I work across English and community languages, help me prepare wording that is professional and easy to share.

### Pains removed

- Provider does not know what to send.
- Provider rewrites the same introduction repeatedly.
- Referral partner receives vague or incomplete information.
- Provider forgets who they contacted.
- Provider has no follow-up rhythm.
- English/community-language descriptions are inconsistent.

### Differentiation

CaresLink AI should not compete as a generic AI writer. It should compete as a referral communication operating layer:

- Built around aged care and NDIS referral contexts.
- Uses structured provider profile data.
- Keeps outputs as provider-reviewed drafts.
- Connects copy generation to outreach tracking.
- Avoids marketplace and endorsement claims.

## 7. Solution

### 7.1 Product framing

Change the logged-in workspace mental model from:

```text
Provider cockpit
Profile readiness
AI materials
Outreach tracker
```

to:

```text
Referral Pack
Send / record
Follow up
Improve readiness blockers
```

### 7.2 Navigation changes

Provider navigation should prioritize:

1. Workspace
2. Referral Pack
3. Outreach
4. Readiness
5. Profile
6. Materials
7. Access

Admin navigation remains:

1. Access requests
2. Material usage

Do not show demo/internal routes in real Supabase sessions.

### 7.3 Workspace homepage changes

`/referral-workspace` should become a Referral Pack-first cockpit.

Above the fold:

- Title: `Referral Pack workspace`
- Subtitle: `Prepare what to send, record who received it, and know what to follow up next.`
- Primary CTA: `Prepare Referral Pack`
- Secondary CTA: `Record outreach`

Main sections:

1. **Referral Pack status**
   - Pack ready or needs review.
   - Number of pack items.
   - Latest copied/sent material.
   - Primary action to open Referral Pack.

2. **Next best action**
   - If profile has blockers: fix readiness blocker.
   - If pack exists but no send: send or record first outreach.
   - If follow-up exists: update outreach follow-up.
   - If no saved generated draft but profile exists: use basic profile intro or generate/review materials.

3. **Referral blockers**
   - Replace abstract readiness language with concrete blocker language.
   - Example: `Referral partners may not know your service area.`
   - Example: `Your response time is not clear.`
   - Example: `Your intake/contact method is not clear.`

4. **Recent outreach**
   - Latest recipients.
   - Sent count.
   - Follow-up due count.
   - Link to Outreach.

Right rail:

- Access status.
- Pack usage summary.
- Trust boundary.

### 7.4 Referral Pack page changes

`/referral-workspace/referral-pack` becomes the core product surface.

It should help users answer:

```text
What should I send, and to whom?
```

Required sections:

1. **Pack preview**
   - Basic provider intro always available.
   - Saved generated drafts grouped by use case.
   - Clear provider review requirement.

2. **Send target selector**
   - Support coordinator.
   - Case manager.
   - Another provider.
   - Community group / WeChat.
   - Family/contact.

3. **Copy options**
   - Copy basic intro.
   - Copy referral partner summary.
   - Copy bilingual/community intro if available.
   - Copy all pack text.

4. **Record send**
   - Recipient name.
   - Organisation.
   - Recipient type.
   - Channel.
   - Status.
   - Next follow-up date.

5. **Post-send next step**
   - After saved send, show: `Send recorded. Set or review follow-up.`
   - Link to Outreach filtered/highlighted by latest record.

Important: Do not require AI access to use the basic Referral Pack. Free providers should still get value from the self-submitted profile intro.

### 7.5 Outreach page changes

`/referral-workspace/outreach` should feel less like a raw table and more like a follow-up assistant.

Required sections:

1. **Follow-up queue**
   - Records with `follow_up` status or next follow-up date.
   - Show the most urgent items first.

2. **Recent sends**
   - Who received the pack.
   - Channel.
   - Status.
   - Last contacted.
   - Next follow-up.

3. **Quick update**
   - Mark replied.
   - Set follow-up date.
   - Mark not suitable.
   - Update notes.

4. **Add record**
   - Keep current form, but make it secondary to follow-up queue and recent sends.

### 7.6 Readiness page changes

`/referral-workspace/health` should be reframed as Referral Blockers.

Copy should move from:

```text
Profile completeness / readiness score
```

to:

```text
What might stop someone from referring to you?
```

Examples:

- `Service area is missing. Referral partners may not know whether you can help.`
- `Referral fit is unclear. Partners may not know which client types suit you.`
- `Intake method is unclear. Partners may not know how to introduce someone.`
- `Response time is missing. Partners may not know what to expect after sharing your details.`

The score can remain, but it should not be the hero. The blockers should be the hero.

### 7.7 Profile page changes

Profile stays as the source of truth, but becomes a supporting page.

The page should clearly say:

```text
This information powers your Referral Pack.
```

Required changes:

- Show which fields affect pack quality.
- Label self-submitted information.
- Label AI-generated wording as draft content.
- Avoid any wording that implies verification, endorsement, certification, or quality assessment.

### 7.8 Materials page changes

Materials should become secondary to Referral Pack.

Required changes:

- Header copy: `Create drafts for your Referral Pack`.
- Every generated draft should have a clear path back to Referral Pack.
- Saved draft history should explain whether a draft is ready to include in the pack.

No new guided material type is required for v1.1.

### 7.9 Access page changes

Access remains an AI cost-control and pilot access mechanism.

Required changes:

- Clarify that basic Referral Pack is available without AI access.
- Clarify that guided AI materials require access.
- Avoid making access feel like the whole product.

### 7.10 Admin changes

Admin scope should stay small.

Required changes:

- Material usage should show metadata only.
- If outreach metadata appears in future admin pages, do not show private message content by default.
- Do not add provider quality review, approval badge, endorsement, or compliance judgment.

### 7.11 Data and backend

v1.1 should avoid new database tables if possible.

Use existing data:

- `provider_drafts`
- `generated_material_drafts`
- `generated_material_events`
- `outreach_records`
- `access_requests`
- `access_codes`
- `ai_usage_events`

Potential small backend additions only if needed:

- Add a metadata-only event type for Referral Pack copy if existing generated material event tracking does not cover basic profile intro copy.
- Add filtering/sorting helpers for follow-up queue.

### 7.12 UX flow

Primary provider flow:

```text
Public generator
-> AI login/register
-> Referral Pack workspace
-> Prepare Referral Pack
-> Copy suitable pack text
-> Record send
-> Set follow-up
-> Return to Outreach to update status
```

Free provider flow:

```text
Login
-> Referral Pack workspace
-> Basic profile intro available
-> Copy / preview
-> Access page explains guided AI unlock
```

Access-enabled provider flow:

```text
Login
-> Referral Pack workspace
-> Generate or review materials
-> Referral Pack includes saved drafts
-> Record send and follow-up
```

Admin flow:

```text
Login
-> Admin cockpit
-> Access requests / Material usage
```

### 7.13 Trust and compliance boundaries

Required product boundary:

```text
General business profile and operational support only.
```

Avoid:

- approved
- compliant
- verified
- guaranteed
- certified
- endorsed
- recommended provider
- quality assessment
- clinical recommendation
- legal advice
- compliance advice
- referral marketplace
- booking
- lead resale
- referral outcome guarantee

Use:

- self-submitted provider details
- provider-reviewed draft
- referral communication readiness
- general business profile
- operational support
- follow-up record
- not a provider endorsement

## 8. Release

### v1.1 first version

Focus on product clarity and reuse of existing infrastructure.

In scope:

- Workspace homepage becomes Referral Pack-first.
- Referral Pack page becomes core sendable asset surface.
- Outreach page becomes follow-up assistant.
- Readiness copy becomes Referral Blockers.
- Profile and Materials become supporting inputs to Referral Pack.
- Navigation order changes.
- Chinese and English copy are updated naturally.
- Existing tests are updated.
- Production boundary wording remains intact.

Out of scope:

- New marketplace.
- Booking.
- Lead resale.
- Provider ranking.
- Provider verification.
- Referral matching.
- New AI endpoint.
- New material type.
- Payment.
- Public provider directory expansion.
- Clinical, legal, or compliance advice.

### v1.2 candidate

Only after v1.1 pilot feedback:

- Better send target-specific pack composer.
- Follow-up reminders.
- Lightweight contact list.
- More structured pack share/download.
- Admin pilot metrics for pack copy/send/follow-up activity.

### v1.3 candidate

Only after repeated provider usage:

- Referral partner list.
- Partner-specific send history.
- Invite/referral source attribution.
- More advanced reporting.

### Rollout

1. Ship to production behind existing auth/access model.
2. Use current production domain `https://ai.careslink.com.au`.
3. Test with 5-10 pilot providers.
4. Track activation, copy, send, follow-up, and return usage.
5. Interview providers before adding more AI materials.

## 9. Acceptance Criteria

### Product

- A logged-in provider immediately sees Referral Pack as the main job of the workspace.
- A provider can understand what to do next within 10 seconds.
- A provider can copy at least one useful pack item without AI access.
- A provider can record a send from Referral Pack.
- A provider can update follow-up status from Outreach.
- A provider sees concrete referral blockers, not only an abstract score.

### UX

- Primary CTA on workspace points to Referral Pack or the next best referral action.
- Referral Pack copy says provider review is required.
- Outreach prioritizes follow-up and recent sends over a raw table.
- Profile page clearly states it powers Referral Pack.
- Materials page clearly routes saved drafts into Referral Pack.
- No real Supabase provider session sees demo account wording or internal query-param language.

### Technical

- Public generator handoff still works.
- Auth/login/register still work.
- Existing guided AI access gates still work.
- Existing outreach create/update API still works.
- Existing admin pages still work.
- Existing fallback/demo paths remain available for local testing only.
- No private lead capture fields are exposed in public URLs.

### Compliance

- No page claims CaresLink verifies, endorses, certifies, approves, ranks, or guarantees providers.
- No page implies clinical, legal, care, or compliance advice.
- Outreach remains a provider-owned operating record, not a CaresLink referral distribution claim.

### Verification

Before release:

- Focused page tests for workspace, Referral Pack, Outreach, Readiness, Materials.
- i18n tests for English and Simplified Chinese copy.
- Auth/session tests for real provider, admin, and demo fallback.
- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm build`
- Production smoke after deploy.

## 10. Assumptions To Validate

| Assumption | Risk | How to test |
| --- | --- | --- |
| Providers care more about sending/follow-up than profile quality. | If false, v1.1 may over-prioritize Referral Pack. | Interview 10 providers and observe first-session behavior. |
| Free/basic Referral Pack creates enough value before AI access. | If false, users may still feel blocked. | Track basic intro copy and mark-as-sent usage. |
| Outreach follow-up is lightweight enough to use. | If false, it feels like CRM admin work. | Watch pilot users record and update one send. |
| Referral Blockers language is more motivating than readiness score. | If false, users may ignore it. | Compare comprehension in pilot interviews. |
| Multilingual providers are a strong wedge. | If false, the beachhead may need shifting. | Recruit pilot users from Chinese/multilingual provider networks and measure activation. |

## 11. Open Questions

1. Should v1.1 rename the workspace nav label from `Workspace` to `Referral Pack` or keep `Workspace` but make its content Referral Pack-first?
2. Should basic profile intro copy events be tracked even when no generated material draft exists?
3. Should follow-up due date default to 3, 7, or 14 days after send?
4. Should Chinese UI use `转介资料包` or keep `Referral Pack` as the product term?
5. Should public site CTA change from `Continue to CaresLink AI` to `Prepare your Referral Pack`?

## 12. Recommended Implementation Order

1. Rewrite workspace information architecture and copy.
2. Update navigation order and route labels.
3. Redesign Referral Pack page around send target, copy, and record send.
4. Redesign Outreach page around follow-up queue and recent sends.
5. Reframe Readiness as Referral Blockers.
6. Update Profile and Materials support copy.
7. Update tests and i18n.
8. Run local and production verification.
