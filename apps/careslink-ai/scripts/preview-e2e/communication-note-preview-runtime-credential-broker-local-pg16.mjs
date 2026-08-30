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
const SETUP_PATH = join(
  SCRIPT_DIRECTORY,
  "communication-note-preview-runtime-credential-broker-setup.sql",
);
const CLEANUP_PATH = join(
  SCRIPT_DIRECTORY,
  "communication-note-preview-runtime-credential-broker-cleanup.sql",
);
const POSTCHECK_PATH = join(
  SCRIPT_DIRECTORY,
  "communication-note-preview-runtime-credential-broker-postcheck.sql",
);
const TEMP_ROOT_PREFIX =
  "/private/tmp/careslink-runtime-credential-broker-pg16.";
const TEMP_ROOT_PATTERN =
  /^\/private\/tmp\/careslink-runtime-credential-broker-pg16\.[A-Za-z0-9]{6,}$/;
const OWNER_MARKER_FILE = ".careslink-runtime-credential-broker-owner";
const CLUSTER_NAME = "careslink-runtime-credential-broker-pg16";
const CLUSTER_MARKER = "2026-08-30.local-pg16.m1k.1";
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management";
const RUNTIME_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-runtime";
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const FIXED_PORT = 55_439;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const EXPECTED_ACQUISITION_COUNT = 3;
const EXPECTED_SCENARIO_COUNT = 6;
const REQUIRED_BINARIES = Object.freeze([
  "initdb",
  "pg_ctl",
  "pg_isready",
  "postgres",
  "psql",
]);
const KNOWN_PG16_BIN_DIRECTORIES = Object.freeze([
  "/opt/homebrew/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/usr/lib/postgresql/16/bin",
  "/usr/pgsql-16/bin",
]);

const BOOTSTRAP_SQL = String.raw`
begin;

do $careslink_runtime_broker_bootstrap$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 <> 16
    or pg_catalog.inet_server_addr() is not null
    or pg_catalog.inet_server_port() is not null
    or pg_catalog.current_setting('listen_addresses') <> ''
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or pg_catalog.current_setting('ssl') <> 'off'
    or pg_catalog.current_setting('cluster_name') <>
      'careslink-runtime-credential-broker-pg16'
    or pg_catalog.current_setting(
      'careslink.runtime_broker.local_marker', true
    ) is distinct from '2026-08-30.local-pg16.m1k.1'
    or exists (
      select 1
      from pg_catalog.pg_roles as role_record
      where role_record.rolname in (
        'anon', 'authenticated', 'service_role', 'authenticator',
        'careslink_v1_preview_runner_terminal_caller'
      )
    )
    or pg_catalog.to_regnamespace('extensions') is not null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BOOTSTRAP_UNSAFE';
  end if;
end
$careslink_runtime_broker_bootstrap$;

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
create role careslink_v1_preview_runner_terminal_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;

create schema extensions authorization postgres;
revoke all on schema extensions
from public, anon, authenticated, service_role, authenticator;
create extension pgcrypto with schema extensions;

create function public.v1_shadow_canonical_json(p_value pg_catalog.jsonb)
returns pg_catalog.text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $careslink_runtime_broker_bootstrap$
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
$careslink_runtime_broker_bootstrap$;

create function public.v1_shadow_content_sha256(
  p_content pg_catalog.jsonb
)
returns pg_catalog.text
language sql
immutable
strict
security invoker
set search_path = ''
as $careslink_runtime_broker_bootstrap$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        public.v1_shadow_canonical_json(p_content), 'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$careslink_runtime_broker_bootstrap$;

revoke all on function public.v1_shadow_canonical_json(pg_catalog.jsonb),
  public.v1_shadow_content_sha256(pg_catalog.jsonb)
from public, anon, authenticated, service_role, authenticator;

commit;
`;

