import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { NdisCaseNoteMaterial } from "./ndis-case-note-companion";
import {
  getSafeNdisCaseNoteAttributionPair,
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
  NDIS_CASE_NOTE_UTM_SOURCE,
  type NdisCaseNoteCompanionSurface,
} from "./ndis-case-note-companion-attribution";

export type NdisCaseNoteCompanionEventName =
  | "companion_viewed"
  | "companion_started"
  | "companion_generated"
  | "companion_copied"
  | "companion_credit_exhausted"
  | "companion_offer_viewed"
  | "companion_offer_requested"
  | "companion_save_prompt_clicked"
  | "companion_saved";

export type NdisCaseNoteCompanionAttribution = {
  source: string;
  resourceSlug: string;
  utmSource?: string;
  surface?: NdisCaseNoteCompanionSurface;
  utmMedium?: string;
  utmCampaign?: string;
  locale: "en" | "zh-Hans";
};

export type NdisCaseNoteCompanionEventRecord = {
  id: string;
  eventName: NdisCaseNoteCompanionEventName;
  userId?: string;
  visitorHash?: string;
  attribution: NdisCaseNoteCompanionAttribution;
  createdAt: string;
};

export type NdisCaseNoteCompanionClaimRecord = {
  tokenHash: string;
  material: NdisCaseNoteMaterial;
  generationMeta?: {
    model: string;
    inputTokenCount: number;
    outputTokenCount: number;
  };
  expiresAt: string;
  claimedByUserId?: string;
  claimedAt?: string;
  createdAt: string;
};

export type NdisCaseNoteQuotaScope =
  | "anonymous_device"
  | "anonymous_ip"
  | "authenticated_user"
  | "authenticated_ip";

export type NdisCaseNoteQuotaDecision = {
  allowed: boolean;
  usageCount: number;
  limit: number;
};

export type NdisCaseNoteCompanionStore = {
  kind: "memory" | "supabase";
  saveClaim(
    record: NdisCaseNoteCompanionClaimRecord,
  ): Promise<NdisCaseNoteCompanionClaimRecord>;
  purgeExpiredClaims(now?: string): Promise<void>;
  getClaim(
    token: string,
    now?: string,
  ): Promise<NdisCaseNoteCompanionClaimRecord | undefined>;
  consumeClaim(input: {
    token: string;
    userId: string;
    now?: string;
  }): Promise<NdisCaseNoteCompanionClaimRecord | undefined>;
  completeClaim(input: {
    token: string;
    userId: string;
  }): Promise<void>;
  consumeQuota(input: {
    scope: NdisCaseNoteQuotaScope;
    fingerprintHash: string;
    usageDate: string;
    limit: number;
  }): Promise<NdisCaseNoteQuotaDecision>;
  releaseQuota(input: {
    scope: NdisCaseNoteQuotaScope;
    fingerprintHash: string;
    usageDate: string;
  }): Promise<void>;
  recordEvent(
    record: NdisCaseNoteCompanionEventRecord,
  ): Promise<NdisCaseNoteCompanionEventRecord>;
  listEvents(input?: {
    limit?: number;
  }): Promise<NdisCaseNoteCompanionEventRecord[]>;
};

type CompanionStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_NDIS_CASE_NOTE_CLAIMS_TABLE?: string;
  SUPABASE_TEMPLATE_COMPANION_EVENTS_TABLE?: string;
  CARESLINK_ALLOW_COMPANION_MEMORY_STORE?: string;
  NODE_ENV?: string;
};

type CompanionClaimRow = {
  token_hash: string;
  material: unknown;
  generation_model: string | null;
  input_token_count: number | null;
  output_token_count: number | null;
  expires_at: string;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
};

type CompanionEventRow = {
  id: string;
  event_name: string;
  user_id: string | null;
  visitor_hash: string | null;
  source: string;
  resource_slug: string;
  utm_source: string | null;
  surface: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  locale: string;
  created_at: string;
};

const GLOBAL_STORE_KEY = "__careslinkNdisCaseNoteCompanionStore__";
const DEFAULT_CLAIMS_TABLE = "ndis_case_note_companion_claims";
const DEFAULT_EVENTS_TABLE = "template_companion_events";
const CLAIM_COLUMNS =
  "token_hash,material,generation_model,input_token_count,output_token_count,expires_at,claimed_by_user_id,claimed_at,created_at";
