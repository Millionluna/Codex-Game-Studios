import { CheckCircle2, QrCode } from "lucide-react";
import type { Provider, Referral, ShareCard as ShareCardType } from "@/lib/types";
import {
  displayArea,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { ReferralStatusBadge } from "./ui";

export function ShareCardPreview({
  card,
  provider,
  referral,
}: {
  card: ShareCardType;
  provider?: Provider;
  referral?: Referral;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#cfded8] bg-white shadow-sm">
      <div className="bg-[#12312d] px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8e6de]">
              Careslink AI 可信 referral 网络
            </p>
            <h2 className="mt-2 text-xl font-semibold">{card.title}</h2>
          </div>
          <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold">
            {card.channel}
          </span>
        </div>
      </div>
      <div className="p-5">
        <p className="text-sm leading-6 text-[#40504b]">{card.summary}</p>
        {provider ? (
          <div className="mt-4 grid gap-2 text-sm text-[#263834]">
            <div className="mb-1 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-[#0f766e]">
                Referral-ready profile completed
              </span>
              <span className="rounded-md bg-[#edf5ff] px-2 py-1 text-[#19518d]">
                Profile reviewed
              </span>
              {provider.acceptsNewClients ? (
                <span className="rounded-md bg-[#fff7df] px-2 py-1 text-[#925b00]">
                  Accepting new referrals
                </span>
              ) : null}
            </div>
            <p>
              <strong>服务：</strong> {displayList(provider.serviceTypes, displayService)}
            </p>
            <p>
              <strong>区域：</strong> {displayList(provider.serviceAreas, displayArea)}
            </p>
            <p>
              <strong>语言：</strong> {displayList(provider.languages, displayLanguage)}
            </p>
          </div>
        ) : null}
        {referral ? (
          <div className="mt-4 grid gap-2 text-sm text-[#263834]">
            <p>
              <strong>需求：</strong> {displayService(referral.needType)}
            </p>
            <p>
              <strong>区域：</strong> {displayArea(referral.clientArea)}
            </p>
            <ReferralStatusBadge status={referral.status} />
          </div>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-4 rounded-lg bg-[#f5fbf8] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {card.cta}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5d6d68]">
            <QrCode className="size-8 text-[#17211f]" aria-hidden="true" />
            {card.qrLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
