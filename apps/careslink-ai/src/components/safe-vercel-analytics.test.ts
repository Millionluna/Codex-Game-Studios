import { describe, expect, it } from "vitest";
import { sanitizeVercelAnalyticsEvent } from "./safe-vercel-analytics";

describe("sanitizeVercelAnalyticsEvent", () => {
  it("keeps only allowlisted case-note attribution", () => {
    const result = sanitizeVercelAnalyticsEvent({
      type: "pageview",
      url:
        "https://ai.careslink.com.au/template-companion/ndis-case-note" +
        "?lang=zh-Hans&source=ndis-case-note-download" +
        "&resourceSlug=ndis-case-note-template&utm_source=careslink" +
        "&utm_campaign=ndis_case_note_ai_companion_v01" +
        "&surface=core_download_success&utm_medium=post_download" +
        "&next=%2Fprivate&draftPayload=private-content&code=private-code#private",
    });

    expect(result).toEqual({
      type: "pageview",
      url:
        "https://ai.careslink.com.au/template-companion/ndis-case-note" +
        "?lang=zh-Hans&source=ndis-case-note-download" +
        "&resourceSlug=ndis-case-note-template&utm_source=careslink" +
        "&utm_campaign=ndis_case_note_ai_companion_v01" +
        "&surface=core_download_success&utm_medium=post_download",
    });
  });

  it("drops mismatched attribution pairs and private auth parameters", () => {
    const result = sanitizeVercelAnalyticsEvent({
      type: "pageview",
      url:
        "https://ai.careslink.com.au/auth/callback" +
        "?lang=en&surface=core_product_landing&utm_medium=post_download" +
        "&next=https%3A%2F%2Fevil.example&code=private-code#private-detail",
    });

    expect(result).toEqual({
      type: "pageview",
      url: "https://ai.careslink.com.au/auth/callback?lang=en",
    });
  });

  it("fails closed when an event URL cannot be parsed", () => {
    expect(
      sanitizeVercelAnalyticsEvent({
        type: "event",
        url: "not-an-absolute-url",
      }),
    ).toBeNull();
  });
});
