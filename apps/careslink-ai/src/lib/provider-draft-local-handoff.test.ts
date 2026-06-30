import { describe, expect, it } from "vitest";
import {
  getProviderDraftLocalStorageKey,
  parseProviderDraftLocalHandoff,
  PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
  PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
} from "./provider-draft-local-handoff";

describe("provider draft local handoff", () => {
  it("builds the shared public site localStorage key", () => {
    expect(getProviderDraftLocalStorageKey("test-provider-1")).toBe(
      "careslink-ai-provider-draft:test-provider-1",
    );
  });

  it("extracts a JSON draft payload from a public CaresLink localStorage record", () => {
    const parsed = parseProviderDraftLocalHandoff(
      "test-provider-1",
      JSON.stringify({
        version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
        source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
        draftId: "test-provider-1",
        payload: {
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          id: "test-provider-1",
          businessName: "Bright Path Community Support",
          shortDescription: "Provider-submitted public profile draft.",
        },
        savedAt: "2026-06-25T00:00:00.000Z",
      }),
    );

    expect(parsed).toEqual({
      draftId: "test-provider-1",
      draftPayload: JSON.stringify({
        version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
        id: "test-provider-1",
        businessName: "Bright Path Community Support",
        shortDescription: "Provider-submitted public profile draft.",
      }),
    });
  });

  it("extracts a draft payload that is already a stringified JSON object", () => {
    const draftPayload = JSON.stringify({
      version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
      id: "test-provider-1",
      businessName: "Bright Path Community Support",
    });

    const parsed = parseProviderDraftLocalHandoff(
      "test-provider-1",
      JSON.stringify({
        version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
        source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
        draftId: "test-provider-1",
        payload: draftPayload,
      }),
    );

    expect(parsed).toEqual({
      draftId: "test-provider-1",
      draftPayload,
    });
  });

  it("rejects records for a different draft id", () => {
    expect(
      parseProviderDraftLocalHandoff(
        "expected-id",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "other-id",
          payload: { businessName: "Wrong" },
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects records with unsupported metadata", () => {
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: 2,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: { businessName: "Wrong version" },
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: "other-source",
          draftId: "test-provider-1",
          payload: { businessName: "Wrong source" },
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects malformed or oversized localStorage records", () => {
    expect(parseProviderDraftLocalHandoff("test-provider-1", "not-json")).toBeUndefined();
    expect(parseProviderDraftLocalHandoff("test-provider-1", "null")).toBeUndefined();
    expect(parseProviderDraftLocalHandoff("test-provider-1", "[]")).toBeUndefined();
    expect(parseProviderDraftLocalHandoff("test-provider-1", "1")).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: "x".repeat(9000),
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: [],
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: null,
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: { description: "x".repeat(8100) },
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: "{not-json",
        }),
      ),
    ).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
          source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
          draftId: "test-provider-1",
          payload: JSON.stringify(["not", "object"]),
        }),
      ),
    ).toBeUndefined();
  });
});
