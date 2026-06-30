type HandoffSearchParamRecord = {
  readonly [key: string]: string | readonly string[] | undefined;
};

type HandoffSearchParams =
  | HandoffSearchParamRecord
  | Pick<URLSearchParams, "get">
  | undefined;

export type ProviderGeneratorHandoffContext = {
  source?: string;
  draftId?: string;
  draftPayload?: string;
  draftParamName?: "draft" | "draftId";
};

export const PROVIDER_GENERATOR_SOURCE = "provider-profile-generator";
const MAX_DRAFT_PAYLOAD_LENGTH = 8000;

export function getProviderGeneratorHandoffContext(
  searchParams: HandoffSearchParams,
): ProviderGeneratorHandoffContext {
  const draftId = getHandoffSearchParamValue(searchParams, "draftId");
  const legacyDraft = getHandoffSearchParamValue(searchParams, "draft");

  return {
    source: getHandoffSearchParamValue(searchParams, "source"),
    draftId: draftId ?? legacyDraft,
    draftPayload: getDraftPayloadParam(searchParams),
    draftParamName: draftId ? "draftId" : legacyDraft ? "draft" : undefined,
  };
}

export function getSafeNextHrefWithHandoff(
  searchParams: HandoffSearchParams,
  fallbackHref = "/referral-workspace",
): string {
  const nextHref = getHandoffSearchParamValue(searchParams, "next");

  if (isSafeInternalHref(nextHref)) {
    return nextHref;
  }

  const handoff = getProviderGeneratorHandoffContext(searchParams);

  if (handoff.source || handoff.draftId || handoff.draftPayload) {
    return withProviderGeneratorHandoff(
      "/referral-workspace/profile",
      handoff,
      "draftId",
    );
  }

  return fallbackHref;
}

export function withProviderGeneratorHandoff(
  href: string,
  handoff: ProviderGeneratorHandoffContext,
  preferredDraftParamName: "draft" | "draftId" = handoff.draftParamName ?? "draftId",
): string {
  if (!handoff.source && !handoff.draftId && !handoff.draftPayload) {
    return href;
  }

  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const queryParams = new URLSearchParams(query);

  if (handoff.source) {
    queryParams.set("source", handoff.source);
  }

  if (handoff.draftId) {
    queryParams.delete(preferredDraftParamName === "draftId" ? "draft" : "draftId");
    queryParams.set(preferredDraftParamName, handoff.draftId);
  }

  if (handoff.draftPayload) {
    queryParams.set("draftPayload", handoff.draftPayload);
  }

  const queryString = queryParams.toString();
  const hrefWithHandoff = queryString ? `${pathname}?${queryString}` : pathname;

  return hash === undefined ? hrefWithHandoff : `${hrefWithHandoff}#${hash}`;
}

export function withAuthHandoffParams(
  href: string,
  searchParams: HandoffSearchParams,
): string {
  const handoff = getProviderGeneratorHandoffContext(searchParams);
  const nextHref = getHandoffSearchParamValue(searchParams, "next");
  const hrefWithHandoff = withProviderGeneratorHandoff(href, handoff, "draftId");

  if (!isSafeInternalHref(nextHref)) {
    return hrefWithHandoff;
  }

  const [hrefWithoutHash, hash] = hrefWithHandoff.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const queryParams = new URLSearchParams(query);

  queryParams.set("next", nextHref);

  const hrefWithNext = `${pathname}?${queryParams.toString()}`;

  return hash === undefined ? hrefWithNext : `${hrefWithNext}#${hash}`;
}

export function getHandoffSearchParamValue(
  searchParams: HandoffSearchParams,
  key: string,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  if (hasHandoffSearchParamGetter(searchParams)) {
    return searchParams.get(key) ?? undefined;
  }

  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

function getDraftPayloadParam(
  searchParams: HandoffSearchParams,
): string | undefined {
  const value = getHandoffSearchParamValue(searchParams, "draftPayload");

  if (!value || value.length > MAX_DRAFT_PAYLOAD_LENGTH) {
    return undefined;
  }

  return value;
}

function hasHandoffSearchParamGetter(
  searchParams: HandoffSearchParamRecord | Pick<URLSearchParams, "get">,
): searchParams is Pick<URLSearchParams, "get"> {
  return "get" in searchParams && typeof searchParams.get === "function";
}

function isSafeInternalHref(href: string | undefined): href is string {
  return Boolean(
    href &&
      href.startsWith("/") &&
      !href.startsWith("//") &&
      !href.includes("://"),
  );
}
