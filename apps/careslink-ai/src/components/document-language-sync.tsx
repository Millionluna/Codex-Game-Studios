"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function DocumentLanguageSync() {
  const pathname = usePathname();
  const locale = useSearchParams().get("lang");

  useEffect(() => {
    // The root layout persists across client navigation; its bootstrap runs only
    // on a full document load. Keep this allowlist aligned with that bootstrap.
    const normalizedPath = pathname.replace(/\/+$/, "");
    const supportedLocales = new Set(
      normalizedPath === "/ai-documents/communication-note"
        || (normalizedPath.split("/").length === 5 &&
          ["/ai-documents/communication-note/jobs/", "/ai-documents/communication-note/documents/"]
            .some(prefix => normalizedPath.startsWith(prefix)))
        ? ["en", "zh-Hans", "zh-Hant"]
        : ["en", "zh-Hans"],
    );
    document.documentElement.lang =
      locale !== null && supportedLocales.has(locale) ? locale : "en";
  }, [pathname, locale]);

  return null;
}
