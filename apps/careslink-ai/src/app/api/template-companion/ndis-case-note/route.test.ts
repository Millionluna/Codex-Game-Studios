import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const companionStoreMock = vi.hoisted(() => ({
  getNdisCaseNoteCompanionStore: vi.fn(),
}));

const creditStoreMock = vi.hoisted(() => ({
  getAccountCreditStore: vi.fn(),
}));

const openAiMock = vi.hoisted(() => ({
  generateNdisCaseNoteDraft: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => ({
  getGuidedAiRateLimiter: vi.fn(),
  check: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/ndis-case-note-companion-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/ndis-case-note-companion-store")
  >("../../../../lib/ndis-case-note-companion-store");

  return {
    ...actual,
    getNdisCaseNoteCompanionStore:
      companionStoreMock.getNdisCaseNoteCompanionStore,
  };
});

vi.mock("@/lib/account-credit-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/account-credit-store")
  >("../../../../lib/account-credit-store");

  return {
    ...actual,
    getAccountCreditStore: creditStoreMock.getAccountCreditStore,
  };
});

vi.mock("@/lib/ndis-case-note-companion-request", async () => {
  return vi.importActual(
    "../../../../lib/ndis-case-note-companion-request",
  );
});

vi.mock("@/lib/ndis-case-note-companion", async () => {
  return vi.importActual("../../../../lib/ndis-case-note-companion");
});

vi.mock("@/lib/openai-ndis-case-note", () => ({
  generateNdisCaseNoteDraft: openAiMock.generateNdisCaseNoteDraft,
}));

vi.mock("@/lib/guided-ai-rate-limit", () => ({
  getGuidedAiRateLimiter: rateLimitMock.getGuidedAiRateLimiter,
}));

vi.mock("@/lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession:
    sessionMock.resolveWorkspaceAccountFromSupabaseSession,
}));

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseMock.createCareslinkServerSupabaseClient,
}));

const material = {
  englishCaseNoteDraft:
    "The participant attended a community setting with worker support.",
  chineseReviewVersion: "参与者在工作人员支持下前往社区场景。",
  missingFacts: ["Confirm the finish time."],
  neutralWordingChecks: ["Keep the wording observable."],
  followUpPrompts: ["Confirm whether handover occurred."],
  disclaimer:
    "User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.",
};

const validInput = {
  supportDateTime: "2026-07-23T10:30",
  supportType: "Community participation",
  setting: "Community setting",
  supportDelivered: "The worker supported a planned shopping trip.",
  observableFacts: "The participant selected two items.",
  actionTaken: "The worker supported the participant to return home.",
  followUp: "Review at the next team handover.",
};

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Provider",
  email: "provider@example.com",
};

const store = {
  kind: "memory",
  saveClaim: vi.fn(),
  purgeExpiredClaims: vi.fn(),
  getClaim: vi.fn(),
  consumeClaim: vi.fn(),
  completeClaim: vi.fn(),
  consumeQuota: vi.fn(),
  releaseQuota: vi.fn(),
  recordEvent: vi.fn(),
  listEvents: vi.fn(),
};

const creditSummary = {
  planCode: "free" as const,
  status: "active" as const,
  periodStart: "2026-07-01",
  periodEnd: "2026-08-01",
  creditLimit: 3,
  remainingCredits: 2,
  usedCredits: 1,
  reservedCredits: 0,
};

const creditStore = {
  kind: "supabase" as const,
  getUsage: vi.fn(),
  reserveCredit: vi.fn(),
  commitCredit: vi.fn(),
  releaseCredit: vi.fn(),
};

function createRequest(
  input: Record<string, unknown> = validInput,
  privacyReview: unknown = {
    reviewedNoIdentifiers: true,
    processingAuthorityConfirmed: true,
  },
  idempotencyKey = "case-note-request-0001",
) {
  return new Request(
    "http://localhost/api/template-companion/ndis-case-note?source=ndis-case-note-download&resourceSlug=ndis-case-note-template&utm_campaign=ndis_case_note_ai_companion_v01",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "careslink_ndis_companion_session=session_test_1234567890abcdef",
        "user-agent": "vitest",
        "x-forwarded-for": "203.0.113.10",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ input, privacyReview }),
    },
  );
}

