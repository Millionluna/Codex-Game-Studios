import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  X509Certificate,
} from "node:crypto";
import {
  closeSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { types as nodeTypes } from "node:util";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_ADAPTER_BUNDLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_READY,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters,
} from "./communication-note-preview-approved-runtime-adapters.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
} from "./communication-note-preview-approved-runtime-management-session.server";
import {
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
} from "./communication-note-preview-approved-runtime-postgres-session.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver,
} from "./communication-note-preview-approved-runtime-target.server";
import {
  type CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import {
  createM1ghRunnerTerminalTrustFixture,
  createM1giAcceptedRunnerTerminalEnvelope,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

const ENABLE_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_CONFIG_FD";
const CA_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_CA_FD";
const SECRET_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_SECRET_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_STATUS_FD";
const CONFIG_FD = 3;
const CA_FD = 4;
const SECRET_FD = 5;
const STATUS_FD = 6;
const CONFIG_MAXIMUM_BYTES = 16 * 1_024;
const CA_MAXIMUM_BYTES = 64 * 1_024;
const SECRET_MAXIMUM_BYTES = 8 + 1 + 32 + 2 + 1_024;
const STATUS_MAXIMUM_BYTES = 256;
const ADMIN_CLOSE_TIMEOUT_MS = 2_000;
const SECRET_MAGIC = Buffer.from("CLM1NSEC", "ascii");
const SECRET_VERSION = 1;
const CONFIG_SCHEMA_VERSION =
  "config.communication-note-approved-runtime-adapters-hosted.2026-08-31.m1n.v1";
const SOURCE_MANIFEST_SCHEMA_VERSION =
  "source-manifest.communication-note-approved-runtime-adapters-hosted.2026-08-31.m1n.v1";
const SOURCE_MANIFEST_RELATIVE_PATH =
  "scripts/preview-e2e/communication-note-preview-approved-runtime-adapters-hosted-source-manifest.json";
const EXPECTED_PG_PACKAGE_VERSION = "8.23.0";
const SOURCE_REVISION_DOMAIN =
  "CARESLINK_V1_M1N_STATIC_BRANCH_ADMIN_DELIVERY_V1";
const SETUP_APPLICATION_NAME =
  "careslink-preview-runner-terminal-valid-e2e-management";
const POSTCHECK_APPLICATION_NAME =
  "careslink-preview-approved-runtime-adapters-m1n-postcheck";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_READY =
  false as const;

const SUCCESS_STATUS =
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_PASSED" as const;
const FAILURE_CODES = Object.freeze({
  config: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CONFIG_INVALID",
  ca: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CA_INVALID",
  secret: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_SECRET_INVALID",
  driver: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_DRIVER_INVALID",
  target: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_TARGET_FAILED",
  setup: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_SETUP_FAILED",
  composition:
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_COMPOSITION_FAILED",
  persist: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_PERSIST_FAILED",
  cleanup: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CLEANUP_FAILED",
  postcheck:
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_POSTCHECK_FAILED",
  internal: "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_INTERNAL_FAILED",
} as const);

type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];
type FixedStatus = typeof SUCCESS_STATUS | FailureCode;

type TargetEndpoint = Readonly<{
  connectionMode: "DIRECT" | "SUPAVISOR_SESSION";
  hostname: string;
  port: 5432;
  database: "postgres";
  usernameProjectRefSuffix: string | null;
}>;

type HostedConfig = Readonly<{
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  sourceRevisionSha256: string;
  target: Readonly<{
    source: "SUPABASE_CONTROL_PLANE";
    targetProjectRef: string;
    parentProjectRef: typeof CARESLINK_PRODUCTION_SUPABASE_REF;
    defaultBranch: false;
    persistent: false;
    withData: false;
    postgresMajor: 17;
    projectStatus: "ACTIVE_HEALTHY";
    observedAt: string;
    expiresAt: string;
    controlPlaneEvidenceSha256: string;
    endpoint: TargetEndpoint;
  }>;
  tlsRootCertificateSha256: string;
  managementUser: string;
  credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD";
  sourceExpiresAt: null;
  sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET";
  deliveryIssuedAt: string;
  deliveryExpiresAt: string;
  secretEnvelopeBindingSha256: string;
  rawDsnPresent: false;
}>;

type HostedFixture = ReturnType<
  typeof createM1ghRunnerTerminalTrustFixture
>;

type HostedPgClient = {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "error", listener: (error: unknown) => void): unknown;
  password?: unknown;
  connectionParameters?: { password?: unknown };
  connection?: {
    stream?: {
      encrypted?: boolean;
      authorized?: boolean;
      authorizationError?: unknown;
      destroy?: () => unknown;
    };
  };
};

type HostedPgClientConstructor = new (
  config: Readonly<Record<string, unknown>>,
) => HostedPgClient;

type ApprovedPgClientConstructor = HostedPgClientConstructor &
  CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor &
  CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor;

class HostedLiveError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(code);
    this.name = "HostedLiveError";
    this.code = code;
  }
}

function fail(code: FailureCode): never {
  throw new HostedLiveError(code);
}

const APP_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const DATABASE_CLOCK_SQL = `select
  pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  current_user,
  session_user,
  pg_catalog.current_database() as database_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
    10000 as postgres_major`;

const CHAIN_CATALOG_SQL = `select
  pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  authorization_record.authorization_digest,
  authorization_record.run_id_hash,
  claim_record.claim_id::pg_catalog.text,
  reservation_record.reservation_id::pg_catalog.text,
  reservation_record.slot_index,
  reservation_record.fixture_id,
  reservation_record.run_ordinal,
  reservation_record.request_body_sha256,
  reservation_record.request_body_utf8_byte_length,
  reservation_record.semantic_canonical_request_sha256,
  receipt_record.receipt_digest,
  receipt_record.signature_sha256 as receipt_signature_sha256,
  receipt_record.usage as receipt_usage,
  receipt_record.calculated_cost_upper_bound_micro_usd
from careslink_v1_generation.communication_note_preview_authorizations
  as authorization_record
join careslink_v1_generation.communication_note_preview_claims as claim_record
  on claim_record.authorization_digest =
    authorization_record.authorization_digest
join careslink_v1_generation.communication_note_preview_dispatch_reservations
  as reservation_record on reservation_record.claim_id = claim_record.claim_id
join careslink_v1_generation.communication_note_preview_dispatch_receipts
  as receipt_record on receipt_record.reservation_id =
    reservation_record.reservation_id
where authorization_record.authorization_digest = $1::pg_catalog.text`;

