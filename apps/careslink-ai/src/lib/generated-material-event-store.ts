import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AiUsageFeature } from "./access-control-store";

export type GeneratedMaterialEventType =
  | "copy_all"
  | "copy_field"
  | "mark_reviewed"
  | "archive";

export type GeneratedMaterialEventRecord = {
  id: string;
  userId: string;
  providerDraftId?: string;
  generatedMaterialDraftId: string;
  feature: AiUsageFeature;
  eventType: GeneratedMaterialEventType;
  fieldKey?: string;
  createdAt: string;
};

export type GeneratedMaterialEventStore = {
  kind: "memory" | "supabase";
  saveGeneratedMaterialEvent(
    record: GeneratedMaterialEventRecord,
  ): Promise<GeneratedMaterialEventRecord>;
  listGeneratedMaterialEvents(input?: {
    userId?: string;
    generatedMaterialDraftId?: string;
    eventType?: GeneratedMaterialEventType;
    excludeFeature?: AiUsageFeature;
    limit?: number;
  }): Promise<GeneratedMaterialEventRecord[]>;
};

const GLOBAL_GENERATED_MATERIAL_EVENT_STORE_KEY =
  "__careslinkAiGeneratedMaterialEventStore__";
const GENERATED_MATERIAL_EVENTS_TABLE = "generated_material_events";
const GENERATED_MATERIAL_EVENTS_COLUMNS =
  "id, user_id, provider_draft_id, generated_material_draft_id, feature, event_type, field_key, created_at";

export const generatedMaterialEventSupabaseSchemaSql = `
create table if not exists public.generated_material_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  generated_material_draft_id text not null references public.generated_material_drafts(id) on delete cascade,
  feature text not null
    check (feature in (
      'profile_rewrite',
      'share_card',
      'referral_message',
      'bilingual_intro',
      'handover_checklist',
      'ndis_case_note'
    )),
  event_type text not null
    check (event_type in ('copy_all', 'copy_field', 'mark_reviewed', 'archive')),
  field_key text,
  created_at timestamptz not null default now()
);

create index if not exists generated_material_events_user_id_created_at_idx
  on public.generated_material_events(user_id, created_at desc);

create index if not exists generated_material_events_generated_material_draft_id_idx
  on public.generated_material_events(generated_material_draft_id);

create index if not exists generated_material_events_event_type_idx
  on public.generated_material_events(event_type);

alter table public.generated_material_events enable row level security;

grant select, insert, update, delete on public.generated_material_events to service_role;
revoke all on public.generated_material_events from anon, authenticated;
`;

type GeneratedMaterialEventStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_GENERATED_MATERIAL_EVENTS_TABLE?: string;
};

type SupabaseGeneratedMaterialEventClient = {
  from(tableName: string): unknown;
};

type SupabaseGeneratedMaterialEventClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseGeneratedMaterialEventClient;

type SupabaseGeneratedMaterialEventError = {
  message?: string;
  code?: string;
};

type SupabaseGeneratedMaterialEventRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  generated_material_draft_id: string;
  feature: string | null;
  event_type: string | null;
  field_key: string | null;
  created_at: string;
};

type SupabaseGeneratedMaterialEventWriteRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  generated_material_draft_id: string;
  feature: AiUsageFeature;
  event_type: GeneratedMaterialEventType;
  field_key: string | null;
  created_at: string;
};

type SupabaseGeneratedMaterialEventListResult = {
  data: SupabaseGeneratedMaterialEventRow[] | null;
  error: SupabaseGeneratedMaterialEventError | null;
};

