# CaresLink AI v0.7 Referral Pack + Outreach MVP Plan

Goal: turn the post-profile experience into a small referral operating loop: profile -> referral pack -> send/copy -> outreach record -> follow-up status.

Boundary:
- Do not add marketplace, booking, payment, lead resale, ranking, referral matching, provider endorsement, compliance, clinical, legal, or care advice.
- Do not add new OpenAI endpoints or material types.
- Treat all generated wording as provider-reviewed draft material based on self-submitted information.

## P0 Scope

1. Add a provider-facing Referral Pack surface.
   - Route: `/referral-workspace/referral-pack`
   - Show provider summary, public/profile context, saved/generated draft fields, and ready-to-copy outreach snippets.
   - Provide copy actions and clear "mark as sent" path.

2. Add a lightweight Outreach tracker.
   - Route: `/referral-workspace/outreach`
   - Let provider add a manual outreach recipient.
   - Track recipient name, organisation, role type, channel, status, last contacted date, next follow-up date, and notes.
   - Persist in Supabase when env is configured, otherwise fallback to memory store.

3. Wire "Copy + Mark as sent".
   - Existing generated draft copy stays metadata-only.
   - Add a protected POST route to record a sent outreach event against a draft/material item without storing generated content.

4. Upgrade cockpit next actions.
   - Show Referral Pack readiness, outreach count, pending follow-ups, and latest outreach activity.
   - Primary next action after profile/readiness/access should point to Referral Pack or Outreach.

5. Tests and verification.
   - Store tests for memory/Supabase mapping.
   - Route tests for referral-pack and outreach pages.
   - Regression tests that real provider nav shows Referral Pack and Outreach without demo/marketplace language.
   - Run focused tests, full tests, typecheck, lint, build.