const ACQUIRE_SQL = `
select careslink_test_only_runtime_broker.acquire(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.timestamptz
) as result
`;
const BIND_SQL = `
select careslink_test_only_runtime_broker.bind(
  $1::pg_catalog.text,
  $2::pg_catalog.int4
) as result
`;
const TOMBSTONE_SQL = `
select careslink_test_only_runtime_broker.tombstone(
  $1::pg_catalog.text
) as result
`;
const FINALIZE_SQL = `
select careslink_test_only_runtime_broker.finalize(
  $1::pg_catalog.text
) as result
`;
const INSPECT_SQL = `
select careslink_test_only_runtime_broker.inspect(
  $1::pg_catalog.text
) as result
`;

class LocalBrokerHarnessError extends Error {
  constructor(
    stage,
    databaseMarker = null,
    databaseCode = null,
    databaseMessage = null,
  ) {
    super("COMMUNICATION_NOTE_RUNTIME_CREDENTIAL_BROKER_LOCAL_PG16_FAILED");
    this.name = "LocalBrokerHarnessError";
    this.stage = stage;
    this.databaseMarker = databaseMarker;
    this.databaseCode = databaseCode;
    this.databaseMessage = databaseMessage;
  }
}

function fail(stage) {
  throw new LocalBrokerHarnessError(stage);
}

function databaseFailure(stage, error) {
  const marker =
    typeof error?.message === "string"
      ? error.message.match(
          /\b(?:TEST_ONLY_RUNTIME_BROKER|COMMUNICATION_NOTE_RUNTIME_CREDENTIAL_BROKER)[A-Z0-9_]*\b/,
        )?.[0] ?? null
      : null;
  const code =
    typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code
      : null;
  const message =
    typeof error?.message === "string" &&
    /^function pg_catalog\.[a-z_]+\([a-z0-9_, ]+\) does not exist$/.test(
      error.message,
    )
      ? error.message
      : null;
  throw new LocalBrokerHarnessError(stage, marker, code, message);
}

function fixedPsqlMessage(stderr) {
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/\b(?:ERROR|FATAL):\s+(.+)$/);
    if (!match) continue;
    const sanitized = match[1]
      .replace(/[a-f0-9]{64}/g, "[digest]")
      .replace(
        /careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}/g,
        "[runtime-role]",
      )
      .replace(
        /\/private\/tmp\/careslink-runtime-credential-broker-pg16\.[A-Za-z0-9]+(?:\/[A-Za-z0-9._/-]+)?/g,
        "[temp-path]",
      );
    if (
      sanitized.length > 0 &&
      sanitized.length <= 240 &&
      /^[A-Za-z0-9_ [\]():,.'"=<>+-]+$/.test(sanitized)
    ) {
      return sanitized;
    }
  }
  return null;
}

async function runDatabaseStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof LocalBrokerHarnessError) throw error;
    databaseFailure(stage, error);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function fixedCommandEnvironment(pgBinDirectory, additions = {}) {
  return Object.freeze({
    LANG: "C",
    LC_ALL: "C",
    PATH: `${pgBinDirectory}:/usr/bin:/bin`,
    TZ: "UTC",
    ...additions,
  });
}

