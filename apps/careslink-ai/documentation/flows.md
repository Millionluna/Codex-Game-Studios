# Security and Data Flows

## Anonymous draft generation

**Actor:** guest. **Precondition:** no participant identifiers are intentionally supplied. **Outcome:** one short-lived reviewable draft and opaque claim token.

1. The user enters structured facts or pastes Chinese working notes. Paste text remains in React memory.
2. Browser Privacy Review identifies matched ranges, creates a cleaned proposal, and requires each blocking or review finding to be resolved.
3. Minimum facts include support date/approximate time, support type, setting, support delivered, observable facts, and action taken.
4. The two privacy/processing-authority confirmations start unchecked. No generation request is constructed until all gates close.
5. The API repeats attestation and identifier/wording validation. **Deny:** `422` before session, quota, or OpenAI work.
6. Server abuse controls apply a per-minute rate limit and atomic daily device/IP quota. **Deny:** `429` without OpenAI.
7. Server calls OpenAI with strict structured output, `store: false`, bounded tokens, and no tools.
8. Output parsing rejects the whole response if it is malformed, contains an obvious identifier/prohibited conclusion, or fails bilingual numeric parity.
9. Server stores only the generated material in a 30-minute claim and emits metadata-only `companion_generated`.

## Privacy and server-bypass denial

**Actor:** guest or provider. **Outcome:** unsafe input never reaches OpenAI.

- Missing attestation returns `privacy_review_required`.
- Missing minimum facts or direct/indirect identifier and unsafe wording patterns return `input_review_required` with field-level issues.
- Browser detector results are not trusted by the server; a crafted request containing a name, phone, NDIS number, address, specific place, diagnostic wording, risk conclusion, goal conclusion, or worker-quality claim is rejected independently.

## Claim, login, and save

**Actor:** generated guest, then signed-in provider. **Precondition:** unexpired claim token. **Outcome:** one owner-bound saved draft.

1. The guest selects Save. Telemetry records only `companion_save_prompt_clicked`.
2. Login/register URLs carry attribution, `returnTo`, and the opaque claim token. They do not carry input or output content.
3. Supabase Auth establishes the server-readable session.
4. Save route requires a provider role. **Deny:** signed-out `401`; admin/non-provider `403`.
5. Service-role RPC binds the token hash only when unclaimed or already claimed by the same user. **Deny:** expired or cross-account claim returns `410`.
6. The server derives a deterministic draft ID from the token hash, rejects an existing record owned by another user, saves the generated material, then deletes the completed claim for that owner.
7. `companion_saved` records metadata only.

## Saved-document readback

**Actor:** signed-in provider. **Outcome:** only that account's saved drafts.

1. The server resolves the Supabase user with `auth.getUser()`.
2. `AI Documents` and the companion query `generated_material_drafts` with that user ID.
3. The service-role store applies `.eq("user_id", userId)` for lists. Direct ID updates and save idempotency also compare `record.userId` in server code.
4. **Deny:** no session displays the login gate; an admin receives the admin workspace; a different provider cannot claim or save another user's token.

## Telemetry and administration

**Actors:** guest/provider events; admin reporting. **Outcome:** operational metrics without participant facts.

- Client event endpoint allowlists `companion_viewed`, `companion_started`, and `companion_save_prompt_clicked` and accepts only the event name.
- Generation/save events are server-created.
- Attribution values are allowlisted and length-bounded. Visitor/device/IP values are one-way hashes.
- Companion telemetry has no input, output, participant-fact, email, or contact columns.
- Current admin material usage loads generated-draft metadata without `content` and excludes `ndis_case_note` details.
