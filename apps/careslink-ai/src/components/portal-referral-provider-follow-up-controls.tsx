"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";

import { canonicalPortalReferralUuid } from "../lib/portal-referral-id";
import {
  PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES,
  PORTAL_REFERRAL_UI_REGION_CODES,
  PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES,
  createPortalReferralMutationRequest,
  type PortalReferralMutation,
} from "./portal-referral-workflow-controls";
import { Card } from "./ui";

export const PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES =
  PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES;
export const PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_REQUEST_TIMEOUT_MS = 10_000;
export const PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS = 50;

const PROVIDER_FOLLOW_UP_STATUSES = ["ACCEPTED", "IN_PROGRESS"] as const;
const SUPABASE_AUTH_STORAGE_KEY_PATTERN =
  /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

type PortalReferralProviderFollowUpStatus =
  (typeof PROVIDER_FOLLOW_UP_STATUSES)[number];
type PortalReferralProviderFollowUpRegion =
  (typeof PORTAL_REFERRAL_UI_REGION_CODES)[number];
type PortalReferralProviderFollowUpService =
  (typeof PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES)[number];
type PortalReferralProviderFollowUpOutcomeCode =
  (typeof PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES)[number];
type PortalReferralProviderFollowUpMutation = Extract<
  PortalReferralMutation,
  { kind: "RECORD_FOLLOW_UP" }
>;

export type PortalReferralProviderFollowUpFailureCode =
  | "CAPABILITY_DISABLED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REQUEST_FAILED";

