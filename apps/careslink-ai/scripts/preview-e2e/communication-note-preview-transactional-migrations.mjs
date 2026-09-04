import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
  CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import { assertVerifiedPreviewTlsConnection } from
  "./communication-note-preview-runner-terminal-identity.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY as POLICY,
  CommunicationNotePreviewTransactionalMigrationPolicyError,
  loadPinnedCommunicationNotePreviewMigrations,
  validateCommunicationNotePreviewMigrationHistory,
} from "./communication-note-preview-transactional-migrations-policy.mjs";

const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);
const FIXED_ERRORS = new Set([
  "TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID",
  "TRANSACTIONAL_MIGRATION_STDIN_INVALID",
  "TRANSACTIONAL_MIGRATION_CA_INVALID",
  "TRANSACTIONAL_MIGRATION_DRIVER_INVALID",
  "TRANSACTIONAL_MIGRATION_CONNECTION_FAILED",
  "TRANSACTIONAL_MIGRATION_TARGET_INVALID",
  "TRANSACTIONAL_MIGRATION_HISTORY_INVALID",
  "TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID",
  "TRANSACTIONAL_MIGRATION_CONCURRENT_RUN_DENIED",
  "TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED",
  "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED",
  "TRANSACTIONAL_MIGRATION_INTERNAL_FAILED",
]);
const FIXED_PRECONDITION_CHECKPOINTS = new Set([
  "lock_public_tables",
  "lock_strong_system_tables",
  "read_only_system_lock_capability",
  "lock_read_only_system_tables",
  "baseline_history",
  "baseline_public_catalog",
  "baseline_public_members",
  "baseline_schema_less_dependencies",
  "baseline_publications",
  "baseline_event_triggers",
  "baseline_default_acls",
  "baseline_catalog",
  "baseline_catalog_schemas",
  "baseline_catalog_public_tables",
  "baseline_catalog_public_namespace",
  "baseline_catalog_public_placements",
  "baseline_catalog_external_dependencies",
  "baseline_catalog_application_roles",
  "baseline_catalog_system_data",
  "baseline_public_metadata",
  "baseline_public_data",
  "preserved_system_snapshot",
  "preserved_system_semantic_snapshot",
]);
const FIXED_POSTCHECK_CHECKPOINTS = new Set([
  "reset_namespace_and_globals",
  "staged_history",
  "rebuilt_state",
  "application_roles",
  "temporary_residue_or_connection",
  "system_data_precommit",
  "connection_postcommit",
  "committed_history",
]);

const DISPOSABLE_PREVIEW_RESET_ARGUMENT =
  `--authorized-disposable-preview-reset=${POLICY.disposablePreviewBaselineHistorySha256}`;

const BASELINE_HISTORY_FINGERPRINT_SQL = `select
  pg_catalog.count(*)::pg_catalog.int4 as history_count,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'version', version,
              'name', coalesce(name, '')
            )
            order by version
          )::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as history_sha256
from supabase_migrations.schema_migrations`;

const BASELINE_PUBLIC_CATALOG_FINGERPRINT_SQL = `with
public_objects(kind, identity, definition) as (
  select 'schema', namespace.nspname,
    pg_catalog.jsonb_build_object(
      'owner', pg_catalog.pg_get_userbyid(namespace.nspowner),
      'acl', namespace.nspacl::pg_catalog.text,
      'comment', pg_catalog.obj_description(namespace.oid, 'pg_namespace'))
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname = 'public'
  union all
  select 'relation',
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
    pg_catalog.jsonb_build_object(
      'kind', relation.relkind,
      'owner', pg_catalog.pg_get_userbyid(relation.relowner),
      'acl', relation.relacl::pg_catalog.text,
      'persistence', relation.relpersistence,
      'row_security', relation.relrowsecurity,
      'force_row_security', relation.relforcerowsecurity,
      'replica_identity', relation.relreplident,
      'options', relation.reloptions,
      'tablespace', coalesce(tablespace_record.spcname, ''),
      'view_definition', case when relation.relkind in ('v', 'm')
        then pg_catalog.pg_get_viewdef(relation.oid, true) else null end,
      'comment', pg_catalog.obj_description(relation.oid, 'pg_class'))
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_tablespace as tablespace_record
    on tablespace_record.oid = relation.reltablespace
  where namespace.nspname = 'public'
  union all
  select 'column',
    pg_catalog.format('%I.%I.%I#%s', namespace.nspname,
      relation.relname, attribute.attname, attribute.attnum),
    pg_catalog.jsonb_build_object(
      'type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      'not_null', attribute.attnotnull,
      'identity', attribute.attidentity,
      'generated', attribute.attgenerated,
      'collation', coalesce(collation_record.collname, ''),
      'default', pg_catalog.pg_get_expr(
        default_record.adbin, default_record.adrelid, true),
      'acl', attribute.attacl::pg_catalog.text,
      'options', attribute.attoptions,
      'storage', attribute.attstorage,
      'compression', attribute.attcompression,
      'comment', pg_catalog.col_description(relation.oid, attribute.attnum))
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_catalog.pg_attrdef as default_record
    on default_record.adrelid = attribute.attrelid
    and default_record.adnum = attribute.attnum
  left join pg_catalog.pg_collation as collation_record
    on collation_record.oid = attribute.attcollation
    and attribute.attcollation <> 0
  where namespace.nspname = 'public'
    and attribute.attnum > 0 and not attribute.attisdropped
  union all
  select 'constraint',
    pg_catalog.format('%I.%I', namespace.nspname, constraint_record.conname),
    pg_catalog.jsonb_build_object(
      'type', constraint_record.contype,
      'definition', pg_catalog.pg_get_constraintdef(
        constraint_record.oid, true),
      'deferrable', constraint_record.condeferrable,
      'deferred', constraint_record.condeferred,
      'validated', constraint_record.convalidated,
      'no_inherit', constraint_record.connoinherit,
      'comment', pg_catalog.obj_description(
        constraint_record.oid, 'pg_constraint'))
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = constraint_record.connamespace
  where namespace.nspname = 'public'
  union all
  select 'index',
    pg_catalog.format('%I.%I', namespace.nspname, index_relation.relname),
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.pg_get_indexdef(index_record.indexrelid),
      'unique', index_record.indisunique,
      'primary', index_record.indisprimary,
      'exclusion', index_record.indisexclusion,
      'immediate', index_record.indimmediate,
      'valid', index_record.indisvalid,
      'ready', index_record.indisready,
      'live', index_record.indislive,
      'replica_identity', index_record.indisreplident)
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as index_relation
    on index_relation.oid = index_record.indexrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = index_relation.relnamespace
  where namespace.nspname = 'public'
  union all
  select 'sequence',
    pg_catalog.format('%I.%I', namespace.nspname, relation.relname),
    pg_catalog.to_jsonb(sequence_record) - 'seqrelid'
  from pg_catalog.pg_sequence as sequence_record
  join pg_catalog.pg_class as relation
    on relation.oid = sequence_record.seqrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
  union all
  select 'routine',
    pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
      pg_catalog.pg_get_function_identity_arguments(routine.oid)),
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.pg_get_functiondef(routine.oid),
      'result', pg_catalog.pg_get_function_result(routine.oid),
      'owner', pg_catalog.pg_get_userbyid(routine.proowner),
      'acl', routine.proacl::pg_catalog.text,
      'language', language_record.lanname,
      'kind', routine.prokind,
      'security_definer', routine.prosecdef,
      'leakproof', routine.proleakproof,
      'strict', routine.proisstrict,
      'returns_set', routine.proretset,
      'volatility', routine.provolatile,
      'parallel', routine.proparallel,
      'config', routine.proconfig,
      'comment', pg_catalog.obj_description(routine.oid, 'pg_proc'))
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  join pg_catalog.pg_language as language_record
    on language_record.oid = routine.prolang
  where namespace.nspname = 'public'
  union all
  select 'type',
    pg_catalog.format('%I.%I', namespace.nspname, type_record.typname),
    pg_catalog.jsonb_build_object(
      'kind', type_record.typtype,
      'category', type_record.typcategory,
      'preferred', type_record.typispreferred,
      'defined', type_record.typisdefined,
      'delimiter', type_record.typdelim,
      'owner', pg_catalog.pg_get_userbyid(type_record.typowner),
      'acl', type_record.typacl::pg_catalog.text,
      'base_type', case when type_record.typbasetype = 0 then null
        else pg_catalog.format_type(
          type_record.typbasetype, type_record.typtypmod) end,
      'not_null', type_record.typnotnull,
      'default', type_record.typdefault,
      'collation', coalesce(collation_record.collname, ''),
      'enum_labels', (select pg_catalog.jsonb_agg(enum_record.enumlabel
        order by enum_record.enumsortorder)
        from pg_catalog.pg_enum as enum_record
        where enum_record.enumtypid = type_record.oid),
      'comment', pg_catalog.obj_description(type_record.oid, 'pg_type'))
  from pg_catalog.pg_type as type_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = type_record.typnamespace
  left join pg_catalog.pg_collation as collation_record
    on collation_record.oid = type_record.typcollation
    and type_record.typcollation <> 0
  where namespace.nspname = 'public'
  union all
  select 'trigger',
    pg_catalog.format('%I.%I.%I', namespace.nspname,
      relation.relname, trigger_record.tgname),
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.pg_get_triggerdef(trigger_record.oid, true),
      'enabled', trigger_record.tgenabled,
      'internal', trigger_record.tgisinternal,
      'comment', pg_catalog.obj_description(trigger_record.oid, 'pg_trigger'))
  from pg_catalog.pg_trigger as trigger_record
  join pg_catalog.pg_class as relation on relation.oid = trigger_record.tgrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and not trigger_record.tgisinternal
  union all
  select 'policy',
    pg_catalog.format('%I.%I.%I', namespace.nspname,
      relation.relname, policy.polname),
    pg_catalog.jsonb_build_object(
      'permissive', policy.polpermissive,
      'command', policy.polcmd,
      'roles', (select pg_catalog.jsonb_agg(
        pg_catalog.pg_get_userbyid(role_oid)
        order by pg_catalog.pg_get_userbyid(role_oid))
        from pg_catalog.unnest(policy.polroles) as role_oid),
      'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, true),
      'check', pg_catalog.pg_get_expr(
        policy.polwithcheck, policy.polrelid, true))
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
  union all
  select 'rule',
    pg_catalog.format('%I.%I.%I', namespace.nspname,
      relation.relname, rewrite.rulename),
    pg_catalog.jsonb_build_object(
      'definition', pg_catalog.pg_get_ruledef(rewrite.oid, true),
      'enabled', rewrite.ev_enabled,
      'instead', rewrite.is_instead)
  from pg_catalog.pg_rewrite as rewrite
  join pg_catalog.pg_class as relation on relation.oid = rewrite.ev_class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
  union all
  select 'publication_relation',
    pg_catalog.format('%I:%I.%I', publication.pubname,
      namespace.nspname, relation.relname),
    pg_catalog.jsonb_build_object(
      'attributes', publication_relation.prattrs::pg_catalog.text,
      'filter', pg_catalog.pg_get_expr(publication_relation.prqual,
        publication_relation.prrelid, true))
  from pg_catalog.pg_publication_rel as publication_relation
  join pg_catalog.pg_publication as publication
    on publication.oid = publication_relation.prpubid
  join pg_catalog.pg_class as relation
    on relation.oid = publication_relation.prrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
  union all
  select 'default_acl',
    pg_catalog.format('%I:%s:%s',
      pg_catalog.pg_get_userbyid(default_acl.defaclrole),
      namespace.nspname, default_acl.defaclobjtype),
    pg_catalog.to_jsonb(default_acl.defaclacl::pg_catalog.text)
  from pg_catalog.pg_default_acl as default_acl
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = default_acl.defaclnamespace
  where namespace.nspname = 'public'
),
catalog_record_hashes as (
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'kind', kind,
          'identity', identity,
          'definition', definition
        )::pg_catalog.text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as record_sha256
  from public_objects
)
select pg_catalog.count(*)::pg_catalog.int4 as object_count,
  pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(
    pg_catalog.jsonb_agg(record_sha256 order by record_sha256)
      ::pg_catalog.text, '[]'),
    'UTF8'), 'sha256'), 'hex') as catalog_sha256
from catalog_record_hashes`;

