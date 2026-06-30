"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getProviderDraftLocalStorageKey,
  parseProviderDraftLocalHandoff,
} from "../lib/provider-draft-local-handoff";
import { PROVIDER_GENERATOR_SOURCE } from "../lib/referral-workspace-handoff";

type ProviderDraftHandoffStorage = Pick<Storage, "getItem" | "removeItem">;
type ProviderDraftHandoffFetch = (
  input: string,
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
  },
) => Promise<{ ok: boolean }>;

const inFlightHandoffKeys = new Set<string>();

export type ProviderDraftHandoffPersisterProps = {
  source?: string;
  draftId?: string;
  draftPayload?: string;
};

export type PersistProviderDraftLocalHandoffOptions =
  ProviderDraftHandoffPersisterProps & {
    storage: ProviderDraftHandoffStorage;
    fetcher: ProviderDraftHandoffFetch;
    refresh: () => void;
  };

export async function persistProviderDraftLocalHandoff({
  source,
  draftId,
  draftPayload,
  storage,
  fetcher,
  refresh,
}: PersistProviderDraftLocalHandoffOptions): Promise<"skipped" | "saved" | "failed"> {
  if (
    source !== PROVIDER_GENERATOR_SOURCE ||
    !draftId ||
    draftPayload !== undefined
  ) {
    return "skipped";
  }

  const storageKey = getProviderDraftLocalStorageKey(draftId);
  let rawLocalDraft: string | null;

  try {
    rawLocalDraft = storage.getItem(storageKey);
  } catch {
    return "failed";
  }

  const localDraft = parseProviderDraftLocalHandoff(draftId, rawLocalDraft);

  if (!localDraft) {
    return "skipped";
  }

  const handoffKey = JSON.stringify([source, draftId, draftPayload]);

  if (inFlightHandoffKeys.has(handoffKey)) {
    return "skipped";
  }

  inFlightHandoffKeys.add(handoffKey);

  try {
    const response = await fetcher("/api/provider-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        draftId,
        draftPayload: localDraft.draftPayload,
      }),
    });

    if (!response.ok) {
      return "failed";
    }

    storage.removeItem(storageKey);
    refresh();

    return "saved";
  } catch {
    return "failed";
  } finally {
    inFlightHandoffKeys.delete(handoffKey);
  }
}

export function ProviderDraftHandoffPersister({
  source,
  draftId,
  draftPayload,
}: ProviderDraftHandoffPersisterProps) {
  const router = useRouter();
  const persistedKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const handoffKey = [source, draftId, draftPayload].join(":");

    if (persistedKeyRef.current === handoffKey) {
      return;
    }

    persistedKeyRef.current = handoffKey;

    void persistProviderDraftLocalHandoff({
      source,
      draftId,
      draftPayload,
      storage: window.localStorage,
      fetcher: fetch,
      refresh: router.refresh,
    }).catch(() => undefined);
  }, [draftId, draftPayload, router.refresh, source]);

  return null;
}
