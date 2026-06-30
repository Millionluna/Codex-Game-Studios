# CaresLink AI v1.1 Referral Pack-First Implementation Plan

Date: 2026-06-30  
Source PRD: `docs/superpowers/specs/2026-06-30-careslink-ai-v1.1-referral-pack-first-prd.md`

## Goal

Reframe the logged-in provider workspace from a profile/readiness dashboard into a Referral Pack-first operating workspace.

The provider should immediately understand:

```text
Prepare what to send -> record who received it -> follow up -> fix blockers
```

## Non-Goals

- No marketplace.
- No booking.
- No referral matching.
- No payment.
- No provider ranking.
- No provider verification, certification, endorsement, approval, or quality assessment.
- No clinical, legal, compliance, medical, or care advice.
- No new OpenAI endpoint.
- No new AI material type.
- No new database table unless a test exposes a missing metadata-only event need.

## Implementation Steps

### 1. Workspace Navigation And Homepage

- Reorder provider navigation to place `Referral Pack` and `Outreach` before secondary profile/material routes.
- Change `/referral-workspace` title and hero copy to `Referral Pack workspace`.
- Change primary CTA to point to Referral Pack or the most urgent next action.
- Promote Referral Pack status, recent outreach, and follow-up due above generic profile metrics.
- Keep admin cockpit unchanged except for regression safety.

### 2. Referral Pack Page

- Keep basic profile intro available without guided AI access.
- Add target-oriented copy framing:
  - support coordinator
  - case manager
  - another provider
  - community group / WeChat
  - family/contact
- Make `Record send` feel like a natural next step after copying.
- Add post-send next action into Outreach.
- Preserve metadata-only copy/send tracking.

### 3. Outreach Page

- Reframe as `Follow-up assistant` instead of a raw tracker.
- Put follow-up due and recent sends before add-record form.
- Keep create/update API unchanged.
- Keep provider-owned operational record boundary visible.

### 4. Readiness / Profile / Materials Copy

- Reframe readiness as `Referral blockers`.
- State that profile powers Referral Pack.
- State that materials create drafts for Referral Pack.
- Preserve self-submitted / provider-reviewed / general business profile wording.

### 5. Tests

- Update workspace rendering tests for Referral Pack-first copy.
- Update navigation tests for provider/admin role-specific nav.
- Update Referral Pack tests for basic intro availability and send flow copy.
- Update Outreach tests for follow-up assistant framing.
- Update i18n tests for English and Simplified Chinese text.

### 6. Verification

Run:

```text
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

If production deployment is requested after implementation, run Vercel production deploy and real-session smoke separately.

## Acceptance Criteria

- A logged-in provider sees Referral Pack as the main workspace job.
- A provider can copy a basic pack item without AI access.
- A provider can record a send from Referral Pack.
- A provider can update follow-up status from Outreach.
- Readiness surfaces concrete referral blockers.
- Real Supabase provider sessions do not show demo account wording or internal query-param language.
- Existing auth, handoff, access, guided AI gates, outreach API, and admin pages keep working.