export type PortalReferralProviderFollowUpDetail = Readonly<{
  referralId: string;
  summary: string;
  region: PortalReferralProviderFollowUpRegion;
  serviceType: PortalReferralProviderFollowUpService;
  currentStatus: PortalReferralProviderFollowUpStatus;
  rowVersion: number;
  contact: Readonly<{
    name: string;
    phone: string;
    email: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}>;

export type PortalReferralProviderFollowUpDetailResult =
  | Readonly<{ ok: true; detail: PortalReferralProviderFollowUpDetail }>
  | Readonly<{ ok: false; code: PortalReferralProviderFollowUpFailureCode }>;

export type PortalReferralProviderFollowUpAck = Readonly<{
  referralId: string;
  matchId: null;
  currentStatus: "IN_PROGRESS";
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralProviderFollowUpResult =
  | Readonly<{ ok: true; ack: PortalReferralProviderFollowUpAck }>
  | Readonly<{ ok: false; code: PortalReferralProviderFollowUpFailureCode }>;

type PortalReferralProviderFollowUpUncertainAttempt = Readonly<{
  snapshot: PortalReferralProviderFollowUpWritableSnapshot;
  outcomeCode: PortalReferralProviderFollowUpOutcomeCode;
  idempotencyKey: string;
}>;

type PortalReferralProviderFollowUpWritableSnapshot = Readonly<
  Pick<
    PortalReferralProviderFollowUpDetail,
    "referralId" | "currentStatus" | "rowVersion"
  >
>;

type PortalReferralProviderFollowUpBoundDetailResult = Readonly<{
  resourceId: string;
  authorizationEpoch: number;
  result: PortalReferralProviderFollowUpDetailResult;
}>;

type PortalReferralProviderFollowUpPendingAttempt = Readonly<{
  resourceId: string;
  token: PortalReferralProviderFollowUpRequestToken;
}>;

type PortalReferralProviderFollowUpBoundMutationResult = Readonly<{
  resourceId: string;
  result: PortalReferralProviderFollowUpResult;
}>;

type PortalReferralProviderFollowUpInFlightSubmit = {
  readonly resourceId: string;
  readonly request: Promise<PortalReferralProviderFollowUpResult>;
  readonly token: PortalReferralProviderFollowUpRequestToken;
  readonly authorizationEpoch: number;
  attempt: PortalReferralProviderFollowUpUncertainAttempt | undefined;
};

type PortalReferralProviderFollowUpInFlightRefresh = Readonly<{
  resourceId: string;
  authorizationEpoch: number;
  request: Promise<PortalReferralProviderFollowUpDetailResult>;
}>;

type PortalReferralProviderFollowUpLifecycleJob = Readonly<{
  resourceId: string;
  authorizationEpoch: number;
  generation: number;
  refresh: () => Promise<PortalReferralProviderFollowUpDetailResult | undefined>;
}>;

type PortalReferralProviderFollowUpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export type PortalReferralProviderFollowUpRequestToken = Readonly<{
  resourceId: string;
  generation: number;
}>;

export function createPortalReferralProviderFollowUpRequestTracker() {
  let generation = 0;
  let resourceId: string | undefined;

  return Object.freeze({
    begin(resource: string): PortalReferralProviderFollowUpRequestToken {
      resourceId = resource;
      generation += 1;
      return Object.freeze({ resourceId, generation });
    },
    isCurrent(token: PortalReferralProviderFollowUpRequestToken) {
      return token.resourceId === resourceId && token.generation === generation;
    },
    invalidate() {
      resourceId = undefined;
      generation += 1;
    },
  });
}

async function runPortalReferralProviderFollowUpRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error("Portal referral provider follow-up request timed out"));
    }, PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export async function loadPortalReferralProviderFollowUpDetail({
  enabled = false,
  referralId,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
  fetcher?: PortalReferralProviderFollowUpFetch;
}>): Promise<PortalReferralProviderFollowUpDetailResult> {
  if (!enabled) return disabledResult();
  const canonicalReferralId = strictUuid(referralId);
  if (!canonicalReferralId) return { ok: false, code: "NOT_FOUND" };

  try {
    return await runPortalReferralProviderFollowUpRequest(async (signal) => {
      const response = await fetcher(
        `/api/portal/provider-referrals/${canonicalReferralId}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" },
          signal,
        },
      );
      if (!response.ok) return failureResult(response.status);
      const detail = parseProviderFollowUpDetailEnvelope(await response.json());
      if (!detail || detail.referralId !== canonicalReferralId) {
        return requestFailedResult();
      }
      return { ok: true as const, detail };
    });
  } catch {
    return requestFailedResult();
  }
}

export async function submitPortalReferralProviderFollowUp({
  enabled = false,
  detail,
  outcomeCode,
  idempotencyKey,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  detail: PortalReferralProviderFollowUpDetail;
  outcomeCode: PortalReferralProviderFollowUpOutcomeCode;
  idempotencyKey: string;
  fetcher?: PortalReferralProviderFollowUpFetch;
}>): Promise<PortalReferralProviderFollowUpResult> {
  if (!enabled) return disabledResult();
  if (
    !strictUuid(detail.referralId) ||
    !strictExpectedVersion(detail.rowVersion) ||
    !(PROVIDER_FOLLOW_UP_STATUSES as readonly string[]).includes(
      detail.currentStatus,
    ) ||
    !(PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES as readonly string[]).includes(
      outcomeCode,
    )
  ) {
    return requestFailedResult();
  }

  const mutation: PortalReferralProviderFollowUpMutation = {
    kind: "RECORD_FOLLOW_UP",
    referralId: detail.referralId,
    expectedVersion: detail.rowVersion,
    outcomeCode,
  };
  let request: ReturnType<typeof createPortalReferralMutationRequest>;
  try {
    request = createPortalReferralMutationRequest(mutation, idempotencyKey);
  } catch {
    return requestFailedResult();
  }

  try {
    return await runPortalReferralProviderFollowUpRequest(async (signal) => {
      const response = await fetcher(request.url, { ...request.init, signal });
      if (!response.ok) {
        // Error bodies may echo private participant information.
        return failureResult(response.status);
      }
      const ack = parseProviderFollowUpAck(await response.json(), detail);
      return ack ? { ok: true as const, ack } : requestFailedResult();
    });
  } catch {
    return requestFailedResult();
  }
}

export function portalReferralProviderFollowUpRequiresAuthoritativeRefresh(
  result: PortalReferralProviderFollowUpResult,
) {
  return (
    result.ok ||
    result.code === "NOT_FOUND" ||
    result.code === "CONFLICT" ||
    result.code === "REQUEST_FAILED"
  );
}

export function portalReferralProviderFollowUpClearsDetail(
  result: PortalReferralProviderFollowUpResult,
) {
  return (
    !result.ok &&
    (result.code === "AUTH_REQUIRED" ||
      result.code === "FORBIDDEN" ||
      result.code === "CAPABILITY_DISABLED")
  );
}

export function PortalReferralProviderFollowUpCoordinator({
  enabled = false,
  referralId,
}: Readonly<{ enabled?: boolean; referralId: string }>) {
  const authorizationEpochRef = useRef(0);
  const [renderedAuthorizationEpoch, setRenderedAuthorizationEpoch] =
    useState(0);
  const [boundDetailResult, setBoundDetailResult] =
    useState<PortalReferralProviderFollowUpBoundDetailResult>();
  const detailResult =
    boundDetailResult?.resourceId === referralId &&
    boundDetailResult.authorizationEpoch === renderedAuthorizationEpoch
      ? boundDetailResult.result
      : undefined;
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAttempts, setPendingAttempts] = useState<
    ReadonlyMap<string, PortalReferralProviderFollowUpPendingAttempt>
  >(() => new Map());
  const [boundMutationResult, setBoundMutationResult] =
    useState<PortalReferralProviderFollowUpBoundMutationResult>();
  const mutationResult =
    boundMutationResult?.resourceId === referralId
      ? boundMutationResult.result
      : undefined;
  const [storedUncertainAttempt, setUncertainAttempt] =
    useState<PortalReferralProviderFollowUpUncertainAttempt>();
  const uncertainAttempt =
    storedUncertainAttempt?.snapshot.referralId === referralId
      ? storedUncertainAttempt
      : undefined;
  const uncertainAttemptRef = useRef<
    PortalReferralProviderFollowUpUncertainAttempt | undefined
  >(undefined);
  const detailTrackerRef = useRef<ReturnType<
    typeof createPortalReferralProviderFollowUpRequestTracker
  > | null>(null);
  const mutationTrackerRef = useRef<ReturnType<
    typeof createPortalReferralProviderFollowUpRequestTracker
  > | null>(null);
  const inFlightRefreshRef =
    useRef<PortalReferralProviderFollowUpInFlightRefresh | undefined>(undefined);
  const inFlightSubmitRegistryRef = useRef(
    new Map<string, PortalReferralProviderFollowUpInFlightSubmit>(),
  );
  const pendingAttempt = pendingAttempts.get(referralId);
  const pendingOutcome = pendingAttempt !== undefined;
  const committedResourceRef = useRef<string | undefined>(undefined);
  const lifecycleActiveResourceRef = useRef<string | undefined>(undefined);
  const lifecycleQueuedJobRef =
    useRef<PortalReferralProviderFollowUpLifecycleJob | undefined>(undefined);
  const lifecycleWorkerGenerationRef = useRef(0);
  const lifecycleRunningRef = useRef(false);
  const lifecycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workbenchHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const mutationNoticeRef = useRef<HTMLParagraphElement>(null);
  const signInLinkRef = useRef<HTMLAnchorElement>(null);
  const focusRequestedRef = useRef(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const formId = useId();

  if (detailTrackerRef.current == null) {
    detailTrackerRef.current = createPortalReferralProviderFollowUpRequestTracker();
  }
  if (mutationTrackerRef.current == null) {
    mutationTrackerRef.current =
      createPortalReferralProviderFollowUpRequestTracker();
  }

  const advanceAuthorizationEpoch = useCallback(() => {
    authorizationEpochRef.current += 1;
    setRenderedAuthorizationEpoch(authorizationEpochRef.current);
    for (const entry of inFlightSubmitRegistryRef.current.values()) {
      if (entry.authorizationEpoch !== authorizationEpochRef.current) {
        // The client has no principal fingerprint. Keep only the generic
        // per-resource block after an authorization boundary, never the old
        // actor-scoped command or idempotency key.
        entry.attempt = undefined;
      }
    }
    return authorizationEpochRef.current;
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      committedResourceRef.current = undefined;
      return;
    }
    committedResourceRef.current = referralId;
    return () => {
      if (committedResourceRef.current === referralId) {
        committedResourceRef.current = undefined;
      }
    };
  }, [enabled, referralId]);

  const commitLoadedDetail = useCallback(
    (
      resourceId: string,
      loaded: PortalReferralProviderFollowUpDetailResult,
    ) => {
      if (loaded.ok) {
        const candidate = uncertainAttemptRef.current;
        if (candidate) {
          if (sameWritableSnapshot(candidate.snapshot, loaded.detail)) {
            setUncertainAttempt(candidate);
            setBoundMutationResult({
              resourceId,
              result: { ok: false, code: "REQUEST_FAILED" },
            });
          } else {
            uncertainAttemptRef.current = undefined;
            setUncertainAttempt(undefined);
            setBoundMutationResult((current) =>
              current?.resourceId === candidate.snapshot.referralId &&
              !current.result.ok &&
              current.result.code === "REQUEST_FAILED"
                ? undefined
                : current,
            );
          }
        }
      } else {
        // A failed authoritative read cannot prove that the prior principal
        // still owns either the private projection or its replay key.
        uncertainAttemptRef.current = undefined;
        setUncertainAttempt(undefined);
        setBoundMutationResult((current) =>
          current?.resourceId === resourceId ? undefined : current,
        );
      }
      setBoundDetailResult({
        resourceId,
        authorizationEpoch: authorizationEpochRef.current,
        result: loaded,
      });
      setRefreshing(false);
    },
    [],
  );

  const refreshDetail = useCallback(
    async ({ clear = true }: Readonly<{ clear?: boolean }> = {}) => {
      const tracker = detailTrackerRef.current;
      if (!enabled || !tracker) return;
      const authorizationEpoch = authorizationEpochRef.current;
      const token = tracker.begin(referralId);
      if (clear) setBoundDetailResult(undefined);
      setRefreshing(true);
      const request = loadPortalReferralProviderFollowUpDetail({
        enabled,
        referralId,
      });
      inFlightRefreshRef.current = {
        resourceId: referralId,
        authorizationEpoch,
        request,
      };
      const loaded = await request;
      if (inFlightRefreshRef.current?.request === request) {
        inFlightRefreshRef.current = undefined;
      }
      if (
        !tracker.isCurrent(token) ||
        committedResourceRef.current !== referralId ||
        authorizationEpochRef.current !== authorizationEpoch
      ) {
        return;
      }
      commitLoadedDetail(referralId, loaded);
      return loaded;
    },
    [commitLoadedDetail, enabled, referralId],
  );

  const lifecycleJobIsCurrent = useCallback(
    (job: PortalReferralProviderFollowUpLifecycleJob) =>
      lifecycleActiveResourceRef.current === job.resourceId &&
      authorizationEpochRef.current === job.authorizationEpoch &&
      lifecycleWorkerGenerationRef.current === job.generation,
    [],
  );

  const reauthorizeAfterBrowserLifecycleEvent = useCallback(() => {
    if (
      !enabled ||
      lifecycleActiveResourceRef.current !== referralId
    ) {
      return;
    }

    const authorizationEpoch = advanceAuthorizationEpoch();
    lifecycleWorkerGenerationRef.current += 1;
    const job: PortalReferralProviderFollowUpLifecycleJob = {
      resourceId: referralId,
      authorizationEpoch,
      generation: lifecycleWorkerGenerationRef.current,
      refresh: refreshDetail,
    };
    detailTrackerRef.current?.invalidate();
    mutationTrackerRef.current?.invalidate();
    uncertainAttemptRef.current = undefined;
    setBoundDetailResult(undefined);
    setBoundMutationResult(undefined);
    setUncertainAttempt(undefined);
    setRefreshing(true);

    lifecycleQueuedJobRef.current = job;
    if (lifecycleRunningRef.current) return;
    if (lifecycleTimerRef.current !== null) {
      globalThis.clearTimeout(lifecycleTimerRef.current);
    }
    lifecycleTimerRef.current = globalThis.setTimeout(() => {
      lifecycleTimerRef.current = null;
      if (lifecycleRunningRef.current) return;

      lifecycleRunningRef.current = true;
      void (async () => {
        try {
          while (lifecycleQueuedJobRef.current) {
            const queuedJob = lifecycleQueuedJobRef.current;
            lifecycleQueuedJobRef.current = undefined;
            if (!lifecycleJobIsCurrent(queuedJob)) continue;

            const inFlightSubmit =
              inFlightSubmitRegistryRef.current.get(queuedJob.resourceId)
                ?.request;
            if (inFlightSubmit) {
              await inFlightSubmit;
              if (!lifecycleJobIsCurrent(queuedJob)) continue;
            }
            const inFlightRefresh =
              inFlightRefreshRef.current?.resourceId === queuedJob.resourceId &&
              inFlightRefreshRef.current.authorizationEpoch ===
                queuedJob.authorizationEpoch
                ? inFlightRefreshRef.current.request
                : undefined;
            if (inFlightRefresh) {
              await inFlightRefresh;
              if (!lifecycleJobIsCurrent(queuedJob)) continue;
              // The current-epoch authoritative read already satisfies this
              // lifecycle job; do not issue a duplicate private projection.
              continue;
            }
            if (!lifecycleJobIsCurrent(queuedJob)) continue;
            await queuedJob.refresh();
            if (!lifecycleJobIsCurrent(queuedJob)) continue;
          }
        } finally {
          lifecycleRunningRef.current = false;
        }
      })();
    }, PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS);
  }, [
    advanceAuthorizationEpoch,
    enabled,
    lifecycleJobIsCurrent,
    referralId,
    refreshDetail,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const detailTracker = detailTrackerRef.current;
    const mutationTracker = mutationTrackerRef.current;
    if (!detailTracker) return;
    const authorizationEpoch = advanceAuthorizationEpoch();
    setBoundMutationResult(undefined);
    uncertainAttemptRef.current = undefined;
    setUncertainAttempt(undefined);
    const token = detailTracker.begin(referralId);
    setBoundDetailResult(undefined);
    setRefreshing(true);
    const request = loadPortalReferralProviderFollowUpDetail({
      enabled,
      referralId,
    });
    inFlightRefreshRef.current = {
      resourceId: referralId,
      authorizationEpoch,
      request,
    };
    void request.then((loaded) => {
      if (inFlightRefreshRef.current?.request === request) {
        inFlightRefreshRef.current = undefined;
      }
      if (
        !detailTracker.isCurrent(token) ||
        committedResourceRef.current !== referralId ||
        authorizationEpochRef.current !== authorizationEpoch
      ) {
        return;
      }
      commitLoadedDetail(referralId, loaded);
    });
    return () => {
      detailTracker.invalidate();
      mutationTracker?.invalidate();
    };
  }, [advanceAuthorizationEpoch, commitLoadedDetail, enabled, referralId]);

  useEffect(() => {
    if (!enabled) return;
    lifecycleActiveResourceRef.current = referralId;
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
      if (lifecycleActiveResourceRef.current === referralId) {
        lifecycleActiveResourceRef.current = undefined;
      }
      advanceAuthorizationEpoch();
      lifecycleWorkerGenerationRef.current += 1;
      if (lifecycleQueuedJobRef.current?.resourceId === referralId) {
        lifecycleQueuedJobRef.current = undefined;
      }
      if (lifecycleTimerRef.current !== null) {
        globalThis.clearTimeout(lifecycleTimerRef.current);
        lifecycleTimerRef.current = null;
      }
      window.removeEventListener("focus", reauthorizeAfterBrowserLifecycleEvent);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    advanceAuthorizationEpoch,
    enabled,
    reauthorizeAfterBrowserLifecycleEvent,
    referralId,
  ]);

  useEffect(() => {
    if (focusVersion === 0 || !focusRequestedRef.current) return;
    focusRequestedRef.current = false;
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement &&
      activeElement.isConnected
    ) {
      return;
    }
    const target =
      signInLinkRef.current ??
      mutationNoticeRef.current ??
      detailHeadingRef.current ??
      workbenchHeadingRef.current;
    target?.focus();
  }, [focusVersion]);

  function scheduleCompletionFocus() {
    focusRequestedRef.current = true;
    setFocusVersion((current) => current + 1);
  }

  function releaseInFlightSubmit(
    entry: PortalReferralProviderFollowUpInFlightSubmit,
  ) {
    if (
      inFlightSubmitRegistryRef.current.get(entry.resourceId) !== entry
    ) {
      return;
    }
    inFlightSubmitRegistryRef.current.delete(entry.resourceId);
    setPendingAttempts((current) =>
      withoutExactPendingAttempt(current, entry.resourceId, entry.token),
    );
  }

  async function recordFollowUp(
    detail: PortalReferralProviderFollowUpDetail,
    outcomeCode: PortalReferralProviderFollowUpOutcomeCode,
    replayIdempotencyKey?: string,
  ) {
    const isExactUncertainReplay = Boolean(
      replayIdempotencyKey &&
        uncertainAttempt &&
        replayIdempotencyKey === uncertainAttempt.idempotencyKey &&
        outcomeCode === uncertainAttempt.outcomeCode &&
        sameWritableSnapshot(detail, uncertainAttempt.snapshot),
    );
    if (
      pendingOutcome ||
      inFlightSubmitRegistryRef.current.has(detail.referralId) ||
      inFlightRefreshRef.current?.resourceId === detail.referralId ||
      refreshing ||
      (uncertainAttempt && !isExactUncertainReplay) ||
      !strictExpectedVersion(detail.rowVersion) ||
      !(PROVIDER_FOLLOW_UP_STATUSES as readonly string[]).includes(
        detail.currentStatus,
      )
    ) {
      return;
    }
    const tracker = mutationTrackerRef.current;
    if (!tracker) return;
    const token = tracker.begin(detail.referralId);
    const pending = {
      resourceId: detail.referralId,
      token,
    } as const;
    setPendingAttempts((current) => {
      const next = new Map(current);
      next.set(detail.referralId, pending);
      return next;
    });
    setBoundMutationResult((current) =>
      current?.resourceId === detail.referralId ? undefined : current,
    );
    const idempotencyKey =
      replayIdempotencyKey ?? createProviderFollowUpMutationId();
    const attempt = {
      snapshot: providerFollowUpWritableSnapshot(detail),
      outcomeCode,
      idempotencyKey,
    } as const;
    const authorizationEpoch = authorizationEpochRef.current;
    const submit = submitPortalReferralProviderFollowUp({
      enabled,
      detail,
      outcomeCode,
      idempotencyKey,
    });
    const entry: PortalReferralProviderFollowUpInFlightSubmit = {
      resourceId: detail.referralId,
      request: submit,
      token,
      authorizationEpoch,
      attempt,
    };
    inFlightSubmitRegistryRef.current.set(detail.referralId, entry);
    const result = await submit;
    if (inFlightSubmitRegistryRef.current.get(detail.referralId) !== entry) {
      return;
    }

    const completionCanApply =
      tracker.isCurrent(token) &&
      committedResourceRef.current === entry.resourceId &&
      authorizationEpochRef.current === entry.authorizationEpoch;
    if (!completionCanApply) {
      if (committedResourceRef.current !== entry.resourceId) {
        releaseInFlightSubmit(entry);
        return;
      }

      const replayCandidate =
        authorizationEpochRef.current === entry.authorizationEpoch &&
        !result.ok &&
        result.code === "REQUEST_FAILED"
          ? entry.attempt
          : undefined;
      uncertainAttemptRef.current = replayCandidate;
      setUncertainAttempt(undefined);
      setBoundMutationResult((current) =>
        current?.resourceId === entry.resourceId ? undefined : current,
      );
      const queuedLifecycleJob = lifecycleQueuedJobRef.current;
      if (
        queuedLifecycleJob?.resourceId === entry.resourceId &&
        queuedLifecycleJob.authorizationEpoch === authorizationEpochRef.current
      ) {
        // This reconciliation is the queued lifecycle authorization read.
        // Consume the queued job so its debounce cannot duplicate the GET.
        lifecycleQueuedJobRef.current = undefined;
      }

      try {
        // A stale completion can only release the per-resource block after a
        // new authoritative read. The GET clears old private detail first.
        // Exact replay survives only inside the same authorization epoch.
        await refreshDetail();
      } finally {
        if (authorizationEpochRef.current !== entry.authorizationEpoch) {
          uncertainAttemptRef.current = undefined;
          setUncertainAttempt(undefined);
        }
        releaseInFlightSubmit(entry);
      }
      return;
    }

    const replayCandidate = entry.attempt;
    if (
      replayCandidate &&
      !result.ok &&
      result.code === "REQUEST_FAILED"
    ) {
      uncertainAttemptRef.current = replayCandidate;
    } else {
      uncertainAttemptRef.current = undefined;
    }
    setBoundMutationResult({ resourceId: detail.referralId, result });
    if (
      replayCandidate &&
      !result.ok &&
      result.code === "REQUEST_FAILED"
    ) {
      setUncertainAttempt(replayCandidate);
    } else {
      setUncertainAttempt(undefined);
    }
    scheduleCompletionFocus();

    try {
      if (portalReferralProviderFollowUpRequiresAuthoritativeRefresh(result)) {
        await refreshDetail();
      } else if (!result.ok && portalReferralProviderFollowUpClearsDetail(result)) {
        detailTrackerRef.current?.invalidate();
        setRefreshing(false);
        setBoundDetailResult({
          resourceId: referralId,
          authorizationEpoch: entry.authorizationEpoch,
          result: { ok: false, code: result.code },
        });
      }
    } finally {
      releaseInFlightSubmit(entry);
      if (
        committedResourceRef.current === entry.resourceId &&
        authorizationEpochRef.current === entry.authorizationEpoch
      ) {
        scheduleCompletionFocus();
      }
    }
  }

  function submitSelectedOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailResult?.ok) return;
    const formData = new FormData(event.currentTarget);
    const outcome = formData.get("outcomeCode");
    if (
      typeof outcome !== "string" ||
      !(PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES as readonly string[]).includes(
        outcome,
      )
    ) {
      return;
    }
    void recordFollowUp(
      detailResult.detail,
      outcome as PortalReferralProviderFollowUpOutcomeCode,
    );
  }

  function manuallyRefresh() {
    if (
      pendingOutcome ||
      inFlightSubmitRegistryRef.current.has(referralId) ||
      inFlightRefreshRef.current?.resourceId === referralId ||
      refreshing ||
      !detailResult
    ) {
      return;
    }
    mutationTrackerRef.current?.invalidate();
    uncertainAttemptRef.current = undefined;
    setUncertainAttempt(undefined);
    setBoundMutationResult((current) =>
      current?.resourceId === referralId ? undefined : current,
    );
    void refreshDetail({ clear: false });
  }

  if (!enabled) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5d6d68]">
          Preview provider follow-up runtime is disabled. No private referral
          request is sent.
        </p>
      </Card>
    );
  }

  const controlsBusy = Boolean(pendingOutcome) || refreshing || !detailResult;

  return (
    <section aria-label="Authorized provider referral follow-up" className="grid gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              Provider follow-up M1c
            </p>
            <h2
              ref={workbenchHeadingRef}
              tabIndex={-1}
              className="mt-2 text-lg font-semibold"
            >
              Authorized referral follow-up / 已授权跟进
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
              Record one fixed outcome, then re-read the authorized referral.
            </p>
          </div>
          <button
            type="button"
            disabled={controlsBusy}
            className="taito-secondary px-3"
            onClick={manuallyRefresh}
          >
            {refreshing ? "Refreshing…" : "Refresh detail / 刷新详情"}
          </button>
        </div>
      </Card>

      {!detailResult ? (
        <Card className="p-5">
          <p aria-live="polite" className="text-sm text-[#5d6d68]">
            Loading authorized referral detail…
          </p>
        </Card>
      ) : !detailResult.ok ? (
        <Card className="grid gap-3 p-5">
          <p aria-live="polite" className="text-sm text-[#7a4b00]">
            {providerFollowUpFailureMessage(detailResult.code)}
          </p>
          {detailResult.code === "AUTH_REQUIRED" ? (
            <a
              ref={signInLinkRef}
              href={providerFollowUpSignInHref(referralId)}
              className="taito-secondary w-fit px-3"
            >
              Sign in again / 重新登录
            </a>
          ) : detailResult.code === "REQUEST_FAILED" ||
            detailResult.code === "CONFLICT" ? (
            <button
              type="button"
              disabled={controlsBusy}
              className="taito-secondary w-fit px-3"
              onClick={manuallyRefresh}
            >
              Retry detail / 重试详情
            </button>
          ) : null}
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                ref={detailHeadingRef}
                tabIndex={-1}
                className="text-lg font-semibold text-[#263834]"
              >
                {detailResult.detail.summary}
              </h3>
              <p className="mt-2 text-sm text-[#5d6d68]">
                {displayRegion(detailResult.detail.region)} ·{" "}
                {displayService(detailResult.detail.serviceType)}
              </p>
              <p className="mt-1 text-sm text-[#5d6d68]">
                Status {detailResult.detail.currentStatus} · Version{" "}
                {detailResult.detail.rowVersion}
              </p>
            </div>
            <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
              ACCEPTED PROVIDER
            </span>
          </div>

          <dl className="mt-5 grid gap-3 rounded-lg bg-[#f7faf8] p-4 sm:grid-cols-2">
            <PrivateDetail label="Contact name" value={detailResult.detail.contact.name} />
            <PrivateDetail label="Phone" value={detailResult.detail.contact.phone} />
            <PrivateDetail
              label="Email"
              value={detailResult.detail.contact.email ?? "Not provided"}
            />
            <PrivateDetail label="Last updated" value={detailResult.detail.updatedAt} />
          </dl>

          {uncertainAttempt ? (
            <div className="mt-5 grid gap-2 rounded-lg border border-[#d9c69b] bg-[#fffaf0] p-4">
              <p className="text-sm text-[#7a4b00]">
                The follow-up outcome is uncertain. Retry sends the exact same
                command and idempotency key.
              </p>
              <button
                type="button"
                disabled={controlsBusy}
                className="taito-secondary w-fit px-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() =>
                  void recordFollowUp(
                    detailResult.detail,
                    uncertainAttempt.outcomeCode,
                    uncertainAttempt.idempotencyKey,
                  )
                }
              >
                {pendingOutcome
                  ? "Reconciling…"
                  : "Retry same follow-up / 重试同一跟进"}
              </button>
            </div>
          ) : (
            <form className="mt-5 grid gap-3" onSubmit={submitSelectedOutcome}>
              <label htmlFor={`${formId}-outcome`} className="text-sm font-semibold">
                Follow-up outcome / 跟进结果
              </label>
              <select
                id={`${formId}-outcome`}
                name="outcomeCode"
                disabled={controlsBusy}
                className="min-h-11 rounded-md border border-[#cbd7d0] bg-white px-3 text-sm"
                defaultValue="CONTACT_CONFIRMED"
              >
                {PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES.map((code) => (
                  <option key={code} value={code}>
                    {FOLLOW_UP_LABELS[code]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={controlsBusy}
                className="taito-primary w-fit px-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingOutcome
                  ? "Recording…"
                  : "Record follow-up / 记录跟进"}
              </button>
            </form>
          )}
        </Card>
      )}

      <ProviderFollowUpMutationNotice
        focusRef={mutationNoticeRef}
        refreshing={refreshing}
        result={mutationResult}
      />
    </section>
  );
}

function PrivateDetail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[#66736f]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-[#263834]">{value}</dd>
    </div>
  );
}

function ProviderFollowUpMutationNotice({
  focusRef,
  refreshing,
  result,
}: Readonly<{
  focusRef: RefObject<HTMLParagraphElement | null>;
  refreshing: boolean;
  result: PortalReferralProviderFollowUpResult | undefined;
}>) {
  if (!result) return null;
  const message = result.ok
    ? refreshing
      ? "Follow-up recorded. Refreshing authorized referral detail."
      : "Follow-up recorded. Authorized referral detail was refreshed."
    : result.code === "CONFLICT"
      ? "The referral changed. Authorized detail was refreshed."
      : result.code === "NOT_FOUND"
        ? "That referral is no longer available. Authorized detail was refreshed."
        : result.code === "REQUEST_FAILED"
          ? "The follow-up outcome is uncertain. Refresh or retry the same follow-up to reconcile it."
          : providerFollowUpFailureMessage(result.code);
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

function parseProviderFollowUpDetailEnvelope(
  value: unknown,
): PortalReferralProviderFollowUpDetail | undefined {
  if (!hasExactKeys(value, ["referral"])) return undefined;
  const detail = value.referral;
  if (
    !hasExactKeys(detail, [
      "referralId",
      "summary",
      "region",
      "serviceType",
      "currentStatus",
      "rowVersion",
      "contact",
      "createdAt",
      "updatedAt",
    ]) ||
    !hasExactKeys(detail.contact, ["name", "phone", "email"])
  ) {
    return undefined;
  }

  const referralId = strictUuid(detail.referralId);
  const summary = strictBoundedText(detail.summary, 4_000);
  const contactName = strictBoundedText(detail.contact.name, 200);
  const contactPhone = strictBoundedText(detail.contact.phone, 100);
  const contactEmail =
    detail.contact.email === null
      ? null
      : strictBoundedText(detail.contact.email, 320);
  const createdAt = strictUtcInstant(detail.createdAt);
  const updatedAt = strictUtcInstant(detail.updatedAt);
  if (
    !referralId ||
    !summary ||
    !strictRegion(detail.region) ||
    !strictService(detail.serviceType) ||
    !strictProviderFollowUpStatus(detail.currentStatus) ||
    !strictRowVersion(detail.rowVersion) ||
    !contactName ||
    !contactPhone ||
    contactEmail === undefined ||
    !createdAt ||
    !updatedAt ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return undefined;
  }

  return Object.freeze({
    referralId,
    summary,
    region: detail.region as PortalReferralProviderFollowUpRegion,
    serviceType: detail.serviceType as PortalReferralProviderFollowUpService,
    currentStatus: detail.currentStatus as PortalReferralProviderFollowUpStatus,
    rowVersion: detail.rowVersion as number,
    contact: Object.freeze({
      name: contactName,
      phone: contactPhone,
      email: contactEmail,
    }),
    createdAt,
    updatedAt,
  });
}

function parseProviderFollowUpAck(
  value: unknown,
  detail: PortalReferralProviderFollowUpDetail,
): PortalReferralProviderFollowUpAck | undefined {
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
  const updatedAt = strictUtcInstant(value.updatedAt);
  if (
    referralId !== detail.referralId ||
    value.matchId !== null ||
    value.currentStatus !== "IN_PROGRESS" ||
    !strictRowVersion(value.rowVersion) ||
    value.rowVersion !== detail.rowVersion + 1 ||
    !updatedAt
  ) {
    return undefined;
  }
  return Object.freeze({
    referralId,
    matchId: null,
    currentStatus: "IN_PROGRESS",
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

function strictBoundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= maxLength
    ? normalized
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
      value as PortalReferralProviderFollowUpRegion,
    )
    ? (value as PortalReferralProviderFollowUpRegion)
    : undefined;
}

function strictService(value: unknown) {
  return typeof value === "string" &&
    PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
      value as PortalReferralProviderFollowUpService,
    )
    ? (value as PortalReferralProviderFollowUpService)
    : undefined;
}

function strictProviderFollowUpStatus(value: unknown) {
  return typeof value === "string" &&
    (PROVIDER_FOLLOW_UP_STATUSES as readonly string[]).includes(value)
    ? (value as PortalReferralProviderFollowUpStatus)
    : undefined;
}

function failureCodeForStatus(
  status: number,
): PortalReferralProviderFollowUpFailureCode {
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

function providerFollowUpFailureMessage(
  code: PortalReferralProviderFollowUpFailureCode,
) {
  if (code === "AUTH_REQUIRED") return "Sign in again to continue.";
  if (code === "FORBIDDEN" || code === "NOT_FOUND") {
    return "This referral is not available to the current account.";
  }
  if (code === "CAPABILITY_DISABLED") {
    return "Preview provider follow-up runtime is unavailable.";
  }
  if (code === "CONFLICT") {
    return "The referral changed. Refresh authorized detail before retrying.";
  }
  return "Authorized referral detail could not be loaded.";
}

function providerFollowUpSignInHref(referralId: string) {
  return `/auth/login?next=${encodeURIComponent(
    `/provider-portal/referrals/${referralId}`,
  )}`;
}

function createProviderFollowUpMutationId() {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal.provider-follow-up:${randomPart}`;
}

function sameWritableSnapshot(
  left: PortalReferralProviderFollowUpWritableSnapshot,
  right: PortalReferralProviderFollowUpWritableSnapshot,
) {
  return (
    left.referralId === right.referralId &&
    left.currentStatus === right.currentStatus &&
    left.rowVersion === right.rowVersion
  );
}

function providerFollowUpWritableSnapshot(
  detail: PortalReferralProviderFollowUpDetail,
): PortalReferralProviderFollowUpWritableSnapshot {
  return Object.freeze({
    referralId: detail.referralId,
    currentStatus: detail.currentStatus,
    rowVersion: detail.rowVersion,
  });
}

function withoutExactPendingAttempt(
  current: ReadonlyMap<string, PortalReferralProviderFollowUpPendingAttempt>,
  resourceId: string,
  token: PortalReferralProviderFollowUpRequestToken,
) {
  if (current.get(resourceId)?.token !== token) return current;
  const next = new Map(current);
  next.delete(resourceId);
  return next;
}

const REGION_LABELS: Record<PortalReferralProviderFollowUpRegion, string> = {
  VIC_MELBOURNE: "Melbourne / 墨尔本",
  VIC_GEELONG: "Geelong / 吉朗",
  VIC_REGIONAL: "Regional Victoria / 维州地区",
};

const SERVICE_LABELS: Record<PortalReferralProviderFollowUpService, string> = {
  SUPPORT_COORDINATION: "Support coordination / 支持协调",
  DAILY_LIVING_SUPPORT: "Daily living support / 日常生活支持",
  COMMUNITY_PARTICIPATION: "Community participation / 社区参与",
};

const FOLLOW_UP_LABELS: Record<PortalReferralProviderFollowUpOutcomeCode, string> = {
  CONTACT_CONFIRMED: "Contact confirmed / 已确认联系",
  INFORMATION_REQUESTED: "Information requested / 已请求资料",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled / 已安排跟进",
  SERVICE_COMMENCED: "Service commenced / 服务已开始",
  NO_RESPONSE: "No response / 暂无回应",
};

function displayRegion(region: PortalReferralProviderFollowUpRegion) {
  return REGION_LABELS[region];
}

function displayService(service: PortalReferralProviderFollowUpService) {
  return SERVICE_LABELS[service];
}
