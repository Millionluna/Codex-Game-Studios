import { execFile, spawn } from "node:child_process";
import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const execFileAsync = promisify(execFile);
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const MIGRATION_PATH = join(
  APP_ROOT,
  "supabase/migrations/20260830065750_add_communication_note_preview_runtime_credential_broker.sql",
);
const TEMP_ROOT_PREFIX =
  "/private/tmp/careslink-runtime-broker-migration-pg16.";
const TEMP_ROOT_PATTERN =
  /^\/private\/tmp\/careslink-runtime-broker-migration-pg16\.[A-Za-z0-9]{6,}$/;
const OWNER_MARKER_FILE = ".careslink-runtime-broker-migration-owner";
const CLUSTER_NAME = "careslink-runtime-broker-migration-pg16";
const CLUSTER_MARKER = "2026-08-30.local-pg16.m1l.1";
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management";
const RUNTIME_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-runtime";
const STATIC_CALLER_OWNER_PROBE_SCHEMA =
  "careslink_v1_m1l_static_caller_owner_probe";
const CROSS_DATABASE_RESIDUE_DATABASE =
  "careslink_v1_m1l_runtime_residue";
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const FIXED_PORT = 55_440;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const EXPECTED_ACQUISITION_COUNT = 4;
const EXPECTED_SCENARIO_COUNT = 6;
const REQUIRED_BINARIES = Object.freeze([
  "initdb",
  "pg_ctl",
  "pg_isready",
  "postgres",
]);
const KNOWN_PG16_BIN_DIRECTORIES = Object.freeze([
  "/opt/homebrew/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/usr/lib/postgresql/16/bin",
  "/usr/pgsql-16/bin",
]);

const API_ROLES = Object.freeze([
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
]);

const ADMIN_BOOTSTRAP_SQL = String.raw`
begin;

do $careslink_runtime_broker_migration_admin_guard$
begin
  if current_user <> 'bootstrap_admin'
    or session_user <> 'bootstrap_admin'
    or pg_catalog.current_database() <> 'postgres'
    or not coalesce((
      select role_record.rolsuper
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    ), false)
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 <> 16
    or pg_catalog.current_setting(
      'max_prepared_transactions'
    )::pg_catalog.int4 <> 0
    or pg_catalog.inet_server_addr() is not null
    or pg_catalog.inet_server_port() is not null
    or pg_catalog.current_setting('listen_addresses') <> ''
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or pg_catalog.current_setting('ssl') <> 'off'
    or pg_catalog.current_setting('cluster_name') <>
      'careslink-runtime-broker-migration-pg16'
    or pg_catalog.current_setting(
      'careslink.runtime_broker_migration.local_marker', true
    ) is distinct from '2026-08-30.local-pg16.m1l.1'
    or pg_catalog.to_regrole('postgres') is not null
  then
    raise exception 'M1L_LOCAL_BOOTSTRAP_ADMIN_UNSAFE';
  end if;
end
$careslink_runtime_broker_migration_admin_guard$;

create role postgres
  login nosuperuser nocreatedb createrole inherit
  noreplication bypassrls connection limit 8;
grant connect, create, temporary on database postgres to postgres;
grant pg_signal_backend, pg_read_all_stats to postgres;

create role anon
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role authenticated
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role service_role
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication bypassrls;
create role authenticator
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create schema extensions authorization bootstrap_admin;
revoke all on schema extensions
from public, anon, authenticated, service_role, authenticator;
grant usage on schema extensions to postgres;
create extension pgcrypto with schema extensions;

create function public.v1_shadow_canonical_json(p_value pg_catalog.jsonb)
returns pg_catalog.text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $careslink_runtime_broker_migration_bootstrap$
declare
  v_result pg_catalog.text;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(entry.key)::pg_catalog.text || ':' ||
          public.v1_shadow_canonical_json(entry.value),
        ',' order by pg_catalog.convert_to(entry.key, 'UTF8')
      ), '') || '}'
      into v_result
      from pg_catalog.jsonb_each(p_value) as entry;
      return v_result;
    when 'array' then
      select '[' || coalesce(pg_catalog.string_agg(
        public.v1_shadow_canonical_json(item.value),
        ',' order by item.ordinality
      ), '') || ']'
      into v_result
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as item(value, ordinality);
      return v_result;
    when 'number' then
      return pg_catalog.trim_scale(
        (p_value #>> '{}')::pg_catalog.numeric
      )::pg_catalog.text;
    else
      return p_value::pg_catalog.text;
  end case;
end
$careslink_runtime_broker_migration_bootstrap$;

create function public.v1_shadow_content_sha256(
  p_content pg_catalog.jsonb
)
returns pg_catalog.text
language sql
immutable
strict
security invoker
set search_path = ''
as $careslink_runtime_broker_migration_bootstrap$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        public.v1_shadow_canonical_json(p_content), 'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$careslink_runtime_broker_migration_bootstrap$;

grant execute on function
  public.v1_shadow_canonical_json(pg_catalog.jsonb),
  public.v1_shadow_content_sha256(pg_catalog.jsonb)
to postgres;

commit;
`;

const POSTGRES_BOOTSTRAP_SQL = String.raw`
begin;

do $careslink_runtime_broker_migration_postgres_guard$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or not coalesce((
      select not role_record.rolsuper
        and role_record.rolcreaterole
        and role_record.rolbypassrls
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    ), false)
    or not pg_catalog.pg_has_role(
      current_user, 'pg_signal_backend', 'USAGE'
    )
    or not pg_catalog.pg_has_role(
      current_user, 'pg_read_all_stats', 'USAGE'
    )
    or pg_catalog.to_regrole(
      'careslink_v1_preview_runner_terminal_caller'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_preview_runner_terminal_executor'
    ) is not null
    or pg_catalog.to_regnamespace('careslink_v1_generation') is not null
  then
    raise exception 'M1L_LOCAL_BOOTSTRAP_POSTGRES_UNSAFE';
  end if;
end
$careslink_runtime_broker_migration_postgres_guard$;

create role careslink_v1_generation_owner
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_authorization_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_dispatch_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_receipt_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_authorization_registration_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_authorization_revocation_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_dispatch_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_receipt_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_runner_terminal_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role careslink_v1_preview_runner_terminal_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
create schema careslink_v1_generation
  authorization careslink_v1_generation_owner;
set role careslink_v1_generation_owner;
revoke all on schema careslink_v1_generation from public;
grant usage, create on schema careslink_v1_generation
  to careslink_v1_preview_runner_terminal_executor;
grant usage on schema careslink_v1_generation
  to careslink_v1_preview_runner_terminal_caller;

reset role;
grant careslink_v1_preview_runner_terminal_executor to current_user
  with admin false, inherit false, set true granted by current_user;
set role careslink_v1_preview_runner_terminal_executor;

create function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    p_statement pg_catalog.jsonb,
    p_signature_base64url pg_catalog.text,
    p_verifier_identity_hmac pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_runtime_broker_migration_stub$
begin
  return pg_catalog.jsonb_build_object(
    'accepted', true,
    'authorizationDigest', p_statement->>'authorizationDigest',
    'runIdHash', p_statement->>'runIdHash',
    'status', 'STUB_ACCEPTED'
  );
end
$careslink_runtime_broker_migration_stub$;

revoke all on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
from public, anon, authenticated, service_role, authenticator;
grant execute on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
to careslink_v1_preview_runner_terminal_executor,
  careslink_v1_preview_runner_terminal_caller;

reset role;
set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_runner_terminal_executor;
reset role;
revoke careslink_v1_preview_runner_terminal_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

commit;
`;

const ACQUIRE_SQL = `
select careslink_v1_runtime_broker.acquire(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.text,
  $8::pg_catalog.text,
  $9::pg_catalog.text,
  $10::pg_catalog.text,
  $11::pg_catalog.timestamptz
) as result
`;
const BIND_SQL = `
select careslink_v1_runtime_broker.bind(
  $1::pg_catalog.text,
  $2::pg_catalog.int4
) as result
`;
const TOMBSTONE_SQL = `
select careslink_v1_runtime_broker.tombstone(
  $1::pg_catalog.text
) as result
`;
const FINALIZE_SQL = `
select careslink_v1_runtime_broker.finalize(
  $1::pg_catalog.text
) as result
`;
const INSPECT_SQL = `
select careslink_v1_runtime_broker.inspect(
  $1::pg_catalog.text
) as result
`;
const TERMINAL_SQL = `
select
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    $1::pg_catalog.jsonb,
    $2::pg_catalog.text,
    $3::pg_catalog.text
  ) as result
`;

class LocalMigrationHarnessError extends Error {
  constructor(
    stage,
    databaseMarker = null,
    databaseCode = null,
    databaseMessage = null,
    databasePosition = null,
  ) {
    super("COMMUNICATION_NOTE_RUNTIME_BROKER_MIGRATION_LOCAL_PG16_FAILED");
    this.name = "LocalMigrationHarnessError";
    this.stage = stage;
    this.databaseMarker = databaseMarker;
    this.databaseCode = databaseCode;
    this.databaseMessage = databaseMessage;
    this.databasePosition = databasePosition;
  }
}

function fail(stage) {
  throw new LocalMigrationHarnessError(stage);
}

