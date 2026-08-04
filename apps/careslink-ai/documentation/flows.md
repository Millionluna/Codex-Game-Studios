# Security and Data Flows

## Authentication and safe return

**Actor:** signed-out visitor. **Outcome:** no Companion form or case-note content is rendered.

1. The server resolves the Supabase session before rendering `/template-companion/ndis-case-note`.
2. Without a session it redirects to `/auth/login` with a validated internal `next`/`returnTo` containing only allowlisted locale, source, resource, and UTM values. No case-note text is accepted in that URL.
3. A provider login returns to the same Companion route ready for input. Admin roles fall back to the admin workspace.
4. A direct unauthenticated generation POST returns `401` before JSON parsing, quota, claim creation, telemetry, or OpenAI.
5. Sign out runs as a server action. It invalidates the Supabase session, clears matching local Supabase auth cookies, retains only an allowlisted provider/admin return route, and sends the user to login. Missing auth configuration, remote failure or cookie-cleanup failure returns an error rather than a signed-out success notice. The next protected GET re-enters the auth gate.

### Google OAuth

1. Login/Register shows Google only when the server-only release gate is exactly
   `true` and the Supabase settings endpoint confirms Google is enabled; absent,
   disabled or unavailable configuration fails closed and leaves
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
6. The server validates a required idempotency key and atomically reserves 1 monthly account credit. Existing completed keys recover the same owner-bound claim; concurrent keys return a stable in-progress state without another model call.
7. Server abuse controls apply a per-minute account rate limit and atomic daily account/IP quota. **Deny:** `429` without OpenAI; the reserved account credit is released.
8. Server calls OpenAI with strict structured output, `store: false`, bounded tokens, and no tools.
9. Output parsing rejects the whole response if it is malformed, contains an obvious identifier/prohibited conclusion, or fails bilingual numeric parity. Month names and explicit Chinese date markers are date facts; numeric slash/ISO-shaped values are canonicalized only beside explicit date semantics. Non-date codes and ratios remain exact. Chinese period-hour ranges are explicit; invalid combinations such as `中午10:30` or `晚上1:30` are consumed as non-equivalent sentinels, while `晚上12:05` maps only to `00:05`.
10. Server stores only the generated material in an account-bound claim that can be recovered or saved for 30 minutes. Expired claims are unusable and are removed opportunistically by a later generation/save cleanup, not by an exact 30-minute scheduler. Only after claim persistence does the credit commit and metadata-only `companion_generated` emit. Generation or claim failure releases the credit without restoring abuse quota already consumed after OpenAI.

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

## Owner-controlled saved-draft deletion

**Actor:** signed-in provider. **Outcome:** the provider can permanently remove
their own saved NDIS case-note draft without exposing whether another account's
record exists.

1. The UI requires a deliberate second confirmation before issuing `DELETE`.
2. The route verifies the provider session before using the draft ID. **Deny:**
   signed-out `401`; admin/non-provider `403`.
3. The request includes an explicit delete-intent header and a strictly formed
   NDIS case-note draft ID.
4. The service-role store performs one database delete constrained by `id`,
   `user_id` and `feature = ndis_case_note`. Missing, cross-owner and wrong-
   feature records all return the same `404` response.
5. Owner `SELECT`/`DELETE` RLS is defence in depth for future authenticated
   session-client access. The current route's service role bypasses RLS and
   therefore cannot replace its explicit owner predicate.
6. The deleted draft disappears from saved history. Companion telemetry remains
   metadata-only and contains no draft text.

Saved drafts otherwise remain until the provider deletes them. CaresLink AI is
not a formal case-management or statutory record-retention system.

## Telemetry and administration

**Actors:** provider events; admin reporting. **Outcome:** operational metrics without participant facts.

- Client event endpoint allowlists `companion_viewed`, `companion_started`, `companion_copied`, `companion_offer_viewed` and `companion_offer_requested`; its JSON body accepts only the event name. The fake door has no free-text or contact field.
- Generation, credit-exhaustion and save events are server-created.
- Attribution is reduced to fixed source/resource/campaign values and two exact surface/medium pairs. Unknown or mismatched values are dropped. Visitor/device/IP values are one-way hashes.
- Companion telemetry has no input, output, participant-fact, email, or contact columns.
- Current admin material usage loads generated-draft metadata without `content` and excludes `ndis_case_note` details.
- `/plan-and-usage` loads only the current provider's entitlement and ledger metadata. It never renders reservation/idempotency references or case-note content.

## Zero-credit pilot offer

1. When remaining credits reaches zero, the provider sees the concept price of Starter A$9.99/month for 30 generation credits.
2. Viewing and requesting the offer create metadata-only events against the existing authenticated account. The UI collects no free text, email, phone or other contact data.
3. Requesting does not charge, create a subscription, add credits or bypass the normal reset. Stripe is not connected in this release.
