import { describe, expect, it, vi } from "vitest";
import { runPointsPreviewIdentityCheck as run } from "./points-preview-identity-invocation.mjs";
import { POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS as FIELDS,
  POINTS_PREVIEW_IDENTITY_PROOF_SQL as SQL,
  POINTS_PREVIEW_PROVIDER_APP_METADATA as METADATA,
  PointsPreviewIdentityError } from "./points-preview-identity-policy.mjs";
import { COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY as BRANCH } from "./communication-note-preview-disposable-branch-control.mjs";

const REF = "abcdefghijklmnopqrst", OTHER = "bcdefghijklmnopqrstu";
const BRANCH_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const NAME = "careslink-points-offline-synthetic";
const SECRET = "sentinel-invocation-private-data-never-log";
const selection = { expectedName: NAME, productionProjectRef: BRANCH.productionProjectRef,
  lockedId: BRANCH_ID, lockedRef: REF };
function branch(overrides = {}) { return { id: BRANCH_ID, name: NAME, project_ref: REF,
  parent_project_ref: BRANCH.productionProjectRef, is_default: false, persistent: false,
  with_data: false, status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY",
  created_at: "2026-09-06T00:00:00Z", updated_at: "2026-09-06T00:00:00Z", ...overrides }; }
function inventory(overrides = {}) { return JSON.stringify([
  branch({ id: "99999999-9999-4999-8999-999999999999", name: "main",
    project_ref: BRANCH.productionProjectRef, is_default: true }), branch(overrides),
]); }
function harness() {
  const events = [];
  const readCliOutput = vi.fn(async (argv) => {
    events.push([...argv]); return argv[0] === "--version" ? "2.115.0\n" : inventory();
  });
  const readIdentityProof = vi.fn(async () => { events.push("query"); return { projectRef: REF,
    result: { rowCount: 1, rows: [Object.fromEntries(FIELDS.map((key) => [key, true]))] } }; });
  const options = { expectedUserId: USER_ID, selection: { ...selection }, readCliOutput, readIdentityProof,
    authResponse: { status: 200, body: { id: USER_ID, aud: "authenticated", role: "authenticated",
      email_confirmed_at: "2099-01-01T00:00:00Z", is_anonymous: false,
      app_metadata: { ...METADATA }, email: SECRET } } };
  return { options, events, readCliOutput, readIdentityProof };
}
async function rejected(h, checkpoint) {
  const promise = run(h.options);
  await expect(promise).rejects.toBeInstanceOf(PointsPreviewIdentityError);
  await expect(promise).rejects.toMatchObject({ code: "POINTS_PREVIEW_IDENTITY_FAILED", checkpoint });
  await promise.catch((e) => {
    expect(`${e.stack}${JSON.stringify(e)}`).not.toContain(SECRET);
    expect(e.cause).toBeUndefined();
  });
}

