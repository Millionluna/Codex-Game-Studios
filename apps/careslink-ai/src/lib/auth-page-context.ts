import { NDIS_CASE_NOTE_COMPANION_PATH } from "./ndis-case-note-companion-navigation";
import { getSafePendingAuthNextHref } from "./referral-workspace-auth-actions";

export type AuthPageContext =
  | "referral"
  | "ai-documents"
  | "ndis-case-note"
  | "points-cutover";

export const POINTS_CUTOVER_AUTH_NEXT_HREF =
  "/ai-documents?entry=ndis-case-note-points-cutover" as const;

export type AuthPageDestination = Readonly<{
  context: AuthPageContext;
  nextHref: string;
}>;

export function getAuthPageContext(nextHref: string): AuthPageContext {
  const safeNextHref = getSafePendingAuthNextHref(nextHref);

  if (!safeNextHref) {
    return "referral";
  }

  const { pathname } = new URL(safeNextHref, "https://careslink.local");

  if (pathname === "/ai-documents") {
    return "ai-documents";
  }

  return pathname === NDIS_CASE_NOTE_COMPANION_PATH
    ? "ndis-case-note"
    : "referral";
}

export function getAuthPageDestination(
  nextHref: string,
  pointsUiEnabled: boolean,
): AuthPageDestination {
  const context = getAuthPageContext(nextHref);
  const isPersistedPointsCutover =
    context === "ai-documents" &&
    new URL(nextHref, "https://careslink.local").searchParams.get("entry") ===
      "ndis-case-note-points-cutover";

  if (
    pointsUiEnabled &&
    (context === "ndis-case-note" || isPersistedPointsCutover)
  ) {
    return {
      context: "points-cutover",
      nextHref: POINTS_CUTOVER_AUTH_NEXT_HREF,
    };
  }

  return { context, nextHref };
}
