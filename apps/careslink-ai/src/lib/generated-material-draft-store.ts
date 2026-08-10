import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AiUsageFeature } from "./access-control-store";

export type GeneratedMaterialDraftStatus = "draft" | "reviewed" | "archived";

export type GeneratedMaterialDraftRecord = {
  id: string;
  userId: string;
  providerDraftId?: string;
  feature: AiUsageFeature;
  status: GeneratedMaterialDraftStatus;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedMaterialDraftMetadataRecord = Omit<
  GeneratedMaterialDraftRecord,
  "content"
>;

export type GeneratedMaterialDraftStore = {
  kind: "memory" | "supabase";
  getGeneratedMaterialDraft(
    id: string,
  ): Promise<GeneratedMaterialDraftRecord | undefined>;
  listGeneratedMaterialDraftsByUser(input: {
    userId: string;
    feature?: AiUsageFeature;
    providerDraftId?: string;
    limit?: number;
  }): Promise<GeneratedMaterialDraftRecord[]>;
  listGeneratedMaterialDraftMetadata(input?: {
    limit?: number;
    excludeFeature?: AiUsageFeature;
  }): Promise<GeneratedMaterialDraftMetadataRecord[]>;
  getLatestGeneratedMaterialDraftByUser(input: {
    userId: string;
    feature?: AiUsageFeature;
    providerDraftId?: string;
  }): Promise<GeneratedMaterialDraftRecord | undefined>;
  saveGeneratedMaterialDraft(
    record: GeneratedMaterialDraftRecord,
  ): Promise<GeneratedMaterialDraftRecord>;
  deleteGeneratedMaterialDraftByUser(input: {
    draftId: string;
    userId: string;
    feature: AiUsageFeature;
  }): Promise<GeneratedMaterialDraftMetadataRecord | undefined>;
};

const GLOBAL_GENERATED_MATERIAL_DRAFT_STORE_KEY =
  "__careslinkAiGeneratedMaterialDraftStore__";
const GENERATED_MATERIAL_DRAFTS_TABLE = "generated_material_drafts";
const GENERATED_MATERIAL_DRAFTS_COLUMNS =
  "id, user_id, provider_draft_id, feature, status, content, created_at, updated_at";
const GENERATED_MATERIAL_DRAFT_METADATA_COLUMNS =
  "id, user_id, provider_draft_id, feature, status, created_at, updated_at";

export const generatedMaterialDraftSupabaseSchemaSql = `
create table if not exists public.generated_material_drafts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  feature text not null
    check (feature in (
      'profile_rewrite',
      'share_card',
      'referral_message',
      'bilingual_intro',
      'handover_checklist',
      'ndis_case_note'
    )),
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'archived')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_material_drafts_user_id_created_at_idx
  on public.generated_material_drafts(user_id, created_at desc);

create index if not exists generated_material_drafts_provider_draft_id_idx
  on public.generated_material_drafts(provider_draft_id);

create index if not exists generated_material_drafts_feature_idx
  on public.generated_material_drafts(feature);

create index if not exists generated_material_drafts_status_idx
  on public.generated_material_drafts(status);

alter table public.generated_material_drafts enable row level security;

grant select, insert, update, delete on public.generated_material_drafts to service_role;
revoke all on public.generated_material_drafts from public;
revoke all on public.generated_material_drafts from anon, authenticated;
grant select, delete on public.generated_material_drafts to authenticated;

drop policy if exists generated_material_drafts_owner_select
  on public.generated_material_drafts;
create policy generated_material_drafts_owner_select
  on public.generated_material_drafts
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

drop policy if exists generated_material_drafts_owner_delete
  on public.generated_material_drafts;
create policy generated_material_drafts_owner_delete
  on public.generated_material_drafts
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );
`;

type GeneratedMaterialDraftStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_GENERATED_MATERIAL_DRAFTS_TABLE?: string;
};

type SupabaseGeneratedMaterialClient = {
  from(tableName: string): unknown;
};

type SupabaseGeneratedMaterialClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseGeneratedMaterialClient;

type SupabaseGeneratedMaterialError = {
  message?: string;
  code?: string;
};

type SupabaseGeneratedMaterialRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  feature: string | null;
  status: string | null;
  content?: unknown;
  created_at: string;
  updated_at: string;
};

