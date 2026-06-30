import { NextResponse } from "next/server";
import {
  getProviderDraftStore,
  saveProviderDraftPayload,
} from "@/lib/provider-draft-store";
import { PROVIDER_GENERATOR_SOURCE } from "@/lib/referral-workspace-handoff";

const MAX_DRAFT_PAYLOAD_LENGTH = 8000;
const DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
const DEFAULT_ALLOWED_PUBLIC_ORIGINS = [
  "https://careslink.com.au",
  "https://www.careslink.com.au",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:3003",
];

type ProviderDraftPostBody = {
  source?: unknown;
  draftId?: unknown;
  draftPayload?: unknown;
};

export function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: providerDraftCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  let body: ProviderDraftPostBody;

  try {
    body = (await request.json()) as ProviderDraftPostBody;
  } catch {
    return providerDraftJson(request,
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (body.source !== PROVIDER_GENERATOR_SOURCE) {
    return providerDraftJson(request,
      { ok: false, error: "Unsupported source" },
      { status: 400 },
    );
  }

  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";

  if (!DRAFT_ID_PATTERN.test(draftId)) {
    return providerDraftJson(request,
      { ok: false, error: "Missing draftId" },
      { status: 400 },
    );
  }

  if (
    typeof body.draftPayload !== "string" ||
    body.draftPayload.length > MAX_DRAFT_PAYLOAD_LENGTH ||
    !isJsonObjectPayload(body.draftPayload)
  ) {
    return providerDraftJson(request,
      { ok: false, error: "Invalid draftPayload" },
      { status: 400 },
    );
  }

  try {
    const record = await saveProviderDraftPayload({
      draftId,
      draftPayload: body.draftPayload,
      store: getProviderDraftStore(),
    });

    return providerDraftJson(request, {
        ok: true,
        draftId: record.id,
        source: record.source,
        status: record.status,
      });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid provider draft payload")) {
      return providerDraftJson(request,
        { ok: false, error: "Invalid draftPayload" },
        { status: 400 },
      );
    }

    return providerDraftJson(request,
      { ok: false, error: "Unable to save provider draft" },
      { status: 500 },
    );
  }
}

function providerDraftJson(
  request: Request,
  body: Record<string, unknown>,
  init: ResponseInit = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      ...providerDraftCorsHeaders(request),
    },
  });
}

function providerDraftCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");

  if (!origin || !allowedPublicOrigins().has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function allowedPublicOrigins() {
  const configured = (process.env.CARESLINK_PROVIDER_DRAFT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_PUBLIC_ORIGINS, ...configured]);
}

function isJsonObjectPayload(draftPayload: string) {
  try {
    const parsed = JSON.parse(draftPayload);

    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  } catch {
    return false;
  }
}
