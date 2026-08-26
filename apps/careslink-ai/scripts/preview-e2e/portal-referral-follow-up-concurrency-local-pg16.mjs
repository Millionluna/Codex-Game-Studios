import { execFile, spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
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
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PORTAL_FOLLOW_UP_CONCURRENCY_CLUSTER_NAME,
  PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV,
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS,
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY,
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS,
  PORTAL_FOLLOW_UP_CONCURRENCY_MANAGEMENT_APPLICATION_NAME,
  PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
  PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
  PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA,
  PortalFollowUpConcurrencyPolicyError,
  assertPortalFollowUpConcurrencyLocalPg16SqlPolicy,
  assertPortalFollowUpConcurrencyMigrationManifest,
  assertPortalFollowUpConcurrencyPg16Version,
  assertPortalFollowUpConcurrencyPolicyRegression,
  parsePortalFollowUpConcurrencyLocalPg16Arguments,
  validatePortalFollowUpConcurrencyDatabaseUrl,
  validatePortalFollowUpConcurrencyTempRoot,
} from "./portal-referral-follow-up-concurrency-local-pg16-policy.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const MIGRATION_DIRECTORY = join(APP_ROOT, "supabase", "migrations");
const TEMP_ROOT_PREFIX =
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY.tempRootPrefix;
const REQUIRED_PG16_BINARIES = Object.freeze([
  "initdb",
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
const OWNER_MARKER_FILE = ".careslink-m1c-lifecycle-owner";
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const EXPECTED_LIVE_SCENARIOS = Object.freeze([
  "same-key-replay",
  "same-key-changed-conflict",
  "different-key-stale",
  "same-provider-actors",
  "session-revoke-first",
  "provider-suspend-first",
  "flag-disable-first",
  "ownership-revoke-first-and-replay",
]);

const LIFECYCLE_ERROR_CODES = new Set([
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_ABORTED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_BINARY_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_FILE_POLICY_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INITDB_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_START_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_BOOTSTRAP_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATION_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_SETUP_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_TIMEOUT",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_QUIESCE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_CLEANUP_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POSTCHECK_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_STOP_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TOTAL_TIMEOUT",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TEARDOWN_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INTERNAL_FAILED",
]);

export class PortalFollowUpConcurrencyLocalPg16Error extends Error {
  constructor(code, stage, evidence = null) {
    const fixedCode =
      LIFECYCLE_ERROR_CODES.has(code) || isFixedPortalCode(code)
      ? code
      : "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "PortalFollowUpConcurrencyLocalPg16Error";
    this.code = fixedCode;
    this.stage = typeof stage === "string" ? stage : "internal";
    this.evidence = evidence;
  }
}

function fail(code, stage) {
  throw new PortalFollowUpConcurrencyLocalPg16Error(code, stage);
}

function isFixedPortalCode(value) {
  return (
    typeof value === "string" &&
    value.length <= 96 &&
    /^PORTAL_FOLLOW_UP_CONCURRENCY_[A-Z0-9_]+$/.test(value)
  );
}

function normalizedFailure(error, fallbackCode, fallbackStage) {
  if (error instanceof PortalFollowUpConcurrencyLocalPg16Error) {
    return Object.freeze({ code: error.code, stage: error.stage });
  }
  if (error instanceof PortalFollowUpConcurrencyPolicyError) {
    return Object.freeze({ code: error.code, stage: fallbackStage });
  }
  if (isFixedPortalCode(error?.safeCode)) {
    return Object.freeze({ code: error.safeCode, stage: fallbackStage });
  }
  return Object.freeze({ code: fallbackCode, stage: fallbackStage });
}

export function mergePortalFollowUpConcurrencyLifecycleFailure(
  primaryFailure,
  teardownFailures,
) {
  const safePrimary =
    primaryFailure &&
    isFixedPortalCode(primaryFailure.code) &&
    typeof primaryFailure.stage === "string"
      ? Object.freeze({
          code: primaryFailure.code,
          stage: primaryFailure.stage,
        })
      : null;
  const safeTeardown = Array.isArray(teardownFailures)
    ? teardownFailures
        .filter(
          (failure) =>
            failure &&
            isFixedPortalCode(failure.code) &&
            typeof failure.stage === "string",
        )
        .map((failure) =>
          Object.freeze({ code: failure.code, stage: failure.stage }),
        )
    : [];

  return Object.freeze({
    ok: false,
    code:
      safePrimary?.code ??
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TEARDOWN_FAILED",
    stage: safePrimary?.stage ?? "teardown",
    teardownErrors: Object.freeze(safeTeardown),
  });
}

function assertNotAborted(signal, stage) {
  if (signal?.aborted) {
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_ABORTED", stage);
  }
}

function remainingTimeout(deadline, maximumMs, stage) {
  const remainingMs = Math.floor(deadline - performance.now());
  if (remainingMs <= 0) {
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TOTAL_TIMEOUT", stage);
  }
  return Math.max(1, Math.floor(Math.min(maximumMs, remainingMs)));
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function withLifecycleDeadline(
  operation,
  milliseconds,
  code,
  stage,
) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new PortalFollowUpConcurrencyLocalPg16Error(code, stage)),
      milliseconds,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function fixedCommandEnvironment(pgBinDirectory) {
  return Object.freeze({
    LANG: "C",
    LC_ALL: "C",
    PATH: `${pgBinDirectory}:/usr/bin:/bin`,
    TZ: "UTC",
  });
}

function fixedLiveEnvironment(databaseUrl) {
  return Object.freeze({
    [PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV]: databaseUrl,
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  });
}

async function runCommand(
  command,
  args,
  { cwd = APP_ROOT, env, timeoutMs, signal, stage },
) {
  assertNotAborted(signal, stage);
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      env,
      killSignal: "SIGKILL",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      signal,
      timeout: timeoutMs,
      windowsHide: true,
    });
    assertNotAborted(signal, stage);
    return Object.freeze({
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    });
  } catch (error) {
    if (signal?.aborted) {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_ABORTED", stage);
    }
    if (error && typeof error === "object") {
      error.lifecycleStage = stage;
    }
    throw error;
  }
}

