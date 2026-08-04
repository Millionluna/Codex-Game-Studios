"use client";

import { Trash2, X } from "lucide-react";
import { useId, useState } from "react";

type GeneratedDraftDeleteButtonProps = {
  draftId: string;
  locale: "en" | "zh-Hans";
  onDeleted?: (draftId: string) => void;
};

type GeneratedDraftDeleteFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function deleteGeneratedDraft(
  draftId: string,
  fetcher: GeneratedDraftDeleteFetcher = globalThis.fetch,
) {
  try {
    const response = await fetcher(
      `/api/template-companion/ndis-case-note/drafts/${encodeURIComponent(draftId)}`,
      {
        method: "DELETE",
        headers: {
          "x-careslink-intent": "delete-generated-draft",
        },
      },
    );

    return response.ok;
  } catch {
    return false;
  }
}

export function GeneratedDraftDeleteButton({
  draftId,
  locale,
  onDeleted,
}: GeneratedDraftDeleteButtonProps) {
  const copy = getDeleteCopy(locale);
  const confirmationId = useId();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function confirmDeletion() {
    setIsDeleting(true);
    setHasError(false);

    const deleted = await deleteGeneratedDraft(draftId);

    if (!deleted) {
      setIsDeleting(false);
      setHasError(true);
      return;
    }

    setIsConfirming(false);
    setIsDeleting(false);
    onDeleted?.(draftId);

    if (!onDeleted) {
      window.location.reload();
    }
  }

  if (!isConfirming) {
    return (
      <button
        type="button"
        aria-expanded="false"
        aria-controls={confirmationId}
        onClick={() => {
          setHasError(false);
          setIsConfirming(true);
        }}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-danger bg-white px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger sm:min-h-8 sm:px-2.5"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {copy.delete}
      </button>
    );
  }

  return (
    <div
      id={confirmationId}
      role="group"
      aria-label={copy.confirmationLabel}
      className="min-w-56 rounded-md border border-danger bg-danger-soft p-3 text-left"
    >
      <p className="text-xs font-semibold leading-5 text-danger">
        {copy.confirmation}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isDeleting}
          onClick={confirmDeletion}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-danger bg-danger px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#843328] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-70 sm:min-h-8 sm:px-2.5"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {isDeleting ? copy.deleting : copy.deletePermanently}
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => {
            setHasError(false);
            setIsConfirming(false);
          }}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-[#f3f6f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-70 sm:min-h-8 sm:px-2.5"
        >
          <X className="size-4" aria-hidden="true" />
          {copy.cancel}
        </button>
      </div>
      {hasError ? (
        <p role="alert" className="mt-3 text-xs leading-5 text-danger">
          {copy.error}
        </p>
      ) : null}
    </div>
  );
}

function getDeleteCopy(locale: GeneratedDraftDeleteButtonProps["locale"]) {
  if (locale === "zh-Hans") {
    return {
      delete: "删除",
      confirmationLabel: "确认删除已保存草稿",
      confirmation: "永久删除这份已保存草稿？此操作无法撤销。",
      deletePermanently: "永久删除",
      deleting: "正在删除",
      cancel: "取消",
      error: "暂时无法删除这份草稿。草稿仍保留在你的账号中，请重试。",
    };
  }

  return {
    delete: "Delete",
    confirmationLabel: "Confirm saved draft deletion",
    confirmation: "Permanently delete this saved draft? This cannot be undone.",
    deletePermanently: "Delete permanently",
    deleting: "Deleting",
    cancel: "Cancel",
    error: "This draft could not be deleted. It remains in your account. Try again.",
  };
}