const EVENT_COLUMNS =
  "id,event_name,user_id,visitor_hash,source,resource_slug,utm_source,surface,utm_medium,utm_campaign,locale,created_at";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,100}$/;
const DEFAULT_CLAIM_TTL_MS = 30 * 60 * 1000;

type GlobalCompanionStore = typeof globalThis & {
  [GLOBAL_STORE_KEY]?: NdisCaseNoteCompanionStore;
};

export function createNdisCaseNoteClaim({
  material,
  claimedByUserId,
  generationMeta,
  token: requestedToken,
  now = new Date(),
  ttlMs = DEFAULT_CLAIM_TTL_MS,
}: {
  material: NdisCaseNoteMaterial;
  claimedByUserId?: string;
  generationMeta?: NdisCaseNoteCompanionClaimRecord["generationMeta"];
  token?: string;
  now?: Date;
  ttlMs?: number;
}) {
  const token = requestedToken?.trim() || randomBytes(32).toString("base64url");

  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("Invalid companion claim token");
  }

  const createdAt = now.toISOString();

  return {
    token,
    record: {
      tokenHash: hashCompanionToken(token),
      material: cloneMaterial(material),
      generationMeta: normalizeGenerationMeta(generationMeta),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      claimedByUserId: claimedByUserId || undefined,
      claimedAt: claimedByUserId ? createdAt : undefined,
      createdAt,
    } satisfies NdisCaseNoteCompanionClaimRecord,
  };
}

export function createNdisCaseNoteCompanionEvent({
  eventName,
  userId,
  visitorHash,
  attribution,
  now = new Date().toISOString(),
}: {
  eventName: NdisCaseNoteCompanionEventName;
  userId?: string;
  visitorHash?: string;
  attribution: NdisCaseNoteCompanionAttribution;
  now?: string;
}): NdisCaseNoteCompanionEventRecord {
  return {
    id: `companion-event-${randomUUID()}`,
    eventName,
    userId: userId || undefined,
    visitorHash: visitorHash || undefined,
    attribution: normalizeAttribution(attribution),
    createdAt: now,
  };
}

export function createMemoryNdisCaseNoteCompanionStore(): NdisCaseNoteCompanionStore {
  const claims = new Map<string, NdisCaseNoteCompanionClaimRecord>();
  const quotas = new Map<string, number>();
  const events: NdisCaseNoteCompanionEventRecord[] = [];

  return {
    kind: "memory",
    async saveClaim(record) {
      const normalized = normalizeClaim(record);
      claims.set(normalized.tokenHash, normalized);
      return cloneClaim(normalized);
    },
    async purgeExpiredClaims(now = new Date().toISOString()) {
      claims.forEach((record, tokenHash) => {
        if (record.expiresAt <= now) {
          claims.delete(tokenHash);
        }
      });
    },
    async getClaim(token, now = new Date().toISOString()) {
      const tokenHash = getTokenHash(token);
      const record = tokenHash ? claims.get(tokenHash) : undefined;

      if (!record || record.expiresAt <= now) {
        return undefined;
      }

      return cloneClaim(record);
    },
    async consumeClaim({ token, userId, now = new Date().toISOString() }) {
      const tokenHash = getTokenHash(token);
      const record = tokenHash ? claims.get(tokenHash) : undefined;

      if (
        !record ||
        record.expiresAt <= now ||
        (record.claimedByUserId && record.claimedByUserId !== userId)
      ) {
        return undefined;
      }

      const claimed = normalizeClaim({
        ...record,
        claimedByUserId: userId,
        claimedAt: record.claimedAt ?? now,
      });
      claims.set(claimed.tokenHash, claimed);
      return cloneClaim(claimed);
    },
    async completeClaim({ token, userId }) {
      const tokenHash = getTokenHash(token);
      const record = tokenHash ? claims.get(tokenHash) : undefined;

      if (!record || record.claimedByUserId !== userId) {
        return;
      }

      claims.delete(record.tokenHash);
    },
    async consumeQuota({ scope, fingerprintHash, usageDate, limit }) {
      const normalizedLimit = Math.max(0, Math.trunc(limit));
      const key = getQuotaKey(scope, fingerprintHash, usageDate);
      const usageCount = quotas.get(key) ?? 0;

      if (usageCount >= normalizedLimit) {
        return {
          allowed: false,
          usageCount,
          limit: normalizedLimit,
        };
      }

      const nextUsageCount = usageCount + 1;
      quotas.set(key, nextUsageCount);

      return {
        allowed: true,
        usageCount: nextUsageCount,
        limit: normalizedLimit,
      };
    },
    async releaseQuota({ scope, fingerprintHash, usageDate }) {
      const key = getQuotaKey(scope, fingerprintHash, usageDate);
      const usageCount = quotas.get(key) ?? 0;

      if (usageCount <= 1) {
        quotas.delete(key);
        return;
      }

      quotas.set(key, usageCount - 1);
    },
    async recordEvent(record) {
      const normalized = normalizeEvent(record);
      events.push(normalized);
      return cloneEvent(normalized);
    },
    async listEvents({ limit } = {}) {
      return events
        .slice()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, clampLimit(limit))
        .map(cloneEvent);
    },
  };
}

