import Link from "next/link";
import { Archive, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Provider } from "@/lib/types";
import { Card } from "./ui";

const displayList = (values: string[]) => values.join(", ");

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
            {displayList(provider.serviceTypes)}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#c8d5cf] bg-[#eef3f1] px-2 py-1 text-xs font-semibold text-[#40504b]">
          <Archive className="size-3" aria-hidden="true" />
          Legacy demo record
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#40504b]">
        {provider.intro}
      </p>
      <div className="mt-4 grid gap-2 text-sm text-[#5d6d68]">
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-[#0f766e]" aria-hidden="true" />
          {displayList(provider.serviceAreas)}
        </span>
        <span className="flex items-center gap-2">
          <MessageCircle className="size-4 text-[#19518d]" aria-hidden="true" />
          {displayList(provider.languages)}
        </span>
        <span className="flex items-center gap-2">
          <Phone className="size-4 text-[#925b00]" aria-hidden="true" />
          {provider.contact.phone ?? provider.contact.email}
        </span>
      </div>
    </Card>
  );
}
