import { getAccessControlStore } from "./access-control-store";
import type { AccessState } from "./referral-profile-workspace";
import {
  getWorkspaceAccessGate,
  getWorkspaceAccessGateForAccount,
  type WorkspaceAccessGate,
  type WorkspaceAccount,
} from "./referral-workspace-auth";
import {
  createWorkspaceAccountFromSupabaseUser,
  isDemoWorkspaceAuthEnabled,
} from "./referral-workspace-server-auth";
import {
  createCareslinkServerSupabaseClient,
  type CareslinkServerSupabaseClient,
} from "./supabase-server";

type SupabaseSessionClient = {
  auth: Pick<CareslinkServerSupabaseClient["auth"], "getUser">;
};

type ReferralWorkspaceSearchParams =
  | {
      readonly [key: string]: string | readonly string[] | undefined;
    }
  | Pick<URLSearchParams, "get">
  | undefined;

type WorkspaceSessionGateOptions = {
  resolveSessionAccount?: () => Promise<WorkspaceAccount | undefined>;
  resolveAccessState?: (
    account: WorkspaceAccount,
  ) => Promise<AccessState | undefined>;
  allowDemoAuth?: boolean;
};

export async function getWorkspaceAccessGateWithServerSession(
  searchParams: ReferralWorkspaceSearchParams,
  {
    resolveSessionAccount = resolveWorkspaceAccountFromServerSession,
    resolveAccessState = resolveAccessStateFromAccessControlStore,
    allowDemoAuth = isDemoWorkspaceAuthEnabled(),
  }: WorkspaceSessionGateOptions = {},
): Promise<WorkspaceAccessGate> {
  const sessionAccount = await resolveSessionAccount();

  if (sessionAccount) {
    const accessState = await resolveAccessState(sessionAccount);

    return getWorkspaceAccessGateForAccount(
      sessionAccount,
      accessState,
      "supabase",
    );
  }

  return getWorkspaceAccessGate(allowDemoAuth ? searchParams : undefined);
}

export async function resolveWorkspaceAccountFromSupabaseSession(
  supabase: SupabaseSessionClient | undefined,
) {
  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return undefined;
  }

  return createWorkspaceAccountFromSupabaseUser(data.user);
}

async function resolveWorkspaceAccountFromServerSession() {
  const supabase = await createCareslinkServerSupabaseClient();

  return resolveWorkspaceAccountFromSupabaseSession(supabase);
}

async function resolveAccessStateFromAccessControlStore(
  account: WorkspaceAccount,
) {
  if (account.role !== "provider") {
    return undefined;
  }

  return getAccessControlStore().getAccessStateForUser(account.id);
}
