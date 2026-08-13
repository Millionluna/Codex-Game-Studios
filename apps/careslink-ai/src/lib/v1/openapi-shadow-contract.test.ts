import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_CATALOG,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CARESLINK_V1_SERVICE_CODES,
} from "./shared-contracts";
import {
  CARESLINK_V1_AUTH_BOUNDARIES,
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
  CARESLINK_V1_PRODUCT_API_METHODS,
  CARESLINK_V1_PRODUCT_API_PATHS,
  CARESLINK_V1_SYNC_BOUNDARIES,
} from "./transport-contract";

const contract = readFileSync(
  join(process.cwd(), "contracts/careslink-v1-shadow.openapi.yaml"),
  "utf8",
);

describe("V1 shadow OpenAPI contract", () => {
  it("is explicitly local-durable, default-disabled and has no Production server", () => {
    expect(contract).toContain(
      "x-careslink-implementation-status: durable-adapter-default-disabled-shadow",
    );
    expect(contract).toContain("x-careslink-feature-default: disabled");
    expect(contract).toContain("x-careslink-durable-adapter-default: disabled");
    expect(contract).toContain(
      "x-careslink-runtime-target: verified-non-production-preview-only",
    );
    expect(contract).toContain("x-careslink-database-migration: unapplied");
    expect(contract).toContain("x-careslink-write-rpc-grants: withheld");
    expect(contract).toContain(
      "x-careslink-document-write-rpc-grants: withheld",
    );
    expect(contract).toContain(
      "x-careslink-privacy-review-issuance-rpc-grant: service-only",
    );
    expect(contract).toContain(
      "x-careslink-privacy-review-preview-ttl-seconds: 1800",
    );
    expect(contract.match(/x-careslink-write-rpc-grant: withheld/g)).toHaveLength(
      4,
    );
    expect(contract).toContain("x-careslink-cross-device-e2e: not-run");
    expect(contract).toContain(
      "x-careslink-cookie-mutation-origin: same-origin-https-required",
    );
    expect(contract).toContain(
      "x-careslink-mutation-content-type: application/json",
    );
    expect(contract).toContain(
      "x-careslink-mobile-auth-transport: bearer-authorization-header-only",
    );
    expect(contract).toContain(`version: ${CARESLINK_V1_CONTRACT_VERSION}`);
    expect(contract).toContain(
      `x-careslink-minimum-client-version: ${CARESLINK_V1_MINIMUM_CLIENT_VERSION}`,
    );
    expect(contract).toContain(
      `x-careslink-rate-catalog-version: ${CARESLINK_V1_RATE_CATALOG_VERSION}`,
    );
    expect(contract).not.toContain("ai.careslink.com.au");
    expect(contract).not.toMatch(/^servers:/m);
  });

  it("covers Product API sync, existing shadow services and auth boundaries", () => {
    for (const path of [
      ...Object.values(CARESLINK_V1_PRODUCT_API_PATHS),
      ...Object.values(CARESLINK_V1_AUTH_BOUNDARIES).map(
        (boundary) => boundary.path,
      ),
      "/v1/note-types",
      "/v1/privacy-reviews",
      "/v1/points/quotes",
      "/v1/points/reservations",
      "/v1/points/reservations/{reservationId}/commit",
      "/v1/points/reservations/{reservationId}/release",
    ]) {
      expect(contract).toContain(`${path}:`);
    }
    expect(contract).toContain(
      `name: ${CARESLINK_V1_HEADER_NAMES.idempotencyKey}`,
    );
    expect(contract).toContain("saveState:");
    expect(contract).toContain("const: SERVER_ACKNOWLEDGED");
  });

  it("defines Bearer/cookie parity and standard version headers", () => {
    expect(contract).toContain("BearerAuth:");
    expect(contract).toContain("CookieSession:");
    expect(contract).toContain("- BearerAuth: []");
    expect(contract).toContain("- CookieSession: []");
    for (const headerName of [
      CARESLINK_V1_HEADER_NAMES.contractVersion,
      CARESLINK_V1_HEADER_NAMES.clientVersion,
      CARESLINK_V1_HEADER_NAMES.minimumClientVersion,
      CARESLINK_V1_HEADER_NAMES.correlationId,
    ]) {
      expect(contract).toContain(headerName);
    }
  });

  it("keeps native session, device and revoke boundaries Bearer-only", () => {
    expect(getPathBlock("/v1/auth/native/callback")).toContain("security: []");
    for (const path of [
      "/v1/auth/sessions",
      "/v1/auth/devices",
      "/v1/auth/sessions/{sessionId}/revoke",
    ]) {
      const block = getPathBlock(path);
      expect(block).toContain("security:\n        - BearerAuth: []");
      expect(block).not.toContain("CookieSession");
    }
  });

  it("keeps identity and tokens out of Product API request schemas", () => {
    for (const schemaName of [
      "CreateDocumentRequest",
      "SaveCheckpointRequest",
      "TombstoneDocumentRequest",
      "PrivacyProofRequest",
    ]) {
      const schema = getSchemaBlock(schemaName);
      expect(schema).not.toMatch(/owner(?:Id|UserId)/);
      expect(schema).not.toContain("accessToken");
      expect(schema).not.toContain("authorization:");
    }
    expect(getSchemaBlock("Document")).not.toMatch(/owner(?:Id|UserId)/);
    expect(getSchemaBlock("DocumentRevision")).not.toMatch(
      /owner(?:Id|UserId)/,
    );
  });

  it("makes create atomic with its first revision and freezes sync tombstones", () => {
    expect(getSchemaBlock("CreateDocumentRequest")).toContain("contentHash:");
    expect(getSchemaBlock("CreateDocumentRequest")).toMatch(
      /required:[\s\S]*- privacyReviewId/,
    );
    expect(getSchemaBlock("CreateDocumentResponse")).toContain("revision:");
    expect(getSchemaBlock("CreateDocumentResponse")).toContain("saveState:");
    expect(getSchemaBlock("SyncChange")).toContain("discriminator:");
    expect(getSchemaBlock("DocumentUpsertedChange")).toContain(
      "const: DOCUMENT_UPSERTED",
    );
    expect(getSchemaBlock("DocumentUpsertedChange")).toMatch(
      /required:[\s\S]*- noteType/,
    );
    expect(getSchemaBlock("DocumentUpsertedChange")).toContain(
      '$ref: "#/components/schemas/NoteTypeCode"',
    );
    expect(getSchemaBlock("DocumentUpsertedChange")).toContain(
      "deletedAt: { const: null }",
    );
    expect(getSchemaBlock("DocumentTombstonedChange")).toContain(
      "const: DOCUMENT_TOMBSTONED",
    );
    expect(getSchemaBlock("DocumentTombstonedChange")).toMatch(
      /required:[\s\S]*- noteType/,
    );
    expect(getSchemaBlock("DocumentTombstonedChange")).toContain(
      '$ref: "#/components/schemas/NoteTypeCode"',
    );
    expect(getSchemaBlock("DocumentTombstonedChange")).toContain(
      "deletedAt: { type: string, format: date-time }",
    );
    expect(getSchemaBlock("PullChangesResponse")).toContain("nextCursor:");
    expect(getSchemaBlock("PullChangesResponse")).toContain("hasMore:");
    expect(contract).not.toContain("PullChangesRequest:");
    const noteContent = getSchemaBlock("NoteContent");
    expect(noteContent).toContain("additionalProperties: false");
    expect(noteContent.match(/maxItems: 256/g)).toHaveLength(3);
    expect(noteContent).toContain("maxLength: 100000");
    expect(noteContent).toContain("maxLength: 10000");
  });

  it("freezes five closed cleaned-facts schemas and their Note-type mapping", () => {
    const schemaNames = {
      communication: "CommunicationCleanedFacts",
      handover: "HandoverCleanedFacts",
      progress: "ProgressCleanedFacts",
      ndis: "NdisCleanedFacts",
      incident_factual: "IncidentFactualCleanedFacts",
    } as const;
    const kindSchemas = {
      date_time: "CleanedFactDateTime",
      short_text: "CleanedFactShortText",
      long_text: "CleanedFactLongText",
      string_list: "CleanedFactStringList",
    } as const;

    for (const definition of CARESLINK_V1_NOTE_CATALOG) {
      const schemaName = schemaNames[definition.code];
      const block = getSchemaBlock(schemaName);
      const requiredBlock = block.slice(0, block.indexOf("      properties:"));
      expect(block).toContain("additionalProperties: false");
      for (const field of definition.fields) {
        expect(block).toContain(`        ${field.code}:\n`);
        expect(block).toContain(
          `#/components/schemas/${kindSchemas[field.kind]}`,
        );
        if (field.required) {
          expect(requiredBlock).toContain(`        - ${field.code}\n`);
        } else {
          expect(requiredBlock).not.toContain(`        - ${field.code}\n`);
        }
      }
    }

    const cleanedFacts = getSchemaBlock("CleanedFacts");
    for (const [noteType, schemaName] of Object.entries(schemaNames)) {
      expect(cleanedFacts).toContain(
        `${noteType}: "#/components/schemas/${schemaName}"`,
      );
      expect(cleanedFacts).toContain(
        `- $ref: "#/components/schemas/${schemaName}"`,
      );
    }
    expect(getSchemaBlock("NoteContent")).toContain(
      '$ref: "#/components/schemas/CleanedFacts"',
    );
    expect(getSchemaBlock("PrivacyProofRequest")).toContain(
      '$ref: "#/components/schemas/CleanedFacts"',
    );
    expect(getSchemaBlock("PrivacyProofRequest")).toContain(
      "Every fieldCode must resolve to an existing string leaf",
    );
    expect(getSchemaBlock("PrivacyProofRequest")).toContain(
      "existing zero-based item index",
    );
    expect(getSchemaBlock("CleanedFactStringList")).toContain("minItems: 1");
    expect(getSchemaBlock("CleanedFactShortText")).toContain(
      'pattern: "^\\\\S(?:[\\\\s\\\\S]*\\\\S)?$"',
    );
  });

  it("freezes canonical GET sync pull and the unserved PRD push boundary", () => {
    expect(CARESLINK_V1_PRODUCT_API_METHODS.pullChanges).toBe("GET");
    expect(CARESLINK_V1_PRODUCT_API_PATHS.syncPull).toBe("/v1/sync/pull");
    const pull = getPathBlock("/v1/sync/pull");
    expect(pull).toMatch(/^  \/v1\/sync\/pull:\n    get:/);
    expect(pull).not.toContain("requestBody:");
    expect(pull).toContain("#/components/parameters/Cursor");
    expect(pull).toContain('"400":');
    expect(pull).toContain('"403":');

    expect(CARESLINK_V1_SYNC_BOUNDARIES.push.served).toBe(false);
    const push = getPathBlock("/v1/sync/push");
    expect(push).toMatch(/^  \/v1\/sync\/push:\n    post:/);
    expect(push).toContain("x-careslink-availability: not-implemented");
    expect(push).toContain("x-careslink-served: false");
    expect(push).not.toContain("requestBody:");
    expect(push).toContain('"501":');

    expect(getPathBlock("/v1/me")).toContain('"400":');
    expect(getOperationBlock("/v1/documents", "get")).toContain('"400":');
    const createDocument = getOperationBlock("/v1/documents", "post");
    expect(createDocument).toContain('"400":');
    expect(createDocument).toContain('"404":');
    expect(getPathBlock("/v1/documents/{documentId}")).toContain('"400":');
    expect(contract).toContain("PRIVACY_REVIEW_REQUIRED");
    expect(contract).toContain("PRIVACY_REVIEW_STALE");
  });

  it("uses the PRD PATCH document route as the only revision-append transport", () => {
    expect(CARESLINK_V1_PRODUCT_API_METHODS.appendDocumentRevision).toBe(
      "PATCH",
    );
    expect(CARESLINK_V1_PRODUCT_API_PATHS.document).toBe(
      "/v1/documents/{documentId}",
    );
    expect(contract).not.toContain("/v1/documents/{documentId}/revisions:");

    const appendRevision = getOperationBlock(
      "/v1/documents/{documentId}",
      "patch",
    );
    expect(appendRevision).toContain("operationId: appendDocumentRevision");
    expect(appendRevision).toContain("requestBody:");
    expect(appendRevision).toMatch(/required:[\s\S]*- privacyReviewId/);
    expect(appendRevision).toContain('"201":');
    expect(appendRevision).toContain('"409":');
    expect(appendRevision).toContain('"422":');
  });

  it("serves only atomic privacy confirmation behind Preview gates and service-only issuance", () => {
    expect(CARESLINK_V1_PRODUCT_API_METHODS.confirmPrivacyReview).toBe("POST");
    expect(CARESLINK_V1_PRODUCT_API_PATHS.privacyReviews).toBe(
      "/v1/privacy-reviews",
    );
    const privacyReview = getPathBlock("/v1/privacy-reviews");
    expect(privacyReview).toMatch(/^  \/v1\/privacy-reviews:\n    post:/);
    expect(privacyReview).not.toMatch(/^    (?:delete|get|patch|put):/m);
    expect(privacyReview).toContain(
      "x-careslink-availability: feature-disabled-shadow",
    );
    expect(privacyReview).toContain(
      "x-careslink-write-rpc-grant: service-only",
    );
    expect(privacyReview).not.toContain("x-careslink-served: false");
    expect(privacyReview).toContain("#/components/parameters/ContractVersion");
    expect(privacyReview).toContain("#/components/parameters/ClientVersion");
    expect(privacyReview).toContain("#/components/parameters/CorrelationId");
    expect(privacyReview).toContain("#/components/parameters/IdempotencyKey");
    for (const status of ["201", "400", "401", "403", "409", "422", "426", "503"]) {
      expect(privacyReview).toContain(`"${status}":`);
    }

    const request = getSchemaBlock("PrivacyProofRequest");
    expect(request).toContain("cleanedFacts:");
    expect(request).not.toContain("cleanedFactsHash:");
    expect(request).toContain("deIdentificationConfirmed: { const: true }");
    expect(request).toContain("authorityToProcessConfirmed: { const: true }");
    expect(request).toContain("maxItems: 256");
    const proof = getSchemaBlock("PrivacyProof");
    expect(proof).toContain("cleanedFactsHash:");
    expect(proof).not.toContain("cleanedFacts:");
    expect(proof).toContain("scannerPolicyVersion: { const: 2026-08-11.preview.1 }");
    expect(proof).toContain("reviewRevision: { const: 1 }");
    expect(proof).toContain("status: { const: CONFIRMED }");
    expect(getSchemaBlock("PrivacyFindingLocator")).not.toMatch(
      /^\s+(?:excerpt|fieldValue|rawValue):/m,
    );
    expect(getSchemaBlock("ErrorEnvelope")).toContain("privacyFindings:");
  });

  it("documents AUTH_REQUIRED and SESSION_REVOKED for every served 401", () => {
    expect(
      contract.match(
        /#\/components\/responses\/AuthenticationFailure/g,
      ),
    ).toHaveLength(9);
    expect(contract).not.toContain("#/components/responses/AuthRequired");
    expect(contract).not.toMatch(/^    SessionRevoked:/m);
    const authenticationFailure = getComponentBlock("AuthenticationFailure");
    expect(authenticationFailure).toContain("AUTH_REQUIRED");
    expect(authenticationFailure).toContain("SESSION_REVOKED");
    expect(authenticationFailure).toContain(
      "enum: [AUTH_REQUIRED, SESSION_REVOKED]",
    );
  });

  it("documents disabled and unavailable capabilities without claiming service", () => {
    expect(contract.match(/x-careslink-availability: not-implemented/g)).toHaveLength(
      5,
    );
    expect(
      contract.match(/x-careslink-availability: contract-only-shadow/g),
    ).toHaveLength(5);
    expect(contract.match(/x-careslink-served: false/g)).toHaveLength(10);
    expect(contract).toContain("PRODUCT_API_DISABLED");
    expect(contract).toContain("NOT_IMPLEMENTED");
    expect(contract).toContain("SESSION_REVOKED");
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

function getSchemaBlock(schemaName: string) {
  return getComponentBlock(schemaName);
}

function getComponentBlock(componentName: string) {
  const marker = `    ${componentName}:\n`;
  const start = contract.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const afterStart = start + marker.length;
  const remainder = contract.slice(afterStart);
  const nextSchema = remainder.search(/^    [A-Za-z][A-Za-z0-9]+:\n/m);
  return nextSchema === -1
    ? contract.slice(start)
    : contract.slice(start, afterStart + nextSchema);
}

function getOperationBlock(path: string, method: string) {
  const pathBlock = getPathBlock(path);
  const marker = `    ${method}:\n`;
  const start = pathBlock.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const afterStart = start + marker.length;
  const remainder = pathBlock.slice(afterStart);
  const nextOperation = remainder.search(/^    (?:delete|get|patch|post|put):\n/m);
  return nextOperation === -1
    ? pathBlock.slice(start)
    : pathBlock.slice(start, afterStart + nextOperation);
}

function getPathBlock(path: string) {
  const marker = `  ${path}:\n`;
  const start = contract.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const afterStart = start + marker.length;
  const remainder = contract.slice(afterStart);
  const nextPath = remainder.search(/^  \/v1\//m);
  return nextPath === -1
    ? contract.slice(start)
    : contract.slice(start, afterStart + nextPath);
}
