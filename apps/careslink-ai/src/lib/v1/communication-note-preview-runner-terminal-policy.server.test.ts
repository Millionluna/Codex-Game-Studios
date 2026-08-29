import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATES,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence,
} from "./communication-note-preview-runner-terminal-policy.server";

vi.mock("server-only", () => ({}));

describe("Communication Note M1g-f runner terminal policy", () => {
  it("literal-pins the source-only default-off database contract", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    ).toBe(
      "policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
    ).toBe(
      "runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-f.v1",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    ).toBe(
      "4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a",
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY)
      .toMatchObject({
        status: "SOURCE_CONTRACT_ONLY_NO_RUNTIME_CALLER",
        capability: "DURABLE_RUNNER_TERMINAL_DATABASE_CONTRACT",
        sourceBindings: {
          authorityPolicyDigest:
            "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
          runnerPolicyDigest:
            "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
        },
        reservationResult: {
          reservedAtSource: "DATABASE_ROW",
          freshDispatchAuthorized: true,
          exactReplayDispatchAuthorized: false,
          callerSuppliedReservedAt: false,
        },
        continuation: {
          requiredReceiptOutcome: "COMPLETED",
          requiredRunnerTerminalState: "ACCEPTED",
          missingTerminal: "PENDING_NO_DISPATCH_AUTHORITY",
          failedTerminal: "PERMANENTLY_CONSUMED",
        },
        terminal: {
          attestationTrustRoot: "UNRESOLVED_BEFORE_RUNTIME_GRANT",
          independentSignaturePersisted: false,
          verifierIdentityHmacIsSignature: false,
        },
        database: {
          executorRole: "careslink_v1_preview_runner_terminal_executor",
          runtimeCallerPresent: false,
          runtimeExecuteGranted: false,
          dataApiExecute: false,
          forcedRls: true,
          appendOnly: true,
        },
      });
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATES)
      .toEqual(["ACCEPTED", "FAILED"]);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS,
    ).toEqual([
      "CANCELLED",
      "PROVIDER_EVIDENCE_INVALID",
      "GOLDEN_EVALUATION_FAILED",
      "HUMAN_REVIEW_FAILED",
      "REPORT_INVALID",
    ]);
    expect(Object.isFrozen(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY,
    )).toBe(true);
  });

  it("keeps readiness false, approval absent and the live factory unavailable", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POLICY)
      .toBeUndefined();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence(),
    ).toThrowError(
      "Communication Note preview runner terminal persistence is unavailable",
    );
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence(),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("pins the exact policy identifiers into the CLI-generated migration", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql",
      ),
      "utf8",
    );
    for (const pin of [
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
      "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    ]) {
      expect(migration).toContain(pin);
    }
  });
});
