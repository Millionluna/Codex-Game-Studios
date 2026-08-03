import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type {
  AccessCodeType,
  AccessState,
  EntityType,
  ReferralDirection,
} from "./referral-profile-workspace";

export type AccessRequestStatus = "queued" | "approved" | "declined";
export type AccessCodeStatus = "active" | "revoked" | "expired";
export type AiUsageFeature =
  | "profile_rewrite"
  | "share_card"
  | "referral_message"
  | "bilingual_intro"
  | "handover_checklist"
  | "ndis_case_note";

export type AccessControlRequestRecord = {
  id: string;
  userId: string;
  providerDraftId?: string;
  profileName: string;
  entityType: EntityType;
  referralDirection: ReferralDirection;
  requestedCodeType: AccessCodeType;
  sourceInvite?: string;
  expectedDailyQuota: number;
  reason: string;
  abuseCostControlNote?: string;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type AccessCodeRecord = {
  id: string;
  userId: string;
  accessRequestId?: string;
  codeType: AccessCodeType;
  status: AccessCodeStatus;
  dailyQuota: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type AiUsageEventRecord = {
  id: string;
  userId: string;
  providerDraftId?: string;
  feature: AiUsageFeature;
  inputTokenCount: number;
  outputTokenCount: number;
  createdAt: string;
};

export type DailyAiUsage = {
  userId: string;
  day: string;
  eventCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
};

export type GuidedAiAccessDecision =
  | {
      allowed: true;
      reason?: undefined;
      accessState: AccessState;
      remainingQuota: number;
    }
  | {
      allowed: false;
      reason: "access_required" | "quota_exhausted";
      accessState: AccessState;
      remainingQuota: number;
    };

export type AccessControlStore = {
  kind: "memory" | "supabase";
  listAccessRequests(): Promise<AccessControlRequestRecord[]>;
  getAccessRequest(id: string): Promise<AccessControlRequestRecord | undefined>;
  getLatestAccessRequestByUser(
    userId: string,
  ): Promise<AccessControlRequestRecord | undefined>;
  saveAccessRequest(
    record: AccessControlRequestRecord,
  ): Promise<AccessControlRequestRecord>;
  getActiveAccessCodeByUser(userId: string): Promise<AccessCodeRecord | undefined>;
  saveAccessCode(record: AccessCodeRecord): Promise<AccessCodeRecord>;
  recordAiUsageEvent(record: AiUsageEventRecord): Promise<AiUsageEventRecord>;
  getDailyAiUsage(input: {
    userId: string;
    day?: string;
  }): Promise<DailyAiUsage>;
  getAccessStateForUser(userId: string, day?: string): Promise<AccessState>;
};

const GLOBAL_ACCESS_CONTROL_STORE_KEY = "__careslinkAiAccessControlStore__";
const ACCESS_REQUESTS_TABLE = "access_requests";
const ACCESS_CODES_TABLE = "access_codes";
const AI_USAGE_EVENTS_TABLE = "ai_usage_events";

const ACCESS_REQUESTS_COLUMNS =
  "id, user_id, provider_draft_id, profile_name, entity_type, referral_direction, requested_code_type, source_invite, expected_daily_quota, reason, abuse_cost_control_note, status, created_at, updated_at";
const ACCESS_CODES_COLUMNS =
  "id, user_id, access_request_id, code_type, status, daily_quota, created_at, updated_at, expires_at";
const AI_USAGE_COLUMNS =
  "id, user_id, provider_draft_id, feature, input_token_count, output_token_count, created_at";

export const accessControlSupabaseSchemaSql = `
create table if not exists public.access_requests (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  profile_name text not null,
  entity_type text not null
    check (entity_type in ('individual', 'organisation')),
  referral_direction text not null
    check (referral_direction in ('receive', 'send', 'both')),
  requested_code_type text not null
    check (requested_code_type in (
      'Provider Pilot',
      'Referral Source Pilot',
      'Dual Role Pilot',
      'Internal Test',
      'Partner Batch'
    )),
  source_invite text,
  expected_daily_quota integer not null default 0
    check (expected_daily_quota >= 0 and expected_daily_quota <= 100),
  reason text not null,
  abuse_cost_control_note text,
  status text not null default 'queued'
    check (status in ('queued', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_user_id_idx
  on public.access_requests(user_id);

create index if not exists access_requests_status_idx
  on public.access_requests(status);

create index if not exists access_requests_created_at_idx
  on public.access_requests(created_at desc);

create table if not exists public.access_codes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_request_id text references public.access_requests(id) on delete set null,
  code_type text not null
    check (code_type in (
      'Provider Pilot',
      'Referral Source Pilot',
      'Dual Role Pilot',
      'Internal Test',
      'Partner Batch'
    )),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  daily_quota integer not null default 0
    check (daily_quota >= 0 and daily_quota <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists access_codes_user_id_idx
  on public.access_codes(user_id);

create index if not exists access_codes_status_idx
  on public.access_codes(status);

create table if not exists public.ai_usage_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  feature text not null,
  input_token_count integer not null default 0
    check (input_token_count >= 0),
  output_token_count integer not null default 0
    check (output_token_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events(user_id, created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public.ai_usage_events(feature);

alter table public.access_requests enable row level security;
alter table public.access_codes enable row level security;
alter table public.ai_usage_events enable row level security;

grant select, insert, update, delete on public.access_requests to service_role;
grant select, insert, update, delete on public.access_codes to service_role;
grant select, insert, update, delete on public.ai_usage_events to service_role;

revoke all on public.access_requests from anon, authenticated;
revoke all on public.access_codes from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
`;

type SupabaseAccessClient = {
  from(tableName: string): unknown;
};

type SupabaseAccessError = {
  message?: string;
  code?: string;
};

type SupabaseAccessResult<T> = PromiseLike<{
  data: T | null;
  error: SupabaseAccessError | null;
}>;

type SupabaseAccessListResult<T> = PromiseLike<{
  data: T[] | null;
  error: SupabaseAccessError | null;
}>;

type SupabaseAccessRequestQueryBuilder = SupabaseAccessListResult<AccessRequestRow> & {
  select(columns: string): SupabaseAccessRequestQueryBuilder;
  eq(column: string, value: string): SupabaseAccessRequestQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseAccessRequestQueryBuilder;
  limit(count: number): SupabaseAccessRequestQueryBuilder;
  maybeSingle(): SupabaseAccessResult<AccessRequestRow>;
  upsert(
    row: AccessRequestWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<{
        data: AccessRequestRow | null;
        error: SupabaseAccessError | null;
      }>;
    };
  };
};

type SupabaseAccessCodeQueryBuilder = {
  select(columns: string): SupabaseAccessCodeQueryBuilder;
  eq(column: string, value: string): SupabaseAccessCodeQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseAccessCodeQueryBuilder;
  limit(count: number): SupabaseAccessCodeQueryBuilder;
  maybeSingle(): SupabaseAccessResult<AccessCodeRow>;
  upsert(
    row: AccessCodeWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<{
        data: AccessCodeRow | null;
        error: SupabaseAccessError | null;
      }>;
    };
  };
};

