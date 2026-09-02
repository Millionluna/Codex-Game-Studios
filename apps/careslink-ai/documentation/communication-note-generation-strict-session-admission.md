# Communication Note strict session admission

## Outcome

This source-only follow-up closes the loose Workspace-account test seam at the
Communication Note generation HTTP boundary. It adds an explicit strict
principal resolver factory and makes the route consume a frozen, server-derived
`{ userId, sessionId, transport: "COOKIE" }` principal.

It does not activate the route. Compile-time readiness remains `false`, and the
formal principal resolver and formal submission port are both `undefined`.
Changing environment variables alone therefore cannot authenticate, enqueue or
generate a note.

## Authority sequence

The resolver accepts only explicit server-owned ports and evaluates authority in
this order:

1. require the Product API master flag;
2. reject every request containing an `Authorization` header before creating an
   Auth client or issuing an RPC;
3. use Cookie Auth `getClaims()` to verify the JWT and derive canonical `sub`
   and `session_id` UUIDs;
4. call only `resolve_v1_shadow_session_status(p_user_id, p_session_id)`;
5. require exact `ACTIVE` status;
6. call Cookie Auth `getUser()` and require its canonical ID to match `sub`;
7. return the frozen Cookie principal to the route.

The existing service-only RPC returns `ACTIVE` only when the exact Auth session
belongs to the user, is not past `not_after`, and the Auth user is authenticated,
email-confirmed, not deleted, not currently banned, not anonymous, and has the
trusted exact `raw_app_meta_data.role = provider`. No user-editable metadata,
request body identity, query string or Workspace default-role fallback is used.

## Fixed failure boundary

The table below is the mapping exercised by the injected source-test
composition and reserved for a future formally installed route. It is not the
current formal HTTP behavior: with readiness and both formal ports absent, the
real route stops at `503 PRODUCT_API_DISABLED` before authority inspection.

| Condition | HTTP result |
|---|---|
| missing/invalid Cookie identity or authoritative-user mismatch | `401 AUTH_REQUIRED` |
| missing, expired, revoked or Provider-ineligible exact session | `401 SESSION_REVOKED` |
| any `Authorization` header | `403 FORBIDDEN` |
| disabled/missing/malformed/unavailable authority | `503 PRODUCT_API_DISABLED` |

The route never returns the user or session ID, and errors never reflect tokens,
upstream messages or facts.

## Source-only target and custody composition

The follow-up composition remains outside the route and has a formal export of
`undefined`. Its executable source factory fails closed unless all of these
conditions hold together:

1. composition, generation and Product master flags are exact `true`;
2. `VERCEL=1`, `VERCEL_ENV=preview` and `VERCEL_TARGET_ENV=preview`;
3. expected and platform-provided Vercel project IDs are valid and identical;
4. the expected Supabase ref is exactly 20 lowercase alphanumeric characters
   and is not the known Production ref;
5. server and public Supabase URLs are both byte-exact
   `https://<ref>.supabase.co` with no credentials, port, slash, path, query or
   fragment;
6. server and public keys are identical `sb_publishable_` values;
7. the dedicated session-status value is an `sb_secret_` and is neither absent
   nor equal to the generic secret/service-role or privacy-review credential.

The validated configuration is frozen and rechecked before constructing the
Cookie client and again after claims, before constructing the privileged
client. No client is created at module import or composition-factory time. Any
`Authorization` header creates neither client; invalid claims can create the
Cookie client but never the privileged client. Successful ordering is fixed as
`getClaims → dedicated-client factory → exact RPC → getUser`.

This is exact target and credential-custody separation, not database least
privilege. The current `SECURITY DEFINER` RPC explicitly requires JWT role
`service_role`, revokes general execution and grants execution only to
`service_role`. A dedicated `sb_secret_` therefore remains
service-role-equivalent and bypasses RLS even though application code exposes
only this RPC through the new client interface.

## Deliberate limits and next gate

A subsequent repository migration now supplies the authenticated, zero-argument
current-session RPC source and isolated PostgreSQL 16.15 catalog/ACL/claim
evidence. It derives only `auth.uid()` and JWT `session_id`, accepts no caller
identity, fixes an empty `search_path`, and grants only `authenticated`. It is
unapplied and the composition still uses the legacy two-argument service-only
RPC plus dedicated privileged key. The next source gate is therefore Cookie/
authenticated-client rewiring with no legacy fallback. Formal installation,
trusted Provider role normalization and same-revision live active/revoked proof
on a disposable no-data Preview remain separate.

Request-time admission is not sufficient by itself. The future durable owner
enqueue RPC must re-read the active session and privacy authority inside the
same database transaction that accepts the job, closing the time-of-check to
time-of-use window. Only a registered asynchronous worker may later invoke an
approved model; the HTTP request thread must not do so.

This batch creates or contacts no live or ambient client, database connection,
Preview, Production resource, deployment, payload, Point transaction or model
call. Tests use only explicit in-memory mock ports.