export function getNdisCaseNoteCompanionStore() {
  return createNdisCaseNoteCompanionStoreFromEnv();
}

export function createNdisCaseNoteCompanionStoreFromEnv(
  env: CompanionStoreEnv = process.env as CompanionStoreEnv,
): NdisCaseNoteCompanionStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof window !== "undefined") {
    const globalScope = globalThis as GlobalCompanionStore;
    globalScope[GLOBAL_STORE_KEY] ??=
      createMemoryNdisCaseNoteCompanionStore();
    return globalScope[GLOBAL_STORE_KEY];
  }

  if (!supabaseUrl || !serviceRoleKey) {
    if (
      env.NODE_ENV === "production" &&
      env.CARESLINK_ALLOW_COMPANION_MEMORY_STORE !== "true"
    ) {
      throw new Error(
        "Persistent NDIS case note companion storage is required in production",
      );
    }

    const globalScope = globalThis as GlobalCompanionStore;
    globalScope[GLOBAL_STORE_KEY] ??=
      createMemoryNdisCaseNoteCompanionStore();
    return globalScope[GLOBAL_STORE_KEY];
  }

  const client = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const claimsTable =
    env.SUPABASE_NDIS_CASE_NOTE_CLAIMS_TABLE ?? DEFAULT_CLAIMS_TABLE;
  const eventsTable =
    env.SUPABASE_TEMPLATE_COMPANION_EVENTS_TABLE ?? DEFAULT_EVENTS_TABLE;

  return {
    kind: "supabase",
    async saveClaim(record) {
      const normalized = normalizeClaim(record);
      const { data, error } = await client
        .from(claimsTable)
        .upsert(mapClaimToRow(normalized), { onConflict: "token_hash" })
        .select(CLAIM_COLUMNS)
        .single();

      if (error) {
        throw new Error(`Unable to save companion claim: ${error.message}`);
      }

      return mapRowToClaim(data as CompanionClaimRow);
    },
    async purgeExpiredClaims(now = new Date().toISOString()) {
      const { error } = await client
        .from(claimsTable)
        .delete()
        .lt("expires_at", now);

      if (error) {
        throw new Error(
          `Unable to purge expired companion claims: ${error.message}`,
        );
      }
    },
    async getClaim(token, now = new Date().toISOString()) {
      const tokenHash = getTokenHash(token);

      if (!tokenHash) {
        return undefined;
      }

      const { data, error } = await client
        .from(claimsTable)
        .select(CLAIM_COLUMNS)
        .eq("token_hash", tokenHash)
        .gt("expires_at", now)
        .maybeSingle();

      if (error) {
        throw new Error(`Unable to load companion claim: ${error.message}`);
      }

      return data ? mapRowToClaim(data as CompanionClaimRow) : undefined;
    },
    async consumeClaim({ token, userId }) {
      const tokenHash = getTokenHash(token);

      if (!tokenHash) {
        return undefined;
      }

      const { data, error } = await client.rpc(
        "claim_ndis_case_note_companion_output",
        {
          p_token_hash: tokenHash,
          p_user_id: userId,
        },
      );

      if (error) {
        throw new Error(`Unable to claim companion output: ${error.message}`);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapRowToClaim(row as CompanionClaimRow) : undefined;
    },
    async completeClaim({ token, userId }) {
      const tokenHash = getTokenHash(token);

      if (!tokenHash) {
        return;
      }

      const { error } = await client
        .from(claimsTable)
        .delete()
        .eq("token_hash", tokenHash)
        .eq("claimed_by_user_id", userId);

      if (error) {
        throw new Error(`Unable to complete companion claim: ${error.message}`);
      }
    },
    async consumeQuota({ scope, fingerprintHash, usageDate, limit }) {
      const { data, error } = await client.rpc(
        "consume_template_companion_quota",
        {
          p_scope: scope,
          p_fingerprint_hash: fingerprintHash,
          p_usage_date: usageDate,
          p_limit: Math.max(0, Math.trunc(limit)),
        },
      );

      if (error) {
        throw new Error(`Unable to consume companion quota: ${error.message}`);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return normalizeQuotaDecision(row, limit);
    },
    async releaseQuota({ scope, fingerprintHash, usageDate }) {
      const { error } = await client.rpc(
        "release_template_companion_quota",
        {
          p_scope: scope,
          p_fingerprint_hash: fingerprintHash,
          p_usage_date: usageDate,
        },
      );

      if (error) {
        throw new Error(`Unable to release companion quota: ${error.message}`);
      }
    },
    async recordEvent(record) {
      const normalized = normalizeEvent(record);
      const { data, error } = await client
        .from(eventsTable)
        .insert(mapEventToRow(normalized))
        .select(EVENT_COLUMNS)
        .single();

      if (error) {
        throw new Error(`Unable to save companion event: ${error.message}`);
      }

      return mapRowToEvent(data as CompanionEventRow);
    },
    async listEvents({ limit } = {}) {
      const { data, error } = await client
        .from(eventsTable)
        .select(EVENT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(clampLimit(limit));

      if (error) {
        throw new Error(`Unable to list companion events: ${error.message}`);
      }

      return ((data ?? []) as CompanionEventRow[]).map(mapRowToEvent);
    },
  };
}

export function hashCompanionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getTokenHash(token: string) {
  const normalized = token.trim();
  return TOKEN_PATTERN.test(normalized)
    ? hashCompanionToken(normalized)
    : undefined;
}

function normalizeClaim(
  record: NdisCaseNoteCompanionClaimRecord,
): NdisCaseNoteCompanionClaimRecord {
  return {
    tokenHash: record.tokenHash,
    material: cloneMaterial(record.material),
    generationMeta: normalizeGenerationMeta(record.generationMeta),
    expiresAt: record.expiresAt,
    claimedByUserId: record.claimedByUserId || undefined,
    claimedAt: record.claimedAt || undefined,
    createdAt: record.createdAt,
  };
}

function cloneClaim(record: NdisCaseNoteCompanionClaimRecord) {
  return normalizeClaim(record);
}

function cloneMaterial(material: NdisCaseNoteMaterial): NdisCaseNoteMaterial {
  const legacyMaterial = material as NdisCaseNoteMaterial & {
    caseNoteDraft?: string;
  };

  return {
    englishCaseNoteDraft:
      legacyMaterial.englishCaseNoteDraft ?? legacyMaterial.caseNoteDraft ?? "",
    chineseReviewVersion:
      legacyMaterial.chineseReviewVersion ??
      "旧版已保存草稿未生成中文复核版本。请对照原始事实复核英文草稿。",
    missingFacts: [...material.missingFacts],
    neutralWordingChecks: [...material.neutralWordingChecks],
    followUpPrompts: [...material.followUpPrompts],
    disclaimer: material.disclaimer,
  };
}

function normalizeEvent(
  record: NdisCaseNoteCompanionEventRecord,
): NdisCaseNoteCompanionEventRecord {
  return {
    id: record.id,
    eventName: record.eventName,
    userId: record.userId || undefined,
    visitorHash: record.visitorHash || undefined,
    attribution: normalizeAttribution(record.attribution),
    createdAt: record.createdAt,
  };
}

function cloneEvent(record: NdisCaseNoteCompanionEventRecord) {
  return normalizeEvent(record);
}

function normalizeAttribution(
  attribution: NdisCaseNoteCompanionAttribution,
): NdisCaseNoteCompanionAttribution {
  const attributionPair = getSafeNdisCaseNoteAttributionPair(
    attribution.surface,
    attribution.utmMedium,
  );

  return {
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    utmSource:
      attribution.utmSource === NDIS_CASE_NOTE_UTM_SOURCE
        ? NDIS_CASE_NOTE_UTM_SOURCE
        : undefined,
    surface: attributionPair.surface,
    utmMedium: attributionPair.utmMedium,
    utmCampaign:
      attribution.utmCampaign === NDIS_CASE_NOTE_UTM_CAMPAIGN
        ? NDIS_CASE_NOTE_UTM_CAMPAIGN
        : undefined,
    locale: attribution.locale === "zh-Hans" ? "zh-Hans" : "en",
  };
}

function getQuotaKey(
  scope: NdisCaseNoteQuotaScope,
  fingerprintHash: string,
  usageDate: string,
) {
  return `${scope}:${fingerprintHash}:${usageDate}`;
}

function normalizeQuotaDecision(
  value: unknown,
  limit: number,
): NdisCaseNoteQuotaDecision {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const normalizedLimit = Math.max(0, Math.trunc(limit));
  const usageCount =
    typeof record.usage_count === "number"
      ? Math.max(0, Math.trunc(record.usage_count))
      : normalizedLimit;

  return {
    allowed: record.allowed === true,
    usageCount,
    limit: normalizedLimit,
  };
}

function mapClaimToRow(record: NdisCaseNoteCompanionClaimRecord) {
  return {
    token_hash: record.tokenHash,
    material: record.material,
    generation_model: record.generationMeta?.model ?? null,
    input_token_count: record.generationMeta?.inputTokenCount ?? null,
    output_token_count: record.generationMeta?.outputTokenCount ?? null,
    expires_at: record.expiresAt,
    claimed_by_user_id: record.claimedByUserId ?? null,
    claimed_at: record.claimedAt ?? null,
    created_at: record.createdAt,
  };
}

function mapRowToClaim(row: CompanionClaimRow): NdisCaseNoteCompanionClaimRecord {
  return normalizeClaim({
    tokenHash: row.token_hash,
    material: row.material as NdisCaseNoteMaterial,
    generationMeta:
      typeof row.generation_model === "string" &&
      typeof row.input_token_count === "number" &&
      typeof row.output_token_count === "number"
        ? {
            model: row.generation_model,
            inputTokenCount: row.input_token_count,
            outputTokenCount: row.output_token_count,
          }
        : undefined,
    expiresAt: row.expires_at,
    claimedByUserId: row.claimed_by_user_id ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    createdAt: row.created_at,
  });
}

function normalizeGenerationMeta(
  value: NdisCaseNoteCompanionClaimRecord["generationMeta"],
) {
  if (!value) {
    return undefined;
  }

  return {
    model: value.model.slice(0, 120),
    inputTokenCount: Math.max(0, Math.trunc(value.inputTokenCount)),
    outputTokenCount: Math.max(0, Math.trunc(value.outputTokenCount)),
  };
}

function mapEventToRow(record: NdisCaseNoteCompanionEventRecord) {
  return {
    id: record.id,
    event_name: record.eventName,
    user_id: record.userId ?? null,
    visitor_hash: record.visitorHash ?? null,
    source: record.attribution.source,
    resource_slug: record.attribution.resourceSlug,
    utm_source: record.attribution.utmSource ?? null,
    surface: record.attribution.surface ?? null,
    utm_medium: record.attribution.utmMedium ?? null,
    utm_campaign: record.attribution.utmCampaign ?? null,
    locale: record.attribution.locale,
    created_at: record.createdAt,
  };
}

function mapRowToEvent(row: CompanionEventRow): NdisCaseNoteCompanionEventRecord {
  return normalizeEvent({
    id: row.id,
    eventName: row.event_name as NdisCaseNoteCompanionEventName,
    userId: row.user_id ?? undefined,
    visitorHash: row.visitor_hash ?? undefined,
    attribution: {
      source: row.source,
      resourceSlug: row.resource_slug,
      utmSource: row.utm_source ?? undefined,
      surface:
        row.surface === "core_product_landing" ||
        row.surface === "core_download_success"
          ? row.surface
          : undefined,
      utmMedium: row.utm_medium ?? undefined,
      utmCampaign: row.utm_campaign ?? undefined,
      locale: row.locale === "zh-Hans" ? "zh-Hans" : "en",
    },
    createdAt: row.created_at,
  });
}

function clampLimit(limit?: number) {
  return Math.max(1, Math.min(500, Math.trunc(limit ?? 100)));
}
