import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_ERROR_CODES as ERRORS,
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY as POLICY,
  CommunicationNotePreviewDisposableBranchControlError,
  assertCommunicationNoteDisposablePreviewBranchAbsent,
  assertCommunicationNotePreviewProductionOnly,
  discoverCommunicationNoteDisposablePreviewBranchForCleanup,
  parseCommunicationNotePreviewBranchCreateOutput,
  parseCommunicationNotePreviewBranchListOutput,
  selectCommunicationNoteDisposablePreviewBranch,
} from "./communication-note-preview-disposable-branch-control.mjs";

const TARGET_NAME = "careslink-points-ui-v1-e2e-r4-20260904";
const TARGET_REF = "abcdefghijklmnopqrst";
const OTHER_REF = "bcdefghijklmnopqrstu";
const UUID_V7 = "018f4b4f-7a1b-7cc2-8d3e-123456789abc";
const UUID_V8 = "12345678-1234-8abc-acde-123456789abc";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";
const PRODUCTION_UUID = "99999999-9999-4999-8999-999999999999";
const SECRET_SENTINEL = "sentinel-control-plane-input-never-log";
const RUNNER_URL = new URL(
  "./communication-note-preview-disposable-branch-control.mjs",
  import.meta.url,
);

function targetBranch(overrides = {}) {
  return {
    created_at: "2026-09-04T13:09:17.000Z",
    id: UUID_V7,
    is_default: false,
    name: TARGET_NAME,
    parent_project_ref: POLICY.productionProjectRef,
    persistent: false,
    project_ref: TARGET_REF,
    status: "CREATING_PROJECT",
    updated_at: "2026-09-04T13:09:17.000Z",
    with_data: false,
    ...overrides,
  };
}

function productionBranch(overrides = {}) {
  return {
    created_at: "2026-08-01T00:00:00.000Z",
    id: PRODUCTION_UUID,
    is_default: true,
    name: "main",
    parent_project_ref: POLICY.productionProjectRef,
    persistent: false,
    preview_project_status: "ACTIVE_HEALTHY",
    project_ref: POLICY.productionProjectRef,
    status: "FUNCTIONS_DEPLOYED",
    updated_at: "2026-09-04T00:00:00.000Z",
    with_data: false,
    ...overrides,
  };
}

function createOutput(overrides = {}) {
  return JSON.stringify({
    ...targetBranch(overrides),
    message: POLICY.createMessage,
  });
}

function rawList(...branches) {
  return JSON.stringify(branches);
}

function machineList(...branches) {
  return JSON.stringify({ branches, message: "" });
}

function targetOptions(overrides = {}) {
  return {
    expectedName: TARGET_NAME,
    productionProjectRef: POLICY.productionProjectRef,
    lockedId: UUID_V7,
    lockedRef: TARGET_REF,
    ...overrides,
  };
}

function expectControlCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(
      CommunicationNotePreviewDisposableBranchControlError,
    );
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function runCli(args, input) {
  return spawnSync(process.execPath, [RUNNER_URL.pathname, ...args], {
    input,
    encoding: "utf8",
    env: {
      LANG: "C",
      PATH: process.env.PATH ?? "",
    },
    timeout: 5_000,
  });
}

