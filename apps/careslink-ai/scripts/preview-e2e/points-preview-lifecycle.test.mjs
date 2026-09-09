import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { runPointsPreviewLifecycle as run, POINTS_PREVIEW_LIFECYCLE as POLICY,
  POINTS_PREVIEW_LIFECYCLE_ADAPTERS as ADAPTERS, POINTS_PREVIEW_BACKEND_CHECKS,
  POINTS_PREVIEW_BROWSER_CHECKS, PointsPreviewTransportError } from "./points-preview-lifecycle.mjs";
import { POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS } from "./points-preview-identity-policy.mjs";
import { COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY as BRANCH } from "./communication-note-preview-disposable-branch-control.mjs";

const REF = "abcdefghijklmnopqrst";
const BRANCH_ID = "11111111-1111-4111-8111-111111111111";
const USER_IDS = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const PROJECT = "prj_synthetic", TEAM = "team_synthetic", NAME = "synthetic-points-lifecycle";
const ID = "dpl_synthetic", SECRET = "sentinel-private-lifecycle-data-never-log";
const flags = (keys) => Object.fromEntries(keys.map((key) => [key, true]));
const branch = (override = {}) => ({ id: BRANCH_ID, name: NAME, project_ref: REF,
  parent_project_ref: BRANCH.productionProjectRef, is_default: false, persistent: false,
  with_data: false, status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY",
  created_at: "2026-09-06T00:00:00Z", updated_at: "2026-09-06T00:00:00Z", ...override });
const primary = () => branch({ id: "99999999-9999-4999-8999-999999999999", name: "main",
  project_ref: BRANCH.productionProjectRef, is_default: true });

