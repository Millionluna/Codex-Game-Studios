-- Credential-free rollback assertions for the Preview-only V1 privacy-review
-- confirmation migration. Run only on a disposable branch after migrations
-- through 20260811134719. Rows roll back; identity-sequence movement from
-- successful fixtures is intentionally confined to a disposable branch.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $$
declare
  v_count integer;
  v_internal_schema oid := to_regnamespace('careslink_v1_internal');
  v_internal_functions oid[] := array[
    to_regprocedure('careslink_v1_internal.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.resolve_v1_shadow_session_status_before_active_session(uuid,uuid)'),
    to_regprocedure('careslink_v1_internal.list_v1_shadow_documents_before_active_session(uuid,integer)'),
    to_regprocedure('careslink_v1_internal.get_v1_shadow_document_before_active_session(uuid)'),
    to_regprocedure('careslink_v1_internal.create_v1_shadow_document_before_note_schema(text,text,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.append_v1_shadow_document_revision_before_note_schema(uuid,uuid,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.save_v1_shadow_document_checkpoint_before_active_session(uuid,uuid,text,text[],text,uuid,uuid,uuid)'),
    to_regprocedure('careslink_v1_internal.tombstone_v1_shadow_document_before_active_session(uuid,uuid,text,text)'),
    to_regprocedure('careslink_v1_internal.pull_v1_shadow_document_changes_before_active_session(bigint,integer)'),
    to_regprocedure('careslink_v1_internal.confirm_v1_shadow_privacy_review_before_active_session(uuid,uuid,text,text,text,text,text,integer,jsonb,boolean,boolean,text)')
  ];
  v_confirm_signature regprocedure :=
    'public.confirm_v1_shadow_privacy_review(uuid,uuid,text,text,text,text,text,integer,jsonb,boolean,boolean,text)'::regprocedure;