async function runCommand(command, args, env, stage) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: APP_ROOT,
      encoding: "utf8",
      env,
      killSignal: "SIGKILL",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return Object.freeze({
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    });
  } catch (error) {
    const stderr =
      typeof error?.stderr === "string" ? error.stderr : "";
    const marker = stderr.match(
      /\bTEST_ONLY_RUNTIME_BROKER_[A-Z0-9_]+\b/,
    )?.[0];
    const message = fixedPsqlMessage(stderr);
    if (marker || message) {
      throw new LocalBrokerHarnessError(stage, marker ?? null, null, message);
    }
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

async function validateSqlFiles() {
  const [setup, cleanup, postcheck] = await Promise.all([
    readFile(SETUP_PATH, "utf8"),
    readFile(CLEANUP_PATH, "utf8"),
    readFile(POSTCHECK_PATH, "utf8"),
  ]);
  if (
    !setup.includes("TEST_ONLY local PostgreSQL 16/17 runtime-credential broker") ||
    !setup.includes("create function careslink_test_only_runtime_broker.acquire(") ||
    !setup.includes("create function careslink_test_only_runtime_broker.bind(") ||
    !setup.includes("create function careslink_test_only_runtime_broker.tombstone(") ||
    !setup.includes("create function careslink_test_only_runtime_broker.finalize(") ||
    !setup.includes("create function careslink_test_only_runtime_broker.inspect(") ||
    !cleanup.includes("as durable_tombstone") ||
    !cleanup.includes("as release_receipt") ||
    !postcheck.includes("TEST_ONLY independent postcheck") ||
    !postcheck.trimEnd().endsWith("rollback;") ||
    /(?:supabase\.co|pooler\.supabase\.com)/i.test(
      `${setup}\n${cleanup}\n${postcheck}`,
    )
  ) {
    fail("file-policy");
  }
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
          "--username=postgres",
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

function exactJsonResult(result, status, acquisitionDigest, expectedKeys) {
  const value = result?.rows?.[0]?.result;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.status !== status ||
    value.acquisitionRequestDigest !== acquisitionDigest ||
    value.rawCredentialMaterialPresent !== false ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...expectedKeys].sort())
  ) {
    fail("broker-result");
  }
  return value;
}

function createBrokerResolver(client) {
  return Object.freeze({
    async acquire(fixture) {
      const result = await client.query(ACQUIRE_SQL, [
        fixture.acquisitionDigest,
        fixture.runtimeRole,
        fixture.leaseReferenceSha256,
        fixture.sessionBindingSha256,
        fixture.material.verifier,
        fixture.material.verifierSha256,
        fixture.expiresAt,
      ]);
      const value = exactJsonResult(
        result,
        "ISSUED_UNBOUND",
        fixture.acquisitionDigest,
        [
          "status",
          "acquisitionRequestDigest",
          "runtimeRole",
          "leaseReferenceSha256",
          "sessionBindingSha256",
          "credentialVerifierSha256",
          "issuedAt",
          "expiresAt",
          "rawCredentialMaterialPresent",
        ],
      );
      if (
        value.runtimeRole !== fixture.runtimeRole ||
        value.leaseReferenceSha256 !== fixture.leaseReferenceSha256 ||
        value.sessionBindingSha256 !== fixture.sessionBindingSha256 ||
        value.credentialVerifierSha256 !== fixture.material.verifierSha256 ||
        value.expiresAt !== fixture.expiresAt ||
        typeof value.issuedAt !== "string" ||
        !Number.isFinite(Date.parse(value.issuedAt))
      ) {
        fail("broker-result");
      }
      return value;
    },
    async bind(acquisitionDigest, backendPid) {
      const result = await client.query(BIND_SQL, [
        acquisitionDigest,
        backendPid,
      ]);
      const value = exactJsonResult(result, "ACTIVE", acquisitionDigest, [
        "status",
        "acquisitionRequestDigest",
        "runtimeRole",
        "leaseReferenceSha256",
        "sessionBindingSha256",
        "backendPid",
        "rawCredentialMaterialPresent",
      ]);
      if (!Number.isSafeInteger(value.backendPid) || value.backendPid <= 0) {
        fail("broker-result");
      }
      return value;
    },
    async tombstone(acquisitionDigest) {
      const result = await client.query(TOMBSTONE_SQL, [acquisitionDigest]);
      return exactJsonResult(result, "TOMBSTONED", acquisitionDigest, [
        "status",
        "acquisitionRequestDigest",
        "everIssued",
        "futureIssuanceBlocked",
        "rawCredentialMaterialPresent",
      ]);
    },
    async finalize(acquisitionDigest) {
      const result = await client.query(FINALIZE_SQL, [acquisitionDigest]);
      return exactJsonResult(result, "REVOKED", acquisitionDigest, [
        "status",
        "acquisitionRequestDigest",
        "everIssued",
        "futureIssuanceBlocked",
        "roleCount",
        "sessionCount",
        "membershipCount",
        "rawCredentialMaterialPresent",
      ]);
    },
    async inspect(acquisitionDigest) {
      const result = await client.query(INSPECT_SQL, [acquisitionDigest]);
      return exactJsonResult(
        result,
        "REVOKED_ATTESTED",
        acquisitionDigest,
        [
          "status",
          "acquisitionRequestDigest",
          "everIssued",
          "futureIssuanceBlocked",
          "roleCount",
          "sessionCount",
          "membershipCount",
          "credentialVerifierResidueCount",
          "rawCredentialMaterialPresent",
        ],
      );
    },
  });
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
  const acquisitionDigest = sha256(`m1k:${label}:acquisition`);
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const fixture = {
    acquisitionDigest,
    expiresAt,
    leaseReferenceSha256: sha256(`m1k:${label}:lease`),
    material: createScramMaterial(),
    runtimeRole:
      `careslink_v1_preview_runner_terminal_runtime_` +
      acquisitionDigest.slice(0, 16),
    sessionBindingSha256: sha256(`m1k:${label}:session`),
  };
  if (
    !RUNTIME_ROLE_PATTERN.test(fixture.runtimeRole) ||
    new Set([
      fixture.acquisitionDigest,
      fixture.leaseReferenceSha256,
      fixture.sessionBindingSha256,
      fixture.material.verifierSha256,
    ]).size !== 4
  ) {
    fail("fixture");
  }
  return fixture;
}