const POSTCHECK_SQL = `select
  (select pg_catalog.jsonb_build_array(
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorizations),
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorization_revocations),
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_claims),
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_reservations),
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_receipts),
    (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_runner_terminals)
  )) as ledger_counts,
  (select pg_catalog.count(*)
    from careslink_v1_runtime_broker.acquisitions) as acquisition_count,
  (select pg_catalog.count(*)
    from careslink_v1_runtime_broker.acquisitions as acquisition
    where acquisition.state = 'REVOKED'
      and acquisition.issued_at is not null
      and acquisition.reported_credential_disposition = 'REVOKED'
      and acquisition.reported_session_disposition = 'DESTROYED'
      and acquisition.tombstoned_at is not null
      and acquisition.future_issuance_blocked
      and acquisition.revoked_at is not null
      and not acquisition.reusable
      and not acquisition.raw_credential_material_present
  ) as revoked_acquisition_count,
  (select pg_catalog.count(*)
    from careslink_v1_runtime_broker.acquisitions as acquisition
    where acquisition.state = 'REVOKED'
      and acquisition.bound_backend_pid is not null
      and acquisition.bound_backend_start is not null
      and not exists (
        select 1 from pg_catalog.pg_stat_activity as activity
        where activity.pid = acquisition.bound_backend_pid
          and activity.backend_start = acquisition.bound_backend_start
      )
  ) as exact_pid_drained_count,
  (select pg_catalog.count(*) from pg_catalog.pg_roles as role_record
    where role_record.rolname ~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ) as runtime_role_count,
  (select pg_catalog.count(*) from pg_catalog.pg_stat_activity as activity
    where activity.usename ~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ) as runtime_session_count,
  (select pg_catalog.count(*)
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as member_role
      on member_role.oid = membership.member
    where member_role.rolname ~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ) as runtime_membership_count,
  (select pg_catalog.count(*)
    from pg_catalog.unnest(array[
      'anon', 'authenticated', 'service_role', 'authenticator'
    ]::pg_catalog.text[]) as api(role_name)
    where pg_catalog.has_schema_privilege(
        api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
      )
      or exists (
        select 1 from pg_catalog.pg_proc as routine
        where routine.pronamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and routine.prokind in ('f', 'w')
          and pg_catalog.has_function_privilege(
            api.role_name, routine.oid, 'EXECUTE'
          )
      )
      or exists (
        select 1 from pg_catalog.pg_class as relation
        where relation.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
          and pg_catalog.has_table_privilege(
            api.role_name,
            relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      )
      or exists (
        select 1 from pg_catalog.pg_class as sequence
        where sequence.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and sequence.relkind = 'S'
          and pg_catalog.has_sequence_privilege(
            api.role_name, sequence.oid, 'USAGE,SELECT,UPDATE'
          )
      )
  )::pg_catalog.int4 as api_privilege_count`;

describe("Communication Note M1n approved runtime adapters Hosted gate", () => {
  it("stays default-off and keeps every formal approval latch closed", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_ADAPTER_BUNDLE,
    ).toBeUndefined();
    const source = readFileSync(new URL(import.meta.url), "utf8");
    expect(source).not.toContain(["console", "."].join(""));
    expect(source).not.toContain(["process", ".", "argv"].join(""));
    expect(source).not.toMatch(/from\s+["']pg["']/);
    expect(source).toContain("bundle.runtimePort.persist(envelope)");
    expect(resolvePgDriver()).toMatchObject({ version: "8.23.0" });
  });

  it("parses one exact public config and recomputes its source revision", () => {
    const now = Date.now();
    const config = createUnitConfig(now);
    expect(parseHostedConfig(Buffer.from(JSON.stringify(config)), now))
      .toMatchObject({
        schemaVersion: CONFIG_SCHEMA_VERSION,
        credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
        sourceExpiresAt: null,
        sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
        rawDsnPresent: false,
      });
    expect(() =>
      parseHostedConfig(
        Buffer.from(JSON.stringify({ ...config, extra: true })),
        now,
      )
    ).toThrowError(FAILURE_CODES.config);
    expect(() =>
      parseHostedConfig(
        Buffer.from(` ${JSON.stringify(config)}`),
        now,
      )
    ).toThrowError(FAILURE_CODES.config);
  });

  it("accepts one bound binary secret and rejects replay-shaped expansion", () => {
    const password = "test-only-static-branch-password";
    const binding = "a".repeat(64);
    const envelope = createUnitSecretEnvelope(binding, password);
    expect(parseSecretEnvelope(envelope, binding)).toBe(password);
    expect(() =>
      parseSecretEnvelope(Buffer.concat([envelope, Buffer.from([0])]), binding)
    ).toThrowError(FAILURE_CODES.secret);
    expect(() => parseSecretEnvelope(envelope, "b".repeat(64)))
      .toThrowError(FAILURE_CODES.secret);
    envelope.fill(0);
  });

  it("emits only fixed, explicitly scoped TestOnly evidence", () => {
    const evidence = createEvidence();
    expect(evidence).toEqual({
      ok: true,
      gate: "COMMUNICATION_NOTE_M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED",
      sourceRevisionChildOuterAgreementVerified: true,
      callerProvidedSourceRevisionPinVerified: true,
      sourceManifestValidated: true,
      externallyReviewedSourceRevisionAttested: false,
      sourceRevisionTransitiveClosureAttested: false,
      disposableNoDataTargetVerified: true,
      postgres17Verified: true,
      actualPgPackageVersion: "8.23.0",
      actualPgClientInjected: true,
      clientPinnedCaVerified: true,
      terminalState: "ACCEPTED",
      runtimeBrokerTeardownVerified: true,
      exactRuntimePidDrainVerified: true,
      runtimeBrokerApiPrivilegeAbsenceVerified: true,
      branchDeletionVerifiedByChild: false,
      callerMustDeleteBranchAfterRun: true,
      abortPathLiveTested: false,
      timeoutPathLiveTested: false,
      managementCredentialClass:
        "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      staticSourceCredential: true,
      sourceCredentialSingleUse: false,
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
      secretFdSingleRead: true,
      managementDeliveryEnvelopeOneUse: true,
      managementDeliveryLifetimeMaximumMs: 60_000,
      underlyingCredentialShortLived: false,
      underlyingCredentialExpiryAttested: false,
      kmsOrVaultAttested: false,
      processMemoryZeroizationAttested: false,
      serverSslEnforcementAttested: false,
      rawCredentialMaterialInEvidence: false,
      rawCredentialMaterialInDurableLedger: false,
      rawCredentialMaterialInProcessDuringRun: true,
    });
    expect(JSON.stringify(evidence)).not.toContain("supabase.co");
  });

  if (process.env[ENABLE_ENV] === "1") {
    it(
      "runs the same-revision composition against one disposable PG17 Preview",
      { timeout: 120_000 },
      async () => {
        let status: FixedStatus = FAILURE_CODES.internal;
        try {
          await runHostedLiveGate();
          status = SUCCESS_STATUS;
          writeFixedStatus(status);
        } catch (error) {
          status = safeFailureCode(error);
          writeFixedStatus(status);
          throw new HostedLiveError(status);
        }
      },
    );
  }
});

