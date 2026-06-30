import { describe, expect, it } from "vitest";
import {
  accessControlSupabaseSchemaSql,
  approveAccessRequest,
  createAccessControlStoreFromEnv,
  createMemoryAccessControlStore,
  createSupabaseAccessControlStore,
  declineAccessRequest,
  getGuidedAiAccessDecision,
  recordGuidedAiUsageIfAllowed,
  type AccessCodeRecord,
  type AccessControlRequestRecord,
} from "./access-control-store";

const requestRecord: AccessControlRequestRecord = {
  id: "request-1",
  userId: "11111111-1111-4111-8111-111111111111",
  providerDraftId: "riverside-care-navigation",
  profileName: "Riverside Care Navigation",
  entityType: "organisation",
  referralDirection: "both",
  requestedCodeType: "Dual Role Pilot",
  sourceInvite: "provider-profile-generator",
  expectedDailyQuota: 5,
  reason: "Need guided referral communication materials.",
  abuseCostControlNote: "Understands daily quota and manual review.",
  status: "queued",
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

const activeCode: AccessCodeRecord = {
  id: "access-code-1",
  userId: "11111111-1111-4111-8111-111111111111",
  accessRequestId: "request-1",
  codeType: "Dual Role Pilot",
  status: "active",
  dailyQuota: 5,
  createdAt: "2026-06-26T01:00:00.000Z",
  updatedAt: "2026-06-26T01:00:00.000Z",
};

describe("access control store", () => {
  it("approves a queued access request by marking it approved and issuing an active access code", async () => {
    const store = createMemoryAccessControlStore({
      accessRequests: [requestRecord],
    });

    const result = await approveAccessRequest({
      requestId: requestRecord.id,
      store,
      now: "2026-06-26T03:00:00.000Z",
    });

    expect(result.request).toMatchObject({
      id: requestRecord.id,
      status: "approved",
      updatedAt: "2026-06-26T03:00:00.000Z",
    });
    expect(result.accessCode).toMatchObject({
      id: "access-code-request-1",
      userId: requestRecord.userId,
      accessRequestId: requestRecord.id,
      codeType: requestRecord.requestedCodeType,
      status: "active",
      dailyQuota: requestRecord.expectedDailyQuota,
      createdAt: "2026-06-26T03:00:00.000Z",
      updatedAt: "2026-06-26T03:00:00.000Z",
    });
    await expect(
      store.getAccessStateForUser(requestRecord.userId, "2026-06-26"),
    ).resolves.toMatchObject({
      status: "approved",
      hasAccessCode: true,
      codeType: requestRecord.requestedCodeType,
      dailyQuota: requestRecord.expectedDailyQuota,
    });
  });

  it("declines a queued access request without issuing an access code", async () => {
    const store = createMemoryAccessControlStore({
      accessRequests: [requestRecord],
    });

    const result = await declineAccessRequest({
      requestId: requestRecord.id,
      store,
      now: "2026-06-26T03:00:00.000Z",
    });

    expect(result).toMatchObject({
      id: requestRecord.id,
      status: "declined",
      updatedAt: "2026-06-26T03:00:00.000Z",
    });
    await expect(
      store.getActiveAccessCodeByUser(requestRecord.userId),
    ).resolves.toBeUndefined();
    await expect(
      store.getAccessStateForUser(requestRecord.userId, "2026-06-26"),
    ).resolves.toMatchObject({
      status: "free",
      hasAccessCode: false,
    });
  });

  it("returns access requests by id from memory fallback", async () => {
    const store = createMemoryAccessControlStore({
      accessRequests: [requestRecord],
    });

    await expect(store.getAccessRequest(requestRecord.id)).resolves.toEqual(
      requestRecord,
    );
    await expect(store.getAccessRequest("missing")).resolves.toBeUndefined();
  });

  it("treats a queued access request as waitlist access in memory fallback", async () => {
    const store = createMemoryAccessControlStore();

    await store.saveAccessRequest(requestRecord);

    await expect(
      store.getAccessStateForUser(
        "11111111-1111-4111-8111-111111111111",
        "2026-06-26",
      ),
    ).resolves.toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      hasAccessCode: false,
      status: "waitlist",
      dailyQuota: 0,
      usedToday: 0,
    });
  });

  it("calculates active access and same-day AI usage from stored usage events", async () => {
    const store = createMemoryAccessControlStore();

    await store.saveAccessRequest(requestRecord);
    await store.saveAccessCode(activeCode);
    await store.recordAiUsageEvent({
      id: "usage-1",
      userId: activeCode.userId,
      providerDraftId: requestRecord.providerDraftId,
      feature: "share_card",
      inputTokenCount: 120,
      outputTokenCount: 80,
      createdAt: "2026-06-26T02:00:00.000Z",
    });
    await store.recordAiUsageEvent({
      id: "usage-2",
      userId: activeCode.userId,
      providerDraftId: requestRecord.providerDraftId,
      feature: "referral_message",
      inputTokenCount: 200,
      outputTokenCount: 110,
      createdAt: "2026-06-25T23:59:59.000Z",
    });

    await expect(
      store.getDailyAiUsage({
        userId: activeCode.userId,
        day: "2026-06-26",
      }),
    ).resolves.toEqual({
      userId: activeCode.userId,
      day: "2026-06-26",
      eventCount: 1,
      inputTokenCount: 120,
      outputTokenCount: 80,
    });
    await expect(
      store.getAccessStateForUser(activeCode.userId, "2026-06-26"),
    ).resolves.toMatchObject({
      userId: activeCode.userId,
      hasAccessCode: true,
      status: "approved",
      codeType: "Dual Role Pilot",
      dailyQuota: 5,
      usedToday: 1,
    });
  });

  it("denies guided AI access when a user has no active access code", async () => {
    const store = createMemoryAccessControlStore({
      accessRequests: [requestRecord],
    });

    await expect(
      getGuidedAiAccessDecision({
        userId: requestRecord.userId,
        store,
        day: "2026-06-26",
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "access_required",
      remainingQuota: 0,
      accessState: {
        status: "waitlist",
        hasAccessCode: false,
      },
    });
  });

  it("denies guided AI access when daily quota is exhausted", async () => {
    const store = createMemoryAccessControlStore({
      accessCodes: [
        {
          ...activeCode,
          dailyQuota: 1,
        },
      ],
      aiUsageEvents: [
        {
          id: "usage-1",
          userId: activeCode.userId,
          providerDraftId: requestRecord.providerDraftId,
          feature: "share_card",
          inputTokenCount: 100,
          outputTokenCount: 50,
          createdAt: "2026-06-26T02:00:00.000Z",
        },
      ],
    });

    await expect(
      getGuidedAiAccessDecision({
        userId: activeCode.userId,
        store,
        day: "2026-06-26",
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "quota_exhausted",
      remainingQuota: 0,
      accessState: {
        status: "approved",
        hasAccessCode: true,
        dailyQuota: 1,
        usedToday: 1,
      },
    });
  });

  it("records guided AI usage only when an active access code has remaining quota", async () => {
    const store = createMemoryAccessControlStore({
      accessCodes: [activeCode],
    });

    const result = await recordGuidedAiUsageIfAllowed({
      eventId: "usage-allowed",
      userId: activeCode.userId,
      providerDraftId: requestRecord.providerDraftId,
      feature: "share_card",
      inputTokenCount: 100,
      outputTokenCount: 50,
      store,
      now: "2026-06-26T02:00:00.000Z",
    });

    expect(result.decision).toMatchObject({
      allowed: true,
      remainingQuota: 5,
    });
    expect(result.event).toMatchObject({
      id: "usage-allowed",
      userId: activeCode.userId,
      providerDraftId: requestRecord.providerDraftId,
      feature: "share_card",
      inputTokenCount: 100,
      outputTokenCount: 50,
      createdAt: "2026-06-26T02:00:00.000Z",
    });
    await expect(
      getGuidedAiAccessDecision({
        userId: activeCode.userId,
        store,
        day: "2026-06-26",
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remainingQuota: 4,
    });
  });

  it("uses Supabase only when server-side URL and service role env vars exist", () => {
    const createdClients: Array<{ url: string; key: string }> = [];
    const createClient = (url: string, key: string) => {
      createdClients.push({ url, key });
      return { from: () => ({}) };
    };

    const fallback = createAccessControlStoreFromEnv({}, createClient);
    const supabaseStore = createAccessControlStoreFromEnv(
      {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      },
      createClient,
    );

    expect(fallback.kind).toBe("memory");
    expect(supabaseStore.kind).toBe("supabase");
    expect(createdClients).toEqual([
      {
        url: "https://project.supabase.co",
        key: "service-role-secret",
      },
    ]);
  });

  it("keeps a Supabase-ready schema with RLS and server-only grants", () => {
    expect(accessControlSupabaseSchemaSql).toContain(
      "create table if not exists public.access_requests",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "create table if not exists public.access_codes",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "create table if not exists public.ai_usage_events",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "user_id uuid not null references auth.users(id)",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "alter table public.access_requests enable row level security",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "grant select, insert, update, delete on public.access_requests to service_role",
    );
    expect(accessControlSupabaseSchemaSql).toContain(
      "revoke all on public.access_requests from anon, authenticated",
    );
    expect(accessControlSupabaseSchemaSql).not.toContain("security definer");
  });

  it("maps Supabase rows into access request records", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from(tableName: string) {
        calls.push(["from", tableName]);

        return {
          select(columns: string) {
            calls.push(["select", columns]);
            return this;
          },
          order(column: string, options: unknown) {
            calls.push(["order", column, options]);
            return this;
          },
          async then(resolve: (value: unknown) => void) {
            calls.push(["then"]);
            resolve({
              data: [
                {
                  id: requestRecord.id,
                  user_id: requestRecord.userId,
                  provider_draft_id: requestRecord.providerDraftId,
                  profile_name: requestRecord.profileName,
                  entity_type: requestRecord.entityType,
                  referral_direction: requestRecord.referralDirection,
                  requested_code_type: requestRecord.requestedCodeType,
                  source_invite: requestRecord.sourceInvite,
                  expected_daily_quota: requestRecord.expectedDailyQuota,
                  reason: requestRecord.reason,
                  abuse_cost_control_note: requestRecord.abuseCostControlNote,
                  status: requestRecord.status,
                  created_at: requestRecord.createdAt,
                  updated_at: requestRecord.updatedAt,
                },
              ],
              error: null,
            });
          },
        };
      },
    };
    const store = createSupabaseAccessControlStore(supabase);

    await expect(store.listAccessRequests()).resolves.toEqual([requestRecord]);
    expect(calls).toEqual([
      ["from", "access_requests"],
      [
        "select",
        "id, user_id, provider_draft_id, profile_name, entity_type, referral_direction, requested_code_type, source_invite, expected_daily_quota, reason, abuse_cost_control_note, status, created_at, updated_at",
      ],
      ["order", "created_at", { ascending: false }],
      ["then"],
    ]);
  });

  it("loads Supabase access requests by id", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from(tableName: string) {
        calls.push(["from", tableName]);

        return {
          select(columns: string) {
            calls.push(["select", columns]);
            return this;
          },
          eq(column: string, value: string) {
            calls.push(["eq", column, value]);
            return this;
          },
          async maybeSingle() {
            calls.push(["maybeSingle"]);

            return {
              data: {
                id: requestRecord.id,
                user_id: requestRecord.userId,
                provider_draft_id: requestRecord.providerDraftId,
                profile_name: requestRecord.profileName,
                entity_type: requestRecord.entityType,
                referral_direction: requestRecord.referralDirection,
                requested_code_type: requestRecord.requestedCodeType,
                source_invite: requestRecord.sourceInvite,
                expected_daily_quota: requestRecord.expectedDailyQuota,
                reason: requestRecord.reason,
                abuse_cost_control_note: requestRecord.abuseCostControlNote,
                status: requestRecord.status,
                created_at: requestRecord.createdAt,
                updated_at: requestRecord.updatedAt,
              },
              error: null,
            };
          },
        };
      },
    };
    const store = createSupabaseAccessControlStore(supabase);

    await expect(store.getAccessRequest(requestRecord.id)).resolves.toEqual(
      requestRecord,
    );
    expect(calls).toEqual([
      ["from", "access_requests"],
      [
        "select",
        "id, user_id, provider_draft_id, profile_name, entity_type, referral_direction, requested_code_type, source_invite, expected_daily_quota, reason, abuse_cost_control_note, status, created_at, updated_at",
      ],
      ["eq", "id", requestRecord.id],
      ["maybeSingle"],
    ]);
  });

  it("upserts access requests and records usage events with snake_case columns", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from(tableName: string) {
        calls.push(["from", tableName]);

        return {
          upsert(row: unknown, options: unknown) {
            calls.push(["upsert", row, options]);
            return this;
          },
          insert(row: unknown) {
            calls.push(["insert", row]);
            return this;
          },
          select(columns: string) {
            calls.push(["select", columns]);
            return this;
          },
          async single() {
            calls.push(["single"]);

            return {
              data: {
                id: requestRecord.id,
                user_id: requestRecord.userId,
                provider_draft_id: requestRecord.providerDraftId,
                profile_name: requestRecord.profileName,
                entity_type: requestRecord.entityType,
                referral_direction: requestRecord.referralDirection,
                requested_code_type: requestRecord.requestedCodeType,
                source_invite: requestRecord.sourceInvite,
                expected_daily_quota: requestRecord.expectedDailyQuota,
                reason: requestRecord.reason,
                abuse_cost_control_note: requestRecord.abuseCostControlNote,
                status: requestRecord.status,
                created_at: requestRecord.createdAt,
                updated_at: requestRecord.updatedAt,
              },
              error: null,
            };
          },
        };
      },
    };
    const store = createSupabaseAccessControlStore(supabase);

    await store.saveAccessRequest(requestRecord);
    await store.recordAiUsageEvent({
      id: "usage-1",
      userId: requestRecord.userId,
      providerDraftId: requestRecord.providerDraftId,
      feature: "share_card",
      inputTokenCount: 120,
      outputTokenCount: 80,
      createdAt: "2026-06-26T02:00:00.000Z",
    });

    expect(calls[1]).toEqual([
      "upsert",
      {
        id: requestRecord.id,
        user_id: requestRecord.userId,
        provider_draft_id: requestRecord.providerDraftId,
        profile_name: requestRecord.profileName,
        entity_type: requestRecord.entityType,
        referral_direction: requestRecord.referralDirection,
        requested_code_type: requestRecord.requestedCodeType,
        source_invite: requestRecord.sourceInvite,
        expected_daily_quota: requestRecord.expectedDailyQuota,
        reason: requestRecord.reason,
        abuse_cost_control_note: requestRecord.abuseCostControlNote,
        status: requestRecord.status,
        created_at: requestRecord.createdAt,
        updated_at: requestRecord.updatedAt,
      },
      { onConflict: "id" },
    ]);
    expect(calls).toContainEqual([
      "insert",
      {
        id: "usage-1",
        user_id: requestRecord.userId,
        provider_draft_id: requestRecord.providerDraftId,
        feature: "share_card",
        input_token_count: 120,
        output_token_count: 80,
        created_at: "2026-06-26T02:00:00.000Z",
      },
    ]);
  });
});
