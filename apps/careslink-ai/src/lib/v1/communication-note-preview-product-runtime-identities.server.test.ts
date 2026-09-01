import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const captured = vi.hoisted(() => {
  class FakePgClient {
    static constructed = 0;

    constructor() {
      FakePgClient.constructed += 1;
    }

    async connect() {}

    async query() {
      return { rows: [] };
    }

    async end() {}

    on() {
      return this;
    }
  }

  const targetResolver = Object.freeze({
    status: "OPAQUE_TEST_ONLY_TARGET_RESOLVER" as const,
    resolve: vi.fn(),
  });
  const runtimeBundle = Object.freeze({
    status: "OPAQUE_TEST_ONLY_PRODUCT_RUNTIME_BUNDLE" as const,
    databaseTarget: Object.freeze({ status: "OPAQUE_TEST_TARGET" }),
    runtimePort: Object.freeze({ status: "OPAQUE_TEST_RUNTIME_PORT" }),
  });

  return {
    FakePgClient,
    targetResolver,
    runtimeBundle,
    targetFactory: vi.fn(() => targetResolver),
    compositionFactory: vi.fn(async () => runtimeBundle),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Client: captured.FakePgClient }));
vi.mock(
  "./communication-note-preview-approved-runtime-target.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-approved-runtime-target.server")
    >();
    return {
      ...original,
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver:
        captured.targetFactory,
    };
  },
);
vi.mock(
  "./communication-note-preview-product-runtime-composition.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-product-runtime-composition.server")
    >();
    return {
      ...original,
      createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition:
        captured.compositionFactory,
    };
  },
);

import * as productRuntimeIdentities from "./communication-note-preview-product-runtime-identities.server";

const NOW = "2026-09-01T12:00:00.000Z";
const TARGET_PROJECT_REF = "abcdefghijklmnopqrst";
const SOURCE_REVISION_SHA256 = "1".repeat(64);
const TLS_ROOT_CERTIFICATE_SHA256 = "2".repeat(64);
const WORKLOAD_IDENTITY_HMAC_SHA256 = "3".repeat(64);
const DEPLOYMENT_HMAC_SHA256 = "4".repeat(64);
const DEPLOYMENT_IDENTITY_EVIDENCE_SHA256 = "5".repeat(64);
const CONTROL_PLANE_EVIDENCE_SHA256 = "6".repeat(64);
const CONTROL_PLANE_PRINCIPAL_SHA256 = "7".repeat(64);
const CONTROL_PLANE_CREDENTIAL_SHA256 = "8".repeat(64);
const OAUTH_APP_REFERENCE_SHA256 = "a".repeat(64);
const OAUTH_GRANT_REFERENCE_SHA256 = "b".repeat(64);
const SECRET_SENTINEL = "M1S_SECRET_SENTINEL_MUST_NEVER_ESCAPE";

const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note preview product runtime identities are unavailable",
});

const IMPORT_TIME_COUNTS = Object.freeze({
  targetFactories: captured.targetFactory.mock.calls.length,
  compositions: captured.compositionFactory.mock.calls.length,
  pgConstructed: captured.FakePgClient.constructed,
});

