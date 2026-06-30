import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type OutreachRecipientRole =
  | "support_coordinator"
  | "provider"
  | "community_group"
  | "case_manager"
  | "family_contact"
  | "other";

export type OutreachChannel =
  | "wechat"
  | "whatsapp"
  | "email"
  | "phone"
  | "in_person"
  | "other";

export type OutreachStatus =
  | "to_send"
  | "sent"
  | "replied"
  | "follow_up"
  | "not_suitable";

export type OutreachRecord = {
  id: string;
  userId: string;
  providerDraftId?: string;
  generatedMaterialDraftId?: string;
  recipientName: string;
  organisation?: string;
  roleType: OutreachRecipientRole;
  channel: OutreachChannel;
  status: OutreachStatus;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachStore = {
  kind: "memory" | "supabase";
  saveOutreach(record: OutreachRecord): Promise<OutreachRecord>;
  getOutreach(id: string): Promise<OutreachRecord | undefined>;
  listOutreachByUser(input: {
    userId: string;
    providerDraftId?: string;
    status?: OutreachStatus;
    limit?: number;
  }): Promise<OutreachRecord[]>;
};

const GLOBAL_OUTREACH_STORE_KEY = "__careslinkAiOutreachStore__";
const OUTREACH_TABLE = "outreach_records";
const OUTREACH_COLUMNS =
  "id, user_id, provider_draft_id, generated_material_draft_id, recipient_name, organisation, role_type, channel, status, last_contacted_at, next_follow_up_at, notes, created_at, updated_at";

export const outreachSupabaseSchemaSql = `
create table if not exists public.outreach_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  generated_material_draft_id text references public.generated_material_drafts(id) on delete set null,
  recipient_name text not null,
  organisation text,
  role_type text not null
    check (role_type in (
      'support_coordinator',
      'provider',
      'community_group',
      'case_manager',
      'family_contact',
      'other'
    )),
  channel text not null
    check (channel in (
      'wechat',
      'whatsapp',
      'email',
      'phone',
      'in_person',
      'other'
    )),
  status text not null
    check (status in (
      'to_send',
      'sent',
      'replied',
      'follow_up',
      'not_suitable'
    )),
  last_contacted_at date,
  next_follow_up_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_records_user_id_created_at_idx
  on public.outreach_records(user_id, created_at desc);

create index if not exists outreach_records_provider_draft_id_idx
  on public.outreach_records(provider_draft_id);

create index if not exists outreach_records_status_idx
  on public.outreach_records(status);

create index if not exists outreach_records_next_follow_up_at_idx
  on public.outreach_records(next_follow_up_at);

alter table public.outreach_records enable row level security;

grant select, insert, update, delete on public.outreach_records to service_role;
revoke all on public.outreach_records from anon, authenticated;
`;

type OutreachStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_OUTREACH_TABLE?: string;
};

type SupabaseOutreachClient = {
  from(tableName: string): unknown;
};

type SupabaseOutreachClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseOutreachClient;

type SupabaseOutreachError = {
  message?: string;
  code?: string;
};

type OutreachRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  generated_material_draft_id: string | null;
  recipient_name: string | null;
  organisation: string | null;
  role_type: string | null;
  channel: string | null;
  status: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type OutreachWriteRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  generated_material_draft_id: string | null;
  recipient_name: string;
  organisation: string | null;
  role_type: OutreachRecipientRole;
  channel: OutreachChannel;
  status: OutreachStatus;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type OutreachListResult = {
  data: OutreachRow[] | null;
  error: SupabaseOutreachError | null;
};

type OutreachSingleResult = {
  data: OutreachRow | null;
  error: SupabaseOutreachError | null;
};