async function runHostedLiveGate() {
  assertLiveEnvironment();
  const configBytes = readBoundedInheritedFd(
    CONFIG_FD,
    CONFIG_MAXIMUM_BYTES,
    FAILURE_CODES.config,
  );
  const caBytes = readBoundedInheritedFd(
    CA_FD,
    CA_MAXIMUM_BYTES,
    FAILURE_CODES.ca,
  );
  const secretBytes = readBoundedInheritedFd(
    SECRET_FD,
    SECRET_MAXIMUM_BYTES,
    FAILURE_CODES.secret,
  );
  let managementPassword: string | undefined;
  let hmacKey: Buffer | undefined;
  try {
    const config = parseHostedConfig(configBytes, Date.now());
    const tlsRootCertificate = validateCaBytes(
      caBytes,
      config.tlsRootCertificateSha256,
    );
    managementPassword = parseSecretEnvelope(
      secretBytes,
      config.secretEnvelopeBindingSha256,
    );
    const PgClient = await loadPgClientConstructor();
    const setup = await setupSyntheticChain(
      config,
      tlsRootCertificate,
      managementPassword,
      PgClient,
    );
    const clock = createTrustedClock(setup.databaseNow);
    const deliveryClock = createHostDeliveryClock();
    hmacKey = randomBytes(32);
    const targetResolver = createTargetResolver(
      config,
      tlsRootCertificate,
      hmacKey,
      clock,
    );
    const custodyResolver = createCustodyResolver(
      setup.fixture,
      config.target.expiresAt,
      clock,
    );
    let deliveryCount = 0;
    const managementCredentialTransport = Object.freeze({
      async consume(
        request: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
        context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
        consumer: (credential: unknown) => PromiseLike<void>,
      ) {
        if (
          context.signal.aborted ||
          request.purpose !==
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE ||
          !SHA256_PATTERN.test(request.targetDescriptorSha256) ||
          request.tlsRootCertificateSha256 !==
            config.tlsRootCertificateSha256 ||
          request.user !== config.managementUser ||
          request.applicationName !==
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME ||
          request.credentialClass !==
            "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
          request.sourceExpiresAt !== null ||
          request.sourceRevocation !==
            "BRANCH_DELETE_OR_PASSWORD_RESET" ||
          request.maximumDeliveryLifetimeMs !== 60_000 ||
          request.deliveryExpiresNoLaterThan !== config.target.expiresAt ||
          typeof managementPassword !== "string"
        ) {
          fail(FAILURE_CODES.composition);
        }
        const deliveryIssuedAt = deliveryClock.now();
        const deliveryExpiresAt = new Date(
          Math.min(
            Date.parse(deliveryIssuedAt) + 30_000,
            Date.parse(request.deliveryExpiresNoLaterThan),
          ),
        ).toISOString();
        if (deliveryExpiresAt <= deliveryIssuedAt) {
          fail(FAILURE_CODES.composition);
        }
        deliveryCount += 1;
        await consumer(Object.freeze({
          targetDescriptorSha256: request.targetDescriptorSha256,
          tlsRootCertificateSha256: request.tlsRootCertificateSha256,
          user: request.user,
          applicationName: request.applicationName,
          credentialClass: request.credentialClass,
          sourceExpiresAt: request.sourceExpiresAt,
          sourceRevocation: request.sourceRevocation,
          password: managementPassword,
          deliveryIssuedAt,
          deliveryExpiresAt,
          deliveryOneUse: true as const,
          rawDsnPresent: false as const,
        }));
      },
    });
    let bundle;
    try {
      bundle =
        await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
          {
            capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTERS",
            targetResolver,
            targetRequest: Object.freeze({
              targetProjectRef: config.target.targetProjectRef,
              tlsRootCertificateSha256:
                config.tlsRootCertificateSha256,
            }),
            verifiedAuthorization: setup.fixture.verifiedAuthorization,
            custodyResolver,
            managementCredentialTransport,
            ManagementClient: PgClient,
            Client: PgClient,
            clock,
            entropy: Object.freeze({
              bytes(length: number) {
                if (!Number.isSafeInteger(length) || length <= 0) {
                  fail(FAILURE_CODES.composition);
                }
                return Uint8Array.from(randomBytes(length));
              },
            }),
          },
          Object.freeze({ signal: new AbortController().signal }),
        );
    } catch {
      fail(FAILURE_CODES.composition);
    } finally {
      hmacKey.fill(0);
      hmacKey = undefined;
    }
    let result;
    try {
      result = await bundle.runtimePort.persist(setup.envelope);
    } catch {
      fail(FAILURE_CODES.persist);
    }
    if (
      result.created !== true ||
      result.state !== "ACCEPTED" ||
      result.continuationEligible !== true ||
      result.status !== "RUNNER_TERMINAL_RECORDED" ||
      deliveryCount !== 5
    ) {
      fail(FAILURE_CODES.persist);
    }
    await runIndependentPostcheck(
      config,
      tlsRootCertificate,
      managementPassword,
      PgClient,
    );
    expect(createEvidence()).toMatchObject({
      ok: true,
      terminalState: "ACCEPTED",
      runtimeBrokerTeardownVerified: true,
      abortPathLiveTested: false,
      underlyingCredentialShortLived: false,
    });
  } finally {
    configBytes.fill(0);
    caBytes.fill(0);
    secretBytes.fill(0);
    hmacKey?.fill(0);
    managementPassword = undefined;
  }
}

function assertLiveEnvironment() {
  const forbiddenExact = new Set([
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_ACCESS_TOKEN",
    "NODE_OPTIONS",
    "NODE_PATH",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]);
  if (
    process.env[ENABLE_ENV] !== "1" ||
    process.env[CONFIG_FD_ENV] !== String(CONFIG_FD) ||
    process.env[CA_FD_ENV] !== String(CA_FD) ||
    process.env[SECRET_FD_ENV] !== String(SECRET_FD) ||
    process.env[STATUS_FD_ENV] !== String(STATUS_FD) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    Object.keys(process.env).some(
      (key) => /^PG[A-Z0-9_]*$/.test(key) || forbiddenExact.has(key),
    )
  ) {
    fail(FAILURE_CODES.config);
  }
}

async function loadPgClientConstructor(): Promise<ApprovedPgClientConstructor> {
  try {
    const driver = resolvePgDriver();
    const driverValue: unknown = await import(driver.entryUrl);
    if (
      !driverValue ||
      typeof driverValue !== "object" ||
      nodeTypes.isProxy(driverValue)
    ) {
      fail(FAILURE_CODES.driver);
    }
    const driverRecord = driverValue as Record<string, unknown>;
    const defaultExport = driverRecord.default;
    const candidate = driverRecord.Client ?? (
      defaultExport &&
        typeof defaultExport === "object" &&
        !nodeTypes.isProxy(defaultExport)
        ? (defaultExport as Record<string, unknown>).Client
        : undefined
    );
    if (
      typeof candidate !== "function" ||
      nodeTypes.isProxy(candidate) ||
      !candidate.prototype ||
      typeof candidate.prototype !== "object" ||
      nodeTypes.isProxy(candidate.prototype) ||
      typeof candidate.prototype.connect !== "function" ||
      typeof candidate.prototype.query !== "function" ||
      typeof candidate.prototype.end !== "function" ||
      typeof candidate.prototype.on !== "function"
    ) {
      fail(FAILURE_CODES.driver);
    }
    return candidate as ApprovedPgClientConstructor;
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.driver);
  }
}

function resolvePgDriver() {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("pg/package.json");
    const packageRoot = dirname(packagePath);
    const packageValue: unknown = require(packagePath);
    const entryPath = require.resolve("pg");
    if (
      !packageValue ||
      typeof packageValue !== "object" ||
      nodeTypes.isProxy(packageValue) ||
      (packageValue as Record<string, unknown>).version !==
        EXPECTED_PG_PACKAGE_VERSION ||
      (entryPath !== packageRoot && !entryPath.startsWith(`${packageRoot}${sep}`))
    ) {
      fail(FAILURE_CODES.driver);
    }
    return Object.freeze({
      entryUrl: pathToFileURL(entryPath).href,
      version: EXPECTED_PG_PACKAGE_VERSION,
    });
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.driver);
  }
}