type SupabaseGeneratedMaterialWriteRow = {
  id: string;
  user_id: string;
  provider_draft_id: string | null;
  feature: AiUsageFeature;
  status: GeneratedMaterialDraftStatus;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type SupabaseGeneratedMaterialQueryBuilder = {
  delete(): SupabaseGeneratedMaterialQueryBuilder;
  select(columns: string): SupabaseGeneratedMaterialQueryBuilder;
  eq(column: string, value: string): SupabaseGeneratedMaterialQueryBuilder;
  neq(column: string, value: string): SupabaseGeneratedMaterialQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseGeneratedMaterialQueryBuilder;
  limit(count: number): SupabaseGeneratedMaterialQueryBuilder;
  maybeSingle(): Promise<{
    data: SupabaseGeneratedMaterialRow | null;
    error: SupabaseGeneratedMaterialError | null;
  }>;
  then<TResult1 = SupabaseGeneratedMaterialListResult, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseGeneratedMaterialListResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
  upsert(
    row: SupabaseGeneratedMaterialWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<{
        data: SupabaseGeneratedMaterialRow | null;
        error: SupabaseGeneratedMaterialError | null;
      }>;
    };
  };
};

type SupabaseGeneratedMaterialListResult = {
  data: SupabaseGeneratedMaterialRow[] | null;
  error: SupabaseGeneratedMaterialError | null;
};

type GlobalGeneratedMaterialDraftStore = typeof globalThis & {
  [GLOBAL_GENERATED_MATERIAL_DRAFT_STORE_KEY]?: GeneratedMaterialDraftStore;
};

