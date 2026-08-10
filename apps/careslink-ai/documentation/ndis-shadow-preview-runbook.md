# NDIS Canonical Shadow Preview Runbook

This runbook verifies the NDIS legacy-to-canonical slice without changing Production. It is not a Production rollout procedure. An isolated branch may be retained as a dedicated Preview baseline only after an explicit owner decision; retained does not mean Production-approved.

## Safety Preconditions

1. Record worktree branch, HEAD and dirty files. Do not commit or push for this gate.
2. Confirm the Supabase target is a non-default development branch with `with_data=false`; its project ref and URL ref must differ from Production `adocsnwnslxhxcjgbyee`. Record whether the branch is disposable for this run or an owner-approved retained Preview baseline.
3. Capture legacy migration list, schema signatures and aggregate row counts before applying anything. Do not print credentials or row content.
4. Confirm the Vercel target is Preview, deployment protection remains enabled, and no Production alias/environment value will change.
5. Use only synthetic, de-identified note wording. One model call is unnecessary because the save/claim fixture can be created without changing the model or prompt.

## Database Apply

Apply in order on the isolated branch:

1. `20260809120000_create_v1_shadow_foundation.sql`
2. `20260809150000_create_ndis_shadow_preview_integration.sql`

Verify both migration records, then inspect:

- 18 foundation tables plus `ndis_shadow_document_links`, `ndis_shadow_write_outbox` and `ndis_shadow_read_comparisons`;
- all `shadow_only` checks;
- composite source-owner/document-revision foreign keys;
- RLS enabled and no anon/authenticated write or RPC grants;
- projection, comparison, reconciliation and delete-tombstone RPC execution granted only to `service_role`;
- no Points wallet/lot/ledger rows and no welcome grant.

Run the credential-free transaction assertions:

- `supabase/tests/v1_shadow_contract_assertions.sql`
- `supabase/tests/v1_ndis_shadow_integration_assertions.sql`

Reset/recreate the branch and repeat both migrations once to prove clean reproducibility.

## Real JWT Matrix

Create two confirmed, test-only provider users using the branch Auth service. Credentials remain in memory only. There is no V1 Organisation/Admin product role; a third actor, if needed, is labelled only as a platform test service actor.

With real password-grant sessions:

- anon cannot read canonical/link/outbox/comparison tables or execute the four RPCs;
- provider A can read only A's canonical document/revisions through existing owner RLS;
- provider B sees zero A rows and cannot project, compare, mutate or delete A data;
- authenticated actors cannot directly write shadow tables or execute service-role RPCs;
- service-role RPCs reject a source/owner mismatch and `shadow_only=false` remains impossible.

## Projection Matrix

Use one synthetic A-owned legacy `generated_material_drafts` row:

1. first projection -> one document and revision 1;
2. same source version/idempotency replay -> same IDs, no new revision, and only if that revision is still current;
3. same content with newer source status/time -> `UNCHANGED`, mapping metadata advances and no revision is added;
4. edited legacy content -> revision 2 with revision 1 as base;
5. revert A→B→A with a newer source version -> revision 3, never a replay of historical revision 1;
6. stale source metadata/base -> `STALE`, no new revision;
7. an older call paused before locking cannot overwrite a newer source/projection;
8. malformed canonical projection -> metadata-only `FAILED` outbox row;
9. comparison -> `MATCH`; controlled wrong expected hash -> `MISMATCH`; correlation reuse cannot return evidence different from the stored row;
10. audit RPC -> only IDs, status, timestamps and failure codes;
11. parallel same-idempotency calls -> one revision/outbox identity;
12. parallel distinct-content calls -> serialized revisions or an explicit stale result, never silent overwrite;
13. owner Delete -> legacy response remains unchanged; canonical document/revision/checkpoint immediately become owner-inaccessible and the service-only cleanup marks the document tombstoned without physically purging its audit content.

Reconcile legacy credit rows before/after. Counts, reservation terminal state and result refs must match the legacy-only baseline. Point tables remain empty.

## App Preview

Create a protected Preview deployment from the uncommitted worktree and attach only Preview-scoped branch values. Required server activation values during the test window:

- `CARESLINK_V1_SHADOW_ENABLED=true`
- `CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED=true`
- `CARESLINK_V1_NDIS_SHADOW_READ_ENABLED=true` when testing comparison
- `CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF=<disposable branch ref>`

The Preview also needs the branch URL, publishable key and service-role key. Never copy Production secret values. Never expose service-role values as `NEXT_PUBLIC_*`. Remove the activation values after the gate; retained baseline connection values do not activate shadow behavior by themselves.

Verify:

- provider A saves the existing NDIS claim and receives the unchanged legacy response;
- one link/document/revision/outbox/comparison set appears for A;
- replay/reload does not duplicate a revision;
- provider B cannot read or affect A's legacy or canonical rows;
- mismatch/failure evidence contains no note body;
- disabling the master or dual-write flag on a replacement Preview stops shadow behavior while legacy Save still succeeds;
- no client bundle contains the service-role key, RPC implementation or shadow environment values.

## Cleanup