function readBoundedInheritedFd(
  fd: number,
  maximumBytes: number,
  code: FailureCode,
) {
  const storage = Buffer.alloc(maximumBytes + 1);
  let offset = 0;
  try {
    while (offset < storage.length) {
      const count = readSync(
        fd,
        storage,
        offset,
        storage.length - offset,
        null,
      );
      if (count === 0) break;
      offset += count;
    }
    if (offset === 0 || offset > maximumBytes) fail(code);
    return Buffer.from(storage.subarray(0, offset));
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(code);
  } finally {
    storage.fill(0);
    try {
      closeSync(fd);
    } catch {
      fail(code);
    }
  }
}

function parseHostedConfig(value: Buffer, now: number): HostedConfig {
  try {
    if (
      value.length === 0 ||
      value.length > CONFIG_MAXIMUM_BYTES ||
      value.includes(0)
    ) {
      fail(FAILURE_CODES.config);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    const parsed: unknown = JSON.parse(text);
    if (JSON.stringify(parsed) !== text) fail(FAILURE_CODES.config);
    const root = exactDataRecord(parsed, [
      "schemaVersion",
      "sourceRevisionSha256",
      "target",
      "tlsRootCertificateSha256",
      "managementUser",
      "credentialClass",
      "sourceExpiresAt",
      "sourceRevocation",
      "deliveryIssuedAt",
      "deliveryExpiresAt",
      "secretEnvelopeBindingSha256",
      "rawDsnPresent",
    ]);
    const target = exactDataRecord(root.target, [
      "source",
      "targetProjectRef",
      "parentProjectRef",
      "defaultBranch",
      "persistent",
      "withData",
      "postgresMajor",
      "projectStatus",
      "observedAt",
      "expiresAt",
      "controlPlaneEvidenceSha256",
      "endpoint",
    ]);
    const targetProjectRef = requireProjectRef(target.targetProjectRef);
    const endpoint = validateEndpoint(target.endpoint, targetProjectRef);
    const observedAt = requireTimestamp(target.observedAt);
    const expiresAt = requireTimestamp(target.expiresAt);
    const deliveryIssuedAt = requireTimestamp(root.deliveryIssuedAt);
    const deliveryExpiresAt = requireTimestamp(root.deliveryExpiresAt);
    const sourceRevisionSha256 = requireSha256(
      root.sourceRevisionSha256,
    );
    const tlsRootCertificateSha256 = requireSha256(
      root.tlsRootCertificateSha256,
    );
    if (
      root.schemaVersion !== CONFIG_SCHEMA_VERSION ||
      sourceRevisionSha256 !== computeSourceRevisionSha256() ||
      target.source !== "SUPABASE_CONTROL_PLANE" ||
      targetProjectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
      target.parentProjectRef !== CARESLINK_PRODUCTION_SUPABASE_REF ||
      target.defaultBranch !== false ||
      target.persistent !== false ||
      target.withData !== false ||
      target.postgresMajor !== 17 ||
      target.projectStatus !== "ACTIVE_HEALTHY" ||
      root.managementUser !== deriveManagementUser(
        endpoint,
        targetProjectRef,
      ) ||
      root.credentialClass !==
        "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
      root.sourceExpiresAt !== null ||
      root.sourceRevocation !== "BRANCH_DELETE_OR_PASSWORD_RESET" ||
      root.rawDsnPresent !== false
    ) {
      fail(FAILURE_CODES.config);
    }
    const observedAtMs = Date.parse(observedAt);
    const expiresAtMs = Date.parse(expiresAt);
    const deliveryIssuedAtMs = Date.parse(deliveryIssuedAt);
    const deliveryExpiresAtMs = Date.parse(deliveryExpiresAt);
    if (
      observedAtMs > now ||
      now - observedAtMs > 5 * 60_000 ||
      expiresAtMs <= now ||
      expiresAtMs - now > 5 * 60_000 ||
      expiresAtMs <= observedAtMs ||
      deliveryIssuedAtMs > now ||
      now - deliveryIssuedAtMs > 30_000 ||
      deliveryExpiresAtMs <= now ||
      deliveryExpiresAtMs > expiresAtMs ||
      deliveryExpiresAtMs <= deliveryIssuedAtMs ||
      deliveryExpiresAtMs - deliveryIssuedAtMs > 60_000
    ) {
      fail(FAILURE_CODES.config);
    }
    const normalized = Object.freeze({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      sourceRevisionSha256,
      target: Object.freeze({
        source: "SUPABASE_CONTROL_PLANE" as const,
        targetProjectRef,
        parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
        defaultBranch: false as const,
        persistent: false as const,
        withData: false as const,
        postgresMajor: 17 as const,
        projectStatus: "ACTIVE_HEALTHY" as const,
        observedAt,
        expiresAt,
        controlPlaneEvidenceSha256: requireSha256(
          target.controlPlaneEvidenceSha256,
        ),
        endpoint,
      }),
      tlsRootCertificateSha256,
      managementUser: root.managementUser as string,
      credentialClass:
        "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
      deliveryIssuedAt,
      deliveryExpiresAt,
      secretEnvelopeBindingSha256: requireSha256(
        root.secretEnvelopeBindingSha256,
      ),
      rawDsnPresent: false as const,
    });
    if (
      normalized.secretEnvelopeBindingSha256 !==
      computeSecretEnvelopeBinding(normalized)
    ) {
      fail(FAILURE_CODES.config);
    }
    return normalized;
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.config);
  }
}

function validateEndpoint(value: unknown, targetProjectRef: string) {
  const endpoint = exactDataRecord(value, [
    "connectionMode",
    "hostname",
    "port",
    "database",
    "usernameProjectRefSuffix",
  ]);
  if (
    typeof endpoint.hostname !== "string" ||
    endpoint.hostname !== endpoint.hostname.toLowerCase() ||
    endpoint.port !== 5432 ||
    endpoint.database !== "postgres"
  ) {
    fail(FAILURE_CODES.config);
  }
  if (
    endpoint.connectionMode === "DIRECT" &&
    endpoint.hostname === `db.${targetProjectRef}.supabase.co` &&
    endpoint.usernameProjectRefSuffix === null
  ) {
    return Object.freeze({
      connectionMode: "DIRECT" as const,
      hostname: endpoint.hostname,
      port: 5432 as const,
      database: "postgres" as const,
      usernameProjectRefSuffix: null,
    });
  }
  if (
    endpoint.connectionMode === "SUPAVISOR_SESSION" &&
    SESSION_POOLER_HOST_PATTERN.test(endpoint.hostname) &&
    endpoint.usernameProjectRefSuffix === targetProjectRef
  ) {
    return Object.freeze({
      connectionMode: "SUPAVISOR_SESSION" as const,
      hostname: endpoint.hostname,
      port: 5432 as const,
      database: "postgres" as const,
      usernameProjectRefSuffix: targetProjectRef,
    });
  }
  fail(FAILURE_CODES.config);
}

