import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseTransactionalMigrationArguments,
  runTransactionalMigrationHarness,
} from
  "./communication-note-preview-transactional-migrations.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY as POLICY,
  CommunicationNotePreviewTransactionalMigrationPolicyError,
  isTransactionControlStatement,
  loadPinnedCommunicationNotePreviewMigrations,
  splitSupabaseCliMigrationStatements,
  validateCommunicationNotePreviewMigrationHistory,
} from "./communication-note-preview-transactional-migrations-policy.mjs";

describe("Communication Note Preview transactional migration policy", () => {
  it("pins all 39 repository migrations and removes only 17 known wrappers in memory", async () => {
    const bundle = await loadPinnedCommunicationNotePreviewMigrations();
    expect(bundle).toMatchObject({
      manifestSha256: POLICY.manifestSha256,
      outerTransactionCount: 17,
    });
    expect(bundle.migrations).toHaveLength(39);
    expect(bundle.migrations.at(-1)).toMatchObject({
      basename:
        "20260829041316_align_communication_note_preview_terminal_accepted_usage.sql",
      version: "20260829041316",
      outerTransactionRemoved: true,
    });
    const accepted = bundle.migrations.at(-1);
    expect(accepted.statements[0]).toMatch(/\bbegin$/i);
    expect(accepted.statements.at(-1)).toMatch(/^commit$/i);
    expect(accepted.executionSql.trim().toLowerCase()).not.toMatch(/^begin\b/);
    expect(accepted.executionSql.trim().toLowerCase()).not.toMatch(/\bcommit;$/);

    const lockMigration = bundle.migrations.find((migration) =>
      migration.version === "20260828235426"
    );
    expect(lockMigration.outerTransactionRemoved).toBe(false);
    expect(lockMigration.executionSql).toMatch(/lock\s+table/i);
  });

  it("matches the CLI statement boundary contract for quotes, comments, dollar bodies and parentheses", () => {
    const statements = splitSupabaseCliMigrationStatements(`
      -- header ; stays attached
      select ';'::text;
      select $$body;still-body$$;
      select pg_catalog.concat('a;b', (select 'c;d'));
      /* outer ; /* nested ; */ done */ select 4;
    `);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toContain("header ; stays attached");
    expect(statements[1]).toContain("body;still-body");
    expect(statements[2]).toContain("'c;d'");
    expect(statements[3]).toContain("nested ;");
  });

  it("matches CLI 2.115.0 BEGIN ATOMIC and Unicode dollar-tag boundaries", () => {
    expect(splitSupabaseCliMigrationStatements(
      "CREATE FUNCTION f() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 1; SELECT 2; END; SELECT 3;",
    )).toEqual([
      "CREATE FUNCTION f() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 1; SELECT 2; END",
      "SELECT 3",
    ]);
    expect(splitSupabaseCliMigrationStatements(
      "CREATE FUNCTION f() AS $a²$foo; bar$a²$ LANGUAGE sql;",
    )).toEqual([
      "CREATE FUNCTION f() AS $a²$foo",
      "bar$a²$ LANGUAGE sql",
    ]);
  });

  it("rejects every PostgreSQL transaction-control spelling inside the outer transaction", () => {
    for (const statement of [
      "begin",
      "start transaction",
      "commit",
      "end work",
      "rollback to savepoint gate",
      "abort",
      "savepoint gate",
      "release savepoint gate",
      "prepare transaction 'gate'",
      "commit prepared 'gate'",
      "rollback prepared 'gate'",
      "set transaction isolation level serializable",
      "/* outer /* inner */ tail */ END",
      "-- gate comment\nPREPARE TRANSACTION 'gate'",
    ]) {
      expect(isTransactionControlStatement(statement)).toBe(true);
    }
    expect(isTransactionControlStatement(
      "create function f() returns int language sql begin atomic select 1; end",
    )).toBe(false);
  });

  it("accepts only an exact ordered history prefix", () => {
    const migrations = [
      migration("20260101000000", "one"),
      migration("20260101000001", "two"),
    ];
    expect(validateCommunicationNotePreviewMigrationHistory(
      [{
        version: "20260101000000",
        name: "one",
        statements: ["select 1"],
      }],
      migrations,
    )).toMatchObject({ appliedCount: 1 });
    for (const rows of [
      [{ version: "20260101000001", name: "two", statements: ["select 1"] }],
      [{ version: "20260101000000", name: "", statements: ["select 1"] }],
      [{ version: "20260101000000", name: "drift", statements: ["select 1"] }],
      [{ version: "20260101000000", name: "one", statements: ["select 2"] }],
      migrations.map((entry) => ({
        version: entry.version,
        name: entry.name,
        statements: entry.statements,
      })).concat({
        version: "20260101000002",
        name: "extra",
        statements: ["select 1"],
      }),
    ]) {
      expect(() =>
        validateCommunicationNotePreviewMigrationHistory(rows, migrations)
      ).toThrowError(CommunicationNotePreviewTransactionalMigrationPolicyError);
    }
  });

  it("keeps credentials out of argv, environment and evidence surfaces", async () => {
    const source = await readFile(new URL(
      "./communication-note-preview-transactional-migrations.mjs",
      import.meta.url,
    ), "utf8");
    expect(source).toContain("readBoundedStdin");
    expect(source).not.toContain("process_memory");
    expect(source).not.toContain("--db-url");
    expect(source).not.toContain("--password");
    expect(source).not.toContain("DATABASE_URL");
    expect(source).toContain("/^PG[A-Z0-9_]*$/");
    expect(source).toContain('stage: "M00"');
    expect(source.match(
      /array_agg\(\s*namespace\.nspname::pg_catalog\.text/gu,
    )).toHaveLength(2);
    expect(source).toMatch(
      /array_agg\(\s*relation\.relname::pg_catalog\.text/gu,
    );
  });

  it("requires the exact disposable Preview reset authorization argument", () => {
    const branchRef = "abcdefghijklmnopqrst";
    const required = [
      `--expected-branch-ref=${branchRef}`,
      "--expected-pg-major=17",
      "--ssl-root-cert-path=/tmp/supabase-ca.crt",
      `--expected-ssl-root-cert-sha256=${"a".repeat(64)}`,
      `--authorized-disposable-preview-reset=${POLICY.disposablePreviewBaselineHistorySha256}`,
    ];
    expect(parseTransactionalMigrationArguments(required)).toMatchObject({
      expectedBranchRef: branchRef,
      resetAuthorizationSha256:
        POLICY.disposablePreviewBaselineHistorySha256,
    });
    for (const denied of [
      required.slice(0, -1),
      required.with(-1, "--authorized-disposable-preview-reset=denied"),
      [...required, required.at(-1)],
    ]) {
      expect(() => parseTransactionalMigrationArguments(denied))
        .toThrowError("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
    }
  });
});

describe("Communication Note Preview transactional migration runtime", () => {
  it("commits schema and history together and verifies the committed history", async () => {
    const migrations = [migration("20260101000000", "one")];
    const client = new FakeMigrationClient();
    const evidence = await runTransactionalMigrationHarness({
      client,
      backgroundState: { failed: false },
      expectedPostgresMajor: 17,
      resetAuthorizationSha256:
        POLICY.disposablePreviewBaselineHistorySha256,
      migrations,
      manifestSha256: "a".repeat(64),
      outerTransactionCount: 0,
    });
    expect(evidence).toMatchObject({
      postgres: 17,
      migrations: 1,
      baselineMigrations: 19,
      appliedInSingleTransaction: 1,
      migrationParserContractVersion: "2.115.0",
      isolationLevel: "read_committed_with_explicit_table_locks",
      fullChainAtomic: true,
      publicNamespacePreserved: true,
      applicationObjectsRebuilt: true,
      baselineHistorySha256:
        POLICY.disposablePreviewBaselineHistorySha256,
      baselinePublicCatalogSha256:
        POLICY.disposablePreviewBaselinePublicCatalogSha256,
      baselinePublicSchemaMembersSha256:
        POLICY.disposablePreviewBaselinePublicSchemaMembersSha256,
      baselineSchemaLessDependenciesSha256:
        POLICY.disposablePreviewBaselineSchemaLessDependenciesSha256,
      baselinePublicationsSha256:
        POLICY.disposablePreviewBaselinePublicationsSha256,
      baselineEventTriggersSha256:
        POLICY.disposablePreviewBaselineEventTriggersSha256,
      baselinePublicDefaultAclsSha256:
        POLICY.disposablePreviewBaselinePublicDefaultAclsSha256,
      baselinePublicNonApplicationAclSha256:
        POLICY.disposablePreviewBaselinePublicNonApplicationAclSha256,
      preservedSystemSchemas: POLICY.preservedSystemSchemas.length,
      applicationRoles: POLICY.applicationRoles.length,
      protectedApplicationAclGrants:
        POLICY.protectedApplicationAclGrants.length,
      ledgersEmpty: true,
      temporaryRolesAbsent: true,
    });
    const routineDrops = client.events.filter((event) =>
      event.startsWith("drop function ")
    );
    const tableDrops = client.events.filter((event) =>
      event.startsWith("drop table ")
    );
    expect(routineDrops).toHaveLength(1);
    expect(tableDrops).toHaveLength(1);
    expect(client.events).not.toContain("drop schema public cascade");
    expect(client.events.indexOf(routineDrops[0])).toBeLessThan(
      client.events.indexOf(tableDrops[0]),
    );
    expect(client.events.filter((event) =>
      event.startsWith("lock table auth.users,") &&
      event.endsWith("in share mode") &&
      !event.includes("storage.vector_indexes")
    )).toHaveLength(1);
    expect(client.events).toContain(
      "lock table storage.vector_indexes in access share mode",
    );
    const systemDataChecks = client.events.filter((event) =>
      event.startsWith(
        "select (select pg_catalog.count(*) = 0 from auth.users)",
      )
    );
    expect(systemDataChecks).toHaveLength(2);
    expect(client.events.at(-3)).toBe(systemDataChecks.at(-1));
    expect(client.events.indexOf("select 1;")).toBeGreaterThan(
      client.events.indexOf(tableDrops[0]),
    );
    expect(client.events.filter((event) =>
      event.includes("as non_application_acl_sha256") &&
      event.includes("as application_acl_count")
    )).toHaveLength(2);
    expect(client.events.filter((event) =>
      event.startsWith("with application_acl_grants(")
    )).toHaveLength(1);
    expect(POLICY.protectedApplicationAclGrants).toHaveLength(22);
    expect(POLICY.protectedApplicationAclGrants.filter((grant) =>
      grant.startsWith("schema|public|")
    )).toHaveLength(6);
    expect(client.schemaRebuilt).toBe(true);
    expect(client.events.at(-2)).toBe("commit");
    expect(client.events.at(-1)).toContain("select version");
  });

  it("rolls back rather than recording history when a migration fails", async () => {
    const initialHistory = Array.from({ length: 19 }, (_, index) => ({
      version: `2026010100${String(index).padStart(4, "0")}`,
      name: `baseline_${index}`,
      statements: ["select 0"],
    }));
    const client = new FakeMigrationClient({
      migrationFails: true,
      initialHistory,
    });
    await expect(runTransactionalMigrationHarness({
      client,
      backgroundState: { failed: false },
      expectedPostgresMajor: 17,
      resetAuthorizationSha256:
        POLICY.disposablePreviewBaselineHistorySha256,
      migrations: [migration("20260101000000", "one")],
      manifestSha256: "b".repeat(64),
      outerTransactionCount: 0,
    })).rejects.toThrowError("TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED");
    expect(client.events.filter((event) =>
      event.startsWith("drop function ")
    )).toHaveLength(1);
    expect(client.events.filter((event) =>
      event.startsWith("drop table ")
    )).toHaveLength(1);
    expect(client.events).toContain("rollback");
    expect(client.history).toEqual(initialHistory);
    expect(client.schemaRebuilt).toBe(false);
  });

  it("fails closed before reset when the hosted baseline or zero-data proof differs", async () => {
    for (const options of [
      { baselineFingerprintValid: false },
      { schemaMemberFingerprintValid: false },
      { schemaLessFingerprintValid: false },
      { schemaLessClassesValid: false },
      { schemaLessApplicationInternalOnly: false },
      { publicationsValid: false },
      { eventTriggersValid: false },
      { publicDefaultAclsValid: false },
      { catalogValid: false },
      { publicOidValid: false },
      { externalDependenciesAbsent: false },
      { publicNonApplicationAclBaselineValid: false },
      { publicApplicationAclBaselineEmpty: false },
      { publicDataPresent: true },
      { protectedSemanticBaselineValid: false },
      { readOnlySystemLockCapabilityValid: false },
    ]) {
      const client = new FakeMigrationClient(options);
      await expect(runTransactionalMigrationHarness({
        client,
        backgroundState: { failed: false },
        expectedPostgresMajor: 17,
        resetAuthorizationSha256:
          POLICY.disposablePreviewBaselineHistorySha256,
        migrations: [migration("20260101000000", "one")],
        manifestSha256: "c".repeat(64),
        outerTransactionCount: 0,
      })).rejects.toThrowError(
        "TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID",
      );
      expect(client.events).toContain("rollback");
      expect(client.events).not.toContain("drop schema public cascade");
      expect(client.events.some((event) =>
        event.startsWith("drop function ") || event.startsWith("drop table ")
      )).toBe(false);
      expect(client.schemaRebuilt).toBe(false);
    }
  });

  it("requires the reset role to bypass RLS and create migration roles", async () => {
    for (const options of [
      { targetBypassRls: false },
      { targetCanCreateRoles: false },
    ]) {
      const client = new FakeMigrationClient(options);
      await expect(runTransactionalMigrationHarness({
        client,
        backgroundState: { failed: false },
        expectedPostgresMajor: 17,
        resetAuthorizationSha256:
          POLICY.disposablePreviewBaselineHistorySha256,
        migrations: [migration("20260101000000", "one")],
        manifestSha256: "d".repeat(64),
        outerTransactionCount: 0,
      })).rejects.toThrowError("TRANSACTIONAL_MIGRATION_TARGET_INVALID");
      expect(client.events).toContain("rollback");
      expect(client.events.some((event) =>
        event.startsWith("drop function ") || event.startsWith("drop table ")
      )).toBe(false);
      expect(client.schemaRebuilt).toBe(false);
    }
  });

  it("attaches only a fixed checkpoint to a hosted precondition rejection", async () => {
    const client = new FakeMigrationClient({
      readOnlySystemLockCapabilityValid: false,
    });
    try {
      await runTransactionalMigrationHarness({
        client,
        backgroundState: { failed: false },
        expectedPostgresMajor: 17,
        resetAuthorizationSha256:
          POLICY.disposablePreviewBaselineHistorySha256,
        migrations: [migration("20260101000000", "one")],
        manifestSha256: "d".repeat(64),
        outerTransactionCount: 0,
      });
      throw new Error("expected hosted precondition rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "TRANSACTIONAL_MIGRATION_RESET_PRECONDITION_INVALID",
        checkpoint: "read_only_system_lock_capability",
      });
    }
  });

  it("rejects a programmatic call without the exact reset authorization", async () => {
    const client = new FakeMigrationClient();
    await expect(runTransactionalMigrationHarness({
      client,
      backgroundState: { failed: false },
      expectedPostgresMajor: 17,
      resetAuthorizationSha256: "0".repeat(64),
      migrations: [migration("20260101000000", "one")],
      manifestSha256: "d".repeat(64),
      outerTransactionCount: 0,
    })).rejects.toThrowError("TRANSACTIONAL_MIGRATION_ARGUMENT_INVALID");
    expect(client.events).toEqual([]);
  });

  it("rolls back if a preserved global, namespace or protected snapshot drifts", async () => {
    for (const options of [
      { protectedObjectsDriftAfterReset: true },
      { protectedSemanticDriftAfterReset: true },
      { reverseAppRoleMembership: true },
      { publicationsDriftAfterReset: true },
      { eventTriggersDriftAfterReset: true },
      { publicDefaultAclsDriftAfterReset: true },
      { publicNamespaceClearedValid: false },
      { publicOidDriftAfterReset: true },
      { publicNonApplicationAclDriftAfterReset: true },
      { publicApplicationAclPostCountValid: false },
      { protectedApplicationAclGrantsValid: false },
      { systemDataDriftsBeforeCommit: true },
    ]) {
      const client = new FakeMigrationClient(options);
      await expect(runTransactionalMigrationHarness({
        client,
        backgroundState: { failed: false },
        expectedPostgresMajor: 17,
        resetAuthorizationSha256:
          POLICY.disposablePreviewBaselineHistorySha256,
        migrations: [migration("20260101000000", "one")],
        manifestSha256: "e".repeat(64),
        outerTransactionCount: 0,
      })).rejects.toThrowError("TRANSACTIONAL_MIGRATION_POSTCHECK_FAILED");
      const routineDrops = client.events.filter((event) =>
        event.startsWith("drop function ")
      );
      const tableDrops = client.events.filter((event) =>
        event.startsWith("drop table ")
      );
      expect(routineDrops).toHaveLength(1);
      expect(tableDrops).toHaveLength(1);
      expect(client.events.indexOf(routineDrops[0])).toBeLessThan(
        client.events.indexOf(tableDrops[0]),
      );
      expect(client.events).not.toContain("drop schema public cascade");
      expect(client.events).toContain("rollback");
      expect(client.schemaRebuilt).toBe(false);
    }
  });
});

function migration(version, name) {
  return Object.freeze({
    version,
    name,
    statements: Object.freeze(["select 1"]),
    executionSql: "select 1;",
  });
}

class FakeMigrationClient {
  constructor({
    migrationFails = false,
    initialHistory = [],
    targetBypassRls = true,
    targetCanCreateRoles = true,
    baselineFingerprintValid = true,
    schemaMemberFingerprintValid = true,
    schemaLessFingerprintValid = true,
    schemaLessClassesValid = true,
    schemaLessApplicationInternalOnly = true,
    publicationsValid = true,
    publicationsDriftAfterReset = false,
    eventTriggersValid = true,
    eventTriggersDriftAfterReset = false,
    publicDefaultAclsValid = true,
    publicDefaultAclsDriftAfterReset = false,
    catalogValid = true,
    publicOidValid = true,
    publicOidDriftAfterReset = false,
    externalDependenciesAbsent = true,
    publicNonApplicationAclBaselineValid = true,
    publicNonApplicationAclDriftAfterReset = false,
    publicApplicationAclBaselineEmpty = true,
    publicApplicationAclPostCountValid = true,
    publicDataPresent = false,
    protectedSemanticBaselineValid = true,
    protectedObjectsDriftAfterReset = false,
    protectedSemanticDriftAfterReset = false,
    publicNamespaceClearedValid = true,
    protectedApplicationAclGrantsValid = true,
    reverseAppRoleMembership = false,
    readOnlySystemLockCapabilityValid = true,
    systemDataDriftsBeforeCommit = false,
  } = {}) {
    this.events = [];
    this.history = structuredClone(initialHistory);
    this.pendingHistory = structuredClone(initialHistory);
    this.migrationFails = migrationFails;
    this.targetBypassRls = targetBypassRls;
    this.targetCanCreateRoles = targetCanCreateRoles;
    this.baselineFingerprintValid = baselineFingerprintValid;
    this.schemaMemberFingerprintValid = schemaMemberFingerprintValid;
    this.schemaLessFingerprintValid = schemaLessFingerprintValid;
    this.schemaLessClassesValid = schemaLessClassesValid;
    this.schemaLessApplicationInternalOnly =
      schemaLessApplicationInternalOnly;
    this.publicationsValid = publicationsValid;
    this.publicationsDriftAfterReset = publicationsDriftAfterReset;
    this.eventTriggersValid = eventTriggersValid;
    this.eventTriggersDriftAfterReset = eventTriggersDriftAfterReset;
    this.publicDefaultAclsValid = publicDefaultAclsValid;
    this.publicDefaultAclsDriftAfterReset =
      publicDefaultAclsDriftAfterReset;
    this.catalogValid = catalogValid;
    this.publicOidValid = publicOidValid;
    this.publicOidDriftAfterReset = publicOidDriftAfterReset;
    this.externalDependenciesAbsent = externalDependenciesAbsent;
    this.publicNonApplicationAclBaselineValid =
      publicNonApplicationAclBaselineValid;
    this.publicNonApplicationAclDriftAfterReset =
      publicNonApplicationAclDriftAfterReset;
    this.publicApplicationAclBaselineEmpty =
      publicApplicationAclBaselineEmpty;
    this.publicApplicationAclPostCountValid =
      publicApplicationAclPostCountValid;
    this.publicDataPresent = publicDataPresent;
    this.protectedSemanticBaselineValid = protectedSemanticBaselineValid;
    this.protectedObjectsDriftAfterReset = protectedObjectsDriftAfterReset;
    this.protectedSemanticDriftAfterReset =
      protectedSemanticDriftAfterReset;
    this.publicNamespaceClearedValid = publicNamespaceClearedValid;
    this.protectedApplicationAclGrantsValid =
      protectedApplicationAclGrantsValid;
    this.reverseAppRoleMembership = reverseAppRoleMembership;
    this.readOnlySystemLockCapabilityValid =
      readOnlySystemLockCapabilityValid;
    this.systemDataDriftsBeforeCommit = systemDataDriftsBeforeCommit;
    this.systemDataCheckCount = 0;
    this.schemaRebuilt = false;
    this.pendingSchemaRebuilt = false;
  }

  async query(query) {
    const sql = typeof query === "string" ? query : query.text;
    const normalized = sql.replace(/\s+/gu, " ").trim();
    this.events.push(normalized);
    if (normalized === "select 1;" && this.migrationFails) {
      throw new Error("fixed migration failure");
    }
    if (normalized === "begin isolation level read committed") {
      this.pendingHistory = [...this.history];
      this.pendingSchemaRebuilt = this.schemaRebuilt;
    }
    if (normalized === "rollback") {
      this.pendingHistory = [...this.history];
      this.pendingSchemaRebuilt = this.schemaRebuilt;
    }
    if (normalized === "commit") {
      this.history = [...this.pendingHistory];
      this.schemaRebuilt = this.pendingSchemaRebuilt;
    }
    if (typeof query === "object" && normalized.startsWith("insert into")) {
      this.pendingHistory.push({
        version: query.values[0],
        name: query.values[1],
        statements: query.values[2],
      });
    }
    if (normalized.includes("pg_try_advisory_xact_lock")) {
      return {
        rowCount: 1,
        rows: [{
          current_user: "postgres",
          session_user: "postgres",
          database_name: "postgres",
          application_name: POLICY.applicationName,
          postgres_major: 17,
          role_bypass_rls: this.targetBypassRls,
          role_can_create_roles: this.targetCanCreateRoles,
          ssl_active: true,
          migration_lock: true,
        }],
      };
    }
    if (
      normalized.includes("as non_application_acl_sha256") &&
      normalized.includes("as application_acl_count") &&
      normalized.includes("where namespace.nspname = 'public'")
    ) {
      const expectedApplicationAclCount =
        POLICY.protectedApplicationAclGrants.filter((grant) =>
          grant.startsWith("schema|public|")
        ).length;
      let nonApplicationAclSha256 =
        POLICY.disposablePreviewBaselinePublicNonApplicationAclSha256;
      if (
        !this.pendingSchemaRebuilt &&
        !this.publicNonApplicationAclBaselineValid
      ) {
        nonApplicationAclSha256 = "invalid";
      } else if (
        this.pendingSchemaRebuilt &&
        this.publicNonApplicationAclDriftAfterReset
      ) {
        nonApplicationAclSha256 = "c".repeat(64);
      }
      return {
        rowCount: 1,
        rows: [{
          public_oid:
            this.publicOidDriftAfterReset && this.pendingSchemaRebuilt
              ? "2201"
              : "2200",
          public_owner: "pg_database_owner",
          public_comment: POLICY.disposablePreviewBaselinePublicComment,
          non_application_acl_sha256: nonApplicationAclSha256,
          application_acl_count: this.pendingSchemaRebuilt
            ? (this.publicApplicationAclPostCountValid
                ? expectedApplicationAclCount
                : expectedApplicationAclCount + 1)
            : (this.publicApplicationAclBaselineEmpty ? 0 : 1),
        }],
      };
    }
    if (
      normalized.includes("as history_count") &&
      normalized.includes("as history_sha256")
    ) {
      return {
        rowCount: 1,
        rows: [{
          history_count: this.baselineFingerprintValid
            ? POLICY.disposablePreviewBaselineMigrationCount
            : 18,
          history_sha256: this.baselineFingerprintValid
            ? POLICY.disposablePreviewBaselineHistorySha256
            : "0".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("public_objects(kind, identity, definition)") &&
      normalized.includes("as catalog_sha256")
    ) {
      return {
        rowCount: 1,
        rows: [{
          object_count:
            POLICY.disposablePreviewBaselinePublicCatalogObjectCount,
          catalog_sha256:
            POLICY.disposablePreviewBaselinePublicCatalogSha256,
        }],
      };
    }
    if (
      normalized.includes("schema_members as (") &&
      normalized.includes("as members_sha256")
    ) {
      return {
        rowCount: 1,
        rows: [{
          member_count: this.schemaMemberFingerprintValid
            ? POLICY.disposablePreviewBaselinePublicSchemaMemberCount
            : POLICY.disposablePreviewBaselinePublicSchemaMemberCount + 1,
          members_sha256: this.schemaMemberFingerprintValid
            ? POLICY.disposablePreviewBaselinePublicSchemaMembersSha256
            : "0".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("schema_less_dependents as (") &&
      normalized.includes("as dependency_classes") &&
      normalized.includes("as application_internal_only")
    ) {
      const dependencyClasses = structuredClone(
        POLICY.disposablePreviewBaselineSchemaLessDependencyClasses,
      );
      if (!this.schemaLessClassesValid) {
        dependencyClasses[0].count += 1;
      }
      return {
        rowCount: 1,
        rows: [{
          dependency_count: this.schemaLessFingerprintValid
            ? POLICY.disposablePreviewBaselineSchemaLessDependencyCount
            : POLICY.disposablePreviewBaselineSchemaLessDependencyCount + 1,
          dependencies_sha256: this.schemaLessFingerprintValid
            ? POLICY.disposablePreviewBaselineSchemaLessDependenciesSha256
            : "0".repeat(64),
          dependency_classes: dependencyClasses,
          application_internal_only:
            this.schemaLessApplicationInternalOnly,
        }],
      };
    }
    if (
      normalized.includes("publication_records as (") &&
      normalized.includes("as namespace_memberships_sha256")
    ) {
      const valid = this.publicationsValid &&
        !(this.publicationsDriftAfterReset && this.pendingSchemaRebuilt);
      return {
        rowCount: 1,
        rows: [{
          publication_count: valid
            ? POLICY.disposablePreviewBaselinePublicationCount
            : POLICY.disposablePreviewBaselinePublicationCount + 1,
          publications_sha256: valid
            ? POLICY.disposablePreviewBaselinePublicationsSha256
            : "5".repeat(64),
          namespace_membership_count: valid
            ? POLICY.disposablePreviewBaselinePublicationNamespaceCount
            : POLICY.disposablePreviewBaselinePublicationNamespaceCount + 1,
          namespace_memberships_sha256: valid
            ? POLICY.disposablePreviewBaselinePublicationNamespacesSha256
            : "6".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("from pg_catalog.pg_event_trigger as event_trigger") &&
      normalized.includes("as event_triggers_sha256")
    ) {
      const valid = this.eventTriggersValid &&
        !(this.eventTriggersDriftAfterReset && this.pendingSchemaRebuilt);
      return {
        rowCount: 1,
        rows: [{
          event_trigger_count: valid
            ? POLICY.disposablePreviewBaselineEventTriggerCount
            : POLICY.disposablePreviewBaselineEventTriggerCount + 1,
          event_triggers_sha256: valid
            ? POLICY.disposablePreviewBaselineEventTriggersSha256
            : "7".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("from pg_catalog.pg_default_acl as default_acl") &&
      normalized.includes("as default_acls_sha256")
    ) {
      const valid = this.publicDefaultAclsValid &&
        !(this.publicDefaultAclsDriftAfterReset && this.pendingSchemaRebuilt);
      return {
        rowCount: 1,
        rows: [{
          default_acl_count: valid
            ? POLICY.disposablePreviewBaselinePublicDefaultAclCount
            : POLICY.disposablePreviewBaselinePublicDefaultAclCount + 1,
          default_acls_sha256: valid
            ? POLICY.disposablePreviewBaselinePublicDefaultAclsSha256
            : "8".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("as public_tables") &&
      normalized.includes("as external_dependencies_absent")
    ) {
      const emptyChecks = {
        auth_users_empty: true,
        auth_identities_empty: true,
        auth_sessions_empty: true,
        auth_refresh_tokens_empty: true,
        auth_mfa_factors_empty: true,
        auth_mfa_challenges_empty: true,
        auth_mfa_amr_claims_empty: true,
        storage_buckets_empty: true,
        storage_objects_empty: true,
        storage_multipart_uploads_empty: true,
        storage_multipart_parts_empty: true,
        storage_vector_indexes_empty: true,
        vault_secrets_empty: true,
      };
      return {
        rowCount: 1,
        rows: [{
          schema_names: this.catalogValid
            ? [...POLICY.disposablePreviewBaselineSchemas]
            : ["unexpected"],
          public_tables: [...POLICY.disposablePreviewBaselinePublicTables],
          public_oid: this.publicOidValid ? "2200" : null,
          public_owner: "pg_database_owner",
          public_acl: POLICY.disposablePreviewBaselinePublicAcl,
          public_comment: POLICY.disposablePreviewBaselinePublicComment,
          public_extensions_absent: true,
          public_publications_absent: true,
          external_dependencies_absent: this.externalDependenciesAbsent,
          application_roles_absent: true,
          ...emptyChecks,
        }],
      };
    }
    if (
      normalized.startsWith("lock table public.access_codes,") &&
      normalized.endsWith("in access exclusive mode")
    ) {
      return { rowCount: null, rows: [] };
    }
    if (normalized.includes("DISPOSABLE_PREVIEW_APPLICATION_DATA_PRESENT")) {
      if (this.publicDataPresent) throw new Error("fixed application data");
      return { rowCount: null, rows: [] };
    }
    if (
      normalized.startsWith("lock table auth.users,") ||
      normalized === "lock table storage.vector_indexes in access share mode"
    ) {
      return { rowCount: null, rows: [] };
    }
    if (
      normalized.includes("as owner_role_settable") &&
      normalized.includes("relation.relname = 'vector_indexes'")
    ) {
      return {
        rowCount: 1,
        rows: [{
          relkind: "r",
          owner: "supabase_storage_admin",
          can_select: true,
          can_insert: false,
          can_update: false,
          can_delete: false,
          can_truncate: false,
          can_maintain: false,
          owner_role_settable: !this.readOnlySystemLockCapabilityValid,
        }],
      };
    }
    if (
      normalized.includes("as protected_objects_sha256") &&
      normalized.includes("as system_security_sha256")
    ) {
      return {
        rowCount: 1,
        rows: [{
          schemas_sha256: "1".repeat(64),
          extensions_sha256: "2".repeat(64),
          protected_objects_sha256:
            this.protectedObjectsDriftAfterReset && this.pendingSchemaRebuilt
              ? "9".repeat(64)
              : "3".repeat(64),
          system_security_sha256: "4".repeat(64),
        }],
      };
    }
    if (
      normalized.includes("protected_records(kind, identity, definition) as (") &&
      normalized.includes("as semantic_sha256")
    ) {
      const baselineValid = this.protectedSemanticBaselineValid ||
        this.pendingSchemaRebuilt;
      return {
        rowCount: 1,
        rows: [{
          record_count: baselineValid ? 1_024 : 0,
          semantic_sha256:
            this.protectedSemanticDriftAfterReset &&
              this.pendingSchemaRebuilt
              ? "a".repeat(64)
              : "5".repeat(64),
        }],
      };
    }
    if (
      normalized.startsWith("with application_acl_grants(") &&
      normalized.includes("as grant_count") &&
      normalized.includes("as grants")
    ) {
      const grants = [...POLICY.protectedApplicationAclGrants];
      if (!this.protectedApplicationAclGrantsValid) {
        grants[0] = `${grants[0]}-drift`;
      }
      return {
        rowCount: 1,
        rows: [{
          grant_count: POLICY.protectedApplicationAclGrants.length,
          grants,
        }],
      };
    }
    if (
      normalized.startsWith("drop function ") &&
      normalized.endsWith(" cascade")
    ) {
      return { rowCount: null, rows: [] };
    }
    if (
      normalized.startsWith("drop table public.access_codes,") &&
      normalized.endsWith(" cascade")
    ) {
      this.pendingSchemaRebuilt = true;
      return { rowCount: null, rows: [] };
    }
    if (
      normalized.includes("as remaining_member_count") &&
      normalized.includes("as remaining_default_acl_count") &&
      normalized.includes("as unexpected_member_count")
    ) {
      return {
        rowCount: 1,
        rows: [{
          remaining_member_count:
            POLICY.disposablePreviewBaselinePublicDefaultAclCount,
          remaining_default_acl_count:
            POLICY.disposablePreviewBaselinePublicDefaultAclCount,
          unexpected_member_count:
            this.publicNamespaceClearedValid ? 0 : 1,
        }],
      };
    }
    if (normalized === "delete from supabase_migrations.schema_migrations") {
      this.pendingHistory = [];
      return { rowCount: null, rows: [] };
    }
    if (normalized.startsWith("select version,")) {
      return { rowCount: this.pendingHistory.length, rows: [...this.pendingHistory] };
    }
    if (
      normalized.startsWith("select (select pg_catalog.count(*) = 0 from auth.users)")
    ) {
      this.systemDataCheckCount += 1;
      const finalCheckDrifted = this.systemDataDriftsBeforeCommit &&
        this.systemDataCheckCount === 2;
      return {
        rowCount: 1,
        rows: [{
          auth_users_empty: true,
          auth_identities_empty: true,
          auth_sessions_empty: true,
          auth_refresh_tokens_empty: true,
          auth_mfa_factors_empty: true,
          auth_mfa_challenges_empty: true,
          auth_mfa_amr_claims_empty: true,
          storage_buckets_empty: true,
          storage_objects_empty: true,
          storage_multipart_uploads_empty: true,
          storage_multipart_parts_empty: true,
          storage_vector_indexes_empty: !finalCheckDrifted,
          vault_secrets_empty: true,
        }],
      };
    }
    if (
      normalized.includes("namespace.nspname::pg_catalog.text") &&
      normalized.includes("as schema_names") &&
      normalized.endsWith("namespace.nspname <> 'information_schema'")
    ) {
      return {
        rowCount: 1,
        rows: [{
          schema_names: [
            ...POLICY.disposablePreviewBaselineSchemas.filter((schema) =>
              schema !== "public"
            ),
            ...POLICY.rebuiltApplicationSchemas,
          ].sort(),
        }],
      };
    }
    if (
      normalized.startsWith("select role_record.rolname,") &&
      normalized.includes("as bootstrap_edge_safe")
    ) {
      return {
        rowCount: POLICY.applicationRoles.length,
        rows: POLICY.applicationRoles.map((rolname) => ({
          rolname,
          attributes_safe: true,
          one_membership: true,
          no_member_edges: !this.reverseAppRoleMembership,
          bootstrap_edge_safe: true,
        })),
      };
    }
    if (normalized.includes("temporary_roles_absent")) {
      return {
        rowCount: 1,
        rows: [{
          temporary_roles_absent: true,
          authorizations_empty: true,
          revocations_empty: true,
          claims_empty: true,
          reservations_empty: true,
          receipts_empty: true,
          terminals_empty: true,
        }],
      };
    }
    return { rowCount: null, rows: [] };
  }
}
