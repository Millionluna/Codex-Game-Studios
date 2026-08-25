This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Release architecture, permission, variable, flow, test, automation, and public
SEO maps live in [`documentation/`](./documentation/architecture.md).

## Supabase Provider Draft Store

Provider profile drafts use an in-memory store by default. To persist drafts in
Supabase, create the `provider_drafts` table from
`supabase/migrations/20260625125102_create_provider_drafts.sql`, then set:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` through `NEXT_PUBLIC_*` variables.
The publishable/anon key is used by server-side auth verification for bearer
tokens. Draft persistence still uses the server-only service role key.

## Supabase Auth Session Cookies

`/auth/login` and `/auth/register` use Supabase email/password auth through
`@supabase/ssr` server-side cookie sessions. They also show **Continue with
Google** when `CARESLINK_GOOGLE_OAUTH_ENABLED=true`, which must be set only after
the project's Google provider and redirect allowlist are verified. The Google flow uses PKCE, exchanges the one-time
code at `/auth/callback`, and then permits only the existing internal provider or
admin destinations. OAuth tokens are not placed in application URLs, analytics,
logs, or application tables.

Google client credentials remain in Google Cloud and Supabase Auth. Do not add a
Google client secret to this repository or Vercel application variables. The
Supabase redirect allowlist must include the production callback and any exact or
wildcard Preview callback pattern that is intentionally used.

Workspace pages resolve the current account from the verified Supabase cookie
session first, then fall back to local demo query-param accounts for
preview/development.

Provider/admin role for real users is read only from Supabase
`app_metadata.careslink_role` or `app_metadata.role`. User-editable metadata is
not used for authorization.

When a real Supabase user opens a provider generator handoff URL such as:

```text
/referral-workspace/profile?source=provider-profile-generator&draftId=<draft-id>
```

the workspace can resolve the draft and auto-claim it for that user's Supabase
UUID owner id. Demo account ids are not auto-claimed, so they cannot be written
into the `owner_user_id uuid` column in persistent Supabase storage.

## Portal Referral Preview runtime

The Portal Referral slices are separate, default-off, Preview-only cookie
workflows. They require the master and durable-adapter gates, one exact
operation gate, `VERCEL_ENV=preview`, and a reviewed non-Production Supabase ref.
The request routes reject caller Bearer authorization, use no `service_role`,
and never fall back to memory or demo data after a durable page gate opens.

Provider Response M1b exposes only the signed-in approved provider's frozen
region/service offer metadata and accepts only `ACCEPT` or `DECLINE`. It is
independently gated from Intake, Source Detail and Assignment. `ACCEPT` binds the
database-derived provider atomically; `DECLINE` returns the referral to triage.
The slice does not expose summary/contact, enable follow-up or audit listing, or
authorize a deployment or Production activation.

## Supabase Access Control Store

Access requests, access codes, and future AI usage audit events use an
in-memory store by default. To persist them in Supabase, apply:

```text
supabase/migrations/20260626122012_create_access_control_tables.sql
```

This creates:

```text
public.access_requests
public.access_codes
public.ai_usage_events
public.generated_material_drafts
```

The three access-control tables have RLS enabled, no direct `anon` or
`authenticated` table access, and server-only `service_role` read/write grants.
The workspace reads
the verified Supabase cookie session first, then derives access state from
`access_codes` and same-day `ai_usage_events`. `/referral-workspace/access`
can save a real queued access request for signed-in provider accounts. The
admin access queue reads stored requests, while demo admin accounts still fall
back to seeded preview requests when no stored requests exist.

Verified Supabase admin sessions can approve or decline stored access requests
from `/admin/access-requests`. Approving a request marks it approved and issues
an active access code tied to the provider user. Declining a request updates the
request status without issuing a code. Demo admin accounts still see disabled
preview controls only.

Guided AI routes should call the access-control guard before any model request:

```text
getGuidedAiAccessDecision()
recordGuidedAiUsageIfAllowed()
```

These helpers enforce active access-code state and daily quota using
`access_codes` plus same-day `ai_usage_events`. They do not call OpenAI.

Generated material drafts are persisted separately from usage events. Apply:

```text
supabase/migrations/20260626032304_create_generated_material_drafts.sql
```

This creates `public.generated_material_drafts` with RLS enabled and
server-only `service_role` grants. It stores draft JSON output by user,
provider draft, feature, and review status.

Before releasing owner draft deletion, also apply:

```text
supabase/migrations/20260804143000_add_generated_material_owner_read_delete_policies.sql
```

That migration revokes broad end-user grants, then gives `authenticated` users
owner-scoped `SELECT` and `DELETE` only. It deliberately does not grant `INSERT`
or `UPDATE`; generation and status changes remain controlled by server safety
flows. The current server store still uses the service role and therefore
bypasses RLS, so its owner-facing delete is additionally constrained in one
database statement by draft ID, user ID and document feature. Adding the
migration file to the repository does not apply it to a Supabase project.

Generated material reuse events are stored in a metadata-only table. Apply:

```text
supabase/migrations/20260626090100_create_generated_material_events.sql
```

This creates `public.generated_material_events` with RLS enabled and
server-only `service_role` grants. It records copy/review/archive metadata by
user, provider draft, generated material draft, feature, event type, optional
field key, and timestamp. It does not store generated content JSON.

## Guided AI Material Endpoints

The first four server-only OpenAI endpoints are:

```text
POST /api/guided-materials/share-card
POST /api/guided-materials/referral-message
POST /api/guided-materials/bilingual-intro
POST /api/guided-materials/handover-checklist
```

They are intentionally not part of the public/free generator flow. Each route
requires, in order:

```text
verified Supabase cookie session
provider account role
server-side in-memory rate limit
active access code and remaining daily quota
claimed provider draft owned by the signed-in provider
server-only OPENAI_API_KEY
```

After a successful model call the route records an `ai_usage_events` event
through `recordGuidedAiUsageIfAllowed()`, saves the generated JSON to
`generated_material_drafts`, and returns the `generatedMaterialDraftId`. The
response returns draft material for user review only and keeps the product
boundary as general business profile / operational support only.

Server-only environment variables:

```bash
OPENAI_API_KEY=your-server-only-openai-key
OPENAI_SHARE_CARD_MODEL=gpt-5.4-mini
OPENAI_REFERRAL_MESSAGE_MODEL=gpt-5.4-mini
OPENAI_BILINGUAL_INTRO_MODEL=gpt-5.4-mini
OPENAI_HANDOVER_CHECKLIST_MODEL=gpt-5.4-mini
GUIDED_AI_RATE_LIMIT_PER_MINUTE=6
```

The material-specific model variables are optional. If absent, the routes fall
back to `OPENAI_MODEL`, then `gpt-5.4-mini`. Do not expose any OpenAI key
through `NEXT_PUBLIC_*` variables.

Optional table override:

```bash
SUPABASE_GENERATED_MATERIAL_DRAFTS_TABLE=generated_material_drafts
SUPABASE_GENERATED_MATERIAL_EVENTS_TABLE=generated_material_events
```

`/referral-workspace/materials` includes guided share-card, referral-message,
bilingual-intro, and handover-checklist generator panels for access-enabled
providers. Free and waitlist users continue to see locked previews only. Demo
`user-approved` access can preview the controls, but the buttons are disabled
unless the account is a verified Supabase provider session with a claimed
provider draft, so demo query params cannot spend OpenAI quota.
The page also reads the latest saved `share_card` draft for the signed-in
account and shows it as a reviewable saved draft after refresh. It also lists
recent saved guided drafts across `share_card`, `referral_message`,
`bilingual_intro`, and `handover_checklist` so providers can revisit generated
material without another model call. Saved draft history cards expand the key
generated fields and include browser clipboard copy controls for the whole draft
or individual fields; these copy actions do not call OpenAI or consume quota.
When the browser has a verified Supabase provider session and the draft belongs
to that provider, copy actions post metadata only to
`POST /api/generated-material-events` and are persisted in
`generated_material_events`. Demo query-param accounts remain read-only for real
event writes because the API requires the verified Supabase session. Verified
Supabase provider sessions can mark generated drafts as reviewed or archived
from the history list; those status actions also record metadata-only material
events.

`/admin/material-usage` gives admin users a pilot usage review view for saved
generated material metadata: user ID, provider draft ID, feature, status,
timestamps, and copy/review/archive event counts. It intentionally does not
render generated content JSON, so admins can review usage patterns without
turning draft material into endorsement, quality review, or referral outcome
evidence.

## NDIS Case Note AI Companion

The provider-authenticated, single-task companion route is:

```text
GET /template-companion/ndis-case-note
POST /api/template-companion/ndis-case-note
POST /api/template-companion/ndis-case-note/save
POST /api/template-companion/events
```

Core should use one of these two production handoff contracts. The pair must be
exact; unknown or mismatched `surface` / `utm_medium` values are discarded:

```text
# Product landing
https://ai.careslink.com.au/template-companion/ndis-case-note
  ?source=ndis-case-note-download
  &resourceSlug=ndis-case-note-template
  &utm_source=careslink
  &utm_medium=product_landing
  &utm_campaign=ndis_case_note_ai_companion_v01
  &surface=core_product_landing