type OutreachQueryBuilder = {
  select(columns: string): OutreachQueryBuilder;
  eq(column: string, value: string): OutreachQueryBuilder;
  order(column: string, options: { ascending: boolean }): OutreachQueryBuilder;
  limit(count: number): OutreachQueryBuilder;
  maybeSingle(): Promise<OutreachSingleResult>;
  then<TResult1 = OutreachListResult, TResult2 = never>(
    onfulfilled?:
      | ((value: OutreachListResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
  upsert(
    row: OutreachWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<OutreachSingleResult>;
    };
  };
};

type GlobalOutreachStore = typeof globalThis & {
  [GLOBAL_OUTREACH_STORE_KEY]?: OutreachStore;
};

export function createOutreachRecord({
  userId,
  providerDraftId,
  generatedMaterialDraftId,
  recipientName,
  organisation,
  roleType = "other",
  channel = "other",
  status = "to_send",
  lastContactedAt,
  nextFollowUpAt,
  notes,
  now = new Date().toISOString(),
}: {
  userId: string;
  providerDraftId?: string;
  generatedMaterialDraftId?: string;
  recipientName: string;
  organisation?: string;
  roleType?: OutreachRecipientRole;
  channel?: OutreachChannel;
  status?: OutreachStatus;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  notes?: string;
  now?: string;
}): OutreachRecord {
  return normalizeOutreachRecord({
    id: createOutreachId(userId, now),
    userId,
    providerDraftId,
    generatedMaterialDraftId,
    recipientName,
    organisation,
    roleType,
    channel,
    status,
    lastContactedAt,
    nextFollowUpAt,
    notes,
    createdAt: now,
    updatedAt: now,
  });
}

export function createMemoryOutreachStore(
  initialRecords: OutreachRecord[] = [],
): OutreachStore {
  const records = new Map(
    initialRecords.map((record) => [record.id, normalizeOutreachRecord(record)]),
  );

  return {
    kind: "memory",
    async saveOutreach(record) {
      const normalized = normalizeOutreachRecord(record);
      records.set(normalized.id, normalized);

      return cloneOutreachRecord(normalized);
    },
    async getOutreach(id) {
      const record = records.get(id);

      return record ? cloneOutreachRecord(record) : undefined;
    },
    async listOutreachByUser({ userId, providerDraftId, status, limit }) {
      return filterOutreachRecords({
        records: Array.from(records.values()),
        userId,
        providerDraftId,
        status,
        limit,
      });
    },
  };
}

export function getOutreachStore(): OutreachStore {
  return createOutreachStoreFromEnv();
}

export function createOutreachStoreFromEnv(
  env: OutreachStoreEnv = process.env as OutreachStoreEnv,
  createClient: SupabaseOutreachClientFactory = createSupabaseOutreachClient,
): OutreachStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || typeof window !== "undefined") {
    return getGlobalMemoryOutreachStore();
  }

  return createSupabaseOutreachStore(createClient(supabaseUrl, serviceRoleKey), {
    tableName: env.SUPABASE_OUTREACH_TABLE,
  });
}

export function createSupabaseOutreachStore(
  supabase: SupabaseOutreachClient,
  { tableName = OUTREACH_TABLE }: { tableName?: string } = {},
): OutreachStore {
  return {
    kind: "supabase",
    async saveOutreach(record) {
      const normalized = normalizeOutreachRecord(record);
      const builder = supabase.from(tableName) as OutreachQueryBuilder;
      const { data, error } = await builder
        .upsert(mapOutreachRecordToRow(normalized), { onConflict: "id" })
        .select(OUTREACH_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseOutreachError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved outreach record.");
      }

      return mapOutreachRowToRecord(data);
    },
    async getOutreach(id) {
      const builder = supabase.from(tableName) as OutreachQueryBuilder;
      const { data, error } = await builder
        .select(OUTREACH_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseOutreachError("load", error));
      }

      return data ? mapOutreachRowToRecord(data) : undefined;
    },
    async listOutreachByUser({ userId, providerDraftId, status, limit }) {
      let builder = (supabase.from(tableName) as OutreachQueryBuilder)
        .select(OUTREACH_COLUMNS)
        .eq("user_id", userId);

      if (providerDraftId) {
        builder = builder.eq("provider_draft_id", providerDraftId);
      }

      if (status) {
        builder = builder.eq("status", status);
      }

      const { data, error } = await builder
        .order("created_at", { ascending: false })
        .limit(clampOutreachLimit(limit));

      if (error) {
        throw new Error(formatSupabaseOutreachError("load", error));
      }

      return (data ?? []).map(mapOutreachRowToRecord);
    },
  };
}

function getGlobalMemoryOutreachStore(): OutreachStore {
  const globalScope = globalThis as GlobalOutreachStore;
  globalScope[GLOBAL_OUTREACH_STORE_KEY] ??= createMemoryOutreachStore();

  return globalScope[GLOBAL_OUTREACH_STORE_KEY];
}

function createSupabaseOutreachClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseOutreachClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseOutreachClient;
}

function normalizeOutreachRecord(record: OutreachRecord): OutreachRecord {
  return {
    ...record,
    providerDraftId: record.providerDraftId || undefined,
    generatedMaterialDraftId: record.generatedMaterialDraftId || undefined,
    recipientName: record.recipientName.trim() || "Unspecified recipient",
    organisation: record.organisation?.trim() || undefined,
    roleType: getOutreachRole(record.roleType),
    channel: getOutreachChannel(record.channel),
    status: getOutreachStatus(record.status),
    lastContactedAt: getOptionalIsoDate(record.lastContactedAt),
    nextFollowUpAt: getOptionalIsoDate(record.nextFollowUpAt),
    notes: record.notes?.trim() || undefined,
  };
}

function cloneOutreachRecord(record: OutreachRecord): OutreachRecord {
  return { ...record };
}

function filterOutreachRecords({
  records,
  userId,
  providerDraftId,
  status,
  limit,
}: {
  records: OutreachRecord[];
  userId: string;
  providerDraftId?: string;
  status?: OutreachStatus;
  limit?: number;
}) {
  return records
    .filter(
      (record) =>
        record.userId === userId &&
        (!providerDraftId || record.providerDraftId === providerDraftId) &&
        (!status || record.status === status),
    )
    .sort(compareOutreachCreatedAtDesc)
    .slice(0, clampOutreachLimit(limit))
    .map(cloneOutreachRecord);
}

function compareOutreachCreatedAtDesc(left: OutreachRecord, right: OutreachRecord) {
  return right.createdAt.localeCompare(left.createdAt);
}

function clampOutreachLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) {
    return 25;
  }

  return Math.min(Math.max(1, Math.trunc(limit ?? 25)), 100);
}

function createOutreachId(userId: string, now: string) {
  const safeUserId = userId.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const safeTimestamp = now.replace(/[^0-9]/g, "").slice(0, 17);
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;

  return `outreach-${safeUserId}-${safeTimestamp}-${randomPart}`;
}

function mapOutreachRecordToRow(record: OutreachRecord): OutreachWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    provider_draft_id: record.providerDraftId ?? null,
    generated_material_draft_id: record.generatedMaterialDraftId ?? null,
    recipient_name: record.recipientName,
    organisation: record.organisation ?? null,
    role_type: record.roleType,
    channel: record.channel,
    status: record.status,
    last_contacted_at: record.lastContactedAt ?? null,
    next_follow_up_at: record.nextFollowUpAt ?? null,
    notes: record.notes ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapOutreachRowToRecord(row: OutreachRow): OutreachRecord {
  return normalizeOutreachRecord({
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    generatedMaterialDraftId: row.generated_material_draft_id ?? undefined,
    recipientName: row.recipient_name ?? "Unspecified recipient",
    organisation: row.organisation ?? undefined,
    roleType: getOutreachRole(row.role_type),
    channel: getOutreachChannel(row.channel),
    status: getOutreachStatus(row.status),
    lastContactedAt: row.last_contacted_at ?? undefined,
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function getOutreachRole(value: unknown): OutreachRecipientRole {
  if (
    value === "support_coordinator" ||
    value === "provider" ||
    value === "community_group" ||
    value === "case_manager" ||
    value === "family_contact"
  ) {
    return value;
  }

  return "other";
}

function getOutreachChannel(value: unknown): OutreachChannel {
  if (
    value === "wechat" ||
    value === "whatsapp" ||
    value === "email" ||
    value === "phone" ||
    value === "in_person"
  ) {
    return value;
  }

  return "other";
}

function getOutreachStatus(value: unknown): OutreachStatus {
  if (
    value === "sent" ||
    value === "replied" ||
    value === "follow_up" ||
    value === "not_suitable"
  ) {
    return value;
  }

  return "to_send";
}

function getOptionalIsoDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function formatSupabaseOutreachError(
  action: "load" | "save",
  error: SupabaseOutreachError,
) {
  const code = error.code ? ` (${error.code})` : "";

  return `Unable to ${action} outreach records from Supabase${code}: ${
    error.message ?? "Unknown error"
  }`;
}
