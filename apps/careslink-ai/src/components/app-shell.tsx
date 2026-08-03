import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Building2,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  Languages,
  Menu,
  Network,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import type {
  WorkspaceAccountRole,
  WorkspaceSessionSource,
} from "@/lib/referral-workspace-auth";

type AppShellProps = {
  children: ReactNode;
  locale?: Locale;
  languageSwitcherHref?: string;
  workspaceAccountId?: string;
  workspaceRole?: WorkspaceAccountRole;
  workspaceSessionSource?: Exclude<WorkspaceSessionSource, "none"> | "public";
};

type ShellCopy = {
  workspace: string;
  manage: string;
  administration: string;
  legacy: string;
  aiDocuments: string;
  referrals: string;
  savedDocuments: string;
  profileReadiness: string;
  planUsage: string;
  accessRequests: string;
  materialUsage: string;
  language: string;
  menu: string;
  trustBoundary: string;
  boundary: string;
  subtitle: string;
  legacyLabels: {
    demoHub: string;
    assessment: string;
    dashboard: string;
    providerPortal: string;
    providers: string;
  };
};

type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  activePaths?: string[];
};

const legacyNavItems = [
  { href: "/demo", labelKey: "demoHub", icon: Archive },
  {
    href: "/provider-assessment",
    labelKey: "assessment",
    icon: ClipboardList,
  },
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  {
    href: "/provider-portal",
    labelKey: "providerPortal",
    icon: UserRound,
  },
  { href: "/providers", labelKey: "providers", icon: Building2 },
] as const;