# Successful template download
https://ai.careslink.com.au/template-companion/ndis-case-note
  ?source=ndis-case-note-download
  &resourceSlug=ndis-case-note-template
  &utm_source=careslink
  &utm_medium=post_download
  &utm_campaign=ndis_case_note_ai_companion_v01
  &surface=core_download_success
```

Only non-personal attribution values belong in the URL. Email, participant
details, support facts and generated wording must never be added to query
parameters. The form supports structured facts (default) and pasted Chinese
working notes. Original pasted text stays in React memory only: it is not added
to local storage, URLs, analytics, logs or admin views. A testable browser-side
Privacy Review identifies obvious direct and indirect identity clues plus
subjective, clinical, risk, goal-achievement and worker/provider-quality
wording, then shows suggested removals, replacements or generalisations and an
editable structured-facts proposal. The review displays the original
session-only text with matched ranges highlighted beside the cleaned text and
extracted facts. Every finding must be handled before generation. This review
is deliberately incomplete and does not claim automatic de-identification.

Support date/approximate time, support type, setting, support delivered,
observable facts, and action taken are minimum required facts. No generation
request is built until these facts are present, the user completes Privacy Review and
selects two unchecked confirmations: that they reviewed the facts and did not
intentionally include identifying information, and that they are authorised to
process the details for this documentation purpose. The second confirmation is
explicitly not a statement of participant consent. The server independently
requires both confirmations and revalidates every structured field before
quota or OpenAI work. A verified provider session is required before the server
parses the generation body. It fails closed on obvious email, Australian
phone, NDIS-number, date-of-birth, name/title, exact-address, indirect identity
and unsafe evaluative wording patterns.

As of 3 August 2026, the Companion is provider-login-first. An unauthenticated
GET redirects into the existing login flow with a validated internal `next`
URL containing only allowlisted locale/source/resource/UTM values. An
unauthenticated generation POST returns `401` before JSON parsing, rate limit,
quota, claim creation, telemetry, or OpenAI. Signed-in providers do not need an
access code and use account plus IP quotas. Any request that reaches OpenAI
consumes the attempt even if the model response is rejected by the safety
parser, preventing repeated paid retries. A free provider entitlement supplies
3 credits per UTC calendar month. The server requires an idempotency key and
atomically reserves 1 credit after input/privacy validation and before OpenAI.
Only a new, complete result whose owner-bound claim is persisted commits that
credit. Rate-limit, quota, generation, safety, claim-persistence, and system
failures release it; the separate account/IP abuse quota remains consumed once
OpenAI has been reached. Same-key retries return the same claim or a stable
in-progress/completed state without another model call or charge. Production
fails closed if persistent
Supabase storage or the dedicated fingerprint pepper is missing. The model uses
strict structured output with these fields:

```text
englishCaseNoteDraft
chineseReviewVersion
missingFacts
neutralWordingChecks
followUpPrompts
disclaimer
```

Successful authenticated generation creates an opaque claim token that can be
recovered or saved for 30 minutes and immediately binds its hash to the current
provider user ID. The temporary record
contains generated output, not raw input. It exists only to support the explicit
Save action and legacy claim compatibility; this entry point does not create an
anonymous claim or place a claim in the login URL. The save endpoint persists an
owner-scoped `generated_material_drafts.feature = ndis_case_note` record. Owner
binding is never reversed. The temporary claim is deleted after a successful
save. Expiry blocks claiming/saving immediately; the expired row is physically
removed opportunistically before a later generation/save rather than by an
exact 30-minute scheduler.
The provider can permanently delete that saved draft from the product UI.
Saved drafts otherwise remain in the account until the provider deletes them.
CaresLink AI is not a formal case-management or statutory record-retention
system; records an organisation must retain belong in its authorised record
system.

The Responses request sets `store: false`. Standard API abuse-monitoring
retention can still apply unless the OpenAI project has separately approved
Zero Data Retention controls.

Bilingual numeric-fact comparison canonicalises English month names, Chinese
date markers, context-qualified Australian/ISO numeric dates, and audited
English/Chinese time forms. Slash or ISO-shaped ratios/codes without date
semantics remain exact. Chinese period-hour ranges are explicit: noon accepts
only 12:xx, pre-dawn accepts 12/1-5, and evening accepts 6-11 with evening 12
mapped to 00. Invalid combinations become non-equivalent sentinels instead of
falling through to a generic time matcher. A genuine date,
time, code, ratio, or quantity mismatch rejects the complete output.

Companion telemetry is metadata-only. The event names are:

```text
companion_viewed
companion_started
companion_generated
companion_saved
companion_copied
companion_credit_exhausted
companion_offer_viewed
companion_offer_requested
```

Historical rows may contain `companion_save_prompt_clicked` from the superseded
guest-first flow; the current provider-only UI and client event endpoint do not
emit it.

`template_companion_events` has no input, output or participant-fact columns.
Unauthenticated Companion telemetry is rejected. Existing saved-draft copy
events remain metadata-only and copying never consumes model quota.
NDIS case-note drafts and copy events are excluded from the existing raw
material-usage admin view; only the owning provider can read saved content.
The optional `surface` event dimension is allowlisted and contains only
`core_product_landing` or `core_download_success`; it cannot contain arbitrary
campaign or user text.

Apply the migration before enabling the Core CTA:

```text
supabase/migrations/20260723113000_create_ndis_case_note_companion.sql
supabase/migrations/20260804190000_create_account_credit_entitlements.sql
supabase/migrations/20260804193000_tighten_account_credit_table_privileges.sql
supabase/migrations/20260804194500_fix_new_entitlement_effective_time.sql
supabase/migrations/20260804203500_add_companion_pilot_attribution_events.sql
supabase/migrations/20260804223000_create_ndis_case_note_pilot_cohort.sql
```

`/plan-and-usage` reads the current owner's server-side entitlement and
metadata-only ledger. Privacy review, editing, viewing, saving, copying, and
downloading use 0 credits. Credits do not roll over, and this release has no
payment or credit-purchase flow. At zero credits, an authenticated provider may
opt in to a concept test for `Starter A$9.99/month for 30 generation credits`. The action
collects no free text or new contact details, records metadata only, does not
charge the account, and does not add credits. Pilot operations and aggregate
queries are documented in `documentation/pilot-funnel-runbook.md` and
`documentation/pilot-funnel.sql`. The report includes only accounts in the
service-role-managed `pilot_cohort_members` UUID allowlist during each
membership's effective interval; non-invited providers never enter pilot rates.

The server-side Sign out action is available from desktop and mobile account
surfaces. It clears the Supabase session and returns only through an allowlisted
internal path; signed-out access immediately restores the provider gate. If the
auth client or remote sign-out is unavailable, matching local Supabase auth
cookies are cleared and the page shows an error rather than a false success. The
AI-specific Privacy, Collection & Retention Notice is available at `/privacy`
from authentication, Companion, Saved Documents, the shared shell, and the
public AI landing page.

Server-only environment variables:

```bash
OPENAI_API_KEY=your-server-only-openai-key
OPENAI_NDIS_CASE_NOTE_MODEL=gpt-5.4-mini
NDIS_CASE_NOTE_FINGERPRINT_PEPPER=a-long-random-server-secret
NDIS_CASE_NOTE_AUTH_DAILY_LIMIT=3
NDIS_CASE_NOTE_AUTH_IP_DAILY_LIMIT=20
```

Optional table overrides:

```bash
SUPABASE_NDIS_CASE_NOTE_CLAIMS_TABLE=ndis_case_note_companion_claims
SUPABASE_TEMPLATE_COMPANION_EVENTS_TABLE=template_companion_events
```

The strict structured output contains an English case-note draft, a fact-matched
Simplified Chinese review version, missing facts, neutral-wording checks,
follow-up prompts and a controlled disclaimer. The Chinese version is labelled
as a review aid only, not a second formal record. Output parsing rejects obvious
identifiers, prohibited conclusions and mismatched numeric facts across the two
languages. The result remains user-reviewed draft wording for general
documentation support only. It is not a completed record and does not provide
clinical, legal, care, compliance, regulatory or professional advice.

## Provider Draft Handoff Smoke Test

Use this manual smoke test to confirm a provider profile generator draft can be
handed off through localStorage, persisted, and resolved across referral
workspace pages.

1. Start the app with the Supabase draft-store environment variables:

   ```powershell
   $env:SUPABASE_URL="https://adocsnwnslxhxcjgbyee.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="..."
   pnpm dev
   ```

   Keep the real `SUPABASE_SERVICE_ROLE_KEY` server-only and do not commit it.

2. Open:

   `http://127.0.0.1:3000/referral-workspace/profile?source=provider-profile-generator&draftId=manual-smoke&account=user-free`

