import { types as nodeTypes } from "node:util";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAXIMUM_STDIN_BYTES = IDENTITY_POLICY.maximumStdinBytes;
const MAXIMUM_BRANCHES = 256;

const BRANCH_REQUIRED_KEYS = Object.freeze([
  "created_at",
  "id",
  "is_default",
  "name",
  "parent_project_ref",
  "persistent",
  "project_ref",
  "status",
  "updated_at",
  "with_data",
]);
const BRANCH_OPTIONAL_KEYS = Object.freeze([
  "deletion_scheduled_at",
  "git_branch",
  "latest_check_run_id",
  "notify_url",
  "pr_number",
  "preview_project_status",
  "review_requested_at",
]);
const BRANCH_KEYS = Object.freeze([
  ...BRANCH_REQUIRED_KEYS,
  ...BRANCH_OPTIONAL_KEYS,
]);
const CREATE_KEYS = Object.freeze([...BRANCH_KEYS, "message"]);

const PIPELINE_STATUSES = new Set([
  "CREATING_PROJECT",
  "FUNCTIONS_DEPLOYED",
  "FUNCTIONS_FAILED",
  "MIGRATIONS_FAILED",
  "MIGRATIONS_PASSED",
  "RUNNING_MIGRATIONS",
]);
const PREVIEW_PROJECT_STATUSES = new Set([
  "ACTIVE_HEALTHY",
  "ACTIVE_UNHEALTHY",
  "COMING_UP",
  "GOING_DOWN",
  "INACTIVE",
  "INIT_FAILED",
  "PAUSE_FAILED",
  "PAUSING",
  "REMOVED",
  "RESIZING",
  "RESTARTING",
  "RESTORE_FAILED",
  "RESTORING",
  "UNKNOWN",
  "UPGRADING",
]);

export const COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY =
  Object.freeze({
    version: "2026-09-04.preview-disposable-branch-control.1",
    productionProjectRef: IDENTITY_POLICY.productionProjectRef,
    createMessage: "Created preview branch",
    readyPreviewProjectStatus: "ACTIVE_HEALTHY",
    readyPipelineStatus: "FUNCTIONS_DEPLOYED",
    maximumStdinBytes: MAXIMUM_STDIN_BYTES,
    maximumBranches: MAXIMUM_BRANCHES,
  });

export const COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES =
  Object.freeze({
    argumentInvalid: "PREVIEW_DISPOSABLE_BRANCH_CONTROL_ARGUMENT_INVALID",
    stdinInvalid: "PREVIEW_DISPOSABLE_BRANCH_CONTROL_STDIN_INVALID",
    branchShapeInvalid:
      "PREVIEW_DISPOSABLE_BRANCH_CONTROL_BRANCH_SHAPE_INVALID",
    createInvalid: "PREVIEW_DISPOSABLE_BRANCH_CONTROL_CREATE_INVALID",
    productionInvalid:
      "PREVIEW_DISPOSABLE_BRANCH_CONTROL_PRODUCTION_INVALID",
    targetInvalid: "PREVIEW_DISPOSABLE_BRANCH_CONTROL_TARGET_INVALID",
    cleanupDiscoveryInvalid:
      "PREVIEW_DISPOSABLE_BRANCH_CONTROL_CLEANUP_DISCOVERY_INVALID",
    identityMismatch:
      "PREVIEW_DISPOSABLE_BRANCH_CONTROL_IDENTITY_MISMATCH",
    absenceUnproven:
      "PREVIEW_DISPOSABLE_BRANCH_CONTROL_ABSENCE_UNPROVEN",
    internalFailed: "PREVIEW_DISPOSABLE_BRANCH_CONTROL_INTERNAL_FAILED",
  });

const FIXED_ERROR_CODES = new Set(
  Object.values(
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES,
  ),
);

export class CommunicationNotePreviewDisposableBranchControlError
  extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
          .internalFailed;
    super(fixedCode);
    this.name = "CommunicationNotePreviewDisposableBranchControlError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewDisposableBranchControlError(code);
}

function plainRecord(value, code) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }
  return value;
}

function ownDataValue(object, key, code) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) fail(code);
  return descriptor.value;
}

function optionalOwnDataValue(object, key, code) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return Object.freeze({ present: false, value: undefined });
  if (!("value" in descriptor)) fail(code);
  return Object.freeze({ present: true, value: descriptor.value });
}