function disposeFixtureMaterial(fixture) {
  fixture.material.password = null;
  fixture.material.verifier = null;
}

async function expectedDatabaseFailure(operation, expectedMessage) {
  try {
    await operation;
  } catch (error) {
    if (
      typeof error?.message === "string" &&
      error.message.includes(expectedMessage)
    ) {
      return;
    }
  }
  fail("expected-database-rejection");
}

async function expectedHarnessFailure(operation, expectedStage) {
  try {
    await operation;
  } catch (error) {
    if (
      error instanceof LocalBrokerHarnessError &&
      error.stage === expectedStage
    ) {
      return;
    }
  }
  fail("expected-harness-rejection");
}

async function waitForBlockedAdvisoryLock(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.query(`
      select pg_catalog.count(*)::pg_catalog.int4 as waiter_count
      from pg_catalog.pg_locks as lock_record
      where lock_record.locktype = 'advisory'
        and not lock_record.granted
    `);
    if (Number(result.rows[0]?.waiter_count) === 1) return;
    await sleep(10);
  }
  fail("late-acquire-not-serialized");
}

async function revokeByDigest(resolver, acquisitionDigest) {
  const tombstone = await runDatabaseStage("broker-tombstone", () =>
    resolver.tombstone(acquisitionDigest),
  );
  const finalized = await runDatabaseStage("broker-finalize", () =>
    resolver.finalize(acquisitionDigest),
  );
  const inspected = await runDatabaseStage("broker-inspect", () =>
    resolver.inspect(acquisitionDigest),
  );
  if (
    tombstone.futureIssuanceBlocked !== true ||
    finalized.futureIssuanceBlocked !== true ||
    inspected.futureIssuanceBlocked !== true ||
    finalized.roleCount !== 0 ||
    finalized.sessionCount !== 0 ||
    finalized.membershipCount !== 0 ||
    inspected.roleCount !== 0 ||
    inspected.sessionCount !== 0 ||
    inspected.membershipCount !== 0 ||
    inspected.credentialVerifierResidueCount !== 0
  ) {
    fail("revoke-attestation");
  }
  return Object.freeze({ finalized, inspected, tombstone });
}

