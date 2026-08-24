import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CARESLINK_V1_SESSION_STATUS_RPC,
  createCaresLinkV1SessionStatusResolver,
  createCaresLinkV1SessionStatusResolverFromEnv,
  type CaresLinkV1SessionStatusRpcClient,
} from "./product-api-session-status.server";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

describe("Product API active-session status resolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["ACTIVE", "REVOKED"] as const)(
    "returns the exact %s status from the service-only RPC",
    async (status) => {
      const rpc = vi.fn(async () => ({ data: status, error: null }));
      const resolver = createCaresLinkV1SessionStatusResolver({ rpc });

      await expect(
        resolver({ userId: USER_ID, sessionId: SESSION_ID, source: "bearer" }),
      ).resolves.toBe(status);
      expect(rpc).toHaveBeenCalledWith(CARESLINK_V1_SESSION_STATUS_RPC, {
        p_user_id: USER_ID,
        p_session_id: SESSION_ID,
      });
    },
  );

  it.each([
    null,
    undefined,
    "active",
    "ACTIVE ",
    "UNAVAILABLE",
    ["ACTIVE"],
    { status: "ACTIVE" },
    1,
  ])("rejects malformed RPC data without throwing: %j", async (data) => {
    const resolver = createCaresLinkV1SessionStatusResolver({
      rpc: vi.fn(async () => ({ data, error: null })),
    });

    await expect(
      resolver({ userId: USER_ID, sessionId: SESSION_ID, source: "cookie" }),
    ).resolves.toBe("UNAVAILABLE");
  });

  it("maps an RPC error to UNAVAILABLE without exposing error content", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolver = createCaresLinkV1SessionStatusResolver({
      rpc: vi.fn(async () => ({
        data: "ACTIVE",
        error: { code: "42501", message: "sensitive upstream detail" },
      })),
    });

    await expect(
      resolver({ userId: USER_ID, sessionId: SESSION_ID, source: "bearer" }),
    ).resolves.toBe("UNAVAILABLE");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("maps thrown and malformed RPC results to UNAVAILABLE", async () => {
    const thrownResolver = createCaresLinkV1SessionStatusResolver({
      rpc: vi.fn(async () => {
        throw new Error("upstream exception");
      }),
    });
    const malformedResolver = createCaresLinkV1SessionStatusResolver({
      rpc: vi.fn(async () => null) as unknown as CaresLinkV1SessionStatusRpcClient["rpc"],
    });

    await expect(
      thrownResolver({ userId: USER_ID, sessionId: SESSION_ID, source: "cookie" }),
    ).resolves.toBe("UNAVAILABLE");
    await expect(
      malformedResolver({ userId: USER_ID, sessionId: SESSION_ID, source: "cookie" }),
    ).resolves.toBe("UNAVAILABLE");
  });

  it.each([
    { userId: "not-a-uuid", sessionId: SESSION_ID },
    { userId: USER_ID.toUpperCase(), sessionId: SESSION_ID },
    { userId: USER_ID, sessionId: "not-a-uuid" },
  ])("does not call the RPC for an invalid trusted identity", async (invalid) => {
    const rpc = vi.fn(async () => ({ data: "ACTIVE", error: null }));
    const resolver = createCaresLinkV1SessionStatusResolver({ rpc });

    await expect(
      resolver({ ...invalid, source: "bearer" }),
    ).resolves.toBe("UNAVAILABLE");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates the resolver only from complete service-side configuration", async () => {
    const rpc = vi.fn(async () => ({ data: "ACTIVE", error: null }));
    const client = { rpc };
    const createClient = vi.fn(() => client);

    const resolver = createCaresLinkV1SessionStatusResolverFromEnv(
      {
        SUPABASE_URL: "https://service-only-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_URL: "https://public-fallback.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
      },
      createClient,
    );

    expect(createClient).toHaveBeenCalledWith(
      "https://service-only-project.supabase.co",
      "service-role-test-key",
    );
    await expect(
      resolver?.({ userId: USER_ID, sessionId: SESSION_ID, source: "cookie" }),
    ).resolves.toBe("ACTIVE");
  });

  it("fails closed for missing configuration or client construction errors", () => {
    const createClient = vi.fn();

    expect(
      createCaresLinkV1SessionStatusResolverFromEnv({}, createClient),
    ).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();

    expect(
      createCaresLinkV1SessionStatusResolverFromEnv(
        {
          SUPABASE_URL: "https://service-only-project.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
        },
        () => {
          throw new Error("client construction failed");
        },
      ),
    ).toBeUndefined();
  });

  it("keeps the resolver server-only and contains no credential logging path", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/v1/product-api-session-status.server.ts"),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(/console\.|logger\.|accessToken|authorization/i);
  });
});