begin
  if to_regclass('public.privacy_review_findings') is null
    or to_regclass('public.privacy_confirmations') is null
    or to_regprocedure(
      'public.assert_v1_shadow_privacy_review(uuid,uuid,text,text,text,text,timestamptz)'
    ) is null
    or to_regprocedure(
      'public.assert_v1_shadow_note_facts(text,text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.assert_v1_shadow_privacy_finding_paths(text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.v1_shadow_session_is_active(uuid,uuid,timestamptz)'
    ) is null
    or v_confirm_signature is null
  then
    raise exception 'Privacy review confirmation objects are incomplete';
  end if;

  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and tablename in ('privacy_review_findings', 'privacy_confirmations')
    and rowsecurity;
  if v_count <> 2 then
    raise exception 'Privacy finding and confirmation RLS is incomplete';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.assert_v1_shadow_note_facts(text,text,jsonb)'::regprocedure
      and provolatile = 'i'
      and not prosecdef
      and exists (
        select 1 from unnest(proconfig) as setting
        where setting in ('search_path=', 'search_path=""')
      )
  ) or exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as api(role_name)
    where has_function_privilege(
      api.role_name,
      'public.assert_v1_shadow_note_facts(text,text,jsonb)'::regprocedure,
      'EXECUTE'
    )
  ) then
    raise exception 'Frozen Note facts validator security contract failed';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.assert_v1_shadow_privacy_finding_paths(text,jsonb)'::regprocedure
      and provolatile = 'i'
      and not prosecdef
      and exists (
        select 1 from unnest(proconfig) as setting
        where setting in ('search_path=', 'search_path=""')
      )
  ) or exists (
    select 1
    from unnest(array['anon', 'authenticated', 'service_role']) as api(role_name)
    where has_function_privilege(
      api.role_name,
      'public.assert_v1_shadow_privacy_finding_paths(text,jsonb)'::regprocedure,
      'EXECUTE'
    )
  ) then
    raise exception 'Privacy finding path validator security contract failed';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('privacy_review_findings', 'privacy_confirmations')
      and column_name in (
        'raw', 'raw_text', 'raw_excerpt', 'excerpt', 'value', 'matched_text',
        'matched_value', 'matched_hash', 'cleaned_facts', 'content', 'token',
        'access_token', 'authorization', 'source'
      )
  ) then
    raise exception 'Privacy metadata table contains a prohibited sensitive column';
  end if;

  if exists (
    select 1 from information_schema.table_privileges
    where table_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and table_name in ('privacy_review_findings', 'privacy_confirmations')
  ) then
    raise exception 'A privacy child table has a direct API-role grant';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
      and table_name = 'privacy_reviews'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'Authenticated still has direct privacy review SELECT';
  end if;

  if not has_function_privilege('service_role', v_confirm_signature, 'EXECUTE')
    or has_function_privilege('authenticated', v_confirm_signature, 'EXECUTE')
    or has_function_privilege('anon', v_confirm_signature, 'EXECUTE')
    or exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'confirm_v1_shadow_privacy_review'
        and grantee = 'PUBLIC'
        and privilege_type = 'EXECUTE'
    )
  then
    raise exception 'Privacy confirmation RPC is not service-role-only';
  end if;

  select count(*) into v_count
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in (
      'create_v1_shadow_document',
      'append_v1_shadow_document_revision',
      'save_v1_shadow_document_checkpoint',
      'tombstone_v1_shadow_document',
      'list_v1_shadow_documents',
      'get_v1_shadow_document',
      'pull_v1_shadow_document_changes',
      'resolve_v1_shadow_session_status'
    );
  if v_count <> 8
    or (
      select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname = 'confirm_v1_shadow_privacy_review'
    ) <> 1
  then
    raise exception 'A public document write RPC has an unsafe overload';
  end if;

  if exists (
    select 1 from unnest(array[
      'public.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'::regprocedure,
      'public.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'::regprocedure,
      'public.save_v1_shadow_document_checkpoint(uuid,uuid,text,text[],text,uuid,uuid,uuid)'::regprocedure,
      'public.tombstone_v1_shadow_document(uuid,uuid,text,text)'::regprocedure
    ]) as rpc(oid)
    where has_function_privilege('authenticated', rpc.oid, 'EXECUTE')
       or has_function_privilege('anon', rpc.oid, 'EXECUTE')
       or has_function_privilege('service_role', rpc.oid, 'EXECUTE')
       or exists (
         select 1 from information_schema.routine_privileges
         where routine_schema = 'public'
           and routine_name = (select proname from pg_proc where oid = rpc.oid)
           and grantee = 'PUBLIC'
           and privilege_type = 'EXECUTE'
       )
  ) then
    raise exception 'Document write RPC unexpectedly gained EXECUTE';
  end if;

  if v_internal_schema is null
    or array_position(v_internal_functions, null) is not null
    or not exists (
      select 1 from pg_namespace
      where oid = v_internal_schema and nspowner = current_user::regrole
    )
    or exists (
      select 1
      from pg_roles as api_role
      where api_role.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_schema_privilege(api_role.oid, v_internal_schema, 'USAGE')
          or has_schema_privilege(api_role.oid, v_internal_schema, 'CREATE')
        )
    )
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_internal_schema
        and schema_acl.grantee = 0
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_internal_schema
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
      where namespace.oid = v_internal_schema
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
    or (select count(*) from pg_proc where pronamespace = v_internal_schema) <> 11
    or (
      select count(*)
      from pg_proc as implementation
      where implementation.oid = any(v_internal_functions)
        and implementation.pronamespace = v_internal_schema
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
    or exists (select 1 from pg_class where relnamespace = v_internal_schema)
    or exists (select 1 from pg_type where typnamespace = v_internal_schema)
    or exists (
      select 1
      from pg_depend as dependency
      where dependency.refclassid = 'pg_namespace'::regclass
        and dependency.refobjid = v_internal_schema
        and dependency.refobjsubid = 0
        and not (
          dependency.classid = 'pg_proc'::regclass
          and dependency.objid = any(v_internal_functions)
          and dependency.objsubid = 0
        )
    )
  then
    raise exception 'Private Product V1 implementation schema contract is invalid';
  end if;
end
$$;

-- The validator must implement the five frozen catalog shapes without ever
-- reflecting an untrusted key or value into PostgreSQL diagnostics.
do $$
declare
  v_message text;
  v_detail text;
  v_hint text;
  v_invalid_timestamp text;
begin
  perform public.assert_v1_shadow_note_facts(
    'communication', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T10:15:30+10:00","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"Observed contact.","action_taken":"Recorded the contact.","stated_outcome":"No outcome stated.","follow_up":"Review later."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'communication', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11t00:15:30z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"Observed contact.","action_taken":"Recorded the contact."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'communication', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T00:15:30.123456789012+23:59","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"Observed contact.","action_taken":"Recorded the contact."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'handover', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T00:15:30Z","current_status":"Stable.","observable_facts":"Observed facts.","actions_completed":"Documented.","outstanding_items":"None stated.","follow_up":"Review later."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'progress', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T00:15:30.123Z","support_type":"home support","support_delivered":"Support delivered.","observable_facts":"Observed facts.","action_taken":"Documented.","participant_response":"Response observed.","follow_up":"Review later."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'ndis', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T00:15:30Z","support_type":"community access","support_delivered":"Support delivered.","observable_facts":"Observed facts.","action_taken":"Documented.","participant_response":"Response observed.","provided_goal_context":"User-provided context.","follow_up":"Review later."}'::jsonb
  );
  perform public.assert_v1_shadow_note_facts(
    'incident_factual', '2026-08-09.v1-shadow',
    '{"occurred_at":"2026-08-11T00:15:30Z","setting_category":"home","observable_facts":"Observed facts.","immediate_action":"Area made safe.","notification_facts":"Notification recorded.","unresolved_items":"None stated."}'::jsonb
  );

  perform public.assert_v1_shadow_privacy_finding_paths(
    'communication',
    '[{"fieldCode":"/parties_by_role/0"},{"fieldCode":"/follow_up"}]'::jsonb
  );
  perform public.assert_v1_shadow_privacy_finding_paths(
    'handover', '[{"fieldCode":"/current_status"}]'::jsonb
  );
  perform public.assert_v1_shadow_privacy_finding_paths(
    'progress', '[{"fieldCode":"/support_type"}]'::jsonb
  );
  perform public.assert_v1_shadow_privacy_finding_paths(
    'ndis', '[{"fieldCode":"/provided_goal_context"}]'::jsonb
  );
  perform public.assert_v1_shadow_privacy_finding_paths(
    'incident_factual', '[{"fieldCode":"/notification_facts"}]'::jsonb
  );

  begin
    perform public.assert_v1_shadow_privacy_finding_paths(
      'communication', '[{"fieldCode":"/Jane_Doe_private"}]'::jsonb
    );
    raise exception 'PII-shaped privacy finding pointer unexpectedly passed';
  exception when raise_exception then
    get stacked diagnostics
      v_message = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint;
    if v_message <> 'VALIDATION_ERROR'
      or coalesce(v_message, '') like '%Jane_Doe_private%'
      or coalesce(v_detail, '') like '%Jane_Doe_private%'
      or coalesce(v_hint, '') like '%Jane_Doe_private%'
    then
      raise;
    end if;
  end;

  begin
    perform public.assert_v1_shadow_privacy_finding_paths(
      'communication', '[{"fieldCode":"/parties_by_role"}]'::jsonb
    );
    raise exception 'Unindexed string-list privacy pointer unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_privacy_finding_paths(
      'communication', '[{"fieldCode":"/parties_by_role/01"}]'::jsonb
    );
    raise exception 'Non-canonical string-list privacy index unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_privacy_finding_paths(
      'communication', '[{"fieldCode":"/support_type"}]'::jsonb
    );
    raise exception 'Cross-Note privacy finding pointer unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker"],"observable_facts":"Observed."}'::jsonb
    );
    raise exception 'Missing required Note fact unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":[],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Empty required Note fact unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":[" ",""],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'All-blank required Note list unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["\t","\n","\u00a0"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'ECMAScript-whitespace required Note list unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30","contact_channel":"phone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Timezone-free date_time unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  foreach v_invalid_timestamp in array array[
    '2026-08-11T24:00:00Z',
    '2026-08-11T23:60:00Z',
    '2026-08-11T23:59:60Z',
    '2026-08-11T23:59:59+24:00',
    '2026-08-11T23:59:59+10:60'
  ]
  loop
    begin
      perform public.assert_v1_shadow_note_facts(
        'communication', '2026-08-09.v1-shadow',
        jsonb_build_object(
          'occurred_at', v_invalid_timestamp,
          'contact_channel', 'phone',
          'parties_by_role', jsonb_build_array('worker'),
          'observable_facts', 'Observed.',
          'action_taken', 'Documented.'
        )
      );
      raise exception 'Out-of-range RFC3339 date_time unexpectedly passed';
    exception when raise_exception then
      if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
    end;
  end loop;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":"worker","observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Wrong Note field kind unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":" phone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Untrimmed Note text unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"\tphone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Leading-tab Note text unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"\u00a0phone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Leading-NBSP Note text unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker "],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Untrimmed Note list item unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker\n"],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Trailing-newline Note list item unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker"," "],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Mixed valid/blank Note list unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker",7],"observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Mixed string/non-string Note list unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented.","follow_up":" "}'::jsonb
    );
    raise exception 'Empty optional Note text unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["worker"],"observable_facts":"Observed.","action_taken":"Documented.","participant_name_secret":"must-never-echo"}'::jsonb
    );
    raise exception 'Unknown PII-shaped Note key unexpectedly passed';
  exception when raise_exception then
    get stacked diagnostics
      v_message = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint;
    if v_message <> 'VALIDATION_ERROR'
      or coalesce(v_message, '') like '%participant_name_secret%'
      or coalesce(v_detail, '') like '%participant_name_secret%'
      or coalesce(v_hint, '') like '%participant_name_secret%'
      or coalesce(v_message, '') like '%must-never-echo%'
      or coalesce(v_detail, '') like '%must-never-echo%'
      or coalesce(v_hint, '') like '%must-never-echo%'
    then
      raise;
    end if;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow',
      '{"occurred_at":"2026-08-11T00:15:30Z","support_type":"home support","support_delivered":"Delivered.","observable_facts":"Observed.","action_taken":"Documented."}'::jsonb
    );
    raise exception 'Cross-Note facts shape unexpectedly passed';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'privacy-shadow-a@example.invalid', 'test-only-no-login', now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'privacy-shadow-b@example.invalid', 'test-only-no-login', now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into auth.sessions (id, user_id, created_at, updated_at, not_after) values
  (
    '91100000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001', now(), now(), null
  ),
  (
    '92200000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002', now(), now(), null
  ),
  (
    '91100000-0000-4000-8000-000000000099',
    '91000000-0000-4000-8000-000000000001', now(), now(),
    now() - interval '1 second'
  );

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
  where id = '91000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Admin role unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role":"provider"}'::jsonb,
      is_anonymous = true
  where id = '91000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Anonymous provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set is_anonymous = false,
      banned_until = clock_timestamp() + interval '1 hour'
  where id = '91000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Banned provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set banned_until = null,
      deleted_at = clock_timestamp()
  where id = '91000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Deleted provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set deleted_at = null
  where id = '91000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ) <> 'ACTIVE' then
    raise exception 'Eligible privacy provider did not recover ACTIVE';
  end if;
