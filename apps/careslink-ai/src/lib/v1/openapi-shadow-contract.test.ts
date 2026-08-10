import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CARESLINK_V1_SERVICE_CODES,
} from "./shared-contracts";

const contract = readFileSync(
  join(process.cwd(), "contracts/careslink-v1-shadow.openapi.yaml"),
  "utf8",
);

describe("V1 shadow OpenAPI contract", () => {
  it("is explicitly contract-only and contains no Production server", () => {
    expect(contract).toContain(
      "x-careslink-implementation-status: contract-only-shadow",
    );
    expect(contract).toContain(`version: ${CARESLINK_V1_CONTRACT_VERSION}`);
    expect(contract).toContain(
      `x-careslink-rate-catalog-version: ${CARESLINK_V1_RATE_CATALOG_VERSION}`,
    );
    expect(contract).not.toContain("ai.careslink.com.au");
    expect(contract).not.toMatch(/^servers:/m);
  });

  it("covers documents, revisions, privacy proof and point terminal actions", () => {
    for (const path of [
      "/v1/note-types:",
      "/v1/documents:",
      "/v1/documents/{documentId}:",
      "/v1/documents/{documentId}/revisions:",
      "/v1/privacy-reviews:",
      "/v1/points/quotes:",
      "/v1/points/reservations:",
      "/v1/points/reservations/{reservationId}/commit:",
      "/v1/points/reservations/{reservationId}/release:",
    ]) {
      expect(contract).toContain(path);
    }
    expect(contract).toContain("name: Idempotency-Key");
    expect(contract).toContain("saveState:");
    expect(contract).toContain("const: SERVER_ACKNOWLEDGED");
  });

  it("keeps TypeScript and OpenAPI vocabularies aligned", () => {
    for (const locale of CARESLINK_V1_LOCALES) {
      expect(contract).toContain(locale);
    }
    for (const noteType of CARESLINK_V1_NOTE_TYPE_CODES) {
      expect(contract).toContain(noteType);
    }
    for (const serviceCode of CARESLINK_V1_SERVICE_CODES) {
      expect(contract).toContain(serviceCode);
    }
    for (const errorCode of CARESLINK_V1_ERROR_CODES) {
      expect(contract).toContain(errorCode);
    }
  });
});