const BASELINE_PUBLIC_SCHEMA_MEMBER_FINGERPRINT_SQL = `with
public_schema as (
  select namespace.oid
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname = 'public'
),
schema_members as (
  select
    dependency.classid::pg_catalog.regclass::pg_catalog.text as catalog_name,
    identified.type,
    identified.schema,
    identified.name,
    identified.identity
  from pg_catalog.pg_depend as dependency
  cross join public_schema
  cross join lateral pg_catalog.pg_identify_object(
    dependency.classid,
    dependency.objid,
    dependency.objsubid
  ) as identified
  where dependency.refclassid =
      'pg_catalog.pg_namespace'::pg_catalog.regclass
    and dependency.refobjid = public_schema.oid
)
select
  pg_catalog.count(*)::pg_catalog.int4 as member_count,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'catalog', catalog_name,
              'type', type,
              'schema', schema,
              'name', name,
              'identity', identity
            )
            order by catalog_name, type, identity
          )::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as members_sha256
from schema_members`;

const BASELINE_SCHEMA_LESS_DEPENDENCY_FINGERPRINT_SQL = `with
schema_less_dependents as (
  select
    dependency.deptype,
    dependency.classid::pg_catalog.regclass::pg_catalog.text
      as dependent_catalog,
    dependent.type as dependent_type,
    dependent.schema as dependent_schema,
    dependent.name as dependent_name,
    dependent.identity as dependent_identity,
    dependency.refclassid::pg_catalog.regclass::pg_catalog.text
      as referenced_catalog,
    referenced.type as referenced_type,
    referenced.schema as referenced_schema,
    referenced.name as referenced_name,
    referenced.identity as referenced_identity,
    case
      when dependency.classid =
          'pg_catalog.pg_attrdef'::pg_catalog.regclass
        and dependency.deptype = 'a'
        and dependent.type = 'default value'
        and referenced.type = 'table column'
        and exists (
          select 1
          from pg_catalog.pg_attrdef as default_record
          join pg_catalog.pg_class as relation
            on relation.oid = default_record.adrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where default_record.oid = dependency.objid
            and namespace.nspname = 'public'
        )
      then true
      when dependency.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency.deptype in ('a', 'n')
        and dependent.type = 'policy'
        and referenced.type in ('table', 'table column')
        and exists (
          select 1
          from pg_catalog.pg_policy as policy
          join pg_catalog.pg_class as relation
            on relation.oid = policy.polrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where policy.oid = dependency.objid
            and namespace.nspname = 'public'
        )
      then true
      when dependency.classid =
          'pg_catalog.pg_trigger'::pg_catalog.regclass
        and dependency.deptype = 'i'
        and dependent.type = 'trigger'
        and referenced.type = 'table constraint'
        and exists (
          select 1
          from pg_catalog.pg_trigger as trigger_record
          join pg_catalog.pg_constraint as constraint_record
            on constraint_record.oid = trigger_record.tgconstraint
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = constraint_record.connamespace
          where trigger_record.oid = dependency.objid
            and trigger_record.tgisinternal
            and constraint_record.contype = 'f'
            and namespace.nspname = 'public'
        )
      then true
      else false
    end as application_internal
  from pg_catalog.pg_depend as dependency
  cross join lateral pg_catalog.pg_identify_object(
    dependency.classid,
    dependency.objid,
    dependency.objsubid
  ) as dependent
  cross join lateral pg_catalog.pg_identify_object(
    dependency.refclassid,
    dependency.refobjid,
    dependency.refobjsubid
  ) as referenced
  where referenced.schema = 'public'
    and dependent.schema is null
),
dependency_record_hashes as (
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        (
          pg_catalog.to_jsonb(schema_less_dependents)
            - 'application_internal' - 'dependent_identity' ||
          pg_catalog.jsonb_build_object(
            'dependent_identity', case
              when dependent_catalog = 'pg_trigger' then
                pg_catalog.regexp_replace(
                  dependent_identity,
                  'RI_ConstraintTrigger_[ac]_[0-9]*',
                  'RI_ConstraintTrigger_generated',
                  'g'
                )
              else dependent_identity
            end
          )
        )::pg_catalog.text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as record_sha256
  from schema_less_dependents
)
select
  (select pg_catalog.count(*)::pg_catalog.int4
   from schema_less_dependents) as dependency_count,
  (select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(record_sha256 order by record_sha256)
            ::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) from dependency_record_hashes) as dependencies_sha256,
  coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'catalog', dependency_class.dependent_catalog,
        'type', dependency_class.dependent_type,
        'dependencyType', dependency_class.deptype,
        'count', dependency_class.dependency_count
      )
      order by dependency_class.dependent_catalog,
        dependency_class.dependent_type,
        dependency_class.deptype
    )
    from (
      select dependent_catalog, dependent_type, deptype,
        pg_catalog.count(*)::pg_catalog.int4 as dependency_count
      from schema_less_dependents
      group by dependent_catalog, dependent_type, deptype
    ) as dependency_class
  ), '[]'::pg_catalog.jsonb) as dependency_classes,
  coalesce((
    select pg_catalog.bool_and(application_internal)
    from schema_less_dependents
  ), false) as application_internal_only`;

const GLOBAL_PUBLICATION_FINGERPRINT_SQL = `with
publication_records as (
  select publication.pubname,
    pg_catalog.pg_get_userbyid(publication.pubowner) as owner_name,
    pg_catalog.to_jsonb(publication) - 'oid' - 'pubowner' as definition
  from pg_catalog.pg_publication as publication
),
publication_namespace_records as (
  select publication.pubname, namespace.nspname
  from pg_catalog.pg_publication_namespace as publication_namespace
  join pg_catalog.pg_publication as publication
    on publication.oid = publication_namespace.pnpubid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = publication_namespace.pnnspid
)
select
  (select pg_catalog.count(*)::pg_catalog.int4
   from publication_records) as publication_count,
  (select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', pubname,
            'owner', owner_name,
            'definition', definition
          ) order by pubname
        )::pg_catalog.text,
        '[]'
      ), 'UTF8'),
      'sha256'
    ), 'hex')
   from publication_records) as publications_sha256,
  (select pg_catalog.count(*)::pg_catalog.int4
   from publication_namespace_records) as namespace_membership_count,
  (select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'publication', pubname,
            'schema', nspname
          ) order by pubname, nspname
        )::pg_catalog.text,
        '[]'
      ), 'UTF8'),
      'sha256'
    ), 'hex')
   from publication_namespace_records) as namespace_memberships_sha256`;

const GLOBAL_EVENT_TRIGGER_FINGERPRINT_SQL = `select
  pg_catalog.count(*)::pg_catalog.int4 as event_trigger_count,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', event_trigger.evtname,
              'event', event_trigger.evtevent,
              'enabled', event_trigger.evtenabled,
              'tags', event_trigger.evttags,
              'owner', pg_catalog.pg_get_userbyid(routine.proowner),
              'handler', pg_catalog.format(
                '%I.%I(%s)',
                namespace.nspname,
                routine.proname,
                pg_catalog.pg_get_function_identity_arguments(routine.oid)
              )
            ) order by event_trigger.evtname
          )::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as event_triggers_sha256
from pg_catalog.pg_event_trigger as event_trigger
join pg_catalog.pg_proc as routine
  on routine.oid = event_trigger.evtfoid
join pg_catalog.pg_namespace as namespace
  on namespace.oid = routine.pronamespace`;

const PUBLIC_DEFAULT_ACL_FINGERPRINT_SQL = `select
  pg_catalog.count(*)::pg_catalog.int4 as default_acl_count,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'owner', pg_catalog.pg_get_userbyid(default_acl.defaclrole),
              'object_type', default_acl.defaclobjtype,
              'acl', default_acl.defaclacl::pg_catalog.text
            )
            order by pg_catalog.pg_get_userbyid(default_acl.defaclrole),
              default_acl.defaclobjtype
          )::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as default_acls_sha256
from pg_catalog.pg_default_acl as default_acl
join pg_catalog.pg_namespace as namespace
  on namespace.oid = default_acl.defaclnamespace
where namespace.nspname = 'public'`;