async function measureStage(timings, stage, operation) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
    timings[stage] = (timings[stage] ?? 0) + elapsed;
  }
}

async function resolvePg16Binaries(
  requestedDirectory,
  deadline,
  signal,
) {
  const candidates = requestedDirectory
    ? [requestedDirectory]
    : KNOWN_PG16_BIN_DIRECTORIES;
  for (const candidate of candidates) {
    try {
      assertNotAborted(signal, "binary-preflight");
      const canonicalDirectory = await realpath(candidate);
      const directoryState = await stat(canonicalDirectory);
      if (!directoryState.isDirectory()) {
        continue;
      }

      const binaries = {};
      let valid = true;
      for (const name of REQUIRED_PG16_BINARIES) {
        const canonicalBinary = await realpath(join(canonicalDirectory, name));
        const binaryState = await stat(canonicalBinary);
        if (
          !binaryState.isFile() ||
          dirname(canonicalBinary) !== canonicalDirectory
        ) {
          valid = false;
          break;
        }
        await access(canonicalBinary, fsConstants.X_OK);
        binaries[name] = canonicalBinary;
      }
      if (!valid) {
        continue;
      }

      const version = await runCommand(binaries.postgres, ["--version"], {
        env: fixedCommandEnvironment(canonicalDirectory),
        timeoutMs: remainingTimeout(
          deadline,
          PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.binaryPreflightMs,
          "binary-preflight",
        ),
        signal,
        stage: "binary-preflight",
      });
      assertPortalFollowUpConcurrencyPg16Version(version.stdout);
      return Object.freeze({
        binDirectory: canonicalDirectory,
        binaries: Object.freeze(binaries),
        version: version.stdout.trim().replace(/^postgres \(PostgreSQL\) /, ""),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      if (requestedDirectory) {
        fail(
          "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_BINARY_FAILED",
          "binary-preflight",
        );
      }
    }
  }
  fail(
    "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_BINARY_FAILED",
    "binary-preflight",
  );
}

function createPortCandidates() {
  const policy = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY;
  const values = new Set();
  while (values.size < policy.portCandidateCount) {
    const value = randomInt(policy.minimumPort, policy.maximumPort + 1);
    if (value !== policy.deniedPort) {
      values.add(value);
    }
  }
  return Object.freeze([...values]);
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
  let exitRecord = null;
  let settleExit;
  const exitPromise = new Promise((resolveExit) => {
    settleExit = resolveExit;
  });
  const settle = (record) => {
    if (!exited) {
      exited = true;
      exitRecord = Object.freeze(record);
      settleExit(exitRecord);
    }
  };
  child.once("error", () => settle({ code: null, signal: "SPAWN_ERROR" }));
  child.once("exit", (code, childSignal) =>
    settle({ code, signal: childSignal }),
  );
  return Object.freeze({
    child,
    exitPromise,
    get exited() {
      return exited;
    },
    get exitRecord() {
      return exitRecord;
    },
  });
}

async function stopPostgresInstance(instance, timeoutMs) {
  if (!instance || instance.exited) {
    return Object.freeze({ stopped: true, forced: false });
  }

  instance.child.kill("SIGINT");
  await Promise.race([instance.exitPromise, sleep(timeoutMs)]);
  if (instance.exited) {
    return Object.freeze({ stopped: true, forced: false });
  }

  instance.child.kill("SIGKILL");
  await Promise.race([instance.exitPromise, sleep(2_000)]);
  if (!instance.exited) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_STOP_FAILED",
      "postgres-stop",
    );
  }
  return Object.freeze({ stopped: true, forced: true });
}