3. In DevTools Console, create the localStorage handoff record:

   ```js
   localStorage.setItem(
     "careslink-ai-provider-draft:manual-smoke",
     JSON.stringify({
       version: 1,
       source: "provider-profile-generator",
       draftId: "manual-smoke",
       payload: {
         version: 1,
         id: "manual-smoke",
         businessName: "Manual Smoke Provider",
         shortDescription: "Provider-submitted public profile draft.",
       },
       savedAt: new Date().toISOString(),
     }),
   );
   ```

4. Reload the profile page. It should resolve and display
   `Manual Smoke Provider`.

5. Open the remaining referral workspace URLs with the same
   `source=provider-profile-generator`, `draftId=manual-smoke`, and
   `account=user-free` query parameters, then confirm the same draft resolves:

   - `http://127.0.0.1:3000/referral-workspace/health?source=provider-profile-generator&draftId=manual-smoke&account=user-free`
   - `http://127.0.0.1:3000/referral-workspace/materials?source=provider-profile-generator&draftId=manual-smoke&account=user-free`
   - `http://127.0.0.1:3000/referral-workspace/access?source=provider-profile-generator&draftId=manual-smoke&account=user-free`

## Provider Draft Claim Smoke Test

After the handoff draft exists, use the claim endpoint to bind it to a provider
account.