const BASELINE_CATALOG_SQL = `select
  coalesce((
    select pg_catalog.array_agg(
      namespace.nspname::pg_catalog.text order by namespace.nspname)
    from pg_catalog.pg_namespace as namespace
    where pg_catalog.left(namespace.nspname, 3) <> 'pg_'
      and namespace.nspname <> 'information_schema'
  ), array[]::pg_catalog.text[]) as schema_names,
  coalesce((
    select pg_catalog.array_agg(
      relation.relname::pg_catalog.text order by relation.relname)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  ), array[]::pg_catalog.text[]) as public_tables,
  (
    select namespace.oid::pg_catalog.text
    from pg_catalog.pg_namespace as namespace
    where namespace.nspname = 'public'
  ) as public_oid,
  (
    select pg_catalog.pg_get_userbyid(namespace.nspowner)
    from pg_catalog.pg_namespace as namespace
    where namespace.nspname = 'public'
  ) as public_owner,
  (
    select namespace.nspacl::pg_catalog.text
    from pg_catalog.pg_namespace as namespace
    where namespace.nspname = 'public'
  ) as public_acl,
  (
    select pg_catalog.obj_description(namespace.oid, 'pg_namespace')
    from pg_catalog.pg_namespace as namespace
    where namespace.nspname = 'public'
  ) as public_comment,
  not exists (
    select 1
    from pg_catalog.pg_extension as extension_record
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = extension_record.extnamespace
    where namespace.nspname = 'public'
  ) as public_extensions_absent,
  not exists (
    select 1
    from pg_catalog.pg_publication_rel as publication_relation
    join pg_catalog.pg_class as relation
      on relation.oid = publication_relation.prrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  ) as public_publications_absent,
  not exists (
    select 1
    from pg_catalog.pg_depend as dependency
    cross join lateral pg_catalog.pg_identify_object(
      dependency.classid, dependency.objid, dependency.objsubid
    ) as dependent
    cross join lateral pg_catalog.pg_identify_object(
      dependency.refclassid,
      dependency.refobjid,
      dependency.refobjsubid
    ) as referenced
    where referenced.schema = 'public'
      and not (
        dependent.schema = 'public'
        or dependent.schema is null
        or (
          dependent.schema = 'pg_toast'
          and dependency.classid =
            'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype = 'i'
          and exists (
            select 1
            from pg_catalog.pg_class as public_relation
            join pg_catalog.pg_namespace as public_namespace
              on public_namespace.oid = public_relation.relnamespace
            where public_relation.reltoastrelid = dependency.objid
              and public_namespace.nspname = 'public'
          )
        )
      )
  ) as external_dependencies_absent,
  not exists (
    select 1 from pg_catalog.pg_roles as role_record
    where role_record.rolname like 'careslink_%'
  ) as application_roles_absent,
  (select pg_catalog.count(*) = 0 from auth.users) as auth_users_empty,
  (select pg_catalog.count(*) = 0 from auth.identities) as auth_identities_empty,
  (select pg_catalog.count(*) = 0 from auth.sessions) as auth_sessions_empty,
  (select pg_catalog.count(*) = 0 from auth.refresh_tokens)
    as auth_refresh_tokens_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_factors)
    as auth_mfa_factors_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_challenges)
    as auth_mfa_challenges_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_amr_claims)
    as auth_mfa_amr_claims_empty,
  (select pg_catalog.count(*) = 0 from storage.buckets) as storage_buckets_empty,
  (select pg_catalog.count(*) = 0 from storage.objects) as storage_objects_empty,
  (select pg_catalog.count(*) = 0 from storage.s3_multipart_uploads)
    as storage_multipart_uploads_empty,
  (select pg_catalog.count(*) = 0 from storage.s3_multipart_uploads_parts)
    as storage_multipart_parts_empty,
  (select pg_catalog.count(*) = 0 from storage.vector_indexes)
    as storage_vector_indexes_empty,
  (select pg_catalog.count(*) = 0 from vault.secrets) as vault_secrets_empty`;

const LOCK_PUBLIC_TABLES_SQL = `lock table
  ${POLICY.disposablePreviewBaselinePublicTables
    .map((tableName) => `public.${tableName}`)
    .join(",\n  ")}
in access exclusive mode`;

const DROP_BASELINE_PUBLIC_ROUTINES_SQL = `drop function
  ${POLICY.disposablePreviewBaselinePublicRoutines.join(",\n  ")}
cascade`;

const DROP_BASELINE_PUBLIC_TABLES_SQL = `drop table
  ${POLICY.disposablePreviewBaselinePublicTables
    .map((tableName) => `public.${tableName}`)
    .join(",\n  ")}
cascade`;

const PUBLIC_NAMESPACE_CLEARED_SQL = `with
public_schema as (
  select namespace.oid
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname = 'public'
),
schema_members as (
  select dependency.classid
  from pg_catalog.pg_depend as dependency
  cross join public_schema
  where dependency.refclassid =
      'pg_catalog.pg_namespace'::pg_catalog.regclass
    and dependency.refobjid = public_schema.oid
)
select
  pg_catalog.count(*)::pg_catalog.int4 as remaining_member_count,
  pg_catalog.count(*) filter (
    where classid = 'pg_catalog.pg_default_acl'::pg_catalog.regclass
  )::pg_catalog.int4 as remaining_default_acl_count,
  pg_catalog.count(*) filter (
    where classid <>
      'pg_catalog.pg_default_acl'::pg_catalog.regclass
  )::pg_catalog.int4 as unexpected_member_count
from schema_members`;

const ASSERT_EMPTY_PUBLIC_TABLES_SQL = `do $careslink_reset$
declare
  relation_record pg_catalog.record;
  relation_has_rows pg_catalog.bool;
begin
  for relation_record in
    select relation.relname
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
    order by relation.relname
  loop
    execute pg_catalog.format(
      'select exists (select 1 from public.%I limit 1)',
      relation_record.relname
    ) into relation_has_rows;
    if relation_has_rows then
      raise exception using
        errcode = 'P0001',
        message = 'DISPOSABLE_PREVIEW_APPLICATION_DATA_PRESENT';
    end if;
  end loop;
end
$careslink_reset$`;

const LOCK_STRONGLY_PROTECTED_SYSTEM_DATA_TABLES_SQL = `lock table
  auth.users,
  auth.identities,
  auth.sessions,
  auth.refresh_tokens,
  auth.mfa_factors,
  auth.mfa_challenges,
  auth.mfa_amr_claims,
  storage.buckets,
  storage.objects,
  storage.s3_multipart_uploads,
  storage.s3_multipart_uploads_parts,
  vault.secrets
in share mode`;

const READ_ONLY_SYSTEM_DATA_LOCK_CAPABILITY_SQL = `select
  relation.relkind,
  pg_catalog.pg_get_userbyid(relation.relowner) as owner,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'SELECT') as can_select,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'INSERT') as can_insert,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'UPDATE') as can_update,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'DELETE') as can_delete,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'TRUNCATE') as can_truncate,
  pg_catalog.has_table_privilege(
    current_user, relation.oid, 'MAINTAIN') as can_maintain,
  pg_catalog.pg_has_role(
    session_user, relation.relowner, 'SET') as owner_role_settable
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'storage'
  and relation.relname = 'vector_indexes'`;

// Supabase's managed `postgres` role has SELECT, but no MAINTAIN or write
// privilege, on storage.vector_indexes. PostgreSQL therefore permits only an
// ACCESS SHARE explicit lock for that table. The zero-data predicate is still
// checked both after this lock and immediately before commit; the harness never
// mutates any protected system-data table.
const LOCK_READ_ONLY_SYSTEM_DATA_TABLES_SQL = `lock table
  storage.vector_indexes
in access share mode`;

