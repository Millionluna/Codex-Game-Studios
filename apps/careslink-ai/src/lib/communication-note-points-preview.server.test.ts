import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNICATION_NOTE_POINTS_PREVIEW_DEADLINE_MS,
  COMMUNICATION_NOTE_POINTS_PREVIEW_RPC,
  resolveCommunicationNotePointsPreview,
} from "./communication-note-points-preview.server";

vi.mock("server-only", () => ({}));

const available = {
  status: "AVAILABLE",
  unit: "POINTS",
  serviceCode: "note.communication.generate",
  catalogVersion: "2026-08-09.v1-shadow",
  generationCostPoints: 20,
  availablePoints: 300,
  reservedPoints: 20,
  canAfford: true,
} as const;

describe("Communication Note Points preview resolver", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one zero-argument current-session RPC and returns a frozen safe DTO", async () => {
    const request = Promise.resolve({ data: available, error: null });
    const abortSignal = vi.fn((signal: AbortSignal) => {
      void signal;
      return request;
    });
    Object.assign(request, { abortSignal });
    const rpc = vi.fn(() => request);

    const result = await resolveCommunicationNotePointsPreview({ rpc });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(COMMUNICATION_NOTE_POINTS_PREVIEW_RPC);
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(abortSignal.mock.calls[0]?.[0].aborted).toBe(false);
    expect(result).toEqual(available);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /user|owner|session|wallet|lot|quote|reservation|idempotency|ledger/i,
    );
  });

  it("returns a rate without inventing a balance when the wallet is not ready", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
      },
      error: null,
    });

    await expect(resolveCommunicationNotePointsPreview({ rpc })).resolves.toEqual(
      {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
      },
    );
  });

  it.each([
    ["missing client", undefined],
    ["client without rpc", { auth: {} }],
    ["missing error field", { data: available }],
    ["rpc error", { data: available, error: { message: "private upstream" } }],
    ["null data", { data: null, error: null }],
  ])("fails closed for %s", async (_label, input) => {
    const client =
      input && typeof input === "object" && "data" in input
        ? { rpc: vi.fn().mockResolvedValue(input) }
        : input;

    await expect(resolveCommunicationNotePointsPreview(client)).resolves.toEqual({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });
  });

  it.each([
    ["null response", null],
    ["array response", []],
  ])("fails closed for an RPC %s", async (_label, response) => {
    const rpc = vi.fn().mockResolvedValue(response);

    await expect(resolveCommunicationNotePointsPreview({ rpc })).resolves.toEqual({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });
  });

  it("fails closed at a bounded deadline without keeping the page pending", async () => {
    vi.useFakeTimers();
    const request = new Promise<never>(() => {});
    const abortSignal = vi.fn((signal: AbortSignal) => {
      void signal;
      return request;
    });
    Object.assign(request, { abortSignal });
    const rpc = vi.fn(() => request);

    const result = resolveCommunicationNotePointsPreview({ rpc });
    await vi.advanceTimersByTimeAsync(
      COMMUNICATION_NOTE_POINTS_PREVIEW_DEADLINE_MS,
    );

    await expect(result).resolves.toEqual({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(abortSignal).toHaveBeenCalledTimes(1);
    expect(abortSignal.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it("fails closed when the RPC throws without exposing its message", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("database-private-detail"));

    const result = await resolveCommunicationNotePointsPreview({ rpc });

    expect(result).toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
    expect(JSON.stringify(result)).not.toContain("database-private-detail");
  });

  it.each([
    ["negative available", { ...available, availablePoints: -1 }],
    ["fractional available", { ...available, availablePoints: 1.5 }],
    ["unsafe available", { ...available, availablePoints: Number.MAX_SAFE_INTEGER + 1 }],
    ["negative reserved", { ...available, reservedPoints: -1 }],
    ["fractional reserved", { ...available, reservedPoints: 1.5 }],
    ["unsafe reserved", { ...available, reservedPoints: Number.MAX_SAFE_INTEGER + 1 }],
    ["wrong affordability", { ...available, availablePoints: 0 }],
    ["wrong unaffordability", { ...available, canAfford: false }],
    ["wrong cost", { ...available, generationCostPoints: 21 }],
    ["wrong catalog", { ...available, catalogVersion: "floating" }],
    ["wrong service", { ...available, serviceCode: "note.ndis.generate" }],
    ["wrong unit", { ...available, unit: "CREDITS" }],
    ["extra key", { ...available, ownerUserId: "private" }],
    [
      "extra not-ready key",
      {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
        availablePoints: 0,
      },
    ],
    [
      "wrong not-ready unit",
      {
        status: "NOT_READY",
        unit: "CREDITS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
      },
    ],
    [
      "wrong not-ready service",
      {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.ndis.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
      },
    ],
    [
      "wrong not-ready catalog",
      {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "floating",
        generationCostPoints: 20,
      },
    ],
    [
      "wrong not-ready cost",
      {
        status: "NOT_READY",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 21,
      },
    ],
    [
      "missing available key",
      {
        status: "AVAILABLE",
        unit: "POINTS",
        serviceCode: "note.communication.generate",
        catalogVersion: "2026-08-09.v1-shadow",
        generationCostPoints: 20,
        reservedPoints: 0,
        canAfford: true,
      },
    ],
  ])("rejects a malformed or drifted %s response", async (_label, data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });

    await expect(resolveCommunicationNotePointsPreview({ rpc })).resolves.toEqual({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });
  });
});
