# Communication Note principal composition handoff

## Status

This batch adds a server-only, source-only composition factory for the strict
Communication Note principal. It does not install that factory into the product
route.

- Compile-time generation readiness: `false`
- Formal principal composition: `undefined`
- Formal principal resolver: `undefined`
- Formal submitter: `undefined`
- Physical route importer: absent
- UI, worker, provider/model, Points and payload-vault wiring: absent
- Authenticated current-session RPC migration: source-only and unapplied

Changing environment variables cannot activate the route. The formal route
continues to return no-store `503 PRODUCT_API_DISABLED` before authentication or
body access.

## Exact source guard

The composition factory requires all three application flags, exact Vercel
Preview identity and one exact configured Supabase target distinct from the
pinned known Production ref. It accepts only:

- `VERCEL=1`, `VERCEL_ENV=preview`, `VERCEL_TARGET_ENV=preview`;
- identical expected/actual `VERCEL_PROJECT_ID` values;
- one 20-character lowercase alphanumeric Supabase ref that is not the pinned
  known Production ref;
- identical server/public URLs equal byte-for-byte to
  `https://<ref>.supabase.co`;
- identical server/public `sb_publishable_` keys;
- one dedicated server-only `sb_secret_` value.

The dedicated value has no fallback to `SUPABASE_SECRET_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` or the privacy-review credential, and equality with
any of those values is rejected. Failure reasons expose no secret.

The configuration snapshot is revalidated before both lazy client boundaries.
The Cookie client is created only after configuration and transport checks. The
privileged client is created only after `getClaims()` has verified canonical
user and session UUIDs. The fixed successful order is:

```text
exact target/custody guard
  → Cookie client
  → getClaims
  → dedicated privileged client
  → resolve_v1_shadow_session_status(user_id, session_id)
  → getUser
  → frozen Cookie principal
```

That remains the exact composition in this source tree. The later
`public.resolve_v1_current_session_status()` migration is not called here, and
it does not install the formal composition or resolver.

Test environment and client ports require an explicit TestOnly capability. The
default path can read only the process environment supplied by the deployment
platform. Static importer tests restrict the composition to its own test and
restrict direct external import of the newly exposed low-level privileged
factory to this composition; its defining session-status module also uses that
factory internally as the legacy `create...FromEnv` default.

The guard does not query Supabase branch/control-plane metadata and therefore
does not prove that the configured ref is disposable, non-default, healthy or a
child of Production. Those properties require a separately authorized live
Preview gate.

## Security limitation

The dedicated `sb_secret_` improves separation, rotation and no-fallback
custody, but it does not reduce database authority. Supabase secret keys map to
a service-role-equivalent context and bypass RLS. The existing
`SECURITY DEFINER` session RPC itself checks `auth.jwt()->>'role' =
'service_role'` and grants execution only to `service_role`.

Therefore this batch must not be described as least privilege, live Supabase
evidence or approval to activate the route.

The separately added
`20260902012628_add_v1_authenticated_current_session_status_rpc.sql` defines a
zero-argument `SECURITY DEFINER` function with an empty `search_path`. It derives
the owner from `auth.uid()`, the exact session from the JWT `session_id`,
preserves the existing trusted Provider/session predicates, revokes
`PUBLIC`/`anon`/`service_role`/`authenticator`, and grants only
`authenticated`. That is the intended least-privilege database identity for a
later Cookie-client composition. The migration remains unapplied and unwired,
so its source and local SQL evidence are not live least-privilege evidence.

## No external effect

No environment was changed, no real key was created or read, and no Supabase
client or external network connection was opened. The migration was not applied
to Supabase, Preview, Production or any persistent environment; it was executed
only in the isolated local rollback gate described below. No Vercel deployment,
persistent database row, care data, Point or model call was created or changed.

## Local verification

The prior composition checkpoint passed its focused 9-file / 196-test gate,
204-file / 2,837-test full Vitest suite, TypeScript, full ESLint, 64/64-page
Webpack build, 73-file adapter check and diff check.

The additive RPC checkpoint passed its 1-file / 4-test static contract and the
combined 2-file / 22-test migration contract. Its rollback-only catalog, ACL,
role and claim matrix also passed on an isolated PostgreSQL 16.15 cluster using
fixed synthetic Auth rows and no care data; the server and temporary directory
were then removed.

The final current-source closeout passed 9 focused files / 116 tests and the
full 205-file / 2,841-test Vitest suite. TypeScript, full ESLint, the Next.js
16.2.9 Webpack build with 64/64 static pages, the 73-file adapter check and
`git diff --check` also passed.

These are local source/build/database results only, not Hosted Preview, retained
database or live Auth evidence.

## Next independent batch

Rewire the source-only composition to use the request-scoped
Cookie/authenticated Supabase client for
`resolve_v1_current_session_status()`. The rewiring must remove the dedicated
service-role-equivalent session-status client and its secret path without a
fallback to the legacy two-argument RPC.

That source change still does not install the formal composition or resolver.
Trusted role normalization, same-transaction session/privacy reauthorization
inside owner enqueue, and a separately authorized disposable no-data Hosted
Preview active/revoked-session gate remain independent requirements before any
model-backed application work can be enabled.
