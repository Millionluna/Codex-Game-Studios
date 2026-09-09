import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import { loadPinnedCommunicationNotePreviewMigrations } from "./communication-note-preview-transactional-migrations-policy.mjs";

export const JOB_STATUS_PREVIEW_BATCH = "2026-09-07.job-status-read-preview.2";
export const CALLER = "careslink_v1_generation_job_status_caller";
export const EXECUTOR = "careslink_v1_generation_job_status_executor";
export const STATUS_SQL = `select careslink_v1_generation.get_v1_communication_note_job_status(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`;
export const statusParameters = (owner, session, job) =>
  [owner, session, job, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
export const PROBE_LIMITS = Object.freeze({
  maximumInputBytes: 65536, metadataLifetimeMs: 60000,
  credentialLifetimeMs: 90000, postgresMajor: 17,
  createPreview: false, applyMigrations: false, deletePreview: false,
  insertJobs: false, insertPayloads: false, invokeModel: false,
  mutatePoints: false, installRuntimeAdapter: false,
});

export function parsePreviewArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--check")) {
    return Object.freeze({ mode: "CHECK_ONLY" });
  }
  assert.equal(argv[0], "--execute-authorized-preview");
  const parsed = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(argv.slice(1));
  assert.equal(parsed.expectedPostgresMajor, PROBE_LIMITS.postgresMajor);
  return Object.freeze({ mode: "AUTHORIZED_PREVIEW", ...parsed });
}

export function parsePreviewInput(raw, settings, now = Date.now()) {
  assert.equal(settings.mode, "AUTHORIZED_PREVIEW");
  assert.equal(typeof raw, "string");
  assert.ok(Buffer.byteLength(raw) <= PROBE_LIMITS.maximumInputBytes);
  const value = JSON.parse(raw);
  assert.deepEqual(Object.keys(value).sort(), ["auth", "branch", "observedAt", "scope"]);
  assert.equal(value.scope, JOB_STATUS_PREVIEW_BATCH);
  const observed = Date.parse(value.observedAt);
  assert.ok(Number.isFinite(observed) && observed <= now && now - observed <= PROBE_LIMITS.metadataLifetimeMs);
  assert.deepEqual(Object.keys(value.auth).sort(), ["publishableKey", "secretKey"]);
  for (const key of Object.values(value.auth)) {
    assert.equal(typeof key, "string");
    assert.ok(key.length >= 20 && key.length <= 4096 && /^[A-Za-z0-9_.-]+$/.test(key));
  }
  const target = extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
    JSON.stringify(value.branch), { expectedBranchRef: settings.expectedBranchRef },
  );
  let available = true;
  return Object.freeze({
    descriptor: Object.freeze({ batch: JOB_STATUS_PREVIEW_BATCH, projectRef: settings.expectedBranchRef,
      expiresAt: new Date(observed + PROBE_LIMITS.metadataLifetimeMs).toISOString() }),
    takeSecrets() {
      assert.equal(available, true);
      available = false;
      const auth = value.auth;
      value.auth = undefined;
      return { auth, candidates: target.takeAdminConnectionCandidates() };
    },
  });
}

export async function verifyPreviewSources() {
  const { migrations } = await loadPinnedCommunicationNotePreviewMigrations();
  assert.equal(migrations.length, 47);
  assert.equal(migrations.at(-1).sha256, "cfb2ea76f77c9fd7f28acdd49bdf95e9255c32e25ce8358974b2c6efe14d168c");
  // Data manifest only: this probe does not import or activate any product composition.
  const sourcePins = JSON.parse(await readFile(new URL("./communication-note-job-status-preview-source-pins.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(sourcePins).length, 4);
  for (const [path, expected] of Object.entries(sourcePins)) {
    assert.match(path, /^src\/lib\/(?:v1\/)?[a-z0-9-]+\.server\.ts$/);
    assert.match(expected, /^[a-f0-9]{64}$/);
    const source = await readFile(new URL("../../" + path, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), expected);
  }
  return Object.freeze({ batch: JOB_STATUS_PREVIEW_BATCH, migrations, sourcePins: Object.freeze(sourcePins) });
}
