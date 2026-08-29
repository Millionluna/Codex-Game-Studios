import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_COMPOSITION,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_REGISTRY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_TRUST_COMPOSITION_READY,
  composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry,
  requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition,
  resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import {
  createM1ghRunnerTerminalTrustFixture,
  M1GH_TEST_NOW,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";

vi.mock("server-only", () => ({}));

describe("Communication Note M1g-h runner-terminal trust composition", () => {
  it("brands a digest-pinned registry and derives terminal trust plus caller only from validated custody", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();

    expect(fixture.trustRegistry).toMatchObject({
      source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT",
      status: "TEST_ONLY_VALIDATED_NOT_APPROVED",
      signerCustodyReferenceSha256:
        fixture.custodySnapshot.runnerTerminalSigner
          .custodyReferenceSha256,
      signerPublicKeySha256:
        fixture.runnerTerminalSigner.trustedKey.publicKeySha256,
      privateKeyMaterialPresent: false,
    });
    expect(fixture.trustComposition).toMatchObject({
      status: "TEST_ONLY_COMPOSED_NOT_APPROVED",
      purpose: "RUNNER_TERMINAL_PERSISTENCE",
      callerRole: "careslink_v1_preview_runner_terminal_caller",
      executorRole: "careslink_v1_preview_runner_terminal_executor",
      rpcNames: [
        "persist_verified_communication_note_preview_runner_terminal",
      ],
      databaseLogin: false,
      executorMembershipEnabled: false,
      rawCredentialMaterialPresent: false,
      privateKeyMaterialPresent: false,
    });
    expect(Object.isFrozen(fixture.trustRegistry)).toBe(true);
    expect(Object.isFrozen(fixture.trustComposition)).toBe(true);
    expect(fixture.trustRegistry).not.toHaveProperty("trustedSigningKey");
    expect(fixture.trustComposition).not.toHaveProperty("trustedSigningKey");
    expect(fixture.trustComposition).not.toHaveProperty("callerIdentity");

    const resolvedCaller =
      resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity(
        fixture.trustComposition,
      );
    expect(resolvedCaller).toEqual(fixture.custodySnapshot.callers[4]);
    expect(resolvedCaller.identityHmac).toBe("e".repeat(64));
  });

  it("keeps both approved roots absent and the source contract default-off", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_TRUST_COMPOSITION_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_REGISTRY)
      .toBeUndefined();
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_COMPOSITION)
      .toBeUndefined();
  });

  it("rejects shaped/copy-forged registry and composition brands", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();

    for (const value of [
      { ...fixture.trustRegistry },
      { ...fixture.trustComposition },
      fixture.runnerTerminalSigner.trustedKey,
      fixture.custodySnapshot.callers[4],
    ]) {
      expect(() =>
        requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition(
          value,
        ),
      ).toThrowError(fixedFailure());
    }
  });

  it("rejects a registry digest lie, stale evidence and expanded inputs", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const staleCore = {
      ...fixture.registryCore,
      observedAt: "2026-08-28T01:54:59.999Z",
    };
    for (const value of [
      {
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY",
        ...fixture.registryCore,
        registrySnapshotSha256: "0".repeat(64),
      },
      {
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY",
        ...staleCore,
        registrySnapshotSha256:
          createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
            staleCore,
          ),
      },
      {
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY",
        ...fixture.registryCore,
        registrySnapshotSha256:
          createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
            fixture.registryCore,
          ),
        endpoint: "https://forbidden.invalid",
      },
    ]) {
      expect(() =>
        createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry(
          value,
          { now: M1GH_TEST_NOW },
        ),
      ).toThrowError(fixedFailure());
    }
  });

  it("rejects registry/custody mismatch and a direct caller override", () => {
    const fixtureA = createM1ghRunnerTerminalTrustFixture();
    const fixtureB = createM1ghRunnerTerminalTrustFixture();
    expect(() =>
      composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust({
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION",
        trustRegistry: fixtureA.trustRegistry,
        custodySnapshot: fixtureB.custodySnapshot,
        verifiedAuthorization: fixtureB.verifiedAuthorization,
        now: M1GH_TEST_NOW,
      }),
    ).toThrowError(fixedFailure());

    expect(() =>
      composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust({
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION",
        trustRegistry: fixtureA.trustRegistry,
        custodySnapshot: fixtureA.custodySnapshot,
        verifiedAuthorization: fixtureA.verifiedAuthorization,
        now: M1GH_TEST_NOW,
        callerIdentity: {
          ...fixtureA.custodySnapshot.callers[4],
          identityHmac: "f".repeat(64),
        },
      }),
    ).toThrowError(fixedFailure());
  });

  it("rejects a registry observation that is in the composition clock's future", () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();

    expect(() =>
      composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust({
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION",
        trustRegistry: fixture.trustRegistry,
        custodySnapshot: fixture.custodySnapshot,
        verifiedAuthorization: fixture.verifiedAuthorization,
        now: "2026-08-28T01:59:54.999Z",
      }),
    ).toThrowError(fixedFailure());
  });

  it("rejects proxies without invoking their traps and contains no runtime discovery path", () => {
    const trap = vi.fn(() => {
      throw new Error("proxy secret");
    });
    const proxy = new Proxy({}, { get: trap });
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry(
        proxy,
        { now: M1GH_TEST_NOW },
      ),
    ).toThrowError(fixedFailure());
    expect(trap).not.toHaveBeenCalled();

    const source = readFileSync(
      new URL(
        "./communication-note-preview-runner-terminal-trust-composition.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|fetch\s*\(|from\s+["'](?:openai|@supabase\/|node:(?:http|https|net|tls))[^"']*["']|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_|postgres:\/\//,
    );
  });
});

function fixedFailure() {
  return expect.objectContaining({
    code: "PRODUCT_API_DISABLED",
    message: "Communication Note runner terminal trust composition is unavailable",
  });
}
