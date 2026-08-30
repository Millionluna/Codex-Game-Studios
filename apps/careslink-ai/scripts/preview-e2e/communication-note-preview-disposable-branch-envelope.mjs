import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES as IDENTITY_ERRORS,
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
  CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
  extractCommunicationNotePreviewBranchDatabaseTarget,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAXIMUM_STDIN_BYTES = IDENTITY_POLICY.maximumStdinBytes;

export const COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY =
  Object.freeze({
    version: "2026-08-30.preview-disposable-branch-envelope.1",
    productionProjectRef: IDENTITY_POLICY.productionProjectRef,
    requiredStatus: "ACTIVE_HEALTHY",
    maximumStdinBytes: MAXIMUM_STDIN_BYTES,
  });

export const COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES =
  Object.freeze({
    argumentInvalid: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ARGUMENT_INVALID",
    productionDenied: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_PRODUCTION_DENIED",
    environmentDenied: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ENVIRONMENT_DENIED",
    stdinInvalid: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_STDIN_INVALID",
    credentialInvalid: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_CREDENTIAL_INVALID",
    internalFailed: "PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_INTERNAL_FAILED",
  });

const FIXED_ERROR_CODES = new Set(
  Object.values(
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES,
  ),
);

export class CommunicationNotePreviewDisposableBranchEnvelopeError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
          .internalFailed;
    super(fixedCode);
    this.name = "CommunicationNotePreviewDisposableBranchEnvelopeError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewDisposableBranchEnvelopeError(code);
}

function isPlainRecord(value) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function ownString(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}

function optionalSingleString(object, keys) {
  const values = new Set();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor) continue;
    const value = ownString(object, key);
    if (value === null || value.length === 0) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
          .credentialInvalid,
      );
    }
    values.add(value);
  }
  if (values.size > 1) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
        .credentialInvalid,
    );
  }
  return values.size === 1 ? [...values][0] : null;
}

function requiredSingleString(object, keys) {
  const value = optionalSingleString(object, keys);
  if (value === null) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
        .credentialInvalid,
    );
  }
  return value;
}

export function parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(
  argv,
) {
  const errorCodes =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES;
  if (!Array.isArray(argv) || argv.length !== 6) {
    fail(errorCodes.argumentInvalid);
  }
  const values = new Map();
  for (const argument of argv) {
    if (typeof argument !== "string" || !argument.startsWith("--")) {
      fail(errorCodes.argumentInvalid);
    }
    const separator = argument.indexOf("=");
    if (separator < 3 || separator === argument.length - 1) {
      fail(errorCodes.argumentInvalid);
    }
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (values.has(key) || CONTROL_CHARACTER_PATTERN.test(value)) {
      fail(errorCodes.argumentInvalid);
    }
    values.set(key, value);
  }

  const ref = values.get("ref");
  const parentProjectRef = values.get("parent-project-ref");
  const status = values.get("status");
  if (
    values.size !== 6 ||
    !PROJECT_REF_PATTERN.test(ref ?? "") ||
    !PROJECT_REF_PATTERN.test(parentProjectRef ?? "") ||
    status !==
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
        .requiredStatus ||
    values.get("is-default") !== "false" ||
    values.get("persistent") !== "false" ||
    values.get("with-data") !== "false"
  ) {
    fail(errorCodes.argumentInvalid);
  }
  if (
    ref ===
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
      .productionProjectRef
  ) {
    fail(errorCodes.productionDenied);
  }
  if (
    parentProjectRef !==
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
      .productionProjectRef
  ) {
    fail(errorCodes.argumentInvalid);
  }

  return Object.freeze({
    ref,
    parentProjectRef,
    status,
    isDefault: false,
    persistent: false,
    withData: false,
  });
}

export function assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment(
  environment,
) {
  const entries = Object.entries(environment ?? {});
  if (
    entries.some(([key]) => /^PG[A-Z0-9_]*$/.test(key)) ||
    Object.hasOwn(environment ?? {}, "NODE_OPTIONS") ||
    Object.hasOwn(environment ?? {}, "NODE_PATH") ||
    (Object.hasOwn(environment ?? {}, "NODE_TLS_REJECT_UNAUTHORIZED") &&
      environment.NODE_TLS_REJECT_UNAUTHORIZED === "0")
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
        .environmentDenied,
    );
  }
}

