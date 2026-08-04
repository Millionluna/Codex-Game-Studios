import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAccountCreditStoreFromEnv } from "./account-credit-store";

const summary = {
  planCode: "free",
  status: "active",
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  creditLimit: 3,
  remainingCredits: 2,
  usedCredits: 1,
  reservedCredits: 0,
};

describe("account credit store", () => {
  it("fails closed without persistent Supabase configuration", () => {
    expect(() => createAccountCreditStoreFromEnv({})).toThrow(
      "Persistent account credit storage is required",
    );
  });

  it("loads only the requested owner's metadata summary and ledger", async () => {
    const { client, query } = createClientFixture();
    client.rpc.mockResolvedValueOnce({ data: summary, error: null });
    query.limit.mockResolvedValueOnce({
      data: [
        {
          id: "ledger-1",
          feature: "ndis_case_note",
          action: "generate",
          event: "commit",
          units: 1,
          reason_code: null,
          model: "gpt-5.4-mini",
          created_at: "2026-08-04T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const store = createStore(client);
    const usage = await store.getUsage({
      userId: "11111111-1111-4111-8111-111111111111",
      recentLimit: 8,
    });

    expect(usage).toEqual({
      ...summary,
      recentUsage: [
        {
          id: "ledger-1",
          feature: "ndis_case_note",
          action: "generate",
          event: "commit",
          units: 1,
          model: "gpt-5.4-mini",
          createdAt: "2026-08-04T00:00:00.000Z",
        },
      ],
    });
    expect(client.rpc).toHaveBeenCalledWith("get_account_credit_summary", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(query.eq).toHaveBeenNthCalledWith(
      1,
      "user_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(query.eq).toHaveBeenNthCalledWith(
      2,
      "period_start",
      "2026-08-01",
    );
  });

  it("passes feature, action and idempotency metadata to the transactional reserve RPC", async () => {
    const { client } = createClientFixture();
    client.rpc.mockResolvedValueOnce({
      data: {
        ...summary,
        reservationStatus: "reserved",
        reservationId: "22222222-2222-4222-8222-222222222222",
        isNew: true,
      },
      error: null,
    });
    const store = createStore(client);
    const decision = await store.reserveCredit({
      userId: "11111111-1111-4111-8111-111111111111",
      feature: "ndis_case_note",
      action: "generate",
      idempotencyKey: "case-note-request-0001",
    });

    expect(decision.reservationStatus).toBe("reserved");
    expect(decision.isNew).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("reserve_account_credit", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_feature: "ndis_case_note",
      p_action: "generate",
      p_idempotency_key: "case-note-request-0001",
    });
  });

  it("uses separate idempotent commit and release RPCs", async () => {
    const { client } = createClientFixture();
    client.rpc
      .mockResolvedValueOnce({
        data: {
          ...summary,
          reservationStatus: "completed",
          reservationId: "22222222-2222-4222-8222-222222222222",
          isNew: false,
          resultRef: "a".repeat(64),
          model: "gpt-5.4-mini",
          inputTokenCount: 120,
          outputTokenCount: 80,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...summary,
          remainingCredits: 3,
          usedCredits: 0,
          reservationStatus: "released",
          reservationId: "33333333-3333-4333-8333-333333333333",
          isNew: false,
          reasonCode: "generation_failed",
        },
        error: null,
      });
    const store = createStore(client);

    await store.commitCredit({
      userId: "11111111-1111-4111-8111-111111111111",
      reservationId: "22222222-2222-4222-8222-222222222222",
      resultRef: "a".repeat(64),
      model: "gpt-5.4-mini",
      inputTokenCount: 120,
      outputTokenCount: 80,
    });
    await store.releaseCredit({
      userId: "11111111-1111-4111-8111-111111111111",
      reservationId: "33333333-3333-4333-8333-333333333333",
      reasonCode: "generation_failed",
    });

    expect(client.rpc).toHaveBeenNthCalledWith(1, "commit_account_credit", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_reservation_id: "22222222-2222-4222-8222-222222222222",
      p_result_ref: "a".repeat(64),
      p_model: "gpt-5.4-mini",
      p_input_token_count: 120,
      p_output_token_count: 80,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "release_account_credit", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_reservation_id: "33333333-3333-4333-8333-333333333333",
      p_reason_code: "generation_failed",
    });
  });
});

describe("account credit migration contract", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260804190000_create_account_credit_entitlements.sql",
    ),
    "utf8",
  );

  it("keeps ledger rows metadata-only and append-only for application roles", () => {
    expect(migration).toContain("create table if not exists public.account_entitlements");
    expect(migration).toContain("create table if not exists public.credit_ledger");
    expect(migration).toContain("grant select on public.credit_ledger to authenticated");
    expect(migration).toContain("grant select on public.credit_ledger to authenticated, service_role");
    expect(migration).not.toContain("grant insert on public.credit_ledger");
    expect(migration).not.toContain("grant update on public.credit_ledger");
    expect(migration).not.toContain("grant delete on public.credit_ledger");
    expect(migration).not.toMatch(/credit_ledger[\s\S]{0,500}(prompt|participant_facts|generated_content)/i);
  });

  it("defines owner-only RLS and service-role-only transactional RPCs", () => {
    expect(migration).toContain("create policy account_entitlements_owner_select");
    expect(migration).toContain("create policy credit_ledger_owner_select");
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("create or replace function public.reserve_account_credit");
    expect(migration).toContain("create or replace function public.commit_account_credit");
    expect(migration).toContain("create or replace function public.release_account_credit");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});

function createStore(client: ReturnType<typeof createClientFixture>["client"]) {
  return createAccountCreditStoreFromEnv(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    },
    () => client as never,
  );
}

function createClientFixture() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return {
    query,
    client: {
      rpc: vi.fn(),
      from: vi.fn(() => query),
    },
  };
}