function psqlConnectionArguments(port) {
  return [
    "-X",
    "--no-password",
    "--host=127.0.0.1",
    `--port=${port}`,
    "--username=postgres",
    "--dbname=postgres",
    `--set=ON_ERROR_STOP=1`,
  ];
}

async function runPsqlFile(
  lifecycle,
  sqlPath,
  stage,
  maximumTimeoutMs,
  { teardown = false } = {},
) {
  const deadline = teardown ? lifecycle.teardownDeadline : lifecycle.deadline;
  const signal = teardown ? undefined : lifecycle.signal;
  return runCommand(
    lifecycle.pg.binaries.psql,
    [...psqlConnectionArguments(lifecycle.port), `--file=${sqlPath}`],
    {
      env: lifecycle.commandEnv,
      timeoutMs: remainingTimeout(deadline, maximumTimeoutMs, stage),
      signal,
      stage,
    },
  );
}

async function runPsqlQuery(
  lifecycle,
  query,
  stage,
  maximumTimeoutMs,
  { teardown = false } = {},
) {
  const deadline = teardown ? lifecycle.teardownDeadline : lifecycle.deadline;
  const signal = teardown ? undefined : lifecycle.signal;
  return runCommand(
    lifecycle.pg.binaries.psql,
    [
      ...psqlConnectionArguments(lifecycle.port),
      "--tuples-only",
      "--no-align",
      `--command=${query}`,
    ],
    {
      env: lifecycle.commandEnv,
      timeoutMs: remainingTimeout(deadline, maximumTimeoutMs, stage),
      signal,
      stage,
    },
  );
}

function startupPreflightQuery(dataDirectory, port) {
  return `
select case when
  current_user = 'postgres'
  and session_user = 'postgres'
  and pg_catalog.current_database() = 'postgres'
  and pg_catalog.current_setting('server_version_num')::integer
    between 160000 and 169999
  and pg_catalog.host(pg_catalog.inet_server_addr()) = '127.0.0.1'
  and pg_catalog.inet_server_port() = ${port}
  and pg_catalog.current_setting('listen_addresses') = '127.0.0.1'
  and pg_catalog.current_setting('ssl') = 'off'
  and pg_catalog.current_setting('cluster_name') =
    '${PORTAL_FOLLOW_UP_CONCURRENCY_CLUSTER_NAME}'
  and pg_catalog.current_setting('data_directory') = '${dataDirectory}'
  and pg_catalog.current_setting(
    'careslink.portal_follow_up_concurrency_marker', true
  ) = '${PORTAL_FOLLOW_UP_CONCURRENCY_MARKER}'
  and not exists (
    select 1 from pg_catalog.pg_stat_ssl
    where pid = pg_catalog.pg_backend_pid() and ssl
  )
then 'ok' else 'unsafe' end;
`;
}

