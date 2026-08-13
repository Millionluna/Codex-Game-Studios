import { describe, expect, it, vi } from "vitest";

import { createMemoryCaresLinkV1ProductApiStore } from "./product-api-memory";
import {
  handleCaresLinkV1ConfirmPrivacyReview,
  type CaresLinkV1ProductApiRouteDependencies,
} from "./product-api-route.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
} from "./shared-contracts";
import { CARESLINK_V1_HEADER_NAMES } from "./transport-contract";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROOF_ID = "30000000-0000-4000-8000-000000000001";
const CORRELATION_ID = "privacy.request:0001";
const NOW = "2026-08-11T02:00:00.000Z";

describe("CaresLink V1 privacy review HTTP boundary", () => {
  it("authenticates before parsing privacy-review content", async () => {
    const resolveAuth = vi.fn(async () => ({
      ok: false as const,
      reason: "auth_required" as const,
      status: 401 as const,
    }));
    const getProductApi = vi.fn();
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request("{", "privacy.confirm.0001"),
      { resolveAuth, getProductApi, createCorrelationId: () => CORRELATION_ID },
    );

    expect(response.status).toBe(401);
    expect(getProductApi).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED", correlationId: CORRELATION_ID },
    });
  });

  it("returns one idempotent CONFIRMED proof without echoing cleaned facts", async () => {
    const store = memoryStore([PROOF_ID]);
    const dependencies = authenticatedDependencies(store, "bearer");
    const body = privacyBody({ observable_facts: "Observed support only" });
    const first = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(body), "privacy.confirm.0001"),
      dependencies,
    );
    const replay = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(body), "privacy.confirm.0001"),
      dependencies,
    );

    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get(CARESLINK_V1_HEADER_NAMES.contractVersion)).toBe(
      CARESLINK_V1_CONTRACT_VERSION,
    );
    const proof = await first.json();
    expect(proof).toMatchObject({
      id: PROOF_ID,
      ownerUserId: USER_ID,
      noteType: "ndis",
      status: "CONFIRMED",
      scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
      reviewRevision: 1,
      expiresAt: "2026-08-11T02:30:00.000Z",
    });
    expect(proof.cleanedFactsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(proof)).not.toContain("Observed support only");
    await expect(replay.json()).resolves.toEqual(proof);
  });

  it("rejects changed facts under the same idempotency key", async () => {
    const dependencies = authenticatedDependencies(memoryStore([PROOF_ID]), "bearer");
    await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody({ observable_facts: "First safe fact" })),
        "privacy.confirm.0001",
      ),
      dependencies,
    );
    const changed = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody({ observable_facts: "Changed safe fact" })),
        "privacy.confirm.0001",
      ),
      dependencies,
    );

    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("maps over-deep structured facts to a safe validation error", async () => {
    let nested: Record<string, unknown> = { value: "safe" };
    for (let depth = 0; depth < 40; depth += 1) nested = { child: nested };
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody(nested)),
        "privacy.confirm.deep.0001",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(text).not.toContain("value");
  });

  it("rejects a PII-bearing unknown key before scanning without echoing it", async () => {
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({ "Jane Smith": "worker@example.test" }),
        ),
        "privacy.confirm.unknown-key",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "VALIDATION_ERROR", correlationId: CORRELATION_ID },
    });
    expect(text).not.toContain("Jane");
    expect(text).not.toContain("worker@example.test");
    expect(text).not.toContain("privacyFindings");
  });

  it("rejects a PII-bearing decision pointer without echoing it", async () => {
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({}, [
            {
              findingType: "email",
              fieldCode: "/Jane_Doe_private",
              startOffset: 0,
              endOffset: 1,
              decision: "REMOVED",
            },
          ]),
        ),
        "privacy.confirm.unknown-pointer",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "VALIDATION_ERROR", correlationId: CORRELATION_ID },
    });
    expect(text).not.toContain("Jane");
    expect(text).not.toContain("private");
    expect(text).not.toContain("privacyFindings");
  });

  it("accepts historical removal offsets only on actual scalar and array leaves", async () => {
    const scalar = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({ observable_facts: "Safe fact" }, [
            {
              findingType: "email",
              fieldCode: "/observable_facts",
              startOffset: 500,
              endOffset: 520,
              decision: "REMOVED",
            },
          ]),
        ),
        "privacy.confirm.historical-scalar",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(scalar.status).toBe(201);

    const communicationBody = {
      ...privacyBody(),
      noteType: "communication",
      cleanedFacts: createValidCaresLinkV1CleanedFacts("communication"),
      findingDecisions: [
        {
          findingType: "email",
          fieldCode: "/parties_by_role/0",
          startOffset: 500,
          endOffset: 520,
          decision: "REPLACED",
        },
      ],
    };
    const arrayLeaf = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(communicationBody),
        "privacy.confirm.historical-array",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(arrayLeaf.status).toBe(201);

    communicationBody.findingDecisions[0].fieldCode = "/parties_by_role/2";
    const missingArrayLeaf = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(communicationBody),
        "privacy.confirm.missing-array",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(missingArrayLeaf.status).toBe(400);
    await expect(missingArrayLeaf.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects a retained decision that is not an exact current finding", async () => {
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({ observable_facts: "Safe fact" }, [
            {
              findingType: "email",
              fieldCode: "/observable_facts",
              startOffset: 0,
              endOffset: 4,
              decision: "RETAINED_CONFIRMED",
              retentionPurposeConfirmed: true,
            },
          ]),
        ),
        "privacy.confirm.fabricated-retained",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it.each([
    ["noteType", "future_note"],
    ["schemaVersion", "future-schema"],
  ] as const)(
    "maps an unsupported %s to the frozen validation error",
    async (field, value) => {
      const body = privacyBody();
      Reflect.set(body, field, value);
      const response = await handleCaresLinkV1ConfirmPrivacyReview(
        request(
          JSON.stringify(body),
          `privacy.confirm.unsupported-${field}`,
        ),
        authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    },
  );

  it("returns only safe finding locators when current findings are unresolved", async () => {
    const sensitiveValue = "Contact worker@example.test for support";
    const confirmPrivacyReview = vi.fn();
    const dependencies = authenticatedDependencies(memoryStore([PROOF_ID]), "bearer");
    dependencies.getProductApi = () => ({ confirmPrivacyReview } as never);
    const response = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody({ observable_facts: sensitiveValue })),
        "privacy.confirm.0001",
      ),
      dependencies,
    );

    expect(response.status).toBe(422);
    const text = await response.text();
    const envelope = JSON.parse(text);
    expect(envelope).toMatchObject({
      error: {
        code: "PRIVACY_REVIEW_REQUIRED",
        privacyFindings: [
          {
            findingType: "email",
            fieldCode: "/observable_facts",
            startOffset: sensitiveValue.indexOf("worker@example.test"),
            endOffset:
              sensitiveValue.indexOf("worker@example.test") +
              "worker@example.test".length,
          },
        ],
      },
    });
    expect(text).not.toContain("worker@example.test");
    expect(text).not.toContain("cleanedFacts");
    expect(confirmPrivacyReview).not.toHaveBeenCalled();
  });

  it("bounds both submitted decisions and safe finding details to 256", async () => {
    const tooManyDecisions = Array.from({ length: 257 }, (_, index) => ({
      findingType: "email",
      fieldCode: `/contact/${index}`,
      startOffset: 0,
      endOffset: 1,
      decision: "REMOVED",
    }));
    const invalid = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({ observable_facts: "safe" }, tooManyDecisions),
        ),
        "privacy.confirm.too-many-decisions",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(invalid.status).toBe(400);

    const findings = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(
          privacyBody({
            observable_facts: Array.from(
              { length: 300 },
              (_, index) => `worker${index}@example.test`,
            ).join(" "),
          }),
        ),
        "privacy.confirm.many-findings",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(findings.status).toBe(422);
    const text = await findings.text();
    const envelope = JSON.parse(text);
    expect(envelope.error.privacyFindings).toHaveLength(256);
    expect(text).not.toContain("worker0@example.test");
  });

  it("accepts a current finding only with an exact retained decision and purpose", async () => {
    const value = "worker@example.test";
    const body = privacyBody(
      { observable_facts: value },
      [
        {
          findingType: "email",
          fieldCode: "/observable_facts",
          startOffset: 0,
          endOffset: value.length,
          decision: "RETAINED_CONFIRMED",
          retentionPurposeConfirmed: true,
        },
      ],
    );
    const accepted = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(body), "privacy.confirm.0001"),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(accepted.status).toBe(201);

    const missingPurposeBody = structuredClone(body);
    delete (missingPurposeBody.findingDecisions[0] as Record<string, unknown>)
      .retentionPurposeConfirmed;
    const rejected = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(missingPurposeBody), "privacy.confirm.0002"),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(rejected.status).toBe(422);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "PRIVACY_REVIEW_REQUIRED" },
    });
  });

  it.each(["REMOVED", "REPLACED", "GENERALISED"] as const)(
    "does not let a %s decision resolve a finding still present in cleanedFacts",
    async (decision) => {
      const value = "worker@example.test";
      const response = await handleCaresLinkV1ConfirmPrivacyReview(
        request(
          JSON.stringify(
            privacyBody(
              { observable_facts: value },
              [
                {
                  findingType: "email",
                  fieldCode: "/observable_facts",
                  startOffset: 0,
                  endOffset: value.length,
                  decision,
                },
              ],
            ),
          ),
          `privacy.confirm.${decision.toLowerCase()}`,
        ),
        authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "PRIVACY_REVIEW_REQUIRED",
          privacyFindings: [
            { findingType: "email", fieldCode: "/observable_facts" },
          ],
        },
      });
    },
  );

  it("requires both confirmations and the existing mutation transport policy", async () => {
    const unconfirmed = privacyBody({ observable_facts: "Safe fact" });
    unconfirmed.deIdentificationConfirmed = false as never;
    const unconfirmedResponse = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(unconfirmed), "privacy.confirm.0001"),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(unconfirmedResponse.status).toBe(422);

    const noAuthority = privacyBody({ observable_facts: "Safe fact" });
    noAuthority.authorityToProcessConfirmed = false as never;
    const noAuthorityResponse = await handleCaresLinkV1ConfirmPrivacyReview(
      request(JSON.stringify(noAuthority), "privacy.confirm.0002"),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(noAuthorityResponse.status).toBe(422);

    const cookieWithoutOrigin = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody({ observable_facts: "Safe fact" })),
        "privacy.confirm.0003",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "cookie"),
    );
    expect(cookieWithoutOrigin.status).toBe(403);

    const bearerWithoutOrigin = await handleCaresLinkV1ConfirmPrivacyReview(
      request(
        JSON.stringify(privacyBody({ observable_facts: "Safe fact" })),
        "privacy.confirm.0004",
      ),
      authenticatedDependencies(memoryStore([PROOF_ID]), "bearer"),
    );
    expect(bearerWithoutOrigin.status).toBe(201);
  });
});

