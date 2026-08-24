"use client";

import { useRef, useState, type FormEvent } from "react";

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

export type PortalReferralMutationResult =
  | Readonly<{ ok: true; ack: PortalReferralMutationAck }>
  | Readonly<{
      ok: false;
      code:
        | "CAPABILITY_DISABLED"
        | "AUTH_REQUIRED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "CONFLICT"
        | "REQUEST_FAILED";
    }>;

type PortalReferralFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

    const ack = parseMetadataOnlyAck(await response.json());
    return ack
      ? { ok: true, ack }
      : { ok: false, code: "REQUEST_FAILED" };
  } catch {
    return { ok: false, code: "REQUEST_FAILED" };
  }
}

export function PortalReferralIntakeControls({
  enabled = false,
}: Readonly<{ enabled?: boolean }>) {
  const [result, setResult] = useState<PortalReferralMutationResult>();
  const [pending, setPending] = useState(false);
  const mutationId = usePortalMutationId("create");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending) return;

    const formData = new FormData(event.currentTarget);
    setPending(true);
    const submission = await submitPortalReferralMutation({
      enabled,
      idempotencyKey: mutationId.get(),
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
    setResult(submission);
    if (submission.ok) mutationId.reset();
    setPending(false);
  }

  return (
    <form
      className="grid gap-5"
      onInput={mutationId.reset}
      onSubmit={handleSubmit}
    >
      <fieldset className="grid gap-5" disabled={!enabled || pending}>
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
              autoComplete="name"
              required
              className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
            Contact phone / 联系电话
            <input
              name="contactPhone"
              type="tel"
              autoComplete="tel"
              required
              className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[#263834] md:col-span-2">
            Contact email / 联系邮箱（可选）
            <input
              name="contactEmail"
              type="email"
              autoComplete="email"
              className="h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm"
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
          Private referral summary / 私密需求摘要
          <textarea
            name="summary"
            required
            rows={5}
            className="rounded-lg border border-[#cfded8] bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!enabled || pending}
          className="inline-flex h-10 w-fit items-center rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create referral / 创建 referral
        </button>
      </fieldset>
      <PortalReferralCapabilityNotice enabled={enabled} result={result} />
    </form>
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
}: Readonly<{
  enabled: boolean;
  result: PortalReferralMutationResult | undefined;
  compact?: boolean;
}>) {
  const message = !enabled
    ? "Preview workflow is disabled. No data will be submitted."
    : result?.ok
      ? "Saved. Refresh the authorized view to see the current status."
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

function parseMetadataOnlyAck(value: unknown): PortalReferralMutationAck | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<PortalReferralMutationAck>;
  if (
    typeof candidate.referralId !== "string" ||
    !UUID_PATTERN.test(candidate.referralId) ||
    (candidate.matchId !== null &&
      (typeof candidate.matchId !== "string" ||
        !UUID_PATTERN.test(candidate.matchId))) ||
    typeof candidate.currentStatus !== "string" ||
    !(PORTAL_REFERRAL_UI_STATUSES as readonly string[]).includes(
      candidate.currentStatus,
    ) ||
    !Number.isSafeInteger(candidate.rowVersion) ||
    typeof candidate.updatedAt !== "string" ||
    !ISO_INSTANT_PATTERN.test(candidate.updatedAt)
  ) {
    return undefined;
  }

  return Object.freeze({
    referralId: candidate.referralId,
    matchId: candidate.matchId ?? null,
    currentStatus: candidate.currentStatus,
    rowVersion: candidate.rowVersion as number,
    updatedAt: candidate.updatedAt,
  });
}

function requiredUuid(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError("resource id is invalid");
  }
  return value.toLowerCase();
}

function failureCodeForStatus(
  status: number,
): Exclude<PortalReferralMutationResult, { ok: true }>["code"] {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 501 || status === 503) return "CAPABILITY_DISABLED";
  return "REQUEST_FAILED";
}

function genericFailureMessage(
  code: Exclude<PortalReferralMutationResult, { ok: true }>["code"],
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