end
$$;

update public.v1_mobile_sync_shadow_flags
set enabled = true, updated_at = now()
where feature_key = 'mobile_sync_v1';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_hash text := public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
  );
  v_decisions jsonb := '[
    {
      "findingType":"phone",
      "fieldCode":"/follow_up",
      "startOffset":6,
      "endOffset":16,
      "decision":"REMOVED"
    },
    {
      "findingType":"labelled_identifier",
      "fieldCode":"/observable_facts",
      "startOffset":0,
      "endOffset":5,
      "decision":"RETAINED_CONFIRMED",
      "retentionPurposeConfirmed":true
    }
  ]'::jsonb;
  v_reordered jsonb := '[
    {
      "findingType":"labelled_identifier",
      "fieldCode":"/observable_facts",
      "startOffset":0,
      "endOffset":5,
      "decision":"RETAINED_CONFIRMED",
      "retentionPurposeConfirmed":true
    },
    {
      "findingType":"phone",
      "fieldCode":"/follow_up",
      "startOffset":6,
      "endOffset":16,
      "decision":"REMOVED"
    }
  ]'::jsonb;
  v_main jsonb;
  v_replay jsonb;
  v_other jsonb;
  v_simulated_expires_at timestamptz;
  v_review_count bigint;
  v_finding_count bigint;
  v_confirmation_count bigint;
  v_message text;
  v_detail text;
  v_hint text;