function parseCredentialRoot(input) {
  const errorCodes =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES;
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    Buffer.byteLength(input, "utf8") > MAXIMUM_STDIN_BYTES ||
    CONTROL_CHARACTER_PATTERN.test(input.replace(/[\n\r\t]/g, ""))
  ) {
    fail(errorCodes.stdinInvalid);
  }
  let root;
  try {
    root = JSON.parse(input.trim());
  } catch {
    fail(errorCodes.stdinInvalid);
  }
  if (!isPlainRecord(root)) fail(errorCodes.credentialInvalid);

  const dataDescriptor = Object.getOwnPropertyDescriptor(root, "data");
  const resultDescriptor = Object.getOwnPropertyDescriptor(root, "result");
  if (dataDescriptor && resultDescriptor) fail(errorCodes.credentialInvalid);
  const envelopeDescriptor = dataDescriptor ?? resultDescriptor;
  if (envelopeDescriptor) {
    if (!("value" in envelopeDescriptor)) fail(errorCodes.credentialInvalid);
    root = envelopeDescriptor.value;
  }
  if (!isPlainRecord(root)) fail(errorCodes.credentialInvalid);
  return root;
}

export function createCommunicationNotePreviewDisposableBranchEnvelope(
  input,
  metadata,
) {
  const errorCodes =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES;
  if (
    !isPlainRecord(metadata) ||
    Object.keys(metadata).length !== 6 ||
    !PROJECT_REF_PATTERN.test(metadata.ref ?? "") ||
    metadata.parentProjectRef !==
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
        .productionProjectRef ||
    metadata.status !==
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
        .requiredStatus ||
    metadata.isDefault !== false ||
    metadata.persistent !== false ||
    metadata.withData !== false
  ) {
    fail(errorCodes.argumentInvalid);
  }
  if (
    metadata.ref ===
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY
      .productionProjectRef
  ) {
    fail(errorCodes.productionDenied);
  }

  try {
    extractCommunicationNotePreviewBranchDatabaseTarget(input, {
      expectedBranchRef: metadata.ref,
    });
  } catch (error) {
    if (
      error instanceof
        CommunicationNotePreviewRunnerTerminalIdentityPolicyError &&
      error.code === IDENTITY_ERRORS.productionDenied
    ) {
      fail(errorCodes.productionDenied);
    }
    fail(errorCodes.credentialInvalid);
  }

  const root = parseCredentialRoot(input);
  const suppliedRef = optionalSingleString(root, [
    "REF",
    "ref",
    "PROJECT_REF",
    "project_ref",
  ]);
  const suppliedStatus = optionalSingleString(root, ["STATUS", "status"]);
  const postgresUrlNonPooling = requiredSingleString(root, [
    "POSTGRES_URL_NON_POOLING",
    "postgres_url_non_pooling",
  ]);
  const postgresUrl = requiredSingleString(root, [
    "POSTGRES_URL",
    "postgres_url",
  ]);
  if (
    (suppliedRef !== null && suppliedRef !== metadata.ref) ||
    (suppliedStatus !== null && suppliedStatus !== metadata.status)
  ) {
    fail(errorCodes.credentialInvalid);
  }

  return {
    metadata: {
      ref: metadata.ref,
      parent_project_ref: metadata.parentProjectRef,
      is_default: false,
      persistent: false,
      with_data: false,
      status: metadata.status,
    },
    credentials: {
      REF: metadata.ref,
      STATUS: metadata.status,
      POSTGRES_URL_NON_POOLING: postgresUrlNonPooling,
      POSTGRES_URL: postgresUrl,
    },
  };
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAXIMUM_STDIN_BYTES) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
          .stdinInvalid,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function main() {
  assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment(
    process.env,
  );
  const metadata =
    parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(
      process.argv.slice(2),
    );
  const input = await readBoundedStdin();
  const envelope = createCommunicationNotePreviewDisposableBranchEnvelope(
    input,
    metadata,
  );
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code =
      error instanceof CommunicationNotePreviewDisposableBranchEnvelopeError
        ? error.code
        : COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES
            .internalFailed;
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
