# Variables and Secrets

No secret values belong in this document, source control, browser bundles, URLs, analytics, or screenshots.

## Required for the RC companion

| Name | Used by | Scope/source | Rotation and risk |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Auth and server stores | Public URL / Vercel environment | Not secret; verify project target before release |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or publishable equivalent | Supabase Auth | Public, intentionally browser-safe | Rotate through Supabase if compromised or retired |
| `SUPABASE_SERVICE_ROLE_KEY` | Claims, quota, events, saved drafts | Server secret / Vercel encrypted env | High impact; rotate immediately on exposure; never prefix `NEXT_PUBLIC_` |
| `OPENAI_API_KEY` | Case-note generation | Server secret / Vercel encrypted env | Billing and data-path risk; rotate on exposure |
| `NDIS_CASE_NOTE_FINGERPRINT_PEPPER` | Device/IP/user hash derivation | Server secret / Vercel encrypted env | Rotation resets pseudonymous quota identity; do not reuse as an API key |

## Companion options

| Name | Default/role | Risk |
| --- | --- | --- |
| `OPENAI_NDIS_CASE_NOTE_MODEL` | Falls back to `OPENAI_MODEL`, then `gpt-5.4-mini` | Model changes can alter quality/cost; rerun guarded live smoke |
| `NDIS_CASE_NOTE_AUTH_DAILY_LIMIT` | `3` | Authenticated cost cap |
| `NDIS_CASE_NOTE_AUTH_IP_DAILY_LIMIT` | `20` | Shared-network and abuse cap |
| `GUIDED_AI_RATE_LIMIT_PER_MINUTE` | Shared per-minute limiter | Raising increases burst exposure |
| `SUPABASE_NDIS_CASE_NOTE_CLAIMS_TABLE` | `ndis_case_note_companion_claims` | Wrong name causes fail-closed storage errors |
| `SUPABASE_TEMPLATE_COMPANION_EVENTS_TABLE` | `template_companion_events` | Wrong name disables telemetry |
| `SUPABASE_GENERATED_MATERIAL_DRAFTS_TABLE` | `generated_material_drafts` | Wrong name disables save/history |
| `CARESLINK_ALLOW_COMPANION_MEMORY_STORE` | Not enabled in production | Setting `true` in production makes claims/quota non-durable and is not RC-approved |

## URL and auth configuration

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CARESLINK_AI_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `APP_URL`, and `VERCEL_PROJECT_PRODUCTION_URL` may be used to construct safe internal redirects or public links. Demo flags must remain false for real preview/provider sessions.

Legacy anonymous quota columns/scopes remain in the migration for compatibility, but the current Companion entry point does not read anonymous-limit variables or consume anonymous quota.

## Client-bundle rule

Only `NEXT_PUBLIC_*` values may be bundled. They must contain public URLs, publishable Supabase keys, or non-sensitive feature settings. `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `NDIS_CASE_NOTE_FINGERPRINT_PEPPER` are server-only.

## Preview checklist

- Confirm required names exist in the Vercel Preview environment without printing values.
- Confirm demo auth and companion memory fallback are not enabled.
- Confirm the Supabase project has the companion migration.
- Run PII denial before any live generation.
- Confirm unauthenticated GET enters login and unauthenticated POST returns `401` before quota/OpenAI.
- Run one authenticated synthetic generation, PII denial, account/IP quota denial, owner-bound claim/save, cross-account denial, metadata-only checks, then delete temporary accounts/data.
