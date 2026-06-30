import { describe, expect, it } from "vitest";
import {
  createGeneratedMaterialDraftRecord,
  createGeneratedMaterialDraftStoreFromEnv,
  createMemoryGeneratedMaterialDraftStore,
  createSupabaseGeneratedMaterialDraftStore,
  generatedMaterialDraftSupabaseSchemaSql,
  updateGeneratedMaterialDraftStatus,
  type GeneratedMaterialDraftRecord,
} from "./generated-material-draft-store";

const materialContent = {
  headline: "Harbour Community Support",
  subheadline: "Referral-ready community support profile",
  serviceArea: "Inner West Sydney",
  languages: "English; Mandarin",
  referralFit: "Older adults who need navigation",
  intakePath: "Phone warm handover",
  disclaimer: "Based on self-submitted information. Not a provider endorsement.",
};

const materialDraftRecord: GeneratedMaterialDraftRecord = {
  id: "generated-material-1",
  userId: "11111111-1111-4111-8111-111111111111",
  providerDraftId: "sample-harbour",
  feature: "share_card",
  status: "draft",
  content: materialContent,
  createdAt: "2026-06-26T03:00:00.000Z",
  updatedAt: "2026-06-26T03:00:00.000Z",
};

describe("generated material draft store", () => {
  it("saves and loads generated material drafts in memory", async () => {
    const store = createMemoryGeneratedMaterialDraftStore();

    await expect(
      store.saveGeneratedMaterialDraft(materialDraftRecord),
    ).resolves.toEqual(materialDraftRecord);
    await expect(
      store.getGeneratedMaterialDraft(materialDraftRecord.id),
    ).resolves.toEqual(materialDraftRecord);
    await expect(
      store.getLatestGeneratedMaterialDraftByUser({
        userId: materialDraftRecord.userId,
        feature: "share_card",
      }),
    ).resolves.toEqual(materialDraftRecord);
  });

  it("lists generated material drafts by user in newest-first order with optional filters", async () => {
    const store = createMemoryGeneratedMaterialDraftStore([
      {
        ...materialDraftRecord,
        id: "older-share-card",
        feature: "share_card",
        providerDraftId: "sample-harbour",
        createdAt: "2026-06-26T01:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      },
      {
        ...materialDraftRecord,
        id: "newer-referral-message",
        feature: "referral_message",
        providerDraftId: "sample-harbour",
        content: {
          subjectLine: "Referral introduction",
          opening: "Hi, please review this profile.",
          providerSummary: "Provider-submitted profile summary.",
          referralFit: "Older people needing navigation.",
          handoverRequest: "Include consent confirmation.",
          nextStep: "Review before sending.",
          disclaimer:
            "Based on self-submitted information. Not a provider endorsement.",
        },
        createdAt: "2026-06-26T02:00:00.000Z",
        updatedAt: "2026-06-26T02:00:00.000Z",
      },
      {
        ...materialDraftRecord,
        id: "other-provider-share-card",
        feature: "share_card",
        providerDraftId: "other-provider",
        createdAt: "2026-06-26T03:00:00.000Z",
        updatedAt: "2026-06-26T03:00:00.000Z",
      },
      {
        ...materialDraftRecord,
        id: "other-user-share-card",
        userId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-06-26T04:00:00.000Z",
        updatedAt: "2026-06-26T04:00:00.000Z",
      },
    ]);

    await expect(
      store.listGeneratedMaterialDraftsByUser({
        userId: materialDraftRecord.userId,
      }),
    ).resolves.toMatchObject([
      { id: "other-provider-share-card" },
      { id: "newer-referral-message" },
      { id: "older-share-card" },
    ]);
    await expect(
      store.listGeneratedMaterialDraftsByUser({
        userId: materialDraftRecord.userId,
        providerDraftId: "sample-harbour",
      }),
    ).resolves.toMatchObject([
      { id: "newer-referral-message" },
      { id: "older-share-card" },
    ]);
    await expect(
      store.listGeneratedMaterialDraftsByUser({
        userId: materialDraftRecord.userId,
        feature: "share_card",
        limit: 1,
      }),
    ).resolves.toMatchObject([{ id: "other-provider-share-card" }]);
  });

  it("lists all generated material drafts for admin usage review in newest-first order", async () => {
    const store = createMemoryGeneratedMaterialDraftStore([
      {
        ...materialDraftRecord,
        id: "old-admin-usage-share-card",
        userId: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-06-26T01:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      },
      {
        ...materialDraftRecord,
        id: "new-admin-usage-referral-message",
        userId: "22222222-2222-4222-8222-222222222222",
        feature: "referral_message",
        createdAt: "2026-06-26T02:00:00.000Z",
        updatedAt: "2026-06-26T02:00:00.000Z",
      },
    ]);

    await expect(
      store.listGeneratedMaterialDrafts({ limit: 1 }),
    ).resolves.toMatchObject([
      {
        id: "new-admin-usage-referral-message",
        userId: "22222222-2222-4222-8222-222222222222",
      },
    ]);
  });

  it("updates generated material draft status only for the owning user", async () => {
    const store = createMemoryGeneratedMaterialDraftStore([materialDraftRecord]);

    await expect(
      updateGeneratedMaterialDraftStatus({
        draftId: materialDraftRecord.id,
        userId: materialDraftRecord.userId,
        status: "reviewed",
        store,
        now: "2026-06-26T04:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      id: materialDraftRecord.id,
      userId: materialDraftRecord.userId,
      status: "reviewed",
      createdAt: materialDraftRecord.createdAt,
      updatedAt: "2026-06-26T04:00:00.000Z",
    });

    await expect(
      updateGeneratedMaterialDraftStatus({
        draftId: materialDraftRecord.id,
        userId: "22222222-2222-4222-8222-222222222222",
        status: "archived",
        store,
        now: "2026-06-26T05:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
    await expect(
      store.getGeneratedMaterialDraft(materialDraftRecord.id),
    ).resolves.toMatchObject({
      status: "reviewed",
      updatedAt: "2026-06-26T04:00:00.000Z",
    });
  });

  it("creates normalized generated material draft records", () => {
    const record = createGeneratedMaterialDraftRecord({
      userId: materialDraftRecord.userId,
      providerDraftId: materialDraftRecord.providerDraftId,
      feature: "share_card",
      content: {
        ...materialContent,
        extraUnsafeField: "ignored later by UI",
      },
      now: "2026-06-26T03:00:00.000Z",
    });

    expect(record).toMatchObject({
      userId: materialDraftRecord.userId,
      providerDraftId: materialDraftRecord.providerDraftId,
      feature: "share_card",
      status: "draft",
      content: {
        headline: "Harbour Community Support",
      },
      createdAt: "2026-06-26T03:00:00.000Z",
      updatedAt: "2026-06-26T03:00:00.000Z",
    });
    expect(record.id).toMatch(/^generated-material-/);
  });

  it("uses Supabase only with server-side URL and service role env vars", () => {
    const createdClients: Array<{ url: string; key: string }> = [];
    const createClient = (url: string, key: string) => {
      createdClients.push({ url, key });
      return { from: () => ({}) };
    };

    const fallback = createGeneratedMaterialDraftStoreFromEnv({}, createClient);
    const supabaseStore = createGeneratedMaterialDraftStoreFromEnv(
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
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "create table if not exists public.generated_material_drafts",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "content jsonb not null",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "user_id uuid not null references auth.users(id)",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "alter table public.generated_material_drafts enable row level security",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "grant select, insert, update, delete on public.generated_material_drafts to service_role",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).toContain(
      "revoke all on public.generated_material_drafts from anon, authenticated",
    );
    expect(generatedMaterialDraftSupabaseSchemaSql).not.toContain(
      "security definer",
    );
  });

  it("upserts generated material drafts into Supabase using snake_case columns", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from(tableName: string) {
        calls.push(["from", tableName]);

        return {
          upsert(row: unknown, options: unknown) {
            calls.push(["upsert", row, options]);
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
                id: materialDraftRecord.id,
                user_id: materialDraftRecord.userId,
                provider_draft_id: materialDraftRecord.providerDraftId,
                feature: materialDraftRecord.feature,
                status: materialDraftRecord.status,
                content: materialDraftRecord.content,
                created_at: materialDraftRecord.createdAt,
                updated_at: materialDraftRecord.updatedAt,
              },
              error: null,
            };
          },
        };
      },
    };
    const store = createSupabaseGeneratedMaterialDraftStore(supabase);

    await expect(
      store.saveGeneratedMaterialDraft(materialDraftRecord),
    ).resolves.toEqual(materialDraftRecord);
    expect(calls[1]).toEqual([
      "upsert",
      {
        id: materialDraftRecord.id,
        user_id: materialDraftRecord.userId,
        provider_draft_id: materialDraftRecord.providerDraftId,
        feature: "share_card",
        status: "draft",
        content: materialDraftRecord.content,
        created_at: materialDraftRecord.createdAt,
        updated_at: materialDraftRecord.updatedAt,
      },
      { onConflict: "id" },
    ]);
  });
});
