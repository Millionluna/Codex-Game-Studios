import { describe, expect, it } from "vitest";
import {
  createGeneratedMaterialEventRecord,
  createMemoryGeneratedMaterialEventStore,
  generatedMaterialEventSupabaseSchemaSql,
  type GeneratedMaterialEventRecord,
} from "./generated-material-event-store";

const materialEventRecord: GeneratedMaterialEventRecord = {
  id: "generated-material-event-1",
  userId: "11111111-1111-4111-8111-111111111111",
  providerDraftId: "provider-draft-1",
  generatedMaterialDraftId: "generated-material-1",
  feature: "share_card",
  eventType: "copy_all",
  createdAt: "2026-06-26T10:00:00.000Z",
};

describe("generated material event store", () => {
  it("saves and lists generated material events without generated content", async () => {
    const store = createMemoryGeneratedMaterialEventStore();

    await expect(
      store.saveGeneratedMaterialEvent(materialEventRecord),
    ).resolves.toEqual(materialEventRecord);
    await expect(store.listGeneratedMaterialEvents()).resolves.toEqual([
      materialEventRecord,
    ]);
    expect(JSON.stringify(await store.listGeneratedMaterialEvents())).not.toContain(
      "Private generated text",
    );
  });

  it("lists generated material events newest-first with filters", async () => {
    const store = createMemoryGeneratedMaterialEventStore([
      {
        ...materialEventRecord,
        id: "older-copy-all",
        eventType: "copy_all",
        createdAt: "2026-06-26T09:00:00.000Z",
      },
      {
        ...materialEventRecord,
        id: "newer-copy-field",
        eventType: "copy_field",
        fieldKey: "supportNeed",
        createdAt: "2026-06-26T10:00:00.000Z",
      },
      {
        ...materialEventRecord,
        id: "ndis-case-note-copy",
        feature: "ndis_case_note",
        createdAt: "2026-06-26T11:00:00.000Z",
      },
    ]);

    await expect(
      store.listGeneratedMaterialEvents({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_field",
      }),
    ).resolves.toMatchObject([
      {
        id: "newer-copy-field",
        fieldKey: "supportNeed",
      },
    ]);
    await expect(
      store.listGeneratedMaterialEvents({
        excludeFeature: "ndis_case_note",
      }),
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ndis-case-note-copy" }),
      ]),
    );
  });

  it("creates normalized event records", () => {
    const record = createGeneratedMaterialEventRecord({
      userId: materialEventRecord.userId,
      providerDraftId: materialEventRecord.providerDraftId,
      generatedMaterialDraftId: materialEventRecord.generatedMaterialDraftId,
      feature: "handover_checklist",
      eventType: "copy_field",
      fieldKey: "supportNeed",
      now: "2026-06-26T11:00:00.000Z",
    });

    expect(record).toMatchObject({
      userId: materialEventRecord.userId,
      providerDraftId: materialEventRecord.providerDraftId,
      generatedMaterialDraftId: materialEventRecord.generatedMaterialDraftId,
      feature: "handover_checklist",
      eventType: "copy_field",
      fieldKey: "supportNeed",
      createdAt: "2026-06-26T11:00:00.000Z",
    });
    expect(record.id).toMatch(/^generated-material-event-/);
  });

  it("keeps a Supabase-ready schema with server-only grants and no content column", () => {
    expect(generatedMaterialEventSupabaseSchemaSql).toContain(
      "create table if not exists public.generated_material_events",
    );
    expect(generatedMaterialEventSupabaseSchemaSql).toContain(
      "generated_material_draft_id text not null",
    );
    expect(generatedMaterialEventSupabaseSchemaSql).toContain(
      "event_type text not null",
    );
    expect(generatedMaterialEventSupabaseSchemaSql).toContain(
      "alter table public.generated_material_events enable row level security",
    );
    expect(generatedMaterialEventSupabaseSchemaSql).toContain(
      "grant select, insert, update, delete on public.generated_material_events to service_role",
    );
    expect(generatedMaterialEventSupabaseSchemaSql).not.toContain("content jsonb");
  });
});