async function startPostgres(lifecycle, logDescriptor) {
  const stageDeadline =
    performance.now() +
    remainingTimeout(
      lifecycle.deadline,
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.startMs,
      "postgres-start",
    );
  const candidates = createPortCandidates();

  for (const port of candidates) {
    assertNotAborted(lifecycle.signal, "postgres-start");
    if (performance.now() >= stageDeadline) {
      break;
    }
    const args = [
      "-D",
      lifecycle.dataDirectory,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-c",
      "ssl=off",
      "-c",
      `unix_socket_directories=${lifecycle.socketDirectory}`,
      "-c",
      `cluster_name=${PORTAL_FOLLOW_UP_CONCURRENCY_CLUSTER_NAME}`,
      "-c",
      "timezone=UTC",
      "-c",
      "DateStyle=ISO,YMD",
      "-c",
      "max_connections=16",
      "-c",
      "log_connections=off",
      "-c",
      "log_disconnections=off",
      "-c",
      "log_statement=none",
      "-c",
      "log_min_error_statement=panic",
      "-c",
      "log_lock_waits=on",
      "-c",
      "deadlock_timeout=200ms",
      "-c",
      `application_name=${PORTAL_FOLLOW_UP_CONCURRENCY_MANAGEMENT_APPLICATION_NAME}`,
      "-c",
      `careslink.portal_follow_up_concurrency_marker=${PORTAL_FOLLOW_UP_CONCURRENCY_MARKER}`,
    ];
    const instance = createPostgresInstance(
      lifecycle.pg.binaries.postgres,
      args,
      lifecycle.commandEnv,
      logDescriptor,
    );
    lifecycle.postgresInstance = instance;
    lifecycle.port = port;

    const candidateDeadline = Math.min(
      stageDeadline,
      performance.now() + 5_000,
    );
    let accepted = false;
    while (!instance.exited && performance.now() < candidateDeadline) {
      assertNotAborted(lifecycle.signal, "postgres-start");
      try {
        await runCommand(
          lifecycle.pg.binaries.pg_isready,
          [
            "--host=127.0.0.1",
            `--port=${port}`,
            "--username=postgres",
            "--dbname=postgres",
            "--timeout=1",
            "--quiet",
          ],
          {
            env: lifecycle.commandEnv,
            timeoutMs: Math.max(
              1,
              Math.floor(
                Math.min(1_500, candidateDeadline - performance.now()),
              ),
            ),
            signal: lifecycle.signal,
            stage: "postgres-start",
          },
        );
        const preflight = await runPsqlQuery(
          lifecycle,
          startupPreflightQuery(lifecycle.dataDirectory, port),
          "postgres-start",
          Math.max(1, candidateDeadline - performance.now()),
        );
        accepted = preflight.stdout.trim() === "ok";
        break;
      } catch (error) {
        if (lifecycle.signal?.aborted) {
          throw error;
        }
      }
      await sleep(75);
    }

    if (accepted && !instance.exited) {
      return Object.freeze({ instance, port, candidateCount: candidates.length });
    }
    await stopPostgresInstance(instance, 1_000).catch(() => undefined);
    lifecycle.postgresInstance = null;
    lifecycle.port = null;
  }

  fail(
    "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_START_FAILED",
    "postgres-start",
  );
}

function quiesceQuery(port) {
  return `
do $careslink$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::integer
      not between 160000 and 169999
    or pg_catalog.host(pg_catalog.inet_server_addr()) <> '127.0.0.1'
    or pg_catalog.inet_server_port() <> ${port}
    or pg_catalog.current_setting(
      'careslink.portal_follow_up_concurrency_marker', true
    ) is distinct from '${PORTAL_FOLLOW_UP_CONCURRENCY_MARKER}'
    or pg_catalog.to_regrole(
      '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_roles as runner
      where runner.rolname = '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
        and runner.rolcanlogin
        and runner.rolinherit
        and not runner.rolsuper
        and not runner.rolcreatedb
        and not runner.rolcreaterole
        and not runner.rolreplication
        and not runner.rolbypassrls
        and pg_catalog.pg_has_role(
          '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}',
          'authenticated',
          'member'
        )
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_QUIESCE_UNSAFE';
  end if;
  execute 'alter role ${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE} nologin';
end
$careslink$;
`;
}

const RUNNER_SESSION_COUNT_QUERY = `
select pg_catalog.count(*)::integer
from pg_catalog.pg_stat_activity as activity
where activity.usename = '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
  and activity.backend_type = 'client backend';
`;

const RUNNER_SESSION_SAFETY_QUERY = `
select case when not exists (
  select 1
  from pg_catalog.pg_stat_activity as activity
  where activity.usename = '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
    and (
      activity.backend_type <> 'client backend'
      or activity.datname <> 'postgres'
      or pg_catalog.host(activity.client_addr) is distinct from '127.0.0.1'
      or activity.application_name !~
        '^careslink-portal-follow-up-race-(replay|same-key-conflict|different-key-stale|same-provider-actors|session|provider|flag|ownership-first)-(a|b|control|observer)$'
    )
) then 'safe' else 'unsafe' end;
`;

const TERMINATE_RUNNER_SESSIONS_QUERY = `
select pg_catalog.count(*)::integer
from (
  select pg_catalog.pg_terminate_backend(activity.pid, 5000) as terminated
  from pg_catalog.pg_stat_activity as activity
  where activity.usename = '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
    and activity.backend_type = 'client backend'
    and activity.datname = 'postgres'
    and pg_catalog.host(activity.client_addr) = '127.0.0.1'
    and activity.application_name ~
      '^careslink-portal-follow-up-race-(replay|same-key-conflict|different-key-stale|same-provider-actors|session|provider|flag|ownership-first)-(a|b|control|observer)$'
) as terminated_runner
where terminated_runner.terminated;
`;

