import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
  createCaresLinkV1CommunicationNotePreviewActivationPreflight,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight,
} from "./communication-note-preview-activation-preflight.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
} from "./communication-note-preview-evaluation-policy";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY,
} from "./communication-note-preview-evaluation-runner.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
  createCaresLinkV1CommunicationNotePreviewSigningMessage,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization,
  type CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
  type CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
} from "./communication-note-preview-execution-authority.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY,
} from "./communication-note-preview-request-body-pin";
import { CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY } from "./communication-note-provider-policy";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-28T02:00:00.000Z";

describe("Communication Note M1l activation preflight", () => {
  it("literal-pins a source-only policy while preserving all existing readiness and approval latches", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
    ).toBe(
      "preflight.communication.openai.synthetic-preview.2026-09-02.authenticated-current-session.v1",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    ).toBe(
      "1b3ead75f957fdfb75488b65b2a336ea1e203f1b8619687092473b1d2fe1e02b",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY,
    ).toMatchObject({
      status: "SOURCE_CONTRACT_ONLY_NO_ACTIVATION_AUTHORITY",
      capability: "TEST_ONLY_CANDIDATE_VALIDATION",
      activationReady: false,
      maximumEvidenceAgeMs: 300_000,
      maximumCandidateLifetimeMs: 900_000,
      clockSkewMs: 0,
      evidenceObservation: "SHARED_EXACT_TIMESTAMP",
      provider: {
        providerEnforcedCredentialExpiry: "ABSENT",
        providerMonthlyHardSpendLimitCents: 25,
        providerMonthlyHardSpendLimitInterval: "MONTH",
        providerMonthlyHardSpendLimitEnforcementStatus: "ENFORCING",
        providerMonthlyLimitNature:
          "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY",
      },
      database: {
        projectRefHmacAlgorithm: "HMAC-SHA256",
        projectRefHmacPurpose: "CARESLINK_PREVIEW_DATABASE_PROJECT_REF",
        projectRefHmacVersion:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
        commonProjectRefHmacKeyRequired: true,
        privilegedRoleAttributes: false,
        directObjectPrivileges: false,
        additionalCallerShellMemberships: false,
        callerCount: 5,
        runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF",
        runnerTerminalExecutorRole:
          "careslink_v1_preview_runner_terminal_executor",
        runnerTerminalCallerPresent: true,
        runnerTerminalCallerExecuteGranted: true,
        runnerTerminalRuntimeIdentityPresent: false,
        runnerTerminalRuntimeMembershipPresent: false,
        runnerTerminalCredentialResolverPresent: false,
        runnerTerminalRuntimeExecute: false,
        brokerMigrationPresent: true,
        terminalActiveFencePresent: true,
      },
    });
    expect(Object.isFrozen(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY,
    )).toBe(true);
    expect([
      CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
    ]).toEqual(Array.from({ length: 8 }, () => false));
    expect([
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY,
      CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
    ]).toEqual(Array.from({ length: 6 }, () => undefined));
    expectFixedFailure(() =>
      createCaresLinkV1CommunicationNotePreviewActivationPreflight(),
    );
  });

  it("accepts one exact content-free candidate but keeps activation blocked", () => {
    const fixture = createFixture();
    const result = validate(fixture);

    expect(result.activationReady).toBe(false);
    expect(result.blockedReasons).toEqual([
      "EXTERNAL_PROVENANCE_NOT_AUTHENTICATED",
      "RUNTIME_IDENTITIES_NOT_PROVISIONED",
      "KEY_RESOLVERS_AND_TRANSPORT_ABSENT",
      "HUMAN_REVIEW_NOT_COMPLETED",
      "FINAL_RUN_APPROVAL_ABSENT",
    ]);
    expect(result.blockedReasons).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
    );
    expect(result.candidateDigest).toBe(
      createCanonicalSha256(result.candidate),
    );
    expect(result.candidate.authorization).toEqual({
      authorizationDigest:
        fixture.verifiedAuthorization.authorizationDigest,
      signatureSha256: fixture.verifiedAuthorization.signatureSha256,
    });
    expect(result.candidate.custody.snapshotDigest).toBe(
      createCanonicalSha256(fixture.validatedCustodySnapshot),
    );
    expect(
      result.candidate.database.callerBindings.map(
        (caller) => caller.loginIdentityHmac,
      ),
    ).toEqual(
      fixture.validatedCustodySnapshot.callers.map(
        (caller) => caller.identityHmac,
      ),
    );
    expect(result.candidate.database).toMatchObject({
      migrationCount: 42,
      runtimeCredentialBrokerMigrationSha256:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .runtimeCredentialBrokerMigrationSha256,
      runnerTerminalRuntimeIdentityPresent: false,
      runnerTerminalRuntimeMembershipPresent: false,
      runnerTerminalCredentialResolverPresent: false,
      brokerMigrationPresent: true,
      terminalActiveFencePresent: true,
    });
    expect(result.candidate.provider).toMatchObject({
      observedAt: fixture.candidate.observedAt,
      projectStatus: "ACTIVE",
      region: "AUSTRALIA",
      retention: "ZERO_DATA_RETENTION",
      monthlyHardSpendLimit: {
        amountCents: 25,
        interval: "MONTH",
        enforcementStatus: "ENFORCING",
        nature: "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY",
      },
      perRunBudget: {
        maximumCalls: 6,
        maximumAttemptsPerSlot: 1,
        automaticRetry: false,
        fallbackModel: null,
        maximumCostMicroUsd: 250_000,
        enforcement: "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY",
      },
      serviceAccount: {
        providerEnforcedExpiry: "ABSENT",
      },
    });
    expect(result.candidate.humanReview).toMatchObject({
      observedAt: fixture.candidate.observedAt,
      requiredReviewCount: 18,
      attributionRequired: true,
      resultsStatus: "NOT_STARTED",
      finalRunApproval: "ABSENT",
    });
    expectRecursivelyFrozen(result);

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      '"apiKey":',
      '"privateKey":',
      '"requestBody":',
      '"prompt":',
      '"cleanedFacts":',
      '"observable_facts":',
      '"outputText":',
      "Bearer ",
      "https://",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("pins the exact 42-migration manifest and nine M1g-b through M1l database artifacts", () => {
    const migrationsDirectory = join(process.cwd(), "supabase/migrations");
    const migrationNames = readdirSync(migrationsDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(migrationNames).toHaveLength(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
        .migrationCount,
    );
    expect(sha256(`${migrationNames.join("\n")}\n`)).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
        .orderedMigrationBasenamesSha256,
    );
    const migrationEntries = migrationNames.map((name) => {
      const contents = readFileSync(join(migrationsDirectory, name), "utf8");
      return {
        name,
        sha256: sha256(contents),
        utf8ByteLength: Buffer.byteLength(contents, "utf8"),
      };
    });
    expect(createCanonicalSha256(migrationEntries)).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
        .orderedMigrationEntriesSha256,
    );

    for (const [relativePath, expected] of [
      [
        "supabase/migrations/20260827142156_add_communication_note_preview_execution_authority_shadow.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .authorityMigrationSha256,
      ],
      [
        "supabase/migrations/20260828034704_add_communication_note_preview_custody_callers_shadow.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .custodyMigrationSha256,
      ],
      [
        "supabase/assertions/communication_note_preview_execution_authority_shadow_assertions.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .authorityAssertionSha256,
      ],
      [
        "supabase/assertions/communication_note_preview_custody_callers_shadow_assertions.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .custodyAssertionSha256,
      ],
      [
        "supabase/migrations/20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .runnerTerminalMigrationSha256,
      ],
      [
        "supabase/migrations/20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .signedRunnerTerminalMigrationSha256,
      ],
      [
        "supabase/migrations/20260829041316_align_communication_note_preview_terminal_accepted_usage.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .runnerTerminalAcceptedUsageMigrationSha256,
      ],
      [
        "supabase/migrations/20260830065750_add_communication_note_preview_runtime_credential_broker.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .runtimeCredentialBrokerMigrationSha256,
      ],
      [
        "supabase/assertions/communication_note_preview_runner_terminal_shadow_assertions.sql",
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
          .runnerTerminalAssertionSha256,
      ],
    ] as const) {
      expect(sha256(readFileSync(join(process.cwd(), relativePath), "utf8")))
        .toBe(expected);
    }
  });

  it("rebuilds immutable output instead of retaining mutable candidate references", () => {
    const fixture = createFixture();
    const candidate = structuredClone(fixture.candidate);
    const result =
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        candidate,
        fixture.options,
      );
    candidate.database.targetProjectRefHmac = sha256("mutated-target");
    expect(result.candidate.database.targetProjectRefHmac).toBe(
      fixture.candidate.database.targetProjectRefHmac,
    );
  });

  it("fails closed on every authority, custody, provider and database cross-binding drift", () => {
    const mutations: readonly ((candidate: Candidate) => void)[] = [
      (candidate) => {
        candidate.authorization.authorizationDigest = hex("f");
      },
      (candidate) => {
        candidate.authorization.signatureSha256 = hex("f");
      },
      (candidate) => {
        candidate.custody.snapshotDigest = hex("f");
      },
      (candidate) => {
        candidate.ownerTrust.fetchedRegistryBytesSha256 = hex("f");
      },
      (candidate) => {
        candidate.ownerTrust.registryReferenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.receiptCustody.custodyReferenceSha256 = hex("0");
      },
      (candidate) => {
        candidate.receiptCustody.keyIdHash = hex("0");
      },
      (candidate) => {
        candidate.receiptCustody.publicKeySha256 = hex("0");
      },
      (candidate) => {
        candidate.receiptCustody.status = "INACTIVE";
      },
      (candidate) => {
        candidate.receiptCustody.privateKeyMaterialPresent = true;
      },
      (candidate) => {
        candidate.receiptCustody.exportAllowed = true;
      },
      (candidate) => {
        candidate.runnerTerminalCustody.custodyReferenceSha256 = hex("0");
      },
      (candidate) => {
        candidate.runnerTerminalCustody.keyIdHash = hex("0");
      },
      (candidate) => {
        candidate.runnerTerminalCustody.publicKeySha256 = hex("0");
      },
      (candidate) => {
        candidate.provider.projectIdHmac = hex("f");
      },
      (candidate) => {
        candidate.provider.projectStatus = "INACTIVE";
      },
      (candidate) => {
        candidate.provider.region = "UNITED_STATES";
      },
      (candidate) => {
        candidate.provider.regionEvidenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.retention = "MODIFIED_ABUSE_MONITORING";
      },
      (candidate) => {
        candidate.provider.retentionEvidenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.modifiedRetentionAmendmentSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.ownerProcessingAcknowledgementSha256 = hex("f");
      },
      (candidate) => {
        (candidate.provider as { modelId: string }).modelId =
          "different-model";
      },
      (candidate) => {
        candidate.provider.modelAndPricingEvidenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.currency = "AUD";
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.amountCents = 250_000;
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.interval = "YEAR";
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.enforcementStatus =
          "NOT_ENFORCING";
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.nature =
          "PER_RUN_BUDGET_AUTHORITY";
      },
      (candidate) => {
        candidate.provider.monthlyHardSpendLimit.evidenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.perRunBudget.maximumCalls = 7;
      },
      (candidate) => {
        candidate.provider.perRunBudget.maximumAttemptsPerSlot = 2;
      },
      (candidate) => {
        candidate.provider.perRunBudget.automaticRetry = true;
      },
      (candidate) => {
        (
          candidate.provider.perRunBudget as { fallbackModel: string | null }
        ).fallbackModel = "fallback";
      },
      (candidate) => {
        candidate.provider.perRunBudget.maximumCostMicroUsd = 250_001;
      },
      (candidate) => {
        candidate.provider.perRunBudget.enforcement = "PROVIDER_MONTHLY";
      },
      (candidate) => {
        candidate.provider.serviceAccount.credentialReferenceSha256 = hex("f");
      },
      (candidate) => {
        candidate.provider.serviceAccount.scopesEvidenceSha256 = hex("c");
      },
      (candidate) => {
        candidate.provider.serviceAccount.providerEnforcedExpiry = "PRESENT";
      },
      (candidate) => {
        candidate.provider.serviceAccount.administrationAllowed = true;
      },
      (candidate) => {
        candidate.provider.serviceAccount.operationalExpiresAt =
          "2026-08-28T02:19:59.999Z";
      },
      (candidate) => {
        candidate.provider.serviceAccount.teardownBy =
          "2026-08-28T02:19:59.999Z";
      },
      (candidate) => {
        candidate.database.projectRefHmacAlgorithm = "SHA-256";
      },
      (candidate) => {
        candidate.database.projectRefHmacPurpose = "OTHER_PURPOSE";
      },
      (candidate) => {
        (
          candidate.database as { projectRefHmacVersion: string }
        ).projectRefHmacVersion = "other-version";
      },
      (candidate) => {
        candidate.database.projectRefHmacKeyReferenceSha256 =
          candidate.provider.serviceAccount.credentialReferenceSha256;
      },
      (candidate) => {
        candidate.database.productionProjectRefHmac =
          candidate.database.targetProjectRefHmac;
      },
      (candidate) => {
        candidate.database.defaultBranch = true;
      },
      (candidate) => {
        candidate.database.persistent = true;
      },
      (candidate) => {
        candidate.database.withData = true;
      },
      (candidate) => {
        candidate.database.productionExcluded = false;
      },
      (candidate) => {
        (candidate.database as { migrationCount: number }).migrationCount = 39;
      },
      (candidate) => {
        candidate.database.fixtureRowCount = 1;
      },
      (candidate) => {
        candidate.database.apiRoleExecute = true;
      },
      (candidate) => {
        (
          candidate.database as { orderedMigrationBasenamesSha256: string }
        ).orderedMigrationBasenamesSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as {
            orderedMigrationEntriesSha256: string;
          }
        ).orderedMigrationEntriesSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { authorityMigrationSha256: string }
        ).authorityMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { custodyMigrationSha256: string }
        ).custodyMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { authorityAssertionSha256: string }
        ).authorityAssertionSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { custodyAssertionSha256: string }
        ).custodyAssertionSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalMigrationSha256: string }
        ).runnerTerminalMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { signedRunnerTerminalMigrationSha256: string }
        ).signedRunnerTerminalMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as {
            runnerTerminalAcceptedUsageMigrationSha256: string;
          }
        ).runnerTerminalAcceptedUsageMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as {
            runtimeCredentialBrokerMigrationSha256: string;
          }
        ).runtimeCredentialBrokerMigrationSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalAssertionSha256: string }
        ).runnerTerminalAssertionSha256 = hex("f");
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalContract: string }
        ).runnerTerminalContract = "ACTIVE";
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalExecutorRole: string }
        ).runnerTerminalExecutorRole = "other_role";
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalCallerPresent: boolean }
        ).runnerTerminalCallerPresent = false;
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalCallerExecuteGranted: boolean }
        ).runnerTerminalCallerExecuteGranted = false;
      },
      (candidate) => {
        (
          candidate.database as { runnerTerminalRuntimeExecute: boolean }
        ).runnerTerminalRuntimeExecute = true;
      },
      (candidate) => {
        (
          candidate.database as {
            runnerTerminalRuntimeIdentityPresent: boolean;
          }
        ).runnerTerminalRuntimeIdentityPresent = true;
      },
      (candidate) => {
        (
          candidate.database as {
            runnerTerminalRuntimeMembershipPresent: boolean;
          }
        ).runnerTerminalRuntimeMembershipPresent = true;
      },
      (candidate) => {
        (
          candidate.database as {
            runnerTerminalCredentialResolverPresent: boolean;
          }
        ).runnerTerminalCredentialResolverPresent = true;
      },
      (candidate) => {
        (
          candidate.database as { brokerMigrationPresent: boolean }
        ).brokerMigrationPresent = false;
      },
      (candidate) => {
        (
          candidate.database as { terminalActiveFencePresent: boolean }
        ).terminalActiveFencePresent = false;
      },
      (candidate) => {
        candidate.database.callerBindings[0].loginIdentityHmac = hex("f");
      },
      (candidate) => {
        candidate.database.callerBindings[2].rpcNames = [
          candidate.database.callerBindings[2].rpcNames[0],
        ];
      },
      (candidate) => {
        candidate.database.callerBindings[0].loginCapability = false;
      },
      (candidate) => {
        candidate.database.callerBindings[0].rawCredentialMaterialPresent =
          true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].roleInherit = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].superuser = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].createRole = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].createDb = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].replication = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].bypassRls = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].callerMembershipAdmin = true;
      },
      (candidate) => {
        candidate.database.callerBindings[0].callerMembershipInherit = true;
      },
      (candidate) => {
        candidate.database.callerBindings[1].callerMembershipSet = false;
      },
      (candidate) => {
        candidate.database.callerBindings[3].executorMembership = true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].apiRoleMembership = true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].otherCallerShellMemberships =
          true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].directTablePrivileges = true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].directSequencePrivileges = true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].directFunctionPrivileges = true;
      },
      (candidate) => {
        candidate.database.callerBindings[3].activeBackendCount = 1;
      },
      (candidate) => {
        candidate.humanReview.requiredReviewCount = 17;
      },
      (candidate) => {
        candidate.humanReview.attributionRequired = false;
      },
      (candidate) => {
        candidate.humanReview.resultsStatus = "COMPLETED";
      },
      (candidate) => {
        candidate.humanReview.finalRunApproval = "PRESENT";
      },
    ];

    for (const [index, mutate] of mutations.entries()) {
      const fixture = createFixture();
      const candidate = structuredClone(fixture.candidate);
      mutate(candidate);
      expectFixedFailure(
        () =>
          validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
            candidate,
            fixture.options,
          ),
        `cross-binding mutation ${index}`,
      );
    }
  });

  it("enforces freshness, the 15-minute ceiling and owner-authorization confinement", () => {
    const staleFixture = createFixture({
      registryObservedAt: "2026-08-28T01:54:59.999Z",
    });
    staleFixture.candidate.expiresAt = "2026-08-28T02:05:00.000Z";
    expectFixedFailure(() => validate(staleFixture));

    const overlongFixture = createFixture({
      registryObservedAt: "2026-08-28T01:58:59.999Z",
    });
    overlongFixture.candidate.expiresAt = "2026-08-28T02:14:00.000Z";
    expectFixedFailure(() => validate(overlongFixture));

    const expiredFixture = createFixture();
    expiredFixture.candidate.expiresAt = NOW;
    expectFixedFailure(() => validate(expiredFixture));

    const authorizationConfinementFixture = createFixture({
      authorizationExpiresAt: "2026-08-28T02:05:00.000Z",
    });
    authorizationConfinementFixture.candidate.expiresAt =
      "2026-08-28T02:05:00.001Z";
    expectFixedFailure(() => validate(authorizationConfinementFixture));

    const malformedFixture = createFixture();
    malformedFixture.candidate.observedAt = "not-a-timestamp";
    expectFixedFailure(() => validate(malformedFixture));

    const preAuthorizationFixture = createFixture({
      registryObservedAt: "2026-08-28T01:59:00.000Z",
      authorizationIssuedAt: "2026-08-28T01:59:30.000Z",
      authorizationNotBefore: "2026-08-28T01:59:30.000Z",
      providerCredentialIssuedAt: "2026-08-28T01:59:30.000Z",
    });
    expectFixedFailure(() => validate(preAuthorizationFixture));

    for (const section of [
      "receiptCustody",
      "runnerTerminalCustody",
      "provider",
      "database",
      "humanReview",
    ] as const) {
      const fixture = createFixture();
      fixture.candidate[section].observedAt =
        "2026-08-28T01:59:54.999Z";
      expectFixedFailure(
        () => validate(fixture),
        `${section} observation drift`,
      );
    }

    const exactFreshnessFixture = createFixture({
      registryObservedAt: "2026-08-28T01:55:00.000Z",
    });
    exactFreshnessFixture.candidate.expiresAt =
      "2026-08-28T02:09:59.999Z";
    expect(validate(exactFreshnessFixture).activationReady).toBe(false);

    const exactLifetimeFixture = createFixture({
      registryObservedAt: "2026-08-28T01:59:00.000Z",
    });
    exactLifetimeFixture.candidate.expiresAt =
      "2026-08-28T02:14:00.000Z";
    expect(validate(exactLifetimeFixture).activationReady).toBe(false);
  });

  it("requires purpose separation across provider, KMS, database and review evidence", () => {
    const fixture = createFixture();
    const candidate = structuredClone(fixture.candidate);
    candidate.humanReview.planSha256 =
      candidate.provider.regionEvidenceSha256;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        candidate,
        fixture.options,
      ),
    );

    const scopesReuse = structuredClone(fixture.candidate);
    scopesReuse.humanReview.planSha256 =
      scopesReuse.provider.serviceAccount.scopesEvidenceSha256;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        scopesReuse,
        fixture.options,
      ),
    );

    const registryModelReuse = createFixture({
      registrySnapshotSha256: sha256("provider-model-and-pricing"),
    });
    expectFixedFailure(() => validate(registryModelReuse));

    const databaseKeyReuse = structuredClone(fixture.candidate);
    databaseKeyReuse.database.projectRefHmacKeyReferenceSha256 =
      fixture.validatedCustodySnapshot.hmacDomains.callerIdentity
        .keyReferenceSha256;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        databaseKeyReuse,
        fixture.options,
      ),
    );

    const callerReuse = structuredClone(fixture.candidate);
    callerReuse.database.callerBindings[3].loginIdentityHmac =
      callerReuse.database.callerBindings[0].loginIdentityHmac;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        callerReuse,
        fixture.options,
      ),
    );
  });

  it("rejects proxies, accessors, symbols, hidden fields and secret-bearing extensions without leaking them", () => {
    const fixture = createFixture();
    const ownKeys = vi.fn(() => {
      throw new Error("do-not-leak-proxy-trap");
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        new Proxy({}, { ownKeys }),
        fixture.options,
      ),
    );
    expect(ownKeys).not.toHaveBeenCalled();

    const accessor = structuredClone(fixture.candidate);
    const getter = vi.fn(() => "TEST_ONLY_CANDIDATE_NOT_APPROVED");
    Object.defineProperty(accessor, "status", {
      enumerable: true,
      get: getter,
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        accessor,
        fixture.options,
      ),
    );
    expect(getter).not.toHaveBeenCalled();

    const hostileCallerArray = structuredClone(fixture.candidate);
    const map = vi.fn(() => []);
    Object.setPrototypeOf(hostileCallerArray.database.callerBindings, {
      map,
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        hostileCallerArray,
        fixture.options,
      ),
    );
    expect(map).not.toHaveBeenCalled();

    const hostileRpcArray = structuredClone(fixture.candidate);
    const every = vi.fn(() => true);
    Object.setPrototypeOf(
      hostileRpcArray.database.callerBindings[2].rpcNames,
      { every },
    );
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        hostileRpcArray,
        fixture.options,
      ),
    );
    expect(every).not.toHaveBeenCalled();

    for (const decorate of [
      (candidate: Candidate) =>
        Object.defineProperty(candidate, "privateKeyMaterial", {
          enumerable: false,
          value: "must-not-leak-hidden-secret",
        }),
      (candidate: Candidate) =>
        Object.defineProperty(candidate, Symbol("api-key"), {
          enumerable: true,
          value: "must-not-leak-symbol-secret",
        }),
      (candidate: Candidate) => {
        (candidate as Candidate & { apiKey: string }).apiKey =
          "Bearer must-not-leak-enumerable-secret";
      },
    ]) {
      const candidate = structuredClone(fixture.candidate);
      decorate(candidate);
      let thrown: unknown;
      try {
        validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
          candidate,
          fixture.options,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        code: "VALIDATION_ERROR",
        message:
          "Communication Note preview activation preflight is unavailable",
      });
      expect(String(thrown)).not.toMatch(/must-not-leak|Bearer|api-key/i);
    }
  });

  it("bounds plain-data traversal before inspecting oversized or deeply nested graphs", () => {
    const fixture = createFixture();
    const oversizedArray: unknown[] = [];
    oversizedArray.length = 257;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        oversizedArray,
        fixture.options,
      ),
    );

    let deeplyNested: Record<string, unknown> = {};
    for (let depth = 0; depth < 34; depth += 1) {
      deeplyNested = { next: deeplyNested };
    }
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        deeplyNested,
        fixture.options,
      ),
    );

    const oversizedObject = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`key-${index}`, index]),
    );
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
        oversizedObject,
        fixture.options,
      ),
    );
  });
});

