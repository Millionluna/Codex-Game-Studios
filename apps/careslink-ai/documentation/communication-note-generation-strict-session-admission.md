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
3. create one request-scoped Cookie/authenticated Supabase client and use its
   `getClaims()` to verify the JWT and derive canonical `sub` and `session_id`
   UUIDs;
4. revalidate the frozen configuration and call only the same client's
   zero-argument `resolve_v1_current_session_status()` RPC, without an argument
   object or caller identity;
5. require exact `ACTIVE` status;
6. call the same client's Cookie Auth `getUser()` and require its canonical ID
   to match `sub`;
7. return the frozen Cookie principal to the route.

The authenticated current-session RPC returns `ACTIVE` only when the exact Auth
session belongs to the user, is not past `not_after`, and the Auth user is
authenticated, email-confirmed, not deleted, not currently banned, not
anonymous, and has the trusted exact `raw_app_meta_data.role = provider`. No
user-editable metadata, request body identity, query string or Workspace
default-role fallback is used.

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

## Source-only target and authenticated-client composition

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
6. server and public keys are identical `sb_publishable_` values.

The validated configuration is frozen and rechecked before constructing the
Cookie client and again after claims, before calling the current-session RPC.
No client is created at module import or composition-factory time. Any
`Authorization` header creates no client; invalid claims may create the Cookie
client but cannot call the RPC or `getUser()`. The same client is used throughout
the request, in this fixed order: Cookie client → `getClaims` → snapshot
revalidation → zero-argument RPC → `getUser`.

This Communication Note path reads no dedicated or generic privileged key,
creates no privileged client and does not import or fall back to the legacy
two-argument service-only RPC. The new `SECURITY DEFINER` RPC derives its owner
from `auth.uid()` and exact session from the authenticated request JWT, revokes
general execution and grants execution only to `authenticated`. Its migration
remains unapplied, so the source wiring is not live database least-privilege or
Cookie/Auth evidence.

## Communication Note atomic 20-Point admission — source only

The later Production-unapplied migration
`20260902063211_add_v1_communication_note_points_admission.sql` closes the
source-level time-of-check/time-of-use gap for Communication admission. Its
private coordinator re-reads the current session and privacy authority inside
the same transaction that admits the durable job and reserves the fixed 20
Points. Exact same-key replay repeats those checks and is zero-write; an
authority, expiry or balance failure rolls back the job, payload and all Points
writes.

The adapter remains `READY=false`, TestOnly and unwired: no route importer,
caller grant, pool or database URL exists. The successor terminal-settlement
migration replaces the temporary paid-job quarantine without exposing the
legacy Points functions or installing a runtime principal. A21 is serial
rollback-only; a separate five-scenario, 15-PID local PostgreSQL 16.15 run
supplies the admission concurrency evidence. Neither batch used Hosted,
Production, a new Preview, deployment, a model or real care data.

## Communication Note atomic Points terminal settlement — source only

The later Production-unapplied migration
`20260902121601_add_v1_communication_note_points_terminal_settlement.sql`
admits marked paid jobs to the registered worker only while the exact 20-Point
reservation remains usable. It atomically commits success with canonical
artifact, provider and purge evidence; releases exact source lots on permanent
failure/cancellation; and keeps the reservation on retry. Post-lock lease,
fence, reservation and worker-policy margins fail closed. Per-registration
recovery turns prevent paid/unpaid and paid queued/running starvation. It adds a
non-login purpose role but no runtime membership, route, pool or credential.

The final isolated PostgreSQL 16.15 gate passed the exact 20-migration chain,
all five terminal/concurrency groups, permanent ACL postcheck and complete
cleanup. `documentation/tests.md` records the exact hashes and non-production
evidence boundary.

## Deliberate limits and next gate

The repository migration supplies the authenticated, zero-argument
current-session RPC source and isolated PostgreSQL 16.15 catalog/ACL/claim
evidence. It derives only `auth.uid()` and JWT `session_id`, accepts no caller
identity, fixes an empty `search_path`, and grants only `authenticated`. The
source-only composition is now wired to it without a legacy fallback, but the
migration remains unapplied and the formal composition/resolver remain absent.
Formal installation, trusted Provider role normalization and same-revision live
active/revoked proof on a disposable no-data Preview remain separate.

Request-time admission is not sufficient by itself. The later source coordinator
now re-reads the active session and privacy authority inside the same database
transaction that accepts the job and reserves 20 Points, closing that source
time-of-check/time-of-use window. The successor now supplies the source-level
terminal commit/release and worker unquarantine boundaries. Formal caller and
principal installation plus live disposable-Preview evidence remain absent.
Only a registered asynchronous worker may later invoke an approved model; the
HTTP request thread must not do so.

The strict-session composition batch itself creates or contacts no live or
ambient client, database connection,
Preview, Production resource, deployment, payload, Point transaction or model
call. Tests use only explicit in-memory mock ports.