async function quiesceRunner(lifecycle) {
  await runPsqlQuery(
    lifecycle,
    quiesceQuery(lifecycle.port),
    "runner-quiesce",
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.quiesceMs,
    { teardown: true },
  );

  const waitDeadline = Math.min(
    lifecycle.teardownDeadline,
    performance.now() + 2_000,
  );
  let count = null;
  do {
    const result = await runPsqlQuery(
      lifecycle,
      RUNNER_SESSION_COUNT_QUERY,
      "runner-quiesce",
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.quiesceMs,
      { teardown: true },
    );
    count = Number(result.stdout.trim());
    if (count === 0) {
      return Object.freeze({ noLogin: true, sessionsClosed: true });
    }
    await sleep(50);
  } while (performance.now() < waitDeadline);

  const safety = await runPsqlQuery(
    lifecycle,
    RUNNER_SESSION_SAFETY_QUERY,
    "runner-quiesce",
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.quiesceMs,
    { teardown: true },
  );
  if (safety.stdout.trim() !== "safe") {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_QUIESCE_FAILED",
      "runner-quiesce",
    );
  }
  await runPsqlQuery(
    lifecycle,
    TERMINATE_RUNNER_SESSIONS_QUERY,
    "runner-quiesce",
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.quiesceMs,
    { teardown: true },
  );
  const finalCount = await runPsqlQuery(
    lifecycle,
    RUNNER_SESSION_COUNT_QUERY,
    "runner-quiesce",
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.quiesceMs,
    { teardown: true },
  );
  if (Number(finalCount.stdout.trim()) !== 0) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_QUIESCE_FAILED",
      "runner-quiesce",
    );
  }
  return Object.freeze({ noLogin: true, sessionsClosed: true });
}

const POSTCHECK_QUERY = `
select case when
  pg_catalog.to_regrole(
    '${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}'
  ) is null
  and pg_catalog.to_regnamespace(
    '${PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA}'
  ) is null
  and (
    select pg_catalog.count(*)
    from public.portal_workflow_flags
  ) = 6
  and not exists (
    select 1 from public.portal_workflow_flags
    where enabled or not preview_only
  )
  and not exists (select 1 from auth.sessions)
  and not exists (select 1 from auth.users)
  and not exists (select 1 from public.portal_organizations)
  and not exists (select 1 from public.portal_organization_memberships)
  and not exists (select 1 from public.portal_providers)
  and not exists (select 1 from public.portal_referrals)
  and not exists (
    select 1 from careslink_portal_private.portal_referral_contacts
  )
  and not exists (select 1 from public.portal_referral_matches)
  and not exists (select 1 from public.portal_referral_followups)
  and not exists (select 1 from public.portal_audit_events)
  and not exists (select 1 from public.portal_mutation_receipts)
  and (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger
    where tgname in (
      'portal_followups_append_only',
      'portal_audit_append_only',
      'portal_receipts_append_only'
    )
      and not tgisinternal
      and tgenabled = 'O'
  ) = 3
then 'ok' else 'failed' end;
`;

async function exactDeleteTempRoot(lifecycle) {
  const tempRoot = validatePortalFollowUpConcurrencyTempRoot(
    lifecycle.tempRoot,
  );
  const rootState = await lstat(tempRoot);
  if (!rootState.isDirectory() || rootState.isSymbolicLink()) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }
  if ((await realpath(tempRoot)) !== tempRoot) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }
  const marker = await readFile(join(tempRoot, OWNER_MARKER_FILE), "utf8");
  if (marker !== lifecycle.ownerMarker) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }

  await withLifecycleDeadline(
    rm(tempRoot, { recursive: true, force: false, maxRetries: 2 }),
    remainingTimeout(
      lifecycle.teardownDeadline,
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.exactDeleteMs,
      "exact-temp-delete",
    ),
    "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
    "exact-temp-delete",
  );
  try {
    await lstat(tempRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Object.freeze({ removed: true });
    }
    throw error;
  }
  fail(
    "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
    "exact-temp-delete",
  );
}

function parseLiveHarnessResult(stdout) {
  const text = stdout.trim();
  if (text.length === 0 || text.length > 16_384 || text.includes("\n")) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  if (
    value?.ok !== true ||
    value?.gate !== "portal-referral-follow-up-concurrency" ||
    Number(value?.postgresMajor) !== 16 ||
    value?.target !== "passwordless-ipv4-loopback" ||
    value?.marker !== PORTAL_FOLLOW_UP_CONCURRENCY_MARKER ||
    Number(value?.scenariosPassed) !== 8 ||
    !Array.isArray(value?.scenarios) ||
    value.scenarios.length !== 8 ||
    value.scenarios.some(
      (scenario, index) => scenario !== EXPECTED_LIVE_SCENARIOS[index],
    ) ||
    value?.cleanup !== "aggregate-fixture-zero"
  ) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  return Object.freeze({ ...value, scenarios: Object.freeze(value.scenarios) });
}

