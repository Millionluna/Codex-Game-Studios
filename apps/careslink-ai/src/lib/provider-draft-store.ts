import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getCanonicalPublicProviderDraftPayload,
  getPublicProviderDraft,
  parsePublicProviderDraftPayload,
  type PublicProviderProfileDraft,
} from "./public-provider-profile-generator";
import { PROVIDER_GENERATOR_SOURCE } from "./referral-workspace-handoff";

export type ProviderDraftStatus = "draft" | "claimed" | "archived";

export type ProviderDraftRecord = {
  id: string;
  source: string;
  draftPayload: string;
  status: ProviderDraftStatus;
  ownerUserId?: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderDraftStore = {
  kind: "memory" | "supabase";
  getDraft(id: string): Promise<ProviderDraftRecord | undefined>;
  getDraftByOwner(ownerUserId: string): Promise<ProviderDraftRecord | undefined>;
  saveDraft(record: ProviderDraftRecord): Promise<ProviderDraftRecord>;
};

export type ProviderDraftResolution = {
  draft: PublicProviderProfileDraft;
  source: "store" | "payload" | "sample";
  record?: ProviderDraftRecord;
};

const GLOBAL_PROVIDER_DRAFT_STORE_KEY = "__careslinkAiProviderDraftStore__";
const PROVIDER_DRAFTS_TABLE = "provider_drafts";
const PROVIDER_DRAFTS_COLUMNS =
  "id, source, draft_payload, status, owner_user_id, claimed_at, created_at, updated_at";

export const providerDraftSupabaseSchemaSql = `
create table if not exists public.provider_drafts (
  id text primary key,
  source text not null default 'provider-profile-generator',
  draft_payload jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'claimed', 'archived')),
  owner_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_drafts_source_idx
  on public.provider_drafts(source);

create index if not exists provider_drafts_status_idx
  on public.provider_drafts(status);

create index if not exists provider_drafts_owner_user_id_idx
  on public.provider_drafts(owner_user_id);

alter table public.provider_drafts enable row level security;

grant select, insert, update, delete on public.provider_drafts to service_role;
revoke all on public.provider_drafts from anon, authenticated;
`;

const MAX_DRAFT_PAYLOAD_LENGTH = 8000;

type SupabaseDraftClient = {
  from(tableName: string): unknown;
};

type SupabaseDraftQueryBuilder = {
  select(columns: string): SupabaseDraftSelectBuilder;
  upsert(
    row: ProviderDraftSupabaseWriteRow,
    options: { onConflict: "id" },
  ): {
    select(columns: string): {
      single(): Promise<{
        data: ProviderDraftSupabaseRow | null;
        error: SupabaseDraftError | null;
      }>;
    };
  };
};

type SupabaseDraftSelectBuilder = {
  eq(column: string, value: string): SupabaseDraftSelectBuilder;
  maybeSingle(): Promise<{
    data: ProviderDraftSupabaseRow | null;
    error: SupabaseDraftError | null;
  }>;
};

type SupabaseDraftError = {
  message?: string;
  code?: string;
};

type ProviderDraftSupabaseRow = {
  id: string;
  source: string | null;
  draft_payload: unknown;
  status: string | null;
  owner_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderDraftSupabaseWriteRow = {
  id: string;
  source: string;
  draft_payload: unknown;
  status: ProviderDraftStatus;
  owner_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderDraftStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PROVIDER_DRAFTS_TABLE?: string;
};

type SupabaseDraftClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseDraftClient;

type GlobalProviderDraftStore = typeof globalThis & {
  [GLOBAL_PROVIDER_DRAFT_STORE_KEY]?: ProviderDraftStore;
};

export function createMemoryProviderDraftStore(
  initialRecords: ProviderDraftRecord[] = [],
): ProviderDraftStore {
  const records = new Map(
    initialRecords.map((record) => [record.id, normalizeDraftRecord(record)]),
  );

  return {
    kind: "memory",
    async getDraft(id) {
      return records.get(id);
    },
    async getDraftByOwner(ownerUserId) {
      return Array.from(records.values()).find(
        (record) =>
          record.status === "claimed" && record.ownerUserId === ownerUserId,
      );
    },
    async saveDraft(record) {
      const normalized = normalizeDraftRecord(record);
      records.set(normalized.id, normalized);
      return normalized;
    },
  };
}

export function getProviderDraftStore(): ProviderDraftStore {
  return createProviderDraftStoreFromEnv();
}

export function createProviderDraftStoreFromEnv(
  env: ProviderDraftStoreEnv = process.env as ProviderDraftStoreEnv,
  createClient: SupabaseDraftClientFactory = createSupabaseDraftClient,
): ProviderDraftStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || typeof window !== "undefined") {
    return getGlobalMemoryProviderDraftStore();
  }

  return createSupabaseProviderDraftStore(createClient(supabaseUrl, serviceRoleKey), {
    tableName: env.SUPABASE_PROVIDER_DRAFTS_TABLE,
  });
}

