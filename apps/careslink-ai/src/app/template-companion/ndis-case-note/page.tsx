import type { Metadata } from "next";
import { getGeneratedMaterialDraftStore } from "@/lib/generated-material-draft-store";
import {
  getNdisCaseNoteCompanionStore,
  type NdisCaseNoteCompanionAttribution,
} from "@/lib/ndis-case-note-companion-store";
import {
  getNdisCaseNoteCompanionAttribution,
  NDIS_CASE_NOTE_COMPANION_PATH,
} from "@/lib/ndis-case-note-companion-request";
import {
  parseNdisCaseNoteMaterial,
  type NdisCaseNoteMaterial,
} from "@/lib/ndis-case-note-companion";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";
import {
  NdisCaseNoteCompanion,
  type SavedNdisCaseNoteDraft,
} from "./ndis-case-note-companion";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "NDIS Case Note AI Companion",
  description:
    "Turn de-identified support facts into neutral case-note draft wording for your review.",
  alternates: {
    canonical:
      "https://ai.careslink.com.au/template-companion/ndis-case-note",
  },
  robots: {
    index: true,
    follow: true,
  },
  referrer: "no-referrer",
};

export default async function NdisCaseNoteCompanionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const attribution = getNdisCaseNoteCompanionAttribution(
    buildRequestUrl(params),
  );
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);
  const claimToken = getClaimToken(params);
  const claim = claimToken
    ? await getNdisCaseNoteCompanionStore().getClaim(claimToken)
    : undefined;
  const canReadClaim =
    claim &&
    (!claim.claimedByUserId || claim.claimedByUserId === account?.id);
  const savedDrafts =
    account?.role === "provider"
      ? await getSavedNdisCaseNoteDrafts(account.id)
      : [];

  return (
    <NdisCaseNoteCompanion
      attribution={attribution}
      accountRole={account?.role}
      initialClaimToken={canReadClaim ? claimToken : undefined}
      initialMaterial={canReadClaim ? claim.material : undefined}
      autoSave={getFirstParam(params?.save) === "1"}
      savedDrafts={savedDrafts}
    />
  );
}

async function getSavedNdisCaseNoteDrafts(
  userId: string,
): Promise<SavedNdisCaseNoteDraft[]> {
  const records =
    await getGeneratedMaterialDraftStore().listGeneratedMaterialDraftsByUser({
      userId,
      feature: "ndis_case_note",
      limit: 6,
    });

  return records.flatMap((record) => {
    const material = getStoredNdisCaseNoteMaterial(record.content);

    return material
      ? [
          {
            id: record.id,
            material,
            status: record.status,
            createdAt: record.createdAt,
          } satisfies SavedNdisCaseNoteDraft,
        ]
      : [];
  });
}

function getStoredNdisCaseNoteMaterial(
  content: Record<string, unknown>,
): NdisCaseNoteMaterial | undefined {
  try {
    return parseNdisCaseNoteMaterial(JSON.stringify(content), {
      allowLegacy: true,
    });
  } catch {
    return undefined;
  }
}

function buildRequestUrl(params: SearchParams | undefined) {
  const url = new URL(
    NDIS_CASE_NOTE_COMPANION_PATH,
    "https://ai.careslink.com.au",
  );

  Object.entries(params ?? {}).forEach(([key, value]) => {
    const firstValue = getFirstParam(value);

    if (firstValue) {
      url.searchParams.set(key, firstValue);
    }
  });

  return url;
}

function getClaimToken(params: SearchParams | undefined) {
  const token = getFirstParam(params?.claimToken)?.trim();

  return token && /^[A-Za-z0-9_-]{32,100}$/.test(token)
    ? token
    : undefined;
}

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type { NdisCaseNoteCompanionAttribution };
