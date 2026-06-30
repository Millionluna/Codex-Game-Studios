import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 grid gap-4 border-b border-[#ded6c8] pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold text-[#0f766e]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="section-title mt-2 max-w-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
