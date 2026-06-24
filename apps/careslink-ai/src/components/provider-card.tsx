import Link from "next/link";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import type { Provider } from "@/lib/types";
import { displayArea, displayLanguage, displayList, displayService } from "@/lib/display";
import { Card, ProviderStatusBadge } from "./ui";

export function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/providers/${provider.id}`}
            className="text-base font-semibold text-[#17211f] hover:text-[#0f766e]"
          >
            {provider.name}
          </Link>
          <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
            {displayList(provider.serviceTypes, displayService)}
          </p>
        </div>
        <ProviderStatusBadge status={provider.status} />
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#40504b]">
        {provider.intro}
      </p>
      <div className="mt-4 grid gap-2 text-sm text-[#5d6d68]">
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-[#0f766e]" aria-hidden="true" />
          {displayList(provider.serviceAreas, displayArea)}
        </span>
        <span className="flex items-center gap-2">
          <MessageCircle className="size-4 text-[#19518d]" aria-hidden="true" />
          {displayList(provider.languages, displayLanguage)}
        </span>
        <span className="flex items-center gap-2">
          <Phone className="size-4 text-[#925b00]" aria-hidden="true" />
          {provider.contact.phone ?? provider.contact.email}
        </span>
      </div>
    </Card>
  );
}