export function AppShell({
  children,
  locale = DEFAULT_LOCALE,
  languageSwitcherHref = "/ai-documents",
  workspaceAccountId,
  workspaceRole,
  workspaceSessionSource = "public",
}: AppShellProps) {
  const copy = getShellCopy(locale);
  const isDemoSession = workspaceSessionSource === "demo";
  const effectiveWorkspaceAccountId = isDemoSession
    ? workspaceAccountId
    : undefined;
  const showLegacyDemoNav =
    isDemoSession &&
    process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV === "true";
  const navigation = getNavigation(workspaceRole, copy);
  const currentPath = getPathname(languageSwitcherHref);
  const logoHref =
    workspaceRole === "admin"
      ? "/admin/access-requests"
      : workspaceRole === "provider"
        ? "/ai-documents"
        : "/";

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href={withOptionalWorkspaceAccount(
          withLocale(logoHref, locale),
          effectiveWorkspaceAccountId,
        )}
        className="inline-flex w-fit items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#9fe1ca]"
        aria-label="CaresLink AI"
      >
        <Image
          src="/careslink-ai-logo-reverse.svg"
          alt="CaresLink AI"
          width={216}
          height={52}
          priority
          className="h-auto w-[184px]"
        />
      </Link>

      {navigation.primary.length > 0 ? (
        <nav className="mt-9 grid gap-8" aria-label={copy.workspace}>
          <ShellNavSection
            label={copy.workspace}
            items={navigation.primary}
            locale={locale}
            workspaceAccountId={effectiveWorkspaceAccountId}
            currentPath={currentPath}
            emphasis="primary"
          />
          {navigation.secondary.length > 0 ? (
            <ShellNavSection
              label={
                workspaceRole === "admin" ? copy.administration : copy.manage
              }
              items={navigation.secondary}
              locale={locale}
              workspaceAccountId={effectiveWorkspaceAccountId}
              currentPath={currentPath}
              emphasis="secondary"
            />
          ) : null}
        </nav>
      ) : (
        <p className="mt-8 max-w-[15rem] text-sm leading-6 text-white/58">
          {copy.subtitle}
        </p>
      )}

      {showLegacyDemoNav ? (
        <details className="mt-7 border-t border-white/12 pt-5 text-sm">
          <summary className="cursor-pointer font-semibold text-white/62">
            {copy.legacy}
          </summary>
          <div className="mt-3 grid gap-1">
            {legacyNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={withLocale(item.href, locale)}
                  className="flex min-h-10 items-center gap-3 px-3 text-white/62 hover:bg-white/8 hover:text-white"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {copy.legacyLabels[item.labelKey]}
                </Link>
              );
            })}
          </div>
        </details>
      ) : null}

      <div className="mt-auto border-t border-white/12 pt-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#9fe1ca]">
          <ShieldAlert className="size-4" aria-hidden="true" />
          {copy.trustBoundary}
        </div>
        <p className="mt-2 text-xs leading-5 text-white/54">{copy.boundary}</p>
        <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/54">
          <Languages className="size-4" aria-hidden="true" />
          <span className="sr-only">{copy.language}</span>
          {SUPPORTED_LOCALES.map((supportedLocale, index) => (
            <span key={supportedLocale} className="contents">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <Link
                href={withLocale(
                  withOptionalWorkspaceAccount(
                    languageSwitcherHref,
                    effectiveWorkspaceAccountId,
                  ),
                  supportedLocale,
                )}
                aria-current={supportedLocale === locale ? "page" : undefined}
                className={
                  supportedLocale === locale
                    ? "text-white"
                    : "hover:text-white"
                }
              >
                {supportedLocale === "zh-Hans" ? "简体中文" : "English"}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="careslink-app-shell min-h-dvh min-w-0 text-foreground">
      <aside className="careslink-shell-sidebar hidden lg:block">
        {sidebar}
      </aside>

      <header className="careslink-mobile-header lg:hidden">
        <Link
          href={withOptionalWorkspaceAccount(
            withLocale(logoHref, locale),
            effectiveWorkspaceAccountId,
          )}
          aria-label="CaresLink AI"
        >
          <Image
            src="/careslink-ai-logo-reverse.svg"
            alt="CaresLink AI"
            width={166}
            height={40}
            priority
            className="h-auto w-[154px]"
          />
        </Link>
        <details className="careslink-mobile-menu">
          <summary aria-label={copy.menu}>
            <Menu className="size-5" aria-hidden="true" />
          </summary>
          <div className="careslink-mobile-menu-panel">{sidebar}</div>
        </details>
      </header>

      <main className="careslink-shell-main min-w-0">{children}</main>
    </div>
  );
}

function ShellNavSection({
  label,
  items,
  locale,
  workspaceAccountId,
  currentPath,
  emphasis,
}: {
  label: string;
  items: ShellNavItem[];
  locale: Locale;
  workspaceAccountId?: string;
  currentPath: string;
  emphasis: "primary" | "secondary";
}) {
  return (
    <section>
      <p className="px-3 text-[0.6875rem] font-bold uppercase text-white/58">
        {label}
      </p>
      <div className="mt-2 grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item, currentPath);
          return (
            <Link
              key={item.href}
              href={withOptionalWorkspaceAccount(
                withLocale(item.href, locale),
                workspaceAccountId,
              )}
              aria-current={isActive ? "page" : undefined}
              className={`careslink-shell-link ${
                isActive ? "careslink-shell-link--active" : ""
              } ${
                emphasis === "primary"
                  ? "careslink-shell-link--primary"
                  : ""
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function getNavigation(
  role: WorkspaceAccountRole | undefined,
  copy: ShellCopy,
) {
  if (role === "provider") {
    return {
      primary: [
        {
          href: "/ai-documents",
          label: copy.aiDocuments,
          icon: FileText,
          activePaths: ["/ai-documents", "/template-companion/ndis-case-note"],
        },
        {
          href: "/referral-workspace/referral-pack",
          label: copy.referrals,
          icon: Network,
          activePaths: [
            "/referral-workspace/referral-pack",
            "/referral-workspace/outreach",
          ],
        },
      ],
      secondary: [
        {
          href: "/ai-documents#saved-documents",
          label: copy.savedDocuments,
          icon: Archive,
          activePaths: [],
        },
        {
          href: "/referral-workspace/profile",
          label: copy.profileReadiness,
          icon: UserRound,
          activePaths: [
            "/referral-workspace/profile",
            "/referral-workspace/health",
          ],
        },
        {
          href: "/referral-workspace/access",
          label: copy.planUsage,
          icon: KeyRound,
          activePaths: ["/referral-workspace/access"],
        },
      ],
    } satisfies { primary: ShellNavItem[]; secondary: ShellNavItem[] };
  }

  if (role === "admin") {
    return {
      primary: [
        {
          href: "/admin/access-requests",
          label: copy.accessRequests,
          icon: ClipboardList,
          activePaths: ["/admin/access-requests"],
        },
      ],
      secondary: [
        {
          href: "/admin/material-usage",
          label: copy.materialUsage,
          icon: FileText,
          activePaths: ["/admin/material-usage"],
        },
      ],
    } satisfies { primary: ShellNavItem[]; secondary: ShellNavItem[] };
  }

  return { primary: [], secondary: [] };
}

function getShellCopy(locale: Locale): ShellCopy {
  if (locale === "zh-Hans") {
    return {
      workspace: "工作区",
      manage: "管理",
      administration: "管理后台",
      legacy: "旧版预览",
      aiDocuments: "AI 文档",
      referrals: "转介",
      savedDocuments: "已保存文档",
      profileReadiness: "资料与转介准备",
      planUsage: "访问与使用量",
      accessRequests: "访问申请",
      materialUsage: "材料使用情况",
      language: "语言",
      menu: "打开导航",
      trustBoundary: "使用边界",
      boundary:
        "仅用于一般文档和运营支持。所有草稿均需用户复核，不提供临床、法律、照护、监管或合规建议。",
      subtitle: "面向服务商的文档与转介运营工作区。",
      legacyLabels: {
        demoHub: "旧版演示中心",
        assessment: "旧版评估",
        dashboard: "仪表盘",
        providerPortal: "服务商入口",
        providers: "服务商",
      },
    };
  }

  return {
    workspace: "Workspace",
    manage: "Manage",
    administration: "Administration",
    legacy: "Legacy preview",
    aiDocuments: "AI Documents",
    referrals: "Referrals",
    savedDocuments: "Saved Documents",
    profileReadiness: "Profile & Readiness",
    planUsage: "Plan & Usage",
    accessRequests: "Access requests",
    materialUsage: "Material usage",
    language: "Language",
    menu: "Open navigation",
    trustBoundary: "Use boundary",
    boundary:
      "General documentation and operational support only. Every draft requires user review. No clinical, legal, care, regulatory or compliance advice.",
    subtitle: "A focused workspace for provider documents and referral operations.",
    legacyLabels: {
      demoHub: "Legacy demo hub",
      assessment: "Legacy assessment",
      dashboard: "Dashboard",
      providerPortal: "Provider portal",
      providers: "Providers",
    },
  };
}

function isNavItemActive(item: ShellNavItem, currentPath: string) {
  const paths = item.activePaths ?? [getPathname(item.href)];
  return paths.some(
    (path) => currentPath === path || currentPath.startsWith(`${path}/`),
  );
}

function getPathname(href: string) {
  try {
    return new URL(href, "https://careslink.local").pathname;
  } catch {
    return href.split(/[?#]/, 1)[0] || "/";
  }
}

function withOptionalWorkspaceAccount(
  href: string,
  workspaceAccountId: string | undefined,
) {
  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);

  if (!workspaceAccountId || !allowsWorkspaceAccount(pathname)) {
    return href;
  }

  const queryParams = new URLSearchParams(query);
  queryParams.set("account", workspaceAccountId);
  const hrefWithAccount = `${pathname}?${queryParams.toString()}`;
  return hash === undefined ? hrefWithAccount : `${hrefWithAccount}#${hash}`;
}

function allowsWorkspaceAccount(pathname: string) {
  return (
    pathname === "/ai-documents" ||
    pathname.startsWith("/ai-documents/") ||
    pathname === "/template-companion/ndis-case-note" ||
    pathname === "/referral-workspace" ||
    pathname.startsWith("/referral-workspace/") ||
    pathname === "/admin/access-requests" ||
    pathname === "/admin/material-usage"
  );
}