function databaseFailure(stage, error) {
  const marker =
    typeof error?.message === "string"
      ? error.message.match(
          /\b(?:M1L_LOCAL|RUNTIME_CREDENTIAL)[A-Z0-9_]*\b/,
        )?.[0] ?? null
      : null;
  const code =
    typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code
      : null;
  const message =
    typeof error?.message === "string"
      ? error.message
          .replace(/[a-f0-9]{64}/g, "[digest]")
          .replace(
            /careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}/g,
            "[runtime-role]",
          )
      : "";
  const fixedMessage =
    message.length > 0 &&
    message.length <= 240 &&
    /^[A-Za-z0-9_ [\]():,.'"=<>+-]+$/.test(message)
      ? message
      : null;
  const position = Number(error?.position);
  const fixedPosition =
    Number.isSafeInteger(position) && position > 0 ? position : null;
  const failure = new LocalMigrationHarnessError(
    stage,
    marker,
    code,
    fixedMessage,
    fixedPosition,
  );
  const databaseContext =
    typeof error?.where === "string"
      ? error.where.replace(/\s+/g, " ").trim()
      : "";
  failure.databaseContext =
    databaseContext.length > 0 &&
    databaseContext.length <= 500 &&
    /^[A-Za-z0-9_ [\]():,.'"=<>+\-/]+$/.test(databaseContext)
      ? databaseContext
      : null;
  failure.databaseRoutine =
    typeof error?.routine === "string" &&
    /^[A-Za-z0-9_]+$/.test(error.routine)
      ? error.routine
      : null;
  throw failure;
}

async function runDatabaseStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LocalMigrationHarnessError) throw error;
    databaseFailure(stage, error);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function fixedCommandEnvironment(pgBinDirectory) {
  return Object.freeze({
    LANG: "C",
    LC_ALL: "C",
    PATH: `${pgBinDirectory}:/usr/bin:/bin`,
    TZ: "UTC",
  });
}

async function runCommand(command, args, env, stage) {
  try {
    await execFileAsync(command, args, {
      cwd: APP_ROOT,
      encoding: "utf8",
      env,
      killSignal: "SIGKILL",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
  } catch {
    fail(stage);
  }
}

function parseArguments(argv) {
  if (argv.length === 0) return Object.freeze({ pgBinDir: null });
  if (
    argv.length === 1 &&
    /^--pg-bin-dir=\/[A-Za-z0-9._/@+-]+$/.test(argv[0])
  ) {
    return Object.freeze({ pgBinDir: argv[0].slice(13) });
  }
  fail("arguments");
}

async function resolvePg16Binaries(requestedDirectory) {
  const candidates = requestedDirectory
    ? [requestedDirectory]
    : KNOWN_PG16_BIN_DIRECTORIES;
  for (const candidate of candidates) {
    try {
      const canonicalDirectory = await realpath(candidate);
      if (!(await stat(canonicalDirectory)).isDirectory()) continue;
      const binaries = {};
      for (const name of REQUIRED_BINARIES) {
        const binary = await realpath(join(canonicalDirectory, name));
        if (
          !(await stat(binary)).isFile() ||
          dirname(binary) !== canonicalDirectory
        ) {
          throw new Error("invalid binary");
        }
        await access(binary, fsConstants.X_OK);
        binaries[name] = binary;
      }
      const commandEnv = fixedCommandEnvironment(canonicalDirectory);
      const version = await execFileAsync(binaries.postgres, ["--version"], {
        cwd: APP_ROOT,
        encoding: "utf8",
        env: commandEnv,
        maxBuffer: 16_384,
        timeout: 5_000,
      });
      const match = String(version.stdout)
        .trim()
        .match(
          /^postgres \(PostgreSQL\) (16\.\d+(?:\.\d+)?)(?: \([^)]+\))?$/,
        );
      if (!match) throw new Error("not PostgreSQL 16");
      return Object.freeze({
        binDirectory: canonicalDirectory,
        binaries: Object.freeze(binaries),
        commandEnv,
        version: match[1],
      });
    } catch {
      if (requestedDirectory) fail("binary-preflight");
    }
  }
  fail("binary-preflight");
}

async function readAndValidateMigration() {
  const migration = await readFile(MIGRATION_PATH, "utf8");
  if (
    !migration.startsWith(
      "-- Communication Note Preview durable runtime-credential broker and terminal fence.",
    ) ||
    !migration.includes(
      "create schema careslink_v1_runtime_broker authorization postgres;",
    ) ||
    !migration.includes(
      "create function careslink_v1_runtime_broker.acquire(",
    ) ||
    !migration.includes(
      "pg_catalog.pg_advisory_xact_lock_shared(",
    ) ||
    !migration.includes(
      "message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE'",
    ) ||
    !migration.trimEnd().endsWith("commit;") ||
    /(?:supabase\.co|pooler\.supabase\.com)/i.test(migration)
  ) {
    fail("migration-file-policy");
  }
  return migration;
}

function validateTempRoot(value) {
  if (typeof value !== "string" || !TEMP_ROOT_PATTERN.test(value)) {
    fail("temp-root");
  }
  return value;
}

function createPostgresInstance(binary, args, env, logDescriptor) {
  const child = spawn(binary, args, {
    cwd: APP_ROOT,
    detached: false,
    env,
    stdio: ["ignore", logDescriptor, logDescriptor],
    windowsHide: true,
  });
  let exited = false;
  let settleExit;
  const exitPromise = new Promise((resolveExit) => {
    settleExit = resolveExit;
  });
  const settle = () => {
    if (!exited) {
      exited = true;
      settleExit();
    }
  };
  child.once("error", settle);
  child.once("exit", settle);
  return Object.freeze({
    child,
    exitPromise,
    get exited() {
      return exited;
    },
  });
}

async function waitForPostgres(lifecycle) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (lifecycle.postgres.exited) fail("postgres-start");
    try {
      await execFileAsync(
        lifecycle.pg.binaries.pg_isready,
        [
          `--host=${lifecycle.socketDirectory}`,
          `--port=${FIXED_PORT}`,
          "--username=bootstrap_admin",
          "--dbname=postgres",
          "--timeout=1",
          "--quiet",
        ],
        {
          cwd: APP_ROOT,
          env: lifecycle.pg.commandEnv,
          timeout: 1_500,
          windowsHide: true,
        },
      );
      return;
    } catch {
      await sleep(50);
    }
  }
  fail("postgres-start");
}

function clientConfiguration(lifecycle, overrides = {}) {
  return {
    application_name: MANAGEMENT_APPLICATION_NAME,
    connectionTimeoutMillis: 5_000,
    database: "postgres",
    host: lifecycle.socketDirectory,
    port: FIXED_PORT,
    ssl: false,
    user: "postgres",
    ...overrides,
  };
}

async function openClient(lifecycle, configuration) {
  const client = new Client(configuration);
  client.on("error", () => undefined);
  lifecycle.clients.add(client);
  try {
    await client.connect();
    return client;
  } catch {
    lifecycle.clients.delete(client);
    await client.end().catch(() => undefined);
    fail("database-connect");
  }
}

async function closeClient(lifecycle, client) {
  if (!client) return;
  lifecycle.clients.delete(client);
  await Promise.race([
    client.end().catch(() => undefined),
    sleep(2_000),
  ]);
}

