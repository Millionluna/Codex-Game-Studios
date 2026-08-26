import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortalReferralProviderFollowUpCoordinator } from "@/components/portal-referral-provider-follow-up-controls";
import { canonicalPortalReferralUuid } from "@/lib/portal-referral-id";
import { isPortalReferralFollowUpRuntimeEnabled } from "@/lib/portal-referral-runtime.server";

type ProviderReferralFollowUpPageProps = Readonly<{
  params: Promise<Readonly<{ referralId: string }>>;
}>;

export default async function ProviderReferralFollowUpPage({
  params,
}: ProviderReferralFollowUpPageProps) {
  if (!isPortalReferralFollowUpRuntimeEnabled()) notFound();

  const { referralId: routeReferralId } = await params;
  const referralId = canonicalPortalReferralUuid(routeReferralId);
  if (!referralId || referralId !== routeReferralId) notFound();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Provider referral follow-up"
        title="Authorized referral detail / 已授权 referral 详情"
        description="Private participant and contact details are loaded only for the signed-in provider assigned to this accepted referral."
      />
      <PortalReferralProviderFollowUpCoordinator
        enabled
        referralId={referralId}
      />
    </AppShell>
  );
}
