import { createHash } from "node:crypto";
import {
  assertDeploymentCleanupPolicyRegression, deleteObservationDeadline,
  deleteObservationRequestTimeout, prepareDeleteObservationRetry, planHorizonPause,
} from "./deployment-cleanup-policy.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY as BRANCH,
  assertCommunicationNotePreviewProductionOnly,
  discoverCommunicationNoteDisposablePreviewBranchForCleanup,
  selectCommunicationNoteDisposablePreviewBranch,
  assertCommunicationNoteDisposablePreviewBranchAbsent,
} from "./communication-note-preview-disposable-branch-control.mjs";
import { runPointsPreviewIdentityCheck } from "./points-preview-identity-invocation.mjs";
import { POINTS_PREVIEW_IDENTITY_POLICY, POINTS_PREVIEW_PROVIDER_APP_METADATA, PointsPreviewIdentityError,
  isPointsPreviewUserId } from "./points-preview-identity-policy.mjs";
import { createPointsPreviewDeployArguments, parsePointsPreviewDeploymentOutput } from "./points-preview-platform-contract.mjs";

export const POINTS_PREVIEW_LIFECYCLE_SOURCE_PINS = Object.freeze({
  "deployment-cleanup-policy.mjs": "b9283be16d2251170bc3a4875b3bd08fbd736980e837899acaba38e0bed7f111",
  "points-preview-identity-policy.mjs": "0dcaa4732b13fc40d32539dec42074fb06135886ba10774a22cda01c65931ca3",
  "points-preview-identity-invocation.mjs": "97f6797a15fa017faf50e235203b0865a6084c0e59ac62048409bc0b8e6c2fb5",
  "points-preview-platform-contract.mjs": "3fbcf4ab6b3d49d6b135be880327d5aada5eacd5fc7304463cda64307d9a276d",
  "communication-note-preview-disposable-branch-control.mjs": "c71ea21431205a25e30d14d50d60eb6c48e8de0d09aec15e36155f3168888f48",
  "communication-note-preview-runner-terminal-identity-policy.mjs": "76d74b5ddda0ce1a5526d8d71e98b79822afd9a066487d18cb1e9dcfc0e88ca8",
});
export const POINTS_PREVIEW_LIFECYCLE = Object.freeze({
  version: "2026-09-07.points-preview-lifecycle.1",
  maximumWindowMs: 7_200_000, cleanupReserveMs: 300_000,
  migrationManifest: "3add3cad0232b89b206eb948eabe86045179ca7f978d0027e44121381919a7e8",
});
export const POINTS_PREVIEW_LIFECYCLE_ADAPTERS = Object.freeze([
  "readSourceFile", "preflight", "writeLedger", "readCliOutput", "createBranch",
  "migrate", "openDatabase", "assertDataZero", "createUser", "readIdentityProof",
  "seedPoints", "runBackendChecks", "createDeployment", "getDeployment",
  "listDeployments", "runBrowserChecks", "assertPointsUnchanged", "quiesce",
  "closeDatabaseGate", "revokeSessions", "deleteDeployment", "deletePointRows",
  "deleteUser", "closeDatabase", "deleteBranch", "deleteLocalArtifacts",
]);
export const POINTS_PREVIEW_BACKEND_CHECKS = Object.freeze([
  "passwordLogin", "pointsRead", "refresh", "revokedRejected", "relogin", "ownerIsolation", "readOnly",
]);
export const POINTS_PREVIEW_BROWSER_CHECKS = Object.freeze([
  "signedOutGate", "ownerA", "ownerB", "signOut", "revokeRecovery", "locales", "documentsEntry", "noLegacyCredits",
]);