type SupabaseGeneratedMaterialEventQueryBuilder = {
  select(columns: string): SupabaseGeneratedMaterialEventQueryBuilder;
  eq(column: string, value: string): SupabaseGeneratedMaterialEventQueryBuilder;
  neq(column: string, value: string): SupabaseGeneratedMaterialEventQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseGeneratedMaterialEventQueryBuilder;
  limit(count: number): SupabaseGeneratedMaterialEventQueryBuilder;
  then<TResult1 = SupabaseGeneratedMaterialEventListResult, TResult2 = never>(
    onfulfilled?:
      | ((
          value: SupabaseGeneratedMaterialEventListResult,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
  upsert(
    row: SupabaseGeneratedMaterialEventWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<{
        data: SupabaseGeneratedMaterialEventRow | null;
        error: SupabaseGeneratedMaterialEventError | null;
      }>;
    };
  };
};

type GlobalGeneratedMaterialEventStore = typeof globalThis & {
  [GLOBAL_GENERATED_MATERIAL_EVENT_STORE_KEY]?: GeneratedMaterialEventStore;
};

export function createGeneratedMaterialEventRecord({
  userId,
  providerDraftId,
  generatedMaterialDraftId,
  feature,
  eventType,
  fieldKey,
  now = new Date().toISOString(),
}: {
  userId: string;
  providerDraftId?: string;
  generatedMaterialDraftId: string;
  feature: AiUsageFeature;
  eventType: GeneratedMaterialEventType;
  fieldKey?: string;
  now?: string;
}): GeneratedMaterialEventRecord {
  return normalizeGeneratedMaterialEvent({
    id: createGeneratedMaterialEventId(userId, now),
    userId,
    providerDraftId,
    generatedMaterialDraftId,
    feature,
    eventType,
    fieldKey,
    createdAt: now,
  });
}

export function createMemoryGeneratedMaterialEventStore(
  initialRecords: GeneratedMaterialEventRecord[] = [],
): GeneratedMaterialEventStore {
  const records = new Map(
    initialRecords.map((record) => [
      record.id,
      normalizeGeneratedMaterialEvent(record),
    ]),
  );

  return {
    kind: "memory",
    async saveGeneratedMaterialEvent(record) {
      const normalized = normalizeGeneratedMaterialEvent(record);
      records.set(normalized.id, normalized);

      return cloneGeneratedMaterialEvent(normalized);
    },
    async listGeneratedMaterialEvents(input = {}) {
      return filterGeneratedMaterialEvents({
        records: Array.from(records.values()),
        ...input,
      });
    },
  };
}

export function getGeneratedMaterialEventStore(): GeneratedMaterialEventStore {
  return createGeneratedMaterialEventStoreFromEnv();
}

export function createGeneratedMaterialEventStoreFromEnv(
  env: GeneratedMaterialEventStoreEnv = process.env as GeneratedMaterialEventStoreEnv,
  createClient: SupabaseGeneratedMaterialEventClientFactory =
    createSupabaseGeneratedMaterialEventClient,
): GeneratedMaterialEventStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || typeof window !== "undefined") {
    return getGlobalMemoryGeneratedMaterialEventStore();
  }

  return createSupabaseGeneratedMaterialEventStore(
    createClient(supabaseUrl, serviceRoleKey),
    {
      tableName: env.SUPABASE_GENERATED_MATERIAL_EVENTS_TABLE,
    },
  );
}

export function createSupabaseGeneratedMaterialEventStore(
  supabase: SupabaseGeneratedMaterialEventClient,
  { tableName = GENERATED_MATERIAL_EVENTS_TABLE }: { tableName?: string } = {},
): GeneratedMaterialEventStore {
  return {
    kind: "supabase",
    async saveGeneratedMaterialEvent(record) {
      const normalized = normalizeGeneratedMaterialEvent(record);
      const builder = supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialEventQueryBuilder;
      const { data, error } = await builder
        .upsert(mapGeneratedMaterialEventRecordToRow(normalized), {
          onConflict: "id",
        })
        .select(GENERATED_MATERIAL_EVENTS_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialEventError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved material event.");
      }

      return mapGeneratedMaterialEventRowToRecord(data);
    },
    async listGeneratedMaterialEvents({
      userId,
      generatedMaterialDraftId,
      eventType,
      excludeFeature,
      limit,
    } = {}) {
      let builder = (supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialEventQueryBuilder)
        .select(GENERATED_MATERIAL_EVENTS_COLUMNS)
        .order("created_at", { ascending: false });

      if (userId) {
        builder = builder.eq("user_id", userId);
      }

      if (generatedMaterialDraftId) {
        builder = builder.eq("generated_material_draft_id", generatedMaterialDraftId);
      }

      if (eventType) {
        builder = builder.eq("event_type", eventType);
      }

      if (excludeFeature) {
        builder = builder.neq("feature", excludeFeature);
      }

      const { data, error } = await builder.limit(
        clampGeneratedMaterialEventLimit(limit),
      );

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialEventError("load", error));
      }

      return (data ?? []).map(mapGeneratedMaterialEventRowToRecord);
    },
  };
}