const PRESERVED_SYSTEM_SNAPSHOT_SQL = `select
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', namespace.nspname,
              'oid', namespace.oid::pg_catalog.text,
              'owner', pg_catalog.pg_get_userbyid(namespace.nspowner)
            )
            order by namespace.nspname
          )
          from pg_catalog.pg_namespace as namespace
          where namespace.nspname = any($1::pg_catalog.text[])
        )::pg_catalog.text, '[]'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as schemas_sha256,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', extension_record.extname,
              'schema', namespace.nspname,
              'version', extension_record.extversion,
              'owner', pg_catalog.pg_get_userbyid(extension_record.extowner)
            )
            order by extension_record.extname
          )
          from pg_catalog.pg_extension as extension_record
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = extension_record.extnamespace
        )::pg_catalog.text, '[]'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as extensions_sha256,
  (
    with protected_objects(kind, object_oid, identity) as (
      select 'schema', namespace.oid,
        namespace.nspname
      from pg_catalog.pg_namespace as namespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'relation', relation.oid,
        pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'routine', routine.oid,
        pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
          pg_catalog.pg_get_function_identity_arguments(routine.oid))
      from pg_catalog.pg_proc as routine
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'type', type_record.oid,
        pg_catalog.format('%I.%I', namespace.nspname, type_record.typname)
      from pg_catalog.pg_type as type_record
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = type_record.typnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'constraint', constraint_record.oid,
        pg_catalog.format('%I.%I', namespace.nspname,
          constraint_record.conname)
      from pg_catalog.pg_constraint as constraint_record
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = constraint_record.connamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'trigger', trigger_record.oid,
        pg_catalog.format('%I.%I.%I', namespace.nspname,
          relation.relname, trigger_record.tgname)
      from pg_catalog.pg_trigger as trigger_record
      join pg_catalog.pg_class as relation
        on relation.oid = trigger_record.tgrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
        and not exists (
          select 1
          from pg_catalog.pg_constraint as application_constraint
          join pg_catalog.pg_class as application_relation
            on application_relation.oid = application_constraint.conrelid
          join pg_catalog.pg_namespace as application_namespace
            on application_namespace.oid =
              application_relation.relnamespace
          where application_constraint.oid = trigger_record.tgconstraint
            and trigger_record.tgisinternal
            and application_constraint.contype = 'f'
            and application_namespace.nspname =
              any($2::pg_catalog.text[])
        )
      union all
      select 'policy', policy.oid,
        pg_catalog.format('%I.%I.%I', namespace.nspname,
          relation.relname, policy.polname)
      from pg_catalog.pg_policy as policy
      join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'rule', rewrite.oid,
        pg_catalog.format('%I.%I.%I', namespace.nspname,
          relation.relname, rewrite.rulename)
      from pg_catalog.pg_rewrite as rewrite
      join pg_catalog.pg_class as relation on relation.oid = rewrite.ev_class
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'attribute_default', default_record.oid,
        pg_catalog.format('%I.%I.%s', namespace.nspname,
          relation.relname, default_record.adnum)
      from pg_catalog.pg_attrdef as default_record
      join pg_catalog.pg_class as relation
        on relation.oid = default_record.adrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
      union all
      select 'publication_relation', publication_relation.oid,
        pg_catalog.format('%I:%I.%I', publication.pubname,
          namespace.nspname, relation.relname)
      from pg_catalog.pg_publication_rel as publication_relation
      join pg_catalog.pg_publication as publication
        on publication.oid = publication_relation.prpubid
      join pg_catalog.pg_class as relation
        on relation.oid = publication_relation.prrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = any($1::pg_catalog.text[])
    )
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', kind,
        'oid', object_oid::pg_catalog.text,
        'identity', identity
      ) order by kind, object_oid)::pg_catalog.text, '[]'),
      'UTF8'), 'sha256'), 'hex')
    from protected_objects
  ) as protected_objects_sha256,
  (
    with system_security_records(kind, identity, definition) as (
      select 'role', role_record.rolname,
        pg_catalog.jsonb_build_object(
          'oid', role_record.oid::pg_catalog.text,
          'superuser', role_record.rolsuper,
          'inherit', role_record.rolinherit,
          'create_role', role_record.rolcreaterole,
          'create_db', role_record.rolcreatedb,
          'login', role_record.rolcanlogin,
          'replication', role_record.rolreplication,
          'connection_limit', role_record.rolconnlimit,
          'bypass_rls', role_record.rolbypassrls,
          'config', role_record.rolconfig
        )
      from pg_catalog.pg_roles as role_record
      where role_record.rolname not like 'careslink_%'
      union all
      select 'membership',
        pg_catalog.format('%s:%s:%s', membership.roleid,
          membership.member, membership.grantor),
        pg_catalog.jsonb_build_object(
          'admin', membership.admin_option,
          'inherit', coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
            false),
          'set', coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
            false)
        )
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      where granted_role.rolname not like 'careslink_%'
        and member_role.rolname not like 'careslink_%'
    )
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', kind,
        'identity', identity,
        'definition', definition
      ) order by kind, identity)::pg_catalog.text, '[]'),
      'UTF8'), 'sha256'), 'hex')
    from system_security_records
  ) as system_security_sha256`;

const APPLICATION_ROLE_POSTCHECK_SQL = `select
  role_record.rolname,
  not role_record.rolsuper
    and not role_record.rolinherit
    and not role_record.rolcreaterole
    and not role_record.rolcreatedb
    and not role_record.rolcanlogin
    and not role_record.rolreplication
    and role_record.rolconnlimit = -1
    and not role_record.rolbypassrls as attributes_safe,
  pg_catalog.count(membership.*)::pg_catalog.int4 = 1 as one_membership,
  not exists (
    select 1
    from pg_catalog.pg_auth_members as reverse_membership
    where reverse_membership.member = role_record.oid
  ) as no_member_edges,
  pg_catalog.bool_and(
    membership.member = current_user::pg_catalog.regrole
      and membership.admin_option
      and not coalesce(
        (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
        false)
      and not coalesce(
        (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
        false)
      and grantor_role.rolsuper
  ) as bootstrap_edge_safe
from pg_catalog.pg_roles as role_record
left join pg_catalog.pg_auth_members as membership
  on membership.roleid = role_record.oid
left join pg_catalog.pg_roles as grantor_role
  on grantor_role.oid = membership.grantor
where role_record.rolname like 'careslink_%'
group by role_record.oid, role_record.rolname,
  role_record.rolsuper, role_record.rolinherit,
  role_record.rolcreaterole, role_record.rolcreatedb,
  role_record.rolcanlogin, role_record.rolreplication,
  role_record.rolconnlimit, role_record.rolbypassrls
order by role_record.rolname`;

const PUBLIC_SCHEMA_METADATA_SQL = `select
  namespace.oid::pg_catalog.text as public_oid,
  pg_catalog.pg_get_userbyid(namespace.nspowner) as public_owner,
  pg_catalog.obj_description(namespace.oid, 'pg_namespace')
    as public_comment,
  (
    select pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
                'grantee', case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                'privilege', acl.privilege_type,
                'grantable', acl.is_grantable
              )
              order by pg_catalog.pg_get_userbyid(acl.grantor),
                case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                acl.privilege_type, acl.is_grantable
            )::pg_catalog.text,
            '[]'
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from pg_catalog.aclexplode(namespace.nspacl) as acl
    where acl.grantee = 0
      or pg_catalog.pg_get_userbyid(acl.grantee) <>
        all($1::pg_catalog.text[])
  ) as non_application_acl_sha256,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.aclexplode(namespace.nspacl) as acl
    join pg_catalog.pg_roles as grantee_role
      on grantee_role.oid = acl.grantee
    where grantee_role.rolname = any($1::pg_catalog.text[])
  ) as application_acl_count
from pg_catalog.pg_namespace as namespace
where namespace.nspname = 'public'`;

const PROTECTED_APPLICATION_ACL_GRANTS_SQL = `with
application_acl_grants(
  kind, identity, grantee, privilege, grantable, grantor
) as (
  select 'schema', namespace.nspname, grantee_role.rolname,
    acl.privilege_type, acl.is_grantable, grantor_role.rolname
  from pg_catalog.pg_namespace as namespace
  cross join lateral pg_catalog.aclexplode(namespace.nspacl) as acl
  join pg_catalog.pg_roles as grantee_role
    on grantee_role.oid = acl.grantee
  join pg_catalog.pg_roles as grantor_role
    on grantor_role.oid = acl.grantor
  where grantee_role.rolname = any($1::pg_catalog.text[])
    and namespace.nspname = any($2::pg_catalog.text[])
  union all
  select 'function',
    pg_catalog.format('%I.%I(%s)', namespace.nspname, routine.proname,
      pg_catalog.pg_get_function_identity_arguments(routine.oid)),
    grantee_role.rolname, acl.privilege_type,
    acl.is_grantable, grantor_role.rolname
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  cross join lateral pg_catalog.aclexplode(routine.proacl) as acl
  join pg_catalog.pg_roles as grantee_role
    on grantee_role.oid = acl.grantee
  join pg_catalog.pg_roles as grantor_role
    on grantor_role.oid = acl.grantor
  where grantee_role.rolname = any($1::pg_catalog.text[])
    and namespace.nspname = any($3::pg_catalog.text[])
)
select
  pg_catalog.count(*)::pg_catalog.int4 as grant_count,
  coalesce(
    pg_catalog.array_agg(
      pg_catalog.concat_ws(
        '|', kind, identity, grantee, privilege,
        case when grantable then 'grantable' else 'plain' end,
        grantor
      )
      order by kind, identity, grantee, privilege
    ),
    array[]::pg_catalog.text[]
  ) as grants
from application_acl_grants`;

