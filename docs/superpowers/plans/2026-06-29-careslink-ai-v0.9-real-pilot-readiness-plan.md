# CaresLink AI v0.9 Real Pilot Readiness Plan

Date: 2026-06-29

## Goal

Move the v0.7/v0.8 referral pack and outreach tracker from local/demo confidence to a real pilot-ready preview environment.

This pass does not add product scope. It verifies that authenticated provider sessions can use the outreach operating loop against remote Supabase and Vercel Preview.

## Scope

1. Verify the Supabase-backed `outreach_records` table exists remotely.
2. Apply the migration if it is missing.
3. Confirm the outreach API can create and update metadata-only outreach records with a real Supabase provider session.
4. Deploy a Vercel Preview.
5. Confirm the Vercel Preview can use the same Supabase auth/session/store path.
6. Update the website integration brief for Core.

## Completed

- Applied remote Supabase migration `create_outreach_records` to project `adocsnwnslxhxcjgbyee`.
- Verified `public.outreach_records` exists remotely.
- Ran local real-session smoke:
  - temporary provider user created;
  - outreach record created through `POST /api/outreach-records`;
  - record read back from Supabase;
  - record updated to `follow_up`;
  - temporary user and record cleaned up.
- Found Vercel Preview env gap: required variables were configured only for Production.
- Added the same required variables to Vercel Preview.
- Redeployed Vercel Preview:
  - `https://careslink-8f3cr9107-millionlunas-projects.vercel.app`
- Ran preview real-session smoke:
  - Vercel protected preview cookie established;
  - Supabase auth cookie accepted by preview API;
  - outreach record created and redirected with `outreachStatus=saved`;
  - record updated and redirected with `outreachStatus=updated`;
  - Supabase readback returned `status = follow_up` and `next_follow_up_at = 2026-07-05`;
  - temporary user and record cleaned up.

## Verification

- `pnpm test` passed: 55 files, 339 tests.
- `pnpm exec tsc --noEmit` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- Vercel Preview build passed.
- Preview API real-session smoke passed.

## Product Boundary

No new AI endpoint, material type, marketplace, booking, lead resale, payment, clinical advice, legal advice, compliance advice, provider quality review, provider endorsement, or referral outcome workflow was added.

The outreach tracker remains an operational metadata tracker for provider follow-up, not a referral marketplace or source of service-quality claims.

## Core Sync

Core public site does not need to change for this pass.

Core can continue to position the public generator as the front-door profile generator. CaresLink AI now has a verified preview path for provider profile follow-through into referral pack and outreach metadata tracking.