describe("Communication Note M1s product runtime identities", () => {
  beforeEach(() => {
    captured.FakePgClient.constructed = 0;
    captured.targetFactory.mockReset();
    captured.targetFactory.mockImplementation(() => captured.targetResolver);
    captured.compositionFactory.mockReset();
    captured.compositionFactory.mockImplementation(
      async () => captured.runtimeBundle,
    );
  });

  it("is frozen, source-only and keeps the formal identity factory fixed-off", async () => {
    expect(IMPORT_TIME_COUNTS).toEqual({
      targetFactories: 0,
      compositions: 0,
      pgConstructed: 0,
    });
    expect(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_VERSION,
    ).toBe(
      "identities.communication.openai.synthetic-preview.2026-09-01.m1s.v2",
    );
    expect(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_READY,
    ).toBe(false);
    expect(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES,
    ).toBeUndefined();
    expect(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST,
    ).toBe(
      "98a25545a0d2998b136453d1703dea747467cd1ebf2f1ba443121125f27df08a",
    );
    expect(
      canonicalSha256(
        withoutPolicyDigest(
          productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY,
        ),
      ),
    ).toBe(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST,
    );
    expect(
      productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY,
    ).toMatchObject({
      version:
        productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_VERSION,
      status: "SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED",
      ready: false,
      sourceOnly: true,
      productRuntimeCompositionPolicyDigest:
        "1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0",
      approvedRuntimeTargetPolicyDigest:
        "18f77b59a92c65b58fac4090fa3b16e8c6281dedca8b11903cf09f7cf2e361d2",
      injectedDeploymentIdentityAttestationContractPresent: true,
      deploymentIdentityImplementationPresent: false,
      authenticatedControlPlaneObservationContractPresent: true,
      controlPlaneIdentityImplementationPresent: false,
      credentialCustodyContractPresent: true,
      credentialTransportImplementationPresent: false,
      secretManagerImplementationPresent: false,
      maximumIdentityAgeMs: 300_000,
      maximumIdentityRemainingMs: 300_000,
      controlPlaneAuthorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
      requiredControlPlaneOAuthScope: "environment:read",
      controlPlaneScopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      controlPlaneOAuthAppReferenceRequired: true,
      controlPlaneOAuthGrantReferenceRequired: true,
      controlPlaneEndpointAllowlistEnforced: true,
      fineGrainedTokenPermissionClaimed: false,
      productionControlPlaneAuthorizationAllowed: false,
      underlyingCredentialClass:
        "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      underlyingCredentialShortLived: false,
      sourceCredentialSingleUse: false,
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
      rawCredentialMaterialAcceptedAtComposition: false,
      productRouteImporterPresent: false,
      productionTargetAllowed: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    expect(
      Object.isFrozen(
        productRuntimeIdentities.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY,
      ),
    ).toBe(true);
    expect(Object.keys(productRuntimeIdentities).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities",
    ]);

    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          return SECRET_SENTINEL;
        },
        getOwnPropertyDescriptor() {
          traps += 1;
          return undefined;
        },
        getPrototypeOf() {
          traps += 1;
          return Object.prototype;
        },
        ownKeys() {
          traps += 1;
          return [];
        },
      },
    );
    await expect(
      productRuntimeIdentities.createCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        hostile,
        hostile,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);
    expectLowerLayersUnused();
  });

  it("attests one fresh deployment identity and composes only private wrapped ports", async () => {
    const options = validOptions();
    const context = Object.freeze({
      signal: new AbortController().signal,
    });

    const result =
      await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        context,
      );

    expect(result).toBe(captured.runtimeBundle);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
    expect(options.deploymentIdentityAttestationPort.attest).toHaveBeenCalledWith(
      {
        purpose: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY",
        audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
        environmentClass: "NON_PRODUCTION_PREVIEW",
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        targetProjectRef: TARGET_PROJECT_REF,
        tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
      },
      context,
    );

    expect(captured.targetFactory).toHaveBeenCalledTimes(1);
    const targetOptions = (
      captured.targetFactory.mock.calls[0] as unknown as [unknown]
    )[0] as Record<string, unknown>;
    expect(Object.keys(targetOptions)).toEqual([
      "capability",
      "controlPlaneObservationPort",
      "projectRefHmacPort",
      "pinnedCaLoader",
      "clock",
    ]);
    expect(targetOptions).toMatchObject({
      capability: "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER",
    });
    expect(targetOptions.controlPlaneObservationPort).not.toBe(
      options.authenticatedControlPlaneObservationPort,
    );
    expect(targetOptions.projectRefHmacPort).not.toBe(
      options.projectRefHmacPort,
    );
    expect(targetOptions.pinnedCaLoader).not.toBe(options.pinnedCaLoader);

    expect(captured.compositionFactory).toHaveBeenCalledTimes(1);
    const [compositionOptions, compositionContext] =
      captured.compositionFactory.mock.calls[0] as unknown as [
        Record<string, unknown>,
        unknown,
      ];
    expect(compositionContext).not.toBe(context);
    expect(compositionContext).toEqual({ signal: context.signal });
    expect(Object.isFrozen(compositionContext)).toBe(true);
    expect(Object.keys(compositionOptions)).toEqual([
      "capability",
      "targetResolver",
      "targetRequest",
      "verifiedAuthorization",
      "custodyResolver",
      "managementCredentialTransport",
      "clock",
      "entropy",
    ]);
    expect(compositionOptions).toMatchObject({
      capability: "TEST_ONLY_M1R_PRODUCT_RUNTIME_COMPOSITION",
      targetResolver: captured.targetResolver,
      targetRequest: options.targetRequest,
      verifiedAuthorization: options.verifiedAuthorization,
      custodyResolver: options.custodyResolver,
    });
    expect(compositionOptions.clock).not.toBe(options.clock);
    expect(compositionOptions.entropy).not.toBe(options.entropy);
    expect(compositionOptions.managementCredentialTransport).not.toBe(
      options.managementCredentialCustodyPort,
    );
    expect(
      (compositionOptions.managementCredentialTransport as { consume: unknown })
        .consume,
    ).not.toBe(options.managementCredentialCustodyPort.consume);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("captures immutable authorization and branded custody references before attestation", async () => {
    const options = validOptions();
    const originalAuthorization = options.verifiedAuthorization;
    const originalCustodyResolver = options.custodyResolver;
    const replacementAuthorization = Object.freeze({
      status: "OPAQUE_VERIFIED_AUTHORIZATION" as const,
      rawCredentialMaterialPresent: false,
    });
    const replacementCustodyResolver = Object.freeze({
      resolve: vi.fn(),
    });
    options.deploymentIdentityAttestationPort.attest.mockImplementationOnce(
      async () => {
        options.verifiedAuthorization = replacementAuthorization;
        options.custodyResolver = replacementCustodyResolver;
        return validIdentity();
      },
    );

    await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
      options,
      Object.freeze({ signal: new AbortController().signal }),
    );

    const compositionOptions = (
      captured.compositionFactory.mock.calls[0] as unknown as [unknown]
    )[0] as Record<string, unknown>;
    expect(compositionOptions.verifiedAuthorization).toBe(
      originalAuthorization,
    );
    expect(compositionOptions.custodyResolver).toBe(
      originalCustodyResolver,
    );
    expect(compositionOptions.verifiedAuthorization).not.toBe(
      replacementAuthorization,
    );
    expect(compositionOptions.custodyResolver).not.toBe(
      replacementCustodyResolver,
    );
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("binds the attested identity and authenticated observation to every wrapped port request", async () => {
    const options = validOptions();
    const context = Object.freeze({ signal: new AbortController().signal });
    await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
      options,
      context,
    );

    const targetOptions = (
      captured.targetFactory.mock.calls[0] as unknown as [unknown]
    )[0] as {
      controlPlaneObservationPort: {
        observe: (request: unknown, context: unknown) => Promise<unknown>;
      };
      projectRefHmacPort: {
        hmac: (request: unknown, context: unknown) => Promise<unknown>;
      };
      pinnedCaLoader: {
        load: (request: unknown, context: unknown) => Promise<unknown>;
      };
    };
    const compositionOptions = (
      captured.compositionFactory.mock.calls[0] as unknown as [unknown]
    )[0] as {
      managementCredentialTransport: {
        consume: (
          request: unknown,
          context: unknown,
          consumer: (credential: unknown) => PromiseLike<void>,
        ) => Promise<void>;
      };
    };

    const observation = (await targetOptions.controlPlaneObservationPort.observe(
      {
        source: "SUPABASE_CONTROL_PLANE",
        targetProjectRef: TARGET_PROJECT_REF,
      },
      context,
    )) as Record<string, unknown>;
    const [authenticatedObservationRequest, authenticatedObservationContext] =
      options.authenticatedControlPlaneObservationPort.observe.mock
        .calls[0] as unknown as [Record<string, unknown>, { signal: AbortSignal }];
    expect(authenticatedObservationRequest).toMatchObject({
      purpose:
        "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION",
      source: "SUPABASE_MANAGEMENT_API",
      targetProjectRef: TARGET_PROJECT_REF,
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
    });
    const deploymentIdentityEvidenceSha256 =
      authenticatedObservationRequest.deploymentIdentityEvidenceSha256;
    expect(deploymentIdentityEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(deploymentIdentityEvidenceSha256).not.toBe(
      DEPLOYMENT_IDENTITY_EVIDENCE_SHA256,
    );
    expect(deploymentIdentityEvidenceSha256).toBe(
      canonicalSha256({
        domain:
          "careslink.communication-note.preview.deployment-identity.m1s.v2",
        request: identityRequest(),
        identity: validIdentity(),
      }),
    );
    expect(authenticatedObservationContext).toEqual({ signal: context.signal });

    const controlPlaneEvidenceSha256 =
      observation.controlPlaneEvidenceSha256;
    expect(controlPlaneEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(controlPlaneEvidenceSha256).not.toBe(
      CONTROL_PLANE_EVIDENCE_SHA256,
    );
    expect(controlPlaneEvidenceSha256).toBe(
      canonicalSha256({
        domain:
          "careslink.communication-note.preview.authenticated-control-plane-evidence.m1s.v2",
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        deploymentIdentityEvidenceSha256,
        identity: validControlPlaneEnvelope().identity,
        observation: validObservation(),
      }),
    );
    expect(observation).toMatchObject({
      source: "SUPABASE_CONTROL_PLANE",
      targetProjectRef: TARGET_PROJECT_REF,
      expiresAt: "2026-09-01T12:04:00.000Z",
      controlPlaneEvidenceSha256,
      rawCredentialMaterialPresent: false,
    });
    expect(observation).not.toHaveProperty("observationEvidenceSha256");

    const hmacRequest = Object.freeze({
      purpose: "SUPABASE_PROJECT_REF_BINDING",
      projectRef: TARGET_PROJECT_REF,
    });
    await targetOptions.projectRefHmacPort.hmac(hmacRequest, context);
    expect(options.projectRefHmacPort.hmac).toHaveBeenCalledWith(
      {
        ...hmacRequest,
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        deploymentIdentityEvidenceSha256,
        controlPlaneEvidenceSha256,
      },
      context,
    );

    const caRequest = Object.freeze({
      tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
    });
    await targetOptions.pinnedCaLoader.load(caRequest, context);
    expect(options.pinnedCaLoader.load).toHaveBeenCalledWith(
      {
        ...caRequest,
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        deploymentIdentityEvidenceSha256,
        controlPlaneEvidenceSha256,
      },
      context,
    );

    const credentialRequest = managementCredentialRequest();
    const consumer = vi.fn(async () => undefined);
    await compositionOptions.managementCredentialTransport.consume(
      credentialRequest,
      context,
      consumer,
    );
    expect(options.managementCredentialCustodyPort.consume).toHaveBeenCalledWith(
      {
        ...credentialRequest,
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        deploymentIdentityEvidenceSha256,
        controlPlaneEvidenceSha256,
      },
      context,
      consumer,
    );
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each([
    ["wrong audience", { audience: "WRONG" }],
    ["wrong authorization model", { authorizationModel: "FINE_GRAINED_TOKEN" }],
    ["wrong OAuth scope", { oauthScope: "environment:write" }],
    [
      "OAuth app reference reused from workload identity",
      { oauthAppReferenceSha256: WORKLOAD_IDENTITY_HMAC_SHA256 },
    ],
    [
      "reused OAuth grant reference",
      { oauthGrantReferenceSha256: OAUTH_APP_REFERENCE_SHA256 },
    ],
    [
      "wrong scope attestation source",
      { scopeAttestationSource: "TOKEN_SELF_ASSERTION" },
    ],
    ["disabled endpoint allowlist", { endpointAllowlistEnforced: false }],
    [
      "fine-grained token permission claim",
      { permission: "BRANCHING_DEVELOPMENT_READ" },
    ],
    ["raw credential claim", { rawCredentialMaterialPresent: true }],
    ["stale issue time", { issuedAt: "2026-09-01T11:54:59.999Z" }],
    ["extra identity field", { extra: SECRET_SENTINEL }],
  ])(
    "rejects an authenticated control-plane identity with %s before HMAC or CA",
    async (_name, mutation) => {
      const options = validOptions();
      const envelope = validControlPlaneEnvelope();
      options.authenticatedControlPlaneObservationPort.observe.mockResolvedValueOnce(
        Object.freeze({
          identity: Object.freeze({ ...envelope.identity, ...mutation }),
          observation: envelope.observation,
        }) as unknown as ReturnType<typeof validControlPlaneEnvelope>,
      );
      const context = Object.freeze({
        signal: new AbortController().signal,
      });
      await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        context,
      );
      const targetOptions = (
        captured.targetFactory.mock.calls[0] as unknown as [unknown]
      )[0] as {
        controlPlaneObservationPort: {
          observe: (request: unknown, context: unknown) => Promise<unknown>;
        };
      };

      const error = await captureRejection(
        targetOptions.controlPlaneObservationPort.observe(
          {
            source: "SUPABASE_CONTROL_PLANE",
            targetProjectRef: TARGET_PROJECT_REF,
          },
          context,
        ),
      );

      expect(error).toMatchObject(FIXED_FAILURE);
      expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
      expect(options.projectRefHmacPort.hmac).not.toHaveBeenCalled();
      expect(options.pinnedCaLoader.load).not.toHaveBeenCalled();
      expect(
        options.managementCredentialCustodyPort.consume,
      ).not.toHaveBeenCalled();
      expect(captured.FakePgClient.constructed).toBe(0);
    },
  );

  it("rejects credential source-semantic substitution before custody", async () => {
    const options = validOptions();
    const context = Object.freeze({ signal: new AbortController().signal });
    await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
      options,
      context,
    );
    const targetOptions = (
      captured.targetFactory.mock.calls[0] as unknown as [unknown]
    )[0] as {
      controlPlaneObservationPort: {
        observe: (request: unknown, context: unknown) => Promise<unknown>;
      };
    };
    const compositionOptions = (
      captured.compositionFactory.mock.calls[0] as unknown as [unknown]
    )[0] as {
      managementCredentialTransport: {
        consume: (
          request: unknown,
          context: unknown,
          consumer: (credential: unknown) => PromiseLike<void>,
        ) => Promise<void>;
      };
    };
    await targetOptions.controlPlaneObservationPort.observe(
      {
        source: "SUPABASE_CONTROL_PLANE",
        targetProjectRef: TARGET_PROJECT_REF,
      },
      context,
    );

    await expect(
      compositionOptions.managementCredentialTransport.consume(
        {
          ...managementCredentialRequest(),
          credentialClass: "SHORT_LIVED_TOKEN",
        },
        context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    expect(
      options.managementCredentialCustodyPort.consume,
    ).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects missing, extra, accessor and Proxy options before any port can run", async () => {
    const valid = validOptions();
    const missing = Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== "entropy"),
    );
    const extra = { ...valid, extra: SECRET_SENTINEL };
    const wrongCapability = { ...valid, capability: "WRONG" };
    const accessor = { ...valid };
    let accessorReads = 0;
    Object.defineProperty(accessor, "clock", {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error(SECRET_SENTINEL);
      },
    });
    let proxyTraps = 0;
    const hostile = new Proxy(valid, {
      get() {
        proxyTraps += 1;
        return SECRET_SENTINEL;
      },
      getOwnPropertyDescriptor() {
        proxyTraps += 1;
        return undefined;
      },
      getPrototypeOf() {
        proxyTraps += 1;
        return Object.prototype;
      },
      ownKeys() {
        proxyTraps += 1;
        return [];
      },
    });

    for (const candidate of [
      missing,
      extra,
      wrongCapability,
      accessor,
      hostile,
      Object.create(null),
      null,
    ]) {
      await expect(
        productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
          candidate,
          Object.freeze({}),
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
    }
    expect(accessorReads).toBe(0);
    expect(proxyTraps).toBe(0);
    expect(valid.deploymentIdentityAttestationPort.attest).not.toHaveBeenCalled();
    expectLowerLayersUnused();
  });

  it("rejects aliased functions and hostile nested authority objects before attestation", async () => {
    const sharedFunction = vi.fn();
    const aliasedFunctions = {
      ...validOptions(),
      projectRefHmacPort: Object.freeze({ hmac: sharedFunction }),
      pinnedCaLoader: Object.freeze({ load: sharedFunction }),
    };
    let portAccessorReads = 0;
    const accessorPort = {};
    Object.defineProperty(accessorPort, "attest", {
      enumerable: true,
      get() {
        portAccessorReads += 1;
        throw new Error(SECRET_SENTINEL);
      },
    });
    const accessorPortOptions = {
      ...validOptions(),
      deploymentIdentityAttestationPort: accessorPort,
    };
    let nestedAccessorReads = 0;
    const nestedAuthorization = { status: "OPAQUE" };
    Object.defineProperty(nestedAuthorization, "statement", {
      enumerable: true,
      get() {
        nestedAccessorReads += 1;
        throw new Error(SECRET_SENTINEL);
      },
    });
    const nestedAccessorOptions = {
      ...validOptions(),
      verifiedAuthorization: nestedAuthorization,
    };
    let proxyTraps = 0;
    const nestedProxyOptions = {
      ...validOptions(),
      verifiedAuthorization: new Proxy(
        {},
        {
          get() {
            proxyTraps += 1;
            return SECRET_SENTINEL;
          },
          getOwnPropertyDescriptor() {
            proxyTraps += 1;
            return undefined;
          },
          getPrototypeOf() {
            proxyTraps += 1;
            return Object.prototype;
          },
          ownKeys() {
            proxyTraps += 1;
            return [];
          },
        },
      ),
    };

    for (const candidate of [
      aliasedFunctions,
      accessorPortOptions,
      nestedAccessorOptions,
      nestedProxyOptions,
    ]) {
      await expect(
        productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
          candidate,
          Object.freeze({ signal: new AbortController().signal }),
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
    }
    expect(portAccessorReads).toBe(0);
    expect(nestedAccessorReads).toBe(0);
    expect(proxyTraps).toBe(0);
    expect(captured.targetFactory).not.toHaveBeenCalled();
    expect(captured.compositionFactory).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects an already-aborted composition before the attestor can run", async () => {
    const controller = new AbortController();
    controller.abort();
    const options = validOptions();

    await expect(
      productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        Object.freeze({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    expect(
      options.deploymentIdentityAttestationPort.attest,
    ).not.toHaveBeenCalled();
    expectLowerLayersUnused();
  });

  it("rejects a deployment clock rollback before composing lower layers", async () => {
    const options = validOptions();
    options.clock.now
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce("2026-09-01T11:59:59.999Z");

    await expect(
      productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        Object.freeze({ signal: new AbortController().signal }),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    expect(
      options.deploymentIdentityAttestationPort.attest,
    ).toHaveBeenCalledTimes(1);
    expectLowerLayersUnused();
  });

  it.each([
    ["stale", { observedAt: "2026-09-01T11:54:59.999Z" }],
    ["future", { observedAt: "2026-09-01T12:00:00.001Z" }],
    ["expired", { expiresAt: "2026-09-01T11:59:59.999Z" }],
    ["excessive remaining lifetime", { expiresAt: "2026-09-01T12:05:00.001Z" }],
    ["source revision mismatch", { sourceRevisionSha256: "f".repeat(64) }],
    ["audience mismatch", { audience: "WRONG_AUDIENCE" }],
    ["environment mismatch", { environmentClass: "PRODUCTION" }],
    ["credential material claim", { rawCredentialMaterialPresent: true }],
    ["extra field", { extra: SECRET_SENTINEL }],
  ])("rejects a %s identity attestation", async (_name, mutation) => {
    const options = validOptions(mutation);

    const error = await captureRejection(
      productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        Object.freeze({ signal: new AbortController().signal }),
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(captured.targetFactory).not.toHaveBeenCalled();
    expect(captured.compositionFactory).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects Proxy and accessor identity attestations without leaking or continuing", async () => {
    let proxyTraps = 0;
    const hostileIdentity = new Proxy(validIdentity(), {
      get() {
        proxyTraps += 1;
        return SECRET_SENTINEL;
      },
      getOwnPropertyDescriptor() {
        proxyTraps += 1;
        return undefined;
      },
      getPrototypeOf() {
        proxyTraps += 1;
        return Object.prototype;
      },
      ownKeys() {
        proxyTraps += 1;
        return [];
      },
    });
    const accessorIdentity = { ...validIdentity() };
    let accessorReads = 0;
    Object.defineProperty(accessorIdentity, "observedAt", {
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error(SECRET_SENTINEL);
      },
    });

    for (const identity of [hostileIdentity, accessorIdentity]) {
      const options = validOptions();
      options.deploymentIdentityAttestationPort.attest.mockResolvedValueOnce(
        identity,
      );
      const error = await captureRejection(
        productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
          options,
          Object.freeze({ signal: new AbortController().signal }),
        ),
      );
      expect(error).toMatchObject(FIXED_FAILURE);
      expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    }
    // Promise resolution performs the one unavoidable `then` probe; the
    // contract validator itself must not traverse the hostile object.
    expect(proxyTraps).toBe(1);
    expect(accessorReads).toBe(0);
    expectLowerLayersUnused();
  });

  it("normalizes top-level composition errors to one non-leaking failure", async () => {
    const phases: Array<(options: ReturnType<typeof validOptions>) => void> = [
      (options) => {
        options.deploymentIdentityAttestationPort.attest.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      },
      () => {
        captured.targetFactory.mockImplementationOnce(() => {
          throw new Error(SECRET_SENTINEL);
        });
      },
      () => {
        captured.compositionFactory.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      },
    ];

    for (const prepare of phases) {
      const options = validOptions();
      prepare(options);
      const error = await captureRejection(
        productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
          options,
          Object.freeze({ signal: new AbortController().signal }),
        ),
      );
      expect(error).toMatchObject(FIXED_FAILURE);
      expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
      expect(
        options.deploymentIdentityAttestationPort.attest,
      ).toHaveBeenCalledTimes(1);
      expect(captured.FakePgClient.constructed).toBe(0);
    }
    expect(captured.targetFactory).toHaveBeenCalledTimes(2);
    expect(captured.compositionFactory).toHaveBeenCalledTimes(1);
  });

  it.each(["observation", "hmac", "ca", "custody"] as const)(
    "normalizes a %s source-port rejection without leaking",
    async (phase) => {
      const options = validOptions();
      if (phase === "observation") {
        options.authenticatedControlPlaneObservationPort.observe.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      } else if (phase === "hmac") {
        options.projectRefHmacPort.hmac.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      } else if (phase === "ca") {
        options.pinnedCaLoader.load.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      } else {
        options.managementCredentialCustodyPort.consume.mockRejectedValueOnce(
          new Error(SECRET_SENTINEL),
        );
      }
      const context = Object.freeze({
        signal: new AbortController().signal,
      });
      await productRuntimeIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
        options,
        context,
      );
      const targetOptions = (
        captured.targetFactory.mock.calls[0] as unknown as [unknown]
      )[0] as {
        controlPlaneObservationPort: {
          observe: (request: unknown, context: unknown) => Promise<unknown>;
        };
        projectRefHmacPort: {
          hmac: (request: unknown, context: unknown) => Promise<unknown>;
        };
        pinnedCaLoader: {
          load: (request: unknown, context: unknown) => Promise<unknown>;
        };
      };
      const compositionOptions = (
        captured.compositionFactory.mock.calls[0] as unknown as [unknown]
      )[0] as {
        managementCredentialTransport: {
          consume: (
            request: unknown,
            context: unknown,
            consumer: (credential: unknown) => PromiseLike<void>,
          ) => Promise<void>;
        };
      };
      let operation: Promise<unknown>;
      if (phase === "observation") {
        operation = targetOptions.controlPlaneObservationPort.observe(
          {
            source: "SUPABASE_CONTROL_PLANE",
            targetProjectRef: TARGET_PROJECT_REF,
          },
          context,
        );
      } else {
        await targetOptions.controlPlaneObservationPort.observe(
          {
            source: "SUPABASE_CONTROL_PLANE",
            targetProjectRef: TARGET_PROJECT_REF,
          },
          context,
        );
        if (phase === "hmac") {
          operation = targetOptions.projectRefHmacPort.hmac(
            {
              purpose: "SUPABASE_PROJECT_REF_BINDING",
              projectRef: TARGET_PROJECT_REF,
            },
            context,
          );
        } else if (phase === "ca") {
          operation = targetOptions.pinnedCaLoader.load(
            {
              tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
            },
            context,
          );
        } else {
          operation =
            compositionOptions.managementCredentialTransport.consume(
              managementCredentialRequest(),
              context,
              vi.fn(async () => undefined),
            );
        }
      }

      const error = await captureRejection(operation);
      expect(error).toMatchObject(FIXED_FAILURE);
      expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
      expect(captured.FakePgClient.constructed).toBe(0);
    },
  );

  it("composes through the actual M1s to M1r and M1m target chain without constructing pg", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      vi.doUnmock(
        "./communication-note-preview-approved-runtime-target.server",
      );
      vi.doUnmock(
        "./communication-note-preview-product-runtime-composition.server",
      );
      vi.resetModules();
      const actualIdentities =
        await import("./communication-note-preview-product-runtime-identities.server");
      const { createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver } =
        await import("./communication-note-preview-runner-terminal-resolved-runtime-binding.server");
      const caBytes = new TextEncoder().encode(
        "M1s integration pinned root certificate fixture",
      );
      const caSha256 = createHash("sha256").update(caBytes).digest("hex");
      const observe = vi.fn(async () =>
        Object.freeze({
          identity: Object.freeze({
            status:
              "AUTHENTICATED_CONTROL_PLANE_IDENTITY_NOT_APPROVED",
            source: "SUPABASE_MANAGEMENT_API",
            audience: "SUPABASE_MANAGEMENT_API",
            authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
            oauthScope: "environment:read",
            oauthAppReferenceSha256: "b".repeat(64),
            oauthGrantReferenceSha256: "c".repeat(64),
            scopeAttestationSource:
              "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
            endpointAllowlistEnforced: true,
            principalReferenceSha256: "5".repeat(64),
            credentialReferenceSha256: "6".repeat(64),
            issuedAt: "2026-09-01T11:58:00.000Z",
            expiresAt: "2026-09-01T12:04:00.000Z",
            rawCredentialMaterialPresent: false,
          }),
          observation: Object.freeze({
            source: "SUPABASE_CONTROL_PLANE",
            targetProjectRef: TARGET_PROJECT_REF,
            parentProjectRef: "adocsnwnslxhxcjgbyee",
            defaultBranch: false,
            persistent: false,
            withData: false,
            postgresMajor: 17,
            projectStatus: "ACTIVE_HEALTHY",
            observedAt: "2026-09-01T11:58:00.000Z",
            expiresAt: "2026-09-01T12:04:00.000Z",
            observationEvidenceSha256: "7".repeat(64),
            tlsRootCertificateSha256: caSha256,
            endpoint: Object.freeze({
              connectionMode: "DIRECT",
              hostname: `db.${TARGET_PROJECT_REF}.supabase.co`,
              port: 5432,
              database: "postgres",
              usernameProjectRefSuffix: null,
            }),
            rawCredentialMaterialPresent: false,
          }),
        }),
      );
      const hmac = vi.fn(
        async (request: Readonly<{ projectRef: string }>) =>
          Object.freeze({
            projectRefHmac:
              request.projectRef === TARGET_PROJECT_REF
                ? "8".repeat(64)
                : "9".repeat(64),
            keyReferenceSha256: "a".repeat(64),
            rawKeyMaterialPresent: false,
          }),
      );
      const load = vi.fn(async () =>
        Object.freeze({
          tlsRootCertificate: caBytes,
          rawCredentialMaterialPresent: false,
        }),
      );
      const attest = vi.fn(async () =>
        Object.freeze({
          status: "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED",
          source: "INJECTED_WORKLOAD_IDENTITY_ATTESTATION",
          audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
          environmentClass: "NON_PRODUCTION_PREVIEW",
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          workloadIdentityHmacSha256: "2".repeat(64),
          deploymentHmacSha256: "3".repeat(64),
          attestationEvidenceSha256: "4".repeat(64),
          observedAt: "2026-09-01T11:58:00.000Z",
          expiresAt: "2026-09-01T12:04:00.000Z",
          rawCredentialMaterialPresent: false,
        }),
      );
      const custodyResolver =
        createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver(
          {
            capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
            resolve: vi.fn(),
          },
        );
      const verifiedAuthorization = deepFreezeFixture({
        statement: {
          runIdHash: "b".repeat(64),
          expiresAt: "2026-09-01T12:04:30.000Z",
        },
        authorizationDigest: "c".repeat(64),
        signature: "opaque-test-signature",
        signatureSha256: "d".repeat(64),
        authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED",
        verifiedAt: NOW,
      });

      const result =
        await actualIdentities.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
          {
            capability: "TEST_ONLY_M1S_PRODUCT_RUNTIME_IDENTITIES",
            expectedSourceRevisionSha256: SOURCE_REVISION_SHA256,
            deploymentIdentityAttestationPort: Object.freeze({ attest }),
            authenticatedControlPlaneObservationPort: Object.freeze({ observe }),
            projectRefHmacPort: Object.freeze({ hmac }),
            pinnedCaLoader: Object.freeze({ load }),
            managementCredentialCustodyPort: Object.freeze({
              consume: vi.fn(async () => undefined),
            }),
            targetRequest: Object.freeze({
              targetProjectRef: TARGET_PROJECT_REF,
              tlsRootCertificateSha256: caSha256,
            }),
            verifiedAuthorization,
            custodyResolver,
            clock: Object.freeze({ now: () => NOW }),
            entropy: Object.freeze({
              bytes: (length: number) => new Uint8Array(length).fill(11),
            }),
          },
          Object.freeze({ signal: new AbortController().signal }),
        );

      expect(result.status).toBe(
        "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED",
      );
      expect(result.databaseTarget).toMatchObject({
        status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
        targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
        productionExcluded: true,
        rawCredentialMaterialPresent: false,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(attest).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledTimes(1);
      expect(hmac).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenCalledTimes(1);
      expect(captured.FakePgClient.constructed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function validOptions(identityMutation: Record<string, unknown> = {}) {
  const envelope = validControlPlaneEnvelope();
  return {
    capability: "TEST_ONLY_M1S_PRODUCT_RUNTIME_IDENTITIES",
    expectedSourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityAttestationPort: Object.freeze({
      attest: vi.fn(async () => ({
        ...validIdentity(),
        ...identityMutation,
      })),
    }),
    authenticatedControlPlaneObservationPort: Object.freeze({
      observe: vi.fn(async () => envelope),
    }),
    projectRefHmacPort: Object.freeze({
      hmac: vi.fn(async () => Object.freeze({ status: "OPAQUE_HMAC" })),
    }),
    pinnedCaLoader: Object.freeze({
      load: vi.fn(async () => new Uint8Array([1, 2, 3])),
    }),
    managementCredentialCustodyPort: Object.freeze({
      consume: vi.fn(
        async (
          _request: unknown,
          _context: unknown,
          consumer: (credential: unknown) => PromiseLike<void>,
        ) => consumer(Object.freeze({ status: "OPAQUE_CREDENTIAL" })),
      ),
    }),
    targetRequest: Object.freeze({
      targetProjectRef: TARGET_PROJECT_REF,
      tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
    }),
    verifiedAuthorization: Object.freeze({
      status: "OPAQUE_VERIFIED_AUTHORIZATION",
      rawCredentialMaterialPresent: false,
    }),
    custodyResolver: Object.freeze({ resolve: vi.fn() }),
    clock: Object.freeze({ now: vi.fn(() => NOW) }),
    entropy: Object.freeze({ bytes: vi.fn() }),
  };
}

function identityRequest() {
  return {
    purpose: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY",
    audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
    environmentClass: "NON_PRODUCTION_PREVIEW",
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    targetProjectRef: TARGET_PROJECT_REF,
    tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
  };
}

function validIdentity() {
  return {
    status: "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED",
    source: "INJECTED_WORKLOAD_IDENTITY_ATTESTATION",
    audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
    environmentClass: "NON_PRODUCTION_PREVIEW",
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    workloadIdentityHmacSha256: WORKLOAD_IDENTITY_HMAC_SHA256,
    deploymentHmacSha256: DEPLOYMENT_HMAC_SHA256,
    attestationEvidenceSha256: DEPLOYMENT_IDENTITY_EVIDENCE_SHA256,
    observedAt: "2026-09-01T11:58:00.000Z",
    expiresAt: "2026-09-01T12:04:00.000Z",
    rawCredentialMaterialPresent: false,
  };
}

function validObservation() {
  return Object.freeze({
    source: "SUPABASE_CONTROL_PLANE",
    targetProjectRef: TARGET_PROJECT_REF,
    parentProjectRef: "xyjnscbudymjejkiqcgt",
    defaultBranch: false,
    persistent: false,
    withData: false,
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    observedAt: "2026-09-01T11:58:00.000Z",
    expiresAt: "2026-09-01T12:04:00.000Z",
    observationEvidenceSha256: CONTROL_PLANE_EVIDENCE_SHA256,
    tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
    endpoint: Object.freeze({
      connectionMode: "DIRECT",
      hostname: `db.${TARGET_PROJECT_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      usernameProjectRefSuffix: null,
    }),
    rawCredentialMaterialPresent: false,
  });
}

function validControlPlaneEnvelope() {
  return Object.freeze({
    identity: Object.freeze({
      status: "AUTHENTICATED_CONTROL_PLANE_IDENTITY_NOT_APPROVED",
      source: "SUPABASE_MANAGEMENT_API",
      audience: "SUPABASE_MANAGEMENT_API",
      authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
      oauthScope: "environment:read",
      oauthAppReferenceSha256: OAUTH_APP_REFERENCE_SHA256,
      oauthGrantReferenceSha256: OAUTH_GRANT_REFERENCE_SHA256,
      scopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      endpointAllowlistEnforced: true,
      principalReferenceSha256: CONTROL_PLANE_PRINCIPAL_SHA256,
      credentialReferenceSha256: CONTROL_PLANE_CREDENTIAL_SHA256,
      issuedAt: "2026-09-01T11:58:00.000Z",
      expiresAt: "2026-09-01T12:04:00.000Z",
      rawCredentialMaterialPresent: false,
    }),
    observation: validObservation(),
  });
}

function managementCredentialRequest() {
  return Object.freeze({
    purpose: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION",
    targetDescriptorSha256: "7".repeat(64),
    tlsRootCertificateSha256: TLS_ROOT_CERTIFICATE_SHA256,
    user: "postgres",
    applicationName:
      "careslink-preview-runtime-credential-broker-management",
    credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
    deliveryNonce: "8".repeat(64),
    deliveryExpiresNoLaterThan: "2026-09-01T12:04:00.000Z",
    maximumDeliveryLifetimeMs: 60_000,
  });
}

function expectLowerLayersUnused() {
  expect(captured.targetFactory).not.toHaveBeenCalled();
  expect(captured.compositionFactory).not.toHaveBeenCalled();
  expect(captured.FakePgClient.constructed).toBe(0);
}

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function withoutPolicyDigest(value: Readonly<Record<string, unknown>>) {
  const core = { ...value };
  delete core.policyDigest;
  return core;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function deepFreezeFixture<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeFixture(child);
    }
  }
  return value;
}
