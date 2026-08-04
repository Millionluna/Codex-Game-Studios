import { NDIS_CASE_NOTE_COMPANION_PATH } from "./ndis-case-note-companion-navigation";
import { getSafePendingAuthNextHref } from "./referral-workspace-auth-actions";

export type AuthPageContext = "referral" | "ndis-case-note";

export function getAuthPageContext(nextHref: string): AuthPageContext {
  const safeNextHref = getSafePendingAuthNextHref(nextHref);

  if (!safeNextHref) {
    return "referral";
  }

  const { pathname } = new URL(safeNextHref, "https://careslink.local");

  return pathname === NDIS_CASE_NOTE_COMPANION_PATH
    ? "ndis-case-note"
    : "referral";
}
