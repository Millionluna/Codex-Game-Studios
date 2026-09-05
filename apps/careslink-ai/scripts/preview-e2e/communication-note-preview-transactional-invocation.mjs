import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  selectCommunicationNoteDisposablePreviewBranch,
} from "./communication-note-preview-disposable-branch-control.mjs";
import {
  assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment,
  createCommunicationNotePreviewDisposableBranchEnvelope,
} from "./communication-note-preview-disposable-branch-envelope.mjs";
import {
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import {
  parseTransactionalMigrationArguments,
} from "./communication-note-preview-transactional-migrations.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY as POLICY,
  loadPinnedCommunicationNotePreviewMigrations,
} from "./communication-note-preview-transactional-migrations-policy.mjs";

const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RUNNER = fileURLToPath(new URL(
  "./communication-note-preview-transactional-migrations.mjs", import.meta.url,
));
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CHECKPOINTS = new Set([
  "arguments", "environment", "cli_version", "certificate", "manifest",
  "branch_before_credentials", "read_credentials", "branch_after_credentials",
  "credential_envelope", "runner",
]);

export class CommunicationNotePreviewTransactionalInvocationError extends Error {
  constructor(checkpoint) {
    super("PREVIEW_TRANSACTIONAL_INVOCATION_FAILED");
    this.code = "PREVIEW_TRANSACTIONAL_INVOCATION_FAILED";
    this.checkpoint = CHECKPOINTS.has(checkpoint) ? checkpoint : "arguments";
  }
}

export function parseCommunicationNotePreviewTransactionalInvocationArguments(argv) {
  const invalid = () => { throw new CommunicationNotePreviewTransactionalInvocationError("arguments"); };
  if (!Array.isArray(argv) || argv.length !== 7) invalid();
  const identity = new Map();
  const migrationArgv = [];
  for (const arg of argv) {
    if (typeof arg !== "string") invalid();
    const separator = arg.indexOf("=");
    const key = arg.slice(0, separator);
    if (["--expected-branch-id", "--expected-branch-name"].includes(key)) {
      if (identity.has(key)) invalid();
      identity.set(key, arg.slice(separator + 1));
    } else migrationArgv.push(arg);
  }
  const lockedId = identity.get("--expected-branch-id");
  const expectedName = identity.get("--expected-branch-name");
  if (
    identity.size !== 2 || !UUID_PATTERN.test(lockedId ?? "") ||
    typeof expectedName !== "string" || expectedName.length === 0 ||
    expectedName.length > 255 || /[\u0000-\u001f\u007f]/.test(expectedName)
  ) invalid();
  let migration;
  try { migration = parseTransactionalMigrationArguments(migrationArgv); }
  catch { invalid(); }
  // This entry point is for the hosted gate, never a local/Production fallback.
  if (migration.expectedPostgresMajor !== 17) invalid();
  return Object.freeze({
    ...migration,
    migrationArgv: Object.freeze(migrationArgv),
    selection: Object.freeze({
      expectedName, lockedId,
      lockedRef: migration.expectedBranchRef,
      productionProjectRef: POLICY.productionProjectRef,
    }),
  });
}

function childEnvironment(environment, forCli = false) {
  const keys = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];
  if (forCli) keys.push("SUPABASE_ACCESS_TOKEN");
  return Object.fromEntries(keys.filter((key) =>
    typeof environment[key] === "string"
  ).map((key) => [key, environment[key]]));
}

function readCli(args, environment) {
  return new Promise((resolve, reject) => {
    execFile("supabase", args, {
      cwd: APP_ROOT, env: environment, encoding: "utf8",
      timeout: 45_000, maxBuffer: POLICY.maximumStdinBytes,
    }, (error, stdout) => {
      // Never forward CLI stderr, API keys, URLs or the subprocess error object.
      if (error) reject(new Error("CLI_FAILED"));
      else resolve(stdout);
    });
  });
}

