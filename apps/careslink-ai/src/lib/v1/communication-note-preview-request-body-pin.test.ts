import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY,
  createCaresLinkV1CommunicationNotePreviewRequestBodyPinBundleDigest,
  renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody,
  validateCaresLinkV1CommunicationNotePreviewRequestBodyPinBundle,
} from "./communication-note-preview-request-body-pin";
import { CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN } from "./communication-note-preview-evaluation-policy";
import { CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST } from "./communication-note-preview-evaluation-manifest";
import { createCaresLinkV1CommunicationNoteProviderPolicyCandidate } from "./communication-note-provider-policy";
import { renderCaresLinkV1CommunicationNoteOpenAiRequestWire } from "./communication-note-openai-request-wire";
import { buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest } from "./openai-communication-note-provider.server";

vi.mock("server-only", () => ({}));

describe("Communication Note M1g-a request body pins", () => {
  it("literal-pins and deeply freezes the unattested source bundle", () => {
    const bundle =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE;
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
    ).toBe(
      "90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8",
    );
    const { bodyPinBundleDigest, ...core } = clone(bundle);
    expect(
      createCaresLinkV1CommunicationNotePreviewRequestBodyPinBundleDigest(core),
    ).toBe(bodyPinBundleDigest);
    expect(bundle).toMatchObject({
      status: "SOURCE_PINNED_REVIEW_CANDIDATE_NOT_EXECUTION_AUTHORIZATION",
      scope: "OPENAI_RESPONSES_JSON_REQUEST_BODY_ONLY",
      transportScope: "APPLICATION_HTTP_ENVELOPE_NOT_TRANSPORT_BYTES",
      authenticity: "UNATTESTED_SOURCE_PIN_ONLY",
      executionAuthority: "NOT_EXECUTION_AUTHORITY",
      externalOwnerApproval: "ABSENT",
      dispatchAttestation: "ABSENT",
      orderedSlotCount: 6,
      uniqueBodyCount: 3,
    });
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY).toBe(
      false,
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
    ).toBeUndefined();
    expectDeepFrozen(bundle);
  });

  it("binds three distinct raw UTF-8 bodies to the exact ordered six slots", () => {
    const bundle =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE;
    expect(bundle.slots).toHaveLength(6);
    expect(bundle.bodies).toHaveLength(3);
    expect(
      bundle.slots.map(({ fixtureId, runOrdinal }) =>
        `${fixtureId}#${runOrdinal}`,
      ),
    ).toEqual(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST.slots.map(
        ({ fixtureId, runOrdinal }) => `${fixtureId}#${runOrdinal}`,
      ),
    );
    expect(new Set(bundle.slots.map(({ bodySha256 }) => bodySha256)).size).toBe(
      3,
    );
    for (let index = 0; index < bundle.slots.length; index += 2) {
      expect(bundle.slots[index].bodySha256).toBe(
        bundle.slots[index + 1].bodySha256,
      );
      expect(bundle.slots[index].bodyUtf8ByteLength).toBe(
        bundle.slots[index + 1].bodyUtf8ByteLength,
      );
    }
    expect(bundle.bodies.map(({ bodyUtf8ByteLength }) => bodyUtf8ByteLength)).toEqual(
      [2_522, 2_589, 2_657],
    );
  });

  it("source-pins only the application envelope and excludes the runtime secret", () => {
    const bundle =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE;
    expect(bundle.applicationEnvelope).toEqual({
      method: "POST",
      endpointUrl: "https://au.api.openai.com/v1/responses",
      redirect: "error",
      applicationHeaders: {
        allowedNames: ["authorization", "content-type"],
        authorization: {
          required: true,
          scheme: "Bearer",
          valueHandling:
            "RUNTIME_SECRET_REQUIRED_EXCLUDED_FROM_SOURCE_REPORT_AND_DIGEST",
        },
        contentType: "application/json",
        openAiProject: "FORBIDDEN_UNTIL_EXTERNAL_APPROVAL",
        openAiOrganization: "FORBIDDEN_UNTIL_EXTERNAL_APPROVAL",
      },
    });
    expect(bundle.sourceBindings).toEqual({
      evaluationPlanDigest:
        "b89b03ba248bb4c615470a82c7c4ca6220cc009839f9d9c7dd6aaf772fee9dcd",
      requestTemplateDigest:
        "5809bb94ebb96586f5ddb0e48782fa9d961e446a1a5694ac0e18d483f024979d",
      manifestDigest:
        "aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9",
      goldenFixtureSetDigest:
        "432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17",
    });
    expect(JSON.stringify(bundle)).not.toContain(
      "careslink-contract-test-not-a-secret",
    );
  });

  it("matches every builder result byte-for-byte against an independent literal", () => {
    const policy = createCaresLinkV1CommunicationNoteProviderPolicyCandidate();
    for (const [slotIndex, slot] of
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST.slots.entries()) {
      const fixture = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.find(
        ({ id }) => id === slot.fixtureId,
      );
      expect(fixture).toBeDefined();
      const request =
        buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest({
          policySnapshot: policy,
          evaluationPlanSnapshot:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
          sourceLocale: fixture!.sourceLocale,
          cleanedFacts: fixture!.cleanedFacts,
        });
      const rendered =
        renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody({
          slotIndex,
          fixtureId: slot.fixtureId,
          runOrdinal: slot.runOrdinal,
          request,
        });
      const pin =
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE.slots[
          slotIndex
        ];
      expect(rendered.bodySha256).toBe(pin.bodySha256);
      expect(rendered.bodyUtf8ByteLength).toBe(pin.bodyUtf8ByteLength);
      expect(rendered.semanticCanonicalSha256).toBe(
        pin.semanticCanonicalSha256,
      );
      expect(rendered.body).toBe(
        JSON.stringify(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
            .bodies[Math.floor(slotIndex / 2)].request,
        ),
      );
    }
  });

  it("distinguishes raw byte drift from canonical semantic equality", () => {
    const literal = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE.bodies[0]
        .request,
    );
    const { input, ...rest } = literal;
    const reordered = { input, ...rest };
    const originalWire =
      renderCaresLinkV1CommunicationNoteOpenAiRequestWire(literal);
    const reorderedWire =
      renderCaresLinkV1CommunicationNoteOpenAiRequestWire(reordered);

    expect(reorderedWire.semanticCanonicalSha256).toBe(
      originalWire.semanticCanonicalSha256,
    );
    expect(reorderedWire.bodySha256).not.toBe(originalWire.bodySha256);
    expect(() =>
      renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody({
        slotIndex: 0,
        fixtureId: "communication.en.phone-duration.v1",
        runOrdinal: 1,
        request: reordered,
      }),
    ).toThrow(/does not match M1g-a pins/);
    expect(sha256(`${originalWire.body} `)).not.toBe(
      originalWire.bodySha256,
    );
  });

  it("derives semantic evidence from the exact body without rereading a live object", () => {
    let reads = 0;
    const rendered =
      renderCaresLinkV1CommunicationNoteOpenAiRequestWire({
        get value() {
          reads += 1;
          return reads;
        },
      });

    expect(reads).toBe(1);
    expect(rendered.body).toBe('{"value":1}');
    expect(rendered.semanticCanonicalSha256).toBe(
      sha256('{"value":1}'),
    );
  });

  it.each([
    ["model", (value: MutableRequest) => (value.model = "model-drift")],
    [
      "system prompt",
      (value: MutableRequest) => (value.input[0].content += " Drift."),
    ],
    [
      "schema",
      (value: MutableRequest) =>
        value.text.format.schema.required.pop(),
    ],
    [
      "inner user JSON",
      (value: MutableRequest) =>
        (value.input[1].content = value.input[1].content.replace(
          '"sourceLocale":"en"',
          '"sourceLocale": "en"',
        )),
    ],
    ["extra field", (value: MutableRequest) => (value.extra = true)],
  ])("rejects %s drift", (_label, mutate) => {
    const request = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE.bodies[0]
        .request,
    ) as unknown as MutableRequest;
    mutate(request);
    expect(() =>
      renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody({
        slotIndex: 0,
        fixtureId: "communication.en.phone-duration.v1",
        runOrdinal: 1,
        request,
      }),
    ).toThrow(/does not match M1g-a pins/);
  });

  it("rejects slot drift and a tampered bundle even after self-resigning", () => {
    const bundle = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE,
    ) as unknown as MutableBundle;
    bundle.slots.reverse();
    const { bodyPinBundleDigest: oldDigest, ...core } = bundle;
    expect(oldDigest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
    );
    bundle.bodyPinBundleDigest =
      createCaresLinkV1CommunicationNotePreviewRequestBodyPinBundleDigest(core);

    expect(() =>
      validateCaresLinkV1CommunicationNotePreviewRequestBodyPinBundle(bundle),
    ).toThrow(/does not match M1g-a/);
    expect(() =>
      renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody({
        slotIndex: 0,
        fixtureId: "communication.en.phone-duration.v1",
        runOrdinal: 2,
        request:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
            .bodies[0].request,
      }),
    ).toThrow(/does not match M1g-a pins/);
  });

  it("contains no credential value, signature claim, environment or transport", () => {
    const serialized = JSON.stringify(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE,
    );
    expect(serialized).not.toMatch(
      /api[_-]?key|sk-[A-Za-z0-9]|signature|signedBy|approvedAt/i,
    );
    const source = readFileSync(
      new URL(
        "./communication-note-preview-request-body-pin.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain(
      'from "./openai-communication-note-provider.server"',
    );
    expect(source).not.toContain(
      'from "./communication-note-preview-evaluation-runner.server"',
    );
  });
});

type MutableRequest = {
  model: string;
  input: Array<{ content: string }>;
  text: { format: { schema: { required: string[] } } };
  extra?: boolean;
};

type MutableBundle = {
  bodyPinBundleDigest: string;
  slots: Array<unknown>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
