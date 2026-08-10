import { describe, expect, it } from "vitest";
import { CaresLinkV1ContractError } from "./shared-contracts";
import {
  CARESLINK_V1_WELCOME_POINTS,
  createMemoryPointsShadowStore,
} from "./points-shadow";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const walletA = "33333333-3333-4333-8333-333333333333";
const now = "2026-08-09T00:00:00.000Z";

describe("Points shadow store", () => {
  it("grants a one-time welcome lot without touching legacy credits", async () => {
    const store = createMemoryPointsShadowStore();
    const lot = await grantWelcome(store);

    expect(lot).toMatchObject({
      source: "WELCOME",
      originalPoints: CARESLINK_V1_WELCOME_POINTS,
      remainingPoints: CARESLINK_V1_WELCOME_POINTS,
      shadow: true,
    });
    await expect(store.getSnapshot(ownerA)).resolves.toMatchObject({
      availablePoints: 300,
      reservedPoints: 0,
      ledger: [{ event: "GRANT", delta: 300 }],
    });
  });

  it("quotes, reserves and commits the approved NDIS rate exactly once", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const quote = await createNdisQuote(store);
    const input = reserveInput(quote.id);

    const reservation = await store.reserve(input);
    const replay = await store.reserve(input);

    expect(reservation).toMatchObject({
      serviceCode: "note.ndis.generate",
      points: 50,
      status: "RESERVED",
    });
    expect(replay).toEqual(reservation);
    expect((await store.getSnapshot(ownerA))?.availablePoints).toBe(250);
    expect((await store.getSnapshot(ownerA))?.reservedPoints).toBe(50);
    expect(
      (await store.getSnapshot(ownerA))?.ledger.filter(
        (entry) => entry.event === "RESERVE",
      ),
    ).toHaveLength(1);

    const committed = await store.commit({
      ownerUserId: ownerA,
      reservationId: reservation.id,
      ledgerEntryId: "77777777-7777-4777-8777-777777777777",
      resultRef: "document:ndis:revision:0001",
      now: "2026-08-09T00:03:00.000Z",
    });
    const commitReplay = await store.commit({
      ownerUserId: ownerA,
      reservationId: reservation.id,
      ledgerEntryId: "another-ledger-id-is-not-used",
      resultRef: "document:ndis:revision:0001",
      now: "2026-08-09T00:04:00.000Z",
    });

    expect(committed.status).toBe("COMMITTED");
    expect(commitReplay).toEqual(committed);
    await expect(store.getSnapshot(ownerA)).resolves.toMatchObject({
      availablePoints: 250,
      reservedPoints: 0,
    });
  });

  it("releases a failed reservation back to the exact source lot once", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const reservation = await store.reserve(
      reserveInput((await createNdisQuote(store)).id),
    );

    const released = await store.release({
      ownerUserId: ownerA,
      reservationId: reservation.id,
      ledgerEntryId: "88888888-8888-4888-8888-888888888888",
      reasonCode: "generation_failed",
      now: "2026-08-09T00:03:00.000Z",
    });
    const replay = await store.release({
      ownerUserId: ownerA,
      reservationId: reservation.id,
      ledgerEntryId: "unused-ledger-replay-id",
      reasonCode: "generation_failed",
      now: "2026-08-09T00:04:00.000Z",
    });

    expect(released.status).toBe("RELEASED");
    expect(replay).toEqual(released);
    const snapshot = await store.getSnapshot(ownerA);
    expect(snapshot?.availablePoints).toBe(300);
    expect(snapshot?.lots[0]).toMatchObject({ remainingPoints: 300 });
    expect(
      snapshot?.ledger.filter((entry) => entry.event === "RELEASE"),
    ).toHaveLength(1);
  });

  it("caps a reservation expiry at the server quote expiry", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const quote = await createNdisQuote(store, "2026-08-09T00:05:00.000Z");

    const reservation = await store.reserve({
      ...reserveInput(quote.id),
      expiresAt: "2026-08-09T00:20:00.000Z",
    });

    expect(reservation.expiresAt).toBe("2026-08-09T00:05:00.000Z");
  });

  it("allocates earliest-expiring allowance before later grants and top-ups", async () => {
    const store = createMemoryPointsShadowStore();
    await store.grantLot({
      id: "lot-expiring-first",
      ledgerEntryId: "ledger-expiring-first",
      walletId: walletA,
      ownerUserId: ownerA,
      source: "SUBSCRIPTION",
      sourceReference: "subscription:2026-08:first",
      points: 20,
      expiresAt: "2026-08-20T00:00:00.000Z",
      now,
    });
    await store.grantLot({
      id: "lot-expiring-later",
      ledgerEntryId: "ledger-expiring-later",
      walletId: walletA,
      ownerUserId: ownerA,
      source: "WELCOME",
      sourceReference: "welcome:v1",
      points: 40,
      expiresAt: "2026-09-20T00:00:00.000Z",
      now: "2026-08-09T00:00:01.000Z",
    });
    await store.grantLot({
      id: "lot-top-up",
      ledgerEntryId: "ledger-top-up",
      walletId: walletA,
      ownerUserId: ownerA,
      source: "TOP_UP",
      sourceReference: "topup:purchase:0001",
      points: 100,
      now: "2026-08-09T00:00:02.000Z",
    });

    const reservation = await store.reserve(
      reserveInput((await createNdisQuote(store)).id),
    );

    expect(reservation.allocations).toEqual([
      { lotId: "lot-expiring-first", points: 20 },
      { lotId: "lot-expiring-later", points: 30 },
    ]);
    expect(
      (await store.getSnapshot(ownerA))?.lots.find(
        (lot) => lot.id === "lot-top-up",
      )?.remainingPoints,
    ).toBe(100);
  });

  it("fails insufficient reservations without changing balance or ledger", async () => {
    const store = createMemoryPointsShadowStore();
    await store.grantLot({
      id: "small-lot",
      ledgerEntryId: "small-lot-ledger",
      walletId: walletA,
      ownerUserId: ownerA,
      source: "WELCOME",
      sourceReference: "welcome:v1",
      points: 20,
      now,
    });
    const before = await store.getSnapshot(ownerA);

    await expect(
      store.reserve(reserveInput((await createNdisQuote(store)).id)),
    ).rejects.toMatchObject({ code: "POINTS_INSUFFICIENT" });
    const after = await store.getSnapshot(ownerA);

    expect(after?.availablePoints).toBe(20);
    expect(after?.ledger).toEqual(before?.ledger);
  });

  it("rejects expired quotes before allocating any lot", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const quote = await createNdisQuote(
      store,
      "2026-08-09T00:01:00.000Z",
    );

    await expect(
      store.reserve({
        ...reserveInput(quote.id),
        now: "2026-08-09T00:02:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "POINT_QUOTE_EXPIRED" });
    expect((await store.getSnapshot(ownerA))?.availablePoints).toBe(300);
  });

  it("does not allow a committed reservation to be released", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const reservation = await store.reserve(
      reserveInput((await createNdisQuote(store)).id),
    );
    await store.commit({
      ownerUserId: ownerA,
      reservationId: reservation.id,
      ledgerEntryId: "77777777-7777-4777-8777-777777777777",
      resultRef: "document:ndis:revision:0001",
      now: "2026-08-09T00:03:00.000Z",
    });

    await expect(
      store.release({
        ownerUserId: ownerA,
        reservationId: reservation.id,
        ledgerEntryId: "88888888-8888-4888-8888-888888888888",
        reasonCode: "late_release",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("does not reveal another owner's reservation or ledger", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);
    const reservation = await store.reserve(
      reserveInput((await createNdisQuote(store)).id),
    );

    await expect(
      store.getReservation({
        ownerUserId: ownerB,
        reservationId: reservation.id,
      }),
    ).resolves.toBeUndefined();
    await expect(store.getSnapshot(ownerB)).resolves.toBeUndefined();
    await expect(
      store.commit({
        ownerUserId: ownerB,
        reservationId: reservation.id,
        ledgerEntryId: "owner-b-ledger-entry",
        resultRef: "owner-b-result-ref",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces variable-rate quote boundaries", async () => {
    const store = createMemoryPointsShadowStore();

    await expect(
      store.createQuote({
        id: "variable-quote-low",
        ownerUserId: ownerA,
        serviceCode: "note.regenerate.full",
        pointsOverride: 10,
        idempotencyKey: "quote.regenerate:0001",
        expiresAt: "2026-08-09T00:10:00.000Z",
        now,
      }),
    ).rejects.toBeInstanceOf(CaresLinkV1ContractError);
    await expect(
      store.createQuote({
        id: "variable-quote-valid",
        ownerUserId: ownerA,
        serviceCode: "note.regenerate.full",
        pointsOverride: 30,
        idempotencyKey: "quote.regenerate:0002",
        expiresAt: "2026-08-09T00:10:00.000Z",
        now,
      }),
    ).resolves.toMatchObject({ points: 30 });
  });

  it("detects conflicting grant idempotency instead of changing an old lot", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store);

    await expect(
      store.grantLot({
        id: "44444444-4444-4444-8444-444444444444",
        ledgerEntryId: "different-ledger-entry-id",
        walletId: walletA,
        ownerUserId: ownerA,
        source: "WELCOME",
        sourceReference: "welcome:v1",
        points: 600,
        now,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await store.getSnapshot(ownerA))?.availablePoints).toBe(300);
  });

  it("does not count expired lots in the available shadow balance", async () => {
    const store = createMemoryPointsShadowStore();
    await grantWelcome(store, {
      points: 300,
      now: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-10T00:00:00.000Z",
    });

    expect(
      (await store.getSnapshot(ownerA, "2026-08-09T12:00:00.000Z"))
        ?.availablePoints,
    ).toBe(300);
    expect(
      (await store.getSnapshot(ownerA, "2026-08-10T00:00:00.000Z"))
        ?.availablePoints,
    ).toBe(0);
  });
});

function grantWelcome(
  store: ReturnType<typeof createMemoryPointsShadowStore>,
  overrides: { points?: number; now?: string; expiresAt?: string } = {},
) {
  return store.grantLot({
    id: "44444444-4444-4444-8444-444444444444",
    ledgerEntryId: "55555555-5555-4555-8555-555555555555",
    walletId: walletA,
    ownerUserId: ownerA,
    source: "WELCOME",
    sourceReference: "welcome:v1",
    points: overrides.points ?? CARESLINK_V1_WELCOME_POINTS,
    now: overrides.now ?? now,
    expiresAt: overrides.expiresAt,
  });
}

function createNdisQuote(
  store: ReturnType<typeof createMemoryPointsShadowStore>,
  expiresAt = "2026-08-09T00:10:00.000Z",
) {
  return store.createQuote({
    id: "66666666-6666-4666-8666-666666666666",
    ownerUserId: ownerA,
    serviceCode: "note.ndis.generate",
    idempotencyKey: "quote.ndis.generate:0001",
    expiresAt,
    now,
  });
}

function reserveInput(quoteId: string) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    ledgerEntryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerUserId: ownerA,
    quoteId,
    idempotencyKey: "reserve.ndis.generate:0001",
    expiresAt: "2026-08-09T00:08:00.000Z",
    now: "2026-08-09T00:02:00.000Z",
  } as const;
}
