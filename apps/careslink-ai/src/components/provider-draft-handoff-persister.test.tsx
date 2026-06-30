import { describe, expect, it, vi } from "vitest";
import { PROVIDER_GENERATOR_SOURCE } from "../lib/referral-workspace-handoff";
import {
  PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
  PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
  getProviderDraftLocalStorageKey,
} from "../lib/provider-draft-local-handoff";
import { persistProviderDraftLocalHandoff } from "./provider-draft-handoff-persister";

type StorageFake = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

function createStorageFake(values: Record<string, string>): StorageFake {
  const store = new Map(Object.entries(values));

  return {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function createLocalDraftRecord(draftId: string, payload: Record<string, unknown>) {
  return JSON.stringify({
    version: PROVIDER_DRAFT_LOCAL_HANDOFF_VERSION,
    source: PROVIDER_DRAFT_LOCAL_HANDOFF_SOURCE,
    draftId,
    payload,
  });
}

describe("provider draft handoff persister", () => {
  it("posts a valid localStorage draft, removes it, and refreshes", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: createLocalDraftRecord(draftId, draftPayload),
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const refresh = vi.fn();
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("saved");

    expect(fetcher).toHaveBeenCalledWith("/api/provider-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        draftPayload: JSON.stringify(draftPayload),
      }),
    });
    expect(removeItem).toHaveBeenCalledWith(storageKey);
    expect(storage.getItem(storageKey)).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing when draftPayload is already present", async () => {
    const storage = createStorageFake({});
    const fetcher = vi.fn();
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId: "test-provider-1",
        draftPayload: "{\"businessName\":\"Already carried by URL\"}",
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when draftPayload is present as an empty string", async () => {
    const storage = createStorageFake({});
    const fetcher = vi.fn();
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId: "test-provider-1",
        draftPayload: "",
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when source is not provider-profile-generator", async () => {
    const storage = createStorageFake({});
    const fetcher = vi.fn();
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: "other-source",
        draftId: "test-provider-1",
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when draftId is missing", async () => {
    const storage = createStorageFake({});
    const fetcher = vi.fn();
    const refresh = vi.fn();
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when localStorage has no draft record", async () => {
    const draftId = "test-provider-1";
    const storage = createStorageFake({});
    const fetcher = vi.fn();
    const refresh = vi.fn();
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing when localStorage has no valid draft", async () => {
    const draftId = "test-provider-1";
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: "not-json",
    });
    const fetcher = vi.fn();
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("skipped");

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.getItem(storageKey)).toBe("not-json");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns failed and keeps localStorage when the save response is not ok", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: createLocalDraftRecord(draftId, draftPayload),
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: false });
    const refresh = vi.fn();
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("failed");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(storageKey)).toBe(createLocalDraftRecord(draftId, draftPayload));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns failed and keeps localStorage when fetch rejects", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: createLocalDraftRecord(draftId, draftPayload),
    });
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const refresh = vi.fn();
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("failed");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.getItem(storageKey)).toBe(createLocalDraftRecord(draftId, draftPayload));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns failed when storage.getItem throws and does not fetch or refresh", async () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      removeItem: vi.fn(),
    };
    const fetcher = vi.fn();
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId: "test-provider-1",
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("failed");

    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns failed when storage.removeItem throws after a successful save and does not refresh", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = {
      getItem: vi.fn(() => createLocalDraftRecord(draftId, draftPayload)),
      removeItem: vi.fn(() => {
        throw new Error("remove blocked");
      }),
    };
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const refresh = vi.fn();

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("failed");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledWith(storageKey);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("returns failed when refresh throws after storage is removed", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: createLocalDraftRecord(draftId, draftPayload),
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const refresh = vi.fn(() => {
      throw new Error("refresh failed");
    });
    const removeItem = vi.spyOn(storage, "removeItem");

    await expect(
      persistProviderDraftLocalHandoff({
        source: PROVIDER_GENERATOR_SOURCE,
        draftId,
        storage,
        fetcher,
        refresh,
      }),
    ).resolves.toBe("failed");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(removeItem).toHaveBeenCalledWith(storageKey);
    expect(storage.getItem(storageKey)).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("only posts once for concurrent calls with the same valid local draft", async () => {
    const draftId = "test-provider-1";
    const draftPayload = {
      id: draftId,
      businessName: "Bright Path Community Support",
    };
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const storage = createStorageFake({
      [storageKey]: createLocalDraftRecord(draftId, draftPayload),
    });
    let resolveFetch: (response: { ok: boolean }) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const refresh = vi.fn();

    const firstResult = persistProviderDraftLocalHandoff({
      source: PROVIDER_GENERATOR_SOURCE,
      draftId,
      storage,
      fetcher,
      refresh,
    });
    const secondResult = persistProviderDraftLocalHandoff({
      source: PROVIDER_GENERATOR_SOURCE,
      draftId,
      storage,
      fetcher,
      refresh,
    });

    await expect(secondResult).resolves.toBe("skipped");
    resolveFetch({ ok: true });
    await expect(firstResult).resolves.toBe("saved");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(storage.getItem(storageKey)).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
