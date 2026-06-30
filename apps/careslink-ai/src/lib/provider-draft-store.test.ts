import { describe, expect, it } from "vitest";
import type { ProviderDraftStore } from "./provider-draft-store";
import {
  claimResolvedProviderDraftForOwner,
  claimProviderDraft,
  createProviderDraftStoreFromEnv,
  createMemoryProviderDraftStore,
  createSupabaseProviderDraftStore,
  providerDraftSupabaseSchemaSql,
  resolveProviderDraft,
  resolveProviderDraftForOwner,
  saveProviderDraftPayload,
} from "./provider-draft-store";

const riversidePayload = JSON.stringify({
  version: 1,
  id: "riverside-care-navigation",
  businessName: "Riverside Care Navigation",
  serviceCategories: ["Aged care navigation", "NDIS support coordination"],
  referralServices: ["SERV-0007"],
  serviceAreas: ["Brisbane South", "Logan"],
  languages: ["English", "Mandarin"],
  supportsNdis: true,
  supportsAgedCare: true,
  acceptingNewClients: true,
  urgentReferralAvailable: true,
  shortDescription:
    "Bilingual care navigation provider helping families understand aged care and NDIS referral pathways.",
  targetClients: "Older people, NDIS participants, and family decision makers",
  publicContactMethods: ["Phone", "Email"],
  sourceChannel: "public-generator",
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:00:00.000Z",
});

