export const DEPLOYMENT_CLEANUP_POLICY = Object.freeze({
  version: "2026-08-14.preview.1",
  requestFailureCode: "VERCEL_API_REQUEST_FAILED",
  requestTimeoutMs: 30_000,
  retryPauseMs: 5_000,
  teardownMarginMs: 60_000,
  horizonPollMs: 5_000,
  jointAbsenceSamples: 3,
});

export class DeploymentCleanupPolicyError extends Error {
  constructor(code) {
    super(code);
    this.name = "DeploymentCleanupPolicyError";
    this.code = code;
  }
}

function fail(code) {
  throw new DeploymentCleanupPolicyError(code);
}

function safeMilliseconds(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("DEPLOYMENT_CLEANUP_POLICY_INVALID");
  }
  return value;
}

/**
 * Canonical delete-observation deadline. Callers must pass this unchanged to
 * their Vercel API adapter; the adapter applies the per-request 30-second cap.
 */
export function deleteObservationDeadline(apiDeadlineMs) {
  return safeMilliseconds(apiDeadlineMs);
}

/**
 * Per-request timeout used by the Vercel API adapter. A request failure is not
 * absence evidence and cannot advance the joint-zero proof.
 */
export function deleteObservationRequestTimeout(nowMs, apiDeadlineMs) {
  safeMilliseconds(nowMs);
  safeMilliseconds(apiDeadlineMs);
  const remainingMs = apiDeadlineMs - nowMs;
  if (remainingMs < 1_000) {
    fail("VERCEL_OPERATION_DEADLINE_EXCEEDED");
  }
  return Math.min(DEPLOYMENT_CLEANUP_POLICY.requestTimeoutMs, remainingMs);
}

/**
 * Returns the retry pause only for a same-realm, already-classified transport
 * failure. It resets every in-memory zero sample before the caller retries.
 * HTTP, JSON, schema, ownership, identity, scope and conflict failures return
 * null and must be rethrown by the caller.
 */
export function prepareDeleteObservationRetry(failureCode, jointZeroSamples) {
  if (!Array.isArray(jointZeroSamples)) {
    fail("DEPLOYMENT_CLEANUP_POLICY_INVALID");
  }
  if (failureCode !== DEPLOYMENT_CLEANUP_POLICY.requestFailureCode) {
    return null;
  }
  jointZeroSamples.length = 0;
  return DEPLOYMENT_CLEANUP_POLICY.retryPauseMs;
}

/**
 * Plans the wait toward the acceptance horizon. For 1..999ms the generated
 * harness may sleep directly; for >=1000ms it must still use its bounded pause
 * helper. Either path is allowed only while the teardown reserve is >=1000ms.
 */
export function planHorizonPause(nowMs, hardDeadlineMs, absenceNotBeforeMs) {
  safeMilliseconds(nowMs);
  safeMilliseconds(hardDeadlineMs);
  safeMilliseconds(absenceNotBeforeMs);
  const milliseconds = Math.min(
    DEPLOYMENT_CLEANUP_POLICY.horizonPollMs,
    Math.max(0, absenceNotBeforeMs - nowMs),
  );
  const teardownReserveMs =
    hardDeadlineMs - nowMs - DEPLOYMENT_CLEANUP_POLICY.teardownMarginMs;
  if (milliseconds > 0 && teardownReserveMs < 1_000) {
    fail("VERCEL_OPERATION_DEADLINE_EXCEEDED");
  }
  return milliseconds;
}

/**
 * Credential-free startup gate for generated live harnesses. Keep this call
 * before any filesystem, environment, CLI or network adapter is invoked.
 */
export function assertDeploymentCleanupPolicyRegression() {
  const nowMs = 1_800_000_000_000;
  const apiDeadlineMs = nowMs + 45_000;
  if (
    deleteObservationDeadline(apiDeadlineMs) !== apiDeadlineMs ||
    deleteObservationRequestTimeout(nowMs, apiDeadlineMs) !== 30_000
  ) {
    fail("DEPLOYMENT_CLEANUP_POLICY_REGRESSION_FAILED");
  }

  const samples = [nowMs - 10_000, nowMs - 5_000];
  if (
    prepareDeleteObservationRetry("VERCEL_API_REQUEST_FAILED", samples) !==
      DEPLOYMENT_CLEANUP_POLICY.retryPauseMs ||
    samples.length !== 0
  ) {
    fail("DEPLOYMENT_CLEANUP_POLICY_REGRESSION_FAILED");
  }

  const nonRetrySamples = [nowMs - 10_000];
  if (
    prepareDeleteObservationRetry(
      "VERCEL_API_JSON_INVALID",
      nonRetrySamples,
    ) !== null ||
    nonRetrySamples.length !== 1
  ) {
    fail("DEPLOYMENT_CLEANUP_POLICY_REGRESSION_FAILED");
  }

  const safeHardDeadlineMs =
    nowMs + DEPLOYMENT_CLEANUP_POLICY.teardownMarginMs + 10_000;
  if (
    planHorizonPause(nowMs, safeHardDeadlineMs, nowMs + 999) !== 999 ||
    planHorizonPause(nowMs, safeHardDeadlineMs, nowMs + 1) !== 1 ||
    planHorizonPause(nowMs, safeHardDeadlineMs, nowMs) !== 0
  ) {
    fail("DEPLOYMENT_CLEANUP_POLICY_REGRESSION_FAILED");
  }

  let hardBoundaryRejected = false;
  try {
    planHorizonPause(
      nowMs,
      nowMs + DEPLOYMENT_CLEANUP_POLICY.teardownMarginMs + 999,
      nowMs + 1,
    );
  } catch (error) {
    hardBoundaryRejected =
      error instanceof DeploymentCleanupPolicyError &&
      error.code === "VERCEL_OPERATION_DEADLINE_EXCEEDED";
  }
  if (!hardBoundaryRejected) {
    fail("DEPLOYMENT_CLEANUP_POLICY_REGRESSION_FAILED");
  }

  return Object.freeze({
    ok: true,
    policyVersion: DEPLOYMENT_CLEANUP_POLICY.version,
    requestTimeoutMs: DEPLOYMENT_CLEANUP_POLICY.requestTimeoutMs,
    retryPauseMs: DEPLOYMENT_CLEANUP_POLICY.retryPauseMs,
    jointAbsenceSamples: DEPLOYMENT_CLEANUP_POLICY.jointAbsenceSamples,
  });
}