function getGlobalMemoryProviderDraftStore(): ProviderDraftStore {
  const globalScope = globalThis as GlobalProviderDraftStore;
  globalScope[GLOBAL_PROVIDER_DRAFT_STORE_KEY] ??= createMemoryProviderDraftStore();

  return globalScope[GLOBAL_PROVIDER_DRAFT_STORE_KEY];
}

export function createSupabaseProviderDraftStore(
  supabase: SupabaseDraftClient,
  options: { tableName?: string } = {},
): ProviderDraftStore {
  const tableName = options.tableName ?? PROVIDER_DRAFTS_TABLE;

  return {
    kind: "supabase",
    async getDraft(id) {
      const builder = supabase.from(tableName) as SupabaseDraftQueryBuilder;
      const { data, error } = await builder
        .select(PROVIDER_DRAFTS_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseDraftError("load", error));
      }

      return data ? mapSupabaseRowToDraftRecord(data) : undefined;
    },
    async getDraftByOwner(ownerUserId) {
      const builder = supabase.from(tableName) as SupabaseDraftQueryBuilder;
      const { data, error } = await builder
        .select(PROVIDER_DRAFTS_COLUMNS)
        .eq("owner_user_id", ownerUserId)
        .eq("status", "claimed")
        .maybeSingle();

      if (error) {
        throw new Error(formatSupabaseDraftError("load", error));
      }

      return data ? mapSupabaseRowToDraftRecord(data) : undefined;
    },
    async saveDraft(record) {
      const normalized = normalizeDraftRecord(record);
      const builder = supabase.from(tableName) as SupabaseDraftQueryBuilder;
      const { data, error } = await builder
        .upsert(mapDraftRecordToSupabaseRow(normalized), { onConflict: "id" })
        .select(PROVIDER_DRAFTS_COLUMNS)
        .single();

      if (error) {
        throw new Error(formatSupabaseDraftError("save", error));
      }

      if (!data) {
        throw new Error("Supabase did not return the saved provider draft.");
      }

      return mapSupabaseRowToDraftRecord(data);
    },
  };
}