type SupabaseAiUsageQueryBuilder = SupabaseAccessListResult<AiUsageEventRow> & {
  select(columns: string): SupabaseAiUsageQueryBuilder;
  eq(column: string, value: string): SupabaseAiUsageQueryBuilder;
  gte(column: string, value: string): SupabaseAiUsageQueryBuilder;
  lt(column: string, value: string): SupabaseAiUsageQueryBuilder;
  insert(row: AiUsageWriteRow): PromiseLike<{
    data?: unknown;
    error?: SupabaseAccessError | null;
  }>;
};

type AccessRequestRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  profile_name: string | null;
  entity_type: string | null;
  referral_direction: string | null;
  requested_code_type: string | null;
  source_invite: string | null;
  expected_daily_quota: number | null;
  reason: string | null;
  abuse_cost_control_note: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type AccessRequestWriteRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  profile_name: string;
  entity_type: EntityType;
  referral_direction: ReferralDirection;
  requested_code_type: AccessCodeType;
  source_invite: string | null;
  expected_daily_quota: number;
  reason: string;
  abuse_cost_control_note: string | null;
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
};

type AccessCodeRow = {
  id: string;
  user_id: string;
  access_request_id: string | null;
  code_type: string | null;
  status: string | null;
  daily_quota: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

type AccessCodeWriteRow = {
  id: string;
  user_id: string;
  access_request_id: string | null;
  code_type: AccessCodeType;
  status: AccessCodeStatus;
  daily_quota: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};

type AiUsageEventRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  feature: string | null;
  input_token_count: number | null;
  output_token_count: number | null;
  created_at: string;
};

type AiUsageWriteRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  feature: AiUsageFeature;
  input_token_count: number;
  output_token_count: number;
  created_at: string;
};

type AccessControlStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ACCESS_REQUESTS_TABLE?: string;
  SUPABASE_ACCESS_CODES_TABLE?: string;
  SUPABASE_AI_USAGE_EVENTS_TABLE?: string;
};

type SupabaseAccessClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseAccessClient;

type GlobalAccessControlStore = typeof globalThis & {
  [GLOBAL_ACCESS_CONTROL_STORE_KEY]?: AccessControlStore;
};

export function createMemoryAccessControlStore({
  accessRequests = [],
  accessCodes = [],
  aiUsageEvents = [],
}: {
  accessRequests?: AccessControlRequestRecord[];
  accessCodes?: AccessCodeRecord[];
  aiUsageEvents?: AiUsageEventRecord[];
} = {}): AccessControlStore {
  const requestRecords = new Map(
    accessRequests.map((record) => [record.id, normalizeAccessRequest(record)]),
  );
  const codeRecords = new Map(
    accessCodes.map((record) => [record.id, normalizeAccessCode(record)]),
  );
  const usageRecords = new Map(
    aiUsageEvents.map((record) => [record.id, normalizeAiUsageEvent(record)]),
  );

  return {
    kind: "memory",
    async listAccessRequests() {
      return Array.from(requestRecords.values())
        .sort(compareCreatedAtDesc)
        .map(cloneAccessRequest);
    },
    async getAccessRequest(id) {
      const record = requestRecords.get(id);

      return record ? cloneAccessRequest(record) : undefined;
    },
    async getLatestAccessRequestByUser(userId) {
      return Array.from(requestRecords.values())
        .filter((record) => record.userId === userId)
        .sort(compareCreatedAtDesc)
        .map(cloneAccessRequest)[0];
    },
    async saveAccessRequest(record) {
      const normalized = normalizeAccessRequest(record);
      requestRecords.set(normalized.id, normalized);
      return cloneAccessRequest(normalized);
    },
    async getActiveAccessCodeByUser(userId) {
      const now = new Date().toISOString();

      return Array.from(codeRecords.values())
        .filter((record) => isActiveAccessCodeForUser(record, userId, now))
        .sort(compareCreatedAtDesc)
        .map(cloneAccessCode)[0];
    },
    async saveAccessCode(record) {
      const normalized = normalizeAccessCode(record);
      codeRecords.set(normalized.id, normalized);
      return cloneAccessCode(normalized);
    },
    async recordAiUsageEvent(record) {
      const normalized = normalizeAiUsageEvent(record);
      usageRecords.set(normalized.id, normalized);
      return cloneAiUsageEvent(normalized);
    },
    async getDailyAiUsage({ userId, day }) {
      return summarizeUsageEventsForDay(
        Array.from(usageRecords.values()).filter(
          (record) => record.userId === userId,
        ),
        userId,
        getUsageDay(day),
      );
    },
    async getAccessStateForUser(userId, day) {
      const activeCode = await this.getActiveAccessCodeByUser(userId);

      if (activeCode) {
        const usage = await this.getDailyAiUsage({ userId, day });

        return {
          userId,
          hasAccessCode: true,
          status: "approved",
          codeType: activeCode.codeType,
          dailyQuota: activeCode.dailyQuota,
          usedToday: usage.eventCount,
        };
      }

      const latestRequest = await this.getLatestAccessRequestByUser(userId);

      return {
        userId,
        hasAccessCode: false,
        status: latestRequest?.status === "queued" ? "waitlist" : "free",
        dailyQuota: 0,
        usedToday: 0,
      };
    },
  };
}

export function getAccessControlStore(): AccessControlStore {
  return createAccessControlStoreFromEnv();
}

