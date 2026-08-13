import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_CLEANUP_POLICY,
  DeploymentCleanupPolicyError,
  assertDeploymentCleanupPolicyRegression,
  deleteObservationDeadline,
  deleteObservationRequestTimeout,
  planHorizonPause,
  prepareDeleteObservationRetry,
} from "./deployment-cleanup-policy.mjs";

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentCleanupPolicyError);
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("Preview deployment cleanup policy", () => {
  it("passes the full observation deadline and caps each API request at 30 seconds", () => {
    const nowMs = 1_800_000_000_000;
    const apiDeadlineMs = nowMs + 45_000;

    expect(deleteObservationDeadline(apiDeadlineMs)).toBe(apiDeadlineMs);
    expect(deleteObservationDeadline(apiDeadlineMs)).toBeGreaterThan(nowMs + 10_000);
    expect(deleteObservationRequestTimeout(nowMs, apiDeadlineMs)).toBe(30_000);
    expect(deleteObservationRequestTimeout(nowMs, nowMs + 25_000)).toBe(25_000);
    expectPolicyCode(
      () => deleteObservationRequestTimeout(nowMs, nowMs + 999),
      "VERCEL_OPERATION_DEADLINE_EXCEEDED",
    );
  });

  it("retries only a request failure and discards all in-memory zero samples", () => {
    const samples = [10_000, 15_000];

    expect(
      prepareDeleteObservationRetry("VERCEL_API_REQUEST_FAILED", samples),
    ).toBe(5_000);
    expect(samples).toEqual([]);
  });

  it.each([
    "VERCEL_API_JSON_INVALID",
    "VERCEL_API_HTTP_FAILED",
    "VERCEL_API_RESPONSE_INVALID",
    "VERCEL_API_NOT_FOUND_INVALID",
    "VERCEL_DEPLOYMENT_IDENTITY_CONFLICT",
    "VERCEL_DEPLOYMENT_SCOPE_CONFLICT",
    "VERCEL_DEPLOYMENT_WINDOW_AMBIGUOUS",
  ])("keeps %s fail-closed without changing zero samples", (code) => {
    const samples = [10_000];

    expect(prepareDeleteObservationRetry(code, samples)).toBeNull();
    expect(samples).toEqual([10_000]);
  });

  it("plans exact one-to-999 millisecond horizon waits", () => {
    const nowMs = 1_800_000_000_000;
    const hardDeadlineMs =
      nowMs + DEPLOYMENT_CLEANUP_POLICY.teardownMarginMs + 10_000;

    expect(planHorizonPause(nowMs, hardDeadlineMs, nowMs + 999)).toBe(999);
    expect(planHorizonPause(nowMs, hardDeadlineMs, nowMs + 1)).toBe(1);
    expect(planHorizonPause(nowMs, hardDeadlineMs, nowMs)).toBe(0);
    expect(planHorizonPause(nowMs, hardDeadlineMs, nowMs + 8_000)).toBe(5_000);
  });

  it("rejects a horizon wait when the teardown reserve is below one second", () => {
    const nowMs = 1_800_000_000_000;
    const hardDeadlineMs =
      nowMs + DEPLOYMENT_CLEANUP_POLICY.teardownMarginMs + 999;

    expectPolicyCode(
      () => planHorizonPause(nowMs, hardDeadlineMs, nowMs + 1),
      "VERCEL_OPERATION_DEADLINE_EXCEEDED",
    );
  });

  it("exposes an offline startup regression gate for generated live harnesses", () => {
    expect(assertDeploymentCleanupPolicyRegression()).toEqual({
      ok: true,
      policyVersion: "2026-08-14.preview.1",
      requestTimeoutMs: 30_000,
      retryPauseMs: 5_000,
      jointAbsenceSamples: 3,
    });
  });

  it("rejects invalid policy inputs", () => {
    expectPolicyCode(
      () => deleteObservationDeadline(-1),
      "DEPLOYMENT_CLEANUP_POLICY_INVALID",
    );
    expectPolicyCode(
      () => prepareDeleteObservationRetry("VERCEL_API_REQUEST_FAILED", null),
      "DEPLOYMENT_CLEANUP_POLICY_INVALID",
    );
    expectPolicyCode(
      () => planHorizonPause(Number.NaN, 10_000, 5_000),
      "DEPLOYMENT_CLEANUP_POLICY_INVALID",
    );
  });
});