async function runNormalActiveSessionScenario(
  lifecycle,
  resolver,
  managementClient,
) {
  const fixture = createFixture("normal-active-session");
  lifecycle.fixtures.push(fixture);
  const acquired = await runDatabaseStage("normal-acquire", () =>
    resolver.acquire(fixture),
  );
  if (acquired.runtimeRole !== fixture.runtimeRole) fail("normal-acquire");
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
  const backend = await runDatabaseStage("runtime-session-query", () =>
    runtimeClient.query(
      "select pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid",
    ),
  );
  const backendPid = Number(backend.rows[0]?.backend_pid);
  if (!Number.isSafeInteger(backendPid) || backendPid <= 0) {
    fail("runtime-session");
  }
  const bound = await runDatabaseStage("normal-bind", () =>
    resolver.bind(fixture.acquisitionDigest, backendPid),
  );
  if (bound.backendPid !== backendPid) fail("runtime-bind");
  const managementBackend = await runDatabaseStage(
    "management-session-query",
    () =>
      managementClient.query(
        "select pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid",
      ),
  );
  const managementBackendPid = Number(
    managementBackend.rows[0]?.backend_pid,
  );
  await expectedDatabaseFailure(
    resolver.bind(fixture.acquisitionDigest, managementBackendPid),
    "TEST_ONLY_RUNTIME_BROKER_BIND_SESSION_INVALID",
  );
  const replayedBind = await runDatabaseStage("normal-bind-replay", () =>
    resolver.bind(fixture.acquisitionDigest, backendPid),
  );
  if (replayedBind.backendPid !== backendPid) fail("runtime-bind-replay");

  const revoked = await revokeByDigest(resolver, fixture.acquisitionDigest);
  if (
    revoked.tombstone.everIssued !== true ||
    revoked.finalized.everIssued !== true
  ) {
    fail("normal-revoke");
  }
  await closeClient(lifecycle, runtimeClient);
}

async function runRevokeBeforeAcquireScenario(
  resolver,
  lifecycle,
  transactionClient,
) {
  const fixture = createFixture("revoke-before-acquire");
  lifecycle.fixtures.push(fixture);
  await transactionClient.query("begin");
  const tombstone = await resolver.tombstone(fixture.acquisitionDigest);
  if (tombstone.everIssued !== false) fail("pre-acquire-tombstone");

  const lateAcquireClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const lateAcquire = createBrokerResolver(lateAcquireClient).acquire(fixture);
  const lateAcquireOutcome = lateAcquire.then(
    (value) => Object.freeze({ ok: true, value }),
    (error) => Object.freeze({ ok: false, error }),
  );
  await waitForBlockedAdvisoryLock(transactionClient);
  await transactionClient.query("commit");
  const outcome = await lateAcquireOutcome;
  if (
    outcome.ok ||
    !String(outcome.error?.message).includes(
      "TEST_ONLY_RUNTIME_BROKER_ACQUIRE_TOMBSTONED",
    )
  ) {
    fail("late-acquire-fence");
  }
  await closeClient(lifecycle, lateAcquireClient);
  disposeFixtureMaterial(fixture);
  const finalized = await resolver.finalize(fixture.acquisitionDigest);
  const inspected = await resolver.inspect(fixture.acquisitionDigest);
  if (finalized.everIssued !== false || inspected.everIssued !== false) {
    fail("pre-acquire-revoke");
  }
}