export function createAccessControlStoreFromEnv(
  env: AccessControlStoreEnv = process.env as AccessControlStoreEnv,
  createClient: SupabaseAccessClientFactory = createSupabaseAccessClient,
): AccessControlStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || typeof window !== "undefined") {
    return getGlobalMemoryAccessControlStore();
  }

  return createSupabaseAccessControlStore(
    createClient(supabaseUrl, serviceRoleKey),
    {
      accessRequestsTableName: env.SUPABASE_ACCESS_REQUESTS_TABLE,
      accessCodesTableName: env.SUPABASE_ACCESS_CODES_TABLE,
      aiUsageEventsTableName: env.SUPABASE_AI_USAGE_EVENTS_TABLE,
    },
  );
}

export function createSupabaseAccessControlStore(
  supabase: SupabaseAccessClient,
  {
    accessRequestsTableName = ACCESS_REQUESTS_TABLE,
    accessCodesTableName = ACCESS_CODES_TABLE,
    aiUsageEventsTableName = AI_USAGE_EVENTS_TABLE,
  }: {
    accessRequestsTableName?: string;
    accessCodesTableName?: string;
    aiUsageEventsTableName?: string;
  } = {},
): AccessControlStore {
  return {
    kind: "supabase",
    async listAccessRequests() {
      const builder = supabase.from(
        accessRequestsTableName,
      ) as SupabaseAccessRequestQueryBuilder;
      const { data, error } = await builder
        .select(ACCESS_REQUESTS_COLUMNS)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(formatSupabaseAccessError("list", error));
      }

      return (data ?? []).map(mapAccessRequestRowToRecord);
    },
    async getAccessRequest(id) {
      const builder = supabase.from(
        accessRequestsTableName,
      ) as SupabaseAccessRequestQueryBuilder;
      const { data, error } = await builder
        .select(ACCESS_REQUESTS_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseAccessError("load", error));
      }

      return data ? mapAccessRequestRowToRecord(data) : undefined;
    },
    async getLatestAccessRequestByUser(userId) {
      const builder = supabase.from(
        accessRequestsTableName,
      ) as SupabaseAccessRequestQueryBuilder;
      const { data, error } = await builder
        .select(ACCESS_REQUESTS_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseAccessError("load", error));
      }

      return data ? mapAccessRequestRowToRecord(data) : undefined;
    },
    async saveAccessRequest(record) {
      const normalized = normalizeAccessRequest(record);
      const builder = supabase.from(
        accessRequestsTableName,
      ) as SupabaseAccessRequestQueryBuilder;
      const { data, error } = await builder
        .upsert(mapAccessRequestRecordToRow(normalized), { onConflict: "id" })
        .select(ACCESS_REQUESTS_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseAccessError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved access request.");
      }

      return mapAccessRequestRowToRecord(data);
    },
    async getActiveAccessCodeByUser(userId) {
      const builder = supabase.from(
        accessCodesTableName,
      ) as SupabaseAccessCodeQueryBuilder;
      const { data, error } = await builder
        .select(ACCESS_CODES_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseAccessError("load", error));
      }

      const code = data ? mapAccessCodeRowToRecord(data) : undefined;

      return code && isActiveAccessCodeForUser(code, userId, new Date().toISOString())
        ? code
        : undefined;
    },
    async saveAccessCode(record) {
      const normalized = normalizeAccessCode(record);
      const builder = supabase.from(
        accessCodesTableName,
      ) as SupabaseAccessCodeQueryBuilder;
      const { data, error } = await builder
        .upsert(mapAccessCodeRecordToRow(normalized), { onConflict: "id" })
        .select(ACCESS_CODES_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseAccessError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved access code.");
      }

      return mapAccessCodeRowToRecord(data);
    },
    async recordAiUsageEvent(record) {
      const normalized = normalizeAiUsageEvent(record);
      const builder = supabase.from(
        aiUsageEventsTableName,
      ) as SupabaseAiUsageQueryBuilder;
      const { error } = await builder.insert(mapAiUsageEventRecordToRow(normalized));

      if (error) {
        throw new Error(formatSupabaseAccessError("save", error));
      }

      return cloneAiUsageEvent(normalized);
    },
    async getDailyAiUsage({ userId, day }) {
      const usageDay = getUsageDay(day);
      const { start, end } = getUtcDayBounds(usageDay);
      const builder = supabase.from(
        aiUsageEventsTableName,
      ) as SupabaseAiUsageQueryBuilder;
      const { data, error } = await builder
        .select(AI_USAGE_COLUMNS)
        .eq("user_id", userId)
        .gte("created_at", start)
        .lt("created_at", end);

      if (error) {
        throw new Error(formatSupabaseAccessError("load", error));
      }

      return summarizeUsageEventsForDay(
        (data ?? []).map(mapAiUsageEventRowToRecord),
        userId,
        usageDay,
      );
    },
    async getAccessStateForUser(userId, day) {
      const activeCode = await this.getActiveAccessCodeByUser(userId);

      if (activeCode) {
        const usage = await this.getDailyAiUsage({ userId, day });

        return {
          userId,
          hasAccessCode: true,
          status: "approved",
          codeType: activeCode.codeType,
          dailyQuota: activeCode.dailyQuota,
          usedToday: usage.eventCount,
        };
      }

      const latestRequest = await this.getLatestAccessRequestByUser(userId);

      return {
        userId,
        hasAccessCode: false,
        status: latestRequest?.status === "queued" ? "waitlist" : "free",
        dailyQuota: 0,
        usedToday: 0,
      };
    },
  };
}

