"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { canonicalPortalReferralUuid } from "../lib/portal-referral-id";

export const PORTAL_REFERRAL_UI_REGION_CODES = [
  "VIC_MELBOURNE",
  "VIC_GEELONG",
  "VIC_REGIONAL",
] as const;

export const PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES = [
  "SUPPORT_COORDINATION",
  "DAILY_LIVING_SUPPORT",
  "COMMUNITY_PARTICIPATION",
] as const;

export const PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES = [
  "CONTACT_CONFIRMED",
  "INFORMATION_REQUESTED",
  "FOLLOW_UP_SCHEDULED",
  "SERVICE_COMMENCED",
  "NO_RESPONSE",
] as const;

type PortalReferralRegionCode =
  (typeof PORTAL_REFERRAL_UI_REGION_CODES)[number];
type PortalReferralServiceTypeCode =
  (typeof PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES)[number];
type PortalReferralFollowUpOutcomeCode =
  (typeof PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES)[number];

type PortalReferralContact = Readonly<{
  name: string;
  phone: string;
  email: string | null;
}>;

export type PortalReferralMutation =
  | Readonly<{
      kind: "CREATE_REFERRAL";
      summary: string;
      region: PortalReferralRegionCode;
      serviceType: PortalReferralServiceTypeCode;
      contact: PortalReferralContact;
    }>
  | Readonly<{
      kind: "TRIAGE_REFERRAL";
      referralId: string;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "OFFER_REFERRAL";
      referralId: string;
      providerId: string;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "RESPOND_TO_OFFER";
      matchId: string;
      expectedVersion: number;
      decision: "ACCEPT" | "DECLINE";
    }>
  | Readonly<{
      kind: "RECORD_FOLLOW_UP";
      referralId: string;
      expectedVersion: number;
      outcomeCode: PortalReferralFollowUpOutcomeCode;
    }>;

export type PortalReferralMutationAck = Readonly<{
  referralId: string;
  matchId: string | null;
  currentStatus: string;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralListItem = Readonly<{
  referralId: string;
  region: PortalReferralRegionCode;
  serviceType: PortalReferralServiceTypeCode;
  currentStatus: string;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralSourceDetail = Readonly<{
  referralId: string;
  summary: string;
  region: PortalReferralRegionCode;
  serviceType: PortalReferralServiceTypeCode;
  currentStatus: string;
  rowVersion: number;
  contact: PortalReferralContact;
  createdAt: string;
  updatedAt: string;
}>;

type PortalReferralRequestFailureCode =
  | "CAPABILITY_DISABLED"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REQUEST_FAILED";

export type PortalReferralMutationResult =
  | Readonly<{ ok: true; ack: PortalReferralMutationAck }>
  | Readonly<{ ok: false; code: PortalReferralRequestFailureCode }>;

export type PortalReferralListResult =
  | Readonly<{ ok: true; items: readonly PortalReferralListItem[] }>
  | Readonly<{ ok: false; code: PortalReferralRequestFailureCode }>;

export type PortalReferralSourceDetailResult =
  | Readonly<{ ok: true; detail: PortalReferralSourceDetail }>
  | Readonly<{ ok: false; code: PortalReferralRequestFailureCode }>;

export type PortalReferralIntakeSubmissionResult = Readonly<{
  mutation: PortalReferralMutationResult;
  readback?: PortalReferralListResult;
}>;

export function canSubmitPortalReferralIntake({
  enabled,
  pending,
  readback,
}: Readonly<{
  enabled: boolean;
  pending: boolean;
  readback: PortalReferralListResult | undefined;
}>) {
  return enabled && !pending && readback?.ok === true;
}

export function portalReferralMutationInvalidatesPreauthorization(
  result: PortalReferralMutationResult,
) {
  return (
    !result.ok && result.code !== "CONFLICT" && result.code !== "REQUEST_FAILED"
  );
}

type PortalReferralFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PORTAL_REFERRAL_UI_STATUSES = [
  "SUBMITTED",
  "TRIAGED",
  "OFFERED",
  "ACCEPTED",
  "IN_PROGRESS",
  "NOTE_LINKED",
  "EXPORTED",
  "COMPLETED",
  "CLOSED",
] as const;

const REGION_LABELS: Record<PortalReferralRegionCode, string> = {
  VIC_MELBOURNE: "Melbourne / 墨尔本",
  VIC_GEELONG: "Geelong / 吉朗",
  VIC_REGIONAL: "Regional Victoria / 维州地区",
};

const SERVICE_LABELS: Record<PortalReferralServiceTypeCode, string> = {
  SUPPORT_COORDINATION: "Support coordination / 支持协调",
  DAILY_LIVING_SUPPORT: "Daily living support / 日常生活支持",
  COMMUNITY_PARTICIPATION: "Community participation / 社区参与",
};

const FOLLOW_UP_LABELS: Record<PortalReferralFollowUpOutcomeCode, string> = {
  CONTACT_CONFIRMED: "Contact confirmed / 已确认联系",
  INFORMATION_REQUESTED: "Information requested / 已请求资料",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled / 已安排跟进",
  SERVICE_COMMENCED: "Service commenced / 服务已开始",
  NO_RESPONSE: "No response / 暂无回应",
};

export function createPortalReferralMutationRequest(
  mutation: PortalReferralMutation,
  idempotencyKey: string,
) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new TypeError("idempotencyKey is invalid");
  }

  const { url, body } = getMutationTarget(mutation);

  return Object.freeze({
    url,
    init: Object.freeze({
      method: "POST",
      credentials: "same-origin" as const,
      cache: "no-store" as const,
      headers: Object.freeze({
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      }),
      body: JSON.stringify(body),
    }),
  });
}

