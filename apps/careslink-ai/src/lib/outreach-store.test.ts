import { describe, expect, it } from "vitest";
import {
  createMemoryOutreachStore,
  createOutreachRecord,
  outreachSupabaseSchemaSql,
  type OutreachRecord,
} from "./outreach-store";

const outreachRecord: OutreachRecord = {
  id: "outreach-1",
  userId: "11111111-1111-4111-8111-111111111111",
  providerDraftId: "provider-draft-1",
  generatedMaterialDraftId: "generated-material-1",
  recipientName: "Mia Chen",
  organisation: "Community Link",
  roleType: "support_coordinator",
  channel: "wechat",
  status: "sent",
  lastContactedAt: "2026-06-29",
  nextFollowUpAt: "2026-07-02",
  notes: "Sent referral pack intro after provider review.",
  createdAt: "2026-06-29T10:00:00.000Z",
  updatedAt: "2026-06-29T10:00:00.000Z",
};

describe("outreach store", () => {
  it("saves and lists outreach records newest-first by provider owner", async () => {
    const store = createMemoryOutreachStore([
      {
        ...outreachRecord,
        id: "older-outreach",
        recipientName: "Older contact",
        createdAt: "2026-06-29T09:00:00.000Z",
        updatedAt: "2026-06-29T09:00:00.000Z",
      },
    ]);

    await expect(store.saveOutreach(outreachRecord)).resolves.toEqual(
      outreachRecord,
    );
    await expect(
      store.listOutreachByUser({
        userId: outreachRecord.userId,
        providerDraftId: outreachRecord.providerDraftId,
      }),
    ).resolves.toMatchObject([
      { id: "outreach-1", recipientName: "Mia Chen" },
      { id: "older-outreach", recipientName: "Older contact" },
    ]);
  });

  it("filters outreach records by status and user", async () => {
    const store = createMemoryOutreachStore([
      outreachRecord,
      {
        ...outreachRecord,
        id: "reply-1",
        status: "replied",
        recipientName: "Reply contact",
      },
      {
        ...outreachRecord,
        id: "other-user",
        userId: "22222222-2222-4222-8222-222222222222",
        status: "sent",
      },
    ]);

    await expect(
      store.listOutreachByUser({
        userId: outreachRecord.userId,
        status: "replied",
      }),
    ).resolves.toMatchObject([{ id: "reply-1" }]);
  });

  it("updates an existing outreach record by id", async () => {
    const store = createMemoryOutreachStore([outreachRecord]);

    await store.saveOutreach({
      ...outreachRecord,
      status: "replied",
      nextFollowUpAt: "2026-07-06",
      notes: "Recipient replied and asked for more details.",
      updatedAt: "2026-06-30T02:00:00.000Z",
    });

    await expect(store.getOutreach(outreachRecord.id)).resolves.toMatchObject({
      id: outreachRecord.id,
      status: "replied",
      nextFollowUpAt: "2026-07-06",
      notes: "Recipient replied and asked for more details.",
      updatedAt: "2026-06-30T02:00:00.000Z",
    });
  });

  it("normalizes manually created outreach records", () => {
    const record = createOutreachRecord({
      userId: outreachRecord.userId,
      providerDraftId: outreachRecord.providerDraftId,
      generatedMaterialDraftId: outreachRecord.generatedMaterialDraftId,
      recipientName: "  Alex Referral  ",
      organisation: "  Partner org  ",
      roleType: "provider",
      channel: "email",
      status: "follow_up",
      lastContactedAt: "2026-06-29",
      nextFollowUpAt: "not-a-date",
      notes: "  Check back next week.  ",
      now: "2026-06-29T11:00:00.000Z",
    });

    expect(record).toMatchObject({
      userId: outreachRecord.userId,
      providerDraftId: outreachRecord.providerDraftId,
      generatedMaterialDraftId: outreachRecord.generatedMaterialDraftId,
      recipientName: "Alex Referral",
      organisation: "Partner org",
      roleType: "provider",
      channel: "email",
      status: "follow_up",
      lastContactedAt: "2026-06-29",
      notes: "Check back next week.",
      createdAt: "2026-06-29T11:00:00.000Z",
    });
    expect(record.nextFollowUpAt).toBeUndefined();
    expect(record.id).toMatch(/^outreach-/);
  });

  it("keeps a Supabase-ready schema without generated content or lead resale fields", () => {
    expect(outreachSupabaseSchemaSql).toContain(
      "create table if not exists public.outreach_records",
    );
    expect(outreachSupabaseSchemaSql).toContain("recipient_name text not null");
    expect(outreachSupabaseSchemaSql).toContain("status text not null");
    expect(outreachSupabaseSchemaSql).toContain(
      "alter table public.outreach_records enable row level security",
    );
    expect(outreachSupabaseSchemaSql).toContain(
      "grant select, insert, update, delete on public.outreach_records to service_role",
    );
    expect(outreachSupabaseSchemaSql).not.toContain("content jsonb");
    expect(outreachSupabaseSchemaSql).not.toContain("sale");
  });
});
