import {
  canUseGuidedMaterials,
  getAccessState,
  type AccessState,
} from "./referral-profile-workspace";

export const ACCOUNT_QUERY_PARAM = "account";

type ReferralWorkspaceSearchParams =
  | {
      readonly [key: string]: string | readonly string[] | undefined;
    }
  | Pick<URLSearchParams, "get">
  | undefined;

export type WorkspaceAccountRole = "provider" | "admin";

export type WorkspaceAccount = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceAccountRole;
};

export type WorkspaceSessionSource = "none" | "demo" | "supabase";

export type WorkspaceAccessGate =
  | {
      status: "signed_out";
      source: "none";
      mode: "login_required";
      account?: undefined;
      canViewWorkspace: false;
      canViewAdmin: false;
      canUseGuidedMaterials: false;
      accessState: ReturnType<typeof getAccessState>;
    }
  | {
      status: "signed_in";
      source: Exclude<WorkspaceSessionSource, "none">;
      mode:
        | "free_preview"
        | "access_waitlist"
        | "access_active"
        | "admin_review";
      account: WorkspaceAccount;
      canViewWorkspace: true;
      canViewAdmin: boolean;
      canUseGuidedMaterials: boolean;
      accessState: ReturnType<typeof getAccessState>;
    };

const workspaceAccounts: WorkspaceAccount[] = [
  {
    id: "user-free",
    name: "Alex Lee",
    email: "alex.free@example.com",
    role: "provider",
  },
  {
    id: "user-waitlist",
    name: "CarePath Advisory",
    email: "waitlist@example.com",
    role: "provider",
  },
  {
    id: "user-approved",
    name: "Harbour Community Support",
    email: "approved@example.com",
    role: "provider",
  },
  {
    id: "user-admin",
    name: "CaresLink Admin",
    email: "admin@example.com",
    role: "admin",
  },
];

export function getWorkspaceAccountFromSearchParams(
  searchParams: ReferralWorkspaceSearchParams,
): WorkspaceAccount | undefined {
  const accountId = getSearchParamValue(searchParams, ACCOUNT_QUERY_PARAM);

  return workspaceAccounts.find((account) => account.id === accountId);
}

export function getWorkspaceAccountOptions(): WorkspaceAccount[] {
  return workspaceAccounts.map((account) => ({ ...account }));
}

export function getWorkspaceAccessGate(
  searchParams: ReferralWorkspaceSearchParams,
): WorkspaceAccessGate {
  const account = getWorkspaceAccountFromSearchParams(searchParams);

  if (!account) {
    return {
      status: "signed_out",
      source: "none",
      mode: "login_required",
      canViewWorkspace: false,
      canViewAdmin: false,
      canUseGuidedMaterials: false,
      accessState: getAccessState("user-free"),
    };
  }

  return getWorkspaceAccessGateForAccount(account);
}

export function getWorkspaceAccessGateForAccount(
  account: WorkspaceAccount,
  accessStateOverride?: AccessState,
  source: Exclude<WorkspaceSessionSource, "none"> = "demo",
): WorkspaceAccessGate {
  const signedOutAccessState = getAccessState("user-free");

  if (account.role === "admin") {
    return {
      status: "signed_in",
      source,
      mode: "admin_review",
      account,
      canViewWorkspace: true,
      canViewAdmin: true,
      canUseGuidedMaterials: false,
      accessState: signedOutAccessState,
    };
  }

  const accessState = accessStateOverride ?? getAccessState(account.id);
  const canUse = canUseGuidedMaterials(accessState);

  return {
    status: "signed_in",
    source,
    mode: canUse
      ? "access_active"
      : accessState.status === "waitlist"
        ? "access_waitlist"
        : "free_preview",
    account,
    canViewWorkspace: true,
    canViewAdmin: false,
    canUseGuidedMaterials: canUse,
    accessState,
  };
}

export function withWorkspaceAccount(
  href: string,
  accountId: string | undefined,
): string {
  if (!accountId) {
    return href;
  }

  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const queryParams = new URLSearchParams(query);

  queryParams.set(ACCOUNT_QUERY_PARAM, accountId);

  const hrefWithAccount = `${pathname}?${queryParams.toString()}`;

  return hash === undefined ? hrefWithAccount : `${hrefWithAccount}#${hash}`;
}

function getSearchParamValue(
  searchParams: ReferralWorkspaceSearchParams,
  key: string,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  if ("get" in searchParams && typeof searchParams.get === "function") {
    return searchParams.get(key) ?? undefined;
  }

  const indexedParams = searchParams as {
    readonly [key: string]: string | readonly string[] | undefined;
  };
  const value = indexedParams[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}