export async function submitPortalReferralMutation({
  enabled = false,
  mutation,
  idempotencyKey,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  mutation: PortalReferralMutation;
  idempotencyKey: string;
  fetcher?: PortalReferralFetch;
}>): Promise<PortalReferralMutationResult> {
  if (!enabled) {
    return { ok: false, code: "CAPABILITY_DISABLED" };
  }

  let request: ReturnType<typeof createPortalReferralMutationRequest>;
  try {
    request = createPortalReferralMutationRequest(mutation, idempotencyKey);
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }

  try {
    const response = await fetcher(request.url, request.init);
    if (!response.ok) {
      // Error bodies are deliberately not parsed: server messages, echoed input,
      // or credentials must never become visible UI copy.
      return { ok: false, code: failureCodeForStatus(response.status) };
    }

    const ack = parseMetadataOnlyAck(await response.json(), mutation);
    return ack
      ? { ok: true, ack }
      : { ok: false, code: "REQUEST_FAILED" };
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }
}

export async function loadPortalReferralReadback({
  enabled = false,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  fetcher?: PortalReferralFetch;
}> = {}): Promise<PortalReferralListResult> {
  if (!enabled) {
    return { ok: false, code: "CAPABILITY_DISABLED" };
  }

  try {
    const response = await fetcher("/api/portal/referrals", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      // Do not parse error bodies: they can contain echoed private input or
      // implementation detail that must never become client-visible copy.
      return { ok: false, code: failureCodeForStatus(response.status) };
    }

    const items = parseMetadataOnlyList(await response.json());
    return items
      ? { ok: true, items }
      : { ok: false, code: "REQUEST_FAILED" };
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }
}

