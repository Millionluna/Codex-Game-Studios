# Permissions

## Roles and scope derivation

| Actor | Derived from | Notes |
| --- | --- | --- |
| Guest | Absence of a verified Supabase session | May view the separate public Core landing; Companion GET enters auth and API calls are denied |
| Provider | Verified Supabase user plus server-created workspace account role | May save and read only their own documents |
| Admin | Verified Supabase user with admin role metadata | May access aggregate/metadata admin pages; cannot use provider save flow |
| Service role | Server-only Supabase key | Bypasses RLS; never sent to the browser |

Email/password and Google identities share this role model. OAuth profile fields
are user metadata and cannot grant admin. Only trusted Supabase `app_metadata`
can identify an existing admin; all other authenticated identities default to
provider.

## Resource matrix

| Resource and operation | Guest | Provider | Admin | Enforcement |
| --- | --- | --- | --- | --- |
| View Companion form/privacy/result | Deny; redirect to login | Allow | Deny; redirect to admin workspace | Server page session and role gate |
| Generate a draft | Deny `401` before body parsing | Allow within account/IP limits | Deny `403` | Session-first API role check, rate limit, quota RPC |
| Read temporary claim | Deny | Same owner only | Deny | Server page session gate and claim owner check |
| Bind and save claim | Deny | Allow for own account | Deny | Verified session, provider role, claim RPC owner condition |
| List saved drafts | Deny | Own `user_id` only | No provider-content view | Server query filtered by account ID |
| Change saved status | Deny | Own record only | Not exposed for case notes | Server record-owner comparison |
| Write companion telemetry | Deny | Allowlisted metadata events | Deny | Session-first event route, server constructors and schema |
| View admin material usage | Deny | Deny | Allow | Admin route gate; metadata selectors; case-note exclusion |

## Database controls

| Table/function | RLS/grants | Additional owner control |
| --- | --- | --- |
| `ndis_case_note_companion_claims` | RLS enabled; table grants revoked from `anon`/`authenticated`; service role only | Claim RPC updates only unclaimed/same-user rows and unexpired claims |
| `template_companion_quota_usage` | RLS enabled; service role only | Atomic security-definer RPC; pseudonymous fingerprint key |
| `template_companion_events` | RLS enabled; service role only | Event-name database constraint and server allowlist |
| `generated_material_drafts` | RLS enabled; service role only | Server lists by `user_id`; save/idempotency compares owner |
| `generated_material_events` | RLS enabled; service role only | Server-created metadata events; no content column |

RLS does not itself isolate one provider from another because end-user roles have no direct table access and server queries use the service role. Therefore route/page owner checks and RPC predicates are part of the authorization boundary, not just application convenience.
