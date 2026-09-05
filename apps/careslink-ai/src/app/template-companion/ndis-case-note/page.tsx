import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  getAccountCreditStore,
  type AccountCreditSummary,
} from "@/lib/account-credit-store";
import { getGeneratedMaterialDraftStore } from "@/lib/generated-material-draft-store";
import {
  getNdisCaseNoteCompanionStore,
  type NdisCaseNoteCompanionAttribution,
} from "@/lib/ndis-case-note-companion-store";
import {
  buildNdisCaseNoteCompanionAuthHref,
  getNdisCaseNoteCompanionAttribution,
  NDIS_CASE_NOTE_COMPANION_PATH,
} from "@/lib/ndis-case-note-companion-request";
import {
  parseNdisCaseNoteMaterial,
  type NdisCaseNoteMaterial,
} from "@/lib/ndis-case-note-companion";
import { isCaresLinkV1PointsUiEnabled } from "@/lib/points-ui-feature.server";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "@/lib/seo-policy";
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
  robots: CARESLINK_AI_NOINDEX_ROBOTS,
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

  if (!account) {
    redirect(buildNdisCaseNoteCompanionAuthHref("/auth/login", attribution));
  }

  if (account.role !== "provider") {
    redirect(`/referral-workspace?lang=${attribution.locale}`);
  }

  if (isCaresLinkV1PointsUiEnabled()) {
    return <NdisCaseNotePointsHoldingSurface locale={attribution.locale} />;
  }

  const claimToken = getClaimToken(params);
  const claim = claimToken
    ? await getNdisCaseNoteCompanionStore().getClaim(claimToken)
    : undefined;
  const canReadClaim =
    claim &&
    (!claim.claimedByUserId || claim.claimedByUserId === account.id);
  const [savedDrafts, creditUsage] = await Promise.all([
    getSavedNdisCaseNoteDrafts(account.id),
    getAccountCreditSummary(account.id),
  ]);

  return (
    <NdisCaseNoteCompanion
      attribution={attribution}
      initialClaimToken={canReadClaim ? claimToken : undefined}
      initialMaterial={canReadClaim ? claim.material : undefined}
      autoSave={getFirstParam(params?.save) === "1"}
      savedDrafts={savedDrafts}
      initialCreditUsage={creditUsage}
    />
  );
}

function NdisCaseNotePointsHoldingSurface({
  locale,
}: {
  locale: NdisCaseNoteCompanionAttribution["locale"];
}) {
  const copy = getPointsHoldingCopy(locale);
  const localeQuery = `?lang=${encodeURIComponent(locale)}`;

  return (
    <AppShell
      balanceNavigation="points"
      locale={locale}
      languageSwitcherHref={NDIS_CASE_NOTE_COMPANION_PATH}
      workspaceRole="provider"
      workspaceSessionSource="supabase"
    >
      <div className="mx-auto max-w-[920px]">
        <section
          aria-labelledby="ndis-points-transition-title"
          className="document-paper p-6 sm:p-8"
        >
          <p className="micro-label text-brand">{copy.eyebrow}</p>
          <h1
            id="ndis-points-transition-title"
            className="document-title mt-3"
          >
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            {copy.description}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={`/ai-documents${localeQuery}`} className="jade-action">
              {copy.openDocuments}
            </Link>
            <Link
              href={`/plan-and-usage${localeQuery}`}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand hover:bg-white"
            >
              {copy.openPoints}
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function getPointsHoldingCopy(
  locale: NdisCaseNoteCompanionAttribution["locale"],
) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "Points 切换中",
      title: "NDIS Case Note 助手暂时停用",
      description:
        "NDIS 生成功能正在切换到 Points 系统。打开此页面不会读取、预留或扣减任何余额。",
      openDocuments: "返回 AI 文档",
      openPoints: "查看 Points",
    };
  }

  return {
    eyebrow: "Points transition",
    title: "NDIS Case Note Companion is paused",
    description:
      "NDIS generation is moving to the Points system. Opening this page does not read, reserve or deduct any balance.",
    openDocuments: "Back to AI Documents",
    openPoints: "View Points",
  };
}

async function getAccountCreditSummary(
  userId: string,
): Promise<AccountCreditSummary | null> {
  try {
    const usage = await getAccountCreditStore().getUsage({
      userId,
      recentLimit: 1,
    });

    return {
      planCode: usage.planCode,
      status: usage.status,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      creditLimit: usage.creditLimit,
      remainingCredits: usage.remainingCredits,
      usedCredits: usage.usedCredits,
      reservedCredits: usage.reservedCredits,
    };
  } catch {
    return null;
  }
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