function getGlobalMemoryGeneratedMaterialEventStore(): GeneratedMaterialEventStore {
  const globalScope = globalThis as GlobalGeneratedMaterialEventStore;
  globalScope[GLOBAL_GENERATED_MATERIAL_EVENT_STORE_KEY] ??=
    createMemoryGeneratedMaterialEventStore();

  return globalScope[GLOBAL_GENERATED_MATERIAL_EVENT_STORE_KEY];
}

function createSupabaseGeneratedMaterialEventClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseGeneratedMaterialEventClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseGeneratedMaterialEventClient;
}

function normalizeGeneratedMaterialEvent(
  record: GeneratedMaterialEventRecord,
): GeneratedMaterialEventRecord {
  return {
    ...record,
    providerDraftId: record.providerDraftId || undefined,
    feature: getGeneratedMaterialFeature(record.feature),
    eventType: getGeneratedMaterialEventType(record.eventType),
    fieldKey: record.fieldKey?.trim() || undefined,
  };
}

function cloneGeneratedMaterialEvent(
  record: GeneratedMaterialEventRecord,
): GeneratedMaterialEventRecord {
  return { ...record };
}

function filterGeneratedMaterialEvents({
  records,
  userId,
  generatedMaterialDraftId,
  eventType,
  excludeFeature,
  limit,
}: {
  records: GeneratedMaterialEventRecord[];
  userId?: string;
  generatedMaterialDraftId?: string;
  eventType?: GeneratedMaterialEventType;
  excludeFeature?: AiUsageFeature;
  limit?: number;
}) {
  return records
    .filter(
      (record) =>
        (!userId || record.userId === userId) &&
        (!generatedMaterialDraftId ||
          record.generatedMaterialDraftId === generatedMaterialDraftId) &&
        (!eventType || record.eventType === eventType) &&
        record.feature !== excludeFeature,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, clampGeneratedMaterialEventLimit(limit))
    .map(cloneGeneratedMaterialEvent);
}

function clampGeneratedMaterialEventLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.min(Math.max(1, Math.trunc(limit ?? 100)), 500);
}

function createGeneratedMaterialEventId(userId: string, now: string) {
  const safeUserId = userId.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const safeTimestamp = now.replace(/[^0-9]/g, "").slice(0, 17);
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;

  return `generated-material-event-${safeUserId}-${safeTimestamp}-${randomPart}`;
}

function mapGeneratedMaterialEventRecordToRow(
  record: GeneratedMaterialEventRecord,
): SupabaseGeneratedMaterialEventWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    provider_draft_id: record.providerDraftId ?? null,
    generated_material_draft_id: record.generatedMaterialDraftId,
    feature: record.feature,
    event_type: record.eventType,
    field_key: record.fieldKey ?? null,
    created_at: record.createdAt,
  };
}

function mapGeneratedMaterialEventRowToRecord(
  row: SupabaseGeneratedMaterialEventRow,
): GeneratedMaterialEventRecord {
  return normalizeGeneratedMaterialEvent({
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    generatedMaterialDraftId: row.generated_material_draft_id,
    feature: getGeneratedMaterialFeature(row.feature),
    eventType: getGeneratedMaterialEventType(row.event_type),
    fieldKey: row.field_key ?? undefined,
    createdAt: row.created_at,
  });
}

function getGeneratedMaterialFeature(value: unknown): AiUsageFeature {
  if (
    value === "share_card" ||
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

function getGeneratedMaterialEventType(
  value: unknown,
): GeneratedMaterialEventType {
  if (
    value === "copy_field" ||
    value === "mark_reviewed" ||
    value === "archive"
  ) {
    return value;
  }

  return "copy_all";
}

function formatSupabaseGeneratedMaterialEventError(
  action: "load" | "save",
  error: SupabaseGeneratedMaterialEventError,
) {
  const code = error.code ? ` (${error.code})` : "";

  return `Unable to ${action} generated material event from Supabase${code}: ${
    error.message ?? "Unknown error"
  }`;
}
