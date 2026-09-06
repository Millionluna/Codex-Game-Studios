import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildCommunicationNoteGenerationJobHref } from "../../../../../lib/communication-note-generation-contract";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../../../lib/referral-workspace-session";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "../../../../../lib/seo-policy";
import { createCareslinkServerSupabaseClient } from "../../../../../lib/supabase-server";
import {
  getCommunicationNoteGenerationJobCopy,
  resolveCommunicationNoteGenerationJobLocale,
  type CommunicationNoteGenerationJobLocale,
} from "./communication-note-generation-job-i18n";
import { CommunicationNoteGenerationJobLoader } from "./communication-note-generation-job-loader";
import { CommunicationNoteGenerationJobView } from "./communication-note-generation-job-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const query = await searchParams;
  const { locale } = resolveCommunicationNoteGenerationJobLocale(query?.lang);
  const copy = getCommunicationNoteGenerationJobCopy(locale);

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: CARESLINK_AI_NOINDEX_ROBOTS,
    referrer: "no-referrer",
  };
}

export default async function CommunicationNoteGenerationJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const [{ jobId }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  const localeResult = resolveCommunicationNoteGenerationJobLocale(query.lang);
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);
  const safeNext = buildSafeAuthNext(jobId, localeResult.locale);

  if (!account) {
    const authLocale = toAuthLocale(localeResult.locale);
    redirect(
      `/auth/login?lang=${encodeURIComponent(authLocale)}&next=${encodeURIComponent(safeNext)}`,
    );
  }

  if (account.role !== "provider") {
    redirect(
      `/ai-documents?lang=${encodeURIComponent(toWorkspaceLocale(localeResult.locale))}`,
    );
  }

  const jobIdIsValid = UUID_PATTERN.test(jobId);

  // Authentication deliberately precedes validation so malformed identifiers
  // cannot become an account or job-existence oracle.
  if (!jobIdIsValid) {
    return (
      <CommunicationNoteGenerationJobView
        jobId=""
        jobNavigationAvailable={false}
        locale={localeResult.locale}
        result={{ status: "NOT_FOUND" }}
        unsupportedLocale={localeResult.unsupported}
      />
    );
  }

  const canonicalJobId = jobId.toLowerCase();
  const localeValues = asValues(query.lang);
  const hasOnlyAllowedQueryKeys = Object.keys(query).every(
    (key) => key === "lang",
  );
  const hasCanonicalLocale =
    !localeResult.unsupported &&
    localeValues.length === 1 &&
    localeValues[0] === localeResult.locale;

  if (
    !hasOnlyAllowedQueryKeys ||
    !hasCanonicalLocale ||
    jobId !== canonicalJobId
  ) {
    redirect(
      buildCommunicationNoteGenerationJobHref({
        jobId: canonicalJobId,
        locale: localeResult.locale,
      }),
    );
  }

  return (
    <CommunicationNoteGenerationJobLoader
      jobId={canonicalJobId}
      locale={localeResult.locale}
      loginHref={`/auth/login?lang=${encodeURIComponent(
        toAuthLocale(localeResult.locale),
      )}&next=${encodeURIComponent(safeNext)}`}
      unsupportedLocale={localeResult.unsupported}
    />
  );
}

function buildSafeAuthNext(
  jobId: string,
  locale: CommunicationNoteGenerationJobLocale,
) {
  if (!UUID_PATTERN.test(jobId)) {
    return `/ai-documents/communication-note?lang=${encodeURIComponent(locale)}`;
  }
  return buildCommunicationNoteGenerationJobHref({
    jobId: jobId.toLowerCase(),
    locale,
  });
}

function asValues(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toAuthLocale(locale: CommunicationNoteGenerationJobLocale) {
  return locale === "zh-Hant" ? "en" : locale;
}

function toWorkspaceLocale(locale: CommunicationNoteGenerationJobLocale) {
  return locale === "zh-Hant" ? "en" : locale;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