export async function approveAccessRequest({
  requestId,
  store,
  dailyQuota,
  now = new Date().toISOString(),
}: {
  requestId: string;
  store: AccessControlStore;
  dailyQuota?: number;
  now?: string;
}): Promise<{
  request: AccessControlRequestRecord;
  accessCode: AccessCodeRecord;
}> {
  const existing = await store.getAccessRequest(requestId);

  if (!existing) {
    throw new Error("Access request not found.");
  }

  const approvedRequest = await store.saveAccessRequest({
    ...existing,
    status: "approved",
    updatedAt: now,
  });
  const accessCode = await store.saveAccessCode({
    id: getAccessCodeIdForRequest(approvedRequest.id),
    userId: approvedRequest.userId,
    accessRequestId: approvedRequest.id,
    codeType: approvedRequest.requestedCodeType,
    status: "active",
    dailyQuota: getApprovedDailyQuota(dailyQuota, approvedRequest),
    createdAt: now,
    updatedAt: now,
  });

  return {
    request: approvedRequest,
    accessCode,
  };
}

export async function declineAccessRequest({
  requestId,
  store,
  now = new Date().toISOString(),
}: {
  requestId: string;
  store: AccessControlStore;
  now?: string;
}): Promise<AccessControlRequestRecord> {
  const existing = await store.getAccessRequest(requestId);

  if (!existing) {
    throw new Error("Access request not found.");
  }

  return store.saveAccessRequest({
    ...existing,
    status: "declined",
    updatedAt: now,
  });
}

export async function getGuidedAiAccessDecision({
  userId,
  store,
  day,
}: {
  userId: string;
  store: AccessControlStore;
  day?: string;
}): Promise<GuidedAiAccessDecision> {
  const accessState = await store.getAccessStateForUser(userId, day);
  const remainingQuota = Math.max(
    0,
    accessState.dailyQuota - accessState.usedToday,
  );

  if (!accessState.hasAccessCode || accessState.status !== "approved") {
    return {
      allowed: false,
      reason: "access_required",
      accessState,
      remainingQuota,
    };
  }

  if (remainingQuota <= 0) {
    return {
      allowed: false,
      reason: "quota_exhausted",
      accessState,
      remainingQuota,
    };
  }

  return {
    allowed: true,
    accessState,
    remainingQuota,
  };
}

export async function recordGuidedAiUsageIfAllowed({
  eventId,
  userId,
  providerDraftId,
  feature,
  inputTokenCount,
  outputTokenCount,
  store,
  now = new Date().toISOString(),
}: {
  eventId?: string;
  userId: string;
  providerDraftId?: string;
  feature: AiUsageFeature;
  inputTokenCount: number;
  outputTokenCount: number;
  store: AccessControlStore;
  now?: string;
}): Promise<{
  decision: GuidedAiAccessDecision & { allowed: true };
  event: AiUsageEventRecord;
}> {
  const decision = await getGuidedAiAccessDecision({
    userId,
    store,
    day: now.slice(0, 10),
  });

  if (!decision.allowed) {
    throw new Error(
      decision.reason === "quota_exhausted"
        ? "Daily guided AI quota exhausted."
        : "Access code required for guided AI usage.",
    );
  }

  const event = await store.recordAiUsageEvent({
    id: eventId ?? createAiUsageEventId(userId, now),
    userId,
    providerDraftId,
    feature,
    inputTokenCount,
    outputTokenCount,
    createdAt: now,
  });

  return {
    decision,
    event,
  };
}