function hasOnlyAllowedKeys(object, allowedKeys, requiredKeys) {
  const allowed = new Set(allowedKeys);
  const keys = Object.keys(object);
  return keys.every((key) => allowed.has(key)) &&
    requiredKeys.every((key) => keys.includes(key));
}

function validBoundedString(value, maximumLength = 2_048) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !CONTROL_CHARACTER_PATTERN.test(value);
}

function validNullableString(value, maximumLength = 2_048) {
  return value === null || validBoundedString(value, maximumLength);
}

function validUuid(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return false;
  const normalized = value.toLowerCase();
  return normalized !== "00000000-0000-0000-0000-000000000000" &&
    normalized !== "ffffffff-ffff-ffff-ffff-ffffffffffff";
}

function parseBoundedJson(input, code) {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    Buffer.byteLength(input, "utf8") > MAXIMUM_STDIN_BYTES ||
    CONTROL_CHARACTER_PATTERN.test(input.replace(/[\n\r\t]/g, ""))
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .stdinInvalid,
    );
  }
  const normalized = input.trim();
  if (normalized.length === 0) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .stdinInvalid,
    );
  }
  try {
    return JSON.parse(normalized);
  } catch {
    fail(code);
  }
}

function validateOptionalBranchFields(record, code) {
  for (const key of [
    "deletion_scheduled_at",
    "git_branch",
    "notify_url",
    "review_requested_at",
  ]) {
    const field = optionalOwnDataValue(record, key, code);
    if (field.present && !validNullableString(field.value)) fail(code);
  }

  const latestCheckRunId = optionalOwnDataValue(
    record,
    "latest_check_run_id",
    code,
  );
  if (
    latestCheckRunId.present &&
    latestCheckRunId.value !== null &&
    (
      typeof latestCheckRunId.value !== "number" ||
      !Number.isFinite(latestCheckRunId.value)
    )
  ) {
    fail(code);
  }

  const prNumber = optionalOwnDataValue(record, "pr_number", code);
  if (
    prNumber.present &&
    prNumber.value !== null &&
    (
      !Number.isSafeInteger(prNumber.value) ||
      prNumber.value < 0
    )
  ) {
    fail(code);
  }

  const previewProjectStatus = optionalOwnDataValue(
    record,
    "preview_project_status",
    code,
  );
  if (
    previewProjectStatus.present &&
    previewProjectStatus.value !== null &&
    (
      typeof previewProjectStatus.value !== "string" ||
      !PREVIEW_PROJECT_STATUSES.has(previewProjectStatus.value)
    )
  ) {
    fail(code);
  }
  return previewProjectStatus.present
    ? previewProjectStatus.value ?? null
    : null;
}

function validateBranchRecord(value, allowedKeys = BRANCH_KEYS) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const record = plainRecord(value, errors.branchShapeInvalid);
  if (!hasOnlyAllowedKeys(record, allowedKeys, BRANCH_REQUIRED_KEYS)) {
    fail(errors.branchShapeInvalid);
  }

  const rawId = ownDataValue(record, "id", errors.branchShapeInvalid);
  const name = ownDataValue(record, "name", errors.branchShapeInvalid);
  const projectRef = ownDataValue(
    record,
    "project_ref",
    errors.branchShapeInvalid,
  );
  const parentProjectRef = ownDataValue(
    record,
    "parent_project_ref",
    errors.branchShapeInvalid,
  );
  const isDefault = ownDataValue(
    record,
    "is_default",
    errors.branchShapeInvalid,
  );
  const persistent = ownDataValue(
    record,
    "persistent",
    errors.branchShapeInvalid,
  );
  const withData = ownDataValue(
    record,
    "with_data",
    errors.branchShapeInvalid,
  );
  const pipelineStatus = ownDataValue(
    record,
    "status",
    errors.branchShapeInvalid,
  );
  const createdAt = ownDataValue(
    record,
    "created_at",
    errors.branchShapeInvalid,
  );
  const updatedAt = ownDataValue(
    record,
    "updated_at",
    errors.branchShapeInvalid,
  );
  if (
    !validUuid(rawId) ||
    !validBoundedString(name, 255) ||
    typeof projectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(projectRef) ||
    typeof parentProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(parentProjectRef) ||
    typeof isDefault !== "boolean" ||
    typeof persistent !== "boolean" ||
    typeof withData !== "boolean" ||
    typeof pipelineStatus !== "string" ||
    !PIPELINE_STATUSES.has(pipelineStatus) ||
    !validBoundedString(createdAt) ||
    !validBoundedString(updatedAt)
  ) {
    fail(errors.branchShapeInvalid);
  }
  const previewProjectStatus = validateOptionalBranchFields(
    record,
    errors.branchShapeInvalid,
  );

  return Object.freeze({
    id: rawId.toLowerCase(),
    name,
    projectRef,
    parentProjectRef,
    isDefault,
    persistent,
    withData,
    pipelineStatus,
    previewProjectStatus,
  });
}

