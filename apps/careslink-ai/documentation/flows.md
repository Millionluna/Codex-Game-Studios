# Security and Data Flows

## Authentication and safe return

**Actor:** signed-out visitor. **Outcome:** no Companion form or case-note content is rendered.

1. The server resolves the Supabase session before rendering `/template-companion/ndis-case-note`.
2. Without a session it redirects to `/auth/login` with a validated internal `next`/`returnTo` containing only allowlisted locale, source, resource, and UTM values. No case-note text is accepted in that URL.
3. A provider login returns to the same Companion route ready for input. Admin roles fall back to the admin workspace.
4. A direct unauthenticated generation POST returns `401` before JSON parsing, quota, claim creation, telemetry, or OpenAI.

### Google OAuth

1. Login/Register shows Google only when the server-only release gate is exactly
   `true`; absent or unverified configuration fails closed and leaves
   email/password available.
2. The server action normalizes locale and reduces `next` to an allowlisted
   provider route before calling `signInWithOAuth({ provider: "google" })`.
3. Supabase returns through `/auth/callback` with a short-lived PKCE code. The
   route exchanges it, reads the verified user, and strips the code from the
   final URL.
4. A trusted `app_metadata` admin may enter an admin destination. A new Google
   user or user-editable admin claim remains a provider and cannot enter admin.
5. Cancellation or provider/config errors return a generic page message without
   forwarding provider details or tokens.

## Authenticated draft generation

**Actor:** signed-in provider. **Precondition:** no participant identifiers are intentionally supplied. **Outcome:** one short-lived, owner-bound reviewable draft.

1. The provider enters structured facts or pastes Chinese working notes. Paste text remains in React memory.
2. Browser Privacy Review identifies matched ranges, creates a cleaned proposal, and requires each blocking or review finding to be resolved.
3. Minimum facts include support date/approximate time, support type, setting, support delivered, observable facts, and action taken.
4. The two privacy/processing-authority confirmations start unchecked. No generation request is constructed until all gates close.
5. The API verifies the provider session, then repeats attestation and identifier/wording validation. **Deny:** signed-out `401`; admin `403`; unsafe input `422`, all before quota or OpenAI.
6. Server abuse controls apply a per-minute account rate limit and atomic daily account/IP quota. **Deny:** `429` without OpenAI.
7. Server calls OpenAI with strict structured output, `store: false`, bounded tokens, and no tools.
8. Output parsing rejects the whole response if it is malformed, contains an obvious identifier/prohibited conclusion, or fails bilingual numeric parity.
9. Server stores only the generated material in a 30-minute claim immediately bound to the current provider and emits metadata-only `companion_generated`.

## Privacy and server-bypass denial

**Actor:** signed-in provider. **Outcome:** unsafe input never reaches OpenAI.

- Missing attestation returns `privacy_review_required`.
- Missing minimum facts or direct/indirect identifier and unsafe wording patterns return `input_review_required` with field-level issues.
- Browser detector results are not trusted by the server; a crafted request containing a name, phone, NDIS number, address, specific place, diagnostic wording, risk conclusion, goal conclusion, or worker-quality claim is rejected independently.

## Owner-bound claim and save

**Actor:** signed-in provider. **Precondition:** unexpired claim token already bound to that provider. **Outcome:** one owner-bound saved draft.

1. The provider selects Save; there is no post-generation login handoff.
2. Save route verifies provider session before parsing the token. **Deny:** signed-out `401`; admin/non-provider `403`.
3. Service-role RPC accepts only an unexpired claim owned by the same user. **Deny:** expired or cross-account claim returns `410`.
4. The server derives a deterministic draft ID from the token hash, rejects an existing record owned by another user, saves the generated material, then deletes the completed claim for that owner.
5. `companion_saved` records metadata only.

## Saved-document readback

**Actor:** signed-in provider. **Outcome:** only that account's saved drafts.

1. The server resolves the Supabase user with `auth.getUser()`.
2. `AI Documents` and the companion query `generated_material_drafts` with that user ID.
3. The service-role store applies `.eq("user_id", userId)` for lists. Direct ID updates and save idempotency also compare `record.userId` in server code.
4. **Deny:** no session enters auth; an admin receives the admin workspace; a different provider cannot read or save another user's token.

## Telemetry and administration

**Actors:** provider events; admin reporting. **Outcome:** operational metrics without participant facts.

- Client event endpoint allowlists `companion_viewed` and `companion_started` and accepts only the event name. Historical save-prompt events are not emitted by the current provider-only flow.
- Generation/save events are server-created.
- Attribution values are allowlisted and length-bounded. Visitor/device/IP values are one-way hashes.
- Companion telemetry has no input, output, participant-fact, email, or contact columns.
- Current admin material usage loads generated-draft metadata without `content` and excludes `ndis_case_note` details.
