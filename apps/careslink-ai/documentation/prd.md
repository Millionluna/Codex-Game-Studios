# NDIS Case Note AI Companion Product Decision

**Decision date:** 3 August 2026
**Status:** Release-candidate requirement
**Supersedes:** guest-first generation followed by optional login to save

## User outcome

A registered provider can safely turn de-identified structured facts or reviewed Chinese working notes into bilingual, reviewable case-note wording, then copy or save it to their own account.

## Access decision

- The public CaresLink Core landing may be browsed without an account.
- The AI Companion form, browser Privacy Review, generation, result, saved history, and Save action require a verified Supabase provider session.
- Signed-out Companion GET requests enter the existing email/password auth flow with an allowlisted internal return URL.
- Signed-out generation, telemetry, and save POST requests return `401` before body parsing or paid/stateful work.
- Admin accounts cannot use the provider Companion or view case-note content.
- Provider generation does not require an access code. Account and IP quotas still apply.

## Privacy and content boundary

- No pasted or structured case-note content belongs in URLs, local storage, analytics, logs, or admin reporting.
- Original pasted Chinese notes and matched ranges exist only in current React memory.
- Browser Privacy Review and two unchecked confirmations must close before request construction.
- The server independently validates the session, minimum facts, privacy confirmations, identifiers, and unsafe wording.
- Output remains user-reviewed draft wording for general documentation and operational support only. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice.

## Save and ownership

- Successful generation creates a 30-minute opaque claim already bound to the current provider.
- The Save endpoint accepts only the same provider and persists `generated_material_drafts.feature = ndis_case_note`.
- Saved reads remain owner-scoped. Admin surfaces remain metadata-only and exclude case-note content.
- The owning provider can permanently delete a saved case-note draft after an explicit confirmation. Signed-out, admin, cross-owner and wrong-feature deletion are denied without disclosing another record's existence.
- Saved drafts remain in the account until the owner deletes them. CaresLink AI is not a formal case-management or statutory record-retention system; no automatic retention period is promised in this release.
- Owner-only authenticated `SELECT`/`DELETE` RLS is shipped as a migration. Server generation and status mutation retain service-role control; end users receive no direct `INSERT`/`UPDATE` grant.
- Legacy claim storage can remain for compatibility, but this entry point creates no anonymous claim and performs no post-generation login handoff.

## Acceptance criteria

1. Signed-out GET renders no usable form and redirects to login with only allowlisted attribution.
2. Provider login returns to the same Companion route, ready for input.
3. Signed-out POST returns `401` with zero body parsing, quota, claim, telemetry, or OpenAI calls.
4. Signed-in provider PII blocking, Privacy Review, structured generation, account/IP quota, copy, owner-only save, and history continue to work.
5. Admin is denied provider content and generation.
6. English and Simplified Chinese UI remain responsive at 1440px and 390px.
7. A provider can confirm and delete their own saved NDIS case-note draft; another account, an admin, an invalid ID and a wrong document feature cannot delete it and receive no existence signal.
8. Retention copy states that saved drafts remain until user deletion and directs required records to an authorised record system.