function getGlobalMemoryAccessControlStore(): AccessControlStore {
  const globalScope = globalThis as GlobalAccessControlStore;
  globalScope[GLOBAL_ACCESS_CONTROL_STORE_KEY] ??=
    createMemoryAccessControlStore();

  return globalScope[GLOBAL_ACCESS_CONTROL_STORE_KEY];
}

function createSupabaseAccessClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseAccessClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseAccessClient;
}

function getAccessCodeIdForRequest(requestId: string) {
  return `access-code-${requestId}`;
}

function createAiUsageEventId(userId: string, now: string) {
  const safeUserId = userId.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const safeTimestamp = now.replace(/[^0-9]/g, "").slice(0, 17);
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;

  return `ai-usage-${safeUserId}-${safeTimestamp}-${randomPart}`;
}

function getApprovedDailyQuota(
  dailyQuota: number | undefined,
  request: AccessControlRequestRecord,
) {
  const requestedQuota = dailyQuota ?? request.expectedDailyQuota;
  const normalizedQuota = clampNonNegativeInteger(requestedQuota, 100);

  return normalizedQuota > 0 ? normalizedQuota : 5;
}

function normalizeAccessRequest(
  record: AccessControlRequestRecord,
): AccessControlRequestRecord {
  return {
    ...record,
    providerDraftId: record.providerDraftId || undefined,
    profileName: record.profileName.trim() || "Untitled provider profile",
    sourceInvite: record.sourceInvite?.trim() || undefined,
    expectedDailyQuota: clampNonNegativeInteger(record.expectedDailyQuota, 100),
    reason: record.reason.trim() || "Access requested for guided materials.",
    abuseCostControlNote: record.abuseCostControlNote?.trim() || undefined,
  };
}

function normalizeAccessCode(record: AccessCodeRecord): AccessCodeRecord {
  return {
    ...record,
    accessRequestId: record.accessRequestId || undefined,
    dailyQuota: clampNonNegativeInteger(record.dailyQuota, 100),
    expiresAt: record.expiresAt || undefined,
  };
}

function normalizeAiUsageEvent(record: AiUsageEventRecord): AiUsageEventRecord {
  return {
    ...record,
    providerDraftId: record.providerDraftId || undefined,
    inputTokenCount: clampNonNegativeInteger(record.inputTokenCount),
    outputTokenCount: clampNonNegativeInteger(record.outputTokenCount),
  };
}

function cloneAccessRequest(
  record: AccessControlRequestRecord,
): AccessControlRequestRecord {
  return { ...record };
}

function cloneAccessCode(record: AccessCodeRecord): AccessCodeRecord {
  return { ...record };
}

function cloneAiUsageEvent(record: AiUsageEventRecord): AiUsageEventRecord {
  return { ...record };
}

function compareCreatedAtDesc(
  left: { createdAt: string },
  right: { createdAt: string },
) {
  return right.createdAt.localeCompare(left.createdAt);
}

function isActiveAccessCodeForUser(
  record: AccessCodeRecord,
  userId: string,
  now: string,
) {
  return (
    record.userId === userId &&
    record.status === "active" &&
    (!record.expiresAt || record.expiresAt > now)
  );
}

function summarizeUsageEventsForDay(
  events: AiUsageEventRecord[],
  userId: string,
  day: string,
): DailyAiUsage {
  const dailyEvents = events.filter((event) =>
    event.createdAt.startsWith(`${day}T`),
  );

  return {
    userId,
    day,
    eventCount: dailyEvents.length,
    inputTokenCount: dailyEvents.reduce(
      (total, event) => total + event.inputTokenCount,
      0,
    ),
    outputTokenCount: dailyEvents.reduce(
      (total, event) => total + event.outputTokenCount,
      0,
    ),
  };
}

function getUsageDay(day: string | undefined) {
  return day ?? new Date().toISOString().slice(0, 10);
}