export function createGeneratedMaterialDraftRecord({
  userId,
  providerDraftId,
  feature,
  content,
  now = new Date().toISOString(),
}: {
  userId: string;
  providerDraftId?: string;
  feature: AiUsageFeature;
  content: Record<string, unknown>;
  now?: string;
}): GeneratedMaterialDraftRecord {
  return normalizeGeneratedMaterialDraft({
    id: createGeneratedMaterialDraftId(userId, now),
    userId,
    providerDraftId,
    feature,
    status: "draft",
    content,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateGeneratedMaterialDraftStatus({
  draftId,
  userId,
  status,
  store,
  now = new Date().toISOString(),
}: {
  draftId: string;
  userId: string;
  status: GeneratedMaterialDraftStatus;
  store: GeneratedMaterialDraftStore;
  now?: string;
}): Promise<GeneratedMaterialDraftRecord | undefined> {
  const existing = await store.getGeneratedMaterialDraft(draftId);

  if (!existing || existing.userId !== userId) {
    return undefined;
  }

  return store.saveGeneratedMaterialDraft({
    ...existing,
    status,
    updatedAt: now,
  });
}

export function createMemoryGeneratedMaterialDraftStore(
  initialRecords: GeneratedMaterialDraftRecord[] = [],
): GeneratedMaterialDraftStore {
  const records = new Map(
    initialRecords.map((record) => [
      record.id,
      normalizeGeneratedMaterialDraft(record),
    ]),
  );

  return {
    kind: "memory",
    async getGeneratedMaterialDraft(id) {
      const record = records.get(id);

      return record ? cloneGeneratedMaterialDraft(record) : undefined;
    },
    async listGeneratedMaterialDraftsByUser({
      userId,
      feature,
      providerDraftId,
      limit,
    }) {
      return filterGeneratedMaterialDrafts({
        records: Array.from(records.values()),
        userId,
        feature,
        providerDraftId,
        limit,
      });
    },
    async listGeneratedMaterialDraftMetadata({ limit, excludeFeature } = {}) {
      return Array.from(records.values())
        .filter((record) => record.feature !== excludeFeature)
        .sort(compareGeneratedMaterialCreatedAtDesc)
        .slice(0, clampGeneratedMaterialLimit(limit))
        .map(mapGeneratedMaterialRecordToMetadata);
    },
    async getLatestGeneratedMaterialDraftByUser({
      userId,
      feature,
      providerDraftId,
    }) {
      return Array.from(records.values())
        .filter((record) =>
          doesGeneratedMaterialDraftMatch({
            record,
            userId,
            feature,
            providerDraftId,
          }),
        )
        .sort(compareGeneratedMaterialCreatedAtDesc)
        .map(cloneGeneratedMaterialDraft)[0];
    },
    async saveGeneratedMaterialDraft(record) {
      const normalized = normalizeGeneratedMaterialDraft(record);
      records.set(normalized.id, normalized);

      return cloneGeneratedMaterialDraft(normalized);
    },
    async deleteGeneratedMaterialDraftByUser({ draftId, userId, feature }) {
      const record = records.get(draftId);

      if (
        !record ||
        record.userId !== userId ||
        record.feature !== feature
      ) {
        return undefined;
      }

      records.delete(draftId);
      return mapGeneratedMaterialRecordToMetadata(record);
    },
  };
}

export function getGeneratedMaterialDraftStore(): GeneratedMaterialDraftStore {
  return createGeneratedMaterialDraftStoreFromEnv();
}

export function createGeneratedMaterialDraftStoreFromEnv(
  env: GeneratedMaterialDraftStoreEnv = process.env as GeneratedMaterialDraftStoreEnv,
  createClient: SupabaseGeneratedMaterialClientFactory =
    createSupabaseGeneratedMaterialClient,
): GeneratedMaterialDraftStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || typeof window !== "undefined") {
    return getGlobalMemoryGeneratedMaterialDraftStore();
  }

  return createSupabaseGeneratedMaterialDraftStore(
    createClient(supabaseUrl, serviceRoleKey),
    {
      tableName: env.SUPABASE_GENERATED_MATERIAL_DRAFTS_TABLE,
    },
  );
}

export function createSupabaseGeneratedMaterialDraftStore(
  supabase: SupabaseGeneratedMaterialClient,
  { tableName = GENERATED_MATERIAL_DRAFTS_TABLE }: { tableName?: string } = {},
): GeneratedMaterialDraftStore {
  return {
    kind: "supabase",
    async getGeneratedMaterialDraft(id) {
      const builder = supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder;
      const { data, error } = await builder
        .select(GENERATED_MATERIAL_DRAFTS_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("load", error));
      }

      return data ? mapGeneratedMaterialRowToRecord(data) : undefined;
    },
    async listGeneratedMaterialDraftsByUser({
      userId,
      feature,
      providerDraftId,
      limit,
    }) {
      let builder = (supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder)
        .select(GENERATED_MATERIAL_DRAFTS_COLUMNS)
        .eq("user_id", userId);

      if (feature) {
        builder = builder.eq("feature", feature);
      }

      if (providerDraftId) {
        builder = builder.eq("provider_draft_id", providerDraftId);
      }

      const { data, error } = await builder
        .order("created_at", { ascending: false })
        .limit(clampGeneratedMaterialLimit(limit));

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("load", error));
      }

      return (data ?? []).map(mapGeneratedMaterialRowToRecord);
    },
    async listGeneratedMaterialDraftMetadata({ limit, excludeFeature } = {}) {
      let builder = (supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder)
        .select(GENERATED_MATERIAL_DRAFT_METADATA_COLUMNS);

      if (excludeFeature) {
        builder = builder.neq("feature", excludeFeature);
      }

      builder = builder
        .order("created_at", { ascending: false })
        .limit(clampGeneratedMaterialLimit(limit));
      const { data, error } = await builder;

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("load", error));
      }

      return (data ?? []).map(mapGeneratedMaterialRowToMetadata);
    },
    async getLatestGeneratedMaterialDraftByUser({
      userId,
      feature,
      providerDraftId,
    }) {
      let builder = (supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder)
        .select(GENERATED_MATERIAL_DRAFTS_COLUMNS)
        .eq("user_id", userId);

      if (feature) {
        builder = builder.eq("feature", feature);
      }

      if (providerDraftId) {
        builder = builder.eq("provider_draft_id", providerDraftId);
      }

      const { data, error } = await builder
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("load", error));
      }

      return data ? mapGeneratedMaterialRowToRecord(data) : undefined;
    },
    async saveGeneratedMaterialDraft(record) {
      const normalized = normalizeGeneratedMaterialDraft(record);
      const builder = supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder;
      const { data, error } = await builder
        .upsert(mapGeneratedMaterialRecordToRow(normalized), {
          onConflict: "id",
        })
        .select(GENERATED_MATERIAL_DRAFTS_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved material draft.");
      }

      return mapGeneratedMaterialRowToRecord(data);
    },
    async deleteGeneratedMaterialDraftByUser({ draftId, userId, feature }) {
      const builder = supabase.from(
        tableName,
      ) as SupabaseGeneratedMaterialQueryBuilder;
      const { data, error } = await builder
        .delete()
        .eq("id", draftId)
        .eq("user_id", userId)
        .eq("feature", feature)
        .select(GENERATED_MATERIAL_DRAFT_METADATA_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseGeneratedMaterialError("delete", error));
      }

      return data ? mapGeneratedMaterialRowToMetadata(data) : undefined;
    },
  };
}

function getGlobalMemoryGeneratedMaterialDraftStore(): GeneratedMaterialDraftStore {
  const globalScope = globalThis as GlobalGeneratedMaterialDraftStore;
  globalScope[GLOBAL_GENERATED_MATERIAL_DRAFT_STORE_KEY] ??=
    createMemoryGeneratedMaterialDraftStore();

  return globalScope[GLOBAL_GENERATED_MATERIAL_DRAFT_STORE_KEY];
}

function createSupabaseGeneratedMaterialClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseGeneratedMaterialClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseGeneratedMaterialClient;
}

function normalizeGeneratedMaterialDraft(
  record: GeneratedMaterialDraftRecord,
): GeneratedMaterialDraftRecord {
  return {
    ...record,
    providerDraftId: record.providerDraftId || undefined,
    feature: getGeneratedMaterialFeature(record.feature),
    status: getGeneratedMaterialStatus(record.status),
    content: normalizeMaterialContent(record.content),
  };
}

function cloneGeneratedMaterialDraft(
  record: GeneratedMaterialDraftRecord,
): GeneratedMaterialDraftRecord {
  return {
    ...record,
    content: normalizeMaterialContent(record.content),
  };
}

function mapGeneratedMaterialRecordToMetadata(
  record: GeneratedMaterialDraftRecord,
): GeneratedMaterialDraftMetadataRecord {
  return {
    id: record.id,
    userId: record.userId,
    providerDraftId: record.providerDraftId,
    feature: record.feature,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeMaterialContent(content: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(content ?? {})) as Record<string, unknown>;
}

function compareGeneratedMaterialCreatedAtDesc(
  left: GeneratedMaterialDraftRecord,
  right: GeneratedMaterialDraftRecord,
) {
  return right.createdAt.localeCompare(left.createdAt);
}

function filterGeneratedMaterialDrafts({
  records,
  userId,
  feature,
  providerDraftId,
  limit,
}: {
  records: GeneratedMaterialDraftRecord[];
  userId: string;
  feature?: AiUsageFeature;
  providerDraftId?: string;
  limit?: number;
}) {
  return records
    .filter((record) =>
      doesGeneratedMaterialDraftMatch({
        record,
        userId,
        feature,
        providerDraftId,
      }),
    )
    .sort(compareGeneratedMaterialCreatedAtDesc)
    .slice(0, clampGeneratedMaterialLimit(limit))
    .map(cloneGeneratedMaterialDraft);
}

function doesGeneratedMaterialDraftMatch({
  record,
  userId,
  feature,
  providerDraftId,
}: {
  record: GeneratedMaterialDraftRecord;
  userId: string;
  feature?: AiUsageFeature;
  providerDraftId?: string;
}) {
  return (
    record.userId === userId &&
    (!feature || record.feature === feature) &&
    (!providerDraftId || record.providerDraftId === providerDraftId)
  );
}

function clampGeneratedMaterialLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) {
    return 10;
  }

  return Math.min(Math.max(1, Math.trunc(limit ?? 10)), 25);
}

function createGeneratedMaterialDraftId(userId: string, now: string) {
  const safeUserId = userId.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const safeTimestamp = now.replace(/[^0-9]/g, "").slice(0, 17);
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;

  return `generated-material-${safeUserId}-${safeTimestamp}-${randomPart}`;
}

function mapGeneratedMaterialRowToRecord(
  row: SupabaseGeneratedMaterialRow,
): GeneratedMaterialDraftRecord {
  return normalizeGeneratedMaterialDraft({
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    feature: getGeneratedMaterialFeature(row.feature),
    status: getGeneratedMaterialStatus(row.status),
    content: getMaterialContent(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapGeneratedMaterialRowToMetadata(
  row: SupabaseGeneratedMaterialRow,
): GeneratedMaterialDraftMetadataRecord {
  return {
    id: row.id,
    userId: row.user_id,
    providerDraftId: row.provider_draft_id ?? undefined,
    feature: getGeneratedMaterialFeature(row.feature),
    status: getGeneratedMaterialStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGeneratedMaterialRecordToRow(
  record: GeneratedMaterialDraftRecord,
): SupabaseGeneratedMaterialWriteRow {
  return {
    id: record.id,
    user_id: record.userId,
    provider_draft_id: record.providerDraftId ?? null,
    feature: record.feature,
    status: record.status,
    content: record.content,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function getMaterialContent(content: unknown): Record<string, unknown> {
  return content && typeof content === "object" && !Array.isArray(content)
    ? (content as Record<string, unknown>)
    : {};
}

function getGeneratedMaterialFeature(value: unknown): AiUsageFeature {
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

function getGeneratedMaterialStatus(
  value: unknown,
): GeneratedMaterialDraftStatus {
  if (value === "reviewed" || value === "archived") {
    return value;
  }

  return "draft";
}

function formatSupabaseGeneratedMaterialError(
  action: "load" | "save" | "delete",
  error: SupabaseGeneratedMaterialError,
) {
  const code = error.code ? ` (${error.code})` : "";

  return `Unable to ${action} generated material draft from Supabase${code}: ${
    error.message ?? "Unknown error"
  }`;
}