function liveFailureFromError(error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const lines = stderr.split(/\r?\n/).filter(Boolean);
  const last = lines.at(-1);
  if (isFixedPortalCode(last)) {
    const safe = new Error(last);
    safe.safeCode = last;
    safe.lifecycleStage = "live-harness";
    return safe;
  }
  return error;
}

async function readAndValidateFiles() {
  const migrationEntries = await Promise.all(
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS.map(async (entry) =>
      Object.freeze({
        file: entry.file,
        sql: await readFile(join(MIGRATION_DIRECTORY, entry.file), "utf8"),
      }),
    ),
  );
  const manifest = assertPortalFollowUpConcurrencyMigrationManifest(
    migrationEntries,
  );
  const paths = Object.freeze({
    bootstrap: join(
      SCRIPT_DIRECTORY,
      "portal-referral-follow-up-concurrency-local-pg16-bootstrap.sql",
    ),
    setup: join(
      SCRIPT_DIRECTORY,
      "portal-referral-follow-up-concurrency-setup.sql",
    ),
    cleanup: join(
      SCRIPT_DIRECTORY,
      "portal-referral-follow-up-concurrency-cleanup.sql",
    ),
    live: join(
      SCRIPT_DIRECTORY,
      "portal-referral-follow-up-concurrency.mjs",
    ),
  });
  const [bootstrapSql, setupSql, cleanupSql, liveSource] = await Promise.all([
    readFile(paths.bootstrap, "utf8"),
    readFile(paths.setup, "utf8"),
    readFile(paths.cleanup, "utf8"),
    readFile(paths.live, "utf8"),
  ]);
  const sqlPolicy = assertPortalFollowUpConcurrencyLocalPg16SqlPolicy(
    bootstrapSql,
    setupSql,
    cleanupSql,
  );
  const combinedSql = `${bootstrapSql}\n${setupSql}\n${cleanupSql}`;
  if (
    !bootstrapSql.includes(PORTAL_FOLLOW_UP_CONCURRENCY_MARKER) ||
    !setupSql.includes(PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE) ||
    !setupSql.includes(PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA) ||
    !setupSql.includes("portal_referral_follow_up_record") ||
    !cleanupSql.includes(PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE) ||
    !cleanupSql.includes(PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA) ||
    !liveSource.includes("readPortalFollowUpConcurrencyEnvironment") ||
    /\btruncate\b/i.test(combinedSql) ||
    /(?:supabase\.co|pooler\.supabase\.com)/i.test(combinedSql)
  ) {
    fail(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_FILE_POLICY_FAILED",
      "file-policy",
    );
  }
  return Object.freeze({
    manifest,
    migrationEntries: Object.freeze(migrationEntries),
    paths,
    sqlPolicy,
  });
}

