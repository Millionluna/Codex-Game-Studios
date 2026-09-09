# Reviewed locally, not activated

`20260907083608_add_communication_note_job_status_issuer.sql` was generated with
Supabase CLI 2.115.0 `migration new`, then deliberately moved here before
implementation. Keeping it outside `migrations/` prevents ordinary CLI/Hosted
deployment from applying this new privileged control-plane surface implicitly.
It does not add privileges to application roles or create a management LOGIN.

The owned PG16 runner applies the exact file after its private Unix-socket guard:

```sh
node scripts/preview-e2e/communication-note-job-status-local-pg16.mjs
```

Run from the AI app directory. This uses synthetic data and a disposable owned
cluster; no existing or hosted database URL is accepted. Tests verify lifecycle,
ACL/RLS and role/session cleanup. This is not a Hosted security-advisor pass.

Before Hosted use: wire the target-bound custody dependencies, review the exact
candidate and execution authority, obtain the necessary Preview authorization,
promote this same file into a newly pinned migration manifest, and include real
PG17/TLS/GoTrue/browser/advisor checks. Never treat the prior 47-migration approval
as authorization to apply this candidate or enable the formal reader.

## Communication self-review persistence (2026-09-07)

`20260907114955_add_communication_note_self_review_shadow.sql` was also created
by `supabase migration new` and retained here as a local-only candidate. It is
not part of the approved 47-migration manifest. The formal HTTP route remains
unbound/503; no runtime flag has been enabled.

Run its fixed owned Unix-socket PG16 fixture with:

```sh
node scripts/preview-e2e/communication-note-self-review-local-pg16.mjs
```

This candidate introduces an authenticated-only, JWT-owner-scoped RPC and a
NOLOGIN/NOBYPASSRLS executor, with SELECT/INSERT on review events, owner RLS,
column-level UPDATE privileges solely for locking documents/switches, and one
call to the existing locked Provider/session helper. Its dedicated database
switch defaults false. It never updates draft contents, lifecycle or Points.
The application binding permits only Cookie requests; the RPC authenticates
the Data API JWT and cannot itself distinguish Cookie vs Bearer transport.
Review that Data API exposure and the exact new ACLs before any Hosted use.
Prior reader/Preview authorizations do not authorize this write surface.

The self-review local proof applies eight exact dependency migrations plus its
candidate, not the complete hosted migration chain. It uses synthetic Auth
metadata and valid privacy-reviewed saved drafts with all FK/CHECK/RLS
constraints enabled. Real GoTrue/PostgREST, PG17/TLS, Hosted security advisors
and separately approved candidate promotion remain outstanding.

## Communication wording edit persistence (2026-09-07)

`20260907132707_add_communication_note_wording_edit_shadow.sql` is CLI-generated
and unpromoted. It gives **no API caller** function EXECUTE/private schema USAGE.
An invoker-only public facade reaches a private definer owned by a dedicated
NOLOGIN/NOBYPASSRLS executor with owner RLS and narrow column/write grants. Its
edit flag defaults off; the formal route is unbound and the server writer is
uninstalled. No generic append RPC grant is reused.

```sh
node scripts/preview-e2e/communication-note-self-review-local-pg16.mjs --edit
```

This fixed disposable runner passes 14 self-review plus 19 edit groups with
real locking, atomic revision/sync/receipt writes, immutable facts, fresh review,
command idempotency, stale base, session revocation and privacy expiry checks.
Only the local test operator temporarily supplies and then removes the caller
capability. Its local CLI security scan returned an empty result list. No
Hosted/PostgREST/TLS, full migration chain or browser edit integration is proved.
Those gates and separately approved external permissions remain required.
