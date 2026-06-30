import { NextResponse } from "next/server";
import {
  claimProviderDraft,
  getProviderDraftStore,
} from "@/lib/provider-draft-store";
import { resolveWorkspaceAccountFromRequest } from "@/lib/referral-workspace-server-auth";

const MAX_DRAFT_ID_LENGTH = 120;
const DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

type ProviderDraftClaimPostBody = {
  draftId?: unknown;
  accountId?: unknown;
};

export async function POST(request: Request) {
  let body: ProviderDraftClaimPostBody;

  try {
    body = (await request.json()) as ProviderDraftClaimPostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const draftId = getValidDraftId(body.draftId);

  if (!draftId) {
    return NextResponse.json({ ok: false, error: "Invalid draftId" }, { status: 400 });
  }

  const demoAccountId =
    typeof body.accountId === "string" ? body.accountId.trim() : undefined;
  const accountResolution = await resolveWorkspaceAccountFromRequest(request, {
    demoAccountId,
  });
  const account = accountResolution.account;

  if (!account) {
    return NextResponse.json({ ok: false, error: "Missing account" }, { status: 401 });
  }

  if (account.role !== "provider") {
    return NextResponse.json(
      { ok: false, error: "Only provider accounts can claim drafts" },
      { status: 403 },
    );
  }

  try {
    const store = getProviderDraftStore();

    if (accountResolution.source === "demo" && store.kind === "supabase") {
      return NextResponse.json(
        { ok: false, error: "Demo account claiming is disabled for persistent storage" },
        { status: 401 },
      );
    }

    const record = await claimProviderDraft({
      draftId,
      ownerUserId: account.id,
      store,
    });

    return NextResponse.json({
      ok: true,
      draftId: record.id,
      ownerUserId: record.ownerUserId,
      status: record.status,
      claimedAt: record.claimedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("not found")) {
      return NextResponse.json(
        { ok: false, error: "Provider draft not found" },
        { status: 404 },
      );
    }

    if (message.includes("already claimed") || message.includes("cannot be claimed")) {
      return NextResponse.json(
        { ok: false, error: removeTrailingPeriod(message) },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unable to claim provider draft" },
      { status: 500 },
    );
  }
}

function getValidDraftId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const draftId = value.trim();

  if (
    !draftId ||
    draftId.length > MAX_DRAFT_ID_LENGTH ||
    !DRAFT_ID_PATTERN.test(draftId)
  ) {
    return undefined;
  }

  return draftId;
}

function removeTrailingPeriod(value: string) {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}