async function harness() {
  const events = [], ledgers = [], timers = new Set(); let time = 1_000_000;
  const state = { branch: false, deployment: false, database: false, users: new Set(), points: false,
    gateClosed: false, revoked: false, localDeleted: false, branchOverrides: {} };
  const clock = {
    now: () => time,
    advance(ms) { time += ms; for (const timer of [...timers]) if (timer.deadline <= time) {
      timers.delete(timer); timer.callback();
    } },
    sleep: vi.fn(async (ms) => { events.push({ name: "sleep", ms }); clock.advance(ms); }),
    arm(deadline, callback) { const timer = { deadline, callback }; timers.add(timer); return () => timers.delete(timer); },
  };
  const configuration = {
    sourceCommit: "a".repeat(40), sourceTree: "b".repeat(40),
    lifecycleSha256: createHash("sha256").update(await readFile(new URL("./points-preview-lifecycle.mjs", import.meta.url))).digest("hex"),
    branchName: NAME, teamId: TEAM, userIds: USER_IDS, maximumWindowMs: 7200000,
    deployment: { projectId: PROJECT, teamSlug: "synthetic-team", stagingDirectory: "/private/synthetic-stage",
      runMarker: NAME, environmentNames: ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"] },
  };
  const list = () => JSON.stringify([primary(), ...(state.branch ? [branch(state.branchOverrides)] : [])]);
  const detail = () => ({ id: ID, projectId: PROJECT, ownerId: TEAM, team: { id: TEAM },
    meta: { careslinkPointsRun: NAME }, target: null, createdAt: 1000000,
    url: "synthetic-preview.vercel.app",
    projectSettings: { nodeVersion: "24.x" }, readyState: "READY" });
  const item = () => ({ uid: ID, projectId: PROJECT, created: 1000000, meta: { careslinkPointsRun: NAME } });
  const implementations = {
    readSourceFile: (name) => readFile(new URL(name, import.meta.url)),
    preflight: async () => ({ ok: true, sourceCommit: configuration.sourceCommit,
      sourceTree: configuration.sourceTree, uploadPinned: true, protectedPreview: true,
      modelDisabled: true, vercelCliVersion: "59.5.0" }),
    writeLedger: async (ledger) => { ledgers.push(ledger); return { ok: true }; },
    readCliOutput: async (argv) => argv[0] === "--version" ? "2.115.0" : list(),
    createBranch: async () => { state.branch = true; return { ignored: "not-a-readiness-proof" }; },
    migrate: async () => ({ ok: true, migrations: 46, manifestSha256: POLICY.migrationManifest }),
    openDatabase: async () => { state.database = true; return { projectRef: REF, tlsVerified: true }; },
    assertDataZero: async () => ({ ok: state.users.size === 0 && !state.points }),
    createUser: async (input) => { state.users.add(input.user.id); return { status: 201, body: {
      id: input.user.id, aud: "authenticated", role: "authenticated", email_confirmed_at: "2099-01-01T00:00:00Z",
      is_anonymous: false, app_metadata: input.appMetadata, email: SECRET, password: SECRET,
    } }; },
    readIdentityProof: async () => ({ projectRef: REF, result: { rowCount: 1,
      rows: [flags(POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS)] } }),
    seedPoints: async () => { state.points = true; return { ok: true }; },
    runBackendChecks: async () => ({ accounts: 2, ...flags(POINTS_PREVIEW_BACKEND_CHECKS) }),
    createDeployment: async () => { state.deployment = true; return JSON.stringify({ id: ID,
      url: "https://synthetic-preview.vercel.app", target: null, readyState: "QUEUED" }); },
    getDeployment: async () => state.deployment ? { status: 200, body: detail() } :
      { status: 404, body: { error: { code: "not_found" } } },
    listDeployments: async () => ({ status: 200, body: { deployments: state.deployment ? [item()] : [], pagination: { next: null } } }),
    runBrowserChecks: async () => flags(POINTS_PREVIEW_BROWSER_CHECKS),
    assertPointsUnchanged: async () => ({ ok: true }),
    quiesce: async () => ({ quiescent: true, absenceNotBeforeMs: clock.now() }),
    closeDatabaseGate: async () => { state.gateClosed = true; return { ok: true }; },
    revokeSessions: async () => { state.revoked = true; return { ok: true }; },
    deleteDeployment: async () => { state.deployment = false; return { status: 200, body: { uid: ID } }; },
    deletePointRows: async () => { state.points = false; return { ok: true }; },
    deleteUser: async (input) => { state.users.delete(input.user.id); return { ok: true }; },
    closeDatabase: async () => { state.database = false; return { ok: true }; },
    deleteBranch: async () => { state.branch = false; return { ok: true }; },
    deleteLocalArtifacts: async () => { state.localDeleted = true; return { ok: true }; },
  };
  const adapters = Object.fromEntries(ADAPTERS.map((name) => [name, vi.fn(async (input, meta) => {
    events.push({ name, input, deadlineMs: meta.deadlineMs, timeoutMs: meta.timeoutMs, at: clock.now() });
    return implementations[name](input, meta);
  })]));
  return { configuration, adapters, clock, state, events, ledgers, implementations, timers, list, item, detail,
    options: { configuration, adapters, clock } };
}
function noLeak(result) { const text = JSON.stringify(result);
  for (const forbidden of [REF, BRANCH_ID, ...USER_IDS, NAME, ID, PROJECT, TEAM, SECRET]) expect(text).not.toContain(forbidden);
}

describe("Points Preview complete lifecycle, injected offline adapters only", () => {
  it("wires the fixed modules through both accounts, backend, browser and ordered finally cleanup", async () => {
    const h = await harness(); const result = await run(h.options);
    expect(result).toMatchObject({ ok: true, businessPassed: true, cleanupComplete: true, failure: null });
    expect(h.adapters.createBranch).toHaveBeenCalledOnce(); expect(h.adapters.createUser).toHaveBeenCalledTimes(2);
    expect(h.adapters.createDeployment).toHaveBeenCalledOnce(); expect(h.adapters.readIdentityProof).toHaveBeenCalledTimes(2);
    expect(h.ledgers[0]).toMatchObject({ branchAttempted: true, users: [] });
    const names = h.events.map((event) => event.name);
    expect(names.indexOf("writeLedger")).toBeLessThan(names.indexOf("createBranch"));
    for (const [before, after] of [["runBackendChecks", "createDeployment"], ["closeDatabaseGate", "deleteDeployment"],
      ["revokeSessions", "deleteUser"], ["deleteDeployment", "deletePointRows"], ["deletePointRows", "deleteUser"],
      ["deleteUser", "closeDatabase"], ["closeDatabase", "deleteBranch"], ["deleteBranch", "deleteLocalArtifacts"]]) {
      expect(names.indexOf(before)).toBeLessThan(names.indexOf(after));
    }
    const firstUserCreate = names.indexOf("createUser");
    expect(h.events[firstUserCreate - 1].name).toBe("writeLedger");
    expect(h.events[firstUserCreate - 1].input.users).toEqual([{ id: USER_IDS[0], label: "a" }]);
    expect(h.adapters.createUser.mock.calls[0][0].appMetadata).toEqual({ role: "provider", careslink_role: "provider" });
    expect(h.adapters.createDeployment.mock.calls[0][0].arguments).toContain("preview");
    expect(h.adapters.createDeployment.mock.calls[0][0].arguments).not.toContain("--skip-domain");
    expect(h.adapters.createDeployment.mock.calls[0][0].arguments).not.toContain("--dry");
    expect(h.state).toMatchObject({ branch: false, deployment: false, database: false, points: false, localDeleted: true });
    expect(h.state.users.size).toBe(0); expect(h.timers.size).toBe(0);
    expect(JSON.stringify(h.ledgers)).not.toContain(SECRET); noLeak(result);
  });

  it.each(["createBranch", "migrate", "openDatabase", "createUser", "readIdentityProof", "seedPoints",
    "runBackendChecks", "createDeployment", "runBrowserChecks", "assertPointsUnchanged"])(
    "stops at %s, never repeats creation, and still cleans up", async (name) => {
      const h = await harness(); const base = h.implementations[name];
      h.implementations[name] = async (...args) => { await base(...args); throw new Error(SECRET); };
      const result = await run(h.options);
      expect(result.ok).toBe(false); expect(result.businessPassed).toBe(false); expect(result.cleanupComplete).toBe(true);
      expect(h.adapters.createBranch.mock.calls.length).toBeLessThanOrEqual(1);
      expect(h.adapters.createDeployment.mock.calls.length).toBeLessThanOrEqual(1);
      expect(h.state.branch).toBe(false); expect(h.state.deployment).toBe(false); noLeak(result);
    },
  );

  it("records both diagnostic sources and aborts before Points writes when account B is rejected", async () => {
    const h = await harness(), base = h.implementations.createUser;
    h.implementations.createUser = async (input) => { const response = await base(input);
      if (input.user.label === "b") response.body.app_metadata = { careslink_role: "provider" }; return response;
    };
    const result = await run(h.options);
    expect(result).toMatchObject({ ok: false, failure: "user_b", cleanupComplete: true,
      identityDiagnostics: { fields: { response_provider_role_valid: false, database_provider_role_valid: true } } });
    expect(h.adapters.seedPoints).not.toHaveBeenCalled(); expect(h.adapters.createDeployment).not.toHaveBeenCalled();
    expect(h.adapters.readIdentityProof).toHaveBeenCalledTimes(2); noLeak(result);
  });

  it.each(["preflight", "initial_ledger", "source_pins"])("does not create resources after %s failure", async (stage) => {
    const h = await harness();
    if (stage === "source_pins") h.configuration.lifecycleSha256 = "0".repeat(64);
    else h.implementations[stage === "initial_ledger" ? "writeLedger" : stage] = async () => { throw new Error(SECRET); };
    const result = await run(h.options); expect(result.failure).toBe(stage);
    expect(h.adapters.createBranch).not.toHaveBeenCalled(); expect(h.adapters.createDeployment).not.toHaveBeenCalled();
    expect(h.adapters.quiesce).not.toHaveBeenCalled(); noLeak(result);
  });

  it("checks source hashes before preflight or reading CLI/environment credentials", async () => {
    const h = await harness(); h.implementations.readSourceFile = async () => Buffer.from("changed");
    const result = await run(h.options); expect(result.failure).toBe("source_pins");
    expect(h.adapters.preflight).not.toHaveBeenCalled(); expect(h.adapters.readCliOutput).not.toHaveBeenCalled();
  });

  it("rejects Supabase CLI drift before persisting the ledger or creating anything", async () => {
    const h = await harness(), base = h.implementations.readCliOutput;
    h.implementations.readCliOutput = async (argv) => argv[0] === "--version" ? "0.0.0" : base(argv);
    expect((await run(h.options)).failure).toBe("preflight");
    expect(h.adapters.writeLedger).not.toHaveBeenCalled(); expect(h.adapters.createBranch).not.toHaveBeenCalled();
  });

  it("requires all adapters and rejects an over-two-hour window before any adapter", async () => {
    for (const type of ["adapter", "window", "ids"]) {
      const h = await harness();
      if (type === "adapter") delete h.adapters.createBranch;
      if (type === "window") h.configuration.maximumWindowMs = 7200001;
      if (type === "ids") h.configuration.userIds = [USER_IDS[0], USER_IDS[0]];
      expect((await run(h.options)).failure).toBe("arguments");
      expect(h.events).toEqual([]);
    }
  });

  it("waits for pending provisioning without recreating the branch", async () => {
    const h = await harness(), base = h.implementations.readCliOutput; let reads = 0;
    h.implementations.readCliOutput = async (argv) => {
      if (h.state.branch && argv[0] !== "--version" && reads++ < 2) {
        return JSON.stringify([primary(), branch({ status: "RUNNING_MIGRATIONS", preview_project_status: "COMING_UP" })]);
      } return base(argv);
    };
    expect((await run(h.options)).ok).toBe(true);
    expect(h.adapters.createBranch).toHaveBeenCalledOnce(); expect(h.clock.sleep).toHaveBeenCalledWith(5000);
  });

  it("stops on failed provisioning, then deletes that exact nondefault branch", async () => {
    const h = await harness(); h.state.branchOverrides.status = "MIGRATIONS_FAILED";
    const result = await run(h.options); expect(result.failure).toBe("branch_ready");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.migrate).not.toHaveBeenCalled();
  });

  it.each(["with_data", "persistent", "is_default"])("denies unsafe branch %s without database access", async (field) => {
    const h = await harness(); h.state.branchOverrides[field] = true;
    const result = await run(h.options); expect(result.ok).toBe(false); expect(result.cleanupComplete).toBe(false);
    expect(h.adapters.openDatabase).not.toHaveBeenCalled(); expect(h.adapters.deleteBranch).not.toHaveBeenCalled();
    expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled();
  });

  it("does not advance to deployment if a mandatory backend check is missing", async () => {
    const h = await harness(); h.implementations.runBackendChecks = async () => ({ accounts: 2 });
    const result = await run(h.options); expect(result.failure).toBe("backend");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.createDeployment).not.toHaveBeenCalled();
  });

  it("does not accept an incomplete browser receipt", async () => {
    const h = await harness(); h.implementations.runBrowserChecks = async () => ({ ownerA: true });
    const result = await run(h.options); expect(result.failure).toBe("browser"); expect(result.cleanupComplete).toBe(true);
  });

  it("recovers malformed deployment output by the unique marker, never creates again", async () => {
    const h = await harness(); h.implementations.createDeployment = async () => { h.state.deployment = true; return SECRET; };
    const result = await run(h.options); expect(result.failure).toBe("create_deployment");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.createDeployment).toHaveBeenCalledOnce();
    expect(h.adapters.deleteDeployment.mock.calls[0][0].id).toBe(ID);
  });

  it("refuses deletion if management ownership disagrees, retains recovery evidence", async () => {
    const h = await harness(); h.implementations.getDeployment = async () => ({ status: 200,
      body: { ...h.detail(), ownerId: "team_other" } });
    const result = await run(h.options); expect(result.failure).toBe("deployment_ready");
    expect(result.cleanupComplete).toBe(false); expect(h.adapters.deleteDeployment).not.toHaveBeenCalled();
    expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled(); noLeak(result);
  });

  it("rejects a CLI URL not bound to the owned deployment before browser access", async () => {
    const h = await harness(), base = h.implementations.getDeployment;
    h.implementations.getDeployment = async (...args) => {
      const response = await base(...args);
      if (response.status === 200) response.body.url = "unrelated-preview.vercel.app";
      return response;
    };
    const result = await run(h.options); expect(result.failure).toBe("deployment_ready");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.runBrowserChecks).not.toHaveBeenCalled();
    expect(h.adapters.deleteDeployment.mock.calls[0][0].id).toBe(ID);
  });

  it("retains in-memory cleanup identity when the post-create ledger write fails", async () => {
    const h = await harness(), base = h.implementations.writeLedger; let failed = false;
    h.implementations.writeLedger = async (ledger) => {
      if (ledger.deploymentId && !failed) { failed = true; throw new Error(SECRET); }
      return base(ledger);
    };
    const result = await run(h.options); expect(result.failure).toBe("create_deployment");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.createDeployment).toHaveBeenCalledOnce();
    expect(h.adapters.runBrowserChecks).not.toHaveBeenCalled(); noLeak(result);
  });

  it("passes the full helper deadline to both observation calls and gathers three spaced samples", async () => {
    const h = await harness(); expect((await run(h.options)).ok).toBe(true);
    const deletionAt = h.events.findIndex((event) => event.name === "deleteDeployment");
    const observations = h.events.slice(deletionAt + 1).filter((event) => ["getDeployment", "listDeployments"].includes(event.name));
    expect(observations.map((event) => event.name)).toEqual(["getDeployment", "listDeployments", "getDeployment", "listDeployments", "getDeployment", "listDeployments"]);
    expect(observations.every((event) => event.deadlineMs === 8200000 && event.timeoutMs === 30000)).toBe(true);
    expect(observations[4].at - observations[0].at).toBe(10000);
  });

  it("resets every zero sample after a classified request failure and waits five seconds", async () => {
    const h = await harness(), base = h.implementations.getDeployment; let absentCalls = 0;
    h.implementations.getDeployment = async (...args) => {
      if (!h.state.deployment && ++absentCalls === 2) throw new PointsPreviewTransportError();
      return base(...args);
    };
    expect((await run(h.options)).ok).toBe(true); expect(absentCalls).toBe(5);
    const afterDelete = h.events.slice(h.events.findIndex((event) => event.name === "deleteDeployment") + 1);
    const reads = afterDelete.filter((event) => event.name === "getDeployment");
    expect(reads.map((event) => event.at - reads[0].at)).toEqual([0, 5000, 10000, 15000, 20000]);
  });

  it.each(["http", "shape", "forged_transport", "not_found"])("never retries non-transport %s deletion evidence", async (kind) => {
    const h = await harness(), base = h.implementations.getDeployment; let absent = 0;
    h.implementations.getDeployment = async (...args) => {
      if (h.state.deployment) return base(...args); absent++;
      if (kind === "forged_transport") throw { code: "VERCEL_API_REQUEST_FAILED", secret: SECRET };
      if (kind === "http") return { status: 503, body: {} };
      return { status: 404, body: kind === "shape" ? {} : { error: { code: "wrong" } } };
    };
    const result = await run(h.options); expect(result.cleanupComplete).toBe(false); expect(absent).toBe(1);
    expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled(); expect(h.adapters.deleteBranch).toHaveBeenCalledOnce(); noLeak(result);
  });

  it("uses full pagination and fails closed when inventory cannot be proven complete", async () => {
    const h = await harness(); h.implementations.listDeployments = async () => ({ status: 200,
      body: { deployments: [], pagination: {} } });
    const result = await run(h.options); expect(result.cleanupErrors).toContain("deployment");
    expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled();
  });

  it("reads every page before accepting each joint absence sample", async () => {
    const h = await harness();
    h.implementations.listDeployments = async ({ until }) => ({ status: 200, body: {
      deployments: until > 1000000 ? [{ uid: "dpl_unrelated", projectId: PROJECT, created: 1000001,
        meta: { careslinkPointsRun: "unrelated" } }] : [],
      pagination: { next: until > 1000000 ? 1000000 : null },
    } });
    expect((await run(h.options)).ok).toBe(true);
    expect(h.adapters.listDeployments).toHaveBeenCalledTimes(6);
    expect(h.adapters.listDeployments.mock.calls.map(([input]) => input.until)).toEqual([
      1000001, 1000000, 1000001, 1000000, 1000001, 1000000,
    ]);
  });

  it.each([1, 999, 5001])("honors the exact %i ms acceptance horizon", async (milliseconds) => {
    const h = await harness(); h.implementations.quiesce = async () => ({ quiescent: true, absenceNotBeforeMs: h.clock.now() + milliseconds });
    expect((await run(h.options)).ok).toBe(true);
    const times = h.clock.sleep.mock.calls.map(([ms]) => ms);
    expect(times[0]).toBe(Math.min(5000, milliseconds));
    if (milliseconds === 5001) expect(times[1]).toBe(1);
  });

  it("times out an in-flight browser adapter, aborts it, and joins before cleanup", async () => {
    const h = await harness(); let resolveBrowser, observedSignal;
    h.implementations.runBrowserChecks = (_input, meta) => {
      observedSignal = meta.signal;
      queueMicrotask(() => h.clock.advance(meta.deadlineMs - h.clock.now()));
      return new Promise((resolve) => { resolveBrowser = resolve; });
    };
    h.implementations.quiesce = async () => { expect(observedSignal.aborted).toBe(true);
      resolveBrowser(flags(POINTS_PREVIEW_BROWSER_CHECKS)); await Promise.resolve();
      return { quiescent: true, absenceNotBeforeMs: h.clock.now() };
    };
    const result = await run(h.options); expect(result.failure).toBe("browser");
    expect(result.cleanupComplete).toBe(true); expect(result.businessPassed).toBe(false);
    expect(h.adapters.assertPointsUnchanged).not.toHaveBeenCalled();
  });

  it("does not claim cleanup or erase evidence while a timed-out create remains unjoined", async () => {
    const h = await harness(); let settle;
    h.implementations.createBranch = (_input, meta) => {
      queueMicrotask(() => h.clock.advance(meta.timeoutMs));
      return new Promise((resolve) => { settle = resolve; });
    };
    const result = await run(h.options); expect(result.failure).toBe("create_branch");
    expect(result.cleanupComplete).toBe(false); expect(result.cleanupErrors).toContain("quiesce");
    expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled(); expect(h.adapters.createBranch).toHaveBeenCalledOnce();
    settle(); await Promise.resolve();
  });

  it("waits for late branch acceptance before recovering a timed-out create exactly once", async () => {
    const h = await harness(); let settle;
    h.implementations.createBranch = (_input, meta) => {
      queueMicrotask(() => h.clock.advance(meta.timeoutMs));
      return new Promise((resolve) => { settle = resolve; });
    };
    h.implementations.quiesce = async () => {
      settle(); await Promise.resolve();
      h.clock.arm(h.clock.now() + 999, () => { h.state.branch = true; });
      return { quiescent: true, absenceNotBeforeMs: h.clock.now() + 999 };
    };
    const result = await run(h.options); expect(result.failure).toBe("create_branch");
    expect(result.cleanupComplete).toBe(true); expect(h.adapters.createBranch).toHaveBeenCalledOnce();
    expect(h.adapters.deleteBranch).toHaveBeenCalledOnce(); expect(h.clock.sleep).toHaveBeenCalledWith(999);
    expect(h.adapters.migrate).not.toHaveBeenCalled();
  });

  it("honors external cancellation, but uses an independent cleanup signal", async () => {
    const h = await harness(), abort = new AbortController(); h.options.signal = abort.signal;
    h.implementations.runBackendChecks = async () => { abort.abort(); return { accounts: 2, ...flags(POINTS_PREVIEW_BACKEND_CHECKS) }; };
    const result = await run(h.options); expect(result.failure).toBe("backend"); expect(result.cleanupComplete).toBe(true);
    expect(h.adapters.createDeployment).not.toHaveBeenCalled();
    expect(h.adapters.deleteBranch.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it.each(["closeDatabaseGate", "revokeSessions", "deleteDeployment", "deletePointRows", "deleteUser", "closeDatabase", "deleteBranch"])(
    "continues independent cleanup after %s failure but preserves local recovery files", async (name) => {
      const h = await harness(); h.implementations[name] = async () => { throw new Error(SECRET); };
      const result = await run(h.options); expect(result.ok).toBe(false); expect(result.cleanupComplete).toBe(false);
      expect(h.adapters.deleteBranch).toHaveBeenCalledOnce(); expect(h.adapters.deleteLocalArtifacts).not.toHaveBeenCalled(); noLeak(result);
    },
  );

  it("freezes adapter inputs so an accidental callback cannot rewrite cleanup identities", async () => {
    const h = await harness(), base = h.implementations.createUser;
    h.implementations.createUser = async (input) => { expect(Object.isFrozen(input.user)).toBe(true);
      expect(() => { input.user.id = USER_IDS[1]; }).toThrow(); return base(input);
    };
    expect((await run(h.options)).ok).toBe(true);
    expect(h.adapters.deleteUser.mock.calls.map(([input]) => input.user.id)).toEqual(USER_IDS);
  });

  it("has no default network, CLI, database or browser implementation", async () => {
    const result = await run(); expect(result.failure).toBe("arguments");
    expect(result.cleanupComplete).toBe(false); expect(result.ok).toBe(false);
    const source = await readFile(new URL("./points-preview-lifecycle.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(fetch|execFile|spawn|createRequire|writeFile|readFile)\s*\(/);
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("process.argv");
  });
});
