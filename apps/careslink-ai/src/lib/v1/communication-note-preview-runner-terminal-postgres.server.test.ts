import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POSTGRES_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalWithTrustComposition,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import {
  createM1ghFailedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
  M1GH_TEST_NOW,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";

vi.mock("server-only", () => ({}));

const NOW = M1GH_TEST_NOW;
const VERIFIER_IDENTITY_HMAC = "e".repeat(64);

describe("Communication Note runner-terminal Postgres adapter", () => {
  it("uses one fixed SQL statement and injects its verifier identity binding", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const verified = createVerifiedFixture(fixture);
    const data = Object.freeze({ opaque: "database-envelope" });
    const query = vi.fn(async () => ({ rows: [{ data }] }));
    const port = createPort(query, fixture.trustComposition);
    await expect(port.persistVerifiedRunnerTerminal(verified)).resolves.toBe(data);
    expect(query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      [verified.statement, verified.signature, VERIFIER_IDENTITY_HMAC],
    );
    expect(Object.keys(port).sort()).toEqual([
      "callerRole",
      "persistVerifiedRunnerTerminal",
      "purpose",
    ]);
    expect(port.purpose).toBe("RUNNER_TERMINAL_PERSISTENCE");
    expect(port.purpose).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS[4])
      .toMatchObject({
        purpose: port.purpose,
        callerRole: port.callerRole,
        executorRole: "careslink_v1_preview_runner_terminal_executor",
        rpcNames: [
          "persist_verified_communication_note_preview_runner_terminal",
        ],
      });
    expect(port).not.toHaveProperty("verifierIdentityHmac");
  });

  it("requires the unforgeable identity of a policy-verified terminal", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const verified = createVerifiedFixture(fixture);
    const query = vi.fn();
    const port = createPort(query, fixture.trustComposition);
    const forged = { ...verified };
    await expect(
      (port.persistVerifiedRunnerTerminal as (value: unknown) => PromiseLike<unknown>)(
        forged,
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    const directlyVerified =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
        createM1ghFailedRunnerTerminalEnvelope(fixture),
        {
          trustedKeySnapshot: fixture.runnerTerminalSigner.trustedKey,
          now: NOW,
        },
      );
    await expect(port.persistVerifiedRunnerTerminal(directlyVerified)).rejects
      .toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "42501", message: "secret-denial" }, "FORBIDDEN"],
    [{ code: "P0001", message: "RUNNER_TERMINAL_CONFLICT" }, "IDEMPOTENCY_CONFLICT"],
    [{ code: "P0001", message: "RUNNER_TERMINAL_BINDING_INVALID" }, "INVALID_STATE_TRANSITION"],
    [{ code: "P0001", message: "RUNTIME_CREDENTIAL_NOT_ACTIVE" }, "INVALID_STATE_TRANSITION"],
    [{ code: "55P03", message: "lock timeout secret" }, "INVALID_STATE_TRANSITION"],
    [{ code: "P0001", message: "VALIDATION_ERROR" }, "VALIDATION_ERROR"],
    [{ code: "XX000", message: "database-secret" }, "PRODUCT_API_DISABLED"],
  ] as const)("maps database failures to fixed product errors", async (failure, code) => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const verified = createVerifiedFixture(fixture);
    const query = vi.fn(async () => {
      throw Object.assign(new Error(failure.message), failure);
    });
    const rejection = createPort(query, fixture.trustComposition)
      .persistVerifiedRunnerTerminal(verified);
    await expect(rejection).rejects.toMatchObject({ code });
    await expect(rejection).rejects.not.toThrow(/secret/i);
  });

  it("rejects proxied/accessor-backed row envelopes without invoking traps", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const verified = createVerifiedFixture(fixture);
    const proxyTrap = vi.fn(() => {
      throw new Error("proxy secret");
    });
    const proxyRows = new Proxy([{ data: {} }], { get: proxyTrap });
    await expect(
      createPort(
        vi.fn(async () => ({ rows: proxyRows })),
        fixture.trustComposition,
      )
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(proxyTrap).not.toHaveBeenCalled();

    const accessor = Object.defineProperty({}, "data", {
      enumerable: true,
      get: () => {
        throw new Error("accessor secret");
      },
    });
    await expect(
      createPort(
        vi.fn(async () => ({ rows: [accessor] })),
        fixture.trustComposition,
      )
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("sanitizes thrown proxies and keeps the adapter source-only/default-off", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const verified = createVerifiedFixture(fixture);
    const thrownProxy = new Proxy({}, {
      get: () => {
        throw new Error("proxy error secret");
      },
    });
    await expect(
      createPort(
        vi.fn(async () => { throw thrownProxy; }),
        fixture.trustComposition,
      )
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POSTGRES_PORT)
      .toBeUndefined();
    const source = readFileSync(
      new URL(
        "./communication-note-preview-runner-terminal-postgres.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    for (const forbidden of [
      "process.env",
      "fetch(",
      "@supabase/",
      "postgres://",
      "createClient(",
    ]) expect(source).not.toContain(forbidden);
  });

  it("rejects expanded connection/factory inputs", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        trustComposition: fixture.trustComposition,
        queryPort: { query: vi.fn() },
        connectionString: "postgres://forbidden",
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        callerIdentity: createCallerIdentity(),
        queryPort: { query: vi.fn() },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        trustComposition: { ...fixture.trustComposition },
        queryPort: { query: vi.fn() },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });
});

function createPort(
  query: (...args: never[]) => PromiseLike<unknown>,
  trustComposition: unknown,
) {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
    capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
    trustComposition,
    queryPort: { query },
  });
}

function createCallerIdentity() {
  return {
    purpose: "RUNNER_TERMINAL_PERSISTENCE" as const,
    callerRole: "careslink_v1_preview_runner_terminal_caller" as const,
    executorRole: "careslink_v1_preview_runner_terminal_executor" as const,
    rpcNames: [
      "persist_verified_communication_note_preview_runner_terminal",
    ] as const,
    identityHmac: VERIFIER_IDENTITY_HMAC,
    credentialReferenceSha256: "5".repeat(64),
    databaseLogin: false as const,
    executorMembershipEnabled: false as const,
    rawCredentialMaterialPresent: false as const,
    exportAllowed: false as const,
  };
}

function createVerifiedFixture(
  fixture: ReturnType<typeof createM1ghRunnerTerminalTrustFixture>,
) {
  return verifyTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalWithTrustComposition(
    fixture.trustComposition,
    createM1ghFailedRunnerTerminalEnvelope(fixture),
    NOW,
  );
}