async function runResponseLossDoubleAcquireAndRevokeScenario(lifecycle) {
  const fixture = createFixture("response-loss-double-acquire");
  lifecycle.fixtures.push(fixture);
  const clientA = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const clientB = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const acquireResults = await Promise.allSettled([
    createBrokerResolver(clientA).acquire(fixture),
    createBrokerResolver(clientB).acquire(fixture),
  ]);
  const fulfilled = acquireResults.filter(
    (result) => result.status === "fulfilled",
  );
  const rejected = acquireResults.filter(
    (result) => result.status === "rejected",
  );
  if (
    fulfilled.length !== 1 ||
    rejected.length !== 1 ||
    !String(rejected[0].reason?.message).includes(
      "TEST_ONLY_RUNTIME_BROKER_ALREADY_ISSUED_REQUIRES_REVOKE",
    )
  ) {
    fail("double-acquire");
  }
  fixture.material.verifier = null;

  const wrongApplicationClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle, {
      application_name:
        "careslink-preview-runtime-credential-broker-runtime-wrong",
      password: fixture.material.password,
      user: fixture.runtimeRole,
    }),
  );
  const wrongApplicationBackend = await runDatabaseStage(
    "wrong-application-session-query",
    () =>
      wrongApplicationClient.query(
        "select pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid",
      ),
  );
  await expectedDatabaseFailure(
    createBrokerResolver(clientA).bind(
      fixture.acquisitionDigest,
      Number(wrongApplicationBackend.rows[0]?.backend_pid),
    ),
    "TEST_ONLY_RUNTIME_BROKER_BIND_SESSION_INVALID",
  );
  await closeClient(lifecycle, wrongApplicationClient);

  const durableTombstone = await runDatabaseStage(
    "response-loss-durable-tombstone",
    () => createBrokerResolver(clientA).tombstone(fixture.acquisitionDigest),
  );
  if (durableTombstone.everIssued !== true) {
    fail("response-loss-durable-tombstone");
  }
  const durableLoginFence = await runDatabaseStage(
    "response-loss-login-fence",
    () =>
      clientA.query(
        `select pg_catalog.count(*)::pg_catalog.int4 as fence_count
         from pg_catalog.pg_roles as role_record
         where role_record.rolname = $1
           and not role_record.rolcanlogin`,
        [fixture.runtimeRole],
      ),
  );
  if (Number(durableLoginFence.rows[0]?.fence_count) !== 1) {
    fail("response-loss-login-fence");
  }
  await expectedHarnessFailure(
    openClient(
      lifecycle,
      clientConfiguration(lifecycle, {
        application_name: RUNTIME_APPLICATION_NAME,
        password: fixture.material.password,
        user: fixture.runtimeRole,
      }),
    ),
    "database-connect",
  );
  disposeFixtureMaterial(fixture);
  await Promise.all([
    closeClient(lifecycle, clientA),
    closeClient(lifecycle, clientB),
  ]);

  // Both new resolvers know only the durable acquisition digest. Their
  // concurrent cleanup models an acquire response lost before session open.
  const cleanupClientA = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const cleanupClientB = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const cleanupResults = await Promise.all([
    revokeByDigest(
      createBrokerResolver(cleanupClientA),
      fixture.acquisitionDigest,
    ),
    revokeByDigest(
      createBrokerResolver(cleanupClientB),
      fixture.acquisitionDigest,
    ),
  ]);
  if (
    cleanupResults.some(
      (result) =>
        result.tombstone.everIssued !== true ||
        result.finalized.everIssued !== true,
    )
  ) {
    fail("double-revoke");
  }
  await Promise.all([
    closeClient(lifecycle, cleanupClientA),
    closeClient(lifecycle, cleanupClientB),
  ]);
}

function psqlArguments(lifecycle, path) {
  return [
    "-X",
    "--no-password",
    `--host=${lifecycle.socketDirectory}`,
    `--port=${FIXED_PORT}`,
    "--username=postgres",
    "--dbname=postgres",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=terse",
    `--file=${path}`,
  ];
}

async function runPsqlFileForDigest(lifecycle, path, digest, stage) {
  await runCommand(
    lifecycle.pg.binaries.psql,
    psqlArguments(lifecycle, path),
    fixedCommandEnvironment(lifecycle.pg.binDirectory, {
      PGAPPNAME: MANAGEMENT_APPLICATION_NAME,
      PGOPTIONS: `-c careslink.runtime_broker.acquisition_digest=${digest}`,
    }),
    stage,
  );
}

