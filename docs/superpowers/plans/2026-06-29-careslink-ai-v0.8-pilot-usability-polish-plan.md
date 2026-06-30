# CaresLink AI v0.8 Pilot Usability Polish Plan

Goal: make the post-profile referral loop usable for a pilot provider without adding new AI generation, marketplace, payment, booking, matching, or advice workflows.

Boundary:
- Keep all output as provider-reviewed general business profile / operational support.
- Do not add referral matching, lead resale, ranking, provider endorsement, compliance, clinical, legal, or care advice.
- Do not add new OpenAI endpoints or material types.

## P0 Scope

1. Make outreach records maintainable.
   - Keep `POST /api/outreach-records` as the single write path.
   - Support `mode=update` for provider-owned outreach records.
   - Allow provider to update status, last contacted date, next follow-up date, and notes.

2. Polish Referral Pack usability.
   - Group materials by type: profile intro, profile rewrite, referral message, share card, bilingual intro, and handover checklist.
   - Improve the no-generated-drafts state so providers know the basic profile intro is still usable.
   - After mark-as-sent success, route the next action toward Outreach.

3. Tighten cockpit follow-up signal.
   - Keep Referral Pack and Outreach visible in provider nav.
   - Make pending follow-up status a clear next action from the cockpit.

4. Verification.
   - Update focused route/store tests.
   - Run focused tests, full tests, typecheck, lint, and build.
