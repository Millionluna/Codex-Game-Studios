import type { ReactNode } from "react";
import type { ProviderStatus, ReferralStatus } from "@/lib/types";
import { displayProviderStatus, displayReferralStatus } from "@/lib/display";

const providerStatusClasses: Record<ProviderStatus, string> = {
  approved: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  pending: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  rejected: "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
};

const referralStatusClasses: Record<ReferralStatus, string> = {
  New: "border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]",
  "Pending Match": "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  Matched: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  Contacted: "border-[#b5b8ec] bg-[#f0f1ff] text-[#4546a1]",
  Accepted: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  Completed: "border-[#c8d5cf] bg-[#eef3f1] text-[#40504b]",
  "Unable to Serve": "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
  Closed: "border-[#c8d5cf] bg-[#eef3f1] text-[#40504b]",
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white transition hover:bg-[#0b5f59]"
      : "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-4 text-sm font-semibold text-[#263834] transition hover:bg-[#f0f7f4]";

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[#dce8e2] bg-white shadow-sm shadow-[#dce8e2]/40 ${className}`}
    >
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "teal",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "teal" | "blue" | "amber" | "slate";
}) {
  const tones = {
    teal: "bg-[#e6f7f2] text-[#0f766e]",
    blue: "bg-[#edf5ff] text-[#19518d]",
    amber: "bg-[#fff7df] text-[#925b00]",
    slate: "bg-[#eef3f1] text-[#40504b]",
  };

  return (
    <Card className="p-4">
      <div className={`mb-4 inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
        {label}
      </div>
      <p className="text-3xl font-semibold tracking-normal text-[#17211f]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#65736f]">{detail}</p>
    </Card>
  );
}

export function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold capitalize ${providerStatusClasses[status]}`}
    >
      {displayProviderStatus(status)}
    </span>
  );
}

export function ReferralStatusBadge({ status }: { status: ReferralStatus }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${referralStatusClasses[status]}`}
    >
      {displayReferralStatus(status)}
    </span>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-[#263834]">
      {children}
    </label>
  );
}

export function TextInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm text-[#17211f] outline-none transition placeholder:text-[#91a09b] focus:border-[#0f766e] focus:ring-2 focus:ring-[#b8e6de] ${className}`}
    />
  );
}

export function SelectInput({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 rounded-lg border border-[#cfded8] bg-white px-3 text-sm text-[#17211f] outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#b8e6de] ${className}`}
    />
  );
}

export function TextArea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-28 rounded-lg border border-[#cfded8] bg-white px-3 py-2 text-sm text-[#17211f] outline-none transition placeholder:text-[#91a09b] focus:border-[#0f766e] focus:ring-2 focus:ring-[#b8e6de] ${className}`}
    />
  );
}