describe("provider-only NDIS case note generation route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("NDIS_CASE_NOTE_FINGERPRINT_PEPPER", "test-pepper");
    Object.values(store).forEach((value) => {
      if (typeof value === "function" && "mockReset" in value) {
        value.mockReset();
      }
    });
    companionStoreMock.getNdisCaseNoteCompanionStore.mockReset();
    creditStoreMock.getAccountCreditStore.mockReset();
    openAiMock.generateNdisCaseNoteDraft.mockReset();
    rateLimitMock.getGuidedAiRateLimiter.mockReset();
    rateLimitMock.check.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseMock.createCareslinkServerSupabaseClient.mockReset();

    companionStoreMock.getNdisCaseNoteCompanionStore.mockReturnValue(store);
    creditStoreMock.getAccountCreditStore.mockReturnValue(creditStore);
    rateLimitMock.getGuidedAiRateLimiter.mockReturnValue({
      check: rateLimitMock.check,
    });
    rateLimitMock.check.mockReturnValue({
      allowed: true,
      remaining: 5,
      resetAt: "2026-07-23T00:01:00.000Z",
    });
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue(
      provider,
    );
    supabaseMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      { auth: {} },
    );
    store.consumeQuota.mockResolvedValue({
      allowed: true,
      usageCount: 1,
      limit: 1,
    });
    store.releaseQuota.mockResolvedValue(undefined);
    store.purgeExpiredClaims.mockResolvedValue(undefined);
    store.saveClaim.mockImplementation(async (record) => record);
    store.recordEvent.mockImplementation(async (record) => record);
    creditStore.reserveCredit.mockReset();
    creditStore.commitCredit.mockReset();
    creditStore.releaseCredit.mockReset();
    creditStore.getUsage.mockReset();
    creditStore.reserveCredit.mockResolvedValue({
      ...creditSummary,
      reservationStatus: "reserved",
      reservationId: "22222222-2222-4222-8222-222222222222",
      isNew: true,
    });
    creditStore.commitCredit.mockResolvedValue({
      ...creditSummary,
      reservationStatus: "completed",
      reservationId: "22222222-2222-4222-8222-222222222222",
      isNew: false,
    });
    creditStore.releaseCredit.mockResolvedValue({
      ...creditSummary,
      remainingCredits: 3,
      usedCredits: 0,
      reservationStatus: "released",
      reservationId: "22222222-2222-4222-8222-222222222222",
      isNew: false,
      reasonCode: "generation_failed",
    });
    openAiMock.generateNdisCaseNoteDraft.mockResolvedValue({
      material,
      inputTokenCount: 150,
      outputTokenCount: 100,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates an owner-bound provider draft and records metadata only", async () => {
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      feature: "ndis_case_note",
      material,
      signedIn: true,
      credits: creditSummary,
    });
    expect(payload.claimToken).toMatch(/^[A-Za-z0-9_-]{32,100}$/);
    expect(store.consumeQuota).toHaveBeenCalledTimes(2);
    expect(creditStore.reserveCredit).toHaveBeenCalledWith({
      userId: provider.id,
      feature: "ndis_case_note",
      action: "generate",
      idempotencyKey: "case-note-request-0001",
    });
    expect(creditStore.commitCredit).toHaveBeenCalledOnce();
    expect(store.consumeQuota.mock.calls.map(([input]) => input.scope)).toEqual([
      "authenticated_user",
      "authenticated_ip",
    ]);
    expect(store.saveClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        claimedByUserId: provider.id,
        claimedAt: expect.any(String),
      }),
    );
    expect(openAiMock.generateNdisCaseNoteDraft).toHaveBeenCalledWith(
      expect.objectContaining({ input: validInput }),
    );

    const event = store.recordEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      eventName: "companion_generated",
      attribution: {
        source: "ndis-case-note-download",
        resourceSlug: "ndis-case-note-template",
      },
    });
    expect(JSON.stringify(event)).not.toContain(
      validInput.observableFacts,
    );
    expect(JSON.stringify(event)).not.toContain(material.englishCaseNoteDraft);
    expect(JSON.stringify(event)).not.toContain(material.chineseReviewVersion);
    const creditCalls = JSON.stringify({
      reserve: creditStore.reserveCredit.mock.calls,
      commit: creditStore.commitCredit.mock.calls,
    });
    expect(creditCalls).not.toContain(validInput.observableFacts);
    expect(creditCalls).not.toContain(material.englishCaseNoteDraft);
    expect(creditCalls).not.toContain(material.chineseReviewVersion);
  });

  it("requires a provider session before parsing JSON, quota, claims or OpenAI", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      undefined,
    );
    const json = vi.fn();
    const request = {
      url: "http://localhost/api/template-companion/ndis-case-note",
      headers: new Headers(),
      json,
    } as unknown as Request;

    const { POST } = await import("./route");
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.code).toBe("login_required");
    expect(json).not.toHaveBeenCalled();
    expect(companionStoreMock.getNdisCaseNoteCompanionStore).not.toHaveBeenCalled();
    expect(creditStoreMock.getAccountCreditStore).not.toHaveBeenCalled();
    expect(rateLimitMock.check).not.toHaveBeenCalled();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(creditStore.reserveCredit).not.toHaveBeenCalled();
    expect(store.saveClaim).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("requires an idempotency key after safety validation and before credit or OpenAI work", async () => {
    const { POST } = await import("./route");
    const response = await POST(createRequest(validInput, {
      reviewedNoIdentifiers: true,
      processingAuthorityConfirmed: true,
    }, "short"));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("idempotency_key_required");
    expect(creditStore.reserveCredit).not.toHaveBeenCalled();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("does not call quota or OpenAI before Privacy Review is confirmed", async () => {
    const { POST } = await import("./route");
    const response = await POST(createRequest(validInput, {}));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("privacy_review_required");
    expect(supabaseMock.createCareslinkServerSupabaseClient).toHaveBeenCalledOnce();
    expect(sessionMock.resolveWorkspaceAccountFromSupabaseSession).toHaveBeenCalledOnce();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("blocks a provider request when the account daily limit is reached", async () => {
    store.consumeQuota.mockResolvedValueOnce({
      allowed: false,
      usageCount: 1,
      limit: 1,
    });
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.code).toBe("daily_limit_reached");
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
    expect(store.saveClaim).not.toHaveBeenCalled();
    expect(creditStore.releaseCredit).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "daily_limit_reached" }),
    );
  });

  it("blocks obvious identifiers after auth but before quota or OpenAI work", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createRequest({
        ...validInput,
        observableFacts:
          "Contact participant@example.com or 0412 345 678.",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("input_review_required");
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "observableFacts" }),
      ]),
    );
    expect(supabaseMock.createCareslinkServerSupabaseClient).toHaveBeenCalledOnce();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("blocks a missing support date/time after auth but before quota or OpenAI work", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createRequest({
        ...validInput,
        supportDateTime: "",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("input_review_required");
    expect(payload.issues).toContainEqual(
      expect.objectContaining({ field: "supportDateTime", code: "required" }),
    );
    expect(supabaseMock.createCareslinkServerSupabaseClient).toHaveBeenCalledOnce();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("fails closed when the full Chinese acceptance case bypasses browser review", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createRequest({
        ...validInput,
        observableFacts:
          "7月30日下午，我陪李阿姨去 Chatswood Chase。她女儿王美玲打电话到 0412 345 678，说她最近很焦虑。她的NDIS号码是123456789。",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.code).toBe("input_review_required");
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "observableFacts" }),
      ]),
    );
    expect(supabaseMock.createCareslinkServerSupabaseClient).toHaveBeenCalledOnce();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });

  it("releases the account credit but keeps abuse quota consumed when safe generation fails", async () => {
    openAiMock.generateNdisCaseNoteDraft.mockRejectedValueOnce(
      new Error("wording boundary"),
    );
    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe("generation_failed");
    expect(payload.error).not.toContain("restored");
    expect(store.releaseQuota).not.toHaveBeenCalled();
    expect(creditStore.releaseCredit).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "generation_failed" }),
    );
    expect(store.saveClaim).not.toHaveBeenCalled();
  });

  it("returns the same completed claim for the same idempotency key without a second model call or charge", async () => {
    let savedClaim: Parameters<typeof store.saveClaim>[0] | undefined;
    store.saveClaim.mockImplementation(async (record) => {
      savedClaim = record;
      return record;
    });
    store.getClaim.mockImplementation(async () => savedClaim);
    creditStore.reserveCredit
      .mockResolvedValueOnce({
        ...creditSummary,
        reservationStatus: "reserved",
        reservationId: "22222222-2222-4222-8222-222222222222",
        isNew: true,
      })
      .mockImplementationOnce(async () => ({
        ...creditSummary,
        reservationStatus: "completed" as const,
        reservationId: "22222222-2222-4222-8222-222222222222",
        isNew: false,
        resultRef: savedClaim?.tokenHash,
        model: "gpt-test",
        inputTokenCount: 150,
        outputTokenCount: 100,
      }));

    const { POST } = await import("./route");
    const first = await POST(createRequest());
    const firstPayload = await first.json();
    const replayed = await POST(createRequest());
    const replayedPayload = await replayed.json();

    expect(first.status).toBe(200);
    expect(replayed.status).toBe(200);
    expect(replayedPayload.claimToken).toBe(firstPayload.claimToken);
    expect(replayedPayload.material).toEqual(firstPayload.material);
    expect(openAiMock.generateNdisCaseNoteDraft).toHaveBeenCalledTimes(1);
    expect(creditStore.commitCredit).toHaveBeenCalledTimes(1);
    expect(store.consumeQuota).toHaveBeenCalledTimes(2);
  });

  it("returns a stable in-progress state for a concurrent replay without another model call", async () => {
    creditStore.reserveCredit.mockResolvedValueOnce({
      ...creditSummary,
      reservationStatus: "reserved",
      reservationId: "22222222-2222-4222-8222-222222222222",
      isNew: false,
    });
    store.getClaim.mockResolvedValueOnce(undefined);

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("generation_in_progress");
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(creditStore.commitCredit).not.toHaveBeenCalled();
  });

  it("fails before abuse quota and OpenAI when the period credit balance is exhausted", async () => {
    creditStore.reserveCredit.mockResolvedValueOnce({
      ...creditSummary,
      remainingCredits: 0,
      usedCredits: 3,
      reservationStatus: "exhausted",
      isNew: false,
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.code).toBe("credit_exhausted");
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
    expect(creditStore.commitCredit).not.toHaveBeenCalled();
    expect(store.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "companion_credit_exhausted",
        userId: provider.id,
      }),
    );
  });

  it("releases a reserved credit when claim persistence fails", async () => {
    store.saveClaim.mockRejectedValueOnce(new Error("claim unavailable"));

    const { POST } = await import("./route");
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.code).toBe("generation_failed");
    expect(creditStore.releaseCredit).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "claim_persistence_failed" }),
    );
    expect(creditStore.commitCredit).not.toHaveBeenCalled();
  });

  it("rejects an admin before parsing or quota work", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      {
        ...provider,
        role: "admin",
      },
    );
    const json = vi.fn();
    const request = {
      url: "http://localhost/api/template-companion/ndis-case-note",
      headers: new Headers(),
      json,
    } as unknown as Request;
    const { POST } = await import("./route");
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe("provider_account_required");
    expect(json).not.toHaveBeenCalled();
    expect(store.consumeQuota).not.toHaveBeenCalled();
    expect(openAiMock.generateNdisCaseNoteDraft).not.toHaveBeenCalled();
  });
});
