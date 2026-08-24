-- Five-Note historical worker-registration retention hardening.
--
-- Additive, source-only and default-off. Every durable attempt must retain the
-- exact immutable worker-registration row needed to reconstruct terminal
-- acknowledgements after later retries, success and payload purge. This
-- migration creates no catalog row, lifecycle API, caller grant, runtime
-- entrypoint or capability change, and it does not touch Production.
--
-- The migration runner owns the transaction boundary.

-- PostgreSQL 16+ keeps membership options per grantor. Add only a temporary
-- SET edge for owner-only DDL; the bootstrap admin-only creator edge remains
-- untouched when this exact grantor edge is revoked below.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;

set role careslink_v1_generation_owner;

-- PostgreSQL does not create an index on the referencing side of a foreign
-- key. Create it first so referenced registration updates/deletes do not scan
-- the full attempt history once the catalog is populated.
create index attempts_registration_digest_idx
  on careslink_v1_generation.attempts(registration_digest);

-- NOT VALID avoids an eager scan during the initial ADD and rejects new orphan
-- attempts immediately. The ordinary index build and same-transaction
-- validation are not an online/low-lock migration promise; this capability is
-- hard-off. Validation fails closed if any pre-existing historical attempt has
-- already lost its immutable registration row.
alter table careslink_v1_generation.attempts
  add constraint attempts_registration_catalog_fk
  foreign key (registration_digest)
  references careslink_v1_generation.worker_registrations(
    registration_digest
  )
  on update restrict
  on delete restrict
  not valid;

alter table careslink_v1_generation.attempts
  validate constraint attempts_registration_catalog_fk;

reset role;

-- Remove only this migration's temporary SET edge.
revoke careslink_v1_generation_owner from current_user
  granted by current_user;