begin
  v_main := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    v_decisions, true, true, 'privacy.confirm.owner-a.main.0001'
  );
  if v_main->>'status' <> 'CONFIRMED'
    or v_main->>'id' is null
    or (v_main->>'expiresAt')::timestamptz
      - (v_main->>'confirmedAt')::timestamptz <> interval '30 minutes'
    or v_main->>'ownerUserId'
      is distinct from '91000000-0000-4000-8000-000000000001'
    or v_main ? 'sessionId'
    or v_main ? 'contractVersion'
    or v_main ? 'accessToken'
    or v_main ? 'authorization'
  then
    raise exception 'Confirmed privacy proof response contract failed';
  end if;
  if (select count(*) from public.privacy_review_findings
      where privacy_review_id = (v_main->>'id')::uuid) <> 2
    or (select count(*) from public.privacy_confirmations
        where privacy_review_id = (v_main->>'id')::uuid) <> 2
  then
    raise exception 'Atomic privacy finding/confirmation persistence failed';
  end if;

  v_replay := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    v_reordered, true, true, 'privacy.confirm.owner-a.main.0001'
  );
  if v_replay <> v_main then
    raise exception 'Privacy confirmation replay changed the proof';
  end if;

  select count(*) into v_review_count from public.privacy_reviews;
  select count(*) into v_finding_count from public.privacy_review_findings;
  select count(*) into v_confirmation_count from public.privacy_confirmations;
  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[{"findingType":"phone","fieldCode":"/Jane_Doe_private","startOffset":0,"endOffset":4,"decision":"REMOVED"}]'::jsonb,
      true, true, 'privacy.confirm.pii-pointer.0001'
    );
    raise exception 'PII-shaped pointer unexpectedly issued a privacy proof';
  exception when raise_exception then
    get stacked diagnostics
      v_message = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint;
    if v_message <> 'VALIDATION_ERROR'
      or coalesce(v_message, '') like '%Jane_Doe_private%'
      or coalesce(v_detail, '') like '%Jane_Doe_private%'
      or coalesce(v_hint, '') like '%Jane_Doe_private%'
    then
      raise;
    end if;
  end;
  if (select count(*) from public.privacy_reviews) <> v_review_count
    or (select count(*) from public.privacy_review_findings) <> v_finding_count
    or (select count(*) from public.privacy_confirmations)
      <> v_confirmation_count
  then
    raise exception 'Rejected privacy finding pointer caused a side effect';
  end if;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication',
      'f999c634bdbfc13e24029689c0cf3df122b73e5b317271281bbd52c80bd70cf2',
      '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      v_decisions, true, true, 'privacy.confirm.owner-a.main.0001'
    );
    raise exception 'Privacy confirmation idempotency conflict was not rejected';
  exception when raise_exception then
    if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      v_decisions, false, true, 'privacy.confirm.false.0001'
    );
    raise exception 'False privacy confirmation unexpectedly issued a proof';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_REQUIRED' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91900000-0000-4000-8000-000000000099',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[]'::jsonb, true, true, 'privacy.confirm.revoked-session.0001'
    );
    raise exception 'Revoked session unexpectedly confirmed a privacy review';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000099',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[]'::jsonb, true, true, 'privacy.confirm.expired-session.0001'
    );
    raise exception 'not_after session unexpectedly confirmed a privacy review';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[{"findingType":"phone","fieldCode":"/follow_up","startOffset":0,"endOffset":4,"decision":"REMOVED","matchedText":"forbidden"}]'::jsonb,
      true, true, 'privacy.confirm.unsafe-decision.0001'
    );
    raise exception 'Unsafe privacy decision projection unexpectedly persisted';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[{"findingType":"phone","fieldCode":"/follow_up","startOffset":0,"endOffset":4,"decision":"REMOVED","retentionPurposeConfirmed":false}]'::jsonb,
      true, true, 'privacy.confirm.false-retention.0001'
    );
    raise exception 'Non-retained finding accepted a retention confirmation field';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[{"findingType":"indirect_identifier","fieldCode":"/follow_up","startOffset":0,"endOffset":4,"decision":"REMOVED"}]'::jsonb,
      true, true, 'privacy.confirm.invalid-type.0001'
    );
    raise exception 'Invalid privacy finding type was accepted';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication', v_hash, '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[{"findingType":"phone","fieldCode":"/not~2a-pointer","startOffset":0,"endOffset":4,"decision":"REMOVED"}]'::jsonb,
      true, true, 'privacy.confirm.invalid-pointer.0001'
    );
    raise exception 'Invalid RFC6901 privacy field pointer was accepted';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  perform set_config('test.privacy_a_main', v_main->>'id', true);

  v_other := public.confirm_v1_shadow_privacy_review(
    '92000000-0000-4000-8000-000000000002',
    '92200000-0000-4000-8000-000000000002',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-b.main.0001'
  );
  perform set_config('test.privacy_b_main', v_other->>'id', true);

  v_other := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'handover', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.handover.0001'
  );
  perform set_config('test.privacy_a_handover', v_other->>'id', true);

  v_other := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.expired.0001'
  );
  perform set_config('test.privacy_a_expired', v_other->>'id', true);
  update public.privacy_reviews
  set confirmed_at = statement_timestamp() - interval '90 minutes',
      expires_at = statement_timestamp() - interval '1 hour'
  where id = (v_other->>'id')::uuid;
  select expires_at into v_simulated_expires_at
  from public.privacy_reviews
  where id = (v_other->>'id')::uuid;
  v_replay := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.expired.0001'
  );
  if v_replay->>'id' is distinct from v_other->>'id'
    or v_replay->>'status' <> 'CONFIRMED'
    or (v_replay->>'expiresAt')::timestamptz
      is distinct from v_simulated_expires_at
  then
    raise exception 'Expired privacy confirmation replay changed its stored ACK';
  end if;

  v_other := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.schema.0001'
  );
  perform set_config('test.privacy_a_schema', v_other->>'id', true);

  v_other := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.revoked.0001'
  );
  perform set_config('test.privacy_a_revoked', v_other->>'id', true);

  v_other := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication', v_hash, '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    '[]'::jsonb, true, true, 'privacy.confirm.owner-a.alternate.0001'
  );
  perform set_config('test.privacy_a_alternate', v_other->>'id', true);