1. Delete test claims, events, quota, generated drafts, mappings, comparisons, outbox, canonical rows and any legacy credit fixtures.
2. Delete test sessions, identities and users; confirm prior password grants fail.
3. Verify all test-tagged and orphan counts are zero, including Points tables.
4. Delete every test Preview deployment and remove the master, dual-write, shadow-read, expected-ref, timeout and server-URL override test variables.
5. Delete the Supabase branch unless the owner explicitly designated it as a dedicated Preview baseline. If retained, keep test data/users at zero, keep activation flags absent, and document the branch identity and purpose.
6. Confirm Production deployment, aliases, migrations and aggregate row counts did not change.

## Stop Conditions

Stop without Production promotion if any of these occurs: a Production target/ref, canonical data changes a user response, legacy credit drift, Point activity, cross-owner visibility, duplicate revision under replay, lost failure evidence, note text in logs/telemetry, missing cleanup, or a flag combination that enables shadow behavior in `VERCEL_ENV=production`.

## Production Migration Hard Gate

The checked-in forward sequence is not an online, cross-migration atomic upgrade for a data-bearing environment. In particular, `20260810072017` commits before the identity/RLS correction in `20260810072952`, and the historical correction can change `updated_at` for an already projected PURGED row without enough evidence to reconstruct its prior timestamp. The retained branch was empty and shadow flags were off, and Production has none of these target migrations or rows, so no real user row was exposed or damaged during this gate. That fact must not be generalized to an online Production rollout.

Before any Production schema approval, require a metadata-only zero-row preflight, activation flags off, a database snapshot, a maintenance window that prevents target writes/reads while the full sequence completes, and post-apply RLS/hash/count reconciliation. If any target row exists, stop and use a separately reviewed transactional/squashed migration plan plus a timestamp restoration manifest; do not run this forward chain online and do not claim historical `updated_at` recovery without snapshot evidence.

## 2026-08-10 Gate Outcome

- Database phase: passed on non-default `with_data=false` branch `odrdlsrdlmtjczhmsbnj` (branch ID `5ce82f14-2a98-4f23-9022-8ece9ff2397b`, parent `adocsnwnslxhxcjgbyee`). The foundation and integration migrations, SQL assertions, RLS/grants, legacy safety and zero-Points baseline passed without Production writes.
- Protected App Preview: provider A's parser-valid synthetic save preserved the legacy response and produced `PROJECTED` plus shadow-read `MATCH`. Replaying the same idempotency key did not add a revision. Provider B could not see or affect A's legacy or canonical resources. The master kill switch produced legacy success with no shadow write/read. The entire gate used zero model calls.
- Adapter observability: the first synthetic fixture intentionally exposed a projection-boundary gap because a prohibited `neutralWordingChecks` value failed parsing before the integration logger. The projection boundary now catches that class, emits content-free `PROJECTION_ERROR` metadata, and still leaves the successful legacy response unchanged. Tests assert that no note body, participant fact or secret is logged.
- Data cleanup: provider A/B Auth users, sessions and every test-tagged legacy row, canonical row, link, outbox, comparison, claim, event, quota, credit and Point row were verified at zero.
- Environment cleanup: Preview `NEXT_PUBLIC_SUPABASE_URL` is fixed to the retained branch URL; the existing branch publishable and service-role values remained unchanged and were audited only for non-empty presence. The six activation/test variables are absent. The controlled env-pull artifact was deleted and its absence verified.
- Deployment cleanup: exactly `dpl_3io6p4WpwZyDGwAwTkWUPKg8xc88`, `dpl_mR8jHtDbkAhteongEuv7fT4J7kAd`, `dpl_HEdV8pQdL1xswXjmWa47EChTBDiF`, `dpl_7ZxCXPakSAcpSNbGLa1uk5FZkdQy` and `dpl_4DYtBMfsCAdyPV8RtxiQyPS9omLG` were deleted and verified absent. Production alias `ai.careslink.com.au` remained unchanged.
- Retention decision: the owner explicitly retained branch `odrdlsrdlmtjczhmsbnj` as the dedicated Preview baseline. It has schema but no test users/data and no active shadow flags. Production schema/runtime remain unchanged, and the next gate is explicit approval for Production shadow schema plus a limited internal canary.
- Post-review source boundary: source-version replay/CAS, correlation reuse, generation-bound delete tombstoning, pre-identity row repair, terminal PURGED preservation and pending-delete reconciliation were added after the protected App Preview outcome. Additive migration registry versions `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048` were forward-applied only to retained branch `odrdlsrdlmtjczhmsbnj`. A synthetic pre-corrective canonical row was backfilled from its link; an unidentifiable orphan was tombstoned and owner-hidden; a simulated historical PURGED row remained PURGED; a simulated missed tombstone was reported as `SOURCE_DELETE_CLEANUP_PENDING` while still owner-hidden; and a same-ID/new-`created_at` generation did not collide with its immutable predecessor. All fixtures were then fully removed. The foundation and updated integration assertion suites passed in rollback transactions, including A→B→A revision 3, historical/stale replay denial, stored comparison replay, source-bound owner-read denial after legacy deletion/recreation, write-free tombstone replay, generation ABA, pending-cleanup audit and unrelated-owner-document visibility. Auth, legacy, canonical, integration and Points counts remained zero afterward; four NDIS RPCs were service-role-only and client grants were zero. No new Preview deployment or activation flag was created, and Production remained unchanged. The earlier protected App Preview must not be presented as route-level evidence for this final bundle.