async function performTeardown(lifecycle, files, timings) {
  const failures = [];
  const cleanupState = {
    runnerQuiesced: false,
    sqlCleanup: false,
    postcheck: false,
    postgresStopped: false,
    forcedStop: false,
    tempRootRemoved: false,
  };
  lifecycle.teardownDeadline =
    performance.now() +
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.cleanupMs +
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.stopMs +
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.exactDeleteMs;

  if (
    lifecycle.setupApplied &&
    (!lifecycle.postgresInstance || lifecycle.postgresInstance.exited)
  ) {
    failures.push(
      Object.freeze({
        code: "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_QUIESCE_FAILED",
        stage: "runner-quiesce",
      }),
    );
  }

  if (
    lifecycle.setupApplied &&
    lifecycle.postgresInstance &&
    !lifecycle.postgresInstance.exited
  ) {
    try {
      await measureStage(timings, "runner-quiesce", async () => {
        await quiesceRunner(lifecycle);
      });
      cleanupState.runnerQuiesced = true;
    } catch (error) {
      failures.push(
        normalizedFailure(
          error,
          "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_QUIESCE_FAILED",
          "runner-quiesce",
        ),
      );
    }

    if (cleanupState.runnerQuiesced) {
      try {
        await measureStage(timings, "sql-cleanup", async () => {
          await runPsqlFile(
            lifecycle,
            files.paths.cleanup,
            "sql-cleanup",
            PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.cleanupMs,
            { teardown: true },
          );
        });
        cleanupState.sqlCleanup = true;
      } catch (error) {
        failures.push(
          normalizedFailure(
            error,
            "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_CLEANUP_FAILED",
            "sql-cleanup",
          ),
        );
      }
    }

    if (cleanupState.sqlCleanup) {
      try {
        await measureStage(timings, "terminal-postcheck", async () => {
          const postcheck = await runPsqlQuery(
            lifecycle,
            POSTCHECK_QUERY,
            "terminal-postcheck",
            PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.cleanupMs,
            { teardown: true },
          );
          if (postcheck.stdout.trim() !== "ok") {
            fail(
              "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POSTCHECK_FAILED",
              "terminal-postcheck",
            );
          }
        });
        cleanupState.postcheck = true;
      } catch (error) {
        failures.push(
          normalizedFailure(
            error,
            "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POSTCHECK_FAILED",
            "terminal-postcheck",
          ),
        );
      }
    }
  }

  if (lifecycle.postgresInstance) {
    try {
      const stopState = await measureStage(timings, "postgres-stop", () =>
        stopPostgresInstance(
          lifecycle.postgresInstance,
          PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.stopMs,
        ),
      );
      cleanupState.postgresStopped = stopState.stopped;
      cleanupState.forcedStop = stopState.forced;
    } catch (error) {
      failures.push(
        normalizedFailure(
          error,
          "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_STOP_FAILED",
          "postgres-stop",
        ),
      );
    }
  } else {
    cleanupState.postgresStopped = true;
  }

  if (lifecycle.logHandle) {
    await lifecycle.logHandle.close().catch(() => undefined);
    lifecycle.logHandle = null;
  }

  if (lifecycle.tempRoot && cleanupState.postgresStopped) {
    try {
      await measureStage(timings, "exact-temp-delete", async () => {
        await exactDeleteTempRoot(lifecycle);
      });
      cleanupState.tempRootRemoved = true;
    } catch (error) {
      failures.push(
        normalizedFailure(
          error,
          "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_DELETE_FAILED",
          "exact-temp-delete",
        ),
      );
    }
  }

  return Object.freeze({
    state: Object.freeze(cleanupState),
    failures: Object.freeze(failures),
  });
}

