import { NextResponse } from "next/server";
import {
  getAccessControlStore,
  getGuidedAiAccessDecision,
  recordGuidedAiUsageIfAllowed,
} from "@/lib/access-control-store";
import {
  createGeneratedMaterialDraftRecord,
  getGeneratedMaterialDraftStore,
} from "@/lib/generated-material-draft-store";
import { getGuidedAiRateLimiter } from "@/lib/guided-ai-rate-limit";
import { generateReferralMessageDraft } from "@/lib/openai-referral-message";
import {
  getProviderDraftStore,
  resolveProviderDraftForOwner,
} from "@/lib/provider-draft-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

type ReferralMessagePostBody = {
  draftId?: unknown;
};

const DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
const DEFAULT_REFERRAL_MESSAGE_MODEL = "gpt-5.4-mini";
const OPERATIONAL_SUPPORT_NOTE =
  "Draft material for user review. General business profile and operational support only.";

export async function POST(request: Request) {
  let body: ReferralMessagePostBody;

  try {
    body = (await request.json()) as ReferralMessagePostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const requestedDraftId = getOptionalDraftId(body.draftId);

  if (requestedDraftId === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid draftId" },
      { status: 400 },
    );
  }

  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Login required" },
      { status: 401 },
    );
  }

  if (account.role !== "provider") {
    return NextResponse.json(
      { ok: false, error: "Only provider accounts can generate guided materials" },
      { status: 403 },
    );
  }

  const rateLimit = getGuidedAiRateLimiter().check(account.id);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many guided AI requests",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        resetAt: rateLimit.resetAt,
      },
      { status: 429 },
    );
  }

  const accessStore = getAccessControlStore();
  const accessDecision = await getGuidedAiAccessDecision({
    userId: account.id,
    store: accessStore,
  });

  if (!accessDecision.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          accessDecision.reason === "quota_exhausted"
            ? "Daily guided AI quota exhausted"
            : "Access code required for guided AI usage",
        accessState: accessDecision.accessState,
        remainingQuota: accessDecision.remainingQuota,
      },
      { status: accessDecision.reason === "quota_exhausted" ? 429 : 403 },
    );
  }

  const providerStore = getProviderDraftStore();
  const draftResolution = await resolveProviderDraftForOwner({
    ownerUserId: account.id,
    store: providerStore,
  });

  if (!draftResolution?.record) {
    return NextResponse.json(
      { ok: false, error: "Claimed provider draft required" },
      { status: 404 },
    );
  }

  if (requestedDraftId && requestedDraftId !== draftResolution.record.id) {
    return NextResponse.json(
      { ok: false, error: "Provider draft does not belong to this account" },
      { status: 403 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Guided AI is not configured" },
      { status: 503 },
    );
  }

  const model =
    process.env.OPENAI_REFERRAL_MESSAGE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_REFERRAL_MESSAGE_MODEL;

  try {
    const generated = await generateReferralMessageDraft({
      draft: draftResolution.draft,
      apiKey,
      model,
    });

    await recordGuidedAiUsageIfAllowed({
      userId: account.id,
      providerDraftId: draftResolution.record.id,
      feature: "referral_message",
      inputTokenCount: generated.inputTokenCount,
      outputTokenCount: generated.outputTokenCount,
      store: accessStore,
    });
    const materialDraft =
      await getGeneratedMaterialDraftStore().saveGeneratedMaterialDraft(
        createGeneratedMaterialDraftRecord({
          userId: account.id,
          providerDraftId: draftResolution.record.id,
          feature: "referral_message",
          content: generated.material,
        }),
      );

    return NextResponse.json({
      ok: true,
      feature: "referral_message",
      draftId: draftResolution.record.id,
      material: generated.material,
      meta: {
        model,
        generatedMaterialDraftId: materialDraft.id,
        inputTokenCount: generated.inputTokenCount,
        outputTokenCount: generated.outputTokenCount,
        remainingQuotaBefore: accessDecision.remainingQuota,
        note: OPERATIONAL_SUPPORT_NOTE,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("quota exhausted")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Daily guided AI quota exhausted",
        },
        { status: 429 },
      );
    }

    if (message.includes("Access code required")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Access code required for guided AI usage",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unable to generate referral message draft" },
      { status: 502 },
    );
  }
}

function getOptionalDraftId(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const draftId = value.trim();

  if (!DRAFT_ID_PATTERN.test(draftId)) {
    return null;
  }

  return draftId;
}
