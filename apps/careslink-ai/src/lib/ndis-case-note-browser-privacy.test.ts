import { describe, expect, it, vi } from "vitest";
import {
  buildNdisCaseNoteGenerationRequest,
  getMissingNdisCaseNoteMinimumFacts,
  reviewPastedChineseCaseNotes,
  reviewStructuredNdisCaseNoteInput,
  type NdisCaseNoteBrowserPrivacyReview,
  type NdisCaseNotePrivacyResolutionMap,
} from "./ndis-case-note-browser-privacy";

const structuredInput = {
  supportDateTime: "2026-08-03 around 10:00 am",
  supportType: "社区参与支持",
  setting: "社区场景",
  supportDelivered: "工作人员协助参与者规划购物步骤。",
  observableFacts: "参与者选择了两件物品，并在 25 分钟后提出返回。",
  actionTaken: "工作人员确认请求并协助参与者返回。",
  followUp: "下次交接时复核。",
};

const acceptanceCase =
  "7月30日下午，我陪李阿姨去 Chatswood Chase。她女儿王美玲打电话到 0412 345 678，说她最近很焦虑。李阿姨在商场里三次说想回家，然后坐在出口旁边不愿继续走。我陪她坐了10分钟，之后支持她回家。她的NDIS号码是123456789。";

function resolveEveryFinding(review: NdisCaseNoteBrowserPrivacyReview) {
  return Object.fromEntries(
    review.findings.map((finding) => [finding.id, "reviewed"]),
  ) as NdisCaseNotePrivacyResolutionMap;
}