const PRESERVED_SYSTEM_SEMANTIC_SNAPSHOT_SQL = `with
protected_records(kind, identity, definition) as (
  select 'schema', namespace.oid::pg_catalog.text,
    case
      when namespace.nspname = 'extensions' then
        pg_catalog.to_jsonb(namespace) - 'nspacl' ||
        pg_catalog.jsonb_build_object(
          'nspacl', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
                'grantee', case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                'privilege', acl.privilege_type,
                'grantable', acl.is_grantable
              )
              order by pg_catalog.pg_get_userbyid(acl.grantor),
                case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                acl.privilege_type, acl.is_grantable
            )
            from pg_catalog.aclexplode(namespace.nspacl) as acl
            where acl.grantee = 0
              or pg_catalog.pg_get_userbyid(acl.grantee) <>
                all($3::pg_catalog.text[])
          ), '[]'::pg_catalog.jsonb)
        )
      else pg_catalog.to_jsonb(namespace)
    end
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'relation', relation.oid::pg_catalog.text,
    pg_catalog.to_jsonb(relation)
      - 'relfilenode' - 'relpages' - 'reltuples'
      - 'relallvisible' - 'relallfrozen'
      - 'relfrozenxid' - 'relminmxid'
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'column',
    pg_catalog.format('%s:%s', attribute.attrelid, attribute.attnum),
    pg_catalog.to_jsonb(attribute)
  from pg_catalog.pg_attribute as attribute
  join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'attribute_default', default_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(default_record)
  from pg_catalog.pg_attrdef as default_record
  join pg_catalog.pg_class as relation on relation.oid = default_record.adrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'constraint', constraint_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(constraint_record)
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = constraint_record.connamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'index', index_record.indexrelid::pg_catalog.text,
    pg_catalog.to_jsonb(index_record)
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as relation
    on relation.oid = index_record.indexrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'sequence', sequence_record.seqrelid::pg_catalog.text,
    pg_catalog.to_jsonb(sequence_record)
  from pg_catalog.pg_sequence as sequence_record
  join pg_catalog.pg_class as relation
    on relation.oid = sequence_record.seqrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'routine', routine.oid::pg_catalog.text,
    case
      when namespace.nspname = 'extensions' then
        pg_catalog.to_jsonb(routine) - 'proacl' ||
        pg_catalog.jsonb_build_object(
          'proacl', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
                'grantee', case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                'privilege', acl.privilege_type,
                'grantable', acl.is_grantable
              )
              order by pg_catalog.pg_get_userbyid(acl.grantor),
                case when acl.grantee = 0 then 'PUBLIC'
                  else pg_catalog.pg_get_userbyid(acl.grantee) end,
                acl.privilege_type, acl.is_grantable
            )
            from pg_catalog.aclexplode(routine.proacl) as acl
            where acl.grantee = 0
              or pg_catalog.pg_get_userbyid(acl.grantee) <>
                all($3::pg_catalog.text[])
          ), '[]'::pg_catalog.jsonb)
        )
      else pg_catalog.to_jsonb(routine)
    end
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'aggregate', aggregate_record.aggfnoid::pg_catalog.text,
    pg_catalog.to_jsonb(aggregate_record)
  from pg_catalog.pg_aggregate as aggregate_record
  join pg_catalog.pg_proc as routine
    on routine.oid = aggregate_record.aggfnoid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'type', type_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(type_record)
  from pg_catalog.pg_type as type_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = type_record.typnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'collation', collation_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(collation_record)
  from pg_catalog.pg_collation as collation_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = collation_record.collnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'conversion', conversion_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(conversion_record)
  from pg_catalog.pg_conversion as conversion_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = conversion_record.connamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'operator', operator_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(operator_record)
  from pg_catalog.pg_operator as operator_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = operator_record.oprnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'operator_class', operator_class.oid::pg_catalog.text,
    pg_catalog.to_jsonb(operator_class)
  from pg_catalog.pg_opclass as operator_class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = operator_class.opcnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'operator_family', operator_family.oid::pg_catalog.text,
    pg_catalog.to_jsonb(operator_family)
  from pg_catalog.pg_opfamily as operator_family
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = operator_family.opfnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'extended_statistics', statistic_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(statistic_record)
  from pg_catalog.pg_statistic_ext as statistic_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = statistic_record.stxnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'text_search_config', config_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(config_record)
  from pg_catalog.pg_ts_config as config_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = config_record.cfgnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'text_search_dictionary', dictionary_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(dictionary_record)
  from pg_catalog.pg_ts_dict as dictionary_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = dictionary_record.dictnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'text_search_parser', parser_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(parser_record)
  from pg_catalog.pg_ts_parser as parser_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = parser_record.prsnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'text_search_template', template_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(template_record)
  from pg_catalog.pg_ts_template as template_record
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = template_record.tmplnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'trigger', trigger_record.oid::pg_catalog.text,
    pg_catalog.to_jsonb(trigger_record)
  from pg_catalog.pg_trigger as trigger_record
  join pg_catalog.pg_class as relation on relation.oid = trigger_record.tgrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
    and not exists (
      select 1
      from pg_catalog.pg_constraint as application_constraint
      join pg_catalog.pg_class as application_relation
        on application_relation.oid = application_constraint.conrelid
      join pg_catalog.pg_namespace as application_namespace
        on application_namespace.oid = application_relation.relnamespace
      where application_constraint.oid = trigger_record.tgconstraint
        and trigger_record.tgisinternal
        and application_constraint.contype = 'f'
        and application_namespace.nspname = any($2::pg_catalog.text[])
    )
  union all
  select 'policy', policy.oid::pg_catalog.text,
    pg_catalog.to_jsonb(policy)
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'rewrite_rule', rewrite.oid::pg_catalog.text,
    pg_catalog.to_jsonb(rewrite)
  from pg_catalog.pg_rewrite as rewrite
  join pg_catalog.pg_class as relation on relation.oid = rewrite.ev_class
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'foreign_table', foreign_table.ftrelid::pg_catalog.text,
    pg_catalog.to_jsonb(foreign_table)
  from pg_catalog.pg_foreign_table as foreign_table
  join pg_catalog.pg_class as relation on relation.oid = foreign_table.ftrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'default_acl',
    pg_catalog.format('%s:%s:%s', default_acl.defaclrole,
      default_acl.defaclnamespace, default_acl.defaclobjtype),
    pg_catalog.to_jsonb(default_acl)
  from pg_catalog.pg_default_acl as default_acl
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = default_acl.defaclnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'publication_relation', publication_relation.oid::pg_catalog.text,
    pg_catalog.to_jsonb(publication_relation)
  from pg_catalog.pg_publication_rel as publication_relation
  join pg_catalog.pg_class as relation
    on relation.oid = publication_relation.prrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = any($1::pg_catalog.text[])
  union all
  select 'description',
    pg_catalog.format('%s:%s:%s', description.classoid,
      description.objoid, description.objsubid),
    pg_catalog.to_jsonb(description)
  from pg_catalog.pg_description as description
  cross join lateral pg_catalog.pg_identify_object(
    description.classoid, description.objoid, description.objsubid
  ) as identified
  where identified.schema = any($1::pg_catalog.text[])
  union all
  select 'security_label',
    pg_catalog.format('%s:%s:%s:%s', security_label.classoid,
      security_label.objoid, security_label.objsubid,
      security_label.provider),
    pg_catalog.to_jsonb(security_label)
  from pg_catalog.pg_seclabel as security_label
  cross join lateral pg_catalog.pg_identify_object(
    security_label.classoid,
    security_label.objoid,
    security_label.objsubid
  ) as identified
  where identified.schema = any($1::pg_catalog.text[])
)
select
  pg_catalog.count(*)::pg_catalog.int4 as record_count,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'kind', kind,
              'identity', identity,
              'definition', definition
            )
            order by kind, identity
          )::pg_catalog.text,
          '[]'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as semantic_sha256
from protected_records`;

const SYSTEM_DATA_EMPTY_SQL = `select
  (select pg_catalog.count(*) = 0 from auth.users) as auth_users_empty,
  (select pg_catalog.count(*) = 0 from auth.identities) as auth_identities_empty,
  (select pg_catalog.count(*) = 0 from auth.sessions) as auth_sessions_empty,
  (select pg_catalog.count(*) = 0 from auth.refresh_tokens)
    as auth_refresh_tokens_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_factors)
    as auth_mfa_factors_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_challenges)
    as auth_mfa_challenges_empty,
  (select pg_catalog.count(*) = 0 from auth.mfa_amr_claims)
    as auth_mfa_amr_claims_empty,
  (select pg_catalog.count(*) = 0 from storage.buckets) as storage_buckets_empty,
  (select pg_catalog.count(*) = 0 from storage.objects) as storage_objects_empty,
  (select pg_catalog.count(*) = 0 from storage.s3_multipart_uploads)
    as storage_multipart_uploads_empty,
  (select pg_catalog.count(*) = 0 from storage.s3_multipart_uploads_parts)
    as storage_multipart_parts_empty,
  (select pg_catalog.count(*) = 0 from storage.vector_indexes)
    as storage_vector_indexes_empty,
  (select pg_catalog.count(*) = 0 from vault.secrets) as vault_secrets_empty`;

const NON_SYSTEM_SCHEMA_NAMES_SQL = `select coalesce(
  pg_catalog.array_agg(
    namespace.nspname::pg_catalog.text order by namespace.nspname),
  array[]::pg_catalog.text[]
) as schema_names
from pg_catalog.pg_namespace as namespace
where pg_catalog.left(namespace.nspname, 3) <> 'pg_'
  and namespace.nspname <> 'information_schema'`;

class CommunicationNotePreviewTransactionalMigrationError extends Error {
  constructor(code, checkpoint) {
    const fixed = FIXED_ERRORS.has(code)
      ? code
      : "TRANSACTIONAL_MIGRATION_INTERNAL_FAILED";
    super(fixed);
    this.name = "CommunicationNotePreviewTransactionalMigrationError";
    this.code = fixed;
    if (isFixedCheckpoint(fixed, checkpoint)) {
      this.checkpoint = checkpoint;
    }
  }
}

function isFixedCheckpoint(code, checkpoint) {
  return typeof checkpoint === "string" && (
    (
      code === "TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID" &&
      FIXED_PRECONDITION_CHECKPOINTS.has(checkpoint)
    ) || (
      code === "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED" &&
      FIXED_POSTCHECK_CHECKPOINTS.has(checkpoint)
    )
  );
}

function fail(code, checkpoint) {
  throw new CommunicationNotePreviewTransactionalMigrationError(
    code,
    checkpoint,
  );
}

