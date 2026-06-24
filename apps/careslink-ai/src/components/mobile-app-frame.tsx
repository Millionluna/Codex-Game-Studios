import type { ReactNode } from "react";

export function MobileAppFrame({
  title,
  subtitle,
  status,
  children,
  tabs,
}: {
  title: string;
  subtitle: string;
  status?: string;
  children: ReactNode;
  tabs: string[];
}) {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[28px] border border-[#bfd4cb] bg-[#16211e] p-2 shadow-xl shadow-[#9fbdb3]/30">
      <div className="min-h-[640px] overflow-hidden rounded-[22px] bg-[#f7faf8]">
        <div className="flex items-center justify-between bg-white px-4 py-3 text-xs font-semibold text-[#5d6d68]">
          <span>9:41</span>
          <span>Careslink AI</span>
          <span>5G</span>
        </div>
        <header className="border-b border-[#dce8e2] bg-white px-4 pb-4 pt-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
            App 端
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-[#17211f]">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-[#5d6d68]">{subtitle}</p>
          {status ? (
            <span className="mt-3 inline-flex rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
              {status}
            </span>
          ) : null}
        </header>
        <div className="grid gap-3 px-4 py-4">{children}</div>
        <nav className="mt-auto grid grid-cols-3 border-t border-[#dce8e2] bg-white px-2 py-2 text-center text-[11px] font-semibold text-[#66736f]">
          {tabs.map((tab, index) => (
            <span
              key={tab}
              className={`rounded-lg px-2 py-2 ${
                index === 0 ? "bg-[#edf6f3] text-[#0f766e]" : ""
              }`}
            >
              {tab}
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