function memoryStore(ids: string[]) {
  const remaining = [...ids];
  return createMemoryCaresLinkV1ProductApiStore({
    createId: () => {
      const id = remaining.shift();
      if (!id) throw new Error("Privacy proof ID fixture exhausted");
      return id;
    },
    now: () => NOW,
  });
}

function authenticatedDependencies(
  store: ReturnType<typeof memoryStore>,
  source: "bearer" | "cookie",
): CaresLinkV1ProductApiRouteDependencies {
  return {
    resolveAuth: async () => ({
      ok: true,
      identity: { userId: USER_ID, sessionId: SESSION_ID, source },
    }),
    getProductApi: (principal) => store.forPrincipal(principal),
    createCorrelationId: () => CORRELATION_ID,
  };
}

function privacyBody(
  cleanedFacts: Record<string, unknown> = {},
  findingDecisions: Array<Record<string, unknown>> = [],
) {
  return {
    noteType: "ndis",
    cleanedFacts: {
      ...createValidCaresLinkV1CleanedFacts("ndis"),
      ...cleanedFacts,
    },
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    findingDecisions,
    deIdentificationConfirmed: true,
    authorityToProcessConfirmed: true,
  };
}

function request(body: string, idempotencyKey: string) {
  return new Request("https://portal.example.test/v1/privacy-reviews", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CARESLINK_V1_HEADER_NAMES.contractVersion]: CARESLINK_V1_CONTRACT_VERSION,
      [CARESLINK_V1_HEADER_NAMES.clientVersion]: "1.0.0",
      [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: idempotencyKey,
    },
    body,
  });
}
