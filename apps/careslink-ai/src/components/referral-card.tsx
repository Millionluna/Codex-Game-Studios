import Link from "next/link";
import { CalendarClock, MapPin, Sparkles } from "lucide-react";
import type { Referral } from "@/lib/types";
import {
  displayArea,
  displayFrequency,
  displayFundingType,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { Card, ReferralStatusBadge } from "./ui";

export function ReferralCard({ referral }: { referral: Referral }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/referrals/${referral.id}`}
            className="text-base font-semibold text-[#17211f] hover:text-[#0f766e]"
          >
            {displayService(referral.needType)}
          </Link>
          <p className="mt-1 text-sm text-[#5d6d68]">
            {displayFundingType(referral.fundingType)} · {displayFrequency(referral.frequency)}
          </p>
        </div>
        <ReferralStatusBadge status={referral.status} />
      </div>
      <p className="mt-3 text-sm leading-6 text-[#40504b]">{referral.summary}</p>
      <div className="mt-4 grid gap-2 text-sm text-[#5d6d68]">
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-[#0f766e]" aria-hidden="true" />
          {displayArea(referral.clientArea)}
        </span>
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#19518d]" aria-hidden="true" />
          {displayList(referral.languageRequirements, displayLanguage) || "无语言要求"}
        </span>
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4 text-[#925b00]" aria-hidden="true" />
          下次跟进 {referral.followUpDate}
        </span>
      </div>
    </Card>
  );
}
