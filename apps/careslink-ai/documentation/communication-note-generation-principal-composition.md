# Communication Note principal composition handoff

## Status

This server-only, source-only composition factory implements the strict
Communication Note principal. It is not installed into the product route.

- Compile-time generation readiness: `false`
- Formal principal composition: `undefined`
- Formal principal resolver: `undefined`
- Formal submitter: `undefined`
- Physical route importer: absent
- UI, worker, provider/model, formal-route Points and payload-vault wiring: absent
- Authenticated current-session RPC: source-wired; migration unapplied

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
- identical server/public `sb_publishable_` keys.

The Communication Note composition does not read, compare or pass
`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, the privacy-review credential
or a dedicated session-status secret. Those values cannot affect its
configuration decision, and failures expose no environment value.

The configuration snapshot is revalidated before lazy client construction and
again after verified claims, immediately before the current-session RPC. One
request-scoped Cookie/authenticated client performs every Auth and RPC
operation. The fixed successful order is:

```text
exact target/configuration guard
  → Cookie client
  → getClaims
  → frozen snapshot revalidation
  → resolve_v1_current_session_status()
  → getUser
  → frozen Cookie principal
```

The RPC call supplies only the function name: no argument object and no
user/session identifier crosses the client boundary. The composition creates no
privileged client and has no fallback to
`resolve_v1_shadow_session_status(user_id, session_id)`. This source wiring does
not install the formal composition or resolver.

Test environment and client ports require an explicit TestOnly capability. The
default path can read only the process environment supplied by the deployment
platform. Static importer tests restrict the composition to its own test,
quarantine the authenticated current-session resolver inside the strict
principal stack, and prove the Communication Note composition does not import
the legacy low-level privileged factory or service-only RPC. The legacy module
remains available to the separate Product API path; it is not a Communication
Note fallback.

The guard does not query Supabase branch/control-plane metadata and therefore
does not prove that the configured ref is disposable, non-default, healthy or a
child of Production. Those properties require a separately authorized live
Preview gate.

## Authenticated source boundary and remaining limitation

The separately added
`20260902012628_add_v1_authenticated_current_session_status_rpc.sql` defines a
zero-argument `SECURITY DEFINER` function with an empty `search_path`. It derives
the owner from `auth.uid()`, the exact session from the JWT `session_id`,
preserves the existing trusted Provider/session predicates, revokes
`PUBLIC`/`anon`/`service_role`/`authenticator`, and grants only
`authenticated`. The source-only composition now calls it through the same
Cookie/authenticated client that verifies claims and later resolves the
authoritative user. No dedicated or generic privileged key is read, no
privileged client is constructed, and no legacy RPC fallback exists on this
path.

The migration remains unapplied, the formal composition/resolver remain
`undefined`, and the route remains disconnected. Therefore this batch is not
live Supabase evidence, Production least-privilege evidence or approval to
activate the route.

## Communication Note atomic 20-Point admission — source only

The later Production-unapplied migration
`20260902063211_add_v1_communication_note_points_admission.sql` now provides a
private coordinator that rechecks the active session and privacy authority,
admits the Communication durable job and reserves exactly 20 Points in the same
transaction. Exact replay revalidates the binding and writes nothing; the
owner-wide advisory lock prevents different keys from oversubscribing the same
wallet.

This does not install the principal composition. The Points-admission adapter is
still `READY=false` and TestOnly, creates no pool or database URL dependency, and
has no route importer or caller grant. The successor terminal-settlement source
replaces the temporary paid-job quarantine, but it likewise installs no runtime
principal. Neither migration changes a welcome grant or legacy credit. The DTO
hides the private binding and Points IDs, while existing authenticated-owner RLS
continues to expose the owner's own public Points row IDs. A21 is serial
rollback-only evidence; the independent five-scenario/15-PID local PG16 gate is
the admission concurrency evidence. Neither is a Hosted, Production, deployment
or activation result.

## Communication Note atomic Points terminal settlement — source only

Migration
`20260902121601_add_v1_communication_note_points_terminal_settlement.sql`
adds a separate non-login settlement purpose role with no runtime member.
Marked paid work can enter the existing registered-worker lifecycle only behind
its exact live reservation. Success commits 20 Points in the same transaction
that proves the canonical result/revision, sync receipt, provider evidence and
purge outbox; permanent failure/cancellation restores the exact allocation lots,
while retry keeps the reservation. Old owner/worker envelopes remain unchanged,
and generic Points terminal functions remain denied.

Claim, recovery, heartbeat, authorize and fence replay revalidate paid state
using post-lock clocks and the approved worker policy's timing margins. Recovery
uses per-registration paid/unpaid and paid queued/running turns to avoid backlog
starvation. This is still source/local evidence only: it does not set `READY`,
install the principal composition, create a credential or authorize a model.

The final isolated PostgreSQL 16.15 run passed the exact 20-migration dependency
chain and all five terminal/concurrency groups, then passed permanent ACL,
zero-fixture, graceful-stop and exact-delete checks. See
`documentation/tests.md` for the pinned source and scenario evidence.

## Principal-composition checkpoint: no external effect

For the principal-composition checkpoint itself, no environment was changed, no
real key was created or read, and no Supabase
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

The authenticated-RPC atomic batch closeout passed 9 focused files / 116 tests
and the full 205-file / 2,841-test Vitest suite. TypeScript, full ESLint, the
Next.js 16.2.9 Webpack build with 64/64 static pages, the 73-file adapter check
and `git diff --check` also passed.

Those figures are historical checkpoints from before the authenticated-client
rewiring. The current rewiring passed its focused 4-file / 98-test gate and the
full 206-file / 2,860-test Vitest suite. TypeScript, full ESLint, the 64/64-page
Webpack build, 73-file adapter sync, fresh 100-static-chunk client-boundary scan
and `git diff --check` passed.

These are local source/build/database results only, not Hosted Preview, retained
database or live Auth evidence.

## Next independent batch

Formally install the reviewed authenticated current-session composition only
after its remaining release gates are authorized. The later source coordinator
now covers same-transaction session/privacy reauthorization plus fixed 20-Point
reservation and exact terminal settlement, but formal caller installation,
trusted role normalization and a separately authorized disposable no-data
Hosted Preview active/revoked-session gate remain independent requirements
before any model-backed application work can be enabled. `READY`, the formal
principal resolver and the physical route must remain closed until that evidence
exists.