function computeSourceRevisionSha256() {
  const digest = createHash("sha256");
  try {
    const sourceManifest = readSourceManifest();
    digest.update(SOURCE_MANIFEST_RELATIVE_PATH, "utf8");
    digest.update("\u0000", "utf8");
    digest.update(sourceManifest.bytes);
    digest.update("\u0000", "utf8");
    for (const relativePath of sourceManifest.paths) {
      digest.update(relativePath, "utf8");
      digest.update("\u0000", "utf8");
      digest.update(readFileSync(resolve(APP_ROOT, relativePath)));
      digest.update("\u0000", "utf8");
    }
    return digest.digest("hex");
  } catch {
    fail(FAILURE_CODES.config);
  }
}

function readSourceManifest() {
  try {
    const manifestPath = resolve(APP_ROOT, SOURCE_MANIFEST_RELATIVE_PATH);
    if (!lstatSync(manifestPath).isFile()) fail(FAILURE_CODES.config);
    const bytes = readFileSync(manifestPath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    const root = exactDataRecord(parsed, ["schemaVersion", "paths"]);
    if (
      root.schemaVersion !== SOURCE_MANIFEST_SCHEMA_VERSION ||
      !Array.isArray(root.paths) ||
      root.paths.length === 0 ||
      `${JSON.stringify(parsed, null, 2)}\n` !== text
    ) {
      fail(FAILURE_CODES.config);
    }
    const paths = [...root.paths];
    if (
      paths.some((relativePath) =>
        typeof relativePath !== "string" ||
        relativePath.length === 0 ||
        relativePath.startsWith("/") ||
        relativePath.includes("\\") ||
        CONTROL_CHARACTER_PATTERN.test(relativePath) ||
        relativePath.split("/").some(
          (segment) => segment.length === 0 || segment === "." || segment === "..",
        )
      ) ||
      new Set(paths).size !== paths.length ||
      JSON.stringify(paths) !== JSON.stringify([...paths].sort())
    ) {
      fail(FAILURE_CODES.config);
    }
    const normalizedPaths = paths as string[];
    const migrationPaths = normalizedPaths.filter((relativePath) =>
      /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(relativePath)
    );
    const migrationEntries = readdirSync(
      resolve(APP_ROOT, "supabase/migrations"),
      { withFileTypes: true },
    ).filter((entry) => entry.name.endsWith(".sql"));
    if (migrationEntries.some((entry) => !entry.isFile())) {
      fail(FAILURE_CODES.config);
    }
    const actualMigrationPaths = migrationEntries
      .map((entry) => `supabase/migrations/${entry.name}`)
      .sort();
    if (
      migrationPaths.length !== 40 ||
      JSON.stringify(migrationPaths) !== JSON.stringify(actualMigrationPaths)
    ) {
      fail(FAILURE_CODES.config);
    }
    for (const relativePath of normalizedPaths) {
      if (!lstatSync(resolve(APP_ROOT, relativePath)).isFile()) {
        fail(FAILURE_CODES.config);
      }
    }
    return Object.freeze({
      bytes,
      paths: Object.freeze(normalizedPaths),
    });
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.config);
  }
}

function computeSecretEnvelopeBinding(
  config: Pick<
    HostedConfig,
    | "sourceRevisionSha256"
    | "target"
    | "tlsRootCertificateSha256"
    | "managementUser"
    | "deliveryIssuedAt"
    | "deliveryExpiresAt"
  >,
) {
  return createHash("sha256")
    .update([
      SOURCE_REVISION_DOMAIN,
      config.sourceRevisionSha256,
      config.target.targetProjectRef,
      config.target.controlPlaneEvidenceSha256,
      config.target.endpoint.connectionMode,
      config.target.endpoint.hostname,
      "5432",
      "postgres",
      config.target.endpoint.usernameProjectRefSuffix ?? "-",
      config.tlsRootCertificateSha256,
      config.managementUser,
      config.deliveryIssuedAt,
      config.deliveryExpiresAt,
    ].join("\n"), "utf8")
    .digest("hex");
}

function parseSecretEnvelope(value: Buffer, expectedBindingSha256: string) {
  try {
    const headerBytes = SECRET_MAGIC.length + 1 + 32 + 2;
    if (
      value.length < headerBytes + 16 ||
      value.length > SECRET_MAXIMUM_BYTES ||
      !value.subarray(0, SECRET_MAGIC.length).equals(SECRET_MAGIC) ||
      value[SECRET_MAGIC.length] !== SECRET_VERSION
    ) {
      fail(FAILURE_CODES.secret);
    }
    const bindingStart = SECRET_MAGIC.length + 1;
    const bindingEnd = bindingStart + 32;
    const expectedBinding = Buffer.from(
      requireSha256(expectedBindingSha256, FAILURE_CODES.secret),
      "hex",
    );
    if (
      !timingSafeEqual(
        value.subarray(bindingStart, bindingEnd),
        expectedBinding,
      )
    ) {
      fail(FAILURE_CODES.secret);
    }
    const passwordLength = value.readUInt16BE(bindingEnd);
    const passwordStart = bindingEnd + 2;
    if (
      passwordLength < 16 ||
      passwordLength > 1_024 ||
      value.length !== passwordStart + passwordLength
    ) {
      fail(FAILURE_CODES.secret);
    }
    const password = new TextDecoder("utf-8", { fatal: true }).decode(
      value.subarray(passwordStart),
    );
    if (
      password.length < 16 ||
      password.length > 1_024 ||
      CONTROL_CHARACTER_PATTERN.test(password) ||
      /^postgres(?:ql)?:\/\//i.test(password)
    ) {
      fail(FAILURE_CODES.secret);
    }
    return password;
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.secret);
  }
}

function validateCaBytes(value: Buffer, expectedSha256: string) {
  try {
    if (
      value.length === 0 ||
      value.length > CA_MAXIMUM_BYTES ||
      sha256(value) !== expectedSha256
    ) {
      fail(FAILURE_CODES.ca);
    }
    const pem = new TextDecoder("utf-8", { fatal: true }).decode(value);
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(pem)) {
      fail(FAILURE_CODES.ca);
    }
    const certificates = pem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    );
    if (
      !certificates ||
      certificates.length === 0 ||
      !certificates.some((certificate) => new X509Certificate(certificate).ca)
    ) {
      fail(FAILURE_CODES.ca);
    }
    return Buffer.from(value);
  } catch (error) {
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.ca);
  }
}