function validate(fixture: ReturnType<typeof createFixture>) {
  return validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
    fixture.candidate,
    fixture.options,
  );
}

function createFixture(
  input: Readonly<{
    registryObservedAt?: string;
    registrySnapshotSha256?: string;
    authorizationIssuedAt?: string;
    authorizationNotBefore?: string;
    authorizationExpiresAt?: string;
    providerCredentialIssuedAt?: string;
  }> = {},
) {
  const ownerSigner = createSigner("OWNER_AUTHORIZATION");
  const receiptSigner = createSigner("CARESLINK_DISPATCH_RECEIPT");
  const runnerTerminalSigner = createRunnerTerminalSigner();
  const registryObservedAt =
    input.registryObservedAt ?? "2026-08-28T01:59:55.000Z";
  const authorizationIssuedAt =
    input.authorizationIssuedAt ?? registryObservedAt;
  const authorizationNotBefore =
    input.authorizationNotBefore ?? authorizationIssuedAt;
  const statement = createAuthorizationStatement(ownerSigner.trustedKey, {
    issuedAt: authorizationIssuedAt,
    notBefore: authorizationNotBefore,
    expiresAt:
      input.authorizationExpiresAt ??
      new Date(
        Date.parse(authorizationIssuedAt) + 15 * 60 * 1_000,
      ).toISOString(),
  });
  const signature = signStatement(statement, ownerSigner.privateKey);
  const verifiedAuthorization =
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
      { statement, signature },
      {
        trustedKeySnapshot: ownerSigner.trustedKey,
        now: NOW,
        expected: {
          ownerSubjectHmac: statement.ownerSubjectHmac,
          tenantScopeHmac: statement.tenantScopeHmac,
          runIdHash: statement.runIdHash,
        },
      },
    );
  const custodySnapshot = {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    authorizationBinding: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: statement.runIdHash,
      openAiProjectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      temporaryCredentialReferenceSha256:
        statement.environmentEvidence.temporaryCredentialReferenceSha256,
    },
    ownerTrustRegistry: {
      source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT",
      registrySnapshotSha256:
        input.registrySnapshotSha256 ?? sha256("owner-registry-snapshot"),
      registryReferenceSha256: sha256("owner-registry-reference"),
      observedAt: registryObservedAt,
      trustedSigningKey: ownerSigner.trustedKey,
      privateKeyMaterialPresent: false,
    },
    receiptSigner: {
      trustedSigningKey: receiptSigner.trustedKey,
      keyIdHash: sha256(receiptSigner.trustedKey.keyId),
      publicKeySha256: receiptSigner.trustedKey.publicKeySha256,
      custodyReferenceSha256: sha256("receipt-custody-reference"),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    runnerTerminalSigner: {
      trustedSigningKey: runnerTerminalSigner.trustedKey,
      keyIdHash: sha256(runnerTerminalSigner.trustedKey.keyId),
      publicKeySha256: runnerTerminalSigner.trustedKey.publicKeySha256,
      custodyReferenceSha256: sha256(
        "runner-terminal-custody-reference",
      ),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    providerCredential: {
      credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
      projectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      serviceAccountIdHmac: sha256("provider-service-account-id-hmac"),
      apiKeyIdHmac: sha256("provider-api-key-id-hmac"),
      credentialReferenceSha256:
        statement.environmentEvidence.temporaryCredentialReferenceSha256,
      scopesEvidenceSha256: sha256("provider-scopes-evidence"),
      issuedAt: input.providerCredentialIssuedAt ?? registryObservedAt,
      expiresAt: "2026-08-28T02:20:00.000Z",
      revokeBy: "2026-08-28T02:20:00.000Z",
      administrationAllowed: false,
      automaticRenewal: false,
      maximumCalls: 6,
      rawCredentialMaterialPresent: false,
      exportAllowed: false,
    },
    hmacDomains: {
      callerIdentity: {
        algorithm: "HMAC-SHA256",
        purpose: "CARESLINK_PREVIEW_CALLER_IDENTITY",
        version:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
        keyReferenceSha256: sha256("caller-identity-hmac-key-reference"),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
      providerCorrelation: {
        algorithm: "HMAC-SHA256",
        purpose: "OPENAI_PREVIEW_PROVIDER_CORRELATION",
        version:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
        keyReferenceSha256: sha256("provider-correlation-hmac-key-reference"),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
    },
    callers: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
      (mapping, index) => ({
        ...mapping,
        identityHmac: sha256(`caller-${index}-identity-hmac`),
        credentialReferenceSha256: sha256(
          `caller-${index}-credential-reference`,
        ),
        databaseLogin: false,
        executorMembershipEnabled: false,
        rawCredentialMaterialPresent: false,
        exportAllowed: false,
      }),
    ),
  };
  const validatedCustodySnapshot =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
      custodySnapshot,
      { now: NOW, verifiedAuthorization },
    );
  const candidate = createCandidate(
    statement,
    verifiedAuthorization,
    validatedCustodySnapshot,
  );
  return {
    candidate,
    verifiedAuthorization,
    validatedCustodySnapshot,
    options: {
      now: NOW,
      verifiedAuthorization,
      custodySnapshot: validatedCustodySnapshot,
    },
  };
}

