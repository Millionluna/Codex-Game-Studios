import assert from "node:assert/strict";
import {
  selectCommunicationNoteDisposablePreviewBranch,
} from "./communication-note-preview-disposable-branch-control.mjs";

export const SECURITY_ADVISOR_STEP_TIMEOUT_MS = 30000;
async function bounded(run) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(run), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("ADVISOR_STEP_TIMEOUT")), SECURITY_ADVISOR_STEP_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

/** Read-only Management API / MCP ports. Deliberately never invokes `db advisors`
 * CLI: 2.115.0 requires --linked, whose config resolution can mint a login role.
 * The operator owns resource deletion on any outcome. No fallback or retry.
 */
export async function collectCommunicationNotePreviewSecurityAdvisors({ selection, readBranches, readAdvisors }) {
  const expected = Object.freeze({ ...selection });
  let stage = "target-before";
  const check = async () => {
    const target = selectCommunicationNoteDisposablePreviewBranch(await bounded(readBranches), expected);
    assert.equal(target.previewProjectStatus, "ACTIVE_HEALTHY");
    assert.equal(target.pipelineStatus, "FUNCTIONS_DEPLOYED");
    return target;
  };
  try {
    const target = await check();
    stage = "collect";
    const raw = await bounded(() => readAdvisors(Object.freeze({ project_id: target.projectRef, type: "security" })));
    stage = "target-after";
    await check();
    stage = "parse";
    const report = parseCommunicationNotePreviewSecurityAdvisors(raw);
    return Object.freeze({ ok: true, stage: "complete", ...report });
  } catch { return Object.freeze({ ok: false, stage, securityReviewPassed: false }); }
}

export function parseCommunicationNotePreviewSecurityAdvisors(raw) {
  assert.equal(typeof raw, "string"); assert.ok(Buffer.byteLength(raw) <= 1024 * 1024);
  let value = JSON.parse(raw);
  // MCP responses are tool envelopes, not CLI arrays or CLI success/results envelopes.
  if (value && Object.hasOwn(value, "content")) {
    assert.notEqual(value.isError, true);
    assert.ok(Array.isArray(value.content) && value.content.length === 1);
    assert.equal(value.content[0].type, "text");
    assert.equal(typeof value.content[0].text, "string");
    value = JSON.parse(value.content[0].text);
  }
  assert.ok(value && !Array.isArray(value) && Object.keys(value).length === 1);
  assert.ok(Array.isArray(value.lints) && value.lints.length <= 10000);
  const findings = value.lints.map(item => {
    assert.ok(item && typeof item === "object" && !Array.isArray(item));
    assert.equal(typeof item.name, "string"); assert.match(item.name, /^[a-z0-9_]{1,128}$/);
    assert.ok(["INFO", "WARN", "ERROR"].includes(item.level));
    assert.equal(typeof item.remediation, "string");
    const url = new URL(item.remediation);
    assert.equal(url.origin, "https://supabase.com");
    assert.equal(url.username, ""); assert.equal(url.password, "");
    assert.equal(url.pathname, "/docs/guides/database/database-linter");
    assert.equal(url.hash, "");
    assert.deepEqual([...url.searchParams.keys()], ["lint"]);
    assert.match(url.searchParams.get("lint"), /^\d{4}_[a-z0-9_]{1,128}$/);
    // No backend descriptions, table names, metadata, error bodies or arbitrary query strings.
    return Object.freeze({ name: item.name, level: item.level, remediation: url.href });
  });
  return Object.freeze({ findings: Object.freeze(findings), findingCount: findings.length,
    securityReviewPassed: findings.length === 0 });
}