async function setupSyntheticChain(
  config: HostedConfig,
  ca: Buffer,
  password: string,
  PgClient: ApprovedPgClientConstructor,
) {
  const client = await connectAdmin(
    config,
    ca,
    password,
    SETUP_APPLICATION_NAME,
    FAILURE_CODES.setup,
    PgClient,
  );
  let transactionOpen = false;
  try {
    const databaseNow = parseDatabaseClock(
      await client.query(DATABASE_CLOCK_SQL),
    );
    const fixture = createM1ghRunnerTerminalTrustFixture({
      now: databaseNow,
    });
    const dummyRuntimeRole =
      `careslink_v1_preview_runner_terminal_runtime_${randomBytes(8).toString("hex")}`;
    if (!RUNTIME_ROLE_PATTERN.test(dummyRuntimeRole)) {
      fail(FAILURE_CODES.setup);
    }
    const setupSql = readFileSync(
      resolve(
        APP_ROOT,
        "scripts/preview-e2e/communication-note-preview-runner-terminal-valid-chain-setup.sql",
      ),
      "utf8",
    );
    await client.query("begin");
    transactionOpen = true;
    await setLocalConfig(
      client,
      "careslink.runner_terminal_valid.runtime_role",
      dummyRuntimeRole,
    );
    await setLocalConfig(
      client,
      "careslink.runner_terminal_valid.expected_pg_major",
      "17",
    );
    await setLocalConfig(
      client,
      "careslink.runner_terminal_valid.authorization_statement",
      JSON.stringify(fixture.authorizationStatement),
    );
    await setLocalConfig(
      client,
      "careslink.runner_terminal_valid.authorization_signature",
      fixture.authorizationSignature,
    );
    await client.query(
      `create role ${dummyRuntimeRole}
        login noinherit nosuperuser nocreatedb nocreaterole
        noreplication nobypassrls connection limit 1`,
    );
    await client.query(
      `grant careslink_v1_preview_runner_terminal_caller
        to ${dummyRuntimeRole}
        with admin false, inherit false, set true
        granted by current_user`,
    );
    await client.query(setupSql);
    await client.query(
      `revoke careslink_v1_preview_runner_terminal_caller
        from ${dummyRuntimeRole} granted by current_user`,
    );
    await client.query(`drop role ${dummyRuntimeRole}`);
    await client.query("commit");
    transactionOpen = false;
    const catalog = parseChainCatalog(
      await client.query(CHAIN_CATALOG_SQL, [
        fixture.verifiedAuthorization.authorizationDigest,
      ]),
      fixture,
    );
    if (catalog.databaseNow < databaseNow) {
      fail(FAILURE_CODES.setup);
    }
    const envelope = createM1giAcceptedRunnerTerminalEnvelope(fixture, {
      claimId: catalog.claimId,
      reservationId: catalog.reservationId,
      receiptDigest: catalog.receiptDigest,
      slotIndex: 0,
      fixtureId: "communication.en.phone-duration.v1",
      runOrdinal: 1,
      observedAt: catalog.databaseNow,
      requestBodySha256: catalog.requestBodySha256,
      requestBodyUtf8ByteLength: 2522,
      semanticCanonicalRequestSha256:
        catalog.semanticCanonicalRequestSha256,
      receiptSignatureSha256: catalog.receiptSignatureSha256,
      receiptUsage: catalog.receiptUsage,
      calculatedCostUpperBoundMicroUsd: 481,
    });
    await closeAdmin(client, FAILURE_CODES.cleanup);
    return Object.freeze({
      databaseNow: catalog.databaseNow,
      fixture,
      envelope,
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("rollback").catch(() => undefined);
    }
    await closeAdmin(client, FAILURE_CODES.cleanup).catch(() => undefined);
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.setup);
  }
}

function parseDatabaseClock(result: unknown) {
  const row = singleRow(result, FAILURE_CODES.setup);
  if (
    row.current_user !== "postgres" ||
    row.session_user !== "postgres" ||
    row.database_name !== "postgres" ||
    Number(row.postgres_major) !== 17
  ) {
    fail(FAILURE_CODES.setup);
  }
  return requireTimestamp(row.database_now, FAILURE_CODES.setup);
}

function parseChainCatalog(result: unknown, fixture: HostedFixture) {
  const row = singleRow(result, FAILURE_CODES.setup);
  if (
    row.authorization_digest !==
      fixture.verifiedAuthorization.authorizationDigest ||
    row.run_id_hash !== fixture.authorizationStatement.runIdHash ||
    typeof row.claim_id !== "string" ||
    !UUID_PATTERN.test(row.claim_id) ||
    typeof row.reservation_id !== "string" ||
    !UUID_PATTERN.test(row.reservation_id) ||
    row.slot_index !== 0 ||
    row.fixture_id !== "communication.en.phone-duration.v1" ||
    row.run_ordinal !== 1 ||
    row.request_body_utf8_byte_length !== 2522 ||
    row.calculated_cost_upper_bound_micro_usd !== 481
  ) {
    fail(FAILURE_CODES.setup);
  }
  const receiptUsage = exactDataRecord(
    row.receipt_usage,
    [
      "source",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "cachedInputTokens",
      "reasoningTokens",
    ],
    FAILURE_CODES.setup,
  );
  if (
    receiptUsage.source !== "PROVIDER" ||
    receiptUsage.inputTokens !== 120 ||
    receiptUsage.outputTokens !== 80 ||
    receiptUsage.totalTokens !== 200 ||
    receiptUsage.cachedInputTokens !== 20 ||
    receiptUsage.reasoningTokens !== 10
  ) {
    fail(FAILURE_CODES.setup);
  }
  return Object.freeze({
    databaseNow: requireTimestamp(row.database_now, FAILURE_CODES.setup),
    claimId: row.claim_id,
    reservationId: row.reservation_id,
    receiptDigest: requireSha256(row.receipt_digest, FAILURE_CODES.setup),
    requestBodySha256: requireSha256(
      row.request_body_sha256,
      FAILURE_CODES.setup,
    ),
    semanticCanonicalRequestSha256: requireSha256(
      row.semantic_canonical_request_sha256,
      FAILURE_CODES.setup,
    ),
    receiptSignatureSha256: requireSha256(
      row.receipt_signature_sha256,
      FAILURE_CODES.setup,
    ),
    receiptUsage: Object.freeze({
      source: "PROVIDER" as const,
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 20,
      reasoningTokens: 10,
    }),
  });
}

function createTargetResolver(
  config: HostedConfig,
  ca: Buffer,
  hmacKey: Buffer,
  clock: Readonly<{ now: () => string }>,
) {
  const keyReferenceSha256 = createHash("sha256")
    .update("CARESLINK_M1N_EPHEMERAL_HMAC_KEY_REFERENCE\u0000", "utf8")
    .update(hmacKey)
    .digest("hex");
  return createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver({
    capability: "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER",
    controlPlaneObservationPort: Object.freeze({
      async observe(
        request: Readonly<{
          source: "SUPABASE_CONTROL_PLANE";
          targetProjectRef: string;
        }>,
        context: Readonly<{ signal: AbortSignal }>,
      ) {
        if (
          context.signal.aborted ||
          request.source !== "SUPABASE_CONTROL_PLANE" ||
          request.targetProjectRef !== config.target.targetProjectRef
        ) {
          fail(FAILURE_CODES.target);
        }
        return Object.freeze({
          source: "SUPABASE_CONTROL_PLANE" as const,
          targetProjectRef: config.target.targetProjectRef,
          parentProjectRef: config.target.parentProjectRef,
          defaultBranch: false as const,
          persistent: false as const,
          withData: false as const,
          postgresMajor: 17 as const,
          projectStatus: "ACTIVE_HEALTHY" as const,
          observedAt: config.target.observedAt,
          expiresAt: config.target.expiresAt,
          controlPlaneEvidenceSha256:
            config.target.controlPlaneEvidenceSha256,
          tlsRootCertificateSha256:
            config.tlsRootCertificateSha256,
          endpoint: config.target.endpoint,
          rawCredentialMaterialPresent: false as const,
        });
      },
    }),
    projectRefHmacPort: Object.freeze({
      async hmac(
        request: Readonly<{
          purpose: "SUPABASE_PROJECT_REF_BINDING";
          projectRef: string;
        }>,
        context: Readonly<{ signal: AbortSignal }>,
      ) {
        if (
          context.signal.aborted ||
          request.purpose !== "SUPABASE_PROJECT_REF_BINDING" ||
          !PROJECT_REF_PATTERN.test(request.projectRef)
        ) {
          fail(FAILURE_CODES.target);
        }
        return Object.freeze({
          projectRefHmac: createHmac("sha256", hmacKey)
            .update(
              `CARESLINK_M1N_PROJECT_REF_BINDING_V1\u0000${request.projectRef}`,
              "utf8",
            )
            .digest("hex"),
          keyReferenceSha256,
          rawKeyMaterialPresent: false as const,
        });
      },
    }),
    pinnedCaLoader: Object.freeze({
      async load(
        request: Readonly<{ tlsRootCertificateSha256: string }>,
        context: Readonly<{ signal: AbortSignal }>,
      ) {
        if (
          context.signal.aborted ||
          request.tlsRootCertificateSha256 !==
            config.tlsRootCertificateSha256
        ) {
          fail(FAILURE_CODES.target);
        }
        return Object.freeze({
          tlsRootCertificate: Uint8Array.from(ca),
          rawCredentialMaterialPresent: false as const,
        });
      },
    }),
    clock,
  });
}