describe("Communication Note disposable Preview branch control", () => {
  it("accepts the exact CLI 2.115 create shape before health exists", () => {
    const missingStatus = parseCommunicationNotePreviewBranchCreateOutput(
      createOutput(),
      {
        expectedName: TARGET_NAME,
        productionProjectRef: POLICY.productionProjectRef,
      },
    );
    const nullStatus = parseCommunicationNotePreviewBranchCreateOutput(
      createOutput({ preview_project_status: null }),
      {
        expectedName: TARGET_NAME,
        productionProjectRef: POLICY.productionProjectRef,
      },
    );

    expect(missingStatus).toMatchObject({
      id: UUID_V7,
      projectRef: TARGET_REF,
      previewProjectStatus: null,
      pipelineStatus: "CREATING_PROJECT",
    });
    expect(nullStatus.previewProjectStatus).toBeNull();
  });

  it("keeps create machine output distinct from legacy prefixed output", () => {
    const parsed = parseCommunicationNotePreviewBranchCreateOutput(
      createOutput({
        preview_project_status: "COMING_UP",
        status: "RUNNING_MIGRATIONS",
      }),
      {
        expectedName: TARGET_NAME,
        productionProjectRef: POLICY.productionProjectRef,
      },
    );
    expect(parsed).toMatchObject({
      name: TARGET_NAME,
      previewProjectStatus: "COMING_UP",
      pipelineStatus: "RUNNING_MIGRATIONS",
    });

    expectControlCode(
      () => parseCommunicationNotePreviewBranchCreateOutput(
        `Created preview branch:\n${createOutput()}`,
        {
          expectedName: TARGET_NAME,
          productionProjectRef: POLICY.productionProjectRef,
        },
      ),
      ERRORS.createInvalid,
    );
    expectControlCode(
      () => parseCommunicationNotePreviewBranchCreateOutput(
        JSON.stringify({
          branch: targetBranch(),
          message: POLICY.createMessage,
        }),
        {
          expectedName: TARGET_NAME,
          productionProjectRef: POLICY.productionProjectRef,
        },
      ),
      ERRORS.createInvalid,
    );
  });

  it.each([
    ["UUID v7", UUID_V7, UUID_V7],
    ["UUID v8", UUID_V8, UUID_V8],
    ["uppercase UUID v8", UUID_V8.toUpperCase(), UUID_V8],
  ])("accepts %s branch identities", (_label, id, expectedId) => {
    const created = parseCommunicationNotePreviewBranchCreateOutput(
      createOutput({ id }),
      {
        expectedName: TARGET_NAME,
        productionProjectRef: POLICY.productionProjectRef,
      },
    );
    expect(created.id).toBe(expectedId);

    const selected = selectCommunicationNoteDisposablePreviewBranch(
      rawList(productionBranch(), targetBranch({ id })),
      targetOptions({ lockedId: id }),
    );
    expect(selected.id).toBe(expectedId);
  });

  it("rejects unsafe or ambiguous create identities", () => {
    const options = {
      expectedName: TARGET_NAME,
      productionProjectRef: POLICY.productionProjectRef,
    };
    for (const input of [
      createOutput({ parent_project_ref: OTHER_REF }),
      createOutput({ project_ref: POLICY.productionProjectRef }),
      createOutput({ is_default: true }),
      createOutput({ persistent: true }),
      createOutput({ with_data: true }),
      createOutput({ preview_project_status: "UNRECOGNIZED" }),
      createOutput({ id: "00000000-0000-0000-0000-000000000000" }),
      JSON.stringify({
        ...targetBranch(),
        db_pass: SECRET_SENTINEL,
        message: POLICY.createMessage,
      }),
      JSON.stringify({ ...targetBranch(), message: "Created branch" }),
      `${createOutput()}\n${createOutput()}`,
    ]) {
      expectControlCode(
        () => parseCommunicationNotePreviewBranchCreateOutput(input, options),
        ERRORS.createInvalid,
      );
    }
  });

  it("parses only the two explicit list output shapes", () => {
    for (const input of [
      rawList(productionBranch(), targetBranch()),
      machineList(productionBranch(), targetBranch()),
    ]) {
      const branches = parseCommunicationNotePreviewBranchListOutput(input);
      expect(branches).toHaveLength(2);
      expect(branches[1]).toMatchObject({
        id: UUID_V7,
        projectRef: TARGET_REF,
        previewProjectStatus: null,
      });
    }

    for (const denied of [
      JSON.stringify({ branches: [productionBranch()], message: "listed" }),
      JSON.stringify({
        branches: [productionBranch()],
        data: [],
        message: "",
      }),
      JSON.stringify({ data: [productionBranch()] }),
      JSON.stringify([]),
    ]) {
      expectControlCode(
        () => parseCommunicationNotePreviewBranchListOutput(denied),
        ERRORS.branchShapeInvalid,
      );
    }
  });

  it("cross-binds the exact name, UUID and project ref from list output", () => {
    const selected = selectCommunicationNoteDisposablePreviewBranch(
      rawList(
        productionBranch(),
        targetBranch({
          preview_project_status: "ACTIVE_HEALTHY",
          status: "FUNCTIONS_DEPLOYED",
        }),
      ),
      targetOptions(),
    );
    expect(selected).toMatchObject({
      id: UUID_V7,
      name: TARGET_NAME,
      projectRef: TARGET_REF,
      parentProjectRef: POLICY.productionProjectRef,
      previewProjectStatus: "ACTIVE_HEALTHY",
      pipelineStatus: "FUNCTIONS_DEPLOYED",
    });

    for (const options of [
      targetOptions({ lockedId: OTHER_UUID }),
      targetOptions({ lockedRef: OTHER_REF }),
    ]) {
      expectControlCode(
        () => selectCommunicationNoteDisposablePreviewBranch(
          rawList(productionBranch(), targetBranch()),
          options,
        ),
        ERRORS.identityMismatch,
      );
    }

    expectControlCode(
      () => selectCommunicationNoteDisposablePreviewBranch(
        rawList(productionBranch(), targetBranch()),
        targetOptions({ lockedId: "-", lockedRef: "-" }),
      ),
      ERRORS.argumentInvalid,
    );
  });

  it("keeps unbound name discovery cleanup-only", () => {
    const discovered =
      discoverCommunicationNoteDisposablePreviewBranchForCleanup(
        rawList(productionBranch(), targetBranch()),
        {
          expectedName: TARGET_NAME,
          productionProjectRef: POLICY.productionProjectRef,
        },
      );
    expect(discovered).toEqual({
      purpose: "CLEANUP_ONLY",
      id: UUID_V7,
      projectRef: TARGET_REF,
    });
    expect(discovered).not.toHaveProperty("pipelineStatus");
    expect(discovered).not.toHaveProperty("previewProjectStatus");
  });

  it("rejects duplicate list names, UUIDs and project refs", () => {
    for (const duplicate of [
      targetBranch({ name: "main" }),
      targetBranch({ id: PRODUCTION_UUID }),
      targetBranch({ project_ref: POLICY.productionProjectRef }),
    ]) {
      expectControlCode(
        () => parseCommunicationNotePreviewBranchListOutput(
          rawList(productionBranch(), duplicate),
        ),
        ERRORS.branchShapeInvalid,
      );
    }
  });

  it("rejects target branches that cross the disposable safety boundary", () => {
    for (const [target, expectedCode] of [
      [targetBranch({ parent_project_ref: OTHER_REF }), ERRORS.targetInvalid],
      [targetBranch({ is_default: true }), ERRORS.targetInvalid],
      [targetBranch({ persistent: true }), ERRORS.targetInvalid],
      [targetBranch({ with_data: true }), ERRORS.targetInvalid],
      [
        targetBranch({ project_ref: POLICY.productionProjectRef }),
        ERRORS.branchShapeInvalid,
      ],
    ]) {
      expectControlCode(
        () => selectCommunicationNoteDisposablePreviewBranch(
          rawList(productionBranch(), target),
          targetOptions(),
        ),
        expectedCode,
      );
    }
  });

  it("proves the baseline only for one healthy default Production branch", () => {
    expect(
      assertCommunicationNotePreviewProductionOnly(
        rawList(productionBranch()),
        { productionProjectRef: POLICY.productionProjectRef },
      ),
    ).toEqual({ total: 1, defaultCount: 1 });

    for (const input of [
      rawList(productionBranch(), targetBranch()),
      rawList(productionBranch({ preview_project_status: "COMING_UP" })),
      rawList(productionBranch({ status: "RUNNING_MIGRATIONS" })),
      rawList(productionBranch({ is_default: false })),
      rawList(productionBranch({ persistent: true })),
      rawList(productionBranch({ with_data: true })),
    ]) {
      expectControlCode(
        () => assertCommunicationNotePreviewProductionOnly(input, {
          productionProjectRef: POLICY.productionProjectRef,
        }),
        ERRORS.productionInvalid,
      );
    }
  });

  it("proves absence only when name, UUID and ref are all gone", () => {
    expect(
      assertCommunicationNoteDisposablePreviewBranchAbsent(
        rawList(productionBranch()),
        targetOptions(),
      ),
    ).toEqual({ targetFound: false, total: 1, defaultCount: 1 });

    const remnants = [
      targetBranch(),
      targetBranch({ id: OTHER_UUID, project_ref: OTHER_REF }),
      targetBranch({ name: "different-name", project_ref: OTHER_REF }),
      targetBranch({ name: "different-name", id: OTHER_UUID }),
    ];
    for (const remnant of remnants) {
      expectControlCode(
        () => assertCommunicationNoteDisposablePreviewBranchAbsent(
          rawList(productionBranch(), remnant),
          targetOptions(),
        ),
        ERRORS.absenceUnproven,
      );
    }
  });

  it("rejects malformed and oversized input without returning its content", () => {
    const malformed = runCli(
      ["created", TARGET_NAME, POLICY.productionProjectRef],
      `{${SECRET_SENTINEL}`,
    );
    expect(malformed.status).toBe(1);
    expect(malformed.stdout).toBe("");
    expect(malformed.stderr).toBe(`${ERRORS.createInvalid}\n`);
    expect(malformed.stderr).not.toContain(SECRET_SENTINEL);

    const oversized = runCli(
      ["baseline", POLICY.productionProjectRef],
      JSON.stringify({
        marker: SECRET_SENTINEL,
        padding: "x".repeat(POLICY.maximumStdinBytes),
      }),
    );
    expect(oversized.status).toBe(1);
    expect(oversized.stdout).toBe("");
    expect(oversized.stderr).toBe(`${ERRORS.stdinInvalid}\n`);
    expect(oversized.stderr).not.toContain(SECRET_SENTINEL);
  });

  it("keeps every CLI mode deterministic and credential-free", () => {
    const created = runCli(
      ["created", TARGET_NAME, POLICY.productionProjectRef],
      createOutput(),
    );
    expect(created.error).toBeUndefined();
    expect(created.status, created.stderr).toBe(0);
    expect(created.stderr).toBe("");
    expect(created.stdout).toBe(`${UUID_V7}\t${TARGET_REF}\n`);

    const baseline = runCli(
      ["baseline", POLICY.productionProjectRef],
      rawList(productionBranch()),
    );
    expect(baseline.status, baseline.stderr).toBe(0);
    expect(baseline.stderr).toBe("");
    expect(JSON.parse(baseline.stdout)).toEqual({
      stage: "baseline",
      ok: true,
      total: 1,
    });

    const discovered = runCli(
      ["discover-cleanup", TARGET_NAME, POLICY.productionProjectRef],
      rawList(productionBranch(), targetBranch()),
    );
    expect(discovered.status, discovered.stderr).toBe(0);
    expect(discovered.stderr).toBe("");
    expect(discovered.stdout).toBe(
      `CLEANUP_ONLY\t${UUID_V7}\t${TARGET_REF}\n`,
    );

    const selected = runCli(
      [
        "select",
        TARGET_NAME,
        POLICY.productionProjectRef,
        UUID_V7,
        TARGET_REF,
      ],
      machineList(productionBranch(), targetBranch()),
    );
    expect(selected.status, selected.stderr).toBe(0);
    expect(selected.stderr).toBe("");
    expect(selected.stdout).toBe(
      `${UUID_V7}\t${TARGET_REF}\t-\tCREATING_PROJECT\n`,
    );

    const absent = runCli(
      [
        "absence",
        TARGET_NAME,
        UUID_V7,
        TARGET_REF,
        POLICY.productionProjectRef,
      ],
      rawList(productionBranch()),
    );
    expect(absent.status, absent.stderr).toBe(0);
    expect(absent.stderr).toBe("");
    expect(JSON.parse(absent.stdout)).toEqual({
      targetFound: false,
      total: 1,
      defaultCount: 1,
    });
  });

  it("does not echo branch JSON when CLI identity locking fails", () => {
    const input = rawList(
      productionBranch(),
      targetBranch({ notify_url: `https://example.invalid/${SECRET_SENTINEL}` }),
    );
    const result = runCli(
      [
        "select",
        TARGET_NAME,
        POLICY.productionProjectRef,
        OTHER_UUID,
        TARGET_REF,
      ],
      input,
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${ERRORS.identityMismatch}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET_SENTINEL);
  });
});
