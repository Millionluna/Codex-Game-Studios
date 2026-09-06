import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CommunicationNoteGenerationJob } from "../../../../../lib/communication-note-generation-contract";

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({
      priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
      void priority;
      return React.createElement("img", props);
    },
  };
});

import { CommunicationNoteGenerationJobView } from "./communication-note-generation-job-view";

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const REVISION_ID = "55555555-5555-4555-8555-555555555555";

describe("Communication Note generation job view", () => {
  it("renders a saved acknowledgement and exact review-required draft link", () => {
    const markup = renderView(job("SUCCEEDED"), "zh-Hant");
    const expectedHref =
      `/ai-documents/communication-note/documents/${DOCUMENT_ID}` +
      `?lang=zh-Hant&amp;revisionId=${REVISION_ID}`;

    expect(markup).toContain("草稿已產生並儲存");
    expect(markup).toContain("Draft – review required");
    expect(markup).toContain("伺服器確認表示此版本已儲存");
    expect(markup).toContain(expectedHref);
    expect(markup).not.toContain("contentHash");
    expect(markup).not.toContain("idempotency");
    expect(markup).not.toContain("observable_facts");
  });

  it.each(["QUEUED", "RUNNING"] as const)(
    "shows real %s status without invented progress or terminal actions",
    (status) => {
      const markup = renderView(job(status));

      expect(markup).toContain(status === "QUEUED" ? "Generation is queued" : "Generating the Communication Note");
      expect(markup).not.toMatch(/\b\d+%|\bestimated completion\b|\bETA\b/i);
      expect(markup).not.toContain("Open saved draft");
      expect(markup).not.toContain("Start a new Communication Note");
    },
  );

  it.each(["FAILED", "CANCELLED"] as const)(
    "offers only a genuine new-note navigation for %s",
    (status) => {
      const markup = renderView(job(status));

      expect(markup).toContain("This job has no saved draft available to open");
      expect(markup).toContain("Start a new Communication Note");
      expect(markup).toContain(
        "/ai-documents/communication-note?lang=en",
      );
      expect(markup).not.toContain("Open saved draft");
      expect(markup).not.toMatch(/refund|refunded|cancel job|retry generation/i);
    },
  );

  it("renders paused polling as an actual status check control", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteGenerationJobView, {
        automaticChecksPaused: true,
        jobId: JOB_ID,
        locale: "en",
        onCheckStatus: vi.fn(),
        result: { status: "AVAILABLE", job: job("QUEUED") },
      }),
    );

    expect(markup).toContain("Automatic checks have paused");
    expect(markup).toContain(">Check status</button>");
  });

  it("keeps metadata, controls and the job reference outside the live region", () => {
    const markup = renderView(job("RUNNING"));
    const liveRegion = markup.match(
      /<div role="status" aria-live="polite" aria-atomic="true">([\s\S]*?)<\/div>/,
    )?.[1];

    expect(liveRegion).toContain("Generating the Communication Note");
    expect(liveRegion).not.toContain(JOB_ID);
    expect(liveRegion).not.toContain("Server updated");
    expect(liveRegion).not.toContain("Technical references");
    expect(markup).toContain(JOB_ID);
  });

  it("uses one unified not-found state for forbidden and missing jobs", () => {
    for (const status of ["FORBIDDEN", "NOT_FOUND"] as const) {
      const markup = renderToStaticMarkup(
        createElement(CommunicationNoteGenerationJobView, {
          jobId: JOB_ID,
          locale: "en",
          result: { status },
        }),
      );
      expect(markup).toContain("Generation job not found");
      expect(markup).toContain("missing, unavailable to this account, or no longer retained");
      expect(markup).not.toContain("Forbidden");
    }
  });

  it("keeps malformed job navigation on the clean composer route", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteGenerationJobView, {
        jobId: "",
        jobNavigationAvailable: false,
        locale: "zh-Hans",
        result: { status: "NOT_FOUND" },
        unsupportedLocale: true,
      }),
    );

    expect(markup).toContain("此工作流程不支持所请求的语言");
    expect(markup).not.toContain("/jobs/");
    expect(markup).not.toContain("zh-TW");
  });
});

function renderView(
  value: CommunicationNoteGenerationJob,
  locale: "en" | "zh-Hans" | "zh-Hant" = "en",
) {
  return renderToStaticMarkup(
    createElement(CommunicationNoteGenerationJobView, {
      jobId: JOB_ID,
      locale,
      result: { status: "AVAILABLE", job: value },
    }),
  );
}

function job(status: CommunicationNoteGenerationJob["status"]): CommunicationNoteGenerationJob {
  const base = {
    jobId: JOB_ID,
    noteType: "communication" as const,
    serviceCode: "note.communication.generate" as const,
    createdAt: "2026-09-07T01:00:00.000Z",
  };
  if (status === "QUEUED") {
    return {
      ...base,
      status,
      attemptCount: 0,
      updatedAt: base.createdAt,
    };
  }

  const startedAt = "2026-09-07T01:00:01.000Z";
  const finishedAt = "2026-09-07T01:00:02.000Z";
  const activeBase = {
    ...base,
    attemptCount: 1,
    startedAt,
    updatedAt: status === "RUNNING" ? startedAt : finishedAt,
  };
  if (status === "RUNNING") return { ...activeBase, status };
  if (status === "SUCCEEDED") {
    return {
      ...activeBase,
      status,
      finishedAt,
      result: {
        canonicalId: DOCUMENT_ID,
        revisionId: REVISION_ID,
        contentHash: "a".repeat(64),
        revisionNumber: 1,
        baseRevisionId: null,
        saveState: "SERVER_ACKNOWLEDGED",
      },
    };
  }
  if (status === "FAILED") {
    return {
      ...activeBase,
      status,
      finishedAt,
      failureCode: "GENERATION_FAILED",
    };
  }
  return { ...activeBase, status: "CANCELLED", finishedAt };
}