function validateProductionBranch(branch, productionProjectRef) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const policy = COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY;
  if (
    branch.projectRef !== productionProjectRef ||
    branch.parentProjectRef !== productionProjectRef ||
    branch.isDefault !== true ||
    branch.persistent !== false ||
    branch.withData !== false ||
    branch.previewProjectStatus !== policy.readyPreviewProjectStatus ||
    branch.pipelineStatus !== policy.readyPipelineStatus
  ) {
    fail(errors.productionInvalid);
  }
  return branch;
}

function validateProductionRef(value) {
  if (
    value !==
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY
      .productionProjectRef
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .argumentInvalid,
    );
  }
  return value;
}

function validateExpectedName(value) {
  if (!validBoundedString(value, 255)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .argumentInvalid,
    );
  }
  return value;
}

function parseLockedIdentity(value, pattern) {
  if (value === null || value === undefined || value === "-") return null;
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .argumentInvalid,
    );
  }
  return pattern === UUID_PATTERN ? value.toLowerCase() : value;
}

// Create is an identity lock, not a readiness attestation. The Management API
// may omit `preview_project_status` (or return null) while the project is being
// provisioned; readiness is established only by a later exact list selection.
export function parseCommunicationNotePreviewBranchCreateOutput(
  input,
  options,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const optionRecord = plainRecord(options, errors.argumentInvalid);
  if (
    Object.keys(optionRecord).length !== 2 ||
    !Object.hasOwn(optionRecord, "expectedName") ||
    !Object.hasOwn(optionRecord, "productionProjectRef")
  ) {
    fail(errors.argumentInvalid);
  }
  const expectedName = validateExpectedName(optionRecord.expectedName);
  const productionProjectRef = validateProductionRef(
    optionRecord.productionProjectRef,
  );
  const root = plainRecord(
    parseBoundedJson(input, errors.createInvalid),
    errors.createInvalid,
  );
  if (!hasOnlyAllowedKeys(root, CREATE_KEYS, [
    ...BRANCH_REQUIRED_KEYS,
    "message",
  ])) {
    fail(errors.createInvalid);
  }
  const message = ownDataValue(root, "message", errors.createInvalid);
  if (
    message !==
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY.createMessage
  ) {
    fail(errors.createInvalid);
  }

  let branch;
  try {
    branch = validateBranchRecord(root, CREATE_KEYS);
  } catch (error) {
    if (error instanceof CommunicationNotePreviewDisposableBranchControlError) {
      fail(errors.createInvalid);
    }
    throw error;
  }
  if (
    branch.name !== expectedName ||
    branch.projectRef === productionProjectRef ||
    branch.parentProjectRef !== productionProjectRef ||
    branch.isDefault ||
    branch.persistent ||
    branch.withData
  ) {
    fail(errors.createInvalid);
  }
  return branch;
}

// Supabase CLI 2.115 emits a raw array for `branches list -o json` and a
// `{ branches, message: "" }` object for `--output-format json`. Those are the
// only two machine contracts accepted here; banner-prefixed create output and
// generic nested envelopes stay invalid.
export function parseCommunicationNotePreviewBranchListOutput(input) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  let root = parseBoundedJson(input, errors.branchShapeInvalid);
  if (!Array.isArray(root)) {
    const envelope = plainRecord(root, errors.branchShapeInvalid);
    if (
      Object.keys(envelope).length !== 2 ||
      !Object.hasOwn(envelope, "branches") ||
      !Object.hasOwn(envelope, "message") ||
      ownDataValue(envelope, "message", errors.branchShapeInvalid) !== ""
    ) {
      fail(errors.branchShapeInvalid);
    }
    root = ownDataValue(envelope, "branches", errors.branchShapeInvalid);
  }
  if (
    !Array.isArray(root) ||
    root.length === 0 ||
    root.length > MAXIMUM_BRANCHES
  ) {
    fail(errors.branchShapeInvalid);
  }
  const branches = root.map((branch) => validateBranchRecord(branch));
  for (const key of ["id", "name", "projectRef"]) {
    if (
      new Set(branches.map((branch) => branch[key])).size !==
        branches.length
    ) {
      fail(errors.branchShapeInvalid);
    }
  }
  return Object.freeze(branches);
}