function getUtcDayBounds(day: string) {
  const startDate = new Date(`${day}T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 1);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function mapAccessRequestRowToRecord(
  row: AccessRequestRow,
): AccessControlRequestRecord {
  return normalizeAccessRequest({
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    profileName: row.profile_name ?? "Untitled provider profile",
    entityType: getEntityType(row.entity_type),
    referralDirection: getReferralDirection(row.referral_direction),
    requestedCodeType: getAccessCodeType(row.requested_code_type),
    sourceInvite: row.source_invite ?? undefined,
    expectedDailyQuota: row.expected_daily_quota ?? 0,
    reason: row.reason ?? "Access requested for guided materials.",
    abuseCostControlNote: row.abuse_cost_control_note ?? undefined,
    status: getAccessRequestStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapAccessRequestRecordToRow(
  record: AccessControlRequestRecord,
): AccessRequestWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    provider_draft_id: record.providerDraftId ?? null,
    profile_name: record.profileName,
    entity_type: record.entityType,
    referral_direction: record.referralDirection,
    requested_code_type: record.requestedCodeType,
    source_invite: record.sourceInvite ?? null,
    expected_daily_quota: record.expectedDailyQuota,
    reason: record.reason,
    abuse_cost_control_note: record.abuseCostControlNote ?? null,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapAccessCodeRowToRecord(row: AccessCodeRow): AccessCodeRecord {
  return normalizeAccessCode({
    id: row.id,
    userId: row.user_id,
    accessRequestId: row.access_request_id ?? undefined,
    codeType: getAccessCodeType(row.code_type),
    status: getAccessCodeStatus(row.status),
    dailyQuota: row.daily_quota ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined,
  });
}

function mapAccessCodeRecordToRow(record: AccessCodeRecord): AccessCodeWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    access_request_id: record.accessRequestId ?? null,
    code_type: record.codeType,
    status: record.status,
    daily_quota: record.dailyQuota,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    expires_at: record.expiresAt ?? null,
  };
}

function mapAiUsageEventRowToRecord(row: AiUsageEventRow): AiUsageEventRecord {
  return normalizeAiUsageEvent({
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    feature: getAiUsageFeature(row.feature),
    inputTokenCount: row.input_token_count ?? 0,
    outputTokenCount: row.output_token_count ?? 0,
    createdAt: row.created_at,
  });
}

function mapAiUsageEventRecordToRow(
  record: AiUsageEventRecord,
): AiUsageWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    provider_draft_id: record.providerDraftId ?? null,
    feature: record.feature,
    input_token_count: record.inputTokenCount,
    output_token_count: record.outputTokenCount,
    created_at: record.createdAt,
  };
}

function getEntityType(value: string | null | undefined): EntityType {
  return value === "individual" ? "individual" : "organisation";
}

function getReferralDirection(
  value: string | null | undefined,
): ReferralDirection {
  if (value === "send" || value === "both") {
    return value;
  }

  return "receive";
}

function getAccessCodeType(value: string | null | undefined): AccessCodeType {
  if (
    value === "Referral Source Pilot" ||
    value === "Dual Role Pilot" ||
    value === "Internal Test" ||
    value === "Partner Batch"
  ) {
    return value;
  }

  return "Provider Pilot";
}

function getAccessRequestStatus(
  value: string | null | undefined,
): AccessRequestStatus {
  if (value === "approved" || value === "declined") {
    return value;
  }

  return "queued";
}

function getAccessCodeStatus(value: string | null | undefined): AccessCodeStatus {
  if (value === "revoked" || value === "expired") {
    return value;
  }

  return "active";
}

function getAiUsageFeature(value: string | null | undefined): AiUsageFeature {
  if (
    value === "profile_rewrite" ||
    value === "referral_message" ||
    value === "bilingual_intro" ||
    value === "handover_checklist" ||
    value === "ndis_case_note"
  ) {
    return value;
  }

  return "share_card";
}

function clampNonNegativeInteger(value: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.trunc(value)), max);
}

function formatSupabaseAccessError(
  action: "list" | "load" | "save",
  error: SupabaseAccessError,
) {
  const code = error.code ? ` (${error.code})` : "";

  return `Unable to ${action} access control data from Supabase${code}: ${
    error.message ?? "Unknown error"
  }`;
}