describe("provider draft store", () => {
  it("saveProviderDraftPayload canonicalizes and stores a draft under the handoff draft id", async () => {
    const store = createMemoryProviderDraftStore();
    const rawPayload = JSON.stringify({
      version: 1,
      id: "payload-id",
      businessName: "Bright Path Community Support",
      email: "private@example.com",
      contactPerson: "Private Person",
      serviceCategories: ["Personal care"],
      referralServices: ["SERV-0002"],
      serviceAreas: ["Sydney"],
      languages: ["English"],
      supportsNdis: true,
      supportsAgedCare: false,
      acceptingNewClients: true,
      urgentReferralAvailable: false,
      shortDescription: "Provider-submitted public profile draft.",
      targetClients: "Older people and families",
      publicContactMethods: ["Phone"],
      sourceChannel: "website",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });

    const saved = await saveProviderDraftPayload({
      draftId: "url-draft-id",
      draftPayload: rawPayload,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });
    const savedPayload = JSON.parse(saved.draftPayload);

    expect(saved.id).toBe("url-draft-id");
    expect(saved.source).toBe("provider-profile-generator");
    expect(saved.status).toBe("draft");
    expect(savedPayload.id).toBe("url-draft-id");
    expect(savedPayload.email).toBeUndefined();
    expect(savedPayload.contactPerson).toBeUndefined();
  });

  it("saveProviderDraftPayload preserves existing createdAt, status, and source while updating payload", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "claimed-draft-id",
        source: "manual-review",
        draftPayload: JSON.stringify({
          version: 1,
          id: "claimed-draft-id",
          businessName: "Old Claimed Provider",
        }),
        status: "claimed",
        createdAt: "2026-06-25T08:00:00.000Z",
        updatedAt: "2026-06-25T08:30:00.000Z",
      },
    ]);
    const rawPayload = JSON.stringify({
      version: 1,
      id: "payload-id",
      businessName: "Updated Claimed Provider",
      email: "private@example.com",
      contactPerson: "Private Person",
      serviceCategories: ["Personal care"],
      referralServices: ["SERV-0002"],
      serviceAreas: ["Sydney"],
      languages: ["English"],
      supportsNdis: true,
      supportsAgedCare: false,
      acceptingNewClients: true,
      urgentReferralAvailable: false,
      shortDescription: "Provider-submitted public profile draft.",
      targetClients: "Older people and families",
      publicContactMethods: ["Phone"],
      sourceChannel: "website",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });

    const saved = await saveProviderDraftPayload({
      draftId: "claimed-draft-id",
      draftPayload: rawPayload,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });
    const savedPayload = JSON.parse(saved.draftPayload);

    expect(saved.source).toBe("manual-review");
    expect(saved.status).toBe("claimed");
    expect(saved.createdAt).toBe("2026-06-25T08:00:00.000Z");
    expect(saved.updatedAt).toBe("2026-06-25T10:00:00.000Z");
    expect(savedPayload.id).toBe("claimed-draft-id");
    expect(savedPayload.businessName).toBe("Updated Claimed Provider");
  });

  it("saveProviderDraftPayload preserves archived status for existing drafts", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "archived-draft-id",
        source: "provider-profile-generator",
        draftPayload: JSON.stringify({
          version: 1,
          id: "archived-draft-id",
          businessName: "Old Archived Provider",
        }),
        status: "archived",
        createdAt: "2026-06-25T07:00:00.000Z",
        updatedAt: "2026-06-25T07:30:00.000Z",
      },
    ]);

    const saved = await saveProviderDraftPayload({
      draftId: "archived-draft-id",
      draftPayload: riversidePayload,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });

    expect(saved.status).toBe("archived");
    expect(saved.createdAt).toBe("2026-06-25T07:00:00.000Z");
    expect(saved.updatedAt).toBe("2026-06-25T10:00:00.000Z");
  });

  it("rejects public handoff overwrites for drafts already claimed by an owner", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "claimed-owned-draft-id",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "claimed",
        ownerUserId: "user-free",
        claimedAt: "2026-06-26T01:00:00.000Z",
        createdAt: "2026-06-25T08:00:00.000Z",
        updatedAt: "2026-06-25T08:30:00.000Z",
      },
    ]);

    await expect(
      saveProviderDraftPayload({
        draftId: "claimed-owned-draft-id",
        draftPayload: JSON.stringify({
          ...JSON.parse(riversidePayload),
          businessName: "Unsafe Public Overwrite",
        }),
        store,
        now: "2026-06-26T02:00:00.000Z",
      }),
    ).rejects.toThrow("Provider draft is already claimed");

    await expect(store.getDraft("claimed-owned-draft-id")).resolves.toMatchObject({
      ownerUserId: "user-free",
      updatedAt: "2026-06-25T08:30:00.000Z",
    });
  });

  it("resolveProviderDraft ignores an incomplete inbound payload and returns an existing claimed draft", async () => {
    const existingPayload = JSON.stringify({
      version: 1,
      id: "claimed-draft-id",
      businessName: "Existing Claimed Provider",
      shortDescription: "Existing stored profile should survive bad handoff.",
    });
    const store = createMemoryProviderDraftStore([
      {
        id: "claimed-draft-id",
        source: "provider-profile-generator",
        draftPayload: existingPayload,
        status: "claimed",
        createdAt: "2026-06-25T08:00:00.000Z",
        updatedAt: "2026-06-25T08:30:00.000Z",
      },
    ]);

    const resolved = await resolveProviderDraft({
      draftId: "claimed-draft-id",
      draftPayload: "{}",
      store,
      now: "2026-06-25T10:00:00.000Z",
    });
    const saved = await store.getDraft("claimed-draft-id");

    expect(resolved.source).toBe("store");
    expect(resolved.record?.status).toBe("claimed");
    expect(resolved.draft.profile.name).toBe("Existing Claimed Provider");
    expect(saved?.draftPayload).toBe(existingPayload);
    expect(saved?.updatedAt).toBe("2026-06-25T08:30:00.000Z");
  });

  it("resolveProviderDraft ignores an incomplete inbound payload and does not create a store record", async () => {
    const store = createMemoryProviderDraftStore();

    const resolved = await resolveProviderDraft({
      draftId: "missing-draft-id",
      draftPayload: "{}",
      store,
      now: "2026-06-25T10:00:00.000Z",
    });

    expect(resolved.source).toBe("sample");
    expect(resolved.draft.profile.name).toBe("Harbour Community Support");
    expect(await store.getDraft("missing-draft-id")).toBeUndefined();
  });

  it("saveProviderDraftPayload rejects incomplete payloads", async () => {
    const store = createMemoryProviderDraftStore();

    await expect(
      saveProviderDraftPayload({
        draftId: "invalid-draft-id",
        draftPayload: "{}",
        store,
        now: "2026-06-25T10:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid provider draft payload");
    expect(await store.getDraft("invalid-draft-id")).toBeUndefined();
  });

  it("stores an inbound generator payload and resolves it later by draft id", async () => {
    const store = createMemoryProviderDraftStore();
    const firstResolve = await resolveProviderDraft({
      draftId: "riverside-care-navigation",
      draftPayload: riversidePayload,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });
    const secondResolve = await resolveProviderDraft({
      draftId: "riverside-care-navigation",
      store,
      now: "2026-06-25T10:01:00.000Z",
    });

    expect(firstResolve.source).toBe("payload");
    expect(firstResolve.draft.profile.name).toBe("Riverside Care Navigation");
    expect(secondResolve.source).toBe("store");
    expect(secondResolve.draft.profile.name).toBe("Riverside Care Navigation");
    expect(secondResolve.record?.source).toBe("provider-profile-generator");
    expect(secondResolve.record?.status).toBe("draft");
  });

  it("claims an unowned provider draft for a workspace account", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "draft",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      },
    ]);

    const claimed = await claimProviderDraft({
      draftId: "riverside-care-navigation",
      ownerUserId: "user-free",
      store,
      now: "2026-06-26T01:00:00.000Z",
    });

    expect(claimed).toMatchObject({
      id: "riverside-care-navigation",
      status: "claimed",
      ownerUserId: "user-free",
      claimedAt: "2026-06-26T01:00:00.000Z",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-26T01:00:00.000Z",
    });
    await expect(store.getDraftByOwner("user-free")).resolves.toMatchObject({
      id: "riverside-care-navigation",
      status: "claimed",
      ownerUserId: "user-free",
    });
  });

  it("auto-claims a resolved unowned provider draft for a real Supabase user id", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "draft",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      },
    ]);
    const resolved = await resolveProviderDraft({
      draftId: "riverside-care-navigation",
      store,
    });

    const claimedResolution = await claimResolvedProviderDraftForOwner({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      resolution: resolved,
      store,
      now: "2026-06-26T01:00:00.000Z",
    });

    expect(claimedResolution?.record).toMatchObject({
      id: "riverside-care-navigation",
      status: "claimed",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      claimedAt: "2026-06-26T01:00:00.000Z",
    });
  });

  it("does not auto-claim provider drafts for demo account ids", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "draft",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-25T10:00:00.000Z",
      },
    ]);
    const resolved = await resolveProviderDraft({
      draftId: "riverside-care-navigation",
      store,
    });

    const claimedResolution = await claimResolvedProviderDraftForOwner({
      ownerUserId: "user-free",
      resolution: resolved,
      store,
    });

    expect(claimedResolution?.record).toMatchObject({
      id: "riverside-care-navigation",
      status: "draft",
      ownerUserId: undefined,
    });
  });

  it("does not query Supabase claimed drafts for demo account ids", async () => {
    const calls: string[] = [];
    const store: ProviderDraftStore = {
      kind: "supabase",
      async getDraft() {
        throw new Error("getDraft should not be called");
      },
      async getDraftByOwner(ownerUserId) {
        calls.push(ownerUserId);
        throw new Error("Supabase should not be queried for demo account ids");
      },
      async saveDraft(record) {
        return record;
      },
    };

    await expect(
      resolveProviderDraftForOwner({
        ownerUserId: "user-approved",
        store,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("does not allow a draft claimed by one owner to be claimed by another", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "claimed",
        ownerUserId: "user-free",
        claimedAt: "2026-06-26T01:00:00.000Z",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      },
    ]);

    await expect(
      claimProviderDraft({
        draftId: "riverside-care-navigation",
        ownerUserId: "user-approved",
        store,
        now: "2026-06-26T02:00:00.000Z",
      }),
    ).rejects.toThrow("Provider draft is already claimed");
  });

  it("keeps only the latest claimed draft active for a workspace owner", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "old-owner-profile",
        source: "provider-profile-generator",
        draftPayload: riversidePayload,
        status: "claimed",
        ownerUserId: "user-free",
        claimedAt: "2026-06-26T01:00:00.000Z",
        createdAt: "2026-06-26T01:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      },
      {
        id: "new-owner-profile",
        source: "provider-profile-generator",
        draftPayload: JSON.stringify({
          ...JSON.parse(riversidePayload),
          id: "new-owner-profile",
          businessName: "New Owner Profile",
        }),
        status: "draft",
        createdAt: "2026-06-26T02:00:00.000Z",
        updatedAt: "2026-06-26T02:00:00.000Z",
      },
    ]);

    const claimed = await claimProviderDraft({
      draftId: "new-owner-profile",
      ownerUserId: "user-free",
      store,
      now: "2026-06-26T03:00:00.000Z",
    });

    await expect(store.getDraft("old-owner-profile")).resolves.toMatchObject({
      status: "archived",
      ownerUserId: "user-free",
      updatedAt: "2026-06-26T03:00:00.000Z",
    });
    expect(claimed).toMatchObject({
      id: "new-owner-profile",
      status: "claimed",
      ownerUserId: "user-free",
    });
    await expect(store.getDraftByOwner("user-free")).resolves.toMatchObject({
      id: "new-owner-profile",
      status: "claimed",
    });
  });

  it("upserts a fresh inbound payload even when a stale draft id already exists", async () => {
    const store = createMemoryProviderDraftStore([
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draftPayload: JSON.stringify({
          version: 1,
          id: "riverside-care-navigation",
          businessName: "Old Riverside Profile",
        }),
        status: "draft",
        createdAt: "2026-06-25T09:00:00.000Z",
        updatedAt: "2026-06-25T09:00:00.000Z",
      },
    ]);
    const resolved = await resolveProviderDraft({
      draftId: "riverside-care-navigation",
      draftPayload: riversidePayload,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });
    const saved = await store.getDraft("riverside-care-navigation");

    expect(resolved.source).toBe("payload");
    expect(resolved.draft.profile.name).toBe("Riverside Care Navigation");
    expect(saved?.draftPayload).toBe(riversidePayload);
    expect(saved?.updatedAt).toBe("2026-06-25T10:00:00.000Z");
  });

  it("stores inbound payloads under the handoff draft id used for lookup", async () => {
    const store = createMemoryProviderDraftStore();
    const payloadWithDifferentInternalId = JSON.stringify({
      ...JSON.parse(riversidePayload),
      id: "payload-internal-id",
    });

    await resolveProviderDraft({
      draftId: "url-draft-id",
      draftPayload: payloadWithDifferentInternalId,
      store,
      now: "2026-06-25T10:00:00.000Z",
    });

    const saved = await store.getDraft("url-draft-id");
    const savedPayload = JSON.parse(saved?.draftPayload ?? "{}");

    expect(saved).toMatchObject({
      id: "url-draft-id",
    });
    expect(savedPayload.id).toBe("url-draft-id");
    expect(await store.getDraft("payload-internal-id")).toBeUndefined();
  });

  it("falls back to deterministic sample data when no stored or payload draft exists", async () => {
    const resolved = await resolveProviderDraft({
      draftId: "unknown-draft",
      store: createMemoryProviderDraftStore(),
    });

    expect(resolved.source).toBe("sample");
    expect(resolved.draft.profile.name).toBe("Harbour Community Support");
  });

  it("keeps a Supabase-ready schema for the persistent adapter", () => {
    expect(providerDraftSupabaseSchemaSql).toContain("provider_drafts");
    expect(providerDraftSupabaseSchemaSql).toContain("draft_payload jsonb");
    expect(providerDraftSupabaseSchemaSql).toContain("status text");
    expect(providerDraftSupabaseSchemaSql).toContain("source text");
    expect(providerDraftSupabaseSchemaSql).toContain(
      "alter table public.provider_drafts enable row level security",
    );
    expect(providerDraftSupabaseSchemaSql).toContain(
      "grant select, insert, update, delete on public.provider_drafts to service_role",
    );
    expect(providerDraftSupabaseSchemaSql).not.toContain("to anon");
  });

  it("maps Supabase rows into provider draft records", async () => {
    const calls: string[] = [];
    const supabase = {
      from(tableName: string) {
        calls.push(`from:${tableName}`);

        return {
          select(columns: string) {
            calls.push(`select:${columns}`);
            return this;
          },
          eq(column: string, value: string) {
            calls.push(`eq:${column}:${value}`);
            return this;
          },
          async maybeSingle() {
            calls.push("maybeSingle");

            return {
              data: {
                id: "riverside-care-navigation",
                source: "provider-profile-generator",
                draft_payload: JSON.parse(riversidePayload),
                status: "draft",
                owner_user_id: null,
                claimed_at: null,
                created_at: "2026-06-25T10:00:00.000Z",
                updated_at: "2026-06-25T10:00:00.000Z",
              },
              error: null,
            };
          },
        };
      },
    };
    const store = createSupabaseProviderDraftStore(supabase);
    const record = await store.getDraft("riverside-care-navigation");

    expect(record).toEqual({
      id: "riverside-care-navigation",
      source: "provider-profile-generator",
      draftPayload: riversidePayload,
      status: "draft",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
    });
    expect(calls).toEqual([
      "from:provider_drafts",
      "select:id, source, draft_payload, status, owner_user_id, claimed_at, created_at, updated_at",
      "eq:id:riverside-care-navigation",
      "maybeSingle",
    ]);
  });

  it("upserts provider drafts into Supabase using snake_case columns", async () => {
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
                id: "riverside-care-navigation",
                source: "provider-profile-generator",
                draft_payload: JSON.parse(riversidePayload),
                status: "draft",
                owner_user_id: null,
                claimed_at: null,
                created_at: "2026-06-25T10:00:00.000Z",
                updated_at: "2026-06-25T10:01:00.000Z",
              },
              error: null,
            };
          },
        };
      },
    };
    const store = createSupabaseProviderDraftStore(supabase);
    const record = await store.saveDraft({
      id: "riverside-care-navigation",
      source: "provider-profile-generator",
      draftPayload: riversidePayload,
      status: "draft",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:01:00.000Z",
    });

    expect(record.updatedAt).toBe("2026-06-25T10:01:00.000Z");
    expect(calls[1]).toEqual([
      "upsert",
      {
        id: "riverside-care-navigation",
        source: "provider-profile-generator",
        draft_payload: JSON.parse(riversidePayload),
        status: "draft",
        owner_user_id: null,
        claimed_at: null,
        created_at: "2026-06-25T10:00:00.000Z",
        updated_at: "2026-06-25T10:01:00.000Z",
      },
      { onConflict: "id" },
    ]);
  });

  it("uses Supabase only when server-side URL and service role env vars exist", () => {
    const createdClients: Array<{ url: string; key: string }> = [];
    const createClient = (url: string, key: string) => {
      createdClients.push({ url, key });
      return { from: () => ({}) };
    };
    const fallback = createProviderDraftStoreFromEnv({}, createClient);
    const supabaseStore = createProviderDraftStoreFromEnv(
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

  it("reuses the same memory fallback store across env lookups", async () => {
    const firstStore = createProviderDraftStoreFromEnv({});
    const secondStore = createProviderDraftStoreFromEnv({});

    await firstStore.saveDraft({
      id: "local-memory-handoff",
      source: "provider-profile-generator",
      draftPayload: riversidePayload,
      status: "draft",
      createdAt: "2026-06-25T10:00:00.000Z",
      updatedAt: "2026-06-25T10:00:00.000Z",
    });

    await expect(secondStore.getDraft("local-memory-handoff")).resolves.toMatchObject({
      id: "local-memory-handoff",
      source: "provider-profile-generator",
    });
  });
});
