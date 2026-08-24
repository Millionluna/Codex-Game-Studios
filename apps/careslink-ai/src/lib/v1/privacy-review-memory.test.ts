import { describe, expect, it } from "vitest";

import {
  createCaresLinkV1CleanedFactsHash,
  createCaresLinkV1ProductApiContentHash,
  createMemoryCaresLinkV1ProductApiStore,
} from "./product-api-memory";
import {
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  type CaresLinkV1CleanedFactsFor,
} from "./shared-contracts";
import type {
  CaresLinkV1AuthenticatedPrincipal,
  CaresLinkV1ConfirmPrivacyReviewCommand,
  CaresLinkV1CreateDocumentRequest,
} from "./transport-contract";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIVACY_REVIEW_ID = "30000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "10000000-0000-4000-8000-000000000001";
const REVISION_ONE = "20000000-0000-4000-8000-000000000001";
const REVISION_TWO = "20000000-0000-4000-8000-000000000002";
const CONFIRMED_AT = "2026-08-11T01:00:00.000Z";

describe("CaresLink V1 memory privacy review binding", () => {
  it("replays confirmation and keeps a proof valid when only englishDraft changes", async () => {
    const ids = [PRIVACY_REVIEW_ID, DOCUMENT_ID, REVISION_ONE, REVISION_TWO];
    const store = createMemoryCaresLinkV1ProductApiStore({
      createId: () => requiredId(ids.shift()),
      now: () => CONFIRMED_AT,
    });
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const cleanedFacts = createValidCaresLinkV1CleanedFacts("progress");
    const command = confirmCommand(cleanedFacts);
    const mutation = { idempotencyKey: "privacy.confirm.0001" } as const;

    const proof = await api.confirmPrivacyReview(command, mutation);
    await expect(api.confirmPrivacyReview(command, mutation)).resolves.toEqual(
      proof,
    );
    expect(proof).toMatchObject({
      id: PRIVACY_REVIEW_ID,
      ownerUserId: OWNER_A,
      cleanedFactsHash: createCaresLinkV1CleanedFactsHash(cleanedFacts),
      status: "CONFIRMED",
      scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
      reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
      expiresAt: "2026-08-11T01:30:00.000Z",
    });

    const created = await api.createDocument(
      createRequest(cleanedFacts, "Initial draft", proof.id),
      { idempotencyKey: "document.create.0001" },
    );
    await expect(
      api.appendDocumentRevision(
        created.document.canonicalId,
        {
          baseRevisionId: created.revision.revisionId,
          ...revisionContent(cleanedFacts, "Edited English only", proof.id),
        },
        { idempotencyKey: "document.patch.0001" },
      ),
    ).resolves.toMatchObject({
      revision: { revisionId: REVISION_TWO, privacyReviewId: proof.id },
    });
  });

  it("fails stale for changed factsSummary, expiry, or a different owner", async () => {
    const ids = [PRIVACY_REVIEW_ID, DOCUMENT_ID, REVISION_ONE];
    let now = CONFIRMED_AT;
    const store = createMemoryCaresLinkV1ProductApiStore({
      createId: () => requiredId(ids.shift()),
      now: () => now,
    });
    const ownerA = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const ownerB = store.forPrincipal(principal(OWNER_B, SESSION_B));
    const cleanedFacts = createValidCaresLinkV1CleanedFacts("progress");
    const mutation = { idempotencyKey: "privacy.confirm.0001" } as const;
    const proof = await ownerA.confirmPrivacyReview(
      confirmCommand(cleanedFacts),
      mutation,
    );

    await expect(
      ownerA.confirmPrivacyReview(
        confirmCommand({
          ...cleanedFacts,
          observable_facts: "Changed observed facts.",
        }),
        mutation,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      ownerA.createDocument(
        createRequest(
          {
            ...cleanedFacts,
            observable_facts: "Changed observed facts.",
          },
          "Draft",
          proof.id,
        ),
        { idempotencyKey: "document.create.changed-facts" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
    await expect(
      ownerB.createDocument(
        createRequest(cleanedFacts, "Draft", proof.id),
        { idempotencyKey: "document.create.other-owner" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });

    now = "2026-08-11T01:30:00.000Z";
    await expect(
      ownerA.createDocument(
        createRequest(cleanedFacts, "Draft", proof.id),
        { idempotencyKey: "document.create.expired" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
  });
});

function confirmCommand(
  cleanedFacts: CaresLinkV1CleanedFactsFor<"progress">,
): CaresLinkV1ConfirmPrivacyReviewCommand {
  return {
    noteType: "progress",
    cleanedFactsHash: createCaresLinkV1CleanedFactsHash(cleanedFacts),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
    reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
    findingDecisions: [],
    deIdentificationConfirmed: true,
    authorityToProcessConfirmed: true,
  };
}

function createRequest(
  cleanedFacts: CaresLinkV1CleanedFactsFor<"progress">,
  englishDraft: string,
  privacyReviewId: string,
): CaresLinkV1CreateDocumentRequest {
  const content = noteContent(cleanedFacts, englishDraft);
  return {
    noteType: "progress",
    sourceLocale: "en",
    content,
    contentHash: createCaresLinkV1ProductApiContentHash(content),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId,
  };
}

function revisionContent(
  cleanedFacts: CaresLinkV1CleanedFactsFor<"progress">,
  englishDraft: string,
  privacyReviewId: string,
) {
  const content = noteContent(cleanedFacts, englishDraft);
  return {
    content,
    contentHash: createCaresLinkV1ProductApiContentHash(content),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId,
  } as const;
}

function noteContent(
  factsSummary: CaresLinkV1CleanedFactsFor<"progress">,
  englishDraft: string,
) {
  return {
    englishDraft,
    reviewVersions: {},
    factsSummary,
    missingFacts: [],
    neutralWordingChecks: [],
    followUpPrompts: [],
    disclaimer: "Review before use.",
  };
}

function principal(
  userId: string,
  sessionId: string,
): CaresLinkV1AuthenticatedPrincipal {
  return { userId, sessionId, transport: "BEARER" };
}

function requiredId(id: string | undefined) {
  if (!id) throw new Error("The deterministic ID fixture was exhausted");
  return id;
}