function createCandidate(
  statement: CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
  verifiedAuthorization: ReturnType<
    typeof verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization
  >,
  custodySnapshot: ReturnType<
    typeof validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot
  >,
) {
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
    expiresAt: "2026-08-28T02:10:00.000Z",
    authorization: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      signatureSha256: verifiedAuthorization.signatureSha256,
    },
    custody: {
      snapshotDigest: createCanonicalSha256(custodySnapshot),
    },
    ownerTrust: {
      registrySnapshotSha256:
        custodySnapshot.ownerTrustRegistry.registrySnapshotSha256,
      fetchedRegistryBytesSha256:
        custodySnapshot.ownerTrustRegistry.registrySnapshotSha256,
      registryReferenceSha256:
        custodySnapshot.ownerTrustRegistry.registryReferenceSha256,
      registryObservedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      authenticatedDeliveryEvidenceSha256: sha256("registry-delivery"),
      completeRevocationEvidenceSha256: sha256("registry-revocation"),
      signingCeremonyAttributionEvidenceSha256: sha256("owner-ceremony"),
    },
    receiptCustody: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      custodyReferenceSha256:
        custodySnapshot.receiptSigner.custodyReferenceSha256,
      keyIdHash: custodySnapshot.receiptSigner.keyIdHash,
      publicKeySha256: custodySnapshot.receiptSigner.publicKeySha256,
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE",
      privateKeyMaterialPresent: false,
      exportAllowed: false,
      accessLogEvidenceSha256: sha256("receipt-access-log"),
      rotationAndRevocationEvidenceSha256: sha256("receipt-lifecycle"),
      teardownPlanSha256: sha256("receipt-teardown"),
    },
    runnerTerminalCustody: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      custodyReferenceSha256:
        custodySnapshot.runnerTerminalSigner.custodyReferenceSha256,
      keyIdHash: custodySnapshot.runnerTerminalSigner.keyIdHash,
      publicKeySha256:
        custodySnapshot.runnerTerminalSigner.publicKeySha256,
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE",
      privateKeyMaterialPresent: false,
      exportAllowed: false,
      accessLogEvidenceSha256: sha256("runner-terminal-access-log"),
      rotationAndRevocationEvidenceSha256: sha256(
        "runner-terminal-lifecycle",
      ),
      teardownPlanSha256: sha256("runner-terminal-teardown"),
    },
    provider: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      projectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      projectStatus: "ACTIVE",
      region: "AUSTRALIA",
      regionEvidenceSha256:
        statement.environmentEvidence.australiaProjectConfigurationSha256,
      retention: "ZERO_DATA_RETENTION",
      retentionEvidenceSha256:
        statement.environmentEvidence.zeroDataRetentionConfigurationSha256,
      modifiedRetentionAmendmentSha256:
        statement.environmentEvidence.modifiedRetentionAmendmentSha256,
      ownerProcessingAcknowledgementSha256:
        statement.environmentEvidence.ownerProcessingAcknowledgementSha256,
      modelId:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS.modelId,
      modelAndPricingEvidenceSha256:
        statement.environmentEvidence.pricingAndModelAvailabilitySha256,
      monthlyHardSpendLimit: {
        currency: "USD",
        amountCents: 25,
        interval: "MONTH",
        enforcementStatus: "ENFORCING",
        nature: "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY",
        evidenceSha256:
          statement.environmentEvidence.providerSpendLimitSha256,
      },
      perRunBudget: {
        maximumCalls: 6,
        maximumAttemptsPerSlot: 1,
        automaticRetry: false,
        fallbackModel: null,
        maximumCostMicroUsd: 250_000,
        enforcement: "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY",
      },
      serviceAccount: {
        credentialReferenceSha256:
          custodySnapshot.providerCredential.credentialReferenceSha256,
        scopesEvidenceSha256:
          custodySnapshot.providerCredential.scopesEvidenceSha256,
        administrationAllowed: false,
        providerEnforcedExpiry: "ABSENT",
        operationalExpiresAt:
          custodySnapshot.providerCredential.expiresAt,
        teardownBy: custodySnapshot.providerCredential.revokeBy,
        deleteAndAbsencePlanSha256: sha256("service-account-delete-absence"),
      },
    },
    database: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      projectRefHmacAlgorithm: "HMAC-SHA256",
      projectRefHmacPurpose: "CARESLINK_PREVIEW_DATABASE_PROJECT_REF",
      projectRefHmacVersion:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
      projectRefHmacKeyReferenceSha256: sha256(
        "database-project-ref-hmac-key-reference",
      ),
      targetProjectRefHmac: sha256("preview-project-ref"),
      productionProjectRefHmac: sha256("production-project-ref"),
      defaultBranch: false,
      persistent: false,
      withData: false,
      productionExcluded: true,
      ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
      runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF",
      runnerTerminalExecutorRole:
        "careslink_v1_preview_runner_terminal_executor",
      runnerTerminalCallerPresent: true,
      runnerTerminalCallerExecuteGranted: true,
      runnerTerminalRuntimeIdentityPresent: false,
      runnerTerminalRuntimeMembershipPresent: false,
      runnerTerminalCredentialResolverPresent: false,
      runnerTerminalRuntimeExecute: false,
      brokerMigrationPresent: true,
      terminalActiveFencePresent: true,
      apiRoleExecute: false,
      fixtureRowCount: 0,
      callerBindings:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
          (mapping, index) => ({
            purpose: mapping.purpose,
            callerShellRole: mapping.callerRole,
            executorRole: mapping.executorRole,
            rpcNames: [...mapping.rpcNames],
            loginIdentityHmac:
              custodySnapshot.callers[index].identityHmac,
            loginCapability: true,
            rawCredentialMaterialPresent: false,
            roleInherit: false,
            superuser: false,
            createRole: false,
            createDb: false,
            replication: false,
            bypassRls: false,
            callerMembershipAdmin: false,
            callerMembershipInherit: false,
            callerMembershipSet: true,
            executorMembership: false,
            apiRoleMembership: false,
            otherCallerShellMemberships: false,
            directTablePrivileges: false,
            directSequencePrivileges: false,
            directFunctionPrivileges: false,
            activeBackendCount: 0,
          }),
        ),
      sessionConfinementEvidenceSha256: sha256("db-session-confinement"),
      credentialRotationEvidenceSha256: sha256("db-credential-rotation"),
      membershipTeardownEvidenceSha256: sha256("db-membership-teardown"),
      zeroBackendAbsenceEvidenceSha256: sha256("db-zero-backend-absence"),
    },
    humanReview: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      requiredReviewCount: 18,
      attributionRequired: true,
      planSha256: sha256("human-review-plan"),
      reviewerAssignmentSha256: sha256("human-reviewer-assignment"),
      resultsStatus: "NOT_STARTED",
      finalRunApproval: "ABSENT",
    },
  };
}