export async function loadPortalReferralSourceDetail({
  enabled = false,
  referralId,
  fetcher = globalThis.fetch,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
  fetcher?: PortalReferralFetch;
}>): Promise<PortalReferralSourceDetailResult> {
  if (!enabled) {
    return { ok: false, code: "CAPABILITY_DISABLED" };
  }

  let canonicalReferralId: string;
  try {
    canonicalReferralId = requiredUuid(referralId);
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }

  try {
    const response = await fetcher(
      `/api/portal/referrals/${canonicalReferralId}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) {
      // Error bodies can contain database or request details. Never parse them
      // into the client-visible detail state.
      return { ok: false, code: failureCodeForStatus(response.status) };
    }

    const detail = parseSourceDetailEnvelope(await response.json());
    return detail?.referralId === canonicalReferralId
      ? { ok: true, detail }
      : { ok: false, code: "REQUEST_FAILED" };
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }
}

export async function submitPortalReferralIntakeAndReadback({
  enabled = false,
  mutation,
  idempotencyKey,
  fetcher = globalThis.fetch,
  onMutationAccepted,
}: Readonly<{
  enabled?: boolean;
  mutation: Extract<PortalReferralMutation, { kind: "CREATE_REFERRAL" }>;
  idempotencyKey: string;
  fetcher?: PortalReferralFetch;
  onMutationAccepted?: () => void;
}>): Promise<PortalReferralIntakeSubmissionResult> {
  const mutationResult = await submitPortalReferralMutation({
    enabled,
    mutation,
    idempotencyKey,
    fetcher,
  });
  if (!mutationResult.ok) {
    return Object.freeze({ mutation: mutationResult });
  }

  onMutationAccepted?.();
  return Object.freeze({
    mutation: mutationResult,
    readback: await loadPortalReferralReadback({ enabled, fetcher }),
  });
}

export function PortalReferralIntakeControls({
  enabled = false,
  detailEnabled = false,
}: Readonly<{ enabled?: boolean; detailEnabled?: boolean }>) {
  const [result, setResult] = useState<PortalReferralMutationResult>();
  const [readback, setReadback] = useState<PortalReferralListResult>();
  const [pending, setPending] = useState(false);
  const mutationId = usePortalMutationId("create");
  const readbackGeneration = useRef(0);
  const canCreate = canSubmitPortalReferralIntake({
    enabled,
    pending,
    readback,
  });

  useEffect(() => {
    if (!enabled) return;
    const generation = ++readbackGeneration.current;
    let active = true;
    void loadPortalReferralReadback({ enabled }).then((loaded) => {
      if (active && generation === readbackGeneration.current) {
        setReadback(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    const submittedForm = event.currentTarget;
    const formData = new FormData(submittedForm);
    setPending(true);
    const submission = await submitPortalReferralIntakeAndReadback({
      enabled,
      idempotencyKey: mutationId.get(),
      onMutationAccepted: () => {
        // Once the POST is accepted, invalidate any older mount-time GET so it
        // cannot overwrite the post-create readback with a stale snapshot.
        ++readbackGeneration.current;
        submittedForm.reset();
        mutationId.reset();
      },
      mutation: {
        kind: "CREATE_REFERRAL",
        region: formData.get("region") as PortalReferralRegionCode,
        serviceType: formData.get(
          "serviceType",
        ) as PortalReferralServiceTypeCode,
        summary: getFormText(formData, "summary"),
        contact: {
          name: getFormText(formData, "contactName"),
          phone: getFormText(formData, "contactPhone"),
          email: getOptionalFormText(formData, "contactEmail"),
        },
      },
    });
    setResult(submission.mutation);
    if (submission.mutation.ok) {
      setReadback(
        submission.readback ?? { ok: false, code: "REQUEST_FAILED" },
      );
    } else if (
      portalReferralMutationInvalidatesPreauthorization(submission.mutation)
    ) {
      setReadback({ ok: false, code: submission.mutation.code });
    }
    setPending(false);
  }

  return (
    <div className="grid gap-5">
      <form
        autoComplete="off"
        className="grid gap-5"
        onInput={mutationId.reset}
        onSubmit={handleSubmit}
      >
        <fieldset className="grid gap-5" disabled={!canCreate}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
              Region / 区域
              <select
                name="region"
                defaultValue={PORTAL_REFERRAL_UI_REGION_CODES[0]}
                className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
              >
                {PORTAL_REFERRAL_UI_REGION_CODES.map((code) => (
                  <option key={code} value={code}>
                    {REGION_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
              Service type / 服务类型
              <select
                name="serviceType"
                defaultValue={PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES[0]}
                className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
              >
                {PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {SERVICE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
              Contact name / 联系人
              <input
                name="contactName"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
              Contact phone / 联系电话
              <input
                name="contactPhone"
                type="tel"
                autoComplete="off"
                required
                className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#263834] md:col-span-2">
              Contact email / 联系邮箱（可选）
              <input
                name="contactEmail"
                type="email"
                autoComplete="off"
                className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
            Private referral summary / 私密需求摘要
            <textarea
              name="summary"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              required
              rows={5}
              className="rounded-lg border border-[#cfded8] bg-white px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={!canCreate}
            className="inline-flex h-10 w-fit items-center rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create referral / 创建 referral
          </button>
        </fieldset>
        <PortalReferralCapabilityNotice
          enabled={enabled}
          result={result}
          successMessage={
            readback?.ok
              ? "Saved. Durable Preview metadata was refreshed below."
              : "Saved. Metadata readback is unavailable; private intake data is not displayed."
          }
        />
      </form>
      <PortalReferralReadback
        detailEnabled={detailEnabled}
        enabled={enabled}
        result={readback}
      />
    </div>
  );
}

export function PortalReferralSourceDetailPanel({
  enabled = false,
  referralId,
}: Readonly<{
  enabled?: boolean;
  referralId: string;
}>) {
  const requestReferralId =
    canonicalPortalReferralUuid(referralId) ?? referralId;
  const [loaded, setLoaded] = useState<
    Readonly<{
      referralId: string;
      result: PortalReferralSourceDetailResult;
    }>
  >();
  const result =
    loaded?.referralId === requestReferralId ? loaded.result : undefined;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadPortalReferralSourceDetail({
      enabled,
      referralId: requestReferralId,
    }).then(
      (loadedResult) => {
        if (active) {
          setLoaded({ referralId: requestReferralId, result: loadedResult });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, requestReferralId]);

  return (
    <section
      aria-label="Authorized referral detail"
      className="rounded-lg border border-[#cfe4dc] bg-white p-5"
    >
      {!enabled ? (
        <p className="text-sm leading-6 text-[#5d6d68]">
          Preview source-detail runtime is disabled. No detail request is sent.
        </p>
      ) : !result ? (
        <p aria-live="polite" className="text-sm text-[#5d6d68]">
          Loading authorized referral detail…
        </p>
      ) : !result.ok ? (
        <p aria-live="polite" className="text-sm leading-6 text-[#7a4b00]">
          {result.code === "NOT_FOUND" || result.code === "FORBIDDEN"
            ? "This referral is not available to the current account."
            : "Authorized referral detail could not be loaded."}
        </p>
      ) : (
        <div aria-live="polite" className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#263834]">
              {displayRegionCode(result.detail.region)} ·{" "}
              {displayServiceCode(result.detail.serviceType)}
            </p>
            <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
              {result.detail.currentStatus}
            </span>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
              Private summary / 私密摘要
            </p>
            <p className="whitespace-pre-wrap rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
              {result.detail.summary}
            </p>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
              Contact / 联系人
            </p>
            <dl className="grid gap-2 rounded-lg bg-[#f7faf8] p-3 text-sm text-[#40504b] sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[#66736f]">Name / 姓名</dt>
                <dd className="mt-1 font-medium">{result.detail.contact.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#66736f]">Phone / 电话</dt>
                <dd className="mt-1 font-medium">{result.detail.contact.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#66736f]">Email / 邮箱</dt>
                <dd className="mt-1 font-medium">
                  {result.detail.contact.email ?? "Not provided / 未提供"}
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs leading-5 text-[#66736f]">
            Version {result.detail.rowVersion} · Created{" "}
            <time dateTime={result.detail.createdAt}>
              {displayUtcInstant(result.detail.createdAt)}
            </time>{" "}
            · Updated{" "}
            <time dateTime={result.detail.updatedAt}>
              {displayUtcInstant(result.detail.updatedAt)}
            </time>
          </p>
        </div>
      )}
    </section>
  );
}

export function PortalReferralWorkflowBoundary({
  operation,
}: Readonly<{
  operation: "triage" | "offer" | "respond" | "follow-up";
}>) {
  const labels = {
    triage: "Triage referral / 开始分诊",
    offer: "Offer to provider / 分配给服务商",
    respond: "Accept or decline / 接受或拒绝",
    "follow-up": "Record follow-up / 记录跟进",
  } as const;

  return (
    <div className="grid gap-2 rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-3">
      <p className="text-sm font-semibold text-[#263834]">{labels[operation]}</p>
      <p className="text-xs leading-5 text-[#66736f]">
        Preview workflow is disabled until an authorized database-scoped ID and
        row version are available. No data will be submitted.
      </p>
    </div>
  );
}

export function PortalReferralTriageControls({
  referralId,
  expectedVersion,
  enabled = false,
}: Readonly<{
  referralId: string;
  expectedVersion?: number;
  enabled?: boolean;
}>) {
  return (
    <PortalReferralMutationButton
      enabled={enabled && isExpectedVersion(expectedVersion)}
      label="Triage referral / 开始分诊"
      mutation={
        isExpectedVersion(expectedVersion)
          ? { kind: "TRIAGE_REFERRAL", referralId, expectedVersion }
          : undefined
      }
      mutationPrefix="triage"
    />
  );
}

export function PortalReferralOfferControls({
  referralId,
  providerId,
  expectedVersion,
  enabled = false,
}: Readonly<{
  referralId: string;
  providerId: string;
  expectedVersion?: number;
  enabled?: boolean;
}>) {
  return (
    <PortalReferralMutationButton
      enabled={enabled && isExpectedVersion(expectedVersion)}
      label="Offer to provider / 分配给服务商"
      mutation={
        isExpectedVersion(expectedVersion)
          ? {
              kind: "OFFER_REFERRAL",
              referralId,
              providerId,
              expectedVersion,
            }
          : undefined
      }
      mutationPrefix="offer"
    />
  );
}

export function PortalReferralResponseControls({
  matchId,
  expectedVersion,
  enabled = false,
}: Readonly<{
  matchId: string;
  expectedVersion?: number;
  enabled?: boolean;
}>) {
  const [result, setResult] = useState<PortalReferralMutationResult>();
  const [pending, setPending] = useState(false);
  const acceptMutationId = usePortalMutationId("accept");
  const declineMutationId = usePortalMutationId("decline");
  const canSubmit = enabled && isExpectedVersion(expectedVersion) && !pending;

  async function respond(decision: "ACCEPT" | "DECLINE") {
    if (!canSubmit || !isExpectedVersion(expectedVersion)) return;
    const mutationId =
      decision === "ACCEPT" ? acceptMutationId : declineMutationId;
    setPending(true);
    const submission = await submitPortalReferralMutation({
      enabled,
      idempotencyKey: mutationId.get(),
      mutation: {
        kind: "RESPOND_TO_OFFER",
        matchId,
        expectedVersion,
        decision,
      },
    });
    setResult(submission);
    if (submission.ok) mutationId.reset();
    setPending(false);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => respond("ACCEPT")}
          className="h-9 rounded-lg bg-[#0f766e] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Accept / 接受
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => respond("DECLINE")}
          className="h-9 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold text-[#263834] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Decline / 拒绝
        </button>
      </div>
      <PortalReferralCapabilityNotice enabled={enabled} result={result} compact />
    </div>
  );
}

export function PortalReferralFollowUpControls({
  referralId,
  expectedVersion,
  enabled = false,
}: Readonly<{
  referralId: string;
  expectedVersion?: number;
  enabled?: boolean;
}>) {
  const [result, setResult] = useState<PortalReferralMutationResult>();
  const [pending, setPending] = useState(false);
  const mutationId = usePortalMutationId("followup");
  const canSubmit = enabled && isExpectedVersion(expectedVersion) && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !isExpectedVersion(expectedVersion)) return;
    const formData = new FormData(event.currentTarget);
    setPending(true);
    const submission = await submitPortalReferralMutation({
      enabled,
      idempotencyKey: mutationId.get(),
      mutation: {
        kind: "RECORD_FOLLOW_UP",
        referralId,
        expectedVersion,
        outcomeCode: formData.get(
          "outcomeCode",
        ) as PortalReferralFollowUpOutcomeCode,
      },
    });
    setResult(submission);
    if (submission.ok) mutationId.reset();
    setPending(false);
  }

  return (
    <form
      className="grid gap-3"
      onChange={mutationId.reset}
      onSubmit={handleSubmit}
    >
      <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
        Follow-up outcome / 跟进结果
        <select
          name="outcomeCode"
          defaultValue={PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES[0]}
          disabled={!canSubmit}
          className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
        >
          {PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES.map((code) => (
            <option key={code} value={code}>
              {FOLLOW_UP_LABELS[code]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="h-10 rounded-lg bg-[#0f766e] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Record follow-up / 记录跟进
      </button>
      <PortalReferralCapabilityNotice enabled={enabled} result={result} compact />
    </form>
  );
}

type ProviderOfferCardBase = Readonly<{
  referralId: string;
  matchId: string;
  region: string;
  serviceType: string;
  expectedVersion?: number;
  enabled?: boolean;
}>;

type ProviderOfferCardProps =
  | (ProviderOfferCardBase &
      Readonly<{
        access: "pre-accept";
        summary?: never;
        contact?: never;
      }>)
  | (ProviderOfferCardBase &
      Readonly<{
        access: "accepted";
        summary: string;
        contact: PortalReferralContact;
      }>);

export function PortalReferralProviderOfferCard(props: ProviderOfferCardProps) {
  return (
    <article className="rounded-lg border border-[#dce8e2] p-4">
      <p className="font-semibold">
        {displayRegionCode(props.region)} · {displayServiceCode(props.serviceType)}
      </p>
      {props.access === "accepted" ? (
        <div className="mt-3 grid gap-2 text-sm text-[#40504b]">
          <p>{props.summary}</p>
          <p>
            {props.contact.name} · {props.contact.phone}
            {props.contact.email ? ` · ${props.contact.email}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#5d6d68]">
          Private summary and contact stay hidden until this exact provider accepts.
        </p>
      )}
      {props.access === "pre-accept" ? (
        <div className="mt-4">
          <PortalReferralResponseControls
            matchId={props.matchId}
            expectedVersion={props.expectedVersion}
            enabled={props.enabled}
          />
        </div>
      ) : null}
    </article>
  );
}

