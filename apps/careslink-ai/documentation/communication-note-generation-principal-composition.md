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

## No external effect

No environment was changed, no real key was created or read, no Supabase client
or network connection was opened, no migration was applied, and no Preview,
Production, Vercel deployment, database row, care data, Point or model call was
created or changed.

## Local verification

- focused principal/composition/route/Product-auth/session-migration/runtime
  boundary gate: 9 files / 196 tests passed;
- full Vitest suite: 204 files / 2,837 tests passed;
- TypeScript and full ESLint: passed;
- Next.js 16.2.9 Webpack production build: 64/64 static pages passed;
- Codex adapter sync: 73 files passed;
- `git diff --check`: passed.

These are local source/build results only, not live Preview, database or Auth
evidence.

## Next independent batch

Add and review an authenticated current-session RPC that:

1. accepts no user/session UUID arguments;
2. derives identity only from `auth.uid()` and JWT `session_id`;
3. preserves the exact active-session and trusted Provider predicates;
4. fixes `search_path` and all ownership/ACL/catalog expectations;
5. revokes `PUBLIC`, `anon` and `service_role` execution;
6. grants only `authenticated`;
7. passes role and malformed-claim matrices plus an authorized disposable
   no-data Preview gate.

After that, role normalization, formal composition installation and
same-transaction session/privacy reauthorization inside owner enqueue remain
required before any model-backed application work can be enabled.
