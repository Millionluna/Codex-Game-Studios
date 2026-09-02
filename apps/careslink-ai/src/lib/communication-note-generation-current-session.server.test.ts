import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
  createCommunicationNoteGenerationCurrentSessionStatusResolver,
  type CommunicationNoteGenerationAuthenticatedClient,
} from "./communication-note-generation-current-session.server";

vi.mock("server-only", () => ({}));

describe("Communication Note authenticated current-session RPC", () => {
  it.each(["ACTIVE", "REVOKED"] as const)(
    "accepts only the exact %s status from the zero-argument RPC",
    async (status) => {
      const rpc = vi.fn(async () => ({ data: status, error: null }));
      const resolver =
        createCommunicationNoteGenerationCurrentSessionStatusResolver(
          clientWithRpc(rpc),
        );

      await expect(resolver()).resolves.toBe(status);
      expect(rpc).toHaveBeenCalledWith(
        COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
      );
      expect(rpc.mock.calls[0]).toHaveLength(1);
    },
  );

  it.each([
    ["null result", null],
    ["undefined result", undefined],
    ["array result", [{ data: "ACTIVE", error: null }]],
    ["missing error", { data: "ACTIVE" }],
    ["undefined error", { data: "ACTIVE", error: undefined }],
    ["missing data", { error: null }],
    ["lowercase status", { data: "active", error: null }],
    ["padded status", { data: "ACTIVE ", error: null }],
    ["unavailable status", { data: "UNAVAILABLE", error: null }],
    ["object status", { data: { status: "ACTIVE" }, error: null }],
    ["error with active data", { data: "ACTIVE", error: { message: "private" } }],
  ])("fails closed for %s", async (_name, result) => {
    const resolver =
      createCommunicationNoteGenerationCurrentSessionStatusResolver(
        clientWithRpc(vi.fn(async () => result)),
      );

    await expect(resolver()).resolves.toBe("UNAVAILABLE");
  });

  it("fails closed when the RPC throws", async () => {
    const resolver =
      createCommunicationNoteGenerationCurrentSessionStatusResolver(
        clientWithRpc(
          vi.fn(async () => {
            throw new Error("private upstream detail");
          }),
        ),
      );

    await expect(resolver()).resolves.toBe("UNAVAILABLE");
  });

  it("fails closed when the authenticated client has no callable RPC", async () => {
    const client = { auth: authPort() } as never;

    await expect(
      createCommunicationNoteGenerationCurrentSessionStatusResolver(client)(),
    ).resolves.toBe("UNAVAILABLE");
  });

  it("is server-only and contains no identity argument, privileged credential or legacy fallback", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/lib/communication-note-generation-current-session.server.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
    expect(source).toContain("resolve_v1_current_session_status");
    expect(source).not.toMatch(
      /resolve_v1_shadow_session_status|p_user_id|p_session_id|getSession|service_role|sb_secret_|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});

function clientWithRpc(
  rpc: ReturnType<typeof vi.fn>,
): CommunicationNoteGenerationAuthenticatedClient {
  return { auth: authPort(), rpc } as CommunicationNoteGenerationAuthenticatedClient;
}

function authPort() {
  return {
    getClaims: vi.fn(),
    getUser: vi.fn(),
  };
}
