begin;

alter table public.generated_material_drafts enable row level security;

revoke all on public.generated_material_drafts from public;
revoke all on public.generated_material_drafts from anon, authenticated;
grant select, insert, update, delete
  on public.generated_material_drafts to service_role;
grant select, delete on public.generated_material_drafts to authenticated;

drop policy if exists generated_material_drafts_owner_select
  on public.generated_material_drafts;
create policy generated_material_drafts_owner_select
  on public.generated_material_drafts
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

drop policy if exists generated_material_drafts_owner_delete
  on public.generated_material_drafts;
create policy generated_material_drafts_owner_delete
  on public.generated_material_drafts
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

-- Generation and status updates remain server-controlled. The service role
-- retains its existing privileges and continues to be protected by explicit
-- user_id and feature predicates in owner-facing server routes.

commit;
