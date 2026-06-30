const LOCAL_DRAFT_STORAGE_PREFIX = "careslink-ai-provider-draft:";
const MAX_DRAFT_PAYLOAD_LENGTH = 8000;

export const PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION = 1;
export const PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE = "provider-profile-generator";

type LocalDraftRecord = {
  version?: unknown;
  source?: unknown;
  draftId?: unknown;
  payload?: unknown;
};

export type ProviderDraftLocalHandoff = {
  draftId: string;
  draftPayload: string;
};

export function getProviderDraftLocalStorageKey(draftId: string): string {
  return `${LOCAL_DRAFT_STORAGE_PREFIX}${draftId}`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseProviderDraftLocalHandoff(
  expectedDraftId: string,
  rawValue: string | null | undefined,
): ProviderDraftLocalHandoff | undefined {
  if (!rawValue || rawValue.length > MAX_DRAFT_PAYLOAD_LENGTH * 2) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue) as LocalDraftRecord;

    if (
      parsed.version !== PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION ||
      parsed.source !== PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE ||
      parsed.draftId !== expectedDraftId ||
      !parsed.payload
    ) {
      return undefined;
    }

    let draftPayload: string;

    if (typeof parsed.payload === "string") {
      const parsedPayload = JSON.parse(parsed.payload) as unknown;

      if (!isJsonObject(parsedPayload)) {
        return undefined;
      }

      draftPayload = parsed.payload;
    } else {
      if (!isJsonObject(parsed.payload)) {
        return undefined;
      }

      draftPayload = JSON.stringify(parsed.payload);
    }

    if (
      draftPayload.length > MAX_DRAFT_PAYLOAD_LENGTH ||
      !draftPayload.trim().startsWith("{")
    ) {
      return undefined;
    }

    return {
      draftId: expectedDraftId,
      draftPayload,
    };
  } catch {
    return undefined;
  }
}
