# CaresLink Referral Profile Workspace v0.1 Boundaries

## Completed In This Slice

- Public entry redirects to the Referral Profile Workspace.
- Free preview users can see a self-submitted profile, readiness score, readiness signals, priority issues, locked material previews, agent queue state, and guided copilot preview.
- Profile builder preview distinguishes individual and organisation profiles, plus receive, send, and both-direction referral workflows.
- Health audit uses deterministic profile-completeness rules and flags unsafe self-submitted profile summary copy.
- Materials page shows free/no-code mode and a deterministic access-code demo mode.
- Access request and admin request queue pages are read-only previews.
- Legacy provider records remain reachable but are clearly bounded as internal demo records, not a public directory or endorsement.
- Safe-copy guardrails block certification, guarantee, provider-quality, compliance, clinical, and endorsement-style claims in generated/displayed profile copy.

## Not Implemented Yet

- Real user registration, login, email verification, sessions, or team accounts.
- Real database persistence for profile edits, access requests, admin decisions, quotas, or generated materials.
- Real access-code creation, redemption, revocation, or server-side authorization.
- Real OpenAI API calls, streaming chat, generation jobs, caching, or cost accounting.
- Real abuse controls such as per-user/IP quotas, multi-account detection, rate limiting, invite enforcement, or audit logs.
- Real provider review, provider quality assessment, clinical suitability assessment, compliance assessment, or service outcome tracking.
- Payments or paid plans.

## Next Build Order

1. Add authentication and account model.
2. Persist referral profile fields and access requests.
3. Implement invite/access-code issuance with server-side authorization and quota checks.
4. Add OpenAI generation behind the access gate with safe-copy validation, caching, and usage logging.
5. Add admin actions for access request review, quota changes, revocation, and abuse monitoring.
6. Add analytics for profile completion, access requests, preview-to-code conversion, and AI usage cost.

## Trust Boundary

CaresLink should continue to describe this product as a referral communication readiness and profile-completeness workspace. It should not claim to certify providers, approve provider quality, guarantee referrals or services, assess clinical suitability, assess compliance status, or provide legal, clinical, medical, compliance, financial, or professional advice.