export async function saveProviderDraftPayload({
  draftId,
  draftPayload,
  store,
  now = new Date().toISOString(),
}: {
  draftId: string;
  draftPayload: string;
  store: ProviderDraftStore;
  now?: string;
}): Promise<ProviderDraftRecord> {
  if (!isValidStorableDraftPayload(draftId, draftPayload)) {
    throw new Error("Invalid provider draft payload: missing required public profile fields.");
  }

  const canonicalPayload = getCanonicalPublicProviderDraftPayload(
    draftId,
    draftPayload,
  );
  const existing = await store.getDraft(draftId);

  if (existing?.ownerUserId) {
    throw new Error("Provider draft is already claimed.");
  }

  return store.saveDraft({
    id: draftId,
    source: existing?.source ?? PROVIDER_GENERATOR_SOURCE,
    draftPayload: canonicalPayload,
    status: existing?.status ?? "draft",
    ownerUserId: existing?.ownerUserId,
    claimedAt: existing?.claimedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function claimProviderDraft({
  draftId,
  ownerUserId,
  store,
  now = new Date().toISOString(),
}: {
  draftId: string;
  ownerUserId: string;
  store: ProviderDraftStore;
  now?: string;
}): Promise<ProviderDraftRecord> {
  const existing = await store.getDraft(draftId);

  if (!existing) {
    throw new Error("Provider draft not found.");
  }

  if (existing.status === "archived") {
    throw new Error("Provider draft cannot be claimed.");
  }

  if (existing.ownerUserId && existing.ownerUserId !== ownerUserId) {
    throw new Error("Provider draft is already claimed.");
  }

  const currentOwnerDraft = await store.getDraftByOwner(ownerUserId);

  if (currentOwnerDraft && currentOwnerDraft.id !== draftId) {
    await store.saveDraft({
      ...currentOwnerDraft,
      status: "archived",
      updatedAt: now,
    });
  }

  return store.saveDraft({
    ...existing,
    status: "claimed",
    ownerUserId,
    claimedAt: existing.claimedAt ?? now,
    updatedAt: now,
  });
}

export async function resolveProviderDraft({
  draftId,
  draftPayload,
  store,
  ownerUserId,
  now = new Date().toISOString(),
}: {
  draftId: string;
  draftPayload?: string;
  store?: ProviderDraftStore;
  ownerUserId?: string;
  now?: string;
}): Promise<ProviderDraftResolution> {
  if (isValidStorableDraftPayload(draftId, draftPayload)) {
    const record = store
      ? await saveProviderDraftPayload({
          draftId,
          draftPayload,
          store,
          now,
        })
      : undefined;

    return {
      draft: getPublicProviderDraft(draftId, record?.draftPayload ?? draftPayload),
      source: "payload",
      record,
    };
  }

  const storedRecord = store ? await store.getDraft(draftId) : undefined;

  if (storedRecord && canReadDraftRecord(storedRecord, ownerUserId)) {
    return {
      draft: getPublicProviderDraft(draftId, storedRecord.draftPayload),
      source: "store",
      record: storedRecord,
    };
  }

  return {
    draft: getPublicProviderDraft(draftId),
    source: "sample",
  };
}

export async function resolveProviderDraftForOwner({
  ownerUserId,
  store,
}: {
  ownerUserId: string;
  store: ProviderDraftStore;
}): Promise<ProviderDraftResolution | undefined> {
  if (store.kind === "supabase" && !isSupabaseAuthUserId(ownerUserId)) {
    return undefined;
  }

  const record = await store.getDraftByOwner(ownerUserId);

  if (!record) {
    return undefined;
  }

  return {
    draft: getPublicProviderDraft(record.id, record.draftPayload),
    source: "store",
    record,
  };
}

export async function claimResolvedProviderDraftForOwner({
  ownerUserId,
  resolution,
  store,
  now = new Date().toISOString(),
}: {
  ownerUserId: string;
  resolution: ProviderDraftResolution | undefined;
  store: ProviderDraftStore;
  now?: string;
}): Promise<ProviderDraftResolution | undefined> {
  if (
    !resolution?.record ||
    resolution.record.ownerUserId ||
    resolution.record.status !== "draft" ||
    !isSupabaseAuthUserId(ownerUserId)
  ) {
    return resolution;
  }

  const claimedRecord = await claimProviderDraft({
    draftId: resolution.record.id,
    ownerUserId,
    store,
    now,
  });

  return {
    ...resolution,
    record: claimedRecord,
  };
}

function isValidStorableDraftPayload(
  draftId: string,
  draftPayload: string | undefined,
): draftPayload is string {
  if (
    !draftPayload ||
    draftPayload.length > MAX_DRAFT_PAYLOAD_LENGTH ||
    !draftPayload.trim().startsWith("{")
  ) {
    return false;
  }

  return Boolean(parsePublicProviderDraftPayload(draftId, draftPayload));
}

function normalizeDraftRecord(record: ProviderDraftRecord): ProviderDraftRecord {
  return {
    ...record,
    status: record.status,
    source: record.source || PROVIDER_GENERATOR_SOURCE,
    draftPayload: record.draftPayload.slice(0, MAX_DRAFT_PAYLOAD_LENGTH),
    ownerUserId: record.ownerUserId || undefined,
    claimedAt: record.claimedAt || undefined,
  };
}

function canReadDraftRecord(
  record: ProviderDraftRecord,
  ownerUserId: string | undefined,
) {
  return !record.ownerUserId || !ownerUserId || record.ownerUserId === ownerUserId;
}

function createSupabaseDraftClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseDraftClient {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseDraftClient;
}

function mapSupabaseRowToDraftRecord(
  row: ProviderDraftSupabaseRow,
): ProviderDraftRecord {
  return normalizeDraftRecord({
    id: row.id,
    source: row.source ?? PROVIDER_GENERATOR_SOURCE,
    draftPayload: stringifyDraftPayload(row.draft_payload),
    status: getProviderDraftStatus(row.status),
    ownerUserId: row.owner_user_id ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapDraftRecordToSupabaseRow(
  record: ProviderDraftRecord,
): ProviderDraftSupabaseWriteRow {
  return {
    id: record.id,
    source: record.source,
    draft_payload: parseDraftPayload(record.draftPayload),
    status: record.status,
    owner_user_id: record.ownerUserId ?? null,
    claimed_at: record.claimedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function stringifyDraftPayload(draftPayload: unknown): string {
  if (typeof draftPayload === "string") {
    return draftPayload;
  }

  return JSON.stringify(draftPayload ?? {});
}

function parseDraftPayload(draftPayload: string): unknown {
  try {
    return JSON.parse(draftPayload);
  } catch {
    return { raw: draftPayload };
  }
}

function getProviderDraftStatus(
  status: string | null | undefined,
): ProviderDraftStatus {
  return status === "claimed" || status === "archived" ? status : "draft";
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatSupabaseDraftError(
  action: "load" | "save",
  error: SupabaseDraftError,
) {
  const code = error.code ? ` (${error.code})` : "";

  return `Unable to ${action} provider draft from Supabase${code}: ${
    error.message ?? "Unknown error"
  }`;
}
