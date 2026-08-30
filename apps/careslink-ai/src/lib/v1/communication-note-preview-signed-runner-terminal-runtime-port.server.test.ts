import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT_READY,
  createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort,
} from "./communication-note-preview-signed-runner-terminal-runtime-port.server";
import {
  createM1ghFailedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
  M1GH_TEST_NOW,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";

vi.mock("server-only", () => ({}));

const NOW = M1GH_TEST_NOW;

describe("Communication Note signed runner-terminal runtime port", () => {
  it("verifies first and persists through the branded purpose-scoped Postgres port", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture);
    const query = successQuery(envelope);
    const port = createPort(fixture, query);

    const result = await port.persist(envelope);
    expect(result).toEqual({
      created: true,
      runnerTerminalRecorded: true,
      continuationEligible: false,
      runnerTerminalDigest:
        createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
          envelope.statement,
        ),
      state: "FAILED",
      recordedAt: NOW,
      status: "RUNNER_TERMINAL_RECORDED",
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      envelope.statement,
      envelope.signature,
      "e".repeat(64),
    ]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not reach Postgres for a tampered signed envelope", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture);
    const query = vi.fn();
    const port = createPort(fixture, query);
    const tampered = {
      ...envelope,
      statement: { ...envelope.statement, failureReason: "REPORT_INVALID" },
    };

    await expect(port.persist(tampered)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects response drift and an unbranded shaped database port", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture);
    const drifted = vi.fn(async () => ({
      rows: [{
        data: {
          created: true,
          runnerTerminalRecorded: true,
          continuationEligible: true,
          runnerTerminalDigest: "0".repeat(64),
          state: "ACCEPTED",
          recordedAt: NOW,
          status: "RUNNER_TERMINAL_RECORDED",
        },
      }],
    }));
    await expect(createPort(fixture, drifted).persist(envelope)).rejects
      .toMatchObject({ code: "PRODUCT_API_DISABLED" });

    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustComposition: fixture.trustComposition,
        databasePort: {
          purpose:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
          callerRole:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
          persistVerifiedRunnerTerminal: vi.fn(),
        },
        clock: { now: () => NOW },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("rejects cross-composition port mixing", () => {
    const fixtureA = createM1ghRunnerTerminalTrustFixture();
    const fixtureB = createM1ghRunnerTerminalTrustFixture();
    const databasePort = createDatabasePort(
      fixtureA.trustComposition,
      successQuery(createM1ghFailedRunnerTerminalEnvelope(fixtureA)),
    );
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustComposition: fixtureB.trustComposition,
        databasePort,
        clock: { now: () => NOW },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("stays default-off and rejects raw signing keys or expanded inputs", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const databasePort = createDatabasePort(
      fixture.trustComposition,
      vi.fn(),
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT)
      .toBeUndefined();
    for (const options of [
      {
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustedSigningKeySnapshot: fixture.runnerTerminalSigner.trustedKey,
        databasePort,
        clock: { now: () => NOW },
      },
      {
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustComposition: fixture.trustComposition,
        databasePort,
        clock: { now: () => NOW },
        url: "postgres://forbidden",
      },
    ]) {
      expect(() =>
        createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort(
          options,
        ),
      ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    }

    const source = readFileSync(
      new URL(
        "./communication-note-preview-signed-runner-terminal-runtime-port.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    for (const forbidden of ["process.env", "fetch(", "@supabase/", "postgres://"])
      expect(source).not.toContain(forbidden);
  });

  it("sanitizes injected clock and database failures", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture);
    const databasePort = createDatabasePort(fixture.trustComposition, vi.fn());
    const clockFailure =
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustComposition: fixture.trustComposition,
        databasePort,
        clock: { now: () => { throw new Error("clock secret"); } },
      });
    const databaseFailure = createPort(
      fixture,
      vi.fn(async () => {
        throw { code: "42501", message: "database secret" };
      }),
    );
    await expect(clockFailure.persist(envelope)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    await expect(databaseFailure.persist(envelope)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The runner terminal database operation is not authorized",
    });
  });
});

function createPort(
  fixture: ReturnType<typeof createM1ghRunnerTerminalTrustFixture>,
  query: ReturnType<typeof vi.fn>,
) {
  const databasePort = createDatabasePort(fixture.trustComposition, query);
  return createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
    capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
    trustComposition: fixture.trustComposition,
    databasePort,
    clock: { now: () => NOW },
  });
}

function createDatabasePort(
  trustComposition: unknown,
  query: ReturnType<typeof vi.fn>,
) {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
    capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
    trustComposition,
    queryPort: { query },
  });
}

function successQuery(
  envelope: ReturnType<typeof createM1ghFailedRunnerTerminalEnvelope>,
) {
  return vi.fn(async (sql: unknown, values: unknown) => {
    void sql;
    void values;
    return {
      rows: [{
        data: {
          created: true,
          runnerTerminalRecorded: true,
          continuationEligible: false,
          runnerTerminalDigest:
            createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
              envelope.statement,
            ),
          state: "FAILED",
          recordedAt: NOW,
          status: "RUNNER_TERMINAL_RECORDED",
        },
      }],
    };
  });
}
