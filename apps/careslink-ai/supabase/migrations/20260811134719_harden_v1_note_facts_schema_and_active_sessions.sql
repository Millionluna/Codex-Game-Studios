-- The Supabase migration runner owns the transaction so schema changes and
-- migration history commit atomically. Do not add top-level BEGIN/COMMIT.
-- Permanent Preview hardening only. This migration validates the frozen five
-- Note facts schemas and treats auth.sessions.not_after as an active-session
-- boundary. It deliberately does not activate any document write RPC.

-- This migration may only extend the exact private implementation schema
-- created by the preceding privacy migration. Any owner, ACL or object-set
-- drift is a hard preflight failure before public wrappers are changed.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_internal');
  v_expected oid[] := array[
    to_regprocedure(
      'careslink_v1_internal.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'
    )
  ];
begin
  if v_schema is null
    or array_position(v_expected, null) is not null
    or not exists (
      select 1 from pg_namespace
      where oid = v_schema and nspowner = current_user::regrole
    )
    or exists (
      select 1
      from pg_roles as api_role
      where api_role.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_schema_privilege(api_role.oid, v_schema, 'USAGE')
          or has_schema_privilege(api_role.oid, v_schema, 'CREATE')
        )
    )
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = 0
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = namespace.nspowner
        and schema_acl.grantor = namespace.nspowner
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
        and not schema_acl.is_grantable
    ) <> 2
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and not (
          schema_acl.grantee = namespace.nspowner
          and schema_acl.grantor = namespace.nspowner
          and schema_acl.privilege_type in ('USAGE', 'CREATE')
          and not schema_acl.is_grantable
        )
    )
    or exists (
      with recursive reachable(role_oid) as (
        select oid from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        union
        select membership.roleid
        from pg_auth_members as membership
        join reachable on reachable.role_oid = membership.member
      )
      select 1 from reachable where role_oid = current_user::regrole
    )
    or (select count(*) from pg_proc where pronamespace = v_schema) <> 2
    or (
      select count(*)
      from pg_proc as implementation
      where implementation.oid = any(v_expected)
        and implementation.pronamespace = v_schema
        and implementation.proowner = current_user::regrole
        and coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'
        and implementation.prosecdef
        and cardinality(implementation.proconfig) = 1
        and implementation.proconfig[1] in ('search_path=', 'search_path=""')
        and (
          select count(*)
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
        ) = 1
        and not exists (
          select 1
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where not (
            function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
          )
        )
        and not exists (
          select 1
          from pg_roles as api_role
          where api_role.rolname in ('anon', 'authenticated', 'service_role')
            and has_function_privilege(
              api_role.oid, implementation.oid, 'EXECUTE'
            )
        )
    ) <> 2
    or exists (select 1 from pg_class where relnamespace = v_schema)
    or exists (select 1 from pg_type where typnamespace = v_schema)
    or exists (
      select 1
      from pg_depend as dependency
      where dependency.refclassid = 'pg_namespace'::regclass
        and dependency.refobjid = v_schema
        and dependency.refobjsubid = 0
        and not (
          dependency.classid = 'pg_proc'::regclass
          and dependency.objid = any(v_expected)
          and dependency.objsubid = 0
        )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'CARESLINK_V1_INTERNAL_SCHEMA_PREFLIGHT_REQUIRED';
  end if;
end
$$;

create or replace function public.assert_v1_shadow_note_facts(
  p_note_type text,
  p_schema_version text,
  p_facts jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_allowed text[];
  v_required text[];
  v_date_time_fields text[] := array['occurred_at'];
  v_short_text_fields text[] := '{}'::text[];
  v_long_text_fields text[] := '{}'::text[];
  v_string_list_fields text[] := '{}'::text[];
  v_field text;
  v_text text;
  -- Exact ECMAScript String.trim WhiteSpace + LineTerminator set. PostgreSQL's
  -- one-argument btrim only removes U+0020 and would drift from Mobile/AI.
  v_trim_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_facts is null
    or jsonb_typeof(p_facts) <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  case p_note_type
    when 'communication' then
      v_allowed := array[
        'occurred_at', 'contact_channel', 'parties_by_role',
        'observable_facts', 'action_taken', 'stated_outcome', 'follow_up'
      ];
      v_required := array[
        'occurred_at', 'contact_channel', 'parties_by_role',
        'observable_facts', 'action_taken'
      ];
      v_short_text_fields := array['contact_channel'];
      v_long_text_fields := array[
        'observable_facts', 'action_taken', 'stated_outcome', 'follow_up'
      ];
      v_string_list_fields := array['parties_by_role'];
    when 'handover' then
      v_allowed := array[
        'occurred_at', 'current_status', 'observable_facts',
        'actions_completed', 'outstanding_items', 'follow_up'
      ];
      v_required := array[
        'occurred_at', 'current_status', 'observable_facts',
        'actions_completed', 'outstanding_items'
      ];
      v_long_text_fields := array[
        'current_status', 'observable_facts', 'actions_completed',
        'outstanding_items', 'follow_up'
      ];
    when 'progress' then
      v_allowed := array[
        'occurred_at', 'support_type', 'support_delivered',
        'observable_facts', 'action_taken', 'participant_response', 'follow_up'
      ];
      v_required := array[
        'occurred_at', 'support_type', 'support_delivered',
        'observable_facts', 'action_taken'
      ];
      v_short_text_fields := array['support_type'];
      v_long_text_fields := array[
        'support_delivered', 'observable_facts', 'action_taken',
        'participant_response', 'follow_up'
      ];
    when 'ndis' then
      v_allowed := array[
        'occurred_at', 'support_type', 'support_delivered',
        'observable_facts', 'action_taken', 'participant_response',
        'provided_goal_context', 'follow_up'
      ];
      v_required := array[
        'occurred_at', 'support_type', 'support_delivered',
        'observable_facts', 'action_taken'
      ];
      v_short_text_fields := array['support_type'];
      v_long_text_fields := array[
        'support_delivered', 'observable_facts', 'action_taken',
        'participant_response', 'provided_goal_context', 'follow_up'
      ];
    when 'incident_factual' then
      v_allowed := array[
        'occurred_at', 'setting_category', 'observable_facts',
        'immediate_action', 'notification_facts', 'unresolved_items'
      ];
      v_required := array[
        'occurred_at', 'setting_category', 'observable_facts',
        'immediate_action'
      ];
      v_short_text_fields := array['setting_category'];
      v_long_text_fields := array[
        'observable_facts', 'immediate_action',
        'notification_facts', 'unresolved_items'
      ];
    else
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end case;

  if exists (
    select 1
    from jsonb_object_keys(p_facts) as supplied(field_code)
    where not (supplied.field_code = any(v_allowed))
  ) then
    -- Never place an untrusted field name in message/detail/hint.
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from unnest(v_required) as required(field_code)
    where not (p_facts ? required.field_code)
  ) then
    raise exception using errcode = 'P0001', message = 'MINIMUM_FACTS_REQUIRED';
  end if;

  foreach v_field in array v_allowed
  loop
    if not (p_facts ? v_field) then
      continue;
    end if;

    if v_field = any(v_date_time_fields) then
      if jsonb_typeof(p_facts->v_field) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      v_text := p_facts->>v_field;
      if btrim(v_text, v_trim_chars) = '' then
        if v_field = any(v_required) then
          raise exception using errcode = 'P0001', message = 'MINIMUM_FACTS_REQUIRED';
        end if;
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt]([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?([Zz]|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
      then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      begin
        -- Validate the calendar date separately. A timestamptz cast imposes
        -- PostgreSQL's narrower timezone displacement limit, while the frozen
        -- JS contract intentionally permits an RFC3339 offset through 23:59.
        if substring(v_text from 1 for 4)::integer < 1 then
          raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
        end if;
        perform pg_catalog.make_date(
          substring(v_text from 1 for 4)::integer,
          substring(v_text from 6 for 2)::integer,
          substring(v_text from 9 for 2)::integer
        );
      exception when others then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end;
    elsif v_field = any(v_string_list_fields) then
      if jsonb_typeof(p_facts->v_field) <> 'array' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if jsonb_array_length(p_facts->v_field) = 0 then
        if v_field = any(v_required) then
          raise exception using errcode = 'P0001', message = 'MINIMUM_FACTS_REQUIRED';
        end if;
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_facts->v_field) as item(value)
        where jsonb_typeof(item.value) <> 'string'
      ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(p_facts->v_field) as item(value)
        where btrim(item.value #>> '{}', v_trim_chars) <> ''
      ) then
        if v_field = any(v_required) then
          raise exception using errcode = 'P0001', message = 'MINIMUM_FACTS_REQUIRED';
        end if;
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_facts->v_field) as item(value)
        where btrim(item.value #>> '{}', v_trim_chars) = ''
      ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_facts->v_field) as item(value)
        where (item.value #>> '{}') is distinct from
          btrim(item.value #>> '{}', v_trim_chars)
      ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
    elsif v_field = any(v_short_text_fields)
      or v_field = any(v_long_text_fields)
    then
      if jsonb_typeof(p_facts->v_field) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if btrim(p_facts->>v_field, v_trim_chars) = '' then
        if v_field = any(v_required) then
          raise exception using errcode = 'P0001', message = 'MINIMUM_FACTS_REQUIRED';
        end if;
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      if (p_facts->>v_field) is distinct from
        btrim(p_facts->>v_field, v_trim_chars)
      then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
    else
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
  end loop;
end;
$$;

revoke all on function public.assert_v1_shadow_note_facts(text, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.assert_v1_shadow_privacy_finding_paths(
  p_note_type text,
  p_finding_decisions jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_allowed_scalar_paths text[];
begin
  if p_finding_decisions is null
    or jsonb_typeof(p_finding_decisions) <> 'array'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  case p_note_type
    when 'communication' then
      v_allowed_scalar_paths := array[
        '/occurred_at', '/contact_channel', '/observable_facts',
        '/action_taken', '/stated_outcome', '/follow_up'
      ];
    when 'handover' then
      v_allowed_scalar_paths := array[
        '/occurred_at', '/current_status', '/observable_facts',
        '/actions_completed', '/outstanding_items', '/follow_up'
      ];
    when 'progress' then
      v_allowed_scalar_paths := array[
        '/occurred_at', '/support_type', '/support_delivered',
        '/observable_facts', '/action_taken', '/participant_response',
        '/follow_up'
      ];
    when 'ndis' then
      v_allowed_scalar_paths := array[
        '/occurred_at', '/support_type', '/support_delivered',
        '/observable_facts', '/action_taken', '/participant_response',
        '/provided_goal_context', '/follow_up'
      ];
    when 'incident_factual' then
      v_allowed_scalar_paths := array[
        '/occurred_at', '/setting_category', '/observable_facts',
        '/immediate_action', '/notification_facts', '/unresolved_items'
      ];
    else
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end case;

  if exists (
    select 1
    from jsonb_array_elements(p_finding_decisions) as decision(value)
    where jsonb_typeof(decision.value) is distinct from 'object'
      or jsonb_typeof(decision.value->'fieldCode') is distinct from 'string'
      or not (
        decision.value->>'fieldCode' = any(v_allowed_scalar_paths)
        or (
          p_note_type = 'communication'
          and decision.value->>'fieldCode'
            ~ '^/parties_by_role/(0|[1-9][0-9]*)$'
        )
      )
  ) then
    -- The rejected pointer may itself contain PII. Keep diagnostics generic.
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
end;
$$;

revoke all on function public.assert_v1_shadow_privacy_finding_paths(text, jsonb)
  from public, anon, authenticated, service_role;

-- Fail closed rather than carrying a pre-hardening arbitrary pointer forward
-- as an apparently valid confirmed proof. No rejected pointer is echoed.
do $$
declare
  v_existing record;
begin
  for v_existing in
    select review.note_type, finding.field_code
    from public.privacy_review_findings as finding
    join public.privacy_reviews as review
      on review.id = finding.privacy_review_id
     and review.owner_user_id = finding.owner_user_id
  loop
    begin
      perform public.assert_v1_shadow_privacy_finding_paths(
        v_existing.note_type,
        jsonb_build_array(
          jsonb_build_object('fieldCode', v_existing.field_code)
        )
      );
    exception when raise_exception then
      raise exception using
        errcode = 'P0001',
        message = 'PRIVACY_FINDING_PATH_PREFLIGHT_REQUIRED';
    end;
  end loop;
end;
$$;

create or replace function public.v1_shadow_session_is_active(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_at timestamptz
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_owner_user_id is not null
    and p_session_id is not null
    and p_at is not null
    and exists (
      select 1
      from auth.sessions as active_session
      join auth.users as active_user
        on active_user.id = active_session.user_id
      where active_session.id = p_session_id
        and active_session.user_id = p_owner_user_id
        and (
          active_session.not_after is null
          or active_session.not_after > p_at
        )
        and active_user.aud = 'authenticated'
        and active_user.role = 'authenticated'
        -- Native/phone Auth remains unserved in this first Product API batch;
        -- only a confirmed email provider principal is eligible.
        and active_user.email_confirmed_at is not null
        and active_user.email_confirmed_at <= p_at
        and active_user.deleted_at is null
        and (
          active_user.banned_until is null
          or active_user.banned_until <= p_at
        )
        and active_user.is_anonymous is false
        and jsonb_typeof(active_user.raw_app_meta_data) = 'object'
        and active_user.raw_app_meta_data->>'role' = 'provider'
    ),
    false
  )
$$;

revoke all on function public.v1_shadow_session_is_active(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

-- Keep the already-reviewed bodies intact in the private schema and restore the
-- same public identities as thin, active-session-aware wrappers.
alter function public.resolve_v1_shadow_session_status(uuid, uuid)
  rename to resolve_v1_shadow_session_status_before_active_session;
alter function public.resolve_v1_shadow_session_status_before_active_session(uuid, uuid)
  set schema careslink_v1_internal;

alter function public.list_v1_shadow_documents(uuid, integer)
  rename to list_v1_shadow_documents_before_active_session;
alter function public.list_v1_shadow_documents_before_active_session(uuid, integer)
  set schema careslink_v1_internal;

alter function public.get_v1_shadow_document(uuid)
  rename to get_v1_shadow_document_before_active_session;
alter function public.get_v1_shadow_document_before_active_session(uuid)
  set schema careslink_v1_internal;

alter function public.create_v1_shadow_document(
  text, text, jsonb, text, text, text, text, uuid
) rename to create_v1_shadow_document_before_note_schema;
alter function public.create_v1_shadow_document_before_note_schema(
  text, text, jsonb, text, text, text, text, uuid
) set schema careslink_v1_internal;

alter function public.append_v1_shadow_document_revision(
  uuid, uuid, jsonb, text, text, text, text, uuid
) rename to append_v1_shadow_document_revision_before_note_schema;
alter function public.append_v1_shadow_document_revision_before_note_schema(
  uuid, uuid, jsonb, text, text, text, text, uuid
) set schema careslink_v1_internal;

alter function public.save_v1_shadow_document_checkpoint(
  uuid, uuid, text, text[], text, uuid, uuid, uuid
) rename to save_v1_shadow_document_checkpoint_before_active_session;
alter function public.save_v1_shadow_document_checkpoint_before_active_session(
  uuid, uuid, text, text[], text, uuid, uuid, uuid
) set schema careslink_v1_internal;

alter function public.tombstone_v1_shadow_document(uuid, uuid, text, text)
  rename to tombstone_v1_shadow_document_before_active_session;
alter function public.tombstone_v1_shadow_document_before_active_session(
  uuid, uuid, text, text
) set schema careslink_v1_internal;

alter function public.pull_v1_shadow_document_changes(bigint, integer)
  rename to pull_v1_shadow_document_changes_before_active_session;
alter function public.pull_v1_shadow_document_changes_before_active_session(
  bigint, integer
) set schema careslink_v1_internal;

alter function public.confirm_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) rename to confirm_v1_shadow_privacy_review_before_active_session;
alter function public.confirm_v1_shadow_privacy_review_before_active_session(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) set schema careslink_v1_internal;

revoke all on function careslink_v1_internal.resolve_v1_shadow_session_status_before_active_session(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.list_v1_shadow_documents_before_active_session(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.get_v1_shadow_document_before_active_session(uuid)
  from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.create_v1_shadow_document_before_note_schema(
  text, text, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.append_v1_shadow_document_revision_before_note_schema(
  uuid, uuid, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.save_v1_shadow_document_checkpoint_before_active_session(
  uuid, uuid, text, text[], text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.tombstone_v1_shadow_document_before_active_session(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.pull_v1_shadow_document_changes_before_active_session(bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.confirm_v1_shadow_privacy_review_before_active_session(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.resolve_v1_shadow_session_status(
  p_user_id uuid,
  p_session_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_user_id is null or p_session_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if public.v1_shadow_session_is_active(
    p_user_id, p_session_id, clock_timestamp()
  ) then
    return 'ACTIVE';
  end if;
  return 'REVOKED';
end;
$$;

create or replace function public.list_v1_shadow_documents(
  p_after_document_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  return careslink_v1_internal.list_v1_shadow_documents_before_active_session(
    p_after_document_id, p_limit
  );
end;
$$;

create or replace function public.get_v1_shadow_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  return careslink_v1_internal.get_v1_shadow_document_before_active_session(
    p_document_id
  );
end;
$$;

create or replace function public.create_v1_shadow_document(
  p_note_type text,
  p_source_locale text,
  p_content jsonb,
  p_content_hash text,
  p_mutation_id text,
  p_schema_version text,
  p_contract_version text,
  p_privacy_review_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_note_type is null
    or p_note_type not in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
    or p_source_locale is null
    or p_source_locale not in ('en', 'zh-Hans', 'zh-Hant')
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_contract_version is distinct from '1.0.0-shadow.1'
  then
    raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION';
  end if;
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content)
    or not (p_content ? 'factsSummary')
    or jsonb_typeof(p_content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':' || p_mutation_id, 0)
  );
  if not exists (
    select 1 from public.ai_document_mutation_receipts
    where owner_user_id = v_owner and mutation_id = p_mutation_id
  ) then
    perform public.assert_v1_shadow_note_facts(
      p_note_type, p_schema_version, p_content->'factsSummary'
    );
  end if;

  return careslink_v1_internal.create_v1_shadow_document_before_note_schema(
    p_note_type, p_source_locale, p_content, p_content_hash, p_mutation_id,
    p_schema_version, p_contract_version, p_privacy_review_id
  );
end;
$$;

create or replace function public.append_v1_shadow_document_revision(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_content jsonb,
  p_content_hash text,
  p_mutation_id text,
  p_schema_version text,
  p_contract_version text,
  p_privacy_review_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_document_id is null or p_base_revision_id is null
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_contract_version is distinct from '1.0.0-shadow.1'
  then
    raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION';
  end if;
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content)
    or not (p_content ? 'factsSummary')
    or jsonb_typeof(p_content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':' || p_mutation_id, 0)
  );
  if not exists (
    select 1 from public.ai_document_mutation_receipts
    where owner_user_id = v_owner and mutation_id = p_mutation_id
  ) then
    select * into v_document
    from public.ai_documents
    where id = p_document_id
      and owner_user_id = v_owner
      and contract_version = '1.0.0-shadow.1'
      and schema_version = '2026-08-09.v1-shadow';
    if v_document.id is not null then
      perform public.assert_v1_shadow_note_facts(
        v_document.note_type, p_schema_version, p_content->'factsSummary'
      );
    end if;
  end if;

  return careslink_v1_internal.append_v1_shadow_document_revision_before_note_schema(
    p_document_id, p_base_revision_id, p_content, p_content_hash, p_mutation_id,
    p_schema_version, p_contract_version, p_privacy_review_id
  );
end;
$$;

create or replace function public.save_v1_shadow_document_checkpoint(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_current_step text,
  p_completed_field_codes text[],
  p_mutation_id text,
  p_active_revision_id uuid default null,
  p_privacy_review_id uuid default null,
  p_generation_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  return careslink_v1_internal.save_v1_shadow_document_checkpoint_before_active_session(
    p_document_id, p_base_revision_id, p_current_step,
    p_completed_field_codes, p_mutation_id, p_active_revision_id,
    p_privacy_review_id, p_generation_job_id
  );
end;
$$;

create or replace function public.tombstone_v1_shadow_document(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_reason_code text,
  p_mutation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  return careslink_v1_internal.tombstone_v1_shadow_document_before_active_session(
    p_document_id, p_base_revision_id, p_reason_code, p_mutation_id
  );
end;
$$;

create or replace function public.pull_v1_shadow_document_changes(
  p_after_change_id bigint default 0,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_result jsonb;
  v_changes jsonb;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if not public.v1_shadow_session_is_active(
    v_owner, v_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  v_result := careslink_v1_internal.pull_v1_shadow_document_changes_before_active_session(
    p_after_change_id, p_limit
  );
  if jsonb_typeof(v_result->'changes') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select coalesce(
    jsonb_agg(
      change.value || jsonb_build_object('noteType', document.note_type)
      order by change.ordinality
    ),
    '[]'::jsonb
  ) into v_changes
  from jsonb_array_elements(v_result->'changes') with ordinality
    as change(value, ordinality)
  join public.ai_documents as document
    on document.id = (change.value->>'canonicalId')::uuid
   and document.owner_user_id = v_owner
   and document.contract_version = '1.0.0-shadow.1'
   and document.schema_version = '2026-08-09.v1-shadow';

  if jsonb_array_length(v_changes)
    <> jsonb_array_length(v_result->'changes')
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  return jsonb_set(v_result, '{changes}', v_changes, true);
end;
$$;

create or replace function public.confirm_v1_shadow_privacy_review(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_note_type text,
  p_cleaned_facts_hash text,
  p_schema_version text,
  p_contract_version text,
  p_scanner_policy_version text,
  p_review_revision integer,
  p_finding_decisions jsonb,
  p_deidentification_confirmed boolean,
  p_authority_to_process_confirmed boolean,
  p_mutation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_owner_user_id is null or p_session_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if not public.v1_shadow_session_is_active(
    p_owner_user_id, p_session_id, clock_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    perform public.assert_v1_shadow_privacy_finding_paths(
      p_note_type, p_finding_decisions
    );
  end if;
  return careslink_v1_internal.confirm_v1_shadow_privacy_review_before_active_session(
    p_owner_user_id, p_session_id, p_note_type, p_cleaned_facts_hash,
    p_schema_version, p_contract_version, p_scanner_policy_version,
    p_review_revision, p_finding_decisions, p_deidentification_confirmed,
    p_authority_to_process_confirmed, p_mutation_id
  );
end;
$$;

create or replace function public.enforce_v1_shadow_revision_privacy_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.ai_documents%rowtype;
  v_cleaned_facts_hash text;
begin
  select * into v_document
  from public.ai_documents
  where id = new.document_id and owner_user_id = new.owner_user_id;

  if v_document.id is null
    or v_document.contract_version <> '1.0.0-shadow.1'
    or v_document.schema_version <> '2026-08-09.v1-shadow'
  then
    return new;
  end if;
  if not (new.content ? 'factsSummary')
    or jsonb_typeof(new.content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform public.assert_v1_shadow_note_facts(
    v_document.note_type, new.schema_version, new.content->'factsSummary'
  );
  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    new.content->'factsSummary'
  );
  perform public.assert_v1_shadow_privacy_review(
    new.privacy_review_id,
    new.owner_user_id,
    v_document.note_type,
    v_cleaned_facts_hash,
    new.schema_version,
    new.contract_version,
    clock_timestamp()
  );
  return new;
end;
$$;

revoke all on function public.enforce_v1_shadow_revision_privacy_review()
  from public, anon, authenticated, service_role;

revoke all on function public.resolve_v1_shadow_session_status(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_v1_shadow_documents(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_v1_shadow_document(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.create_v1_shadow_document(
  text, text, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.append_v1_shadow_document_revision(
  uuid, uuid, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.save_v1_shadow_document_checkpoint(
  uuid, uuid, text, text[], text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.tombstone_v1_shadow_document(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.pull_v1_shadow_document_changes(bigint, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) from public, anon, authenticated, service_role;

grant execute on function public.resolve_v1_shadow_session_status(uuid, uuid)
  to service_role;
grant execute on function public.list_v1_shadow_documents(uuid, integer)
  to authenticated;
grant execute on function public.get_v1_shadow_document(uuid)
  to authenticated;
grant execute on function public.pull_v1_shadow_document_changes(bigint, integer)
  to authenticated;
grant execute on function public.confirm_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) to service_role;

-- create/append/checkpoint/tombstone remain deliberately withheld from every
-- API role until a disposable Preview-only activation is separately approved.

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_internal');
  v_expected oid[] := array[
    to_regprocedure(
      'careslink_v1_internal.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.resolve_v1_shadow_session_status_before_active_session(uuid,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.list_v1_shadow_documents_before_active_session(uuid,integer)'
    ),
    to_regprocedure(
      'careslink_v1_internal.get_v1_shadow_document_before_active_session(uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.create_v1_shadow_document_before_note_schema(text,text,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.append_v1_shadow_document_revision_before_note_schema(uuid,uuid,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.save_v1_shadow_document_checkpoint_before_active_session(uuid,uuid,text,text[],text,uuid,uuid,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.tombstone_v1_shadow_document_before_active_session(uuid,uuid,text,text)'
    ),
    to_regprocedure(
      'careslink_v1_internal.pull_v1_shadow_document_changes_before_active_session(bigint,integer)'
    ),
    to_regprocedure(
      'careslink_v1_internal.confirm_v1_shadow_privacy_review_before_active_session(uuid,uuid,text,text,text,text,text,integer,jsonb,boolean,boolean,text)'
    )
  ];
begin
  if v_schema is null
    or array_position(v_expected, null) is not null
    or not exists (
      select 1 from pg_namespace
      where oid = v_schema and nspowner = current_user::regrole
    )
    or exists (
      select 1
      from pg_roles as api_role
      where api_role.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_schema_privilege(api_role.oid, v_schema, 'USAGE')
          or has_schema_privilege(api_role.oid, v_schema, 'CREATE')
        )
    )
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = 0
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = namespace.nspowner
        and schema_acl.grantor = namespace.nspowner
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
        and not schema_acl.is_grantable
    ) <> 2
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and not (
          schema_acl.grantee = namespace.nspowner
          and schema_acl.grantor = namespace.nspowner
          and schema_acl.privilege_type in ('USAGE', 'CREATE')
          and not schema_acl.is_grantable
        )
    )
    or exists (
      with recursive reachable(role_oid) as (
        select oid from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        union
        select membership.roleid
        from pg_auth_members as membership
        join reachable on reachable.role_oid = membership.member
      )
      select 1 from reachable where role_oid = current_user::regrole
    )
    or (select count(*) from pg_proc where pronamespace = v_schema) <> 11
    or (
      select count(*)
      from pg_proc as implementation
      where implementation.oid = any(v_expected)
        and implementation.pronamespace = v_schema
        and implementation.proowner = current_user::regrole
        and coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'
        and implementation.prosecdef
        and cardinality(implementation.proconfig) = 1
        and implementation.proconfig[1] in ('search_path=', 'search_path=""')
        and (
          select count(*)
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
        ) = 1
        and not exists (
          select 1
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where not (
            function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
          )
        )
        and not exists (
          select 1
          from pg_roles as api_role
          where api_role.rolname in ('anon', 'authenticated', 'service_role')
            and has_function_privilege(
              api_role.oid, implementation.oid, 'EXECUTE'
            )
        )
    ) <> 11
    or exists (select 1 from pg_class where relnamespace = v_schema)
    or exists (select 1 from pg_type where typnamespace = v_schema)
    or exists (
      select 1
      from pg_depend as dependency
      where dependency.refclassid = 'pg_namespace'::regclass
        and dependency.refobjid = v_schema
        and dependency.refobjsubid = 0
        and not (
          dependency.classid = 'pg_proc'::regclass
          and dependency.objid = any(v_expected)
          and dependency.objsubid = 0
        )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'CARESLINK_V1_INTERNAL_FINAL_STATE_INVALID';
  end if;
end
$$;