function createScramMaterial() {
  const passwordBytes = randomBytes(32);
  const salt = randomBytes(16);
  const password = passwordBytes.toString("base64url");
  const saltedPassword = pbkdf2Sync(password, salt, 4_096, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key", "utf8")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key", "utf8")
    .digest();
  const verifier =
    `SCRAM-SHA-256$4096:${salt.toString("base64")}$` +
    `${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
  passwordBytes.fill(0);
  salt.fill(0);
  saltedPassword.fill(0);
  clientKey.fill(0);
  storedKey.fill(0);
  serverKey.fill(0);
  return {
    password,
    verifier,
    verifierSha256: sha256(verifier),
  };
}

function createFixture(label) {
  const acquisitionDigest = sha256(`m1l:${label}:acquisition`);
  const fixture = {
    acquisitionDigest,
    authorizationDigest: sha256(`m1l:${label}:authorization`),
    callerIdentityHmac: sha256(`m1l:${label}:caller-identity`),
    databaseTargetDigest: sha256(`m1l:${label}:database-target`),
    expiresAt: new Date(Date.now() + 75_000).toISOString(),
    leaseReferenceSha256: sha256(`m1l:${label}:lease`),
    material: createScramMaterial(),
    runIdHash: sha256(`m1l:${label}:run`),
    runtimeRole:
      "careslink_v1_preview_runner_terminal_runtime_" +
      acquisitionDigest.slice(0, 16),
    sessionBindingSha256: sha256(`m1l:${label}:session`),
  };
  if (
    !RUNTIME_ROLE_PATTERN.test(fixture.runtimeRole) ||
    new Set([
      fixture.acquisitionDigest,
      fixture.authorizationDigest,
      fixture.callerIdentityHmac,
      fixture.databaseTargetDigest,
      fixture.leaseReferenceSha256,
      fixture.material.verifierSha256,
      fixture.runIdHash,
      fixture.sessionBindingSha256,
    ]).size !== 8
  ) {
    fail("fixture");
  }
  return fixture;
}

function disposeFixtureMaterial(fixture) {
  fixture.material.password = null;
  fixture.material.verifier = null;
}

function exactBrokerResult(result, status, fixture) {
  const value = result?.rows?.[0]?.result;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.status !== status ||
    value.acquisitionRequestDigest !== fixture.acquisitionDigest ||
    value.rawCredentialMaterialPresent !== false
  ) {
    fail("broker-result");
  }
  return value;
}

function createBroker(client) {
  return Object.freeze({
    async acquire(fixture) {
      const result = await client.query(ACQUIRE_SQL, [
        fixture.acquisitionDigest,
        fixture.authorizationDigest,
        fixture.runIdHash,
        fixture.databaseTargetDigest,
        fixture.callerIdentityHmac,
        fixture.runtimeRole,
        fixture.leaseReferenceSha256,
        fixture.sessionBindingSha256,
        fixture.material.verifier,
        fixture.material.verifierSha256,
        fixture.expiresAt,
      ]);
      const value = exactBrokerResult(result, "ISSUED_UNBOUND", fixture);
      if (
        value.runtimeRole !== fixture.runtimeRole ||
        value.credentialVerifierSha256 !== fixture.material.verifierSha256 ||
        value.expiresAt !== fixture.expiresAt
      ) {
        fail("broker-acquire-result");
      }
      return value;
    },
    async bind(fixture, backendPid) {
      const result = await client.query(BIND_SQL, [
        fixture.acquisitionDigest,
        backendPid,
      ]);
      const value = exactBrokerResult(result, "ACTIVE", fixture);
      if (value.backendPid !== backendPid) fail("broker-bind-result");
      return value;
    },
    async assertActive(fixture, backendPid) {
      const result = await client.query(`
        select
          acquisition.state = 'ACTIVE' as active_state,
          not acquisition.future_issuance_blocked
            and acquisition.tombstoned_at is null
            and acquisition.revoked_at is null as open_fence,
          acquisition.expires_at >
            pg_catalog.date_trunc(
              'milliseconds', pg_catalog.clock_timestamp()
            ) + pg_catalog.make_interval(secs => 5) as live_expiry,
          acquisition.runtime_role = $2
            and acquisition.runtime_role_oid = pg_catalog.to_regrole($2)
            as runtime_identity,
          acquisition.bound_backend_pid = $3
            and acquisition.bound_backend_start = activity.backend_start
            as backend_identity,
          acquisition.authorization_digest = $4
            and acquisition.run_id_hash = $5
            and acquisition.caller_identity_hmac = $6
            as statement_identity,
          role_record.oid is not null
            and not role_record.rolcanlogin
            and not role_record.rolsuper
            and not role_record.rolcreatedb
            and not role_record.rolcreaterole
            and role_record.rolinherit
            and not role_record.rolreplication
            and not role_record.rolbypassrls
            and role_record.rolconnlimit = 1
            and role_record.rolvaliduntil = acquisition.expires_at
            as runtime_posture,
          (
            select pg_catalog.count(*) = 1
            from pg_catalog.pg_auth_members as membership
            where membership.member = acquisition.runtime_role_oid
              and membership.roleid = pg_catalog.to_regrole(
                'careslink_v1_preview_runner_terminal_caller'
              )
              and not membership.admin_option
              and membership.inherit_option
              and not membership.set_option
          ) as exact_caller_membership,
          pg_catalog.pg_has_role(
            acquisition.runtime_role_oid,
            pg_catalog.to_regrole(
              'careslink_v1_preview_runner_terminal_caller'
            ),
            'USAGE'
          )
            and not pg_catalog.pg_has_role(
              acquisition.runtime_role_oid,
              pg_catalog.to_regrole(
                'careslink_v1_preview_runner_terminal_caller'
              ),
              'SET'
            ) as inherited_caller_without_set,
          (
            select pg_catalog.count(*) = 1
            from pg_catalog.pg_auth_members as membership
            where membership.member = acquisition.runtime_role_oid
          ) as single_membership,
          (
            select pg_catalog.count(*) = 1
            from pg_catalog.pg_auth_members as membership
            where membership.roleid = acquisition.runtime_role_oid
          ) and not exists (
            select 1
            from pg_catalog.pg_auth_members as membership
            join pg_catalog.pg_roles as grantor_role
              on grantor_role.oid = membership.grantor
            where membership.roleid = acquisition.runtime_role_oid
              and not (
                membership.member = pg_catalog.to_regrole('postgres')
                and grantor_role.rolsuper
                and membership.grantor <> membership.member
                and membership.admin_option
                and not membership.inherit_option
                and not membership.set_option
              )
          ) as inert_creator_membership,
          (
            select pg_catalog.count(*) = 1
            from pg_catalog.pg_stat_activity as candidate
            where candidate.backend_type = 'client backend'
              and (
                candidate.usesysid = acquisition.runtime_role_oid
                or candidate.usename = acquisition.runtime_role
              )
          ) as single_session,
          activity.application_name = $7
            and activity.backend_type = 'client backend'
            and activity.usename = acquisition.runtime_role
            and activity.usesysid = acquisition.runtime_role_oid
            as session_posture
        from careslink_v1_runtime_broker.acquisitions as acquisition
        left join pg_catalog.pg_roles as role_record
          on role_record.oid = acquisition.runtime_role_oid
            and role_record.rolname = acquisition.runtime_role
        left join pg_catalog.pg_stat_activity as activity
          on activity.pid = acquisition.bound_backend_pid
            and activity.backend_start = acquisition.bound_backend_start
        where acquisition.acquisition_digest = $1
      `, [
        fixture.acquisitionDigest,
        fixture.runtimeRole,
        backendPid,
        fixture.authorizationDigest,
        fixture.runIdHash,
        fixture.callerIdentityHmac,
        RUNTIME_APPLICATION_NAME,
      ]);
      const row = result.rows[0];
      const checks = [
        "active_state",
        "open_fence",
        "live_expiry",
        "runtime_identity",
        "backend_identity",
        "statement_identity",
        "runtime_posture",
        "exact_caller_membership",
        "inherited_caller_without_set",
        "single_membership",
        "inert_creator_membership",
        "single_session",
        "session_posture",
      ];
      const failedCheck = checks.find((check) => row?.[check] !== true);
      if (failedCheck) fail(`active-posture-${failedCheck}`);
    },
    async tombstone(fixture) {
      const result = await client.query(TOMBSTONE_SQL, [
        fixture.acquisitionDigest,
      ]);
      const value = exactBrokerResult(result, "TOMBSTONED", fixture);
      if (value.futureIssuanceBlocked !== true || value.everIssued !== true) {
        fail("broker-tombstone-result");
      }
      return value;
    },
    async finalize(fixture) {
      const result = await client.query(FINALIZE_SQL, [
        fixture.acquisitionDigest,
      ]);
      const value = exactBrokerResult(result, "REVOKED", fixture);
      if (
        value.futureIssuanceBlocked !== true ||
        value.everIssued !== true ||
        value.roleCount !== 0 ||
        value.sessionCount !== 0 ||
        value.membershipCount !== 0
      ) {
        fail("broker-finalize-result");
      }
      return value;
    },
    async inspect(fixture) {
      const result = await client.query(INSPECT_SQL, [
        fixture.acquisitionDigest,
      ]);
      const value = exactBrokerResult(result, "REVOKED_ATTESTED", fixture);
      if (
        value.futureIssuanceBlocked !== true ||
        value.everIssued !== true ||
        value.roleCount !== 0 ||
        value.sessionCount !== 0 ||
        value.membershipCount !== 0 ||
        value.credentialVerifierResidueCount !== 0
      ) {
        fail("broker-inspect-result");
      }
      return value;
    },
  });
}

async function expectedDatabaseFailure(operation, expectedMarker) {
  try {
    await operation;
  } catch (error) {
    if (String(error?.message).includes(expectedMarker)) return;
  }
  fail("expected-database-rejection");
}

async function verifyStaticCallerDependencySet(client) {
  const result = await client.query(`
    with target as materialized (
      select
        database_record.oid as database_oid,
        caller_role.oid as caller_oid,
        generation_owner.oid as generation_owner_oid,
        generation_schema.oid as generation_schema_oid,
        wrapper_function.oid as wrapper_function_oid
      from pg_catalog.pg_database as database_record
      join pg_catalog.pg_roles as caller_role
        on caller_role.rolname =
          'careslink_v1_preview_runner_terminal_caller'
      join pg_catalog.pg_roles as generation_owner
        on generation_owner.rolname = 'careslink_v1_generation_owner'
      join pg_catalog.pg_namespace as generation_schema
        on generation_schema.nspname = 'careslink_v1_generation'
      join pg_catalog.pg_proc as wrapper_function
        on wrapper_function.pronamespace = generation_schema.oid
          and wrapper_function.proname =
            'persist_verified_communication_note_preview_runner_terminal'
          and wrapper_function.prokind = 'f'
          and wrapper_function.pronargs = 3
          and wrapper_function.proargtypes[0] =
            'pg_catalog.jsonb'::pg_catalog.regtype
          and wrapper_function.proargtypes[1] =
            'pg_catalog.text'::pg_catalog.regtype
          and wrapper_function.proargtypes[2] =
            'pg_catalog.text'::pg_catalog.regtype
          and wrapper_function.prorettype =
            'pg_catalog.jsonb'::pg_catalog.regtype
      where database_record.datname = pg_catalog.current_database()
    )
    select
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
      ) as exact_dependency_count,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.deptype = 'a'
          and dependency.dbid = target.database_oid
          and dependency.classid =
            'pg_catalog.pg_namespace'::pg_catalog.regclass
          and dependency.objid = target.generation_schema_oid
          and dependency.objsubid = 0
      ) as exact_generation_schema_dependency,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.deptype = 'a'
          and dependency.dbid = target.database_oid
          and dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          and dependency.objid = target.wrapper_function_oid
          and dependency.objsubid = 0
      ) as exact_terminal_wrapper_dependency,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.deptype = 'o'
      ) as zero_owner_dependency,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.deptype = 'r'
      ) as zero_policy_dependency,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.dbid = 0
      ) as zero_shared_dependency,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and dependency.dbid not in (0, target.database_oid)
      ) as zero_other_database_dependency,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = target.caller_oid
          and not (
            dependency.deptype = 'a'
            and dependency.dbid = target.database_oid
            and dependency.objsubid = 0
            and (
              (
                dependency.classid =
                  'pg_catalog.pg_namespace'::pg_catalog.regclass
                and dependency.objid = target.generation_schema_oid
              )
              or (
                dependency.classid =
                  'pg_catalog.pg_proc'::pg_catalog.regclass
                and dependency.objid = target.wrapper_function_oid
              )
            )
          )
      ) as zero_unexpected_dependency,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_namespace as namespace_record
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            namespace_record.nspacl,
            pg_catalog.acldefault('n', namespace_record.nspowner)
          )
        ) as acl
        where namespace_record.oid = target.generation_schema_oid
          and (
            acl.grantee = target.caller_oid
            or acl.grantor = target.caller_oid
          )
      ) as exact_schema_caller_reference_count,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_namespace as namespace_record
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            namespace_record.nspacl,
            pg_catalog.acldefault('n', namespace_record.nspowner)
          )
        ) as acl
        where namespace_record.oid = target.generation_schema_oid
          and acl.grantee = target.caller_oid
          and acl.grantor = target.generation_owner_oid
          and acl.privilege_type = 'USAGE'
          and not acl.is_grantable
      ) as exact_schema_caller_acl
    from target
  `);
  const row = result.rows[0];
  for (const check of [
    "exact_dependency_count",
    "exact_generation_schema_dependency",
    "exact_terminal_wrapper_dependency",
    "zero_owner_dependency",
    "zero_policy_dependency",
    "zero_shared_dependency",
    "zero_other_database_dependency",
    "zero_unexpected_dependency",
    "exact_schema_caller_reference_count",
    "exact_schema_caller_acl",
  ]) {
    if (row?.[check] !== true) {
      fail(`static-caller-dependency-${check}`);
    }
  }
}

async function runStaticCallerOwnershipRejectionScenario(
  adminClient,
  managementClient,
  broker,
) {
  const fixture = createFixture("static-caller-owner-rejection");
  let probeCreated = false;
  try {
    const initial = await adminClient.query(`
      select pg_catalog.to_regnamespace($1) is null as probe_absent
    `, [STATIC_CALLER_OWNER_PROBE_SCHEMA]);
    if (initial.rows[0]?.probe_absent !== true) {
      fail("static-caller-owner-probe-preexisting");
    }
    await adminClient.query(`
      create schema careslink_v1_m1l_static_caller_owner_probe
      authorization careslink_v1_preview_runner_terminal_caller
    `);
    probeCreated = true;

    const ownerDependency = await adminClient.query(`
      select pg_catalog.count(*) = 1 as exact_owner_dependency
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = pg_catalog.to_regrole(
          'careslink_v1_preview_runner_terminal_caller'
        )
        and dependency.deptype = 'o'
        and dependency.dbid = (
          select database_record.oid
          from pg_catalog.pg_database as database_record
          where database_record.datname = pg_catalog.current_database()
        )
        and dependency.classid =
          'pg_catalog.pg_namespace'::pg_catalog.regclass
        and dependency.objid = pg_catalog.to_regnamespace($1)
        and dependency.objsubid = 0
    `, [STATIC_CALLER_OWNER_PROBE_SCHEMA]);
    if (ownerDependency.rows[0]?.exact_owner_dependency !== true) {
      fail("static-caller-owner-probe-dependency");
    }

    await expectedDatabaseFailure(
      broker.acquire(fixture),
      "RUNTIME_CREDENTIAL_TERMINAL_STATIC_POSTURE_UNSAFE",
    );

    const residue = await managementClient.query(`
      select
        not exists (
          select 1
          from careslink_v1_runtime_broker.acquisitions as acquisition
          where acquisition.acquisition_digest = $1
        ) as zero_ledger,
        pg_catalog.to_regrole($2) is null as zero_runtime_role,
        not exists (
          select 1
          from pg_catalog.pg_roles as role_record
          where role_record.rolname = $2
        ) as zero_named_role
    `, [fixture.acquisitionDigest, fixture.runtimeRole]);
    const row = residue.rows[0];
    if (
      row?.zero_ledger !== true ||
      row?.zero_runtime_role !== true ||
      row?.zero_named_role !== true
    ) {
      fail("static-caller-owner-rejection-residue");
    }
  } finally {
    if (probeCreated) {
      await adminClient.query(`
        drop schema careslink_v1_m1l_static_caller_owner_probe
      `);
    }
    disposeFixtureMaterial(fixture);
  }

  const cleanup = await adminClient.query(`
    select pg_catalog.to_regnamespace($1) is null as probe_absent
  `, [STATIC_CALLER_OWNER_PROBE_SCHEMA]);
  if (cleanup.rows[0]?.probe_absent !== true) {
    fail("static-caller-owner-probe-cleanup");
  }
  await verifyStaticCallerDependencySet(managementClient);
}

async function verifyInnerGrantBlocksBind(
  adminClient,
  broker,
  fixture,
  backendPid,
) {
  let grantCreated = false;
  try {
    await adminClient.query(`
      grant execute on function
        careslink_v1_generation._persist_verified_communication_note_preview_terminal_unfenced(
          pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
        )
      to careslink_v1_preview_runner_terminal_caller
    `);
    grantCreated = true;
    const posture = await adminClient.query(`
      select
        pg_catalog.has_function_privilege(
          'careslink_v1_preview_runner_terminal_caller',
          inner_function.oid,
          'EXECUTE'
        ) as caller_inner_execute,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole(
              'careslink_v1_preview_runner_terminal_caller'
            )
            and dependency.deptype = 'a'
            and dependency.dbid = (
              select database_record.oid
              from pg_catalog.pg_database as database_record
              where database_record.datname = pg_catalog.current_database()
            )
            and dependency.classid =
              'pg_catalog.pg_proc'::pg_catalog.regclass
            and dependency.objid = inner_function.oid
            and dependency.objsubid = 0
        ) as exact_inner_dependency
      from pg_catalog.pg_proc as inner_function
      join pg_catalog.pg_namespace as inner_namespace
        on inner_namespace.oid = inner_function.pronamespace
          and inner_namespace.nspname = 'careslink_v1_generation'
      where inner_function.proname =
          '_persist_verified_communication_note_preview_terminal_unfenced'
        and inner_function.prokind = 'f'
        and inner_function.pronargs = 3
        and inner_function.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and inner_function.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and inner_function.proargtypes[2] =
          'pg_catalog.text'::pg_catalog.regtype
        and inner_function.prorettype =
          'pg_catalog.jsonb'::pg_catalog.regtype
    `);
    if (
      posture.rows[0]?.caller_inner_execute !== true ||
      posture.rows[0]?.exact_inner_dependency !== true
    ) {
      fail("inner-grant-probe-posture");
    }

    await expectedDatabaseFailure(
      broker.bind(fixture, backendPid),
      "RUNTIME_CREDENTIAL_TERMINAL_STATIC_POSTURE_UNSAFE",
    );
    const unchanged = await adminClient.query(`
      select pg_catalog.count(*) = 1 as issued_unbound
      from careslink_v1_runtime_broker.acquisitions as acquisition
      where acquisition.acquisition_digest = $1
        and acquisition.state = 'ISSUED_UNBOUND'
        and acquisition.bound_backend_pid is null
        and acquisition.bound_backend_start is null
        and acquisition.bound_at is null
    `, [fixture.acquisitionDigest]);
    if (unchanged.rows[0]?.issued_unbound !== true) {
      fail("inner-grant-bind-state-mutated");
    }
  } finally {
    if (grantCreated) {
      await adminClient.query(`
        revoke execute on function
          careslink_v1_generation._persist_verified_communication_note_preview_terminal_unfenced(
            pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
          )
        from careslink_v1_preview_runner_terminal_caller
      `);
    }
  }

  const cleanup = await adminClient.query(`
    select
      not pg_catalog.has_function_privilege(
        'careslink_v1_preview_runner_terminal_caller',
        inner_function.oid,
        'EXECUTE'
      ) as caller_inner_denied,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = pg_catalog.to_regrole(
            'careslink_v1_preview_runner_terminal_caller'
          )
          and dependency.dbid = (
            select database_record.oid
            from pg_catalog.pg_database as database_record
            where database_record.datname = pg_catalog.current_database()
          )
          and dependency.classid =
            'pg_catalog.pg_proc'::pg_catalog.regclass
          and dependency.objid = inner_function.oid
      ) as zero_inner_dependency
    from pg_catalog.pg_proc as inner_function
    join pg_catalog.pg_namespace as inner_namespace
      on inner_namespace.oid = inner_function.pronamespace
        and inner_namespace.nspname = 'careslink_v1_generation'
    where inner_function.proname =
        '_persist_verified_communication_note_preview_terminal_unfenced'
      and inner_function.prokind = 'f'
      and inner_function.pronargs = 3
      and inner_function.proargtypes[0] =
        'pg_catalog.jsonb'::pg_catalog.regtype
      and inner_function.proargtypes[1] =
        'pg_catalog.text'::pg_catalog.regtype
      and inner_function.proargtypes[2] =
        'pg_catalog.text'::pg_catalog.regtype
      and inner_function.prorettype =
        'pg_catalog.jsonb'::pg_catalog.regtype
  `);
  if (
    cleanup.rows[0]?.caller_inner_denied !== true ||
    cleanup.rows[0]?.zero_inner_dependency !== true
  ) {
    fail("inner-grant-probe-cleanup");
  }
  await verifyStaticCallerDependencySet(adminClient);
}

async function openAndBindRuntime(
  lifecycle,
  broker,
  fixture,
  options = {},
) {
  const { acquire = true, beforeBind = null } = options;
  if (acquire) {
    await runDatabaseStage("broker-acquire", () => broker.acquire(fixture));
  }
  fixture.material.verifier = null;
  const runtimeClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle, {
      application_name: RUNTIME_APPLICATION_NAME,
      password: fixture.material.password,
      user: fixture.runtimeRole,
    }),
  );
  fixture.material.password = null;
  const backend = await runDatabaseStage("runtime-backend", () =>
    runtimeClient.query(`
      select
        pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid,
        pg_catalog.current_setting('lock_timeout') as lock_timeout,
        pg_catalog.current_setting('statement_timeout') as statement_timeout
    `),
  );
  const backendPid = Number(backend.rows[0]?.backend_pid);
  if (
    !Number.isSafeInteger(backendPid) ||
    backendPid <= 0 ||
    backend.rows[0]?.lock_timeout !== "1s" ||
    backend.rows[0]?.statement_timeout !== "5s"
  ) {
    fail("runtime-posture");
  }
  if (beforeBind !== null) {
    await beforeBind(backendPid);
  }
  await runDatabaseStage("broker-bind", () =>
    broker.bind(fixture, backendPid),
  );
  await runDatabaseStage("active-posture", () =>
    broker.assertActive(fixture, backendPid),
  );
  return runtimeClient;
}

function terminalStatement(fixture, authorizationDigest = null) {
  return Object.freeze({
    authorizationDigest: authorizationDigest ?? fixture.authorizationDigest,
    runIdHash: fixture.runIdHash,
  });
}

async function beginTerminal(runtimeClient) {
  await runtimeClient.query("begin");
}

async function verifyInheritedCallerWithoutSet(runtimeClient, fixture) {
  const identity = await runtimeClient.query(`
    select
      current_user = session_user
        and current_user = $1 as direct_runtime_identity,
      pg_catalog.pg_has_role(
        current_user,
        'careslink_v1_preview_runner_terminal_caller',
        'USAGE'
      ) as inherited_caller_usage,
      not pg_catalog.pg_has_role(
        current_user,
        'careslink_v1_preview_runner_terminal_caller',
        'SET'
      ) as caller_set_denied,
      pg_catalog.has_function_privilege(
        current_user,
        'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(pg_catalog.jsonb,pg_catalog.text,pg_catalog.text)',
        'EXECUTE'
      ) as inherited_terminal_execute
  `, [fixture.runtimeRole]);
  const row = identity.rows[0];
  for (const check of [
    "direct_runtime_identity",
    "inherited_caller_usage",
    "caller_set_denied",
    "inherited_terminal_execute",
  ]) {
    if (row?.[check] !== true) fail(`runtime-inheritance-${check}`);
  }

  await expectedDatabaseFailure(
    runtimeClient.query(
      "set role careslink_v1_preview_runner_terminal_caller",
    ),
    "permission denied to set role",
  );
  await expectedDatabaseFailure(
    runtimeClient.query(
      "select pg_catalog.set_config('role', 'careslink_v1_preview_runner_terminal_caller', false)",
    ),
    "permission denied to set role",
  );
}

async function verifyCreatedObjectsRemainRuntimeOwned(runtimeClient, fixture) {
  const created = await runtimeClient.query(`
    select pg_catalog.lo_create(0)::pg_catalog.oid as large_object_oid
  `);
  const largeObjectOid = Number(created.rows[0]?.large_object_oid);
  if (!Number.isSafeInteger(largeObjectOid) || largeObjectOid <= 0) {
    fail("runtime-owned-object-create");
  }

  await expectedDatabaseFailure(
    runtimeClient.query(
      `alter large object ${largeObjectOid} owner to careslink_v1_preview_runner_terminal_caller`,
    ),
    "must be able to SET ROLE",
  );

  const ownership = await runtimeClient.query(`
    select
      metadata.lomowner = pg_catalog.to_regrole($2)
        and metadata.lomowner = pg_catalog.to_regrole(current_user)
        as runtime_owned
    from pg_catalog.pg_largeobject_metadata as metadata
    where metadata.oid = $1::pg_catalog.oid
  `, [largeObjectOid, fixture.runtimeRole]);
  if (ownership.rows[0]?.runtime_owned !== true) {
    fail("runtime-owned-object-owner");
  }

  const removed = await runtimeClient.query(
    "select pg_catalog.lo_unlink($1::pg_catalog.oid) as removed",
    [largeObjectOid],
  );
  if (Number(removed.rows[0]?.removed) !== 1) {
    fail("runtime-owned-object-cleanup");
  }
}

async function callTerminal(runtimeClient, fixture, statement) {
  const result = await runtimeClient.query(TERMINAL_SQL, [
    statement,
    "m1l-local-stub-signature",
    fixture.callerIdentityHmac,
  ]);
  const value = result.rows[0]?.result;
  if (
    !value ||
    value.accepted !== true ||
    value.status !== "STUB_ACCEPTED" ||
    value.authorizationDigest !== statement.authorizationDigest ||
    value.runIdHash !== statement.runIdHash
  ) {
    fail("terminal-result");
  }
  return value;
}

async function finalizeAndInspect(broker, fixture) {
  await runDatabaseStage("broker-finalize", () => broker.finalize(fixture));
  await runDatabaseStage("broker-inspect", () => broker.inspect(fixture));
}

async function runNormalAndAuthorizationMismatchScenario(
  lifecycle,
  broker,
  adminClient,
) {
  const fixture = createFixture("normal-and-auth-mismatch");
  lifecycle.fixtures.push(fixture);
  const runtimeClient = await openAndBindRuntime(
    lifecycle,
    broker,
    fixture,
    {
      beforeBind: (backendPid) =>
        verifyInnerGrantBlocksBind(
          adminClient,
          broker,
          fixture,
          backendPid,
        ),
    },
  );

  await runDatabaseStage("runtime-inheritance", () =>
    verifyInheritedCallerWithoutSet(runtimeClient, fixture),
  );
  await runDatabaseStage("runtime-owned-object", () =>
    verifyCreatedObjectsRemainRuntimeOwned(runtimeClient, fixture),
  );

  await beginTerminal(runtimeClient);
  await runDatabaseStage("normal-terminal", () =>
    callTerminal(runtimeClient, fixture, terminalStatement(fixture)),
  );
  await runtimeClient.query("commit");

  await beginTerminal(runtimeClient);
  await expectedDatabaseFailure(
    runtimeClient.query(TERMINAL_SQL, [
      terminalStatement(fixture, sha256("m1l:wrong-authorization")),
      "m1l-local-stub-signature",
      fixture.callerIdentityHmac,
    ]),
    "RUNTIME_CREDENTIAL_NOT_ACTIVE",
  );
  await runtimeClient.query("rollback");

  await beginTerminal(runtimeClient);
  await runtimeClient.query("set local statement_timeout = '0'");
  await expectedDatabaseFailure(
    runtimeClient.query(TERMINAL_SQL, [
      terminalStatement(fixture),
      "m1l-local-stub-signature",
      fixture.callerIdentityHmac,
    ]),
    "RUNTIME_CREDENTIAL_NOT_ACTIVE",
  );
  await runtimeClient.query("rollback");

  await runDatabaseStage("normal-tombstone", () =>
    broker.tombstone(fixture),
  );
  await finalizeAndInspect(broker, fixture);
  await closeClient(lifecycle, runtimeClient);
  disposeFixtureMaterial(fixture);
}

async function waitForAdvisoryWaiter(observerClient) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await observerClient.query(`
      select pg_catalog.count(*)::pg_catalog.int4 as waiter_count
      from pg_catalog.pg_locks as lock_record
      where lock_record.locktype = 'advisory'
        and not lock_record.granted
    `);
    if (Number(result.rows[0]?.waiter_count) === 1) return;
    await sleep(10);
  }
  fail("advisory-waiter");
}

async function runTerminalFirstScenario(lifecycle, managementClient) {
  const fixture = createFixture("terminal-first");
  lifecycle.fixtures.push(fixture);
  const broker = createBroker(managementClient);
  const runtimeClient = await openAndBindRuntime(
    lifecycle,
    broker,
    fixture,
  );
  const tombstoneClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const observerClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );

  await beginTerminal(runtimeClient);
  await callTerminal(runtimeClient, fixture, terminalStatement(fixture));
  await runtimeClient.query(
    "set local application_name = 'careslink-runtime-drift-probe'",
  );
  await expectedDatabaseFailure(
    runtimeClient.query(TERMINAL_SQL, [
      terminalStatement(fixture),
      "m1l-local-stub-signature",
      fixture.callerIdentityHmac,
    ]),
    "RUNTIME_CREDENTIAL_NOT_ACTIVE",
  );
  await runtimeClient.query("rollback");

  await beginTerminal(runtimeClient);
  await callTerminal(runtimeClient, fixture, terminalStatement(fixture));
  await runtimeClient.query(
    "set local application_name = 'careslink-runtime-drift-probe'",
  );
  await runtimeClient.query(
    "set local idle_in_transaction_session_timeout = '0'",
  );
  await runtimeClient.query("set local idle_session_timeout = '0'");
  await runtimeClient.query("set local statement_timeout = '0'");

  const tombstonePromise = createBroker(tombstoneClient).tombstone(fixture);
  const tombstoneOutcome = tombstonePromise.then(
    (value) => Object.freeze({ ok: true, value }),
    (error) => Object.freeze({ ok: false, error }),
  );
  await waitForAdvisoryWaiter(observerClient);
  const outcome = await tombstoneOutcome;
  if (!outcome.ok || outcome.value.status !== "TOMBSTONED") {
    databaseFailure("terminal-first-tombstone", outcome.error);
  }
  let runtimeSessionTerminated = false;
  try {
    await runtimeClient.query("select 1");
  } catch {
    runtimeSessionTerminated = true;
  }
  if (!runtimeSessionTerminated) fail("terminal-first-session-remains");

  await finalizeAndInspect(broker, fixture);
  await Promise.all([
    closeClient(lifecycle, runtimeClient),
    closeClient(lifecycle, tombstoneClient),
    closeClient(lifecycle, observerClient),
  ]);
  disposeFixtureMaterial(fixture);
}

async function runTombstoneFirstScenario(lifecycle, managementClient) {
  const fixture = createFixture("tombstone-first");
  lifecycle.fixtures.push(fixture);
  const broker = createBroker(managementClient);
  const runtimeClient = await openAndBindRuntime(
    lifecycle,
    broker,
    fixture,
  );
  const tombstoneClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const tombstoneBroker = createBroker(tombstoneClient);

  await tombstoneClient.query("begin");
  await tombstoneBroker.tombstone(fixture);

  await beginTerminal(runtimeClient);
  await expectedDatabaseFailure(
    runtimeClient.query(TERMINAL_SQL, [
      terminalStatement(fixture),
      "m1l-local-stub-signature",
      fixture.callerIdentityHmac,
    ]),
    "RUNTIME_CREDENTIAL_NOT_ACTIVE",
  );
  await runtimeClient.query("rollback");
  await tombstoneClient.query("commit");

  await finalizeAndInspect(broker, fixture);
  await Promise.all([
    closeClient(lifecycle, runtimeClient),
    closeClient(lifecycle, tombstoneClient),
  ]);
  disposeFixtureMaterial(fixture);
}

async function createCrossDatabaseResidueDatabase(adminClient) {
  const initial = await adminClient.query(`
    select not exists (
      select 1
      from pg_catalog.pg_database as database_record
      where database_record.datname = $1
    ) as database_absent
  `, [CROSS_DATABASE_RESIDUE_DATABASE]);
  if (initial.rows[0]?.database_absent !== true) {
    fail("cross-database-residue-preexisting");
  }
  await adminClient.query(`
    create database careslink_v1_m1l_runtime_residue
      with template template0
      encoding 'UTF8'
      lc_collate 'C'
      lc_ctype 'C'
  `);
  const created = await adminClient.query(`
    select pg_catalog.count(*) = 1 as exact_database
    from pg_catalog.pg_database as database_record
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = database_record.datdba
    where database_record.datname = $1
      and owner_role.rolname = 'bootstrap_admin'
      and database_record.datallowconn
      and not database_record.datistemplate
  `, [CROSS_DATABASE_RESIDUE_DATABASE]);
  if (created.rows[0]?.exact_database !== true) {
    fail("cross-database-residue-create");
  }
}

async function dropCrossDatabaseResidueDatabase(adminClient) {
  await adminClient.query(`
    drop database careslink_v1_m1l_runtime_residue with (force)
  `);
  const removed = await adminClient.query(`
    select not exists (
      select 1
      from pg_catalog.pg_database as database_record
      where database_record.datname = $1
    ) as database_absent
  `, [CROSS_DATABASE_RESIDUE_DATABASE]);
  if (removed.rows[0]?.database_absent !== true) {
    fail("cross-database-residue-cleanup");
  }
}

async function runCrossDatabaseResidueScenario(
  lifecycle,
  adminClient,
  managementClient,
) {
  const fixture = createFixture("cross-database-residue");
  lifecycle.fixtures.push(fixture);
  const broker = createBroker(managementClient);
  let databaseCreated = false;
  let remoteRuntimeClient = null;
  let remoteAdminClient = null;
  let runtimeClient = null;
  try {
    await createCrossDatabaseResidueDatabase(adminClient);
    databaseCreated = true;
    await broker.acquire(fixture);
    fixture.material.verifier = null;

    const targetPosture = await managementClient.query(`
      select
        pg_catalog.has_database_privilege(
          $2, database_record.oid, 'CONNECT'
        ) as runtime_connect,
        not pg_catalog.has_database_privilege(
          $2, database_record.oid, 'CREATE'
        ) as runtime_create_denied
      from pg_catalog.pg_database as database_record
      where database_record.datname = $1
    `, [CROSS_DATABASE_RESIDUE_DATABASE, fixture.runtimeRole]);
    if (
      targetPosture.rows[0]?.runtime_connect !== true ||
      targetPosture.rows[0]?.runtime_create_denied !== true
    ) {
      fail("cross-database-residue-target-posture");
    }

    remoteRuntimeClient = await openClient(
      lifecycle,
      clientConfiguration(lifecycle, {
        application_name: RUNTIME_APPLICATION_NAME,
        database: CROSS_DATABASE_RESIDUE_DATABASE,
        password: fixture.material.password,
        user: fixture.runtimeRole,
      }),
    );
    const remoteIdentity = await remoteRuntimeClient.query(`
      select
        current_user = session_user
          and current_user = $1 as direct_runtime_identity,
        pg_catalog.current_database() = $2 as exact_database,
        pg_catalog.current_setting('application_name') = $3
          as exact_application,
        pg_catalog.inet_server_addr() is null as no_tcp_address,
        pg_catalog.inet_server_port() is null as no_tcp_port
    `, [
      fixture.runtimeRole,
      CROSS_DATABASE_RESIDUE_DATABASE,
      RUNTIME_APPLICATION_NAME,
    ]);
    for (const check of [
      "direct_runtime_identity",
      "exact_database",
      "exact_application",
      "no_tcp_address",
      "no_tcp_port",
    ]) {
      if (remoteIdentity.rows[0]?.[check] !== true) {
        fail(`cross-database-residue-identity-${check}`);
      }
    }

    const created = await remoteRuntimeClient.query(`
      select pg_catalog.lo_create(0)::pg_catalog.oid as large_object_oid
    `);
    const largeObjectOid = Number(created.rows[0]?.large_object_oid);
    if (!Number.isSafeInteger(largeObjectOid) || largeObjectOid <= 0) {
      fail("cross-database-residue-large-object-create");
    }
    const remoteOwnership = await remoteRuntimeClient.query(`
      select
        metadata.lomowner = pg_catalog.to_regrole($2)
          and metadata.lomowner = pg_catalog.to_regrole(current_user)
          as runtime_owned,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole($2)
            and dependency.deptype = 'o'
            and dependency.dbid = (
              select database_record.oid
              from pg_catalog.pg_database as database_record
              where database_record.datname = pg_catalog.current_database()
            )
            and dependency.classid =
              'pg_catalog.pg_largeobject'::pg_catalog.regclass
            and dependency.objid = metadata.oid
            and dependency.objsubid = 0
        ) as exact_owner_dependency,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole($2)
            and dependency.deptype = 'o'
        ) as exact_total_owner_dependency
      from pg_catalog.pg_largeobject_metadata as metadata
      where metadata.oid = $1::pg_catalog.oid
    `, [largeObjectOid, fixture.runtimeRole]);
    if (
      remoteOwnership.rows[0]?.runtime_owned !== true ||
      remoteOwnership.rows[0]?.exact_owner_dependency !== true ||
      remoteOwnership.rows[0]?.exact_total_owner_dependency !== true
    ) {
      fail("cross-database-residue-large-object-owner");
    }
    await closeClient(lifecycle, remoteRuntimeClient);
    remoteRuntimeClient = null;

    runtimeClient = await openAndBindRuntime(
      lifecycle,
      broker,
      fixture,
      { acquire: false },
    );
    await broker.tombstone(fixture);
    await closeClient(lifecycle, runtimeClient);
    runtimeClient = null;

    let finalizeDependencyFailure = null;
    try {
      await broker.finalize(fixture);
    } catch (error) {
      finalizeDependencyFailure = error;
    }
    if (
      finalizeDependencyFailure?.code !== "2BP01" ||
      !String(finalizeDependencyFailure?.message).includes(
        "cannot be dropped because some objects depend on it",
      ) ||
      !String(finalizeDependencyFailure?.detail).includes(
        "1 object in database",
      ) ||
      !String(finalizeDependencyFailure?.detail).includes(
        `database ${CROSS_DATABASE_RESIDUE_DATABASE}`,
      )
    ) {
      fail("cross-database-residue-finalize-rejection");
    }

    const rollbackPosture = await managementClient.query(`
      select
        acquisition.state = 'TOMBSTONED'
          and acquisition.tombstoned_at is not null
          and acquisition.future_issuance_blocked
          and acquisition.revoked_at is null as ledger_tombstoned,
        role_record.oid = acquisition.runtime_role_oid
          and role_record.rolname = acquisition.runtime_role
          and not role_record.rolcanlogin as role_nologin,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_auth_members as membership
          where membership.member = acquisition.runtime_role_oid
            and membership.roleid = pg_catalog.to_regrole(
              'careslink_v1_preview_runner_terminal_caller'
            )
            and not membership.admin_option
            and membership.inherit_option
            and not membership.set_option
        ) as caller_membership_preserved,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_auth_members as membership
          where membership.member = acquisition.runtime_role_oid
        ) as single_caller_membership
      from careslink_v1_runtime_broker.acquisitions as acquisition
      join pg_catalog.pg_roles as role_record
        on role_record.oid = acquisition.runtime_role_oid
          and role_record.rolname = acquisition.runtime_role
      where acquisition.acquisition_digest = $1
    `, [fixture.acquisitionDigest]);
    for (const check of [
      "ledger_tombstoned",
      "role_nologin",
      "caller_membership_preserved",
      "single_caller_membership",
    ]) {
      if (rollbackPosture.rows[0]?.[check] !== true) {
        fail(`cross-database-residue-rollback-${check}`);
      }
    }

    remoteAdminClient = await openClient(
      lifecycle,
      clientConfiguration(lifecycle, {
        application_name: MANAGEMENT_APPLICATION_NAME,
        database: CROSS_DATABASE_RESIDUE_DATABASE,
        user: "bootstrap_admin",
      }),
    );
    const residue = await remoteAdminClient.query(`
      select
        metadata.lomowner = pg_catalog.to_regrole($2)
          as runtime_owned,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole($2)
            and dependency.deptype = 'o'
            and dependency.dbid = (
              select database_record.oid
              from pg_catalog.pg_database as database_record
              where database_record.datname = pg_catalog.current_database()
            )
            and dependency.classid =
              'pg_catalog.pg_largeobject'::pg_catalog.regclass
            and dependency.objid = metadata.oid
            and dependency.objsubid = 0
        ) as exact_owner_dependency,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole($2)
            and dependency.deptype = 'o'
        ) as exact_total_owner_dependency
      from pg_catalog.pg_largeobject_metadata as metadata
      where metadata.oid = $1::pg_catalog.oid
    `, [largeObjectOid, fixture.runtimeRole]);
    if (
      residue.rows[0]?.runtime_owned !== true ||
      residue.rows[0]?.exact_owner_dependency !== true ||
      residue.rows[0]?.exact_total_owner_dependency !== true
    ) {
      fail("cross-database-residue-preserved");
    }
    const removed = await remoteAdminClient.query(`
      select pg_catalog.lo_unlink($1::pg_catalog.oid) as removed
    `, [largeObjectOid]);
    if (Number(removed.rows[0]?.removed) !== 1) {
      fail("cross-database-residue-unlink");
    }
    const residueRemoved = await remoteAdminClient.query(`
      select
        not exists (
          select 1
          from pg_catalog.pg_largeobject_metadata as metadata
          where metadata.oid = $1::pg_catalog.oid
        ) as object_absent,
        not exists (
          select 1
          from pg_catalog.pg_shdepend as dependency
          where dependency.refclassid =
              'pg_catalog.pg_authid'::pg_catalog.regclass
            and dependency.refobjid = pg_catalog.to_regrole($2)
            and dependency.deptype = 'o'
        ) as owner_dependency_absent
    `, [largeObjectOid, fixture.runtimeRole]);
    if (
      residueRemoved.rows[0]?.object_absent !== true ||
      residueRemoved.rows[0]?.owner_dependency_absent !== true
    ) {
      fail("cross-database-residue-unlink-proof");
    }
    await closeClient(lifecycle, remoteAdminClient);
    remoteAdminClient = null;

    await finalizeAndInspect(broker, fixture);
  } finally {
    await Promise.all([
      closeClient(lifecycle, remoteRuntimeClient),
      closeClient(lifecycle, remoteAdminClient),
      closeClient(lifecycle, runtimeClient),
    ]);
    disposeFixtureMaterial(fixture);
    if (databaseCreated) {
      await dropCrossDatabaseResidueDatabase(adminClient);
    }
  }
}

async function verifyPostureAndApiAcl(client) {
  const result = await client.query(`
    select
      not postgres_role.rolsuper as postgres_not_superuser,
      postgres_role.rolcreaterole as postgres_createrole,
      postgres_role.rolbypassrls as postgres_bypassrls,
      pg_catalog.pg_has_role(
        'postgres', 'pg_signal_backend', 'USAGE'
      ) as postgres_signal_backend,
      pg_catalog.pg_has_role(
        'postgres', 'pg_read_all_stats', 'USAGE'
      ) as postgres_read_all_stats,
      broker_table.relrowsecurity as broker_rls,
      broker_table.relforcerowsecurity as broker_force_rls,
      (
        select pg_catalog.count(*)
        from pg_catalog.unnest($1::pg_catalog.text[]) as api(role_name)
        where pg_catalog.has_schema_privilege(
          api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
        )
          or pg_catalog.has_table_privilege(
            api.role_name,
            'careslink_v1_runtime_broker.acquisitions',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_function_privilege(
            api.role_name,
            acquire_function.oid,
            'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            api.role_name,
            wrapper_function.oid,
            'EXECUTE'
          )
      )::pg_catalog.int4 as api_privilege_count,
      pg_catalog.has_function_privilege(
        'careslink_v1_preview_runner_terminal_caller',
        wrapper_function.oid,
        'EXECUTE'
      ) as caller_wrapper_execute,
      not pg_catalog.has_function_privilege(
        'careslink_v1_preview_runner_terminal_caller',
        inner_function.oid,
        'EXECUTE'
      ) as caller_inner_denied
    from pg_catalog.pg_roles as postgres_role
    join pg_catalog.pg_class as broker_table
      on broker_table.oid =
        'careslink_v1_runtime_broker.acquisitions'::pg_catalog.regclass
    join pg_catalog.pg_proc as acquire_function
      on acquire_function.proname = 'acquire'
        and acquire_function.pronargs = 11
    join pg_catalog.pg_namespace as acquire_namespace
      on acquire_namespace.oid = acquire_function.pronamespace
        and acquire_namespace.nspname = 'careslink_v1_runtime_broker'
    join pg_catalog.pg_proc as wrapper_function
      on wrapper_function.proname =
        'persist_verified_communication_note_preview_runner_terminal'
        and wrapper_function.pronargs = 3
        and wrapper_function.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and wrapper_function.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and wrapper_function.proargtypes[2] =
          'pg_catalog.text'::pg_catalog.regtype
    join pg_catalog.pg_namespace as wrapper_namespace
      on wrapper_namespace.oid = wrapper_function.pronamespace
        and wrapper_namespace.nspname = 'careslink_v1_generation'
    join pg_catalog.pg_proc as inner_function
      on inner_function.proname =
        '_persist_verified_communication_note_preview_terminal_unfenced'
        and inner_function.pronargs = 3
        and inner_function.proargtypes = wrapper_function.proargtypes
    join pg_catalog.pg_namespace as inner_namespace
      on inner_namespace.oid = inner_function.pronamespace
        and inner_namespace.nspname = 'careslink_v1_generation'
    where postgres_role.rolname = 'postgres'
  `, [API_ROLES]);
  const row = result.rows[0];
  if (
    row?.postgres_not_superuser !== true ||
    row?.postgres_createrole !== true ||
    row?.postgres_bypassrls !== true ||
    row?.postgres_signal_backend !== true ||
    row?.postgres_read_all_stats !== true ||
    row?.broker_rls !== true ||
    row?.broker_force_rls !== true ||
    Number(row?.api_privilege_count) !== 0 ||
    row?.caller_wrapper_execute !== true ||
    row?.caller_inner_denied !== true
  ) {
    fail("migration-posture-api-acl");
  }
}

async function verifyPredecessorPosture(client) {
  const result = await client.query(`
    select
      procedure.proowner = executor_role.oid as exact_owner,
      procedure.prosecdef as security_definer,
      procedure.provolatile = 'v' as volatile,
      procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
        as empty_search_path,
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.aclexplode(
          coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) as acl
        where acl.privilege_type = 'EXECUTE'
      ) as exact_acl_count,
      not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) as acl
        where acl.privilege_type = 'EXECUTE'
          and (
            acl.grantee not in (executor_role.oid, caller_role.oid)
            or acl.grantor <> executor_role.oid
            or acl.is_grantable
          )
      ) as exact_acl_grantees,
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_auth_members as membership
        where membership.roleid in (executor_role.oid, caller_role.oid)
          or membership.member in (executor_role.oid, caller_role.oid)
      ) as exact_bootstrap_membership_count,
      not exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as grantor_role
          on grantor_role.oid = membership.grantor
        where (
            membership.roleid in (executor_role.oid, caller_role.oid)
            or membership.member in (executor_role.oid, caller_role.oid)
          )
          and not (
            membership.roleid in (executor_role.oid, caller_role.oid)
            and membership.member = pg_catalog.to_regrole('postgres')
            and grantor_role.rolsuper
            and membership.grantor <> membership.member
            and membership.admin_option
            and not membership.inherit_option
            and not membership.set_option
          )
      ) as exact_bootstrap_membership_posture
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
        and namespace.nspname = 'careslink_v1_generation'
    join pg_catalog.pg_roles as executor_role
      on executor_role.rolname =
        'careslink_v1_preview_runner_terminal_executor'
    join pg_catalog.pg_roles as caller_role
      on caller_role.rolname =
        'careslink_v1_preview_runner_terminal_caller'
    where procedure.proname =
      'persist_verified_communication_note_preview_runner_terminal'
      and procedure.pronargs = 3
  `);
  const row = result.rows[0];
  for (const check of [
    "exact_owner",
    "security_definer",
    "volatile",
    "empty_search_path",
    "exact_acl_count",
    "exact_acl_grantees",
    "exact_bootstrap_membership_count",
    "exact_bootstrap_membership_posture",
  ]) {
    if (row?.[check] !== true) fail(`predecessor-posture-${check}`);
  }
}

async function readFinalCounts(lifecycle) {
  const client = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  try {
    const result = await client.query(`
      select
        pg_catalog.current_setting('server_version_num')::pg_catalog.int4
          as postgres_version_num,
        pg_catalog.count(*)::pg_catalog.int4 as tombstone_count,
        pg_catalog.count(*) filter (
          where acquisition.issued_at is not null
            and acquisition.state = 'REVOKED'
            and acquisition.tombstoned_at is not null
            and acquisition.future_issuance_blocked
            and acquisition.revoked_at is not null
            and not acquisition.reusable
            and not acquisition.raw_credential_material_present
        )::pg_catalog.int4 as revoked_issued_count,
        (
          select pg_catalog.count(*)::pg_catalog.int4
          from pg_catalog.pg_roles as role_record
          where role_record.rolname ~
            '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
        ) as runtime_role_count,
        (
          select pg_catalog.count(*)::pg_catalog.int4
          from pg_catalog.pg_stat_activity as activity
          where activity.usename ~
            '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
        ) as runtime_session_count,
        (
          select pg_catalog.count(*)::pg_catalog.int4
          from pg_catalog.pg_auth_members as membership
          join pg_catalog.pg_roles as member_role
            on member_role.oid = membership.member
          where member_role.rolname ~
            '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
        ) as runtime_membership_count
      from careslink_v1_runtime_broker.acquisitions as acquisition
    `);
    const row = result.rows[0];
    const counts = Object.freeze({
      postgresVersionNum: Number(row?.postgres_version_num),
      tombstoneCount: Number(row?.tombstone_count),
      revokedIssuedCount: Number(row?.revoked_issued_count),
      runtimeRoleCount: Number(row?.runtime_role_count),
      runtimeSessionCount: Number(row?.runtime_session_count),
      runtimeMembershipCount: Number(row?.runtime_membership_count),
    });
    if (
      Math.floor(counts.postgresVersionNum / 10_000) !== 16 ||
      counts.tombstoneCount !== EXPECTED_ACQUISITION_COUNT ||
      counts.revokedIssuedCount !== EXPECTED_ACQUISITION_COUNT ||
      counts.runtimeRoleCount !== 0 ||
      counts.runtimeSessionCount !== 0 ||
      counts.runtimeMembershipCount !== 0
    ) {
      fail("final-counts");
    }
    return counts;
  } finally {
    await closeClient(lifecycle, client);
  }
}

async function initializeLifecycle(pg) {
  const tempRoot = validateTempRoot(await mkdtemp(TEMP_ROOT_PREFIX));
  await chmod(tempRoot, 0o700);
  const ownerMarker = randomBytes(32).toString("hex");
  const markerHandle = await open(
    join(tempRoot, OWNER_MARKER_FILE),
    "wx",
    0o600,
  );
  await markerHandle.writeFile(ownerMarker, "utf8");
  await markerHandle.close();
  const dataDirectory = join(tempRoot, "data");
  const socketDirectory = join(tempRoot, "socket");
  await mkdir(socketDirectory, { mode: 0o700 });
  await chmod(socketDirectory, 0o700);
  const logHandle = await open(join(tempRoot, "postgres.log"), "a", 0o600);
  return {
    clients: new Set(),
    dataDirectory,
    fixtures: [],
    logHandle,
    ownerMarker,
    pg,
    postgres: null,
    socketDirectory,
    tempRoot,
  };
}

async function initializeCluster(lifecycle) {
  await runCommand(
    lifecycle.pg.binaries.initdb,
    [
      `--pgdata=${lifecycle.dataDirectory}`,
      "--username=bootstrap_admin",
      "--encoding=UTF8",
      "--locale=C",
      "--auth-local=trust",
      "--auth-host=reject",
      "--data-checksums",
      "--no-sync",
    ],
    lifecycle.pg.commandEnv,
    "initdb",
  );
  await writeFile(
    join(lifecycle.dataDirectory, "pg_hba.conf"),
    [
      "local all bootstrap_admin trust",
      "local all postgres trust",
      "local all all scram-sha-256",
      "host all all 0.0.0.0/0 reject",
      "host all all ::0/0 reject",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  lifecycle.postgres = createPostgresInstance(
    lifecycle.pg.binaries.postgres,
    [
      "-D",
      lifecycle.dataDirectory,
      "-h",
      "",
      "-p",
      String(FIXED_PORT),
      "-c",
      "ssl=off",
      "-c",
      `unix_socket_directories=${lifecycle.socketDirectory}`,
      "-c",
      "unix_socket_permissions=0700",
      "-c",
      `cluster_name=${CLUSTER_NAME}`,
      "-c",
      "timezone=UTC",
      "-c",
      "DateStyle=ISO,YMD",
      "-c",
      "max_connections=20",
      "-c",
      "password_encryption=scram-sha-256",
      "-c",
      "log_connections=off",
      "-c",
      "log_disconnections=off",
      "-c",
      "log_statement=none",
      "-c",
      "log_min_messages=panic",
      "-c",
      "log_min_error_statement=panic",
      "-c",
      `careslink.runtime_broker_migration.local_marker=${CLUSTER_MARKER}`,
    ],
    lifecycle.pg.commandEnv,
    lifecycle.logHandle.fd,
  );
  await waitForPostgres(lifecycle);
}

async function verifyClusterPosture(lifecycle, adminClient) {
  const result = await adminClient.query(`
    select
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4
        as version_num,
      pg_catalog.inet_server_addr() is null as no_tcp_address,
      pg_catalog.inet_server_port() is null as no_tcp_port,
      pg_catalog.current_setting('listen_addresses') = '' as no_listen,
      pg_catalog.current_setting('unix_socket_directories') = $1
        as exact_socket,
      pg_catalog.current_setting('unix_socket_permissions') = '0700'
        as private_socket,
      pg_catalog.current_setting('ssl') = 'off' as ssl_off,
      pg_catalog.current_setting(
        'max_prepared_transactions'
      )::pg_catalog.int4 = 0 as prepared_transactions_disabled,
      pg_catalog.current_setting('cluster_name') = $2 as exact_cluster
  `, [lifecycle.socketDirectory, CLUSTER_NAME]);
  const row = result.rows[0];
  if (
    Math.floor(Number(row?.version_num) / 10_000) !== 16 ||
    row?.no_tcp_address !== true ||
    row?.no_tcp_port !== true ||
    row?.no_listen !== true ||
    row?.exact_socket !== true ||
    row?.private_socket !== true ||
    row?.ssl_off !== true ||
    row?.prepared_transactions_disabled !== true ||
    row?.exact_cluster !== true
  ) {
    fail("cluster-posture");
  }
}

async function runLiveScenarios(lifecycle, migration) {
  const adminClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle, { user: "bootstrap_admin" }),
  );
  await verifyClusterPosture(lifecycle, adminClient);
  await runDatabaseStage("admin-bootstrap", () =>
    adminClient.query(ADMIN_BOOTSTRAP_SQL),
  );

  const managementClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  await runDatabaseStage("postgres-bootstrap", () =>
    managementClient.query(POSTGRES_BOOTSTRAP_SQL),
  );
  await runDatabaseStage("predecessor-posture", () =>
    verifyPredecessorPosture(managementClient),
  );
  await runDatabaseStage("formal-migration", () =>
    managementClient.query(migration),
  );
  await runDatabaseStage("static-caller-dependency-set", () =>
    verifyStaticCallerDependencySet(managementClient),
  );
  await runDatabaseStage("posture-and-api-acl", () =>
    verifyPostureAndApiAcl(managementClient),
  );

  const broker = createBroker(managementClient);
  await runDatabaseStage("static-caller-owner-rejection", () =>
    runStaticCallerOwnershipRejectionScenario(
      adminClient,
      managementClient,
      broker,
    ),
  );
  await runDatabaseStage("normal-and-authorization-mismatch", () =>
    runNormalAndAuthorizationMismatchScenario(
      lifecycle,
      broker,
      adminClient,
    ),
  );
  await runDatabaseStage("terminal-first", () =>
    runTerminalFirstScenario(lifecycle, managementClient),
  );
  await runDatabaseStage("tombstone-first", () =>
    runTombstoneFirstScenario(lifecycle, managementClient),
  );
  await runDatabaseStage("cross-database-residue", () =>
    runCrossDatabaseResidueScenario(
      lifecycle,
      adminClient,
      managementClient,
    ),
  );
  await Promise.all([
    closeClient(lifecycle, adminClient),
    closeClient(lifecycle, managementClient),
  ]);
  return readFinalCounts(lifecycle);
}

async function stopPostgres(lifecycle) {
  if (!lifecycle.postgres || lifecycle.postgres.exited) return;
  await runCommand(
    lifecycle.pg.binaries.pg_ctl,
    [
      `--pgdata=${lifecycle.dataDirectory}`,
      "--mode=fast",
      "--wait",
      "--timeout=15",
      "stop",
    ],
    lifecycle.pg.commandEnv,
    "postgres-stop",
  );
  await Promise.race([lifecycle.postgres.exitPromise, sleep(2_000)]);
  if (!lifecycle.postgres.exited) fail("postgres-stop");
}

async function forceStopPostgres(lifecycle) {
  if (!lifecycle.postgres || lifecycle.postgres.exited) return;
  lifecycle.postgres.child.kill("SIGINT");
  await Promise.race([lifecycle.postgres.exitPromise, sleep(2_000)]);
  if (!lifecycle.postgres.exited) {
    lifecycle.postgres.child.kill("SIGKILL");
    await Promise.race([lifecycle.postgres.exitPromise, sleep(2_000)]);
  }
}

async function exactDeleteTempRoot(lifecycle) {
  const tempRoot = validateTempRoot(lifecycle.tempRoot);
  const rootState = await lstat(tempRoot);
  if (!rootState.isDirectory() || rootState.isSymbolicLink()) {
    fail("exact-temp-delete");
  }
  if ((await realpath(tempRoot)) !== tempRoot) fail("exact-temp-delete");
  const marker = await readFile(join(tempRoot, OWNER_MARKER_FILE), "utf8");
  if (marker !== lifecycle.ownerMarker) fail("exact-temp-delete");
  await rm(tempRoot, { recursive: true, force: false, maxRetries: 2 });
  try {
    await lstat(tempRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return;
  }
  fail("exact-temp-delete");
}

async function bestEffortTeardown(lifecycle) {
  for (const client of [...lifecycle.clients]) {
    await closeClient(lifecycle, client).catch(() => undefined);
  }
  let stoppedNormally = false;
  if (lifecycle.postgres && !lifecycle.postgres.exited) {
    try {
      await stopPostgres(lifecycle);
      stoppedNormally = true;
    } catch {
      await forceStopPostgres(lifecycle);
    }
  } else {
    stoppedNormally = true;
  }
  await lifecycle.logHandle?.close().catch(() => undefined);
  let tempRootRemoved = false;
  if (!lifecycle.postgres || lifecycle.postgres.exited) {
    try {
      await exactDeleteTempRoot(lifecycle);
      tempRootRemoved = true;
    } catch {
      tempRootRemoved = false;
    }
  }
  return Object.freeze({ stoppedNormally, tempRootRemoved });
}

export async function
runCommunicationNoteRuntimeCredentialBrokerMigrationLocalPg16(argv = []) {
  const args = parseArguments(argv);
  const migration = await readAndValidateMigration();
  const pg = await resolvePg16Binaries(args.pgBinDir);
  const lifecycle = await initializeLifecycle(pg);
  let counts;
  let failure;
  try {
    await initializeCluster(lifecycle);
    counts = await runLiveScenarios(lifecycle, migration);
  } catch (error) {
    failure =
      error instanceof LocalMigrationHarnessError
        ? error
        : new LocalMigrationHarnessError("lifecycle");
  }
  const teardown = await bestEffortTeardown(lifecycle);
  if (
    failure ||
    !teardown.stoppedNormally ||
    !teardown.tempRootRemoved ||
    !counts
  ) {
    throw failure ?? new LocalMigrationHarnessError("teardown");
  }
  return Object.freeze({
    ok: true,
    gate: "communication-note-runtime-broker-migration-local-pg16",
    postgresMajor: 16,
    postgresVersion: pg.version,
    postgresVersionNum: counts.postgresVersionNum,
    scenarioCount: EXPECTED_SCENARIO_COUNT,
    acquisitionCount: counts.tombstoneCount,
    revokedIssuedCount: counts.revokedIssuedCount,
    runtimeRoleCount: counts.runtimeRoleCount,
    runtimeSessionCount: counts.runtimeSessionCount,
    runtimeMembershipCount: counts.runtimeMembershipCount,
    apiPrivilegeCount: 0,
  });
}

async function main() {
  try {
    const result =
      await runCommunicationNoteRuntimeCredentialBrokerMigrationLocalPg16(
        process.argv.slice(2),
      );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const stage =
      error instanceof LocalMigrationHarnessError ? error.stage : "internal";
    const databaseMarker =
      error instanceof LocalMigrationHarnessError
        ? error.databaseMarker
        : null;
    const databaseCode =
      error instanceof LocalMigrationHarnessError ? error.databaseCode : null;
    const databaseMessage =
      error instanceof LocalMigrationHarnessError
        ? error.databaseMessage
        : null;
    const databasePosition =
      error instanceof LocalMigrationHarnessError
        ? error.databasePosition
        : null;
    const databaseContext =
      error instanceof LocalMigrationHarnessError
        ? error.databaseContext ?? null
        : null;
    const databaseRoutine =
      error instanceof LocalMigrationHarnessError
        ? error.databaseRoutine ?? null
        : null;
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        gate: "communication-note-runtime-broker-migration-local-pg16",
        postgresMajor: 16,
        stage,
        databaseMarker,
        databaseCode,
        databaseMessage,
        databasePosition,
        databaseContext,
        databaseRoutine,
      })}\n`,
    );
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
