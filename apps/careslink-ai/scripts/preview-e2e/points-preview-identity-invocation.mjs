import { assertDeploymentCleanupPolicyRegression } from "./deployment-cleanup-policy.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_CONTROL_POLICY as BRANCH_POLICY,
  selectCommunicationNoteDisposablePreviewBranch,
} from "./communication-note-preview-disposable-branch-control.mjs";
import {
  POINTS_PREVIEW_IDENTITY_POLICY as POLICY,
  POINTS_PREVIEW_IDENTITY_PROOF_SQL,
  PointsPreviewIdentityError,
  diagnosePointsPreviewIdentity,
  isPointsPreviewUserId,
} from "./points-preview-identity-policy.mjs";

function ready(raw, selection) {
  const target = selectCommunicationNoteDisposablePreviewBranch(raw, selection);
  // The validated converter returns pipelineStatus, not the raw CLI's status.
  if (target.pipelineStatus !== BRANCH_POLICY.readyPipelineStatus ||
      target.previewProjectStatus !== BRANCH_POLICY.readyPreviewProjectStatus) {
    throw new Error("BRANCH_NOT_READY");
  }
  return target;
}

/**
 * Credential-free composition with NO default network, CLI or database adapters.
 * The caller must bind readIdentityProof to its already verified TLS connection
 * and derive projectRef from that connection descriptor (not from this request).
 * Creation, session proof, business tests and finally cleanup remain the owner’s
 * job. This routine never retries or changes an account, grant, flag or schema.
 */
export async function runPointsPreviewIdentityCheck(options) {
  assertDeploymentCleanupPolicyRegression();
  let checkpoint = "arguments";
  let diagnostics;
  try {
    const { expectedUserId, selection, authResponse, readCliOutput, readIdentityProof } = options;
    if (!isPointsPreviewUserId(expectedUserId) ||
        typeof readCliOutput !== "function" || typeof readIdentityProof !== "function") {
      throw new Error("INVALID_ARGUMENTS");
    }
    // Snapshot all target coordinates before any awaited adapter can mutate them.
    const lockedSelection = Object.freeze({ ...selection });
    if (Object.keys(lockedSelection).length !== 4 ||
        lockedSelection.productionProjectRef !== BRANCH_POLICY.productionProjectRef ||
        !isPointsPreviewUserId(lockedSelection.lockedId) ||
        typeof lockedSelection.lockedRef !== "string" ||
        !/^[a-z0-9]{20}$/.test(lockedSelection.lockedRef) ||
        lockedSelection.lockedRef === BRANCH_POLICY.productionProjectRef ||
        typeof lockedSelection.expectedName !== "string" ||
        lockedSelection.expectedName.length < 1 || lockedSelection.expectedName.length > 255 ||
        /[\u0000-\u001f\u007f]/.test(lockedSelection.expectedName)) {
      throw new Error("INVALID_SELECTION");
    }
    checkpoint = "cli_version";
    if ((await readCliOutput(["--version"])).trim() !== POLICY.supabaseCliVersion) {
      throw new Error("CLI_VERSION_MISMATCH");
    }
    const listArguments = Object.freeze([
      "branches", "list", "--project-ref", BRANCH_POLICY.productionProjectRef, "-o", "json",
    ]);
    checkpoint = "branch_before_query";
    const target = ready(await readCliOutput([...listArguments]), lockedSelection);
    checkpoint = "database_query";
    // Query the pre-ledgered expected ID, NEVER a response-supplied identity.
    const proof = await readIdentityProof(Object.freeze({
      expectedBranchRef: target.projectRef,
      text: POINTS_PREVIEW_IDENTITY_PROOF_SQL,
      values: Object.freeze([expectedUserId]),
    }));
    checkpoint = "database_scope";
    if (proof?.projectRef !== target.projectRef) throw new Error("DATABASE_SCOPE_INVALID");
    checkpoint = "branch_after_query";
    ready(await readCliOutput([...listArguments]), lockedSelection);
    checkpoint = "identity";
    // Collect BOTH sources before rejecting, including when the Auth role or
    // confirmation field is invalid. The output remains boolean-only.
    diagnostics = diagnosePointsPreviewIdentity({
      expectedUserId, authResponse, databaseResult: proof.result,
    });
    if (!diagnostics.ok) throw new Error("IDENTITY_REJECTED");
    return diagnostics;
  } catch {
    throw new PointsPreviewIdentityError(checkpoint, diagnostics);
  }
}
