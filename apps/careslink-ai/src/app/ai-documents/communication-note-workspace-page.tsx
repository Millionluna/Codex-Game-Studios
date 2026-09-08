import "server-only";
import { redirect } from "next/navigation";
import { CommunicationNoteSavedDrafts } from "../../components/communication-note-saved-drafts";
import { resolveCommunicationNoteDocumentLocale } from "../../lib/communication-note-document-i18n";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "../../lib/supabase-server";

/** Authenticated shell only. Private metadata is fetched by the separate
 * fresh-session reader, never embedded in server props or demo accounts. */
export async function renderCommunicationNoteWorkspacePage(query: Record<string, string | string[] | undefined> = {}) {
  const { locale, unsupported } = resolveCommunicationNoteDocumentLocale(query.lang);
  const next = `/ai-documents?lang=${locale}`;
  const loginHref = `/auth/login?lang=${locale === "zh-Hant" ? "en" : locale}&next=${encodeURIComponent(next)}`;
  const account = await resolveWorkspaceAccountFromSupabaseSession(await createCareslinkServerSupabaseClient());
  if (!account) redirect(loginHref);
  // Preserve the existing administrative workspace instead of redirecting
  // administrators back into this page or showing provider metadata.
  if (account.role !== "provider") return null;
  const values = query.lang === undefined ? [] : Array.isArray(query.lang) ? query.lang : [query.lang];
  if (Object.keys(query).some(k => k !== "lang") || values.length !== 1 || unsupported || values[0] !== locale)
    redirect(next);
  return <CommunicationNoteSavedDrafts locale={locale} includeTask="MULTI" loginHref={loginHref} />;
}