export async function runPortalFollowUpConcurrencyLocalPg16({
  argv = [],
  signal,
} = {}) {
  assertPortalFollowUpConcurrencyPolicyRegression();
  const args = parsePortalFollowUpConcurrencyLocalPg16Arguments(argv);
  const timings = {};
  const deadline =
    performance.now() +
    PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.totalMs;
  const lifecycle = {
    commandEnv: null,
    dataDirectory: null,
    deadline,
    logHandle: null,
    ownerMarker: null,
    pg: null,
    port: null,
    postgresInstance: null,
    setupApplied: false,
    signal,
    socketDirectory: null,
    teardownDeadline: null,
    tempRoot: null,
  };
  let files = null;
  let liveResult = null;
  let primaryFailure = null;

  try {
    files = await measureStage(timings, "file-policy", readAndValidateFiles);
    lifecycle.pg = await measureStage(timings, "binary-preflight", () =>
      resolvePg16Binaries(args.pgBinDir, deadline, signal),
    );
    lifecycle.commandEnv = fixedCommandEnvironment(lifecycle.pg.binDirectory);

    lifecycle.tempRoot = validatePortalFollowUpConcurrencyTempRoot(
      await mkdtemp(TEMP_ROOT_PREFIX),
    );
    await chmod(lifecycle.tempRoot, 0o700);
    lifecycle.ownerMarker = randomBytes(32).toString("hex");
    const markerHandle = await open(
      join(lifecycle.tempRoot, OWNER_MARKER_FILE),
      "wx",
      0o600,
    );
    await markerHandle.writeFile(lifecycle.ownerMarker, "utf8");
    await markerHandle.close();
    lifecycle.dataDirectory = join(lifecycle.tempRoot, "data");
    lifecycle.socketDirectory = join(lifecycle.tempRoot, "socket");
    await mkdir(lifecycle.socketDirectory, { mode: 0o700 });
    lifecycle.logHandle = await open(
      join(lifecycle.tempRoot, "postgres.log"),
      "a",
      0o600,
    );

    await measureStage(timings, "initdb", async () => {
      await runCommand(
        lifecycle.pg.binaries.initdb,
        [
          `--pgdata=${lifecycle.dataDirectory}`,
          "--username=postgres",
          "--encoding=UTF8",
          "--locale=C",
          "--auth-local=trust",
          "--auth-host=trust",
          "--data-checksums",
          "--no-sync",
        ],
        {
          env: lifecycle.commandEnv,
          timeoutMs: remainingTimeout(
            deadline,
            PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.initdbMs,
            "initdb",
          ),
          signal,
          stage: "initdb",
        },
      );
    });

    await measureStage(timings, "postgres-start", () =>
      startPostgres(lifecycle, lifecycle.logHandle.fd),
    );

    await measureStage(timings, "bootstrap", async () => {
      await runPsqlFile(
        lifecycle,
        files.paths.bootstrap,
        "bootstrap",
        PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.sqlFileMs,
      );
    });

    for (const migration of PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS) {
      await measureStage(timings, "migrations", async () => {
        await runPsqlFile(
          lifecycle,
          join(MIGRATION_DIRECTORY, migration.file),
          "migrations",
          PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.sqlFileMs,
        );
      });
    }

    await measureStage(timings, "setup", async () => {
      await runPsqlFile(
        lifecycle,
        files.paths.setup,
        "setup",
        PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.sqlFileMs,
      );
    });
    lifecycle.setupApplied = true;

    const databaseUrl =
      `postgresql://${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}` +
      `@127.0.0.1:${lifecycle.port}/postgres`;
    validatePortalFollowUpConcurrencyDatabaseUrl(databaseUrl);
    liveResult = await measureStage(timings, "live-harness", async () => {
      try {
        const live = await runCommand(process.execPath, [files.paths.live], {
          env: fixedLiveEnvironment(databaseUrl),
          timeoutMs: remainingTimeout(
            deadline,
            PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.liveHarnessMs,
            "live-harness",
          ),
          signal,
          stage: "live-harness",
        });
        return parseLiveHarnessResult(live.stdout);
      } catch (error) {
        if (error?.killed || error?.signal === "SIGKILL") {
          fail(
            "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_TIMEOUT",
            "live-harness",
          );
        }
        throw liveFailureFromError(error);
      }
    });
  } catch (error) {
    const stage = error?.stage ?? error?.lifecycleStage ?? "lifecycle";
    let fallback =
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INTERNAL_FAILED";
    if (stage === "initdb") {
      fallback = "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INITDB_FAILED";
    } else if (stage === "bootstrap") {
      fallback = "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_BOOTSTRAP_FAILED";
    } else if (stage === "migrations") {
      fallback = "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATION_FAILED";
    } else if (stage === "setup") {
      fallback = "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_SETUP_FAILED";
    } else if (stage === "live-harness") {
      fallback = "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_LIVE_FAILED";
    } else if (stage === "file-policy") {
      fallback =
        "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_FILE_POLICY_FAILED";
    }
    primaryFailure = normalizedFailure(error, fallback, stage);
  }

  const teardown = await performTeardown(lifecycle, files, timings);
  if (primaryFailure || teardown.failures.length > 0) {
    const failure = mergePortalFollowUpConcurrencyLifecycleFailure(
      primaryFailure,
      teardown.failures,
    );
    const evidence = Object.freeze({
      ...failure,
      postgresMajor: 16,
      portSelected: Number.isSafeInteger(lifecycle.port),
      timingsMs: Object.freeze({ ...timings }),
      cleanup: teardown.state,
    });
    throw new PortalFollowUpConcurrencyLocalPg16Error(
      failure.code,
      failure.stage,
      evidence,
    );
  }

  return Object.freeze({
    ok: true,
    gate: "portal-referral-follow-up-concurrency-local-pg16",
    policyVersion: PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    postgresVersion: lifecycle.pg.version,
    postgresMajor: 16,
    target: "fresh-passwordless-ipv4-loopback",
    port: lifecycle.port,
    migrationCount: files.manifest.migrationCount,
    migrationManifestSha256: files.manifest.manifestSha256,
    supportSqlSha256: Object.freeze({
      bootstrap: files.sqlPolicy.bootstrapSha256,
      setup: files.sqlPolicy.setupSha256,
      cleanup: files.sqlPolicy.cleanupSha256,
    }),
    live: liveResult,
    timingsMs: Object.freeze({ ...timings }),
    cleanup: teardown.state,
  });
}

async function main() {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const result = await runPortalFollowUpConcurrencyLocalPg16({
      argv: process.argv.slice(2),
      signal: abortController.signal,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    const evidence =
      error instanceof PortalFollowUpConcurrencyLocalPg16Error &&
      error.evidence
        ? error.evidence
        : mergePortalFollowUpConcurrencyLifecycleFailure(
            normalizedFailure(
              error,
              "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INTERNAL_FAILED",
              "internal",
            ),
            [],
          );
    process.stderr.write(`${JSON.stringify(evidence)}\n`);
    process.exitCode = 1;
  });
}
