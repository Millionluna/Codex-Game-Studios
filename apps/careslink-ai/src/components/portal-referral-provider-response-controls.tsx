"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";

import { canonicalPortalReferralUuid } from "../lib/portal-referral-id";
import {
  PORTAL_REFERRAL_UI_REGION_CODES,
  PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES,
  createPortalReferralMutationRequest,
  type PortalReferralMutation,
} from "./portal-referral-workflow-controls";
import { Card } from "./ui";

const PROVIDER_OFFER_STATUSES = ["OFFERED", "ACCEPTED"] as const;
const ACCEPTED_PROVIDER_REFERRAL_STATUSES = [
  "ACCEPTED",
  "IN_PROGRESS",
  "NOTE_LINKED",
  "EXPORTED",
  "COMPLETED",
  "CLOSED",
] as const;
const MAX_PROVIDER_OFFERS = 50;
const PROVIDER_PORTAL_SIGN_IN_HREF =
  "/auth/login?next=%2Fprovider-portal" as const;
export const PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS = 10_000;
export const PORTAL_REFERRAL_PROVIDER_RESPONSE_LIFECYCLE_DEBOUNCE_MS = 50;
const SUPABASE_AUTH_STORAGE_KEY_PATTERN =
  /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

type PortalReferralProviderOfferStatus =
  (typeof PROVIDER_OFFER_STATUSES)[number];
type PortalReferralProviderCurrentStatus =
  | "OFFERED"
  | (typeof ACCEPTED_PROVIDER_REFERRAL_STATUSES)[number];
type PortalReferralProviderOfferRegion =
  (typeof PORTAL_REFERRAL_UI_REGION_CODES)[number];
type PortalReferralProviderOfferService =
  (typeof PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES)[number];
type PortalReferralProviderResponseMutation = Extract<
  PortalReferralMutation,
  { kind: "RESPOND_TO_OFFER" }
>;

export type PortalReferralProviderResponseFailureCode =
  | "CAPABILITY_DISABLED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REQUEST_FAILED";

export type PortalReferralProviderOffer = Readonly<{
  matchId: string;
  referralId: string;
  region: PortalReferralProviderOfferRegion;
  serviceType: PortalReferralProviderOfferService;
  matchStatus: PortalReferralProviderOfferStatus;
  currentStatus: PortalReferralProviderCurrentStatus;
  rowVersion: number;
}>;

export type PortalReferralProviderOffersResult =
  | Readonly<{ ok: true; items: readonly PortalReferralProviderOffer[] }>
  | Readonly<{
      ok: false;
      code: PortalReferralProviderResponseFailureCode;
    }>;

export type PortalReferralProviderResponseAck = Readonly<{
  referralId: string;
  matchId: string;
  currentStatus: "ACCEPTED" | "TRIAGED";
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralProviderResponseResult =
  | Readonly<{ ok: true; ack: PortalReferralProviderResponseAck }>
  | Readonly<{
      ok: false;
      code: PortalReferralProviderResponseFailureCode;
    }>;

type PortalReferralProviderUncertainAttempt = Readonly<{
  offer: PortalReferralProviderOffer;
  decision: "ACCEPT" | "DECLINE";
  idempotencyKey: string;
}>;

type PortalReferralProviderResponseFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export type PortalReferralProviderResponseRequestToken = Readonly<{
  resourceId: string;
  generation: number;
}>;

export function createPortalReferralProviderResponseRequestTracker() {
  let generation = 0;
  let resourceId: string | undefined;

  return Object.freeze({
    begin(resource: string): PortalReferralProviderResponseRequestToken {
      resourceId = resource;
      generation += 1;
      return Object.freeze({ resourceId, generation });
    },
    isCurrent(token: PortalReferralProviderResponseRequestToken) {
      return (
        token.resourceId === resourceId && token.generation === generation
      );
    },
    invalidate() {
      resourceId = undefined;
      generation += 1;
    },
  });
}

async function runPortalReferralProviderResponseRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error("Portal referral provider response request timed out"));
    }, PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export async function loadPortalReferralProviderOffers({
  enabled = false,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  fetcher?: PortalReferralProviderResponseFetch;
}> = {}): Promise<PortalReferralProviderOffersResult> {
  if (!enabled) return disabledResult();

  try {
    return await runPortalReferralProviderResponseRequest(async (signal) => {
      const response = await fetcher("/api/portal/referral-offers", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) return failureResult(response.status);
      const items = parseProviderOffersEnvelope(await response.json());
      return items ? { ok: true as const, items } : requestFailedResult();
    });
  } catch {
    return requestFailedResult();
  }
}

