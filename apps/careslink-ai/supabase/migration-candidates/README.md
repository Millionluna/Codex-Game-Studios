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