describe("versioned Points fixture gate composition", () => {
  it("maps raw CLI status to pipelineStatus and re-attests around exactly one query", async () => {
    const h = harness(); const evidence = await run(h.options);
    expect(evidence.ok).toBe(true);
    const list = ["branches", "list", "--project-ref", BRANCH.productionProjectRef, "-o", "json"];
    expect(h.events).toEqual([["--version"], list, "query", list]);
    expect(h.readIdentityProof).toHaveBeenCalledExactlyOnceWith({ expectedBranchRef: REF, text: SQL, values: [USER_ID] });
    expect(JSON.stringify(evidence)).not.toContain(USER_ID);
    expect(JSON.stringify(evidence)).not.toContain(REF);
  });

  it("collects DB fields even when Auth metadata is invalid, then stops without a business call", async () => {
    const h = harness(); delete h.options.authResponse.body.app_metadata.role;
    const business = vi.fn();
    const promise = run(h.options).then(business);
    await expect(promise).rejects.toMatchObject({ checkpoint: "identity", diagnostics: {
      ok: false, fields: { response_provider_role_valid: false, database_provider_role_valid: true },
    } });
    expect(h.readIdentityProof).toHaveBeenCalledOnce();
    expect(h.readCliOutput).toHaveBeenCalledTimes(3);
    expect(business).not.toHaveBeenCalled();
  });

  it("queries the pre-ledgered owner rather than a mismatched Auth response ID", async () => {
    const h = harness(); h.options.authResponse.body.id = SECRET;
    await rejected(h, "identity");
    expect(h.readIdentityProof.mock.calls[0][0].values).toEqual([USER_ID]);
  });

  it.each(["before", "after"])("rejects target drift %s the proof read", async (when) => {
    for (const changed of [{ with_data: true }, { persistent: true }, { is_default: true },
      { status: "RUNNING_MIGRATIONS" }, { preview_project_status: "COMING_UP" },
      { project_ref: OTHER }, { parent_project_ref: OTHER }, { name: "wrong" }]) {
      const h = harness();
      h.readCliOutput.mockResolvedValueOnce("2.115.0");
      if (when === "after") h.readCliOutput.mockResolvedValueOnce(inventory());
      h.readCliOutput.mockResolvedValueOnce(inventory(changed));
      await rejected(h, when === "before" ? "branch_before_query" : "branch_after_query");
      expect(h.readIdentityProof).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
    }
  });

  it.each(["readCliOutput", "readIdentityProof"])("has no implicit live %s adapter", async (key) => {
    const h = harness(); delete h.options[key]; await rejected(h, "arguments");
    expect(h.readCliOutput).not.toHaveBeenCalled(); expect(h.readIdentityProof).not.toHaveBeenCalled();
  });

  it.each(["user", "production", "selection", "name"])("rejects invalid %s arguments before I/O", async (kind) => {
    const h = harness();
    if (kind === "user") h.options.expectedUserId = SECRET;
    if (kind === "production") h.options.selection.lockedRef = BRANCH.productionProjectRef;
    if (kind === "selection") h.options.selection.extra = SECRET;
    if (kind === "name") h.options.selection.expectedName = "invalid\nname";
    await rejected(h, "arguments"); expect(h.readCliOutput).not.toHaveBeenCalled();
    expect(h.readIdentityProof).not.toHaveBeenCalled();
  });

  it("rejects CLI drift without querying", async () => {
    const h = harness(); h.readCliOutput.mockResolvedValueOnce("2.116.0");
    await rejected(h, "cli_version"); expect(h.readIdentityProof).not.toHaveBeenCalled();
  });

  it.each([undefined, OTHER, BRANCH.productionProjectRef])("rejects an unbound database proof", async (projectRef) => {
    const h = harness(); const proof = await h.readIdentityProof(); h.readIdentityProof.mockClear();
    h.readIdentityProof.mockResolvedValue({ ...proof, projectRef });
    await rejected(h, "database_scope"); expect(h.readIdentityProof).toHaveBeenCalledOnce();
  });

  it("retains fixed per-field evidence for a missing DB predicate", async () => {
    const h = harness(); const proof = await h.readIdentityProof(); h.readIdentityProof.mockClear();
    proof.result.rows[0].confirmation_valid = null; h.readIdentityProof.mockResolvedValue(proof);
    await expect(run(h.options)).rejects.toMatchObject({ checkpoint: "identity",
      diagnostics: { fields: { database_confirmation_valid: false } } });
  });

  it.each(["cli", "query"])("sanitizes %s failure and never retries", async (kind) => {
    const h = harness();
    if (kind === "cli") h.readCliOutput.mockRejectedValue(new Error(SECRET));
    else h.readIdentityProof.mockRejectedValue(Object.assign(new Error(SECRET), { detail: SECRET, query: SECRET }));
    await rejected(h, kind === "cli" ? "cli_version" : "database_query");
    expect(h.readIdentityProof).toHaveBeenCalledTimes(kind === "cli" ? 0 : 1);
  });

  it("locks target coordinates against asynchronous caller mutation", async () => {
    const h = harness(); h.readCliOutput.mockImplementation(async (argv) => {
      h.options.selection.lockedRef = OTHER;
      return argv[0] === "--version" ? "2.115.0" : inventory();
    });
    expect((await run(h.options)).ok).toBe(true);
    expect(h.readIdentityProof.mock.calls[0][0].expectedBranchRef).toBe(REF);
  });
});