function PortalReferralMutationButton({
  enabled,
  label,
  mutation,
  mutationPrefix,
}: Readonly<{
  enabled: boolean;
  label: string;
  mutation: PortalReferralMutation | undefined;
  mutationPrefix: string;
}>) {
  const [result, setResult] = useState<PortalReferralMutationResult>();
  const [pending, setPending] = useState(false);
  const mutationId = usePortalMutationId(mutationPrefix);
  const canSubmit = enabled && Boolean(mutation) && !pending;

  async function submit() {
    if (!canSubmit || !mutation) return;
    setPending(true);
    const submission = await submitPortalReferralMutation({
      enabled,
      mutation,
      idempotencyKey: mutationId.get(),
    });
    setResult(submission);
    if (submission.ok) mutationId.reset();
    setPending(false);
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="h-9 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold text-[#263834] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
      <PortalReferralCapabilityNotice enabled={enabled} result={result} compact />
    </div>
  );
}

function PortalReferralCapabilityNotice({
  enabled,
  result,
  compact = false,
  successMessage,
}: Readonly<{
  enabled: boolean;
  result: PortalReferralMutationResult | undefined;
  compact?: boolean;
  successMessage?: string;
}>) {
  const message = !enabled
    ? "Preview workflow is disabled. No data will be submitted."
    : result?.ok
      ? (successMessage ??
        "Saved. Refresh the authorized view to see the current status.")
      : result
        ? genericFailureMessage(result.code)
        : "";

  return message ? (
    <p
      aria-live="polite"
      className={
        compact
          ? "text-xs leading-5 text-[#66736f]"
          : "rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#5d6d68]"
      }
    >
      {message}
    </p>
  ) : null;
}