end
$$;

set local role service_role;
do $$
declare
  v_replay jsonb;
begin
  v_replay := public.confirm_v1_shadow_privacy_review(
    '91000000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'communication',
    '87858ae96ecb8cbe5057f67ea5761c3b2ec01a060cb519b5fede888e512d46da',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    '2026-08-11.preview.1', 1,
    '[{"findingType":"phone","fieldCode":"/follow_up","startOffset":6,"endOffset":16,"decision":"REMOVED"},{"findingType":"labelled_identifier","fieldCode":"/observable_facts","startOffset":0,"endOffset":5,"decision":"RETAINED_CONFIRMED","retentionPurposeConfirmed":true}]'::jsonb,
    true, true, 'privacy.confirm.owner-a.main.0001'
  );
  if v_replay->>'id' is distinct from current_setting('test.privacy_a_main') then
    raise exception 'Service role could not replay the privacy confirmation';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.privacy_reviews;
    raise exception 'Authenticated role directly read privacy metadata';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.privacy_review_findings;
    raise exception 'Authenticated role directly read privacy findings';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.privacy_confirmations;
    raise exception 'Authenticated role directly read privacy confirmations';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.confirm_v1_shadow_privacy_review(
      '91000000-0000-4000-8000-000000000001',
      '91100000-0000-4000-8000-000000000001',
      'communication',
      '9e56393474b7e213e2da51230072b1e309d1e1fb6e30a17d8637c156fb1789d5',
      '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
      '[]'::jsonb, true, true, 'privacy.confirm.client-bypass.0001'
    );
    raise exception 'Authenticated role directly confirmed a privacy review';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en',
      '{"englishDraft":"blocked","reviewVersions":{},"factsSummary":{"observable_facts":"clean"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb,
      '464fcf608ae9b308dbd9a18b230004b581a6acb63f825293ac0f5e87889e02e2',
      'privacy.document.client-bypass.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Document write RPC unexpectedly gained EXECUTE';
  exception when insufficient_privilege then null;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
  true
);