export function assertCommunicationNotePreviewProductionOnly(
  input,
  options,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const optionRecord = plainRecord(options, errors.argumentInvalid);
  if (
    Object.keys(optionRecord).length !== 1 ||
    !Object.hasOwn(optionRecord, "productionProjectRef")
  ) {
    fail(errors.argumentInvalid);
  }
  const productionProjectRef = validateProductionRef(
    optionRecord.productionProjectRef,
  );
  const branches = parseCommunicationNotePreviewBranchListOutput(input);
  if (branches.length !== 1) fail(errors.productionInvalid);
  validateProductionBranch(branches[0], productionProjectRef);
  return Object.freeze({ total: 1, defaultCount: 1 });
}

function findDisposablePreviewBranch(
  input,
  expectedName,
  productionProjectRef,
  targetErrorCode,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const branches = parseCommunicationNotePreviewBranchListOutput(input);
  if (branches.length !== 2) fail(targetErrorCode);
  const production = branches.filter((branch) =>
    branch.projectRef === productionProjectRef
  );
  if (production.length !== 1) fail(errors.productionInvalid);
  validateProductionBranch(production[0], productionProjectRef);

  const targets = branches.filter((branch) => branch.name === expectedName);
  if (targets.length !== 1) fail(targetErrorCode);
  const target = targets[0];
  if (
    target.projectRef === productionProjectRef ||
    target.parentProjectRef !== productionProjectRef ||
    target.isDefault ||
    target.persistent ||
    target.withData
  ) {
    fail(targetErrorCode);
  }
  return target;
}

export function selectCommunicationNoteDisposablePreviewBranch(
  input,
  options,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const optionRecord = plainRecord(options, errors.argumentInvalid);
  if (
    Object.keys(optionRecord).length !== 4 ||
    !Object.hasOwn(optionRecord, "expectedName") ||
    !Object.hasOwn(optionRecord, "productionProjectRef") ||
    !Object.hasOwn(optionRecord, "lockedId") ||
    !Object.hasOwn(optionRecord, "lockedRef")
  ) {
    fail(errors.argumentInvalid);
  }
  const expectedName = validateExpectedName(optionRecord.expectedName);
  const productionProjectRef = validateProductionRef(
    optionRecord.productionProjectRef,
  );
  const lockedId = parseLockedIdentity(optionRecord.lockedId, UUID_PATTERN);
  const lockedRef = parseLockedIdentity(
    optionRecord.lockedRef,
    PROJECT_REF_PATTERN,
  );
  if (lockedId === null || lockedRef === null) {
    fail(errors.argumentInvalid);
  }

  const target = findDisposablePreviewBranch(
    input,
    expectedName,
    productionProjectRef,
    errors.targetInvalid,
  );
  if (
    (target.id !== lockedId || target.projectRef !== lockedRef)
  ) {
    fail(errors.identityMismatch);
  }
  return target;
}

// A failed or untrusted create response may still have created a billable
// branch. This deliberately separate path can recover its exact identity for
// deletion, but does not return readiness fields and cannot satisfy `select`.
export function discoverCommunicationNoteDisposablePreviewBranchForCleanup(
  input,
  options,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const optionRecord = plainRecord(options, errors.argumentInvalid);
  if (
    Object.keys(optionRecord).length !== 2 ||
    !Object.hasOwn(optionRecord, "expectedName") ||
    !Object.hasOwn(optionRecord, "productionProjectRef")
  ) {
    fail(errors.argumentInvalid);
  }
  const expectedName = validateExpectedName(optionRecord.expectedName);
  const productionProjectRef = validateProductionRef(
    optionRecord.productionProjectRef,
  );
  const target = findDisposablePreviewBranch(
    input,
    expectedName,
    productionProjectRef,
    errors.cleanupDiscoveryInvalid,
  );
  return Object.freeze({
    purpose: "CLEANUP_ONLY",
    id: target.id,
    projectRef: target.projectRef,
  });
}