// Only a same-realm, locally classified transport exception may be retried during
// delete observation. HTTP errors and arbitrary objects with a code never qualify.
export class PointsPreviewTransportError extends Error {
  constructor() { super("VERCEL_API_REQUEST_FAILED"); this.code = "VERCEL_API_REQUEST_FAILED"; }
}
const check = (condition) => { if (!condition) throw new Error("POINTS_PREVIEW_LIFECYCLE_FAILED"); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const immutableCopy = (value) => {
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = (object) => { if (object && typeof object === "object") {
    Object.values(object).forEach(freeze); Object.freeze(object);
  } };
  freeze(copy); return copy;
};
const receipt = (value) => check(value?.ok === true);

/**
 * Full lifecycle composition, NO built-in cloud/browser/credential adapters and
 * NO executable CLI entry point. Tests supply in-memory fakes. A future live
 * adapter host requires separate authorization and review; this is not one.
 * clock.arm(deadline, callback) returns a cancellation function; clock.sleep is
 * bounded. Every adapter must honor signal/deadline and quiesce must join all
 * outstanding local work AND attest its remote acceptance horizon.
 */
export async function runPointsPreviewLifecycle({ configuration, adapters, clock, signal } = {}) {
  assertDeploymentCleanupPolicyRegression(); // Before the first adapter or clock.
  let stage = "arguments", failure = null, identityDiagnostics;
  const cleanupErrors = [], cleanup = {};
  const pending = new Set();
  let cfg, ledger, start, hardDeadline, businessDeadline, databaseAttempted = false;
  let touched = false, quiescent = false, absenceNotBefore = 0, businessPassed = false;
  let lastNow = -1;
  const now = () => { const value = clock.now();
    check(Number.isSafeInteger(value) && value >= 0 && value >= lastNow);
    lastNow = value; return value;
  };
  const scope = () => ({ expectedName: cfg.branchName, productionProjectRef: BRANCH.productionProjectRef,
    lockedId: ledger.branch?.id ?? null, lockedRef: ledger.branch?.projectRef ?? null });
  const listArgs = ["branches", "list", "--project-ref", BRANCH.productionProjectRef, "-o", "json"];
  async function call(name, input, deadlineMs, requestTimeoutMs) {
    check(now() < deadlineMs);
    const safeInput = immutableCopy(input);
    const controller = new AbortController();
    let cancelTimer, stop;
    const expired = new Promise((_, reject) => {
      stop = () => { controller.abort(); reject(new Error("POINTS_PREVIEW_OPERATION_STOPPED")); };
      cancelTimer = clock.arm(requestTimeoutMs ? Math.min(deadlineMs, now() + requestTimeoutMs) : deadlineMs, stop);
    });
    const onAbort = () => stop();
    const business = deadlineMs === businessDeadline;
    if (business && signal?.aborted) { cancelTimer(); throw new Error("POINTS_PREVIEW_ABORTED"); }
    if (business) signal?.addEventListener("abort", onAbort, { once: true });
    const operation = Promise.resolve().then(() => {
      check(!controller.signal.aborted);
      return adapters[name](safeInput, Object.freeze({ deadlineMs, signal: controller.signal,
        ...(requestTimeoutMs ? { timeoutMs: requestTimeoutMs } : {}) }));
    });
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    try { const result = await Promise.race([operation, expired]); check(now() < deadlineMs); return result; }
    finally { cancelTimer(); if (business) signal?.removeEventListener("abort", onAbort); }
  }
  const save = (deadline) => call("writeLedger", immutableCopy(ledger), deadline).then(receipt);
  const branchList = (deadline) => call("readCliOutput", [...listArgs], deadline, 30_000);
  async function readyBranch(deadline) {
    const target = selectCommunicationNoteDisposablePreviewBranch(await branchList(deadline), scope());
    check(target.pipelineStatus === "FUNCTIONS_DEPLOYED" && target.previewProjectStatus === "ACTIVE_HEALTHY");
    return target;
  }
  async function pause(milliseconds, deadline) {
    const before = now(); check(milliseconds > 0 && before + milliseconds < deadline);
    await callSleep(milliseconds, deadline); check(now() >= before + milliseconds);
  }
  async function callSleep(milliseconds, deadline) {
    // The clock host owns real timers. Offline tests advance a virtual clock.
    let cancelTimer;
    const expired = new Promise((_, reject) => {
      cancelTimer = clock.arm(deadline, () => reject(new Error("CLOCK_WAIT_TIMEOUT")));
    });
    try { await Promise.race([clock.sleep(milliseconds), expired]); check(now() < deadline); }
    finally { cancelTimer(); }
  }
  async function waitHorizon() {
    while (now() < absenceNotBefore) {
      const ms = planHorizonPause(now(), hardDeadline, absenceNotBefore);
      if (ms < 1000) await callSleep(ms, hardDeadline); else await pause(ms, hardDeadline);
    }
  }
  function owned(body) {
    check(body?.id === ledger.deploymentId && body.projectId === cfg.deployment.projectId &&
      body.ownerId === cfg.teamId && body.team?.id === cfg.teamId &&
      body.meta?.careslinkPointsRun === cfg.deployment.runMarker &&
      (body.target === null || body.target === "preview") &&
      Number.isSafeInteger(body.createdAt) && body.createdAt >= start && body.createdAt < hardDeadline &&
      body.projectSettings?.nodeVersion === "24.x");
  }
  const getDeployment = (deadline) => call("getDeployment", { id: ledger.deploymentId,
    projectId: cfg.deployment.projectId, teamId: cfg.teamId }, deleteObservationDeadline(deadline),
    deleteObservationRequestTimeout(now(), deadline));
  async function inventory(deadline) {
    const result = [], seen = new Set(); let until = ledger.until ?? now() + 1;
    for (let page = 0; page < 20; page++) {
      const response = await call("listDeployments", { projectId: cfg.deployment.projectId,
        teamId: cfg.teamId, since: start, until, limit: 100 }, deleteObservationDeadline(deadline),
        deleteObservationRequestTimeout(now(), deadline));
      const body = response?.body;
      check(response?.status === 200 && Array.isArray(body?.deployments) &&
        body.pagination && Object.hasOwn(body.pagination, "next"));
      for (const item of body.deployments) {
        check(typeof item?.uid === "string" && /^dpl_[a-zA-Z0-9]+$/.test(item.uid) &&
          !seen.has(item.uid) && item.projectId === cfg.deployment.projectId &&
          Number.isSafeInteger(item.created) && item.created >= start && item.created <= until);
        seen.add(item.uid); result.push(item);
      }
      if (body.pagination.next === null) return result;
      check(Number.isSafeInteger(body.pagination.next) && body.pagination.next >= start && body.pagination.next < until);
      until = body.pagination.next;
    }
    throw new Error("INVENTORY_INCOMPLETE");
  }
  async function observeDeploymentAbsent(deadline) {
    const samples = [];
    while (samples.length < 3) {
      try {
        if (ledger.deploymentId) {
          const response = await getDeployment(deleteObservationDeadline(deadline));
          check(response?.status === 404 && response.body?.error?.code === "not_found");
        }
        const items = await inventory(deleteObservationDeadline(deadline));
        check(!items.some((item) => item.uid === ledger.deploymentId ||
          item.meta?.careslinkPointsRun === cfg.deployment.runMarker));
        // With an unknown create outcome, unrelated inventory cannot establish
        // which deployment was ours. Keep recovery evidence instead of guessing.
        if (!ledger.deploymentId && ledger.deploymentAttempted) check(items.length === 0);
        samples.push(now());
      } catch (error) {
        const wait = prepareDeleteObservationRetry(
          error instanceof PointsPreviewTransportError ? error.code : null, samples,
        );
        if (wait === null) throw error;
        await pause(wait, deadline); continue;
      }
      if (samples.length < 3) await pause(5000, deadline);
    }
    check(samples[2] - samples[0] >= 10000);
  }
  async function attempt(name, operation) {
    try { await operation(); cleanup[name] = true; }
    catch { cleanup[name] = false; cleanupErrors.push(name); }
  }
  try {
    check(adapters && clock && ["now", "sleep", "arm"].every((key) => typeof clock[key] === "function"));
    check(POINTS_PREVIEW_LIFECYCLE_ADAPTERS.every((key) => typeof adapters[key] === "function"));
    cfg = immutableCopy(configuration);
    check(/^[a-f0-9]{40}$/.test(cfg.sourceCommit) && /^[a-f0-9]{40}$/.test(cfg.sourceTree) &&
      /^[a-f0-9]{64}$/.test(cfg.lifecycleSha256) && /^team_[a-zA-Z0-9]+$/.test(cfg.teamId) &&
      typeof cfg.branchName === "string" && cfg.branchName === cfg.deployment.runMarker &&
      Array.isArray(cfg.userIds) && cfg.userIds.length === 2 && new Set(cfg.userIds).size === 2 &&
      cfg.userIds.every(isPointsPreviewUserId) && Number.isSafeInteger(cfg.maximumWindowMs) &&
      cfg.maximumWindowMs >= 600_000 && cfg.maximumWindowMs <= POINTS_PREVIEW_LIFECYCLE.maximumWindowMs);
    const argv = createPointsPreviewDeployArguments({ ...cfg.deployment, dryRun: false });
    start = now(); hardDeadline = start + cfg.maximumWindowMs;
    businessDeadline = hardDeadline - POINTS_PREVIEW_LIFECYCLE.cleanupReserveMs;
    stage = "source_pins";
    for (const [name, sha256] of Object.entries({ ...POINTS_PREVIEW_LIFECYCLE_SOURCE_PINS,
      "points-preview-lifecycle.mjs": cfg.lifecycleSha256 })) {
      const bytes = await call("readSourceFile", name, businessDeadline);
      check((Buffer.isBuffer(bytes) || typeof bytes === "string") && Buffer.byteLength(bytes) <= 262144 && hash(bytes) === sha256);
    }
    stage = "preflight";
    const preflight = await call("preflight", { sourceCommit: cfg.sourceCommit, sourceTree: cfg.sourceTree,
      dryArguments: createPointsPreviewDeployArguments({ ...cfg.deployment, dryRun: true }) }, businessDeadline);
    check(preflight?.ok === true && preflight.sourceCommit === cfg.sourceCommit && preflight.sourceTree === cfg.sourceTree &&
      preflight.uploadPinned === true && preflight.protectedPreview === true && preflight.modelDisabled === true &&
      preflight.vercelCliVersion === "59.5.0");
    const cliVersion = await call("readCliOutput", ["--version"], businessDeadline, 30000);
    check(typeof cliVersion === "string" && cliVersion.trim() === POINTS_PREVIEW_IDENTITY_POLICY.supabaseCliVersion);
    assertCommunicationNotePreviewProductionOnly(await branchList(businessDeadline), { productionProjectRef: BRANCH.productionProjectRef });
    ledger = { policy: POINTS_PREVIEW_LIFECYCLE.version, sourceCommit: cfg.sourceCommit, sourceTree: cfg.sourceTree,
      branchName: cfg.branchName, projectId: cfg.deployment.projectId, teamId: cfg.teamId,
      start, hardDeadline, branchAttempted: true, deploymentAttempted: false, users: [] };
    stage = "initial_ledger"; await save(businessDeadline);
    touched = true; stage = "create_branch";
    // The create response is not a readiness proof. Discover identity from the
    // canonical inventory even after a successful response; create only once.
    await call("createBranch", { name: cfg.branchName, parentProjectRef: BRANCH.productionProjectRef,
      withData: false, persistent: false }, businessDeadline, 30000);
    stage = "branch_identity";
    ledger.branch = discoverCommunicationNoteDisposablePreviewBranchForCleanup(await branchList(businessDeadline),
      { expectedName: cfg.branchName, productionProjectRef: BRANCH.productionProjectRef });
    await save(businessDeadline);
    stage = "branch_ready";
    const readyDeadline = Math.min(businessDeadline, now() + 600000);
    for (;;) {
      const target = selectCommunicationNoteDisposablePreviewBranch(await branchList(businessDeadline), scope());
      if (target.pipelineStatus === "FUNCTIONS_DEPLOYED" && target.previewProjectStatus === "ACTIVE_HEALTHY") break;
      check(!["FUNCTIONS_FAILED", "MIGRATIONS_FAILED"].includes(target.pipelineStatus));
      await pause(5000, readyDeadline);
    }
    stage = "migrate";
    const migrated = await call("migrate", { branch: ledger.branch }, businessDeadline, 900000);
    check(migrated?.ok === true && migrated.migrations === 46 && migrated.manifestSha256 === POINTS_PREVIEW_LIFECYCLE.migrationManifest);
    stage = "database"; await readyBranch(businessDeadline); databaseAttempted = true;
    const database = await call("openDatabase", { branch: ledger.branch }, businessDeadline);
    check(database?.projectRef === ledger.branch.projectRef && database.tlsVerified === true);
    receipt(await call("assertDataZero", { branch: ledger.branch, tables: "auth_and_points" }, businessDeadline));
    for (const [index, id] of cfg.userIds.entries()) {
      stage = index === 0 ? "user_a" : "user_b";
      const user = { id, label: index === 0 ? "a" : "b" };
      ledger.users.push(user); await save(businessDeadline);
      const authResponse = await call("createUser", { branch: ledger.branch, user,
        appMetadata: POINTS_PREVIEW_PROVIDER_APP_METADATA }, businessDeadline);
      await runPointsPreviewIdentityCheck({ expectedUserId: id, authResponse, selection: scope(),
        readCliOutput: (args) => call("readCliOutput", args, businessDeadline, 30000),
        readIdentityProof: (input) => call("readIdentityProof", input, businessDeadline, 30000) });
    }
    stage = "points_fixture";
    receipt(await call("seedPoints", { branch: ledger.branch, owners: ledger.users.map((user, index) =>
      ({ ...user, amount: index === 0 ? 62 : 7 })) }, businessDeadline));
    stage = "backend";
    const backend = await call("runBackendChecks", { branch: ledger.branch, users: ledger.users,
      expectedBalances: [62, 7] }, businessDeadline);
    check(backend?.accounts === 2 && POINTS_PREVIEW_BACKEND_CHECKS.every((key) => backend[key] === true));
    stage = "deployment_ledger"; ledger.deploymentAttempted = true; await save(businessDeadline);
    stage = "create_deployment";
    const deployment = parsePointsPreviewDeploymentOutput(await call("createDeployment", { arguments: argv,
      branch: ledger.branch }, businessDeadline, 240000));
    ledger.deploymentId = deployment.id; await save(businessDeadline);
    stage = "deployment_ready";
    for (;;) {
      const response = await getDeployment(businessDeadline); check(response?.status === 200); owned(response.body);
      // Ownership of an ID does not attest an arbitrary URL in CLI stdout.
      // Bind the browser destination to that same management API deployment.
      check(typeof response.body.url === "string" && `https://${response.body.url}` === deployment.url);
      if (response.body.readyState === "READY") break;
      check(["QUEUED", "INITIALIZING", "BUILDING"].includes(response.body.readyState));
      await pause(5000, businessDeadline);
    }
    stage = "browser";
    const browser = await call("runBrowserChecks", { deploymentId: ledger.deploymentId, url: deployment.url,
      users: ledger.users, expectedBalances: [62, 7] }, businessDeadline);
    check(POINTS_PREVIEW_BROWSER_CHECKS.every((key) => browser?.[key] === true));
    stage = "read_only"; receipt(await call("assertPointsUnchanged", { branch: ledger.branch }, businessDeadline));
    businessPassed = true;
  } catch (error) {
    failure = stage;
    if (error instanceof PointsPreviewIdentityError && error.diagnostics) identityDiagnostics = error.diagnostics;
  } finally {
    if (touched) {
      await attempt("quiesce", async () => {
        const stopped = await call("quiesce", { hardDeadline }, hardDeadline);
        await Promise.resolve();
        check(stopped?.quiescent === true && pending.size === 0 &&
          Number.isSafeInteger(stopped.absenceNotBeforeMs) && stopped.absenceNotBeforeMs >= start &&
          stopped.absenceNotBeforeMs <= hardDeadline - 60000);
        quiescent = true; absenceNotBefore = stopped.absenceNotBeforeMs;
      });
      // Recover unknown branch creation once, without readiness or credentials.
      if (!ledger.branch) await attempt("branch_discovery", async () => {
        check(quiescent); await waitHorizon();
        const raw = await branchList(hardDeadline);
        try { ledger.branch = discoverCommunicationNoteDisposablePreviewBranchForCleanup(raw,
          { expectedName: cfg.branchName, productionProjectRef: BRANCH.productionProjectRef }); }
        catch { assertCommunicationNotePreviewProductionOnly(raw, { productionProjectRef: BRANCH.productionProjectRef }); }
      });
      if (databaseAttempted) {
        await attempt("close_gate", async () => receipt(await call("closeDatabaseGate", { branch: ledger.branch }, hardDeadline)));
        await attempt("revoke_sessions", async () => receipt(await call("revokeSessions", { branch: ledger.branch, users: ledger.users }, hardDeadline)));
      }
      await attempt("deployment", async () => {
        check(quiescent);
        // Honor remote acceptance horizon before selecting the complete window.
        await waitHorizon();
        ledger.until = now() + 1;
        if (ledger.deploymentAttempted && !ledger.deploymentId) {
          const items = await inventory(hardDeadline);
          const matches = items.filter((item) => item.meta?.careslinkPointsRun === cfg.deployment.runMarker);
          check(matches.length <= 1); if (matches.length) ledger.deploymentId = matches[0].uid;
          else check(items.length === 0);
        }
        await save(hardDeadline);
        if (ledger.deploymentId) {
          const response = await getDeployment(hardDeadline);
          if (response?.status === 200) {
            owned(response.body);
            const deleted = await call("deleteDeployment", { id: ledger.deploymentId,
              teamId: cfg.teamId, projectId: cfg.deployment.projectId }, hardDeadline, 30000);
            check(deleted?.status === 200 && deleted.body?.uid === ledger.deploymentId);
          } else check(response?.status === 404 && response.body?.error?.code === "not_found");
        }
        await observeDeploymentAbsent(deleteObservationDeadline(hardDeadline));
      });
      if (databaseAttempted) {
        await attempt("point_rows", async () => receipt(await call("deletePointRows", { branch: ledger.branch, users: ledger.users }, hardDeadline)));
        for (const user of ledger.users) await attempt(user.label === "a" ? "user_a" : "user_b",
          async () => receipt(await call("deleteUser", { branch: ledger.branch, user }, hardDeadline)));
        await attempt("data_zero", async () => receipt(await call("assertDataZero", { branch: ledger.branch, tables: "auth_and_points" }, hardDeadline)));
        await attempt("database_closed", async () => receipt(await call("closeDatabase", {}, hardDeadline)));
      }
      await attempt("branch", async () => {
        if (ledger.branch) {
          selectCommunicationNoteDisposablePreviewBranch(await branchList(hardDeadline), scope());
          receipt(await call("deleteBranch", { branch: ledger.branch }, hardDeadline, 30000));
        }
        for (let index = 0; index < 3; index++) {
          assertCommunicationNoteDisposablePreviewBranchAbsent(await branchList(hardDeadline), scope());
          if (index < 2) await pause(5000, hardDeadline);
        }
      });
      ledger.cleanup = { ...cleanup }; ledger.businessPassed = businessPassed; ledger.failure = failure;
      await attempt("final_ledger", () => save(hardDeadline));
      if (cleanupErrors.length === 0) await attempt("local_artifacts", async () =>
        receipt(await call("deleteLocalArtifacts", { cleanupComplete: true }, hardDeadline)));
    }
  }
  return Object.freeze({ stage: "points_preview_lifecycle", policy: POINTS_PREVIEW_LIFECYCLE.version,
    ok: businessPassed && cleanupErrors.length === 0, businessPassed, failure,
    cleanupComplete: touched && cleanupErrors.length === 0,
    cleanup: Object.freeze({ ...cleanup }), cleanupErrors: Object.freeze([...cleanupErrors]),
    ...(identityDiagnostics ? { identityDiagnostics } : {}) });
}
