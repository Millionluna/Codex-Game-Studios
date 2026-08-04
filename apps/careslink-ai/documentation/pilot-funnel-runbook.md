# AI Documents V1: 30-day invite-only pilot

## Purpose and cohort

Run the NDIS Case Note Companion as a controlled 30-day provider pilot. Every participant receives the existing Free entitlement of 3 generation credits per UTC month. Do not connect Stripe, automatically replenish credits, or manually top up a participant before the pilot decision review.

Rollout sequence:

1. Invite 3 canary providers.
2. Wait at least 48 hours. Expand only if there is no privacy, owner-isolation, credit-correctness, or release incident.
3. Expand to 8 providers.
4. Expand to 10-20 providers only after the same safety checks remain clear.

## Metric definitions

| Metric | Operational definition |
|---|---|
| Invited | Provider has an active `ndis_case_note_v01` row in the service-role-managed `pilot_cohort_members` allowlist. Reports join by owner UUID and membership effective time; they never join or return email. |
| Activated | First successful `companion_generated` event within 72 hours of that provider's first pilot `companion_viewed` event. |
| Utility | `companion_saved` or `companion_copied` in the same hashed browser context within 4 hours after a successful generation. This time-bounded proxy avoids storing a raw session or flow ID. |
| Repeat | Successful generations on at least 2 different UTC dates within 14 days of first activation. |
| Paid intent | `companion_offer_requested` after the zero-credit screen shows the explicit concept price of Starter A$9.99/month for 30 generation credits. This is research intent only, not a purchase. |
| Technical success | Successful credit commits divided by successful commits plus controlled technical releases after a model/storage attempt. Pre-model privacy, rate-limit and abuse-quota blocks are excluded. |
| Credit correctness | Every reservation has exactly one terminal commit or release, no duplicate terminal event, and no negative available balance. |

The application may store allowlisted metadata such as event name, owner ID, hashed visitor context, source/surface, locale, timestamps, credit state, controlled reason code, model name and token counts. Pilot reports must expose only aggregate counts and rates. Never export user IDs, visitor hashes, reservation IDs, idempotency keys, prompts, inputs, outputs, participant facts, generated content, or free-text errors.

## Cohort membership control

`public.pilot_cohort_members` is the sole reporting allowlist for this pilot. It stores only account owner UUID, the fixed cohort code, controlled rollout stage, enrollment time and optional removal time. RLS is enabled; `anon` and `authenticated` have no table privileges. Only a trusted service-role operation may add or close membership.

- Add the 3 canary accounts with `cohort_code = 'ndis_case_note_v01'`, `cohort_stage = 'canary'` and the real invitation time in `enrolled_at`.
- At the 8-person stage, add only newly invited accounts with `cohort_stage = 'eight_provider'`; do not rewrite earlier enrollment times.
- At 10-20 people, use `cohort_stage = 'full_pilot'` for new members.
- To stop counting an account prospectively, set `removed_at`; do not delete the row during the 30-day audit window.
- Do not store email, contact details, invite messages, answers, prompts or document content in this table.

Every report query joins events and credit ledger rows to an active membership interval. A signed-in provider without a membership row is therefore excluded from invited, activation, utility, repeat, paid-intent, technical-success and credit-correctness pilot measures.

## Go gate

All conditions must be met at the end of the review window:

- At least 10 activated providers.
- Activation rate at least 70%.
- Same-session save/copy utility at least 60%.
- 14-day repeat rate at least 40%.
- At least 3 providers request more credits after seeing the concept price.
- Technical success rate at least 95%.
- Credit correctness 100%.
- Privacy and cross-owner incidents: 0.

## Immediate pause conditions

Pause invitations and generation immediately if any of these occur:

- Input, output, pasted text, participant facts or generated document content appears in telemetry or an admin surface.
- One provider can read, update, delete or infer another provider's document, claim, entitlement or ledger record.
- A request is charged twice, a replay invokes a second model call, or a failed generation does not release its reserved credit.
- A privacy, RLS, date-parity or provider-only auth gate fails.

Do not weaken validation or RLS to keep the pilot running. Record only incident metadata, stop expansion, diagnose, fix, rerun the release gate, and then decide whether to resume.

## Daily operation

1. Review aggregate SQL output from `documentation/pilot-funnel.sql`.
2. Confirm the aggregate invited count matches the controlled cohort stage before interpreting rates; never export the underlying UUID allowlist.
3. Check Vercel runtime errors and controlled HTTP failure rates without inspecting request bodies.
4. Confirm outstanding reservations have not exceeded their expiry window.
5. Confirm credit-correctness anomaly count is zero.
6. Confirm no new admin view or export exposes content.
7. At the 48-hour canary checkpoint, record a Go/Pause decision before inviting the next cohort.

## Attribution contract

Only these Core pairs are accepted and persisted:

- `surface=core_product_landing` with `utm_medium=product_landing`
- `surface=core_download_success` with `utm_medium=post_download`

Both use the fixed source, resource slug, UTM source and campaign documented in the integration contract. Unknown or mismatched surface/medium values are dropped. No user content or contact details are permitted in URLs.

## Decision after 30 days

If the Go gate passes, interview requesters before choosing packaging. Do not infer willingness to pay from `offer_viewed`; only an explicit `offer_requested` after price exposure counts as paid intent. If the gate does not pass, keep Stripe off and address activation, utility or reliability before adding another document type.