export function PortalReferralReadback({
  detailEnabled,
  enabled,
  result,
}: Readonly<{
  detailEnabled: boolean;
  enabled: boolean;
  result: PortalReferralListResult | undefined;
}>) {
  return (
    <section
      aria-label="Referral metadata readback"
      className="rounded-lg border border-[#cfe4dc] bg-[#f7faf8] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
            Preview durable data
          </p>
          <h2 className="mt-1 text-base font-semibold text-[#263834]">
            Referral metadata / Referral 元数据
          </h2>
        </div>
        <span className="rounded-md border border-[#cfe4dc] bg-white px-2 py-1 text-xs font-semibold text-[#40504b]">
          metadata only
        </span>
      </div>

      {!enabled ? (
        <p className="mt-3 text-sm leading-6 text-[#5d6d68]">
          Preview runtime is disabled. No list request is sent, and no durable
          Preview data is shown.
        </p>
      ) : !result ? (
        <p aria-live="polite" className="mt-3 text-sm text-[#5d6d68]">
          Loading durable Preview referral metadata…
        </p>
      ) : !result.ok ? (
        <p aria-live="polite" className="mt-3 text-sm leading-6 text-[#7a4b00]">
          Durable referral metadata could not be loaded. No private intake data
          is displayed.
        </p>
      ) : result.items.length === 0 ? (
        <p aria-live="polite" className="mt-3 text-sm text-[#5d6d68]">
          No durable Preview referrals are available to this account.
        </p>
      ) : (
        <ul aria-live="polite" className="mt-3 grid gap-2">
          {result.items.map((item) => (
            <li
              key={item.referralId}
              className="rounded-lg border border-[#dce8e2] bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-[#40504b]">
                  {abbreviateReferralId(item.referralId)}
                </span>
                <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                  {item.currentStatus}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-[#263834]">
                {displayRegionCode(item.region)} ·{" "}
                {displayServiceCode(item.serviceType)}
              </p>
              <p className="mt-1 text-xs text-[#66736f]">
                Version {item.rowVersion} · Updated{" "}
                <time dateTime={item.updatedAt}>
                  {displayUtcInstant(item.updatedAt)}
                </time>
              </p>
              {detailEnabled ? (
                <Link
                  className="mt-3 inline-flex text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline"
                  href={`/referrals/${item.referralId}`}
                >
                  Open authorized detail / 打开已授权详情
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function getMutationTarget(mutation: PortalReferralMutation) {
  switch (mutation.kind) {
    case "CREATE_REFERRAL":
      return {
        url: "/api/portal/referrals",
        body: {
          summary: mutation.summary,
          region: mutation.region,
          serviceType: mutation.serviceType,
          contact: mutation.contact,
        },
      };
    case "TRIAGE_REFERRAL":
      return {
        url: `/api/portal/referrals/${requiredUuid(mutation.referralId)}/triage`,
        body: { expectedVersion: mutation.expectedVersion },
      };
    case "OFFER_REFERRAL":
      return {
        url: `/api/portal/referrals/${requiredUuid(mutation.referralId)}/offers`,
        body: {
          providerId: requiredUuid(mutation.providerId),
          expectedVersion: mutation.expectedVersion,
        },
      };
    case "RESPOND_TO_OFFER":
      return {
        url: `/api/portal/referral-offers/${requiredUuid(mutation.matchId)}/response`,
        body: {
          decision: mutation.decision,
          expectedVersion: mutation.expectedVersion,
        },
      };
    case "RECORD_FOLLOW_UP":
      return {
        url: `/api/portal/referrals/${requiredUuid(mutation.referralId)}/follow-ups`,
        body: {
          outcomeCode: mutation.outcomeCode,
          expectedVersion: mutation.expectedVersion,
        },
      };
  }
}

function parseMetadataOnlyAck(
  value: unknown,
  mutation: PortalReferralMutation,
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
  const candidate = value;
  const referralId = canonicalPortalReferralUuid(candidate.referralId);
  const matchId =
    candidate.matchId === null
      ? null
      : canonicalPortalReferralUuid(candidate.matchId);
  if (
    !referralId ||
    referralId !== candidate.referralId ||
    (candidate.matchId !== null && !matchId) ||
    (candidate.matchId !== null && matchId !== candidate.matchId) ||
    typeof candidate.currentStatus !== "string" ||
    !(PORTAL_REFERRAL_UI_STATUSES as readonly string[]).includes(
      candidate.currentStatus,
    ) ||
    !Number.isSafeInteger(candidate.rowVersion) ||
    (candidate.rowVersion as number) < 1 ||
    !strictUtcInstant(candidate.updatedAt) ||
    !ackMatchesMutation(
      {
        referralId,
        matchId: matchId ?? null,
        currentStatus: candidate.currentStatus,
        rowVersion: candidate.rowVersion as number,
      },
      mutation,
    )
  ) {
    return undefined;
  }

  return Object.freeze({
    referralId,
    matchId: matchId ?? null,
    currentStatus: candidate.currentStatus,
    rowVersion: candidate.rowVersion as number,
    updatedAt: candidate.updatedAt as string,
  });
}

function ackMatchesMutation(
  ack: Pick<
    PortalReferralMutationAck,
    "referralId" | "matchId" | "currentStatus" | "rowVersion"
  >,
  mutation: PortalReferralMutation,
) {
  switch (mutation.kind) {
    case "CREATE_REFERRAL":
      return (
        ack.matchId === null &&
        ack.currentStatus === "SUBMITTED" &&
        ack.rowVersion === 1
      );
    case "TRIAGE_REFERRAL": {
      const referralId = canonicalPortalReferralUuid(mutation.referralId);
      return (
        Boolean(referralId) &&
        ack.referralId === referralId &&
        ack.matchId === null &&
        ack.currentStatus === "TRIAGED" &&
        isNextVersion(ack.rowVersion, mutation.expectedVersion)
      );
    }
    case "OFFER_REFERRAL": {
      const referralId = canonicalPortalReferralUuid(mutation.referralId);
      return (
        Boolean(referralId) &&
        ack.referralId === referralId &&
        ack.matchId !== null &&
        ack.currentStatus === "OFFERED" &&
        isNextVersion(ack.rowVersion, mutation.expectedVersion)
      );
    }
    case "RESPOND_TO_OFFER": {
      const matchId = canonicalPortalReferralUuid(mutation.matchId);
      return (
        Boolean(matchId) &&
        ack.matchId === matchId &&
        ack.currentStatus ===
          (mutation.decision === "ACCEPT" ? "ACCEPTED" : "TRIAGED") &&
        isNextVersion(ack.rowVersion, mutation.expectedVersion)
      );
    }
    case "RECORD_FOLLOW_UP": {
      const referralId = canonicalPortalReferralUuid(mutation.referralId);
      return (
        Boolean(referralId) &&
        ack.referralId === referralId &&
        ack.matchId === null &&
        ack.currentStatus === "IN_PROGRESS" &&
        isNextVersion(ack.rowVersion, mutation.expectedVersion)
      );
    }
  }
}

function isNextVersion(actual: number, expected: number) {
  return (
    Number.isSafeInteger(expected) &&
    expected >= 1 &&
    expected < Number.MAX_SAFE_INTEGER &&
    actual === expected + 1
  );
}

function parseMetadataOnlyList(
  value: unknown,
): readonly PortalReferralListItem[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return undefined;

  const parsed: PortalReferralListItem[] = [];
  for (const valueItem of items) {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) {
      return undefined;
    }
    const item = valueItem as Partial<PortalReferralListItem>;
    const referralId = canonicalPortalReferralUuid(item.referralId);
    if (
      !referralId ||
      typeof item.region !== "string" ||
      !PORTAL_REFERRAL_UI_REGION_CODES.includes(
        item.region as PortalReferralRegionCode,
      ) ||
      typeof item.serviceType !== "string" ||
      !PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
        item.serviceType as PortalReferralServiceTypeCode,
      ) ||
      typeof item.currentStatus !== "string" ||
      !(PORTAL_REFERRAL_UI_STATUSES as readonly string[]).includes(
        item.currentStatus,
      ) ||
      !Number.isSafeInteger(item.rowVersion) ||
      (item.rowVersion ?? 0) < 1 ||
      typeof item.updatedAt !== "string" ||
      !ISO_INSTANT_PATTERN.test(item.updatedAt)
    ) {
      return undefined;
    }

    parsed.push(
      Object.freeze({
        referralId,
        region: item.region as PortalReferralRegionCode,
        serviceType: item.serviceType as PortalReferralServiceTypeCode,
        currentStatus: item.currentStatus,
        rowVersion: item.rowVersion as number,
        updatedAt: item.updatedAt,
      }),
    );
  }

  return Object.freeze(parsed);
}

function parseSourceDetailEnvelope(
  value: unknown,
): PortalReferralSourceDetail | undefined {
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

  const summary = strictBoundedText(detail.summary, 4_000);
  const contactName = strictBoundedText(detail.contact.name, 200);
  const contactPhone = strictBoundedText(detail.contact.phone, 100);
  const contactEmail =
    detail.contact.email === null
      ? null
      : strictBoundedText(detail.contact.email, 320);
  const createdAt = strictUtcInstant(detail.createdAt);
  const updatedAt = strictUtcInstant(detail.updatedAt);
  const referralId = canonicalPortalReferralUuid(detail.referralId);
  if (!summary || !contactName || !contactPhone || contactEmail === undefined) {
    return undefined;
  }
  if (
    !referralId ||
    referralId !== detail.referralId ||
    typeof detail.region !== "string" ||
    !PORTAL_REFERRAL_UI_REGION_CODES.includes(
      detail.region as PortalReferralRegionCode,
    ) ||
    typeof detail.serviceType !== "string" ||
    !PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
      detail.serviceType as PortalReferralServiceTypeCode,
    ) ||
    typeof detail.currentStatus !== "string" ||
    !(PORTAL_REFERRAL_UI_STATUSES as readonly string[]).includes(
      detail.currentStatus,
    ) ||
    !Number.isSafeInteger(detail.rowVersion) ||
    (detail.rowVersion as number) < 1 ||
    !createdAt ||
    !updatedAt ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return undefined;
  }

  return Object.freeze({
    referralId,
    summary,
    region: detail.region as PortalReferralRegionCode,
    serviceType: detail.serviceType as PortalReferralServiceTypeCode,
    currentStatus: detail.currentStatus,
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

function strictBoundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function strictUtcInstant(value: unknown) {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) {
    return undefined;
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return undefined;
  const canonical = instant.toISOString();
  return value === canonical ? canonical : undefined;
}

function requiredUuid(value: string) {
  const canonical = canonicalPortalReferralUuid(value);
  if (!canonical) {
    throw new TypeError("resource id is invalid");
  }
  return canonical;
}

function failureCodeForStatus(
  status: number,
): PortalReferralRequestFailureCode {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 501 || status === 503) return "CAPABILITY_DISABLED";
  return "REQUEST_FAILED";
}

function genericFailureMessage(
  code: PortalReferralRequestFailureCode,
) {
  switch (code) {
    case "CAPABILITY_DISABLED":
      return "Preview workflow is not available.";
    case "AUTH_REQUIRED":
      return "Sign in again before retrying.";
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "This referral action is not available to the current account.";
    case "CONFLICT":
      return "The referral changed. Refresh before retrying.";
    default:
      return "The action could not be completed.";
  }
}

function createBrowserMutationId(prefix: string) {
  return `portal.${prefix}:${globalThis.crypto.randomUUID()}`;
}

function usePortalMutationId(prefix: string) {
  const value = useRef<string | undefined>(undefined);
  return {
    get() {
      value.current ??= createBrowserMutationId(prefix);
      return value.current;
    },
    reset() {
      value.current = undefined;
    },
  };
}

function getFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalFormText(formData: FormData, key: string) {
  const value = getFormText(formData, key);
  return value || null;
}

function isExpectedVersion(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

function displayRegionCode(code: string) {
  return PORTAL_REFERRAL_UI_REGION_CODES.includes(code as PortalReferralRegionCode)
    ? REGION_LABELS[code as PortalReferralRegionCode]
    : code;
}

function displayServiceCode(code: string) {
  return PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES.includes(
    code as PortalReferralServiceTypeCode,
  )
    ? SERVICE_LABELS[code as PortalReferralServiceTypeCode]
    : code;
}

function abbreviateReferralId(referralId: string) {
  return `${referralId.slice(0, 8)}…${referralId.slice(-4)}`;
}

function displayUtcInstant(instant: string) {
  return `${instant.slice(0, 10)} ${instant.slice(11, 19)} UTC`;
}
