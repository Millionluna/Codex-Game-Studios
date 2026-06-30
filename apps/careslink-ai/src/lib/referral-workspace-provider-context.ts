import {
  getHealthAudit,
  getReferralProfileForWorkspaceAccount,
  summarizeProfile,
  type ReferralProfile,
} from "@/lib/referral-profile-workspace";
import { mapPublicProviderDraftToProfile } from "@/lib/public-provider-profile-generator";
import {
  claimResolvedProviderDraftForOwner,
  getProviderDraftStore,
  resolveProviderDraft,
  resolveProviderDraftForOwner,
} from "@/lib/provider-draft-store";
import {
  getProviderGeneratorHandoffContext,
  withProviderGeneratorHandoff,
} from "@/lib/referral-workspace-handoff";
import type { WorkspaceAccessGate } from "@/lib/referral-workspace-auth";

type SignedInGate = Extract<WorkspaceAccessGate, { status: "signed_in" }>;

type ProviderContextSearchParams =
  | Record<string, string | string[] | undefined>
  | undefined;

export async function getProviderWorkspaceContext({
  gate,
  params,
}: {
  gate: SignedInGate;
  params: ProviderContextSearchParams;
}) {
  const accountId = gate.account.id;
  const handoff = getProviderGeneratorHandoffContext(params);
  const providerDraftStore = getProviderDraftStore();
  const rawResolvedDraft = handoff.draftId
    ? await resolveProviderDraft({
        draftId: handoff.draftId,
        draftPayload: handoff.draftPayload,
        ownerUserId: accountId,
        store: providerDraftStore,
      })
    : await resolveProviderDraftForOwner({
        ownerUserId: accountId,
        store: providerDraftStore,
      });
  const resolvedDraft = await claimResolvedProviderDraftForOwner({
    ownerUserId: accountId,
    resolution: rawResolvedDraft,
    store: providerDraftStore,
  });
  const profile = getProviderWorkspaceProfile(gate, resolvedDraft);
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);

  return {
    handoff,
    resolvedDraft,
    profile,
    summary,
    audit,
    withHandoff: (href: string) => withProviderGeneratorHandoff(href, handoff),
  };
}

function getProviderWorkspaceProfile(
  gate: SignedInGate,
  resolvedDraft:
    | Awaited<ReturnType<typeof resolveProviderDraft>>
    | Awaited<ReturnType<typeof resolveProviderDraftForOwner>>
    | undefined,
): ReferralProfile {
  if (resolvedDraft) {
    return mapPublicProviderDraftToProfile(resolvedDraft.draft, gate.account.id);
  }

  return getReferralProfileForWorkspaceAccount({
    ownerUserId: gate.account.id,
    name: gate.account.name,
  });
}