type Candidate = ReturnType<typeof createCandidate>;

function createAuthorizationStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  times: Readonly<{
    issuedAt: string;
    notBefore: string;
    expiresAt: string;
  }>,
): CaresLinkV1CommunicationNotePreviewAuthorizationStatement {
  return {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    authorizationId: "10000000-0000-4000-8000-000000000001",
    authorizationNonceHash: hex("1"),
    ownerSubjectHmac: hex("2"),
    tenantScopeHmac: hex("3"),
    runIdHash: hex("4"),
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    issuedAt: times.issuedAt,
    notBefore: times.notBefore,
    expiresAt: times.expiresAt,
    sourceBindings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    environmentEvidence: {
      openAiProjectIdHmac: sha256("provider-project-id-hmac"),
      australiaProjectConfigurationSha256: sha256(
        "provider-australia-region-evidence",
      ),
      zeroDataRetentionConfigurationSha256: sha256(
        "provider-zero-data-retention-evidence",
      ),
      modifiedRetentionAmendmentSha256: sha256(
        "provider-modified-retention-amendment",
      ),
      ownerProcessingAcknowledgementSha256: sha256(
        "provider-owner-processing-acknowledgement",
      ),
      pricingAndModelAvailabilitySha256: sha256(
        "provider-model-and-pricing",
      ),
      providerSpendLimitSha256: sha256(
        "provider-monthly-spend-limit-evidence",
      ),
      temporaryCredentialReferenceSha256: sha256(
        "provider-temporary-credential-reference",
      ),
    },
    budget: {
      currency: "USD",
      maximumCalls: 6,
      maximumAttemptsPerSlot: 1,
      automaticRetry: false,
      fallbackModel: null,
      maximumInputTokensPerCall: 10_000,
      maximumOutputTokensPerCall: 2_400,
      maximumProjectedCostMicroUsdPerCall: 20_130,
      projectedCostMicroUsd: 120_780,
      maximumCostMicroUsd: 250_000,
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
    },
    input: {
      classification: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
      realCareDataAllowed: false,
    },
    slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  };
}