function createCustodyResolver(
  fixture: HostedFixture,
  targetExpiresAt: string,
  clock: Readonly<{ now: () => string }>,
) {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver({
    capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
    async resolve(
      request: unknown,
      context: Readonly<{ signal: AbortSignal }>,
    ) {
      const requestRecord = exactDataRecord(
        request,
        [
          "version",
          "policyDigest",
          "purpose",
          "custodyPolicyDigest",
          "terminalPolicyDigest",
          "authorizationDigest",
          "runIdHash",
          "authorizationExpiresAt",
          "databaseTargetDigest",
          "observedAt",
          "rawCredentialMaterialPresent",
          "privateKeyMaterialPresent",
          "requestDigest",
        ],
        FAILURE_CODES.composition,
      );
      if (context.signal.aborted) fail(FAILURE_CODES.composition);
      const observedAt = requireTimestamp(
        requestRecord.observedAt,
        FAILURE_CODES.composition,
      );
      const now = clock.now();
      const expiresAt = new Date(
        Math.min(
          Date.parse(observedAt) + 4 * 60_000,
          Date.parse(targetExpiresAt),
          Date.parse(fixture.authorizationStatement.expiresAt),
        ),
      ).toISOString();
      if (observedAt > now || expiresAt <= now) {
        fail(FAILURE_CODES.composition);
      }
      return Object.freeze({
        status: "RESOLVED_CUSTODY_NOT_APPROVED" as const,
        requestDigest: requestRecord.requestDigest,
        observedAt,
        expiresAt,
        authenticatedDeliveryEvidenceSha256: sha256(
          Buffer.from("M1N_TEST_ONLY_AUTHENTICATED_DELIVERY", "utf8"),
        ),
        completeRevocationEvidenceSha256: sha256(
          Buffer.from("M1N_TEST_ONLY_COMPLETE_REVOCATION", "utf8"),
        ),
        registryCandidate: Object.freeze({
          capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY" as const,
          ...fixture.registryCore,
          registrySnapshotSha256:
            createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
              fixture.registryCore,
            ),
        }),
        custodySnapshot: fixture.custodySnapshot,
        rawCredentialMaterialPresent: false as const,
        privateKeyMaterialPresent: false as const,
      });
    },
  });
}

async function runIndependentPostcheck(
  config: HostedConfig,
  ca: Buffer,
  password: string,
  PgClient: ApprovedPgClientConstructor,
) {
  const client = await connectAdmin(
    config,
    ca,
    password,
    POSTCHECK_APPLICATION_NAME,
    FAILURE_CODES.postcheck,
    PgClient,
  );
  try {
    const row = singleRow(
      await client.query(POSTCHECK_SQL),
      FAILURE_CODES.postcheck,
    );
    if (
      JSON.stringify(row.ledger_counts) !== "[1,0,1,1,1,1]" ||
      Number(row.acquisition_count) !== 1 ||
      Number(row.revoked_acquisition_count) !== 1 ||
      Number(row.exact_pid_drained_count) !== 1 ||
      Number(row.runtime_role_count) !== 0 ||
      Number(row.runtime_session_count) !== 0 ||
      Number(row.runtime_membership_count) !== 0 ||
      Number(row.api_privilege_count) !== 0
    ) {
      fail(FAILURE_CODES.postcheck);
    }
    await closeAdmin(client, FAILURE_CODES.cleanup);
  } catch (error) {
    await closeAdmin(client, FAILURE_CODES.cleanup).catch(() => undefined);
    if (error instanceof HostedLiveError) throw error;
    fail(FAILURE_CODES.postcheck);
  }
}

async function connectAdmin(
  config: HostedConfig,
  ca: Buffer,
  password: string,
  applicationName: string,
  code: FailureCode,
  PgClient: ApprovedPgClientConstructor,
) {
  let client: HostedPgClient | undefined;
  try {
    client = new PgClient({
      host: config.target.endpoint.hostname,
      port: 5432,
      database: "postgres",
      user: config.managementUser,
      password,
      application_name: applicationName,
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
      statement_timeout: 12_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 12_000,
      options: "-c row_security=on",
      client_encoding: "UTF8",
      sslnegotiation: "postgres",
      ssl: Object.freeze({
        ca: Buffer.from(ca),
        rejectUnauthorized: true as const,
      }),
    });
    client.on("error", () => undefined);
    await client.connect();
    requireVerifiedTls(client, code);
    clearKnownClientPasswordReferences(client);
    return client;
  } catch {
    if (client) {
      clearKnownClientPasswordReferences(client);
      hardDestroyClientStream(client);
      await endAdminWithinTimeout(client);
    }
    fail(code);
  }
}

async function closeAdmin(client: HostedPgClient, code: FailureCode) {
  clearKnownClientPasswordReferences(client);
  if (!(await endAdminWithinTimeout(client))) fail(code);
}