export function parseTransactionalMigrationArguments(argv) {
  if (!Array.isArray(argv)) {
    fail("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
  }
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (
    normalized.length !== 5 ||
    normalized.filter((argument) =>
      argument === DISPOSABLE_PREVIEW_RESET_ARGUMENT
    ).length !== 1
  ) {
    fail("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
  }
  const identityArguments = normalized.filter((argument) =>
    argument !== DISPOSABLE_PREVIEW_RESET_ARGUMENT
  );
  const identity = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
    identityArguments,
  );
  return Object.freeze({
    ...identity,
    resetAuthorizationSha256:
      POLICY.disposablePreviewBaselineHistorySha256,
  });
}

async function assertDisposablePreviewResetPreconditions(client) {
  let checkpoint = "lock_public_tables";
  try {
    await client.query(LOCK_PUBLIC_TABLES_SQL);
    checkpoint = "lock_strong_system_tables";
    await client.query(LOCK_STRONGLY_PROTECTED_SYSTEM_DATA_TABLES_SQL);
    checkpoint = "read_only_system_lock_capability";
    const readOnlyLockCapability = await client.query(
      READ_ONLY_SYSTEM_DATA_LOCK_CAPABILITY_SQL,
    );
    const readOnlyLockCapabilityRow = readOnlyLockCapability.rows[0];
    if (
      readOnlyLockCapability.rowCount !== 1 ||
      readOnlyLockCapabilityRow?.relkind !== "r" ||
      readOnlyLockCapabilityRow?.owner !== "supabase_storage_admin" ||
      readOnlyLockCapabilityRow?.can_select !== true ||
      readOnlyLockCapabilityRow?.can_insert !== false ||
      readOnlyLockCapabilityRow?.can_update !== false ||
      readOnlyLockCapabilityRow?.can_delete !== false ||
      readOnlyLockCapabilityRow?.can_truncate !== false ||
      readOnlyLockCapabilityRow?.can_maintain !== false ||
      readOnlyLockCapabilityRow?.owner_role_settable !== false
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "lock_read_only_system_tables";
    await client.query(LOCK_READ_ONLY_SYSTEM_DATA_TABLES_SQL);
    checkpoint = "baseline_history";
    const fingerprint = await client.query(
      BASELINE_HISTORY_FINGERPRINT_SQL,
    );
    const fingerprintRow = fingerprint.rows[0];
    if (
      fingerprint.rowCount !== 1 ||
      fingerprintRow?.history_count !==
        POLICY.disposablePreviewBaselineMigrationCount ||
      fingerprintRow?.history_sha256 !==
        POLICY.disposablePreviewBaselineHistorySha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_public_catalog";
    const publicCatalog = await client.query(
      BASELINE_PUBLIC_CATALOG_FINGERPRINT_SQL,
    );
    const publicCatalogRow = publicCatalog.rows[0];
    if (
      publicCatalog.rowCount !== 1 ||
      publicCatalogRow?.object_count !==
        POLICY.disposablePreviewBaselinePublicCatalogObjectCount ||
      publicCatalogRow?.catalog_sha256 !==
        POLICY.disposablePreviewBaselinePublicCatalogSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_public_members";
    const schemaMembers = await client.query(
      BASELINE_PUBLIC_SCHEMA_MEMBER_FINGERPRINT_SQL,
    );
    const schemaMembersRow = schemaMembers.rows[0];
    if (
      schemaMembers.rowCount !== 1 ||
      schemaMembersRow?.member_count !==
        POLICY.disposablePreviewBaselinePublicSchemaMemberCount ||
      schemaMembersRow?.members_sha256 !==
        POLICY.disposablePreviewBaselinePublicSchemaMembersSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_schema_less_dependencies";
    const schemaLessDependencies = await client.query(
      BASELINE_SCHEMA_LESS_DEPENDENCY_FINGERPRINT_SQL,
    );
    const schemaLessDependenciesRow = schemaLessDependencies.rows[0];
    if (
      schemaLessDependencies.rowCount !== 1 ||
      schemaLessDependenciesRow?.dependency_count !==
        POLICY.disposablePreviewBaselineSchemaLessDependencyCount ||
      schemaLessDependenciesRow?.dependencies_sha256 !==
        POLICY.disposablePreviewBaselineSchemaLessDependenciesSha256 ||
      !sameDependencyClasses(
        schemaLessDependenciesRow?.dependency_classes,
        POLICY.disposablePreviewBaselineSchemaLessDependencyClasses,
      ) ||
      schemaLessDependenciesRow?.application_internal_only !== true
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_publications";
    const publications = await client.query(
      GLOBAL_PUBLICATION_FINGERPRINT_SQL,
    );
    const publicationsRow = publications.rows[0];
    if (
      publications.rowCount !== 1 ||
      publicationsRow?.publication_count !==
        POLICY.disposablePreviewBaselinePublicationCount ||
      publicationsRow?.publications_sha256 !==
        POLICY.disposablePreviewBaselinePublicationsSha256 ||
      publicationsRow?.namespace_membership_count !==
        POLICY.disposablePreviewBaselinePublicationNamespaceCount ||
      publicationsRow?.namespace_memberships_sha256 !==
        POLICY.disposablePreviewBaselinePublicationNamespacesSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_event_triggers";
    const eventTriggers = await client.query(
      GLOBAL_EVENT_TRIGGER_FINGERPRINT_SQL,
    );
    const eventTriggersRow = eventTriggers.rows[0];
    if (
      eventTriggers.rowCount !== 1 ||
      eventTriggersRow?.event_trigger_count !==
        POLICY.disposablePreviewBaselineEventTriggerCount ||
      eventTriggersRow?.event_triggers_sha256 !==
        POLICY.disposablePreviewBaselineEventTriggersSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_default_acls";
    const publicDefaultAcls = await client.query(
      PUBLIC_DEFAULT_ACL_FINGERPRINT_SQL,
    );
    const publicDefaultAclsRow = publicDefaultAcls.rows[0];
    if (
      publicDefaultAcls.rowCount !== 1 ||
      publicDefaultAclsRow?.default_acl_count !==
        POLICY.disposablePreviewBaselinePublicDefaultAclCount ||
      publicDefaultAclsRow?.default_acls_sha256 !==
        POLICY.disposablePreviewBaselinePublicDefaultAclsSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog";
    const catalog = await client.query(BASELINE_CATALOG_SQL);
    const catalogRow = catalog.rows[0];
    checkpoint = "baseline_catalog_schemas";
    if (
      catalog.rowCount !== 1 ||
      !catalogRow ||
      !sameStrings(
        catalogRow.schema_names,
        POLICY.disposablePreviewBaselineSchemas,
      )
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_public_tables";
    if (
      !sameStrings(
        catalogRow.public_tables,
        POLICY.disposablePreviewBaselinePublicTables,
      )
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_public_namespace";
    if (
      typeof catalogRow.public_oid !== "string" ||
      !/^\d+$/.test(catalogRow.public_oid) ||
      catalogRow.public_owner !== "pg_database_owner" ||
      catalogRow.public_acl !== POLICY.disposablePreviewBaselinePublicAcl ||
      catalogRow.public_comment !==
        POLICY.disposablePreviewBaselinePublicComment
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_public_placements";
    if (
      catalogRow.public_extensions_absent !== true ||
      catalogRow.public_publications_absent !== true
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_external_dependencies";
    if (catalogRow.external_dependencies_absent !== true) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_application_roles";
    if (catalogRow.application_roles_absent !== true) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_catalog_system_data";
    if (
      Object.entries(catalogRow)
        .filter(([key]) => key.endsWith("_empty"))
        .some(([, value]) => value !== true)
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_public_metadata";
    const publicMetadata = await client.query({
      text: PUBLIC_SCHEMA_METADATA_SQL,
      values: [POLICY.applicationRoles],
    });
    const publicMetadataRow = publicMetadata.rows[0];
    if (
      publicMetadata.rowCount !== 1 ||
      publicMetadataRow?.public_oid !== catalogRow.public_oid ||
      publicMetadataRow?.public_owner !== catalogRow.public_owner ||
      publicMetadataRow?.public_comment !== catalogRow.public_comment ||
      publicMetadataRow?.non_application_acl_sha256 !==
        POLICY.disposablePreviewBaselinePublicNonApplicationAclSha256 ||
      publicMetadataRow?.application_acl_count !== 0
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "baseline_public_data";
    await client.query(ASSERT_EMPTY_PUBLIC_TABLES_SQL);
    checkpoint = "preserved_system_snapshot";
    const preserved = await client.query({
      text: PRESERVED_SYSTEM_SNAPSHOT_SQL,
      values: [
        POLICY.preservedSystemSchemas,
        POLICY.rebuiltApplicationSchemas,
      ],
    });
    const preservedRow = preserved.rows[0];
    if (
      preserved.rowCount !== 1 ||
      typeof preservedRow?.schemas_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(preservedRow.schemas_sha256) ||
      typeof preservedRow?.extensions_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(preservedRow.extensions_sha256) ||
      typeof preservedRow?.protected_objects_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(preservedRow.protected_objects_sha256) ||
      typeof preservedRow?.system_security_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(preservedRow.system_security_sha256)
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    checkpoint = "preserved_system_semantic_snapshot";
    const semantic = await client.query({
      text: PRESERVED_SYSTEM_SEMANTIC_SNAPSHOT_SQL,
      values: [
        POLICY.preservedSystemSchemas,
        POLICY.rebuiltApplicationSchemas,
        POLICY.applicationRoles,
      ],
    });
    const semanticRow = semantic.rows[0];
    if (
      semantic.rowCount !== 1 ||
      !Number.isInteger(semanticRow?.record_count) ||
      semanticRow.record_count < 1 ||
      typeof semanticRow?.semantic_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(semanticRow.semantic_sha256)
    ) {
      fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
    }
    return Object.freeze({
      baselineCount: fingerprintRow.history_count,
      preservedSchemasSha256: preservedRow.schemas_sha256,
      preservedExtensionsSha256: preservedRow.extensions_sha256,
      preservedObjectsSha256: preservedRow.protected_objects_sha256,
      systemSecuritySha256: preservedRow.system_security_sha256,
      preservedSemanticSha256: semanticRow.semantic_sha256,
      preservedSemanticRecordCount: semanticRow.record_count,
      publicOid: catalogRow.public_oid,
      publicNonApplicationAclSha256:
        publicMetadataRow.non_application_acl_sha256,
      publicComment: catalogRow.public_comment,
    });
  } catch (error) {
    if (error instanceof CommunicationNotePreviewTransactionalMigrationError) {
      if (
        error.code ===
          "TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID" &&
        !error.checkpoint
      ) {
        fail(error.code, checkpoint);
      }
      throw error;
    }
    fail("TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID", checkpoint);
  }
}

async function assertDisposablePreviewResetPostconditions(
  client,
  preserved,
) {
  const systemData = await client.query(SYSTEM_DATA_EMPTY_SQL);
  const currentSchemas = await client.query(NON_SYSTEM_SCHEMA_NAMES_SQL);
  const currentPreserved = await client.query({
    text: PRESERVED_SYSTEM_SNAPSHOT_SQL,
    values: [
      POLICY.preservedSystemSchemas,
      POLICY.rebuiltApplicationSchemas,
    ],
  });
  const currentSemantic = await client.query({
    text: PRESERVED_SYSTEM_SEMANTIC_SNAPSHOT_SQL,
    values: [
      POLICY.preservedSystemSchemas,
      POLICY.rebuiltApplicationSchemas,
      POLICY.applicationRoles,
    ],
  });
  const applicationRoles = await client.query(APPLICATION_ROLE_POSTCHECK_SQL);
  const publications = await client.query(GLOBAL_PUBLICATION_FINGERPRINT_SQL);
  const eventTriggers = await client.query(
    GLOBAL_EVENT_TRIGGER_FINGERPRINT_SQL,
  );
  const publicDefaultAcls = await client.query(
    PUBLIC_DEFAULT_ACL_FINGERPRINT_SQL,
  );
  const protectedApplicationGrants = await client.query({
    text: PROTECTED_APPLICATION_ACL_GRANTS_SQL,
    values: [
      POLICY.applicationRoles,
      [...POLICY.preservedSystemSchemas, "public"],
      POLICY.preservedSystemSchemas,
    ],
  });
  const publicSchema = await client.query({
    text: PUBLIC_SCHEMA_METADATA_SQL,
    values: [POLICY.applicationRoles],
  });
  const expectedSchemas = [
    ...POLICY.disposablePreviewBaselineSchemas.filter((schema) =>
      schema !== "public"
    ),
    ...POLICY.rebuiltApplicationSchemas,
  ].sort();
  const systemDataRow = systemData.rows[0];
  const preservedRow = currentPreserved.rows[0];
  const publicationsRow = publications.rows[0];
  const eventTriggersRow = eventTriggers.rows[0];
  const publicDefaultAclsRow = publicDefaultAcls.rows[0];
  const protectedApplicationGrantsRow =
    protectedApplicationGrants.rows[0];
  const publicSchemaRow = publicSchema.rows[0];
  const expectedPublicApplicationAclCount =
    POLICY.protectedApplicationAclGrants.filter((grant) =>
      grant.startsWith("schema|public|")
    ).length;
  if (
    systemData.rowCount !== 1 ||
    !systemDataRow ||
    Object.values(systemDataRow).some((value) => value !== true) ||
    currentSchemas.rowCount !== 1 ||
    !sameStrings(currentSchemas.rows[0]?.schema_names, expectedSchemas) ||
    currentPreserved.rowCount !== 1 ||
    preservedRow?.schemas_sha256 !== preserved.preservedSchemasSha256 ||
    preservedRow?.extensions_sha256 !== preserved.preservedExtensionsSha256 ||
    preservedRow?.protected_objects_sha256 !==
      preserved.preservedObjectsSha256 ||
    preservedRow?.system_security_sha256 !== preserved.systemSecuritySha256 ||
    currentSemantic.rowCount !== 1 ||
    currentSemantic.rows[0]?.record_count !==
      preserved.preservedSemanticRecordCount ||
    currentSemantic.rows[0]?.semantic_sha256 !==
      preserved.preservedSemanticSha256 ||
    publications.rowCount !== 1 ||
    publicationsRow?.publication_count !==
      POLICY.disposablePreviewBaselinePublicationCount ||
    publicationsRow?.publications_sha256 !==
      POLICY.disposablePreviewBaselinePublicationsSha256 ||
    publicationsRow?.namespace_membership_count !==
      POLICY.disposablePreviewBaselinePublicationNamespaceCount ||
    publicationsRow?.namespace_memberships_sha256 !==
      POLICY.disposablePreviewBaselinePublicationNamespacesSha256 ||
    eventTriggers.rowCount !== 1 ||
    eventTriggersRow?.event_trigger_count !==
      POLICY.disposablePreviewBaselineEventTriggerCount ||
    eventTriggersRow?.event_triggers_sha256 !==
      POLICY.disposablePreviewBaselineEventTriggersSha256 ||
    publicDefaultAcls.rowCount !== 1 ||
    publicDefaultAclsRow?.default_acl_count !==
      POLICY.disposablePreviewBaselinePublicDefaultAclCount ||
    publicDefaultAclsRow?.default_acls_sha256 !==
      POLICY.disposablePreviewBaselinePublicDefaultAclsSha256 ||
    protectedApplicationGrants.rowCount !== 1 ||
    protectedApplicationGrantsRow?.grant_count !==
      POLICY.protectedApplicationAclGrants.length ||
    !sameStrings(
      protectedApplicationGrantsRow?.grants,
      POLICY.protectedApplicationAclGrants,
    ) ||
    publicSchema.rowCount !== 1 ||
    publicSchemaRow?.public_oid !== preserved.publicOid ||
    publicSchemaRow?.public_owner !== "pg_database_owner" ||
    publicSchemaRow?.non_application_acl_sha256 !==
      preserved.publicNonApplicationAclSha256 ||
    publicSchemaRow?.application_acl_count !==
      expectedPublicApplicationAclCount ||
    publicSchemaRow?.public_comment !== preserved.publicComment
  ) {
    fail("TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED", "rebuilt_state");
  }
  if (
    applicationRoles.rowCount !== POLICY.applicationRoles.length ||
    !sameStrings(
      applicationRoles.rows.map((row) => row.rolname),
      POLICY.applicationRoles,
    ) ||
    applicationRoles.rows.some((row) =>
      row.attributes_safe !== true ||
      row.one_membership !== true ||
      row.no_member_edges !== true ||
      row.bootstrap_edge_safe !== true
    )
  ) {
    fail("TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED", "application_roles");
  }
}

function sameStrings(actual, expected) {
  return Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameDependencyClasses(actual, expected) {
  return Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) =>
      value?.catalog === expected[index]?.catalog &&
      value?.type === expected[index]?.type &&
      value?.dependencyType === expected[index]?.dependencyType &&
      value?.count === expected[index]?.count
    );
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > POLICY.maximumStdinBytes) {
      fail("TRANSACTIONAL_MIGRATION_STDIN_INVALID");
    }
    chunks.push(buffer);
  }
  if (bytes === 0) fail("TRANSACTIONAL_MIGRATION_STDIN_INVALID");
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function connectionConfig(candidate, certificate) {
  return Object.freeze({
    host: candidate.host,
    port: candidate.port,
    database: candidate.database,
    user: candidate.user,
    password: candidate.password,
    application_name: POLICY.applicationName,
    connectionTimeoutMillis: 10_000,
    query_timeout: 240_000,
    statement_timeout: 225_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({ ca: certificate, rejectUnauthorized: true }),
  });
}

async function connectPreferredAdmin(Client, candidates, certificate) {
  let direct = new Client(connectionConfig(candidates.direct, certificate));
  const directState = attachBackgroundGuard(direct);
  try {
    await direct.connect();
    assertVerifiedPreviewTlsConnection(direct);
    return Object.freeze({ client: direct, backgroundState: directState });
  } catch (error) {
    await closeQuietly(direct);
    direct = undefined;
    if (!DIRECT_UNREACHABLE_CODES.has(safeCode(error))) {
      fail("TRANSACTIONAL_MIGRATION_CONNECTION_FAILED");
    }
  }
  const session = new Client(
    connectionConfig(candidates.sessionPooler, certificate),
  );
  const sessionState = attachBackgroundGuard(session);
  try {
    await session.connect();
    assertVerifiedPreviewTlsConnection(session);
    return Object.freeze({ client: session, backgroundState: sessionState });
  } catch {
    await closeQuietly(session);
    fail("TRANSACTIONAL_MIGRATION_CONNECTION_FAILED");
  }
}

function attachBackgroundGuard(client) {
  const state = { failed: false };
  client.on("error", () => {
    state.failed = true;
  });
  return state;
}

export async function runTransactionalMigrationHarness({
  client,
  backgroundState,
  expectedPostgresMajor,
  resetAuthorizationSha256,
  migrations,
  manifestSha256,
  outerTransactionCount,
}) {
  if (
    resetAuthorizationSha256 !==
      POLICY.disposablePreviewBaselineHistorySha256
  ) {
    fail("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
  }
  let transactionOpen = false;
  let baselineCount = 0;
  try {
    await client.query("begin isolation level read committed");
    transactionOpen = true;
    await client.query("set local statement_timeout = '210s'");
    await client.query("set local lock_timeout = '10s'");
    await client.query(
      "set local idle_in_transaction_session_timeout = '225s'",
    );
    const target = await client.query(`select
      current_user,
      session_user,
      pg_catalog.current_database() as database_name,
      pg_catalog.current_setting('application_name') as application_name,
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
        10000 as postgres_major,
      coalesce((
        select role_record.rolbypassrls
        from pg_catalog.pg_roles as role_record
        where role_record.rolname = current_user
      ), false) as role_bypass_rls,
      coalesce((
        select role_record.rolcreaterole
        from pg_catalog.pg_roles as role_record
        where role_record.rolname = current_user
      ), false) as role_can_create_roles,
      exists (
        select 1 from pg_catalog.pg_stat_ssl as ssl_state
        where ssl_state.pid = pg_catalog.pg_backend_pid()
          and ssl_state.ssl
      ) as ssl_active,
      pg_catalog.pg_try_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'careslink.preview.transactional-migrations.2026-08-29', 0
        )
      ) as migration_lock`);
    const targetRow = target.rows[0];
    if (
      target.rowCount !== 1 ||
      targetRow?.current_user !== "postgres" ||
      targetRow?.session_user !== "postgres" ||
      targetRow?.database_name !== "postgres" ||
      targetRow?.application_name !== POLICY.applicationName ||
      targetRow?.postgres_major !== expectedPostgresMajor ||
      targetRow?.role_bypass_rls !== true ||
      targetRow?.role_can_create_roles !== true ||
      targetRow?.ssl_active !== true
    ) {
      fail("TRANSACTIONAL_MIGRATION_TARGET_INVALID");
    }
    if (targetRow.migration_lock !== true) {
      fail("TRANSACTIONAL_MIGRATION_CONCURRENT_RUN_DENIED");
    }
    await client.query(`lock table supabase_migrations.schema_migrations
      in share row exclusive mode`);
    const resetBaseline = await assertDisposablePreviewResetPreconditions(
      client,
    );
    baselineCount = resetBaseline.baselineCount;
    await client.query(DROP_BASELINE_PUBLIC_ROUTINES_SQL);
    await client.query(DROP_BASELINE_PUBLIC_TABLES_SQL);
    const clearedPublic = await client.query(PUBLIC_NAMESPACE_CLEARED_SQL);
    const retainedDefaultAcls = await client.query(
      PUBLIC_DEFAULT_ACL_FINGERPRINT_SQL,
    );
    const retainedPublications = await client.query(
      GLOBAL_PUBLICATION_FINGERPRINT_SQL,
    );
    const retainedEventTriggers = await client.query(
      GLOBAL_EVENT_TRIGGER_FINGERPRINT_SQL,
    );
    const clearedPublicRow = clearedPublic.rows[0];
    const retainedDefaultAclsRow = retainedDefaultAcls.rows[0];
    const retainedPublicationsRow = retainedPublications.rows[0];
    const retainedEventTriggersRow = retainedEventTriggers.rows[0];
    if (
      clearedPublic.rowCount !== 1 ||
      clearedPublicRow?.remaining_member_count !==
        POLICY.disposablePreviewBaselinePublicDefaultAclCount ||
      clearedPublicRow?.remaining_default_acl_count !==
        POLICY.disposablePreviewBaselinePublicDefaultAclCount ||
      clearedPublicRow?.unexpected_member_count !== 0 ||
      retainedDefaultAcls.rowCount !== 1 ||
      retainedDefaultAclsRow?.default_acl_count !==
        POLICY.disposablePreviewBaselinePublicDefaultAclCount ||
      retainedDefaultAclsRow?.default_acls_sha256 !==
        POLICY.disposablePreviewBaselinePublicDefaultAclsSha256 ||
      retainedPublications.rowCount !== 1 ||
      retainedPublicationsRow?.publication_count !==
        POLICY.disposablePreviewBaselinePublicationCount ||
      retainedPublicationsRow?.publications_sha256 !==
        POLICY.disposablePreviewBaselinePublicationsSha256 ||
      retainedPublicationsRow?.namespace_membership_count !==
        POLICY.disposablePreviewBaselinePublicationNamespaceCount ||
      retainedPublicationsRow?.namespace_memberships_sha256 !==
        POLICY.disposablePreviewBaselinePublicationNamespacesSha256 ||
      retainedEventTriggers.rowCount !== 1 ||
      retainedEventTriggersRow?.event_trigger_count !==
        POLICY.disposablePreviewBaselineEventTriggerCount ||
      retainedEventTriggersRow?.event_triggers_sha256 !==
        POLICY.disposablePreviewBaselineEventTriggersSha256
    ) {
      fail(
        "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED",
        "reset_namespace_and_globals",
      );
    }
    await client.query(
      "delete from supabase_migrations.schema_migrations",
    );
    const history = await client.query(`select version,
      coalesce(name, '') as name,
      statements
      from supabase_migrations.schema_migrations order by version`);
    const historyState = validateCommunicationNotePreviewMigrationHistory(
      history.rows,
      migrations,
    );
    if (historyState.appliedCount !== 0) {
      fail("TRANSACTIONAL_MIGRATION_HISTORY_INVALID");
    }
    for (const migration of historyState.pending) {
      await client.query(migration.executionSql);
      await client.query({
        text: `insert into supabase_migrations.schema_migrations(
          version, name, statements
        ) values ($1::pg_catalog.text, $2::pg_catalog.text, $3::pg_catalog.text[])`,
        values: [migration.version, migration.name, migration.statements],
      });
    }
    const finalHistory = await client.query(`select version,
      coalesce(name, '') as name,
      statements
      from supabase_migrations.schema_migrations order by version`);
    const finalState = validateCommunicationNotePreviewMigrationHistory(
      finalHistory.rows,
      migrations,
    );
    if (
      finalState.appliedCount !== migrations.length ||
      finalState.pending.length !== 0
    ) {
      fail("TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED", "staged_history");
    }
    await assertDisposablePreviewResetPostconditions(
      client,
      resetBaseline,
    );
    const residue = await client.query(`select
      not exists (
        select 1 from pg_catalog.pg_roles as role_record
        where role_record.rolname like 'careslink_m1gh_assert_transport_%'
          or role_record.rolname like 'careslink_m1gh_assert_actor_%'
          or role_record.rolname like
            'careslink_v1_preview_runner_terminal_runtime_%'
          or role_record.rolname = 'careslink_migration_restore_test_owner'
      ) as temporary_roles_absent,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_authorizations)
        as authorizations_empty,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_authorization_revocations)
        as revocations_empty,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_claims)
        as claims_empty,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_dispatch_reservations)
        as reservations_empty,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_dispatch_receipts)
        as receipts_empty,
      (select pg_catalog.count(*) = 0 from
        careslink_v1_generation.communication_note_preview_runner_terminals)
        as terminals_empty`);
    const residueRow = residue.rows[0];
    if (
      residue.rowCount !== 1 ||
      !residueRow ||
      Object.values(residueRow).some((value) => value !== true) ||
      backgroundState.failed
    ) {
      fail(
        "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED",
        "temporary_residue_or_connection",
      );
    }
    const finalSystemData = await client.query(SYSTEM_DATA_EMPTY_SQL);
    const finalSystemDataRow = finalSystemData.rows[0];
    if (
      finalSystemData.rowCount !== 1 ||
      !finalSystemDataRow ||
      Object.values(finalSystemDataRow).some((value) => value !== true)
    ) {
      fail(
        "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED",
        "system_data_precommit",
      );
    }
    await client.query("commit");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("rollback");
      } catch {
        // The disposable Preview deletion remains the final cleanup boundary.
      }
    }
    if (
      error instanceof CommunicationNotePreviewTransactionalMigrationError ||
      error instanceof CommunicationNotePreviewTransactionalMigrationPolicyError
    ) {
      throw error;
    }
    fail("TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED");
  }
  if (backgroundState.failed) {
    fail(
      "TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED",
      "connection_postcommit",
    );
  }
  const committed = await client.query(`select version,
    coalesce(name, '') as name,
    statements
    from supabase_migrations.schema_migrations order by version`);
  const committedState = validateCommunicationNotePreviewMigrationHistory(
    committed.rows,
    migrations,
  );
  if (
    committedState.appliedCount !== migrations.length ||
    committedState.pending.length !== 0
  ) {
    fail("TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED", "committed_history");
  }
  return Object.freeze({
    postgres: expectedPostgresMajor,
    migrations: migrations.length,
    baselineMigrations: baselineCount,
    appliedInSingleTransaction: migrations.length,
    outerTransactionsRemovedInMemory: outerTransactionCount,
    manifestSha256,
    migrationParserContractVersion: POLICY.expectedCliVersion,
    isolationLevel: "read_committed_with_explicit_table_locks",
    fullChainAtomic: true,
    publicNamespacePreserved: true,
    applicationObjectsRebuilt: true,
    baselineHistorySha256:
      POLICY.disposablePreviewBaselineHistorySha256,
    baselinePublicCatalogSha256:
      POLICY.disposablePreviewBaselinePublicCatalogSha256,
    baselinePublicSchemaMembersSha256:
      POLICY.disposablePreviewBaselinePublicSchemaMembersSha256,
    baselineSchemaLessDependenciesSha256:
      POLICY.disposablePreviewBaselineSchemaLessDependenciesSha256,
    baselinePublicationsSha256:
      POLICY.disposablePreviewBaselinePublicationsSha256,
    baselineEventTriggersSha256:
      POLICY.disposablePreviewBaselineEventTriggersSha256,
    baselinePublicDefaultAclsSha256:
      POLICY.disposablePreviewBaselinePublicDefaultAclsSha256,
    baselinePublicNonApplicationAclSha256:
      POLICY.disposablePreviewBaselinePublicNonApplicationAclSha256,
    preservedSystemSchemas: POLICY.preservedSystemSchemas.length,
    applicationRoles: POLICY.applicationRoles.length,
    protectedApplicationAclGrants:
      POLICY.protectedApplicationAclGrants.length,
    ledgersEmpty: true,
    temporaryRolesAbsent: true,
  });
}

async function main() {
  let branchJson;
  let candidates;
  let client;
  try {
    if (
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
      Object.entries(process.env).some(
        ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
      )
    ) {
      fail("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
    }
    const args = parseTransactionalMigrationArguments(
      process.argv.slice(2),
    );
    branchJson = await readBoundedStdin();
    const target = extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
      branchJson,
      { expectedBranchRef: args.expectedBranchRef },
    );
    branchJson = undefined;
    const certificateBuffer = await readFile(args.sslRootCertPath);
    if (
      certificateBuffer.length === 0 ||
      certificateBuffer.length > IDENTITY_POLICY.maximumCaBytes ||
      createHash("sha256").update(certificateBuffer).digest("hex") !==
        args.expectedSslRootCertSha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_CA_INVALID");
    }
    const certificate = certificateBuffer.toString("utf8");
    if (
      !certificate.includes("-----BEGIN CERTIFICATE-----") ||
      !certificate.includes("-----END CERTIFICATE-----")
    ) {
      fail("TRANSACTIONAL_MIGRATION_CA_INVALID");
    }
    const bundle = await loadPinnedCommunicationNotePreviewMigrations();
    const pgModule = await import("pg");
    const Client = pgModule.Client ?? pgModule.default?.Client;
    if (typeof Client !== "function") {
      fail("TRANSACTIONAL_MIGRATION_DRIVER_INVALID");
    }
    candidates = target.takeAdminConnectionCandidates();
    const connected = await connectPreferredAdmin(
      Client,
      candidates,
      certificate,
    );
    client = connected.client;
    candidates = undefined;
    const evidence = await runTransactionalMigrationHarness({
      client,
      backgroundState: connected.backgroundState,
      expectedPostgresMajor: args.expectedPostgresMajor,
      resetAuthorizationSha256: args.resetAuthorizationSha256,
      ...bundle,
    });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    branchJson = undefined;
    candidates = undefined;
    await closeQuietly(client);
  }
}

async function closeQuietly(client) {
  try {
    await client?.end();
  } catch {
    // The caller must delete the disposable Preview after any failure.
  }
}

function safeCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function safeCheckpoint(error) {
  if (!error || typeof error !== "object") return "";
  const code = safeCode(error);
  const descriptor = Object.getOwnPropertyDescriptor(error, "checkpoint");
  const checkpoint = descriptor && "value" in descriptor
    ? descriptor.value
    : "";
  return isFixedCheckpoint(code, checkpoint) ? checkpoint : "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error instanceof CommunicationNotePreviewTransactionalMigrationError ||
        error instanceof CommunicationNotePreviewTransactionalMigrationPolicyError ||
        error instanceof CommunicationNotePreviewRunnerTerminalIdentityPolicyError
      ? error.code
      : "TRANSACTIONAL_MIGRATION_INTERNAL_FAILED";
    const checkpoint = safeCheckpoint(error);
    process.stderr.write(`${JSON.stringify({
      stage: "M00",
      errorType: code,
      ...(checkpoint ? { checkpoint } : {}),
    })}\n`);
    process.exitCode = 1;
  });
}