function createSigner(
  purpose: "OWNER_AUTHORIZATION" | "CARESLINK_DISPATCH_RECEIPT",
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const core = {
    keyId:
      purpose === "OWNER_AUTHORIZATION"
        ? "owner-preview-2026-08"
        : "receipt-preview-2026-08",
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
    status: "ACTIVE",
    notBefore: "2026-08-28T01:00:00.000Z",
    expiresAt: "2026-08-28T03:00:00.000Z",
  } as const;
  const trustedKey =
    purpose === "OWNER_AUTHORIZATION"
      ? {
          ...core,
          purpose,
          allowedDomain:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
          ownerSubjectHmac: hex("2"),
          tenantScopeHmac: hex("3"),
        }
      : {
          ...core,
          purpose,
          allowedDomain:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
          ownerSubjectHmac: null,
          tenantScopeHmac: null,
        };
  return {
    privateKey,
    trustedKey:
      trustedKey satisfies CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  };
}

function createRunnerTerminalSigner() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey,
    trustedKey: {
      keyId: "runner-terminal-preview-2026-08",
      publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
      publicKeySha256: createHash("sha256")
        .update(publicKeyDer)
        .digest("hex"),
      status: "ACTIVE" as const,
      notBefore: "2026-08-28T01:00:00.000Z",
      expiresAt: "2026-08-28T03:00:00.000Z",
      purpose: "CARESLINK_RUNNER_TERMINAL" as const,
      allowedDomain:
        "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL" as const,
    },
  };
}

function signStatement(statement: unknown, privateKey: KeyObject) {
  return sign(
    null,
    createCaresLinkV1CommunicationNotePreviewSigningMessage(statement),
    privateKey,
  ).toString("base64url");
}

function expectFixedFailure(callback: () => unknown, message?: string) {
  expect(callback, message).toThrowError(
    expect.objectContaining({
      code: "VALIDATION_ERROR",
      message:
        "Communication Note preview activation preflight is unavailable",
    }),
  );
}

function expectRecursivelyFrozen(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectRecursivelyFrozen(child, seen);
  }
}

function createCanonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hex(character: string) {
  return character.repeat(64);
}