export function assertCommunicationNoteDisposablePreviewBranchAbsent(
  input,
  options,
) {
  const errors =
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES;
  const optionRecord = plainRecord(options, errors.argumentInvalid);
  if (
    Object.keys(optionRecord).length !== 4 ||
    !Object.hasOwn(optionRecord, "expectedName") ||
    !Object.hasOwn(optionRecord, "productionProjectRef") ||
    !Object.hasOwn(optionRecord, "lockedId") ||
    !Object.hasOwn(optionRecord, "lockedRef")
  ) {
    fail(errors.argumentInvalid);
  }
  const expectedName = validateExpectedName(optionRecord.expectedName);
  const productionProjectRef = validateProductionRef(
    optionRecord.productionProjectRef,
  );
  const lockedId = parseLockedIdentity(optionRecord.lockedId, UUID_PATTERN);
  const lockedRef = parseLockedIdentity(
    optionRecord.lockedRef,
    PROJECT_REF_PATTERN,
  );
  if ((lockedId === null) !== (lockedRef === null)) {
    fail(errors.argumentInvalid);
  }

  const branches = parseCommunicationNotePreviewBranchListOutput(input);
  if (
    branches.some((branch) =>
      branch.name === expectedName ||
      (lockedId !== null && branch.id === lockedId) ||
      (lockedRef !== null && branch.projectRef === lockedRef)
    )
  ) {
    fail(errors.absenceUnproven);
  }
  if (branches.length !== 1) fail(errors.absenceUnproven);
  validateProductionBranch(branches[0], productionProjectRef);
  return Object.freeze({
    targetFound: false,
    total: 1,
    defaultCount: 1,
  });
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAXIMUM_STDIN_BYTES) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
          .stdinInvalid,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function requireArguments(argv, count) {
  if (!Array.isArray(argv) || argv.length !== count) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
        .argumentInvalid,
    );
  }
  return argv;
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  const input = await readBoundedStdin();
  if (mode === "created") {
    const [expectedName, productionProjectRef] = requireArguments(argv, 2);
    const branch = parseCommunicationNotePreviewBranchCreateOutput(input, {
      expectedName,
      productionProjectRef,
    });
    process.stdout.write(`${branch.id}\t${branch.projectRef}\n`);
    return;
  }
  if (mode === "baseline") {
    const [productionProjectRef] = requireArguments(argv, 1);
    assertCommunicationNotePreviewProductionOnly(input, {
      productionProjectRef,
    });
    process.stdout.write('{"stage":"baseline","ok":true,"total":1}\n');
    return;
  }
  if (mode === "discover-cleanup") {
    const [expectedName, productionProjectRef] = requireArguments(argv, 2);
    const cleanupTarget =
      discoverCommunicationNoteDisposablePreviewBranchForCleanup(input, {
        expectedName,
        productionProjectRef,
      });
    process.stdout.write(
      `${cleanupTarget.purpose}\t${cleanupTarget.id}\t` +
        `${cleanupTarget.projectRef}\n`,
    );
    return;
  }
  if (mode === "select") {
    const [expectedName, productionProjectRef, lockedId, lockedRef] =
      requireArguments(argv, 4);
    const branch = selectCommunicationNoteDisposablePreviewBranch(input, {
      expectedName,
      productionProjectRef,
      lockedId,
      lockedRef,
    });
    process.stdout.write(
      `${branch.id}\t${branch.projectRef}\t` +
        `${branch.previewProjectStatus ?? "-"}\t${branch.pipelineStatus}\n`,
    );
    return;
  }
  if (mode === "absence") {
    const [expectedName, lockedId, lockedRef, productionProjectRef] =
      requireArguments(argv, 4);
    const result = assertCommunicationNoteDisposablePreviewBranchAbsent(
      input,
      { expectedName, productionProjectRef, lockedId, lockedRef },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail(
    COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
      .argumentInvalid,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code =
      error instanceof CommunicationNotePreviewDisposableBranchControlError
        ? error.code
        : COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES
            .internalFailed;
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
