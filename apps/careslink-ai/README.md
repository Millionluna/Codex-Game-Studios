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

`/auth/login` and `/auth/register` now use Supabase email/password auth through
`@supabase/ssr` server-side cookie sessions. Workspace pages resolve the current
account from the verified Supabase cookie session first, then fall back to local
demo query-param accounts for preview/development.

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
provider draft, feature, and review status. It is not exposed to public clients.

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