For local preview without Supabase Auth, enable demo auth and pass a demo
`accountId`:

```powershell
$env:CARESLINK_ENABLE_DEMO_AUTH="true"
$body = @{
  draftId = "manual-smoke"
  accountId = "user-free"
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3000/api/provider-drafts/claim" `
  -Method Post `
  -Body $body `
  -ContentType "application/json"
```

Expected response:

```json
{
  "ok": true,
  "draftId": "manual-smoke",
  "ownerUserId": "user-free",
  "status": "claimed"
}
```

Then open the profile page without `draftId`:

```text
http://127.0.0.1:3000/referral-workspace/profile?account=user-free
```

The page should still resolve `Manual Smoke Provider` from the claimed draft.

For real Supabase Auth, do not send `accountId`. Send the user's verified
Supabase access token in the `Authorization` header:

```powershell
$body = @{
  draftId = "manual-smoke"
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3000/api/provider-drafts/claim" `
  -Method Post `
  -Headers @{ Authorization = "Bearer <supabase-access-token>" } `
  -Body $body `
  -ContentType "application/json"
```

The claim API uses `auth.getUser()` to verify the bearer token. Provider/admin
role is read only from Supabase `app_metadata` (`careslink_role` or `role`),
not from user-editable metadata. Demo account claiming is disabled when the
persistent Supabase draft store is active.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

The interface uses the same CaresLink brand serif stack as the wordmark across
English, Simplified Chinese, forms, tables, document surfaces, and code-like
metadata. No runtime web-font request is required.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
