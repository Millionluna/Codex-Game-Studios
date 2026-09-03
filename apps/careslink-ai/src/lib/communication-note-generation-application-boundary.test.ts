import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Communication Note product integration boundary", () => {
  it("source-wires the server-owned UI gate while both activation latches stay closed", () => {
    const page = source(
      "src/app/ai-documents/communication-note/page.tsx",
    );
    const feature = source("src/lib/communication-note-generation-feature.ts");

    expect(page).toContain("isCommunicationNoteGenerationUiEnabled");
    expect(page).toContain(
      "generationAvailable={isCommunicationNoteGenerationUiEnabled()}",
    );
    expect(feature).toContain(
      "CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY = false as const",
    );
    expect(feature).toContain(
      "CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_READY = false as const",
    );
    expect(feature).toContain(
      'CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED === "true"',
    );
    expect(feature).toContain("isCommunicationNoteGenerationApiEnabled(env)");
  });

  it("keeps reviewed request bytes and their idempotency key stable in the browser-only client", () => {
    const composer = source(
      "src/app/ai-documents/communication-note/communication-note-composer.tsx",
    );
    const client = source("src/lib/communication-note-generation-client.ts");

    expect(composer).toContain("submitCommunicationNoteGeneration");
    expect(composer).toContain("body: JSON.stringify(readySubmission)");
    expect(composer).toContain("idempotencyKey: window.crypto.randomUUID()");
    expect(composer).toContain("requestRef.current = request");
    expect(composer).not.toMatch(/from ["'][^"']*\.server["']/);
    expect(composer).not.toMatch(/from ["'][^"']*\/v1\//);
    expect(client).toContain(
      "fetcher(COMMUNICATION_NOTE_GENERATION_API_PATH",
    );
    expect(client).toContain('"Idempotency-Key": idempotencyKey');
    expect(client).toContain("body,");
    expect(client).not.toMatch(
      /localStorage|sessionStorage|indexedDB|sendBeacon|document\.cookie|console\./,
    );
  });

  it("ends the request thread at strict Points admission and a durable QUEUED handoff", () => {
    const route = source(
      "src/lib/communication-note-generation-route.server.ts",
    );
    const submitter = source(
      "src/lib/communication-note-generation-submitter-composition.server.ts",
    );

    expect(route).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION",
    );
    expect(route).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION",
    );
    expect(submitter).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION =\n  undefined",
    );
    expect(submitter).toContain(
      "CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_READY =\n  false",
    );

    const confirmAt = submitter.indexOf(
      "await options.privacyReviewIssuer.confirm",
    );
    const stageAt = submitter.indexOf(
      "await options.payloadStager.stageCanonicalFacts",
    );
    const admitAt = submitter.indexOf("admitted = await repository.enqueue");
    const validateAt = submitter.indexOf("const projection = toAdmission");
    const cleanupAt = submitter.indexOf("if (!projection.payloadAccepted)");
    expect(confirmAt).toBeGreaterThan(-1);
    expect(stageAt).toBeGreaterThan(confirmAt);
    expect(admitAt).toBeGreaterThan(stageAt);
    expect(validateAt).toBeGreaterThan(admitAt);
    expect(cleanupAt).toBeGreaterThan(validateAt);

    expect(submitter).toContain('job.status !== "QUEUED"');
    expect(submitter).not.toMatch(
      /openai-communication-note-provider|provider\.generate|runNext|registered-worker|setInterval|setTimeout|cron/i,
    );
    expect(route).not.toMatch(
      /openai-communication-note-provider|provider\.generate|runNext|registered-worker/i,
    );
  });
});
