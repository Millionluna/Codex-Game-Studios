"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { canonicalPortalReferralUuid } from "../lib/portal-referral-id";
import { Card } from "./ui";

import {
  PORTAL_REFERRAL_UI_REGION_CODES,
  PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES,
  createPortalReferralMutationRequest,
  type PortalReferralMutation,
  type PortalReferralMutationAck,
  type PortalReferralMutationResult,
} from "./portal-referral-workflow-controls";

const ASSIGNMENT_STATUSES = ["SUBMITTED", "TRIAGED", "OFFERED"] as const;
const MAX_ASSIGNMENT_ITEMS = 50;

type PortalReferralAssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
type PortalReferralAssignmentRegion =
  (typeof PORTAL_REFERRAL_UI_REGION_CODES)[number];
type PortalReferralAssignmentService =
  (typeof PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES)[number];
type PortalReferralAssignmentMutation = Extract<
  PortalReferralMutation,
  { kind: "TRIAGE_REFERRAL" | "OFFER_REFERRAL" }
>;

export type PortalReferralAssignmentFailureCode =
  | "CAPABILITY_DISABLED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REQUEST_FAILED";

export type PortalReferralAssignmentQueueItem = Readonly<{
  referralId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  region: PortalReferralAssignmentRegion;
  serviceType: PortalReferralAssignmentService;
  currentStatus: PortalReferralAssignmentStatus;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralAssignmentActiveOffer = Readonly<{
  matchId: string;
  providerId: string;
  displayName: string;
  offeredAt: string;
}>;

export type PortalReferralAssignmentDetail = Readonly<{
  referralId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  summary: string;
  region: PortalReferralAssignmentRegion;
  serviceType: PortalReferralAssignmentService;
  currentStatus: PortalReferralAssignmentStatus;
  rowVersion: number;
  contact: Readonly<{
    name: string;
    phone: string;
    email: string | null;
  }>;
  activeOffer: PortalReferralAssignmentActiveOffer | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PortalReferralAssignmentCandidate = Readonly<{
  providerId: string;
  displayName: string;
}>;

export type PortalReferralAssignmentQueueResult =
  | Readonly<{
      ok: true;
      items: readonly PortalReferralAssignmentQueueItem[];
    }>
  | Readonly<{ ok: false; code: PortalReferralAssignmentFailureCode }>;

export type PortalReferralAssignmentDetailResult =
  | Readonly<{ ok: true; detail: PortalReferralAssignmentDetail }>
  | Readonly<{ ok: false; code: PortalReferralAssignmentFailureCode }>;

export type PortalReferralAssignmentCandidatesResult =
  | Readonly<{
      ok: true;
      items: readonly PortalReferralAssignmentCandidate[];
    }>
  | Readonly<{ ok: false; code: PortalReferralAssignmentFailureCode }>;

type PortalReferralAssignmentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export type PortalReferralAssignmentIdentity = Readonly<{
  referralId: string;
  enabled: boolean;
}>;

export type PortalReferralAssignmentKeyedResult<T> = Readonly<{
  identity: PortalReferralAssignmentIdentity;
  result: T;
}>;

export type PortalReferralAssignmentRequestToken = Readonly<{
  resourceId: string;
  generation: number;
}>;

export function createPortalReferralAssignmentRequestTracker() {
  let generation = 0;
  let resourceId: string | undefined;

  return Object.freeze({
    begin(nextResourceId: string): PortalReferralAssignmentRequestToken {
      resourceId = nextResourceId;
      generation += 1;
      return Object.freeze({ resourceId, generation });
    },
    isCurrent(token: PortalReferralAssignmentRequestToken) {
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

export function selectPortalReferralAssignmentKeyedResult<T>(
  keyed: PortalReferralAssignmentKeyedResult<T> | undefined,
  identity: PortalReferralAssignmentIdentity,
) {
  return keyed?.identity === identity ? keyed.result : undefined;
}

export async function loadPortalReferralAssignmentQueue({
  enabled = false,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  fetcher?: PortalReferralAssignmentFetch;
}> = {}): Promise<PortalReferralAssignmentQueueResult> {
  if (!enabled) return disabledResult();

  try {
    const response = await fetcher("/api/portal/referral-assignments", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return failureResult(response.status);
    }
    const items = parseAssignmentQueueEnvelope(await response.json());
    return items ? { ok: true, items } : requestFailedResult();
  } catch {
    return requestFailedResult();
  }
}

export async function loadPortalReferralAssignmentDetail({
  enabled = false,
  referralId,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
  fetcher?: PortalReferralAssignmentFetch;
}>): Promise<PortalReferralAssignmentDetailResult> {
  if (!enabled) return disabledResult();
  const canonicalReferralId = strictUuid(referralId);
  if (!canonicalReferralId) return requestFailedResult();

  try {
    const response = await fetcher(
      `/api/portal/referral-assignments/${canonicalReferralId}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) {
      return failureResult(response.status);
    }
    const detail = parseAssignmentDetailEnvelope(await response.json());
    return detail?.referralId === canonicalReferralId
      ? { ok: true, detail }
      : requestFailedResult();
  } catch {
    return requestFailedResult();
  }
}

export async function loadPortalReferralAssignmentCandidates({
  enabled = false,
  referralId,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
  fetcher?: PortalReferralAssignmentFetch;
}>): Promise<PortalReferralAssignmentCandidatesResult> {
  if (!enabled) return disabledResult();
  const canonicalReferralId = strictUuid(referralId);
  if (!canonicalReferralId) return requestFailedResult();

  try {
    const response = await fetcher(
      `/api/portal/referrals/${canonicalReferralId}/candidates`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) {
      return failureResult(response.status);
    }
    const items = parseAssignmentCandidatesEnvelope(await response.json());
    return items ? { ok: true, items } : requestFailedResult();
  } catch {
    return requestFailedResult();
  }
}

export async function submitPortalReferralAssignmentMutation({
  enabled = false,
  mutation,
  idempotencyKey,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  mutation: PortalReferralAssignmentMutation;
  idempotencyKey: string;
  fetcher?: PortalReferralAssignmentFetch;
}>): Promise<PortalReferralMutationResult> {
  if (!enabled) return disabledResult();
  if (
    !strictUuid(mutation.referralId) ||
    !strictExpectedVersion(mutation.expectedVersion) ||
    (mutation.kind === "OFFER_REFERRAL" && !strictUuid(mutation.providerId))
  ) {
    return requestFailedResult();
  }

  let request: ReturnType<typeof createPortalReferralMutationRequest>;
  try {
    request = createPortalReferralMutationRequest(mutation, idempotencyKey);
  } catch {
    return requestFailedResult();
  }

  try {
    const response = await fetcher(request.url, request.init);
    if (!response.ok) {
      // Error bodies may contain private values or implementation detail.
      return failureResult(response.status);
    }
    const ack = parseAssignmentMutationAck(await response.json(), mutation);
    return ack ? { ok: true, ack } : requestFailedResult();
  } catch {
    return requestFailedResult();
  }
}

export function applyPortalReferralAssignmentMutationAck({
  detail,
  mutation,
  result,
  candidate,
}: Readonly<{
  detail: PortalReferralAssignmentDetail;
  mutation: PortalReferralAssignmentMutation;
  result: PortalReferralMutationResult;
  candidate?: PortalReferralAssignmentCandidate;
}>): PortalReferralAssignmentDetail | undefined {
  if (!result.ok) return undefined;
  const ack = parseAssignmentMutationAck(result.ack, mutation);
  if (
    !ack ||
    detail.referralId !== mutation.referralId ||
    Date.parse(ack.updatedAt) < Date.parse(detail.createdAt) ||
    Date.parse(ack.updatedAt) < Date.parse(detail.updatedAt)
  ) {
    return undefined;
  }

  if (mutation.kind === "TRIAGE_REFERRAL") {
    if (detail.currentStatus !== "SUBMITTED") return undefined;
    return Object.freeze({
      ...detail,
      currentStatus: "TRIAGED",
      rowVersion: ack.rowVersion,
      activeOffer: null,
      updatedAt: ack.updatedAt,
    });
  }

  if (
    detail.currentStatus !== "TRIAGED" ||
    !candidate ||
    candidate.providerId !== mutation.providerId ||
    !ack.matchId
  ) {
    return undefined;
  }
  return Object.freeze({
    ...detail,
    currentStatus: "OFFERED",
    rowVersion: ack.rowVersion,
    activeOffer: Object.freeze({
      matchId: ack.matchId,
      providerId: candidate.providerId,
      displayName: candidate.displayName,
      offeredAt: ack.updatedAt,
    }),
    updatedAt: ack.updatedAt,
  });
}

export function portalReferralAssignmentFailureRequiresRefresh(
  result: PortalReferralMutationResult,
) {
  return (
    !result.ok &&
    (result.code === "CONFLICT" || result.code === "REQUEST_FAILED")
  );
}

export function portalReferralAssignmentMutationFailureRequiresDetailRefresh(
  mutation: Pick<PortalReferralAssignmentMutation, "kind">,
  result: PortalReferralMutationResult,
) {
  return (
    portalReferralAssignmentFailureRequiresRefresh(result) ||
    (mutation.kind === "OFFER_REFERRAL" &&
      !result.ok &&
      result.code === "NOT_FOUND")
  );
}

export function portalReferralAssignmentActionStage(
  detail: PortalReferralAssignmentDetail,
) {
  if (detail.currentStatus === "SUBMITTED") return "TRIAGE" as const;
  if (detail.currentStatus === "TRIAGED") return "CANDIDATES" as const;
  return "ACTIVE_OFFER" as const;
}

export function portalReferralAssignmentCandidateFailureRequiresDetailRefresh(
  result: PortalReferralAssignmentCandidatesResult,
) {
  return !result.ok && result.code === "CONFLICT";
}

export function portalReferralAssignmentCandidateFailureInvalidatesDetail(
  result: PortalReferralAssignmentCandidatesResult,
) {
  return (
    !result.ok &&
    (result.code === "AUTH_REQUIRED" ||
      result.code === "FORBIDDEN" ||
      result.code === "NOT_FOUND" ||
      result.code === "CAPABILITY_DISABLED")
  );
}

export function portalReferralAssignmentDetailAfterCandidateResult(
  detail: PortalReferralAssignmentDetailResult,
  candidates: PortalReferralAssignmentCandidatesResult,
): PortalReferralAssignmentDetailResult {
  if (
    !candidates.ok &&
    portalReferralAssignmentCandidateFailureInvalidatesDetail(candidates)
  ) {
    return { ok: false, code: candidates.code };
  }
  return detail;
}

export function PortalReferralAssignmentQueue({
  enabled = false,
}: Readonly<{ enabled?: boolean }>) {
  const [result, setResult] = useState<PortalReferralAssignmentQueueResult>();
  const trackerRef = useRef<ReturnType<
    typeof createPortalReferralAssignmentRequestTracker
  > | null>(null);
  if (trackerRef.current == null) {
    trackerRef.current = createPortalReferralAssignmentRequestTracker();
  }

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const tracker = trackerRef.current;
    if (!tracker) return;
    const token = tracker.begin("assignment-queue");
    setResult(undefined);
    const loaded = await loadPortalReferralAssignmentQueue({ enabled });
    if (tracker.isCurrent(token)) setResult(loaded);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const tracker = trackerRef.current;
    return () => tracker?.invalidate();
  }, [enabled, refresh]);

  if (!enabled) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5d6d68]">
          Preview assignment runtime is disabled. No queue request is sent.
        </p>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="p-5">
        <p aria-live="polite" className="text-sm text-[#5d6d68]">
          Loading authorized assignment queue…
        </p>
      </Card>
    );
  }

  if (!result.ok) {
    return (
      <Card className="grid gap-3 p-5">
        <p aria-live="polite" className="text-sm text-[#7a4b00]">
          {assignmentFailureMessage(result.code, "queue")}
        </p>
        <button
          type="button"
          className="taito-secondary w-fit px-3"
          onClick={() => void refresh()}
        >
          Retry queue / 重试队列
        </button>
      </Card>
    );
  }

  if (result.items.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5d6d68]">
          No referrals are currently awaiting assignment.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {result.items.map((item) => (
        <Card key={item.referralId} className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                {item.sourceOrganizationName}
              </p>
              <h2 className="text-lg font-semibold text-[#263834]">
                {displayRegion(item.region)} · {displayService(item.serviceType)}
              </h2>
              <p className="text-sm text-[#5d6d68]">
                Version {item.rowVersion} · Updated {displayInstant(item.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AssignmentStatusBadge status={item.currentStatus} />
              <Link
                className="taito-primary px-3"
                href={`/referrals/${item.referralId}/matches`}
              >
                Open assignment / 打开分配
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function PortalReferralAssignmentCoordinator({
  enabled = false,
  referralId,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
}>) {
  const requestReferralId = canonicalPortalReferralUuid(referralId) ?? referralId;
  const identity = useMemo<PortalReferralAssignmentIdentity>(
    () => Object.freeze({ enabled, referralId: requestReferralId }),
    [enabled, requestReferralId],
  );

  const [detailState, setDetailState] = useState<
    PortalReferralAssignmentKeyedResult<PortalReferralAssignmentDetailResult>
  >();
  const [candidateState, setCandidateState] = useState<
    PortalReferralAssignmentKeyedResult<
      Readonly<{
        rowVersion: number;
        result: PortalReferralAssignmentCandidatesResult;
      }>
    >
  >();
  const [mutationState, setMutationState] = useState<
    PortalReferralAssignmentKeyedResult<PortalReferralMutationResult>
  >();
  const [pendingState, setPendingState] = useState<
    Readonly<{
      identity: PortalReferralAssignmentIdentity;
      kind: "TRIAGE_REFERRAL" | "OFFER_REFERRAL";
    }>
  >();
  const detailTrackerRef = useRef<ReturnType<
    typeof createPortalReferralAssignmentRequestTracker
  > | null>(null);
  const candidateTrackerRef = useRef<ReturnType<
    typeof createPortalReferralAssignmentRequestTracker
  > | null>(null);
  const mutationTrackerRef = useRef<ReturnType<
    typeof createPortalReferralAssignmentRequestTracker
  > | null>(null);
  if (detailTrackerRef.current == null) {
    detailTrackerRef.current = createPortalReferralAssignmentRequestTracker();
  }
  if (candidateTrackerRef.current == null) {
    candidateTrackerRef.current = createPortalReferralAssignmentRequestTracker();
  }
  if (mutationTrackerRef.current == null) {
    mutationTrackerRef.current = createPortalReferralAssignmentRequestTracker();
  }

  const detailResult = enabled
    ? selectPortalReferralAssignmentKeyedResult(detailState, identity)
    : undefined;
  const detail = detailResult?.ok ? detailResult.detail : undefined;
  const candidateEnvelope = selectPortalReferralAssignmentKeyedResult(
    candidateState,
    identity,
  );
  const candidateResult =
    detail?.currentStatus === "TRIAGED" &&
    candidateEnvelope?.rowVersion === detail.rowVersion
      ? candidateEnvelope.result
      : undefined;
  const mutationResult = selectPortalReferralAssignmentKeyedResult(
    mutationState,
    identity,
  );
  const pending =
    pendingState?.identity === identity ? pendingState.kind : undefined;
  const actionStage = detail
    ? portalReferralAssignmentActionStage(detail)
    : undefined;

  const loadCandidates = useCallback(
    async (
      currentDetail: PortalReferralAssignmentDetail,
      currentIdentity: PortalReferralAssignmentIdentity,
    ) => {
      const tracker = candidateTrackerRef.current;
      if (!enabled || !tracker || currentDetail.currentStatus !== "TRIAGED") {
        return;
      }
      const token = tracker.begin(
        `${currentDetail.referralId}:${currentDetail.rowVersion}`,
      );
      setCandidateState(undefined);
      const loaded = await loadPortalReferralAssignmentCandidates({
        enabled,
        referralId: currentDetail.referralId,
      });
      if (tracker.isCurrent(token)) {
        if (
          portalReferralAssignmentCandidateFailureInvalidatesDetail(loaded)
        ) {
          setDetailState({
            identity: currentIdentity,
            result: portalReferralAssignmentDetailAfterCandidateResult(
              { ok: true, detail: currentDetail },
              loaded,
            ),
          });
          setCandidateState(undefined);
          return;
        }
        setCandidateState({
          identity: currentIdentity,
          result: { rowVersion: currentDetail.rowVersion, result: loaded },
        });
      }
    },
    [enabled],
  );

  const refreshDetail = useCallback(
    async () => {
      const tracker = detailTrackerRef.current;
      if (!enabled || !tracker || !strictUuid(requestReferralId)) return;
      const token = tracker.begin(requestReferralId);
      candidateTrackerRef.current?.invalidate();
      setDetailState(undefined);
      setCandidateState(undefined);
      const loaded = await loadPortalReferralAssignmentDetail({
        enabled,
        referralId: requestReferralId,
      });
      if (!tracker.isCurrent(token)) return;
      setDetailState({
        identity,
        result: loaded,
      });
      if (loaded.ok && loaded.detail.currentStatus === "TRIAGED") {
        await loadCandidates(loaded.detail, identity);
      } else {
        setCandidateState(undefined);
      }
    },
    [enabled, identity, loadCandidates, requestReferralId],
  );

  useEffect(() => {
    if (!enabled || !strictUuid(requestReferralId)) return;
    const detailTracker = detailTrackerRef.current;
    const candidateTracker = candidateTrackerRef.current;
    const mutationTracker = mutationTrackerRef.current;
    if (!detailTracker) return;
    const token = detailTracker.begin(requestReferralId);
    candidateTracker?.invalidate();
    void loadPortalReferralAssignmentDetail({
      enabled,
      referralId: requestReferralId,
    }).then(async (loaded) => {
      if (!detailTracker.isCurrent(token)) return;
      setDetailState({ identity, result: loaded });
      if (loaded.ok && loaded.detail.currentStatus === "TRIAGED") {
        await loadCandidates(loaded.detail, identity);
      } else {
        setCandidateState(undefined);
      }
    });
    return () => {
      detailTracker?.invalidate();
      candidateTracker?.invalidate();
      mutationTracker?.invalidate();
    };
  }, [enabled, identity, loadCandidates, requestReferralId]);

  async function triage() {
    if (!detail || detail.currentStatus !== "SUBMITTED" || pending) return;
    const mutationTracker = mutationTrackerRef.current;
    if (!mutationTracker) return;
    const mutation = {
      kind: "TRIAGE_REFERRAL",
      referralId: detail.referralId,
      expectedVersion: detail.rowVersion,
    } as const;
    const token = mutationTracker.begin(
      `${detail.referralId}:${mutation.kind}:${detail.rowVersion}`,
    );
    setPendingState({
      identity,
      kind: mutation.kind,
    });
    setMutationState(undefined);
    const result = await submitPortalReferralAssignmentMutation({
      enabled,
      mutation,
      idempotencyKey: createAssignmentMutationId("triage"),
    });
    if (!mutationTracker.isCurrent(token)) return;
    setMutationState({
      identity,
      result,
    });

    const updated = applyPortalReferralAssignmentMutationAck({
      detail,
      mutation,
      result,
    });
    if (updated) {
      setDetailState({
        identity,
        result: { ok: true, detail: updated },
      });
      await loadCandidates(updated, identity);
    } else if (
      result.ok ||
      portalReferralAssignmentMutationFailureRequiresDetailRefresh(
        mutation,
        result,
      )
    ) {
      await refreshDetail();
    } else if (!result.ok) {
      setDetailState({
        identity,
        result: { ok: false, code: result.code },
      });
      setCandidateState(undefined);
    }
    if (mutationTracker.isCurrent(token)) setPendingState(undefined);
  }

  async function offer(candidate: PortalReferralAssignmentCandidate) {
    if (!detail || detail.currentStatus !== "TRIAGED" || pending) return;
    const mutationTracker = mutationTrackerRef.current;
    if (!mutationTracker) return;
    const mutation = {
      kind: "OFFER_REFERRAL",
      referralId: detail.referralId,
      providerId: candidate.providerId,
      expectedVersion: detail.rowVersion,
    } as const;
    const token = mutationTracker.begin(
      `${detail.referralId}:${mutation.kind}:${detail.rowVersion}`,
    );
    setPendingState({
      identity,
      kind: mutation.kind,
    });
    setMutationState(undefined);
    const result = await submitPortalReferralAssignmentMutation({
      enabled,
      mutation,
      idempotencyKey: createAssignmentMutationId("offer"),
    });
    if (!mutationTracker.isCurrent(token)) return;
    setMutationState({
      identity,
      result,
    });

    const updated = applyPortalReferralAssignmentMutationAck({
      detail,
      mutation,
      result,
      candidate,
    });
    if (updated) {
      candidateTrackerRef.current?.invalidate();
      setCandidateState(undefined);
      setDetailState({
        identity,
        result: { ok: true, detail: updated },
      });
    } else if (
      result.ok ||
      portalReferralAssignmentMutationFailureRequiresDetailRefresh(
        mutation,
        result,
      )
    ) {
      await refreshDetail();
    } else if (!result.ok) {
      setDetailState({
        identity,
        result: { ok: false, code: result.code },
      });
      setCandidateState(undefined);
    }
    if (mutationTracker.isCurrent(token)) setPendingState(undefined);
  }

  return (
    <section aria-label="Authorized assignment detail" className="grid gap-5">
      {!enabled ? (
        <Card className="p-5">
          <p className="text-sm text-[#5d6d68]">
            Preview assignment runtime is disabled. No assignment request is
            sent.
          </p>
        </Card>
      ) : !strictUuid(requestReferralId) ? (
        <Card className="p-5">
          <p className="text-sm text-[#7a4b00]">
            This referral is not available to the current account.
          </p>
        </Card>
      ) : !detailResult ? (
        <Card className="p-5">
          <p aria-live="polite" className="text-sm text-[#5d6d68]">
            Loading authorized assignment detail…
          </p>
        </Card>
      ) : !detailResult.ok ? (
        <Card className="grid gap-3 p-5">
          <p aria-live="polite" className="text-sm text-[#7a4b00]">
            {assignmentFailureMessage(detailResult.code, "detail")}
          </p>
          {detailResult.code === "REQUEST_FAILED" ||
          detailResult.code === "CONFLICT" ? (
            <button
              type="button"
              className="taito-secondary w-fit px-3"
              onClick={() => void refreshDetail()}
            >
              Refresh detail / 刷新详情
            </button>
          ) : null}
        </Card>
      ) : (
        <>
          <AssignmentDetailCard detail={detailResult.detail} />

          {actionStage === "TRIAGE" ? (
            <Card className="grid gap-3 p-5">
              <h2 className="text-lg font-semibold">Triage / 分诊</h2>
              <p className="text-sm leading-6 text-[#5d6d68]">
                Confirm this referral is ready for provider candidate review.
              </p>
              <button
                type="button"
                disabled={Boolean(pending)}
                className="taito-primary w-fit px-4 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void triage()}
              >
                {pending === "TRIAGE_REFERRAL"
                  ? "Triaging…"
                  : "Triage referral / 开始分诊"}
              </button>
            </Card>
          ) : null}

          {actionStage === "CANDIDATES" ? (
            <AssignmentCandidatesCard
              pending={Boolean(pending)}
              result={candidateResult}
              onOffer={offer}
              onRetry={() => {
                if (
                  candidateResult &&
                  portalReferralAssignmentCandidateFailureRequiresDetailRefresh(
                    candidateResult,
                  )
                ) {
                  void refreshDetail();
                  return;
                }
                void loadCandidates(detailResult.detail, identity);
              }}
            />
          ) : null}

          {actionStage === "ACTIVE_OFFER" &&
          detailResult.detail.activeOffer ? (
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                Active offer / 当前邀约
              </p>
              <h2 className="mt-2 text-lg font-semibold">
                {detailResult.detail.activeOffer.displayName}
              </h2>
              <p className="mt-1 text-sm text-[#5d6d68]">
                Offered {displayInstant(detailResult.detail.activeOffer.offeredAt)}
              </p>
            </Card>
          ) : null}

          <AssignmentMutationNotice result={mutationResult} />
        </>
      )}
    </section>
  );
}

function AssignmentDetailCard({
  detail,
}: Readonly<{ detail: PortalReferralAssignmentDetail }>) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
            {detail.sourceOrganizationName}
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {displayRegion(detail.region)} · {displayService(detail.serviceType)}
          </h2>
        </div>
        <AssignmentStatusBadge status={detail.currentStatus} />
      </div>

      <div className="mt-5 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
          Private summary / 私密摘要
        </p>
        <p className="whitespace-pre-wrap rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
          {detail.summary}
        </p>
      </div>

      <dl className="mt-5 grid gap-3 rounded-lg bg-[#f7faf8] p-3 text-sm text-[#40504b] sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[#66736f]">Name / 姓名</dt>
          <dd className="mt-1 font-medium">{detail.contact.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#66736f]">Phone / 电话</dt>
          <dd className="mt-1 font-medium">{detail.contact.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#66736f]">Email / 邮箱</dt>
          <dd className="mt-1 font-medium">
            {detail.contact.email ?? "Not provided / 未提供"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-[#66736f]">
        Version {detail.rowVersion} · Updated {displayInstant(detail.updatedAt)}
      </p>
    </Card>
  );
}

function AssignmentCandidatesCard({
  pending,
  result,
  onOffer,
  onRetry,
}: Readonly<{
  pending: boolean;
  result: PortalReferralAssignmentCandidatesResult | undefined;
  onOffer: (candidate: PortalReferralAssignmentCandidate) => Promise<void>;
  onRetry: () => void;
}>) {
  if (!result) {
    return (
      <Card className="p-5">
        <p aria-live="polite" className="text-sm text-[#5d6d68]">
          Loading authorized provider candidates…
        </p>
      </Card>
    );
  }
  if (!result.ok) {
    return (
      <Card className="grid gap-3 p-5">
        <p aria-live="polite" className="text-sm text-[#7a4b00]">
          {assignmentFailureMessage(result.code, "candidates")}
        </p>
        <button
          type="button"
          className="taito-secondary w-fit px-3"
          onClick={onRetry}
        >
          {portalReferralAssignmentCandidateFailureRequiresDetailRefresh(result)
            ? "Refresh detail / 刷新详情"
            : "Retry candidates / 重试候选"}
        </button>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Provider candidates / 服务商候选</h2>
      <p className="mt-1 text-sm text-[#5d6d68]">
        Only authorized provider display names are shown.
      </p>
      {result.items.length === 0 ? (
        <p className="mt-4 text-sm text-[#5d6d68]">
          No eligible providers are currently available.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {result.items.map((candidate) => (
            <li
              key={candidate.providerId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce8e2] p-3"
            >
              <span className="font-medium text-[#263834]">
                {candidate.displayName}
              </span>
              <button
                type="button"
                disabled={pending}
                className="taito-primary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void onOffer(candidate)}
              >
                Offer / 发出邀约
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AssignmentMutationNotice({
  result,
}: Readonly<{ result: PortalReferralMutationResult | undefined }>) {
  if (!result) return null;
  return (
    <p aria-live="polite" className="text-sm text-[#5d6d68]">
      {result.ok
        ? "Assignment updated with the latest authorized row version."
        : assignmentFailureMessage(result.code, "mutation")}
    </p>
  );
}

function AssignmentStatusBadge({
  status,
}: Readonly<{ status: PortalReferralAssignmentStatus }>) {
  return (
    <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
      {status}
    </span>
  );
}

function parseAssignmentQueueEnvelope(
  value: unknown,
): readonly PortalReferralAssignmentQueueItem[] | undefined {
  if (!hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) {
    return undefined;
  }
  if (value.items.length > MAX_ASSIGNMENT_ITEMS) return undefined;
  const seen = new Set<string>();
  const parsed: PortalReferralAssignmentQueueItem[] = [];
  for (const item of value.items) {
    if (
      !hasExactKeys(item, [
        "referralId",
        "sourceOrganizationId",
        "sourceOrganizationName",
        "region",
        "serviceType",
        "currentStatus",
        "rowVersion",
        "updatedAt",
      ])
    ) {
      return undefined;
    }
    const referralId = strictUuid(item.referralId);
    const sourceOrganizationId = strictUuid(item.sourceOrganizationId);
    const sourceOrganizationName = strictText(item.sourceOrganizationName, 200);
    const region = strictRegion(item.region);
    const serviceType = strictService(item.serviceType);
    const currentStatus = strictAssignmentStatus(item.currentStatus);
    const rowVersion = strictRowVersion(item.rowVersion);
    const updatedAt = strictUtcInstant(item.updatedAt);
    if (
      !referralId ||
      !sourceOrganizationId ||
      !sourceOrganizationName ||
      !region ||
      !serviceType ||
      !currentStatus ||
      !rowVersion ||
      !updatedAt ||
      seen.has(referralId)
    ) {
      return undefined;
    }
    seen.add(referralId);
    parsed.push(
      Object.freeze({
        referralId,
        sourceOrganizationId,
        sourceOrganizationName,
        region,
        serviceType,
        currentStatus,
        rowVersion,
        updatedAt,
      }),
    );
  }
  return Object.freeze(parsed);
}

function parseAssignmentDetailEnvelope(
  value: unknown,
): PortalReferralAssignmentDetail | undefined {
  if (!hasExactKeys(value, ["referral"])) return undefined;
  const detail = value.referral;
  if (
    !hasExactKeys(detail, [
      "referralId",
      "sourceOrganizationId",
      "sourceOrganizationName",
      "summary",
      "region",
      "serviceType",
      "currentStatus",
      "rowVersion",
      "contact",
      "activeOffer",
      "createdAt",
      "updatedAt",
    ]) ||
    !hasExactKeys(detail.contact, ["name", "phone", "email"])
  ) {
    return undefined;
  }

  const referralId = strictUuid(detail.referralId);
  const sourceOrganizationId = strictUuid(detail.sourceOrganizationId);
  const sourceOrganizationName = strictText(detail.sourceOrganizationName, 200);
  const summary = strictText(detail.summary, 4_000);
  const region = strictRegion(detail.region);
  const serviceType = strictService(detail.serviceType);
  const currentStatus = strictAssignmentStatus(detail.currentStatus);
  const rowVersion = strictRowVersion(detail.rowVersion);
  const contactName = strictText(detail.contact.name, 200);
  const contactPhone = strictText(detail.contact.phone, 100);
  const contactEmail =
    detail.contact.email === null
      ? null
      : strictText(detail.contact.email, 320);
  const createdAt = strictUtcInstant(detail.createdAt);
  const updatedAt = strictUtcInstant(detail.updatedAt);
  if (
    !referralId ||
    !sourceOrganizationId ||
    !sourceOrganizationName ||
    !summary ||
    !region ||
    !serviceType ||
    !currentStatus ||
    !rowVersion ||
    !contactName ||
    !contactPhone ||
    contactEmail === undefined ||
    !createdAt ||
    !updatedAt ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return undefined;
  }

  let activeOffer: PortalReferralAssignmentActiveOffer | null = null;
  if (detail.activeOffer !== null) {
    const offer = detail.activeOffer;
    if (
      !hasExactKeys(offer, [
        "matchId",
        "providerId",
        "displayName",
        "offeredAt",
      ])
    ) {
      return undefined;
    }
    const matchId = strictUuid(offer.matchId);
    const providerId = strictUuid(offer.providerId);
    const displayName = strictText(offer.displayName, 200);
    const offeredAt = strictUtcInstant(offer.offeredAt);
    if (
      !matchId ||
      !providerId ||
      !displayName ||
      !offeredAt ||
      Date.parse(offeredAt) < Date.parse(createdAt) ||
      Date.parse(offeredAt) > Date.parse(updatedAt)
    ) {
      return undefined;
    }
    activeOffer = Object.freeze({
      matchId,
      providerId,
      displayName,
      offeredAt,
    });
  }
  if ((currentStatus === "OFFERED") !== Boolean(activeOffer)) {
    return undefined;
  }

  return Object.freeze({
    referralId,
    sourceOrganizationId,
    sourceOrganizationName,
    summary,
    region,
    serviceType,
    currentStatus,
    rowVersion,
    contact: Object.freeze({
      name: contactName,
      phone: contactPhone,
      email: contactEmail,
    }),
    activeOffer,
    createdAt,
    updatedAt,
  });
}

function parseAssignmentCandidatesEnvelope(
  value: unknown,
): readonly PortalReferralAssignmentCandidate[] | undefined {
  if (!hasExactKeys(value, ["items"]) || !Array.isArray(value.items)) {
    return undefined;
  }
  if (value.items.length > MAX_ASSIGNMENT_ITEMS) return undefined;
  const seen = new Set<string>();
  const parsed: PortalReferralAssignmentCandidate[] = [];
  for (const item of value.items) {
    if (!hasExactKeys(item, ["providerId", "displayName"])) return undefined;
    const providerId = strictUuid(item.providerId);
    const displayName = strictText(item.displayName, 200);
    if (!providerId || !displayName || seen.has(providerId)) return undefined;
    seen.add(providerId);
    parsed.push(Object.freeze({ providerId, displayName }));
  }
  return Object.freeze(parsed);
}

function parseAssignmentMutationAck(
  value: unknown,
  mutation: PortalReferralAssignmentMutation,
): PortalReferralMutationAck | undefined {
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
  const matchId = value.matchId === null ? null : strictUuid(value.matchId);
  const updatedAt = strictUtcInstant(value.updatedAt);
  if (
    referralId !== mutation.referralId ||
    !strictRowVersion(value.rowVersion) ||
    value.rowVersion !== mutation.expectedVersion + 1 ||
    !updatedAt
  ) {
    return undefined;
  }
  if (
    mutation.kind === "TRIAGE_REFERRAL" &&
    (value.currentStatus !== "TRIAGED" || matchId !== null)
  ) {
    return undefined;
  }
  if (
    mutation.kind === "OFFER_REFERRAL" &&
    (value.currentStatus !== "OFFERED" || !matchId)
  ) {
    return undefined;
  }
  return Object.freeze({
    referralId,
    matchId: matchId ?? null,
    currentStatus: value.currentStatus as "TRIAGED" | "OFFERED",
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

function strictText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= maxLength
    ? normalized
    : undefined;
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
      value as PortalReferralAssignmentRegion,
    )
    ? (value as PortalReferralAssignmentRegion)
    : undefined;
}

function strictService(value: unknown) {
  return typeof value === "string" &&
    PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
      value as PortalReferralAssignmentService,
    )
    ? (value as PortalReferralAssignmentService)
    : undefined;
}

function strictAssignmentStatus(value: unknown) {
  return typeof value === "string" &&
    (ASSIGNMENT_STATUSES as readonly string[]).includes(value)
    ? (value as PortalReferralAssignmentStatus)
    : undefined;
}

function failureCodeForStatus(status: number): PortalReferralAssignmentFailureCode {
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

function assignmentFailureMessage(
  code: PortalReferralAssignmentFailureCode,
  surface: "queue" | "detail" | "candidates" | "mutation",
) {
  if (code === "AUTH_REQUIRED") return "Sign in again to continue.";
  if (code === "FORBIDDEN" || code === "NOT_FOUND") {
    return "This referral is not available to the current account.";
  }
  if (code === "CAPABILITY_DISABLED") {
    return "Preview assignment runtime is unavailable.";
  }
  if (code === "CONFLICT") {
    return "The referral changed. The authorized detail is being refreshed.";
  }
  return `Authorized assignment ${surface} could not be loaded.`;
}

function createAssignmentMutationId(prefix: "triage" | "offer") {
  const randomPart = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal.assignment.${prefix}:${randomPart}`;
}

const REGION_LABELS: Record<PortalReferralAssignmentRegion, string> = {
  VIC_MELBOURNE: "Melbourne / 墨尔本",
  VIC_GEELONG: "Geelong / 吉朗",
  VIC_REGIONAL: "Regional Victoria / 维州地区",
};

const SERVICE_LABELS: Record<PortalReferralAssignmentService, string> = {
  SUPPORT_COORDINATION: "Support coordination / 支持协调",
  DAILY_LIVING_SUPPORT: "Daily living support / 日常生活支持",
  COMMUNITY_PARTICIPATION: "Community participation / 社区参与",
};

function displayRegion(region: PortalReferralAssignmentRegion) {
  return REGION_LABELS[region];
}

function displayService(service: PortalReferralAssignmentService) {
  return SERVICE_LABELS[service];
}

function displayInstant(value: string) {
  return value.replace("T", " ").replace(".000Z", " UTC");
}
