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
| Generate a draft | Deny `401` before body parsing | Allow with monthly credit plus account/IP limits | Deny `403` | Session-first API role check, transactional credit RPC, rate limit, abuse quota RPC |
| View plan and credit usage | Deny | Own entitlement/ledger metadata only | No provider-ledger detail | Provider page gate plus owner-scoped query/RLS |
| Read temporary claim | Deny | Same owner only | Deny | Server page session gate and claim owner check |
| Bind and save claim | Deny | Allow for own account | Deny | Verified session, provider role, claim RPC owner condition |
| List saved drafts | Deny | Own `user_id` only | No provider-content view | Server query filtered by account ID |
| Delete saved NDIS case-note draft | Deny | Own record only | Deny | Provider session plus one atomic `id + user_id + feature` delete; missing/cross-owner/wrong-feature records all return `404` |
| Change saved status | Deny | Own record only | Not exposed for case notes | Server record-owner comparison |
| Write companion telemetry | Deny | Allowlisted metadata events | Deny | Session-first event route, server constructors and schema |
| View admin material usage | Deny | Deny | Allow | Admin route gate; metadata selectors; case-note exclusion |
| Sign out | No active session | Clear own session; safe provider return only | Clear own session; safe admin return allowed | Server action, internal-route allowlist, matching local auth-cookie cleanup, fail-closed error state |
| View privacy notice | Allow | Allow | Allow | Public read-only route; no account data |
| Request more credits fake door | Deny | Metadata opt-in for own signed-in account | Deny | Provider-only event route; fixed event name; no contact/free-text body; no entitlement mutation |

## Database controls

| Table/function | RLS/grants | Additional owner control |
| --- | --- | --- |
| `ndis_case_note_companion_claims` | RLS enabled; table grants revoked from `anon`/`authenticated`; service role only | Claim RPC updates only unclaimed/same-user rows and unexpired claims |
| `template_companion_quota_usage` | RLS enabled; service role only | Atomic security-definer RPC; pseudonymous fingerprint key |
| `template_companion_events` | RLS enabled; service role only | Event-name constraint, allowlisted `surface` constraint and server normalization; client cannot write arbitrary event names or attribution |
| `generated_material_drafts` | RLS enabled; after migration, `authenticated` receives owner-only `SELECT`/`DELETE`; no end-user `INSERT`/`UPDATE`; service role retains CRUD | Owner policies use `auth.uid() = user_id`; current server reads/writes/deletes still use service role with explicit owner predicates |
| `generated_material_events` | RLS enabled; service role only | Server-created metadata events; no content column |
| `account_entitlements` | RLS enabled; `authenticated` and service role receive `SELECT` only | Owner policy uses `auth.uid() = user_id`; creation/configuration occurs only inside service-role RPC/migration |
| `credit_ledger` | RLS enabled; `authenticated` and service role receive `SELECT` only | Owner policy plus append-only constraints; grant/reserve/commit/release writes are security-definer RPC only |
| `pilot_cohort_members` | RLS enabled; all privileges revoked from `public`/`anon`/`authenticated`; service role only | Fixed cohort/stage constraints and effective membership interval; aggregate reports join UUID internally but never return it |

Credit RPC execution is revoked from `public`, `anon`, and `authenticated` and
granted only to `service_role`. Their `search_path` is fixed to an empty path,
and every table reference is schema-qualified.

The migration revokes broad `public`, `anon` and `authenticated` grants before
adding the narrow owner policies. They are defence in depth for authenticated
session-bound table access. Current server queries use the service role, which bypasses RLS;
therefore route/page owner checks and atomic database predicates remain part of
the authorization boundary. Apply
`20260804143000_add_generated_material_owner_read_delete_policies.sql` before
claiming these owner RLS grants are active in a target environment.