describe("browser-only NDIS case note privacy review", () => {
  it("keeps matched ranges in browser state and removes direct identifiers from the proposal", () => {
    const raw = [
      "姓名：王小明",
      "电话：0412 345 678",
      "邮箱：person@example.com",
      "NDIS number: 123456789",
      "地址：12 George Street Sydney",
      "参与者很不配合，工作人员非常专业。",
      "学校：Northside College",
    ].join("\n");
    const review = reviewPastedChineseCaseNotes(raw);
    const categories = review.findings.map((finding) => finding.category);

    expect(categories).toEqual(
      expect.arrayContaining([
        "name",
        "phone",
        "email",
        "ndis_number",
        "address",
        "subjective_language",
        "quality_assessment",
        "indirect_identifier",
      ]),
    );
    expect(review.findings.every((finding) => finding.matchedSpans.length > 0)).toBe(
      true,
    );
    expect(
      review.findings.flatMap((finding) => finding.matchedSpans).map((span) => ({
        ...span,
        source: raw.slice(span.start, span.end),
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "0412 345 678", source: "0412 345 678" }),
      ]),
    );
    expect(review.originalTextByField.pastedNotes).toBe(raw);
    expect(review.sanitisedPreview).not.toContain("0412 345 678");
    expect(review.sanitisedPreview).not.toContain("person@example.com");
    expect(review.sanitisedPreview).not.toContain("123456789");
  });

  it("detects unlabelled Chinese relations, worker titles and mixed-language names", () => {
    const review = reviewPastedChineseCaseNotes(
      "她女儿王美玲来电，小张护工陪李阿姨到场，张先生与王美玲 Alice Chen 同行。",
    );
    const matchedNames = review.findings
      .filter((finding) => finding.category === "name")
      .flatMap((finding) => finding.matchedSpans)
      .map((span) => span.text);

    expect(matchedNames).toEqual(
      expect.arrayContaining([
        expect.stringContaining("王美玲"),
        "小张护工",
        "李阿姨",
        "张先生",
        "王美玲 Alice Chen",
      ]),
    );
    expect(review.findings.filter((finding) => finding.category === "name").every(
      (finding) => finding.severity === "blocking",
    )).toBe(true);
  });

  it("meets the full Chinese Privacy Acceptance example", () => {
    const review = reviewPastedChineseCaseNotes(acceptanceCase);
    const spansByCategory = (category: string) =>
      review.findings
        .filter((finding) => finding.category === category)
        .flatMap((finding) => finding.matchedSpans)
        .map((span) => span.text);

    expect(spansByCategory("name")).toEqual(
      expect.arrayContaining([
        "李阿姨",
        expect.stringContaining("王美玲"),
      ]),
    );
    expect(spansByCategory("phone")).toContain("0412 345 678");
    expect(spansByCategory("ndis_number")).toContain(
      "NDIS号码是123456789",
    );
    expect(spansByCategory("indirect_identifier")).toContain(
      "Chatswood Chase",
    );
    expect(spansByCategory("clinical_language").join(" ")).toContain("焦虑");
    expect(spansByCategory("context_combination")).toEqual(
      expect.arrayContaining(["7月30日下午", "Chatswood Chase", "三次"]),
    );
    expect(
      review.findings
        .filter((finding) =>
          ["name", "phone", "ndis_number", "clinical_language"].includes(
            finding.category,
          ),
        )
        .every((finding) => finding.severity === "blocking"),
    ).toBe(true);
    expect(
      review.findings
        .filter((finding) =>
          ["indirect_identifier", "context_combination"].includes(
            finding.category,
          ),
        )
        .every((finding) => finding.severity === "review"),
    ).toBe(true);

    expect(review.sanitisedPreview).not.toMatch(
      /李阿姨|王美玲|0412 345 678|123456789|Chatswood Chase|焦虑/,
    );
    expect(review.sanitisedPreview).toContain("三次说想回家");
    expect(review.sanitisedPreview).toContain("坐在出口旁边不愿继续走");
    expect(review.sanitisedPreview).toContain("陪她坐了10分钟");
    expect(review.sanitisedPreview).toContain("支持她回家");
    expect(review.proposedInput.supportDateTime).toBe("7月30日下午");
    expect(review.proposedInput.setting).toBe("社区场所");
    expect(review.proposedInput.observableFacts).not.toContain("焦虑");
  });

  it("extracts labelled Chinese notes into editable structured facts", () => {
    const review = reviewPastedChineseCaseNotes(
      [
        "支持日期与时间：2026年8月3日上午10点",
        "支持类型：社区参与支持",
        "场景：社区场景",
        "提供的支持：协助规划购物步骤",
        "可观察事实：参与者选择了两件物品",
        "采取的行动：工作人员确认请求",
        "后续：下次交接时复核",
      ].join("\n"),
    );

    expect(review.proposedInput).toMatchObject({
      supportDateTime: "2026年8月3日上午10点",
      supportType: "社区参与支持",
      setting: "社区场景",
      supportDelivered: "协助规划购物步骤",
      observableFacts: "参与者选择了两件物品",
      actionTaken: "工作人员确认请求",
      followUp: "下次交接时复核",
    });
  });

  it("requires date/time and every other minimum fact before constructing a request", () => {
    const review = reviewStructuredNdisCaseNoteInput({
      ...structuredInput,
      supportDateTime: "",
    });

    expect(getMissingNdisCaseNoteMinimumFacts(review.proposedInput)).toContain(
      "supportDateTime",
    );
    expect(
      buildNdisCaseNoteGenerationRequest(
        review.proposedInput,
        {
          reviewedNoIdentifiers: true,
          processingAuthorityConfirmed: true,
        },
        review,
        {},
      ),
    ).toBeUndefined();
  });

  it("keeps the network call at zero until findings, confirmations and minimum facts are complete", () => {
    const send = vi.fn();
    const review = reviewPastedChineseCaseNotes(acceptanceCase);
    const completeInput = {
      ...review.proposedInput,
      supportType: "社区参与支持",
    };

    const blockedRequest = buildNdisCaseNoteGenerationRequest(
      completeInput,
      {
        reviewedNoIdentifiers: false,
        processingAuthorityConfirmed: false,
      },
      review,
      {},
    );
    if (blockedRequest) send(blockedRequest);
    expect(send).not.toHaveBeenCalled();

    const unresolvedRequest = buildNdisCaseNoteGenerationRequest(
      completeInput,
      {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      },
      review,
      {},
    );
    if (unresolvedRequest) send(unresolvedRequest);
    expect(send).not.toHaveBeenCalled();

    const request = buildNdisCaseNoteGenerationRequest(
      completeInput,
      {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      },
      review,
      resolveEveryFinding(review),
    );
    if (request) send(request);

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(request)).not.toMatch(
      /李阿姨|王美玲|0412 345 678|123456789|Chatswood Chase|焦虑|pastedNotes|matchedSpans/,
    );
    expect(request?.input.observableFacts).toContain("三次说想回家");
  });

  it("reviews structured fields using the same detector", () => {
    const review = reviewStructuredNdisCaseNoteInput({
      ...structuredInput,
      observableFacts: "Ms Jane Smith was diagnosed with anxiety.",
    });

    expect(review.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(["name", "clinical_language"]),
    );
    expect(review.proposedInput.observableFacts).not.toContain("Jane Smith");
  });
});