do $$
declare
  v_content jsonb := '{"englishDraft":"first","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_content_second jsonb := '{"englishDraft":"second","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_changed_facts jsonb := '{"englishDraft":"changed facts","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"changed","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_missing_facts jsonb := '{"englishDraft":"missing facts","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_pii_key_facts jsonb := '{"englishDraft":"unknown key","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented","participant_name_secret":"must-never-echo"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_create jsonb;
  v_create_replay jsonb;
  v_append jsonb;
  v_checkpoint jsonb;
  v_tombstone jsonb;
  v_document_count integer;
  v_revision_count integer;
  v_receipt_count integer;
  v_change_count integer;
  v_change_sequence_value bigint;
  v_change_sequence_after bigint;
  v_confirmed_at timestamptz;
  v_expires_at timestamptz;
  v_error_message text;
  v_error_detail text;
  v_error_hint text;
begin
  v_create := public.create_v1_shadow_document(
    'communication', 'en', v_content,
    public.v1_shadow_content_sha256(v_content),
    'privacy.document.valid-create.0001',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    current_setting('test.privacy_a_main')::uuid
  );
  if v_create->>'saveState' <> 'SERVER_ACKNOWLEDGED' then
    raise exception 'Valid confirmed privacy proof did not create a document';
  end if;

  update public.privacy_reviews
  set confirmed_at = statement_timestamp() - interval '90 minutes',
      expires_at = statement_timestamp() - interval '1 hour'
  where id = current_setting('test.privacy_a_main')::uuid;
  v_create_replay := public.create_v1_shadow_document(
    'communication', 'en', v_content,
    public.v1_shadow_content_sha256(v_content),
    'privacy.document.valid-create.0001',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    current_setting('test.privacy_a_main')::uuid
  );
  if v_create_replay <> v_create then
    raise exception 'Successful document replay was blocked by later proof expiry';
  end if;
  update public.privacy_reviews
  set confirmed_at = statement_timestamp(),
      expires_at = statement_timestamp() + interval '30 minutes'
  where id = current_setting('test.privacy_a_main')::uuid;

  select confirmed_at, expires_at into v_confirmed_at, v_expires_at
  from public.privacy_reviews
  where id = current_setting('test.privacy_a_main')::uuid;
  perform public.assert_v1_shadow_privacy_review(
    current_setting('test.privacy_a_main')::uuid,
    '91000000-0000-4000-8000-000000000001',
    'communication',
    public.v1_shadow_content_sha256(
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
    ),
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    v_expires_at - interval '1 microsecond'
  );
  begin
    perform public.assert_v1_shadow_privacy_review(
      current_setting('test.privacy_a_main')::uuid,
      '91000000-0000-4000-8000-000000000001',
      'communication',
      public.v1_shadow_content_sha256(
        '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
      ),
      '2026-08-09.v1-shadow', '1.0.0-shadow.1', v_expires_at
    );
    raise exception 'Privacy proof remained valid at its expiry boundary';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  update public.privacy_reviews
  set confirmed_at = statement_timestamp() - interval '90 minutes',
      expires_at = statement_timestamp() - interval '1 hour'
  where id = current_setting('test.privacy_a_expired')::uuid;
  update public.privacy_reviews
  set schema_version = '2026-08-08.invalid'
  where id = current_setting('test.privacy_a_schema')::uuid;
  update public.privacy_reviews
  set status = 'REVOKED'
  where id = current_setting('test.privacy_a_revoked')::uuid;

  select count(*) into v_document_count from public.ai_documents
  where owner_user_id = '91000000-0000-4000-8000-000000000001';
  select count(*) into v_revision_count from public.ai_document_revisions
  where owner_user_id = '91000000-0000-4000-8000-000000000001';
  select count(*) into v_receipt_count from public.ai_document_mutation_receipts
  where owner_user_id = '91000000-0000-4000-8000-000000000001';
  select count(*) into v_change_count from public.ai_document_sync_changes
  where owner_user_id = '91000000-0000-4000-8000-000000000001';
  execute format(
    'select last_value from %s',
    pg_get_serial_sequence('public.ai_document_sync_changes', 'change_id')
  ) into v_change_sequence_value;

  begin
    insert into public.ai_document_revisions (
      document_id, owner_user_id, revision_number, base_revision_id,
      privacy_review_id, content, content_hash, mutation_id,
      schema_version, contract_version, shadow_only
    ) values (
      (v_create->'document'->>'canonicalId')::uuid,
      '91000000-0000-4000-8000-000000000001',
      2,
      (v_create->'revision'->>'revisionId')::uuid,
      current_setting('test.privacy_a_main')::uuid,
      v_missing_facts,
      public.v1_shadow_content_sha256(v_missing_facts),
      'privacy.direct-revision.invalid.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1', true
    );
    raise exception 'Direct revision trigger accepted invalid Note facts';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.cross-owner.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_b_main')::uuid
    );
    raise exception 'Cross-owner privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_missing_facts,
      public.v1_shadow_content_sha256(v_missing_facts),
      'privacy.document.missing-facts.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Missing required Note facts unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'MINIMUM_FACTS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_pii_key_facts,
      public.v1_shadow_content_sha256(v_pii_key_facts),
      'privacy.document.pii-key.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Unknown PII-shaped facts key unexpectedly created a document';
  exception when raise_exception then
    get stacked diagnostics
      v_error_message = message_text,
      v_error_detail = pg_exception_detail,
      v_error_hint = pg_exception_hint;
    if v_error_message <> 'VALIDATION_ERROR'
      or coalesce(v_error_message, '') like '%participant_name_secret%'
      or coalesce(v_error_detail, '') like '%participant_name_secret%'
      or coalesce(v_error_hint, '') like '%participant_name_secret%'
      or coalesce(v_error_message, '') like '%must-never-echo%'
      or coalesce(v_error_detail, '') like '%must-never-echo%'
      or coalesce(v_error_hint, '') like '%must-never-echo%'
    then
      raise;
    end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.expired.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_expired')::uuid
    );
    raise exception 'Expired privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.wrong-type.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_handover')::uuid
    );
    raise exception 'Wrong Note type privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.wrong-schema.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_schema')::uuid
    );
    raise exception 'Wrong schema privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_changed_facts,
      public.v1_shadow_content_sha256(v_changed_facts),
      'privacy.document.changed-facts.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Changed facts unexpectedly reused a privacy proof';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.revoked.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      current_setting('test.privacy_a_revoked')::uuid
    );
    raise exception 'Revoked privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'privacy.document.random-proof.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '99900000-0000-4000-8000-000000000099'
    );
    raise exception 'Unknown privacy proof unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  if (select count(*) from public.ai_documents
      where owner_user_id = '91000000-0000-4000-8000-000000000001')
      <> v_document_count
    or (select count(*) from public.ai_document_revisions
        where owner_user_id = '91000000-0000-4000-8000-000000000001')
      <> v_revision_count
    or (select count(*) from public.ai_document_mutation_receipts
        where owner_user_id = '91000000-0000-4000-8000-000000000001')
      <> v_receipt_count
    or (select count(*) from public.ai_document_sync_changes
        where owner_user_id = '91000000-0000-4000-8000-000000000001')
      <> v_change_count
  then
    raise exception 'Rejected privacy proof changed canonical mutation state';
  end if;
  execute format(
    'select last_value from %s',
    pg_get_serial_sequence('public.ai_document_sync_changes', 'change_id')
  ) into v_change_sequence_after;
  if v_change_sequence_after is distinct from v_change_sequence_value then
    raise exception 'Rejected privacy proof consumed a sync change identity';
  end if;

  v_revision_count := (
    select count(*) from public.ai_document_revisions
    where owner_user_id = '91000000-0000-4000-8000-000000000001'
  );
  v_change_sequence_value := v_change_sequence_after;

  begin
    perform public.append_v1_shadow_document_revision(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      v_content_second, public.v1_shadow_content_sha256(v_content_second),
      'privacy.revision.expired.0001', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', current_setting('test.privacy_a_expired')::uuid
    );
    raise exception 'Expired privacy proof unexpectedly appended a revision';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  begin
    perform public.append_v1_shadow_document_revision(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      v_pii_key_facts, public.v1_shadow_content_sha256(v_pii_key_facts),
      'privacy.revision.pii-key.0001', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Unknown PII-shaped facts key unexpectedly appended a revision';
  exception when raise_exception then
    if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.append_v1_shadow_document_revision(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      v_changed_facts, public.v1_shadow_content_sha256(v_changed_facts),
      'privacy.revision.changed-facts.0001', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', current_setting('test.privacy_a_main')::uuid
    );
    raise exception 'Changed facts unexpectedly appended with an old proof';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  if (select count(*) from public.ai_document_revisions
      where owner_user_id = '91000000-0000-4000-8000-000000000001')
      <> v_revision_count
  then
    raise exception 'Rejected privacy proof appended a revision side effect';
  end if;
  execute format(
    'select last_value from %s',
    pg_get_serial_sequence('public.ai_document_sync_changes', 'change_id')
  ) into v_change_sequence_after;
  if v_change_sequence_after is distinct from v_change_sequence_value then
    raise exception 'Rejected revision consumed a sync change identity';
  end if;

  v_append := public.append_v1_shadow_document_revision(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_create->'revision'->>'revisionId')::uuid,
    v_content_second, public.v1_shadow_content_sha256(v_content_second),
    'privacy.revision.valid.0001', '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', current_setting('test.privacy_a_main')::uuid
  );
  if (v_append->'revision'->>'revisionNumber')::integer <> 2 then
    raise exception 'Valid privacy proof did not append a revision';
  end if;

  v_checkpoint := public.save_v1_shadow_document_checkpoint(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_append->'revision'->>'revisionId')::uuid,
    'privacy_review', array['observable_facts'],
    'privacy.checkpoint.local-only.0001',
    (v_append->'revision'->>'revisionId')::uuid, null, null
  );
  if v_checkpoint->'checkpoint'->>'privacyReviewId' is not null then
    raise exception 'Pre-privacy checkpoint unexpectedly required a proof';
  end if;

  begin
    perform public.save_v1_shadow_document_checkpoint(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_append->'revision'->>'revisionId')::uuid,
      'privacy_review', array['observable_facts'],
      'privacy.checkpoint.wrong-proof.0001',
      (v_append->'revision'->>'revisionId')::uuid,
      current_setting('test.privacy_a_alternate')::uuid, null
    );
    raise exception 'Checkpoint accepted a proof from another revision';
  exception when raise_exception then
    if sqlerrm <> 'PRIVACY_REVIEW_STALE' then raise; end if;
  end;

  v_checkpoint := public.save_v1_shadow_document_checkpoint(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_append->'revision'->>'revisionId')::uuid,
    'editor', array['observable_facts'],
    'privacy.checkpoint.valid.0001',
    (v_append->'revision'->>'revisionId')::uuid,
    current_setting('test.privacy_a_main')::uuid, null
  );
  if v_checkpoint->'checkpoint'->>'privacyReviewId'
      is distinct from current_setting('test.privacy_a_main') then
    raise exception 'Checkpoint did not retain its active revision proof';
  end if;

  begin
    v_tombstone := public.tombstone_v1_shadow_document(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_append->'revision'->>'revisionId')::uuid,
      'user_deleted', 'privacy.tombstone.no-proof.0001'
    );
  exception when others then
    raise exception 'Tombstone unexpectedly required a privacy proof: %', sqlerrm;
  end;
  if v_tombstone->'document'->>'lifecycleStatus' <> 'TOMBSTONED' then
    raise exception 'Tombstone acknowledgement contract failed';
  end if;
end
$$;

rollback;
