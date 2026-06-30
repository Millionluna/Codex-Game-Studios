# CaresLink AI v1.2 Targeted Referral Pack Design

Date: 2026-06-30
Owner: CaresLink AI
Status: Draft for review
Production baseline: `https://ai.careslink.com.au`

## Product Design Brief

CaresLink AI should move from "I generated a provider profile" to "I prepared something I can send, recorded who received it, and know what to do next."

The next product slice is not a marketplace, matching engine, booking tool, CRM, payment layer, compliance workflow, clinical tool, legal tool, or care advice product. It is a provider-operated referral communication workspace.

The v1.2 experience should keep the current Taito-inspired operational UI direction, but make the interaction more obvious:

```text
Choose recipient target -> review best-fit wording -> copy -> record send -> follow up
```

## Current Diagnosis

The v1.1 workspace has the right strategic direction, but still has three gaps:

1. **The Referral Pack is not targeted enough.**
   It shows a target selector concept, but the provider does not yet get clearly different, recipient-specific wording for support coordinators, case managers, other providers, community groups, and family contacts.

2. **The send loop is too implicit.**
   Providers can record outreach, but the page does not make the moment after copying feel like the natural next action.

3. **Simplified Chinese page copy has a regression risk.**
   Some page-local Chinese strings in the workspace appear corrupted in source files. This must be fixed before adding new pilot polish, because Chinese/multilingual providers are part of the beachhead.

## Target User

Primary:

- Small aged care or NDIS providers in Australia.
- Individual providers or small organisations.
- Providers who rely on warm referrals from support coordinators, case managers, community groups, other providers, or multilingual networks.
- Providers who need English and Chinese/community-language wording.

Secondary:

- CaresLink admin reviewing access and usage metadata.

Not v1.2:

- Families searching for care.
- Referral buyers or lead purchasers.
- Large providers needing full CRM automation.
- Anyone expecting CaresLink to assess provider quality, eligibility, compliance, outcomes, clinical suitability, or legal suitability.

## Product Promise

Prepare the right Referral Pack wording for the person you are contacting, send it, and keep track of follow-up.

## Approaches Considered

### Option A: Build More AI Material Types

Add more generated material variants and prompts.

Pros:

- Feels like more AI.
- Easy to demo as feature quantity.

Cons:

- Does not solve "what do I do after generating?"
- Increases OpenAI cost and access gating pressure.
- May make the product feel like a generic copywriter.

Decision: Do not choose for v1.2.

### Option B: Build A Referral Marketplace

Let providers send and receive actual referrals.

Pros:

- Aligns with the long-term platform vision.
- Potentially monetizable.

Cons:

- Too early.
- High trust, privacy, consent, compliance, and network-liquidity risk.
- Requires real supply/demand behavior that the current product has not validated.

Decision: Do not choose for v1.2.

### Option C: Targeted Referral Pack + Send Tracking

Make the existing Referral Pack more recipient-specific and connect copy actions to send records and follow-up.

Pros:

- Validates whether providers will use CaresLink during real referral outreach.
- Creates behavioral data without becoming a marketplace.
- Builds toward the future referral operating system.
- Uses existing profile, materials, and outreach infrastructure.

Cons:

- Less flashy than new AI features.
- Requires careful UX copy so providers understand the workflow.

Decision: Choose this for v1.2.

## v1.2 Scope

### P0

1. Fix corrupted Simplified Chinese page-local workspace copy.
2. Create deterministic target-specific Referral Pack wording from provider-submitted profile data and saved drafts.
3. Improve `/referral-workspace/referral-pack` around a strong recipient target flow:
   - support coordinator
   - case manager
   - other provider
   - community group / WeChat
   - family contact
4. Make "Copy" and "Record send" feel like one workflow.
5. Improve `/referral-workspace/outreach` as a follow-up queue:
   - follow-up due
   - no reply yet
   - replied
   - not suitable
6. Update `/referral-workspace` cockpit next action logic:
   - no pack action -> prepare Referral Pack
   - no send record -> record first send
   - follow-up due -> update outreach
   - blocker exists -> fix blocker
7. Add metadata-only analytics for targeted pack interaction where possible without storing generated content.

### P1

1. Print/PDF Referral Pack export.
2. Saved recipient/contact list.
3. Follow-up reminder email.
4. Public profile publish confirmation.
5. Admin activation metrics by cohort/source.

### Explicit Non-Goals

- No OpenAI endpoint.
- No marketplace.
- No booking.
- No lead resale.
- No public provider ranking.
- No provider approval, verification, certification, endorsement, guarantee, or quality score.
- No compliance, clinical, legal, medical, or care advice.
- No storing copied message content in analytics events.

## Core User Flow

### First Session

