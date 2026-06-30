import type { HTMLAttributes, ReactNode } from "react";

type WorkspaceStatusTone = "neutral" | "success" | "warning" | "locked";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function WorkspaceGrid({
  main,
  rightRail,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  main: ReactNode;
  rightRail: ReactNode;
}) {
  return (
    <div
      {...props}
      className={joinClasses(
        "workspace-grid grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start",
        className,
      )}
    >
      {main}
      {rightRail}
    </div>
  );
}

export function WorkspaceMainPanel({
  as: Component = "main",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "main" | "div";
  children: ReactNode;
}) {
  return (
    <Component
      {...props}
      className={joinClasses("workspace-main-panel grid min-w-0 gap-4", className)}
    >
      {children}
    </Component>
  );
}

export function WorkspaceRightRail({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return (
    <aside
      {...props}
      className={joinClasses(
        "workspace-right-rail grid min-w-0 gap-4 lg:sticky lg:top-6",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function WorkspaceSection({
  title,
  description,
  action,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      {...props}
      className={joinClasses(
        "workspace-section rounded-lg border border-[#ded6c8] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-normal text-[#17211f]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-[#65736f]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="min-w-0 max-w-full">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function WorkspaceStatusPill({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: WorkspaceStatusTone;
  children: ReactNode;
}) {
  return (
    <span
      {...props}
      className={joinClasses(
        `workspace-status-pill workspace-status-pill--${tone}`,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function WorkspaceSignalRow({
  title,
  detail,
  status,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: string;
  detail: string;
  status: ReactNode;
  tone?: WorkspaceStatusTone;
}) {
  return (
    <div
      {...props}
      className={joinClasses(
        "workspace-signal-row flex flex-wrap items-start justify-between gap-3 border-t border-[#e3ddd2] py-3 first:border-t-0 first:pt-0 last:pb-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-[#17211f]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[#65736f]">{detail}</p>
      </div>
      <div className="min-w-0 max-w-full">
        <WorkspaceStatusPill tone={tone}>{status}</WorkspaceStatusPill>
      </div>
    </div>
  );
}