export async function submitPortalReferralProviderResponse({
  enabled = false,
  offer,
  decision,
  idempotencyKey,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  offer: PortalReferralProviderOffer;
  decision: "ACCEPT" | "DECLINE";
  idempotencyKey: string;
  fetcher?: PortalReferralProviderResponseFetch;
}>): Promise<PortalReferralProviderResponseResult> {
  if (!enabled) return disabledResult();
  if (
    offer.matchStatus !== "OFFERED" ||
    offer.currentStatus !== "OFFERED" ||
    !strictUuid(offer.matchId) ||
    !strictUuid(offer.referralId) ||
    !strictExpectedVersion(offer.rowVersion)
  ) {
    return requestFailedResult();
  }

  const mutation: PortalReferralProviderResponseMutation = {
    kind: "RESPOND_TO_OFFER",
    matchId: offer.matchId,
    expectedVersion: offer.rowVersion,
    decision,
  };
  let request: ReturnType<typeof createPortalReferralMutationRequest>;
  try {
    request = createPortalReferralMutationRequest(mutation, idempotencyKey);
  } catch {
    return requestFailedResult();
  }

  try {
    return await runPortalReferralProviderResponseRequest(async (signal) => {
      const response = await fetcher(request.url, {
        ...request.init,
        signal,
      });
      if (!response.ok) {
        // Error bodies can contain echoed private input or implementation detail.
        return failureResult(response.status);
      }
      const ack = parseProviderResponseAck(
        await response.json(),
        offer,
        decision,
      );
      return ack ? { ok: true as const, ack } : requestFailedResult();
    });
  } catch {
    return requestFailedResult();
  }
}

export function portalReferralProviderResponseRequiresAuthoritativeRefresh(
  result: PortalReferralProviderResponseResult,
) {
  return (
    result.ok ||
    result.code === "NOT_FOUND" ||
    result.code === "CONFLICT" ||
    result.code === "REQUEST_FAILED"
  );
}

export function portalReferralProviderResponseClearsOffers(
  result: PortalReferralProviderResponseResult,
) {
  return (
    !result.ok &&
    (result.code === "AUTH_REQUIRED" ||
      result.code === "FORBIDDEN" ||
      result.code === "CAPABILITY_DISABLED")
  );
}

