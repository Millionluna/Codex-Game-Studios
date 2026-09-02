import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getCommunicationNoteComposerCopy,
  parseCommunicationNoteComposerLocale,
  type CommunicationNoteComposerLocale,
} from "../../../lib/communication-note-composer";
import { isCommunicationNoteComposerEnabled } from "../../../lib/communication-note-composer-feature";
import { resolveCommunicationNotePointsPreview } from "../../../lib/communication-note-points-preview.server";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../lib/referral-workspace-session";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "../../../lib/seo-policy";
import { createCareslinkServerSupabaseClient } from "../../../lib/supabase-server";
import { CommunicationNoteComposer } from "./communication-note-composer";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { locale } = resolveComposerLocale(params?.lang);
  const copy = getCommunicationNoteComposerCopy(locale);

  return {
    title: copy.title,
    description: copy.description,
    robots: CARESLINK_AI_NOINDEX_ROBOTS,
    referrer: "no-referrer",
  };
}

export default async function CommunicationNotePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  if (!isCommunicationNoteComposerEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const localeResult = resolveComposerLocale(params?.lang);
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account) {
    const next = `/ai-documents/communication-note?lang=${encodeURIComponent(localeResult.locale)}`;
    const authLocale =
      localeResult.locale === "zh-Hant" ? "en" : localeResult.locale;
    redirect(
      `/auth/login?lang=${encodeURIComponent(authLocale)}&next=${encodeURIComponent(next)}`,
    );
  }

  if (account.role !== "provider") {
    const workspaceLocale =
      localeResult.locale === "zh-Hant" ? "en" : localeResult.locale;
    redirect(`/ai-documents?lang=${encodeURIComponent(workspaceLocale)}`);
  }

  const pointsPreview = await resolveCommunicationNotePointsPreview(supabase);

  return (
    <CommunicationNoteComposer
      locale={localeResult.locale}
      pointsPreview={pointsPreview}
      unsupportedLocale={localeResult.unsupported}
    />
  );
}

function resolveComposerLocale(
  value: string | string[] | undefined,
): {
  locale: CommunicationNoteComposerLocale;
  unsupported: boolean;
} {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) {
    return { locale: "en", unsupported: false };
  }

  try {
    return {
      locale: parseCommunicationNoteComposerLocale(candidate),
      unsupported: false,
    };
  } catch {
    return { locale: "en", unsupported: true };
  }
}
