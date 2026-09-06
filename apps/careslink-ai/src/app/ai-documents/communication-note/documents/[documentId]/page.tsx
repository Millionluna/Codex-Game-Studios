import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildCommunicationNoteDocumentHref } from "../../../../../lib/communication-note-document-contract";
import {
  getCommunicationNoteDocumentCopy,
  resolveCommunicationNoteDocumentLocale,
} from "../../../../../lib/communication-note-document-i18n";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../../../lib/referral-workspace-session";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "../../../../../lib/seo-policy";
import { createCareslinkServerSupabaseClient } from "../../../../../lib/supabase-server";
import { CommunicationNoteDocumentLoader } from "./communication-note-document-loader";
import { CommunicationNoteDocumentView } from "./communication-note-document-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { locale } = resolveCommunicationNoteDocumentLocale(params?.lang);
  const copy = getCommunicationNoteDocumentCopy(locale);

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: CARESLINK_AI_NOINDEX_ROBOTS,
    referrer: "no-referrer",
  };
}

export default async function CommunicationNoteDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const [{ documentId }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  const localeResult = resolveCommunicationNoteDocumentLocale(query.lang);
  const revisionIds = asValues(query.revisionId);
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);
  const safeNext = buildSafeAuthNext(
    documentId,
    revisionIds,
    localeResult.locale,
  );

  if (!account) {
    const authLocale =
      localeResult.locale === "zh-Hant" ? "en" : localeResult.locale;
    redirect(
      `/auth/login?lang=${encodeURIComponent(authLocale)}&next=${encodeURIComponent(safeNext)}`,
    );
  }

  if (account.role !== "provider") {
    const workspaceLocale =
      localeResult.locale === "zh-Hant" ? "en" : localeResult.locale;
    redirect(`/ai-documents?lang=${encodeURIComponent(workspaceLocale)}`);
  }

  const documentIdIsValid = UUID_PATTERN.test(documentId);
  const revisionIdIsValid =
    revisionIds.length <= 1 &&
    (revisionIds.length === 0 || UUID_PATTERN.test(revisionIds[0]));

  // Authenticate first so malformed identifiers cannot become an account or
  // document oracle. Never forward untrusted path/query text to the private API.
  if (!documentIdIsValid || !revisionIdIsValid) {
    return (
      <CommunicationNoteDocumentView
        canonicalId={documentIdIsValid ? documentId.toLowerCase() : ""}
        documentNavigationAvailable={documentIdIsValid}
        locale={localeResult.locale}
        result={{ status: "NOT_FOUND" }}
        unsupportedLocale={localeResult.unsupported}
      />
    );
  }

  const canonicalDocumentId = documentId.toLowerCase();
  const canonicalRevisionId = revisionIds[0]?.toLowerCase();
  const localeValues = asValues(query.lang);
  const hasOnlyAllowedQueryKeys = Object.keys(query).every(
    (key) => key === "lang" || key === "revisionId",
  );
  const hasCanonicalLocale =
    !localeResult.unsupported &&
    localeValues.length === 1 &&
    localeValues[0] === localeResult.locale;

  if (
    !hasOnlyAllowedQueryKeys ||
    !hasCanonicalLocale ||
    documentId !== canonicalDocumentId ||
    revisionIds[0] !== canonicalRevisionId
  ) {
    redirect(
      buildCommunicationNoteDocumentHref({
        canonicalId: canonicalDocumentId,
        revisionId: canonicalRevisionId,
        locale: localeResult.locale,
      }),
    );
  }

  return (
    <CommunicationNoteDocumentLoader
      canonicalId={canonicalDocumentId}
      locale={localeResult.locale}
      loginHref={`/auth/login?lang=${encodeURIComponent(
        localeResult.locale === "zh-Hant" ? "en" : localeResult.locale,
      )}&next=${encodeURIComponent(safeNext)}`}
      revisionId={canonicalRevisionId}
      unsupportedLocale={localeResult.unsupported}
    />
  );
}

function asValues(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildSafeAuthNext(
  documentId: string,
  revisionIds: readonly string[],
  locale: "en" | "zh-Hans" | "zh-Hant",
) {
  if (
    !UUID_PATTERN.test(documentId) ||
    revisionIds.length > 1 ||
    (revisionIds.length === 1 && !UUID_PATTERN.test(revisionIds[0]))
  ) {
    return `/ai-documents/communication-note?lang=${encodeURIComponent(locale)}`;
  }
  return buildCommunicationNoteDocumentHref({
    canonicalId: documentId.toLowerCase(),
    revisionId: revisionIds[0]?.toLowerCase(),
    locale,
  });
}