async function runIndependentCleanupAndPostchecks(lifecycle) {
  for (const [index, fixture] of lifecycle.fixtures.entries()) {
    await runPsqlFileForDigest(
      lifecycle,
      CLEANUP_PATH,
      fixture.acquisitionDigest,
      `cleanup-sql-${index + 1}`,
    );
  }
  for (const [index, fixture] of lifecycle.fixtures.entries()) {
    await runPsqlFileForDigest(
      lifecycle,
      POSTCHECK_PATH,
      fixture.acquisitionDigest,
      `postcheck-sql-${index + 1}`,
    );
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
        )::pg_catalog.int4 as issued_tombstone_count,
        pg_catalog.count(*) filter (
          where acquisition.issued_at is null
        )::pg_catalog.int4 as nonissued_tombstone_count,
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
          join careslink_test_only_runtime_broker.acquisitions as identity
            on membership.member = identity.runtime_role_oid
              or membership.roleid = identity.runtime_role_oid
              or membership.grantor = identity.runtime_role_oid
        ) as runtime_membership_count
      from careslink_test_only_runtime_broker.acquisitions as acquisition
      where acquisition.state = 'REVOKED'
        and acquisition.tombstoned_at is not null
        and acquisition.future_issuance_blocked
        and acquisition.revoked_at is not null
        and not acquisition.reusable
        and not acquisition.raw_credential_material_present
    `);
    const row = result.rows[0];
    const counts = Object.freeze({
      postgresVersionNum: Number(row?.postgres_version_num),
      tombstoneCount: Number(row?.tombstone_count),
      issuedTombstoneCount: Number(row?.issued_tombstone_count),
      nonissuedTombstoneCount: Number(row?.nonissued_tombstone_count),
      runtimeRoleCount: Number(row?.runtime_role_count),
      runtimeSessionCount: Number(row?.runtime_session_count),
      runtimeMembershipCount: Number(row?.runtime_membership_count),
    });
    if (
      Math.floor(counts.postgresVersionNum / 10_000) !== 16 ||
      counts.tombstoneCount !== EXPECTED_ACQUISITION_COUNT ||
      counts.issuedTombstoneCount !== 2 ||
      counts.nonissuedTombstoneCount !== 1 ||
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
    setupApplied: false,
    socketDirectory,
    tempRoot,
  };
}

async function initializeCluster(lifecycle) {
  await runCommand(
    lifecycle.pg.binaries.initdb,
    [
      `--pgdata=${lifecycle.dataDirectory}`,
      "--username=postgres",
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
      "max_connections=16",
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
      `application_name=${MANAGEMENT_APPLICATION_NAME}`,
      "-c",
      `careslink.runtime_broker.local_marker=${CLUSTER_MARKER}`,
    ],
    lifecycle.pg.commandEnv,
    lifecycle.logHandle.fd,
  );
  await waitForPostgres(lifecycle);
}

async function runLiveScenarios(lifecycle) {
  const managementClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const identity = await managementClient.query(`
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
      pg_catalog.current_setting('cluster_name') = $2 as exact_cluster
  `, [lifecycle.socketDirectory, CLUSTER_NAME]);
  const posture = identity.rows[0];
  if (
    Math.floor(Number(posture?.version_num) / 10_000) !== 16 ||
    posture?.no_tcp_address !== true ||
    posture?.no_tcp_port !== true ||
    posture?.no_listen !== true ||
    posture?.exact_socket !== true ||
    posture?.private_socket !== true ||
    posture?.ssl_off !== true ||
    posture?.exact_cluster !== true
  ) {
    fail("cluster-posture");
  }
  await runDatabaseStage("bootstrap-sql", () =>
    managementClient.query(BOOTSTRAP_SQL),
  );
  await closeClient(lifecycle, managementClient);

  await runCommand(
    lifecycle.pg.binaries.psql,
    psqlArguments(lifecycle, SETUP_PATH),
    fixedCommandEnvironment(lifecycle.pg.binDirectory, {
      PGAPPNAME: MANAGEMENT_APPLICATION_NAME,
    }),
    "setup-sql",
  );
  lifecycle.setupApplied = true;

  const primaryClient = await openClient(
    lifecycle,
    clientConfiguration(lifecycle),
  );
  const primaryResolver = createBrokerResolver(primaryClient);
  await runDatabaseStage("normal-active-session", () =>
    runNormalActiveSessionScenario(
      lifecycle,
      primaryResolver,
      primaryClient,
    ),
  );
  await runDatabaseStage("revoke-before-acquire", () =>
    runRevokeBeforeAcquireScenario(
      primaryResolver,
      lifecycle,
      primaryClient,
    ),
  );
  await closeClient(lifecycle, primaryClient);
  await runDatabaseStage("response-loss-double-acquire-revoke", () =>
    runResponseLossDoubleAcquireAndRevokeScenario(lifecycle),
  );

  await runIndependentCleanupAndPostchecks(lifecycle);
  return readFinalCounts(lifecycle);
}

async function bestEffortTeardown(lifecycle) {
  for (const client of [...lifecycle.clients]) {
    await closeClient(lifecycle, client).catch(() => undefined);
  }
  if (
    lifecycle.setupApplied &&
    lifecycle.postgres &&
    !lifecycle.postgres.exited
  ) {
    for (const fixture of lifecycle.fixtures) {
      await runPsqlFileForDigest(
        lifecycle,
        CLEANUP_PATH,
        fixture.acquisitionDigest,
        "cleanup-sql",
      ).catch(() => undefined);
    }
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

export async function runCommunicationNoteRuntimeCredentialBrokerLocalPg16(
  argv = [],
) {
  const args = parseArguments(argv);
  await validateSqlFiles();
  const pg = await resolvePg16Binaries(args.pgBinDir);
  const lifecycle = await initializeLifecycle(pg);
  let counts;
  let failure;
  try {
    await initializeCluster(lifecycle);
    counts = await runLiveScenarios(lifecycle);
  } catch (error) {
    failure =
      error instanceof LocalBrokerHarnessError
        ? error
        : new LocalBrokerHarnessError("lifecycle");
  }
  const teardown = await bestEffortTeardown(lifecycle);
  if (
    failure ||
    !teardown.stoppedNormally ||
    !teardown.tempRootRemoved ||
    !counts
  ) {
    throw failure ?? new LocalBrokerHarnessError("teardown");
  }
  return Object.freeze({
    ok: true,
    gate: "communication-note-runtime-credential-broker-local-pg16",
    postgresMajor: 16,
    postgresVersion: pg.version,
    postgresVersionNum: counts.postgresVersionNum,
    scenarioCount: EXPECTED_SCENARIO_COUNT,
    acquisitionCount: counts.tombstoneCount,
    issuedTombstoneCount: counts.issuedTombstoneCount,
    nonissuedTombstoneCount: counts.nonissuedTombstoneCount,
    cleanupCount: lifecycle.fixtures.length,
    postcheckCount: lifecycle.fixtures.length,
    runtimeRoleCount: counts.runtimeRoleCount,
    runtimeSessionCount: counts.runtimeSessionCount,
    runtimeMembershipCount: counts.runtimeMembershipCount,
  });
}

async function main() {
  try {
    const result =
      await runCommunicationNoteRuntimeCredentialBrokerLocalPg16(
        process.argv.slice(2),
      );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const stage =
      error instanceof LocalBrokerHarnessError ? error.stage : "internal";
    const databaseMarker =
      error instanceof LocalBrokerHarnessError
        ? error.databaseMarker
        : null;
    const databaseCode =
      error instanceof LocalBrokerHarnessError ? error.databaseCode : null;
    const databaseMessage =
      error instanceof LocalBrokerHarnessError
        ? error.databaseMessage
        : null;
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        gate: "communication-note-runtime-credential-broker-local-pg16",
        postgresMajor: 16,
        stage,
        databaseMarker,
        databaseCode,
        databaseMessage,
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