function runMigration(argv, input, environment) {
  return new Promise((resolve, reject) => {
    // Only the fixed, versioned runner may inherit evidence output. It already
    // serializes fixed M00 failure evidence. Credentials use anonymous stdin.
    const child = spawn(process.execPath, [RUNNER, ...argv], {
      cwd: APP_ROOT, env: environment, stdio: ["pipe", "inherit", "inherit"],
      timeout: 15 * 60_000, killSignal: "SIGTERM",
    });
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      child.kill("SIGTERM");
    };
    const detach = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.once("error", () => {
      detach();
      reject(new Error("RUNNER_START_FAILED"));
    });
    child.once("close", (code) => {
      detach();
      if (code === 0 && !interrupted) resolve();
      else reject(new Error("RUNNER_FAILED"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function readyBranch(input, selection) {
  const target = selectCommunicationNoteDisposablePreviewBranch(input, selection);
  if (
    target.previewProjectStatus !== "ACTIVE_HEALTHY" ||
    target.pipelineStatus !== "FUNCTIONS_DEPLOYED"
  ) throw new Error("PREVIEW_NOT_READY");
  return target;
}

// The lifecycle owner creates/attests one authorized Preview and MUST delete it
// in finally, including when this entry point fails. This entry point never
// creates, deletes, retries, changes permissions, or substitutes a target.
export async function runCommunicationNotePreviewTransactionalInvocation({
  argv,
  environment = process.env,
  readCliOutput = readCli,
  runMigrationProcess = runMigration,
  readCertificate = readFile,
  loadMigrations = loadPinnedCommunicationNotePreviewMigrations,
}) {
  let checkpoint = "arguments";
  let rawCredentials;
  let envelope;
  try {
    const args = parseCommunicationNotePreviewTransactionalInvocationArguments(argv);
    checkpoint = "environment";
    assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment(environment);
    const cliEnvironment = childEnvironment(environment, true);
    checkpoint = "cli_version";
    if ((await readCliOutput(["--version"], cliEnvironment)).trim() !== POLICY.expectedCliVersion) {
      throw new Error("CLI_VERSION_MISMATCH");
    }
    checkpoint = "certificate";
    const certificate = await readCertificate(args.sslRootCertPath);
    if (
      !Buffer.isBuffer(certificate) || certificate.length === 0 ||
      certificate.length > 65_536 ||
      createHash("sha256").update(certificate).digest("hex") !== args.expectedSslRootCertSha256
    ) throw new Error("CA_MISMATCH");
    checkpoint = "manifest";
    await loadMigrations();
    const listArguments = ["branches", "list", "--project-ref", POLICY.productionProjectRef, "-o", "json"];
    checkpoint = "branch_before_credentials";
    readyBranch(await readCliOutput(listArguments, cliEnvironment), args.selection);
    checkpoint = "read_credentials";
    rawCredentials = await readCliOutput([
      "branches", "get", args.selection.lockedId,
      "--project-ref", POLICY.productionProjectRef, "-o", "json",
    ], cliEnvironment);
    checkpoint = "branch_after_credentials";
    const target = readyBranch(await readCliOutput(listArguments, cliEnvironment), args.selection);
    checkpoint = "credential_envelope";
    // CLI standard-env JSON has no REF/STATUS. Reuse the existing converter:
    // metadata comes from the re-attested list, while both URLs independently
    // bind the same Preview ref/role/password. API/JWT keys are discarded.
    envelope = createCommunicationNotePreviewDisposableBranchEnvelope(rawCredentials, {
      ref: target.projectRef, parentProjectRef: target.parentProjectRef,
      status: target.previewProjectStatus, isDefault: target.isDefault,
      persistent: target.persistent, withData: target.withData,
    });
    rawCredentials = undefined;
    extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
      JSON.stringify(envelope), { expectedBranchRef: args.expectedBranchRef },
    );
    checkpoint = "runner";
    await runMigrationProcess(args.migrationArgv, JSON.stringify(envelope), childEnvironment(environment));
    return Object.freeze({ stage: "preview_invocation", ok: true, policy: POLICY.version });
  } catch {
    throw new CommunicationNotePreviewTransactionalInvocationError(checkpoint);
  } finally {
    rawCredentials = undefined;
    envelope = undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCommunicationNotePreviewTransactionalInvocation({ argv: process.argv.slice(2) })
    .then((evidence) => process.stdout.write(`${JSON.stringify(evidence)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({
        stage: "preview_invocation", ok: false,
        errorType: "PREVIEW_TRANSACTIONAL_INVOCATION_FAILED",
        checkpoint: error instanceof CommunicationNotePreviewTransactionalInvocationError
          ? error.checkpoint : "arguments",
      })}\n`);
      process.exitCode = 1;
    });
}
