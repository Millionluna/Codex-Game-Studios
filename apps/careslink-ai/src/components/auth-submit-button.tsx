"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type AuthSubmitButtonProps = {
  children: ReactNode;
  className: string;
  pendingLabel: string;
};

export function AuthSubmitButton({
  children,
  className,
  pendingLabel,
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
