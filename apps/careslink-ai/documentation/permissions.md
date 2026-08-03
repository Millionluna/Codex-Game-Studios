# Permissions

## Roles and scope derivation

| Actor | Derived from | Notes |
| --- | --- | --- |
| Guest | Absence of a verified Supabase session | May generate within anonymous quotas; cannot save |
| Provider | Verified Supabase user plus server-created workspace account role | May save and read only their own documents |
| Admin | Verified Supabase user with admin role metadata | May access aggregate/metadata admin pages; cannot use provider save flow |
| Service role | Server-only Supabase key | Bypasses RLS; never sent to the browser |

## Resource matrix

| Resource and operation | Guest | Provider | Admin | Enforcement |
| --- | --- | --- | --- | --- |
| View public companion | Allow | Allow | Allow | Public route |
| Generate one draft | Allow within guest limits | Allow within account/IP limits | Deny | API role check, rate limit, quota RPC |
| Read unclaimed claim | Allow with opaque token | Allow with token | Allow with token only before owner binding | Server lookup; page hides cross-owner claim |
| Bind and save claim | Deny | Allow for own account | Deny | Verified session, provider role, claim RPC owner condition |
| List saved drafts | Deny | Own `user_id` only | No provider-content view | Server query filtered by account ID |
| Change saved status | Deny | Own record only | Not exposed for case notes | Server record-owner comparison |
| Write companion telemetry | Allowlisted metadata events | Allowlisted metadata events | Allowlisted metadata events | Server event constructors and schema |
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