export function PortalReferralProviderResponseCoordinator({
  enabled = false,
}: Readonly<{ enabled?: boolean }>) {
  const [offersResult, setOffersResult] =
    useState<PortalReferralProviderOffersResult>();
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<
    Readonly<{
      matchId: string;
      decision: "ACCEPT" | "DECLINE";
    }>
  >();
  const [mutationResult, setMutationResult] =
    useState<PortalReferralProviderResponseResult>();
  const [uncertainAttempt, setUncertainAttempt] =
    useState<PortalReferralProviderUncertainAttempt>();
  const uncertainAttemptRef = useRef<
    PortalReferralProviderUncertainAttempt | undefined
  >(undefined);
  const listTrackerRef = useRef<ReturnType<
    typeof createPortalReferralProviderResponseRequestTracker
  > | null>(null);
  const mutationTrackerRef = useRef<ReturnType<
    typeof createPortalReferralProviderResponseRequestTracker
  > | null>(null);
  const inFlightSubmitRef = useRef<
    Promise<PortalReferralProviderResponseResult> | undefined
  >(undefined);
  const authorizationEpochRef = useRef(0);
  const inFlightRefreshRef = useRef<
    Promise<PortalReferralProviderOffersResult> | undefined
  >(undefined);
  const lifecycleRefreshActiveRef = useRef(false);
  const lifecycleRefreshQueuedRef = useRef(false);
  const lifecycleRefreshRunningRef = useRef(false);
  const lifecycleRefreshTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const providerResponseHeadingRef = useRef<HTMLHeadingElement>(null);
  const mutationNoticeRef = useRef<HTMLParagraphElement>(null);
  const signInLinkRef = useRef<HTMLAnchorElement>(null);
  const offerFocusTargetsRef = useRef(new Map<string, HTMLHeadingElement>());
  const responseFocusMatchIdRef = useRef<string | undefined>(undefined);
  const [responseFocusVersion, setResponseFocusVersion] = useState(0);
  const accessibilityRootId = useId();
  if (listTrackerRef.current == null) {
    listTrackerRef.current = createPortalReferralProviderResponseRequestTracker();
  }
  if (mutationTrackerRef.current == null) {
    mutationTrackerRef.current =
      createPortalReferralProviderResponseRequestTracker();
  }

  const commitLoadedOffers = useCallback(
    (loaded: PortalReferralProviderOffersResult) => {
      if (loaded.ok) {
        const candidate = uncertainAttemptRef.current;
        if (candidate) {
          const exactOfferIsStillPending = loaded.items.some(
            (item) =>
              item.matchId === candidate.offer.matchId &&
              item.referralId === candidate.offer.referralId &&
              item.matchStatus === "OFFERED" &&
              item.currentStatus === "OFFERED" &&
              item.rowVersion === candidate.offer.rowVersion,
          );
          if (exactOfferIsStillPending) {
            setUncertainAttempt(candidate);
            setMutationResult({ ok: false, code: "REQUEST_FAILED" });
          } else {
            uncertainAttemptRef.current = undefined;
            setUncertainAttempt(undefined);
            setMutationResult((currentResult) =>
              currentResult &&
              !currentResult.ok &&
              currentResult.code === "REQUEST_FAILED"
                ? undefined
                : currentResult,
            );
          }
        }
      } else if (
        loaded.code === "AUTH_REQUIRED" ||
        loaded.code === "FORBIDDEN" ||
        loaded.code === "CAPABILITY_DISABLED"
      ) {
        uncertainAttemptRef.current = undefined;
        setUncertainAttempt(undefined);
        setMutationResult(undefined);
      }
      setOffersResult(loaded);
      setRefreshing(false);
    },
    [],
  );

  const refreshOffers = useCallback(
    async ({ clear = true }: Readonly<{ clear?: boolean }> = {}) => {
      const tracker = listTrackerRef.current;
      if (!enabled || !tracker) return;
      const token = tracker.begin("provider-offers");
      if (clear) setOffersResult(undefined);
      setRefreshing(true);
      const request = loadPortalReferralProviderOffers({ enabled });
      inFlightRefreshRef.current = request;
      const loaded = await request;
      if (inFlightRefreshRef.current === request) {
        inFlightRefreshRef.current = undefined;
      }
      if (!tracker.isCurrent(token)) return;
      commitLoadedOffers(loaded);
      return loaded;
    },
    [commitLoadedOffers, enabled],
  );

  const reauthorizeAfterBrowserLifecycleEvent = useCallback(() => {
    if (!enabled || !lifecycleRefreshActiveRef.current) return;

    // A resumed page may belong to a different or revoked Cookie principal.
    // Remove the previous projection and command synchronously before any
    // network result. The same provider can have multiple users, so an exact
    // offer match alone cannot prove that an old idempotency key still belongs
    // to the current principal.
    authorizationEpochRef.current += 1;
    listTrackerRef.current?.invalidate();
    mutationTrackerRef.current?.invalidate();
    uncertainAttemptRef.current = undefined;
    setOffersResult(undefined);
    setPending(undefined);
    setMutationResult(undefined);
    setUncertainAttempt(undefined);
    setRefreshing(true);

    lifecycleRefreshQueuedRef.current = true;
    if (lifecycleRefreshRunningRef.current) return;
    if (lifecycleRefreshTimerRef.current !== null) {
      globalThis.clearTimeout(lifecycleRefreshTimerRef.current);
    }

    lifecycleRefreshTimerRef.current = globalThis.setTimeout(() => {
      lifecycleRefreshTimerRef.current = null;
      if (
        !lifecycleRefreshActiveRef.current ||
        lifecycleRefreshRunningRef.current
      ) {
        return;
      }

      lifecycleRefreshRunningRef.current = true;
      void (async () => {
        try {
          while (
            lifecycleRefreshActiveRef.current &&
            lifecycleRefreshQueuedRef.current
          ) {
            const inFlightSubmit = inFlightSubmitRef.current;
            if (inFlightSubmit) {
              await inFlightSubmit;
              if (!lifecycleRefreshActiveRef.current) return;
            }

            const inFlightRefresh = inFlightRefreshRef.current;
            if (inFlightRefresh) {
              await inFlightRefresh;
              if (!lifecycleRefreshActiveRef.current) return;
            }

            // Coalesce every lifecycle signal received while the decision was
            // settling. A later signal during the GET invalidates its token and
            // leaves this flag set for one more authoritative read.
            lifecycleRefreshQueuedRef.current = false;
            await refreshOffers();
          }
        } finally {
          lifecycleRefreshRunningRef.current = false;
        }
      })();
    }, PORTAL_REFERRAL_PROVIDER_RESPONSE_LIFECYCLE_DEBOUNCE_MS);
  }, [enabled, refreshOffers]);

  useEffect(() => {
    if (!enabled) return;
    const listTracker = listTrackerRef.current;
    const mutationTracker = mutationTrackerRef.current;
    if (!listTracker) return;
    const token = listTracker.begin("provider-offers");
    const request = loadPortalReferralProviderOffers({ enabled });
    inFlightRefreshRef.current = request;
    void request.then((loaded) => {
      if (inFlightRefreshRef.current === request) {
        inFlightRefreshRef.current = undefined;
      }
      if (!listTracker.isCurrent(token)) return;
      commitLoadedOffers(loaded);
    });
    return () => {
      listTracker.invalidate();
      mutationTracker?.invalidate();
    };
  }, [commitLoadedOffers, enabled]);

  useEffect(() => {
    if (!enabled) return;
    lifecycleRefreshActiveRef.current = true;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reauthorizeAfterBrowserLifecycleEvent();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        SUPABASE_AUTH_STORAGE_KEY_PATTERN.test(event.key)
      ) {
        reauthorizeAfterBrowserLifecycleEvent();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reauthorizeAfterBrowserLifecycleEvent();
    };

    window.addEventListener("focus", reauthorizeAfterBrowserLifecycleEvent);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      lifecycleRefreshActiveRef.current = false;
      lifecycleRefreshQueuedRef.current = false;
      if (lifecycleRefreshTimerRef.current !== null) {
        globalThis.clearTimeout(lifecycleRefreshTimerRef.current);
        lifecycleRefreshTimerRef.current = null;
      }
      window.removeEventListener("focus", reauthorizeAfterBrowserLifecycleEvent);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, reauthorizeAfterBrowserLifecycleEvent]);

  useEffect(() => {
    if (responseFocusVersion === 0) return;
    const matchId = responseFocusMatchIdRef.current;
    responseFocusMatchIdRef.current = undefined;
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement &&
      activeElement.isConnected
    ) {
      return;
    }
    const matchedOffer = matchId
      ? offerFocusTargetsRef.current.get(matchId)
      : undefined;
    const firstOffer = [...offerFocusTargetsRef.current.values()].find(
      (candidate) => candidate.isConnected,
    );
    const target =
      signInLinkRef.current ??
      mutationNoticeRef.current ??
      (matchedOffer?.isConnected ? matchedOffer : undefined) ??
      firstOffer ??
      providerResponseHeadingRef.current;
    target?.focus();
  }, [responseFocusVersion]);

  async function respond(
    offer: PortalReferralProviderOffer,
    decision: "ACCEPT" | "DECLINE",
    replayIdempotencyKey?: string,
  ) {
    const isExactUncertainReplay = Boolean(
      replayIdempotencyKey &&
        uncertainAttempt &&
        replayIdempotencyKey === uncertainAttempt.idempotencyKey &&
        offer.matchId === uncertainAttempt.offer.matchId &&
        decision === uncertainAttempt.decision,
    );
    if (
      pending ||
      inFlightSubmitRef.current ||
      inFlightRefreshRef.current ||
      refreshing ||
      (uncertainAttempt && !isExactUncertainReplay) ||
      offer.matchStatus !== "OFFERED" ||
      offer.currentStatus !== "OFFERED" ||
      !strictExpectedVersion(offer.rowVersion)
    ) {
      return;
    }
    const tracker = mutationTrackerRef.current;
    if (!tracker) return;
    const token = tracker.begin(
      `${offer.matchId}:${offer.rowVersion}:${decision}`,
    );
    setPending({ matchId: offer.matchId, decision });
    setMutationResult(undefined);
    const idempotencyKey =
      replayIdempotencyKey ?? createProviderResponseMutationId(decision);
    const attempt = { offer, decision, idempotencyKey } as const;
    const authorizationEpoch = authorizationEpochRef.current;
    const submit = submitPortalReferralProviderResponse({
      enabled,
      offer,
      decision,
      idempotencyKey,
    });
    inFlightSubmitRef.current = submit;
    const result = await submit;
    if (inFlightSubmitRef.current === submit) {
      inFlightSubmitRef.current = undefined;
    }
    if (
      authorizationEpochRef.current === authorizationEpoch &&
      !result.ok &&
      result.code === "REQUEST_FAILED"
    ) {
      uncertainAttemptRef.current = attempt;
    } else {
      uncertainAttemptRef.current = undefined;
    }
    if (!tracker.isCurrent(token)) return;
    setMutationResult(result);
    if (!result.ok && result.code === "REQUEST_FAILED") {
      setUncertainAttempt(attempt);
    } else {
      setUncertainAttempt(undefined);
    }
    const scheduleResponseFocus = () => {
      responseFocusMatchIdRef.current = offer.matchId;
      setResponseFocusVersion((current) => current + 1);
    };
    scheduleResponseFocus();

    try {
      if (portalReferralProviderResponseRequiresAuthoritativeRefresh(result)) {
        await refreshOffers();
      } else if (
        !result.ok &&
        portalReferralProviderResponseClearsOffers(result)
      ) {
        listTrackerRef.current?.invalidate();
        setRefreshing(false);
        setOffersResult({ ok: false, code: result.code });
      }
    } finally {
      if (tracker.isCurrent(token)) {
        setPending(undefined);
        scheduleResponseFocus();
      }
    }
  }

  function manuallyRefresh() {
    if (
      pending ||
      inFlightSubmitRef.current ||
      inFlightRefreshRef.current ||
      refreshing ||
      !offersResult
    ) {
      return;
    }
    mutationTrackerRef.current?.invalidate();
    setPending(undefined);
    setMutationResult(undefined);
    void refreshOffers({ clear: false });
  }

  const responseControlsBusy =
    Boolean(pending) ||
    refreshing ||
    !offersResult;

  if (!enabled) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5d6d68]">
          Preview provider response runtime is disabled. No offer request is sent.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="Authorized provider offers" className="grid gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              Provider response M1b
            </p>
            <h2
              ref={providerResponseHeadingRef}
              tabIndex={-1}
              className="mt-2 text-lg font-semibold"
            >
              My authorized referral offers / 我的邀约
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
              Only the authorized region, service, status and row version are shown.
            </p>
          </div>
          <button
            type="button"
            disabled={responseControlsBusy}
            className="taito-secondary px-3"
            onClick={manuallyRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh offers / 刷新邀约"}
          </button>
        </div>
      </Card>

      {!offersResult ? (
        <Card className="p-5">
          <p aria-live="polite" className="text-sm text-[#5d6d68]">
            Loading authorized provider offers…
          </p>
        </Card>
      ) : !offersResult.ok ? (
        <Card className="grid gap-3 p-5">
          <p aria-live="polite" className="text-sm text-[#7a4b00]">
            {providerResponseFailureMessage(offersResult.code)}
          </p>
          {offersResult.code === "AUTH_REQUIRED" ? (
            <a
              ref={signInLinkRef}
              href={PROVIDER_PORTAL_SIGN_IN_HREF}
              className="taito-secondary w-fit px-3"
            >
              Sign in again / 重新登录
            </a>
          ) : offersResult.code === "REQUEST_FAILED" ||
            offersResult.code === "CONFLICT" ? (
            <button
              type="button"
              disabled={responseControlsBusy}
              className="taito-secondary w-fit px-3"
              onClick={manuallyRefresh}
            >
              Retry offers / 重试邀约
            </button>
          ) : null}
        </Card>
      ) : offersResult.items.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-[#5d6d68]">
            No authorized referral offers are currently available.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4">
          {offersResult.items.map((offer, index) => {
            const offerPending = pending?.matchId === offer.matchId;
            const uncertainOffer =
              uncertainAttempt?.offer.matchId === offer.matchId
                ? uncertainAttempt
                : undefined;
            const offerNumber = index + 1;
            const offerTitleId = `${accessibilityRootId}-offer-${offerNumber}-title`;
            const acceptLabelId = `${accessibilityRootId}-offer-${offerNumber}-accept`;
            const declineLabelId = `${accessibilityRootId}-offer-${offerNumber}-decline`;
            return (
              <li key={offer.matchId}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3
                        id={offerTitleId}
                        ref={(node) => {
                          if (node) {
                            offerFocusTargetsRef.current.set(offer.matchId, node);
                          } else {
                            offerFocusTargetsRef.current.delete(offer.matchId);
                          }
                        }}
                        tabIndex={-1}
                        className="text-lg font-semibold text-[#263834]"
                      >
                        {displayRegion(offer.region)} · {displayService(offer.serviceType)}
                      </h3>
                      <p className="mt-2 text-sm text-[#5d6d68]">
                        Status {offer.currentStatus} · Version {offer.rowVersion}
                      </p>
                    </div>
                    <ProviderOfferStatusBadge status={offer.matchStatus} />
                  </div>

                  {offer.matchStatus === "OFFERED" && uncertainOffer ? (
                    <div className="mt-4 grid gap-2">
                      <p className="text-sm text-[#7a4b00]">
                        The {uncertainOffer.decision.toLowerCase()} response is
                        uncertain. Retry uses the same idempotency key.
                      </p>
                      <button
                        type="button"
                        disabled={responseControlsBusy}
                        className="taito-secondary w-fit px-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() =>
                          void respond(
                            uncertainOffer.offer,
                            uncertainOffer.decision,
                            uncertainOffer.idempotencyKey,
                          )
                        }
                      >
                        {offerPending
                          ? "Reconciling…"
                          : "Retry same response / 重试同一响应"}
                      </button>
                    </div>
                  ) : offer.matchStatus === "OFFERED" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-labelledby={`${acceptLabelId} ${offerTitleId}`}
                        disabled={
                          responseControlsBusy ||
                          Boolean(uncertainAttempt) ||
                          !strictExpectedVersion(offer.rowVersion)
                        }
                        className="taito-primary px-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void respond(offer, "ACCEPT")}
                      >
                        <span id={acceptLabelId}>
                          {offerPending && pending?.decision === "ACCEPT"
                            ? "Accepting…"
                            : "Accept / 接受"}
                          <span className="sr-only">
                            {` offer ${offerNumber} / 邀约 ${offerNumber}`}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-labelledby={`${declineLabelId} ${offerTitleId}`}
                        disabled={
                          responseControlsBusy ||
                          Boolean(uncertainAttempt) ||
                          !strictExpectedVersion(offer.rowVersion)
                        }
                        className="taito-secondary px-4 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void respond(offer, "DECLINE")}
                      >
                        <span id={declineLabelId}>
                          {offerPending && pending?.decision === "DECLINE"
                            ? "Declining…"
                            : "Decline / 拒绝"}
                          <span className="sr-only">
                            {` offer ${offerNumber} / 邀约 ${offerNumber}`}
                          </span>
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[#5d6d68]">
                      Accepted / 已接受 · Response is read-only.
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ProviderResponseMutationNotice
        focusRef={mutationNoticeRef}
        refreshing={refreshing}
        result={mutationResult}
      />
    </section>
  );
}

function ProviderResponseMutationNotice({
  focusRef,
  refreshing,
  result,
}: Readonly<{
  focusRef: RefObject<HTMLParagraphElement | null>;
  refreshing: boolean;
  result: PortalReferralProviderResponseResult | undefined;
}>) {
  if (!result) return null;
  const message = result.ok
    ? refreshing
      ? "Response saved. Refreshing the authorized offer list."
      : "Response saved. The authorized offer list was refreshed."
    : result.code === "CONFLICT"
      ? "The offer changed. The authorized offer list was refreshed."
      : result.code === "NOT_FOUND"
        ? "That offer is no longer available. The authorized list was refreshed."
      : result.code === "REQUEST_FAILED"
        ? "The response outcome is uncertain. Refresh or retry the same response to reconcile it."
        : providerResponseFailureMessage(result.code);
  return (
    <p
      ref={focusRef}
      aria-live="polite"
      tabIndex={-1}
      className="text-sm text-[#5d6d68]"
    >
      {message}
    </p>
  );
}

function ProviderOfferStatusBadge({
  status,
}: Readonly<{ status: PortalReferralProviderOfferStatus }>) {
  return (
    <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
      {status}
    </span>
  );
}

function parseProviderOffersEnvelope(
  value: unknown,
): readonly PortalReferralProviderOffer[] | undefined {
  if (!hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) {
    return undefined;
  }
  if (value.items.length > MAX_PROVIDER_OFFERS) return undefined;

  const seenMatchIds = new Set<string>();
  const seenReferralIds = new Set<string>();
  const parsed: PortalReferralProviderOffer[] = [];
  for (const item of value.items) {
    if (
      !hasExactKeys(item, [
        "matchId",
        "referralId",
        "region",
        "serviceType",
        "matchStatus",
        "currentStatus",
        "rowVersion",
      ])
    ) {
      return undefined;
    }
    const matchId = strictUuid(item.matchId);
    const referralId = strictUuid(item.referralId);
    const region = strictRegion(item.region);
    const serviceType = strictService(item.serviceType);
    const matchStatus = strictProviderOfferStatus(item.matchStatus);
    const currentStatus = strictProviderCurrentStatus(item.currentStatus);
    const rowVersion = strictRowVersion(item.rowVersion);
    if (
      !matchId ||
      !referralId ||
      !region ||
      !serviceType ||
      !matchStatus ||
      !currentStatus ||
      (matchStatus === "OFFERED" && currentStatus !== "OFFERED") ||
      (matchStatus === "ACCEPTED" &&
        !(
          ACCEPTED_PROVIDER_REFERRAL_STATUSES as readonly string[]
        ).includes(currentStatus)) ||
      !rowVersion ||
      seenMatchIds.has(matchId) ||
      seenReferralIds.has(referralId)
    ) {
      return undefined;
    }
    seenMatchIds.add(matchId);
    seenReferralIds.add(referralId);
    parsed.push(
      Object.freeze({
        matchId,
        referralId,
        region,
        serviceType,
        matchStatus,
        currentStatus,
        rowVersion,
      }),
    );
  }
  return Object.freeze(parsed);
}

function parseProviderResponseAck(
  value: unknown,
  offer: PortalReferralProviderOffer,
  decision: "ACCEPT" | "DECLINE",
): PortalReferralProviderResponseAck | undefined {
  if (
    !hasExactKeys(value, [
      "referralId",
      "matchId",
      "currentStatus",
      "rowVersion",
      "updatedAt",
    ])
  ) {
    return undefined;
  }
  const referralId = strictUuid(value.referralId);
  const matchId = strictUuid(value.matchId);
  const updatedAt = strictUtcInstant(value.updatedAt);
  const expectedStatus = decision === "ACCEPT" ? "ACCEPTED" : "TRIAGED";
  if (
    referralId !== offer.referralId ||
    matchId !== offer.matchId ||
    value.currentStatus !== expectedStatus ||
    !strictRowVersion(value.rowVersion) ||
    value.rowVersion !== offer.rowVersion + 1 ||
    !updatedAt
  ) {
    return undefined;
  }
  return Object.freeze({
    referralId,
    matchId,
    currentStatus: expectedStatus,
    rowVersion: value.rowVersion as number,
    updatedAt,
  });
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function strictUuid(value: unknown) {
  const canonical = canonicalPortalReferralUuid(value);
  return canonical && canonical === value ? canonical : undefined;
}

function strictExpectedVersion(value: unknown) {
  return Number.isSafeInteger(value) &&
    (value as number) >= 1 &&
    (value as number) < Number.MAX_SAFE_INTEGER
    ? (value as number)
    : undefined;
}

function strictRowVersion(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 1
    ? (value as number)
    : undefined;
}

function strictUtcInstant(value: unknown) {
  if (typeof value !== "string") return undefined;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value
    ? value
    : undefined;
}

function strictRegion(value: unknown) {
  return typeof value === "string" &&
    PORTAL_REFERRAL_UI_REGION_CODES.includes(
      value as PortalReferralProviderOfferRegion,
    )
    ? (value as PortalReferralProviderOfferRegion)
    : undefined;
}

function strictService(value: unknown) {
  return typeof value === "string" &&
    PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
      value as PortalReferralProviderOfferService,
    )
    ? (value as PortalReferralProviderOfferService)
    : undefined;
}

function strictProviderOfferStatus(value: unknown) {
  return typeof value === "string" &&
    (PROVIDER_OFFER_STATUSES as readonly string[]).includes(value)
    ? (value as PortalReferralProviderOfferStatus)
    : undefined;
}

function strictProviderCurrentStatus(value: unknown) {
  return typeof value === "string" &&
    (value === "OFFERED" ||
      (ACCEPTED_PROVIDER_REFERRAL_STATUSES as readonly string[]).includes(value))
    ? (value as PortalReferralProviderCurrentStatus)
    : undefined;
}

function failureCodeForStatus(
  status: number,
): PortalReferralProviderResponseFailureCode {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 501 || status === 503) return "CAPABILITY_DISABLED";
  return "REQUEST_FAILED";
}

function disabledResult() {
  return { ok: false, code: "CAPABILITY_DISABLED" } as const;
}

function requestFailedResult() {
  return { ok: false, code: "REQUEST_FAILED" } as const;
}

function failureResult(status: number) {
  return { ok: false, code: failureCodeForStatus(status) } as const;
}

function providerResponseFailureMessage(
  code: PortalReferralProviderResponseFailureCode,
) {
  if (code === "AUTH_REQUIRED") return "Sign in again to continue.";
  if (code === "FORBIDDEN") {
    return "Referral offers are not available to the current account.";
  }
  if (code === "NOT_FOUND") {
    return "That referral offer is no longer available.";
  }
  if (code === "CAPABILITY_DISABLED") {
    return "Preview provider response runtime is unavailable.";
  }
  if (code === "CONFLICT") {
    return "The referral offer changed. Refresh the authorized list.";
  }
  return "Authorized provider offers could not be loaded.";
}

function createProviderResponseMutationId(decision: "ACCEPT" | "DECLINE") {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal.provider-response.${decision.toLowerCase()}:${randomPart}`;
}

const REGION_LABELS: Record<PortalReferralProviderOfferRegion, string> = {
  VIC_MELBOURNE: "Melbourne / 墨尔本",
  VIC_GEELONG: "Geelong / 吉朗",
  VIC_REGIONAL: "Regional Victoria / 维州地区",
};

const SERVICE_LABELS: Record<PortalReferralProviderOfferService, string> = {
  SUPPORT_COORDINATION: "Support coordination / 支持协调",
  DAILY_LIVING_SUPPORT: "Daily living support / 日常生活支持",
  COMMUNITY_PARTICIPATION: "Community participation / 社区参与",
};

function displayRegion(region: PortalReferralProviderOfferRegion) {
  return REGION_LABELS[region];
}

function displayService(service: PortalReferralProviderOfferService) {
  return SERVICE_LABELS[service];
}