async function endAdminWithinTimeout(client: HostedPgClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(FAILURE_CODES.cleanup)),
        ADMIN_CLOSE_TIMEOUT_MS,
      );
      timer.unref?.();
    });
    await Promise.race([
      Promise.resolve().then(() => client.end()),
      timeout,
    ]);
    return true;
  } catch {
    hardDestroyClientStream(client);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hardDestroyClientStream(client: HostedPgClient) {
  try {
    client.connection?.stream?.destroy?.();
  } catch {
    // Best-effort hard close; the caller still emits a fixed failure code.
  }
}

function requireVerifiedTls(client: HostedPgClient, code: FailureCode) {
  const stream = client.connection?.stream;
  if (
    stream?.encrypted !== true ||
    stream.authorized !== true ||
    stream.authorizationError != null ||
    typeof stream.destroy !== "function"
  ) {
    fail(code);
  }
}

function clearKnownClientPasswordReferences(client: HostedPgClient) {
  try {
    client.password = null;
  } catch {
    // This gate does not claim full process-memory zeroization.
  }
  try {
    if (client.connectionParameters) {
      client.connectionParameters.password = null;
    }
  } catch {
    // This gate does not claim full process-memory zeroization.
  }
}

async function setLocalConfig(
  client: HostedPgClient,
  key: string,
  value: string,
) {
  await client.query(
    "select pg_catalog.set_config($1::pg_catalog.text, $2::pg_catalog.text, true)",
    [key, value],
  );
}

function createTrustedClock(databaseNow: string) {
  const initialWallClock = Date.parse(
    requireTimestamp(databaseNow, FAILURE_CODES.setup),
  );
  const initialMonotonic = performance.now();
  let last = initialWallClock;
  return Object.freeze({
    now() {
      const next = Math.max(
        Date.now(),
        initialWallClock + Math.max(0, performance.now() - initialMonotonic),
        last,
      );
      last = next;
      return new Date(next).toISOString();
    },
  });
}

function createHostDeliveryClock() {
  const initialWallClock = Date.now();
  const initialMonotonic = performance.now();
  let last = initialWallClock;
  return Object.freeze({
    now() {
      const next = Math.max(
        Date.now(),
        initialWallClock + Math.max(0, performance.now() - initialMonotonic),
        last,
      );
      last = next;
      return new Date(next).toISOString();
    },
  });
}

function deriveManagementUser(
  endpoint: TargetEndpoint,
  projectRef: string,
) {
  return endpoint.connectionMode === "DIRECT"
    ? "postgres"
    : `postgres.${projectRef}`;
}

function singleRow(value: unknown, code: FailureCode) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) {
    fail(code);
  }
  const rows = (value as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length !== 1) fail(code);
  const row = rows[0];
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    nodeTypes.isProxy(row)
  ) {
    fail(code);
  }
  return row as Record<string, unknown>;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  code: FailureCode = FAILURE_CODES.config,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(code);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.getOwnPropertyNames(record).sort();
  if (keys.join("\n") !== [...expectedKeys].sort().join("\n")) {
    fail(code);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail(code);
    }
  }
  return record;
}

function requireProjectRef(value: unknown) {
  if (typeof value !== "string" || !PROJECT_REF_PATTERN.test(value)) {
    fail(FAILURE_CODES.config);
  }
  return value;
}

function requireSha256(
  value: unknown,
  code: FailureCode = FAILURE_CODES.config,
) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(code);
  }
  return value;
}

function requireTimestamp(
  value: unknown,
  code: FailureCode = FAILURE_CODES.config,
) {
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    fail(code);
  }
  return value;
}

function sha256(value: Buffer | Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function createEvidence() {
  return Object.freeze({
    ok: true as const,
    gate: "COMMUNICATION_NOTE_M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED" as const,
    sourceRevisionChildOuterAgreementVerified: true as const,
    callerProvidedSourceRevisionPinVerified: true as const,
    sourceManifestValidated: true as const,
    externallyReviewedSourceRevisionAttested: false as const,
    sourceRevisionTransitiveClosureAttested: false as const,
    disposableNoDataTargetVerified: true as const,
    postgres17Verified: true as const,
    actualPgPackageVersion: EXPECTED_PG_PACKAGE_VERSION,
    actualPgClientInjected: true as const,
    clientPinnedCaVerified: true as const,
    terminalState: "ACCEPTED" as const,
    runtimeBrokerTeardownVerified: true as const,
    exactRuntimePidDrainVerified: true as const,
    runtimeBrokerApiPrivilegeAbsenceVerified: true as const,
    branchDeletionVerifiedByChild: false as const,
    callerMustDeleteBranchAfterRun: true as const,
    abortPathLiveTested: false as const,
    timeoutPathLiveTested: false as const,
    managementCredentialClass:
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
    staticSourceCredential: true as const,
    sourceCredentialSingleUse: false as const,
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
    secretFdSingleRead: true as const,
    managementDeliveryEnvelopeOneUse: true as const,
    managementDeliveryLifetimeMaximumMs: 60_000 as const,
    underlyingCredentialShortLived: false as const,
    underlyingCredentialExpiryAttested: false as const,
    kmsOrVaultAttested: false as const,
    processMemoryZeroizationAttested: false as const,
    serverSslEnforcementAttested: false as const,
    rawCredentialMaterialInEvidence: false as const,
    rawCredentialMaterialInDurableLedger: false as const,
    rawCredentialMaterialInProcessDuringRun: true as const,
  });
}

function writeFixedStatus(status: FixedStatus) {
  const allowed = new Set<FixedStatus>([
    SUCCESS_STATUS,
    ...Object.values(FAILURE_CODES),
  ]);
  if (!allowed.has(status)) status = FAILURE_CODES.internal;
  const output = `${status}\n`;
  if (Buffer.byteLength(output, "utf8") > STATUS_MAXIMUM_BYTES) {
    status = FAILURE_CODES.internal;
  }
  try {
    writeFileSync(STATUS_FD, `${status}\n`, { encoding: "utf8" });
    closeSync(STATUS_FD);
  } catch {
    fail(FAILURE_CODES.internal);
  }
}

function safeFailureCode(value: unknown): FailureCode {
  return value instanceof HostedLiveError &&
      Object.values(FAILURE_CODES).includes(value.code)
    ? value.code
    : FAILURE_CODES.internal;
}

function createUnitConfig(now: number) {
  const sourceRevisionSha256 = computeSourceRevisionSha256();
  const target = Object.freeze({
    source: "SUPABASE_CONTROL_PLANE" as const,
    targetProjectRef: "abcdefghijklmnopqrst",
    parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
    defaultBranch: false as const,
    persistent: false as const,
    withData: false as const,
    postgresMajor: 17 as const,
    projectStatus: "ACTIVE_HEALTHY" as const,
    observedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    controlPlaneEvidenceSha256: "b".repeat(64),
    endpoint: Object.freeze({
      connectionMode: "DIRECT" as const,
      hostname: "db.abcdefghijklmnopqrst.supabase.co",
      port: 5432 as const,
      database: "postgres" as const,
      usernameProjectRefSuffix: null,
    }),
  });
  const core = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sourceRevisionSha256,
    target,
    tlsRootCertificateSha256: "c".repeat(64),
    managementUser: "postgres",
    credentialClass:
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
    deliveryIssuedAt: new Date(now - 500).toISOString(),
    deliveryExpiresAt: new Date(now + 30_000).toISOString(),
    rawDsnPresent: false as const,
  };
  return Object.freeze({
    ...core,
    secretEnvelopeBindingSha256: computeSecretEnvelopeBinding(core),
  });
}

function createUnitSecretEnvelope(bindingSha256: string, password: string) {
  const passwordBytes = Buffer.from(password, "utf8");
  const value = Buffer.alloc(SECRET_MAGIC.length + 1 + 32 + 2 + passwordBytes.length);
  SECRET_MAGIC.copy(value, 0);
  value[SECRET_MAGIC.length] = SECRET_VERSION;
  Buffer.from(bindingSha256, "hex").copy(value, SECRET_MAGIC.length + 1);
  value.writeUInt16BE(passwordBytes.length, SECRET_MAGIC.length + 1 + 32);
  passwordBytes.copy(value, SECRET_MAGIC.length + 1 + 32 + 2);
  passwordBytes.fill(0);
  return value;
}