```text
Provider enters from public generator
-> logs in or registers
-> lands in CaresLink AI workspace
-> sees Referral Pack as the main job
-> chooses who they want to contact
-> reviews target-specific wording
-> copies wording
-> records recipient and channel
-> sees next follow-up action
```

### Returning Session

```text
Provider opens workspace
-> sees follow-up due / no reply / replied summary
-> updates outreach status
-> improves profile gaps if referral blockers remain
```

## Referral Pack Targets

### Support Coordinator

Emphasis:

- Services offered.
- Service areas.
- Intake/contact path.
- Languages.
- Best-fit participant/client types if provider submitted them.
- Response expectation.

Tone:

- Professional.
- Clear enough for warm introduction.
- No quality or compliance claims.

### Case Manager

Emphasis:

- Referral fit.
- What information is useful before introduction.
- Contact and response path.
- Service boundaries.

Tone:

- Operational and precise.

### Other Provider

Emphasis:

- What the provider can receive.
- What handover information helps.
- How collaboration should be introduced.
- Service boundaries.

Tone:

- Peer-to-peer.

### Community Group / WeChat

Emphasis:

- Short, forwardable wording.
- Plain-language service summary.
- Area and language.
- Clear next step.

Tone:

- Friendly and concise.
- Bilingual/community-ready where possible.

### Family Contact

Emphasis:

- Plain-language support description.
- Location/service area.
- Contact method.
- Next step.

Tone:

- Simple and non-technical.

## UX Requirements

### Workspace Cockpit

The cockpit should answer:

1. Is my Referral Pack usable?
2. Who should I send it to next?
3. Have I recorded a send?
4. Do I need to follow up?
5. What profile blocker should I fix?

Top action should be dynamic:

- If profile is very incomplete: "Review pack source details".
- Else if no pack view/copy/send has happened: "Prepare Referral Pack".
- Else if no outreach record exists: "Record first send".
- Else if follow-up exists: "Update follow-up".
- Else: "Prepare another target".

### Referral Pack Page

The page should feel like an action surface, not a library.

Above the fold:

- Page title.
- Short explanation.
- Target selector.
- Current selected target summary.
- Primary target copy card.
- Copy action.
- Record send form or compact drawer/section.

The provider should not need to understand internal material types before using the pack.

### Outreach Page

The page should feel like a follow-up assistant, not a raw table.

Sections:

1. Follow-up due.
2. No reply yet.
3. Recent sends.
4. Manual add/update form.

Each record should allow quick status update through the existing `POST /api/outreach-records` update mode.

### Chinese UX

Simplified Chinese should be natural, not mixed with mojibake or awkward machine translation.

Preferred terms:

- Referral Pack: `转介资料包`
- Outreach: `跟进`
- Send record: `发送记录`
- Follow-up due: `需要跟进`
- Provider: `服务商`
- Support coordinator: `支持协调员`
- Case manager: `个案经理`
- Community group: `社区群组`

Keep the product term `Referral Pack` where it helps brand continuity, but the page should be understandable in Chinese without English.

## Data And Privacy

Existing stores should be reused:

- `provider_drafts`
- `generated_material_drafts`
- `generated_material_events`
- `outreach_records`

New content should not be stored unless the provider explicitly saves an outreach record. Analytics should be metadata-only:

- target type
- event type
- provider draft id
- generated material draft id if applicable
- timestamp

Do not store copied message body in analytics.

## Success Metrics

Pilot cohort:

1. 50% of registered provider users open Referral Pack during first session.
2. 35% choose or interact with a recipient target.
3. 30% copy targeted pack wording.
4. 20% create an outreach record.
5. 15% update an outreach status or return to Outreach within 7 days.
6. 7 out of 10 interviewed providers can explain the product as "prepare and track referral communication", not just "generate a profile".

## Acceptance Criteria

- Chinese workspace pages do not show corrupted Chinese copy.
- A provider can choose a recipient target and see target-specific pack wording.
- A provider can copy target-specific wording without AI access.
- A provider can record the send with recipient, role, channel, status, and follow-up date.
- Outreach groups records by practical follow-up state.
- The cockpit recommends the next best referral action based on pack, send, follow-up, and blocker state.
- Admin pages continue to show metadata only.
- Demo fallback remains available for local testing but does not leak into real Supabase sessions.
- Full verification passes: tests, typecheck, lint, build.

## Open Product Questions

1. Should the Chinese UI keep `Referral Pack` as a product name or use `转介资料包` everywhere?
2. Should target-specific wording be shown as one primary card or multiple fields per target?
3. Should the first send form stay inline on the Referral Pack page, or open as a compact modal/drawer?

## Recommendation

Implement v1.2 as a focused pilot polish release:

```text
Fix Chinese copy -> target the pack -> connect copy to send record -> improve follow-up queue
```

This is the smallest next slice that makes the product meaningfully more useful after profile generation while still preserving the long-term referral platform path.
