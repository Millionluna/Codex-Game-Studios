import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PORTAL_REFERRAL_SUPABASE_RPC_NAMES,
  authorizePortalReferralSupabaseClient,
  createSupabasePortalReferralApi,
  type PortalReferralAuthorization,
  type PortalReferralAuthorizationScope,
  type PortalReferralSessionScopedSupabaseRpcClient,
  type PortalReferralSupabaseRpcResult,
} from "./portal-referral-supabase.server";
import type { PortalReferralSourceDetail } from "./portal-referral-adapter.server";
import {
  PortalReferralWorkflowError,
  createPortalReferralMutationPayloadHash,
} from "./portal-referral-workflow";

const IDS = {
  user: "a0000000-0000-4000-8000-000000000001",
  organization: "20000000-0000-4000-8000-000000000001",
  referral: "b0000000-0000-4000-8000-000000000001",
} as const;
const MUTATION_ID = "portal-create-private-0001";
const CORRELATION_ID = "server-correlation-0001";
const CONTACT = {
  name: "Private Contact",
  phone: "0400000099",
  email: "private-contact@example.invalid",
} as const;

describe("Portal referral Supabase adapter", () => {
  it.each([
    ["INTAKE", PORTAL_REFERRAL_SUPABASE_RPC_NAMES.authorize],
    [
      "SOURCE_DETAIL",
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetailAuthorize,
    ],
  ] as const)(
    "strictly authorizes one active referral-source membership for %s",
    async (scope, rpcName) => {
      const client = rpcClient(rpcSuccess(authorizationEnvelope()));

      await expect(
        authorizePortalReferralSupabaseClient(client, scope),
      ).resolves.toEqual({
        ok: true,
        authorization: authorization(),
      });
      expect(client.rpc).toHaveBeenCalledWith(rpcName);
    },
  );

  it.each(
    ["INTAKE", "SOURCE_DETAIL"] satisfies PortalReferralAuthorizationScope[],
  )(
    "maps identical authorize errors for %s without echoing details",
    async (scope) => {
      for (const [message, reason] of [
        ["PORTAL_CAPABILITY_DISABLED", "capability_disabled"],
        ["PORTAL_AUTH_REQUIRED", "auth_required"],
        ["PORTAL_SESSION_REVOKED", "session_revoked"],
        ["PORTAL_FORBIDDEN", "forbidden"],
      ] as const) {
        const client = rpcClient({
          data: { private_contact: CONTACT },
          error: {
            code: "P0001",
            message,
            details: CONTACT.phone,
          },
          status: 400,
        });

        const result = await authorizePortalReferralSupabaseClient(
          client,
          scope,
        );
        expect(result).toEqual({ ok: false, reason });
        expect(JSON.stringify(result)).not.toContain(CONTACT.phone);
      }
    },
  );

  it.each([
    [{ code: "PGRST302" }, "auth_required"],
    [{ code: "PGRST301" }, "session_revoked"],
    [{ code: "PGRST303" }, "session_revoked"],
    [{ code: "PGRST202" }, "adapter_unavailable"],
  ] as const)("maps PostgREST authorize code without trusting its message", async (error, reason) => {
    const result = await authorizePortalReferralSupabaseClient(
      rpcClient({
        data: null,
        error: { ...error, message: CONTACT.email },
        status: 400,
      }),
      "INTAKE",
    );
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain(CONTACT.email);
  });

  it.each([
    [401, "auth_required"],
    [403, "adapter_unavailable"],
  ] as const)(
    "maps authorize insufficient privilege with HTTP status %s",
    async (status, reason) => {
      const result = await authorizePortalReferralSupabaseClient(
        rpcClient({
          data: null,
          error: { code: "42501", message: CONTACT.email },
          status,
        }),
        "INTAKE",
      );
      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain(CONTACT.email);
    },
  );

  it.each([
    { ...authorizationEnvelope(), extra: "private" },
    omit(authorizationEnvelope(), "membership_status"),
    { ...authorizationEnvelope(), authorized: false },
    { ...authorizationEnvelope(), user_id: IDS.user.toUpperCase() },
    { ...authorizationEnvelope(), organization_type: "PROVIDER" },
    { ...authorizationEnvelope(), organization_status: "SUSPENDED" },
    { ...authorizationEnvelope(), membership_role: "platform_admin" },
    { ...authorizationEnvelope(), membership_status: "REVOKED" },
  ])("fails closed on unsafe authorize envelope %#", async (data) => {
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(data)),
        "INTAKE",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
  });

  it("lists only exact metadata fields using a fixed bounded cursor", async () => {
    const client = rpcClient(rpcSuccess(listEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.listReferrals()).resolves.toEqual([
      {
        referralId: IDS.referral,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        currentStatus: "SUBMITTED",
        rowVersion: 1,
        updatedAt: "2026-08-24T01:02:03.456Z",
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.list,
      {
        p_limit: 50,
        p_before_updated_at: null,
        p_before_id: null,
      },
    );
  });

  it.each([
    { ...listEnvelope(), private_contact: CONTACT },
    { items: [{ ...listItem(), summary: "private summary" }] },
    { items: [omit(listItem(), "updated_at")] },
    { items: [{ ...listItem(), referral_id: IDS.referral.toUpperCase() }] },
    { items: [{ ...listItem(), region: "VIC_UNKNOWN" }] },
    { items: [{ ...listItem(), service_type: "FREE_TEXT" }] },
    { items: [{ ...listItem(), current_status: "UNKNOWN" }] },
    { items: [{ ...listItem(), row_version: Number.MAX_SAFE_INTEGER + 1 }] },
    { items: [{ ...listItem(), row_version: 0 }] },
    { items: [{ ...listItem(), updated_at: "2026-02-31T00:00:00Z" }] },
    { items: [{ ...listItem(), updated_at: CONTACT.email }] },
    { items: [listItem(), listItem()] },
  ])("rejects unsafe list envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(api.listReferrals()).rejects.toThrow(
      "Portal referral adapter is unavailable",
    );
  });

  it("returns only the exact referral-source detail projection", async () => {
    const client = rpcClient(rpcSuccess(sourceDetailEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    const expected = {
      referralId: IDS.referral,
      summary: "Adult participant needs community participation support",
      region: "VIC_MELBOURNE",
      serviceType: "SUPPORT_COORDINATION",
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      contact: CONTACT,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T01:02:03.456Z",
    } satisfies PortalReferralSourceDetail;

    await expect(api.getReferral(IDS.referral)).resolves.toEqual(expected);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it("accepts an explicit null contact email without relaxing the contact shape", async () => {
    const data = sourceDetailEnvelope();
    const client = rpcClient(
      rpcSuccess({ ...data, contact: { ...data.contact, email: null } }),
    );
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral(IDS.referral)).resolves.toMatchObject({
      contact: { name: CONTACT.name, phone: CONTACT.phone, email: null },
    });
  });

  it("fails closed when source detail returns a different referral id", async () => {
    const otherReferralId = "b0000000-0000-4000-8000-000000000002";
    const client = rpcClient(
      rpcSuccess({ ...sourceDetailEnvelope(), referral_id: otherReferralId }),
    );
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral(IDS.referral)).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it.each([
    { ...sourceDetailEnvelope(), extra: "private" },
    omit(sourceDetailEnvelope(), "updated_at"),
    { ...sourceDetailEnvelope(), referral_id: IDS.referral.toUpperCase() },
    { ...sourceDetailEnvelope(), summary: "" },
    { ...sourceDetailEnvelope(), summary: " private summary " },
    { ...sourceDetailEnvelope(), region: "VIC_UNKNOWN" },
    { ...sourceDetailEnvelope(), service_type: "FREE_TEXT" },
    { ...sourceDetailEnvelope(), current_status: "UNKNOWN" },
    { ...sourceDetailEnvelope(), row_version: 0 },
    { ...sourceDetailEnvelope(), created_at: "2026-02-31T00:00:00Z" },
    {
      ...sourceDetailEnvelope(),
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-24T00:00:00Z",
    },
    { ...sourceDetailEnvelope(), contact: null },
    {
      ...sourceDetailEnvelope(),
      contact: { ...CONTACT, private_note: "private" },
    },
    { ...sourceDetailEnvelope(), contact: omit(CONTACT, "email") },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, name: null } },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, phone: "" } },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, email: 123 } },
  ])("rejects unsafe source-detail envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(api.getReferral(IDS.referral)).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
  });

  it("rejects a non-canonical referral id before the detail RPC", async () => {
    const client = rpcClient(rpcSuccess(sourceDetailEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral("not-a-referral-id")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps PORTAL_NOT_FOUND from source detail to the public workflow code", async () => {
    const client = rpcClient({
      data: null,
      error: {
        code: "P0001",
        message: "PORTAL_NOT_FOUND",
        details: CONTACT.phone,
      },
      status: 400,
    });
    const api = createSupabasePortalReferralApi(client, authorization());

    const error = await captureError(() => api.getReferral(IDS.referral));
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe("NOT_FOUND");
    expect(String(error)).not.toContain(CONTACT.phone);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it("hashes private transport ids and returns a metadata-only create ack", async () => {
    const client = rpcClient(rpcSuccess(createEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    const command = {
      summary: "  Adult participant needs community participation support  ",
      region: "VIC_GEELONG",
      serviceType: "COMMUNITY_PARTICIPATION",
      contact: {
        name: `  ${CONTACT.name}  `,
        phone: `  ${CONTACT.phone}  `,
        email: `  ${CONTACT.email}  `,
      },
    } as const;

    const response = await api.createReferral(command, {
      mutationId: MUTATION_ID,
      correlationId: CORRELATION_ID,
    });
    expect(response).toEqual({
      referralId: IDS.referral,
      matchId: null,
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      updatedAt: "2026-08-24T01:02:03.456Z",
    });
    expect(JSON.stringify(response)).not.toContain(CONTACT.name);
    expect(JSON.stringify(response)).not.toContain(CONTACT.phone);
    expect(JSON.stringify(response)).not.toContain(CONTACT.email);
    expect(JSON.stringify(response)).not.toContain(MUTATION_ID);
    expect(JSON.stringify(response)).not.toContain(CORRELATION_ID);

    const [, args] = vi.mocked(client.rpc).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(args).sort()).toEqual(
      [
        "p_contact_email",
        "p_contact_name",
        "p_contact_phone",
        "p_correlation_id_hash",
        "p_mutation_id_hash",
        "p_payload_hash",
        "p_region",
        "p_service_type",
        "p_summary",
      ].sort(),
    );
    expect(args).toMatchObject({
      p_summary: "Adult participant needs community participation support",
      p_region: "VIC_GEELONG",
      p_service_type: "COMMUNITY_PARTICIPATION",
      p_contact_name: CONTACT.name,
      p_contact_phone: CONTACT.phone,
      p_contact_email: CONTACT.email,
      p_mutation_id_hash: sha256(MUTATION_ID),
      p_correlation_id_hash: sha256(CORRELATION_ID),
      p_payload_hash: createPortalReferralMutationPayloadHash({
        actor: {
          organizationId: IDS.organization,
          role: "referral_source",
          providerId: null,
        },
        kind: "CREATE_REFERRAL",
        command: {
          summary: "Adult participant needs community participation support",
          region: "VIC_GEELONG",
          serviceType: "COMMUNITY_PARTICIPATION",
          contact: CONTACT,
        },
      }),
    });
    expect(JSON.stringify(args)).not.toContain(MUTATION_ID);
    expect(JSON.stringify(args)).not.toContain(CORRELATION_ID);
  });

  it.each([
    {
      ...createCommand(),
      actor: { organizationId: IDS.organization, role: "referral_source" },
    },
    omit(createCommand(), "contact"),
    { ...createCommand(), contact: omit(CONTACT, "email") },
    { ...createCommand(), region: "VIC_UNKNOWN" },
    { ...createCommand(), serviceType: "FREE_TEXT" },
    { ...createCommand(), summary: `Please call ${CONTACT.phone}` },
    { ...createCommand(), summary: `Please email ${CONTACT.email}` },
    { ...createCommand(), summary: `Please contact ${CONTACT.name}` },
    {
      ...createCommand(),
      summary: "Annual support review",
      contact: { ...CONTACT, name: "Ann" },
    },
  ])("rejects untrusted create command %# before RPC", async (command) => {
    const client = rpcClient(rpcSuccess(createEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    await expect(
      api.createReferral(command as ReturnType<typeof createCommand>, {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...createEnvelope(), contact_phone: CONTACT.phone },
    omit(createEnvelope(), "match_id"),
    { ...createEnvelope(), referral_id: IDS.referral.toUpperCase() },
    { ...createEnvelope(), match_id: IDS.referral },
    { ...createEnvelope(), current_status: "TRIAGED" },
    { ...createEnvelope(), row_version: 2 },
    { ...createEnvelope(), updated_at: "not-a-time" },
  ])("rejects unsafe create envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(
      api.createReferral(createCommand(), {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow("Portal referral adapter is unavailable");
  });

  it.each([
    ["PORTAL_AUTH_REQUIRED", "AUTH_REQUIRED"],
    ["PORTAL_SESSION_REVOKED", "SESSION_REVOKED"],
    ["PORTAL_CAPABILITY_DISABLED", "CAPABILITY_DISABLED"],
    ["PORTAL_FORBIDDEN", "FORBIDDEN"],
    ["PORTAL_NOT_FOUND", "NOT_FOUND"],
    ["PORTAL_VALIDATION_ERROR", "VALIDATION_ERROR"],
    ["PORTAL_IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["PORTAL_STALE_REFERRAL", "STALE_REFERRAL"],
    ["PORTAL_INVALID_STATE_TRANSITION", "INVALID_STATE_TRANSITION"],
  ] as const)("maps allowlisted workflow error %s", async (message, code) => {
    const api = createSupabasePortalReferralApi(
      rpcClient({
        data: { private_contact: CONTACT },
        error: { code: "P0001", message, details: CONTACT.phone },
        status: 400,
      }),
      authorization(),
    );
    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(code);
    expect(JSON.stringify(error)).not.toContain(CONTACT.phone);
  });

  it.each([
    ["42501", 401, "SESSION_REVOKED"],
    ["PGRST301", 401, "SESSION_REVOKED"],
    ["42501", 403, "ADAPTER_UNAVAILABLE"],
  ] as const)(
    "maps post-authorize error %s with HTTP status %s",
    async (databaseCode, status, code) => {
      const api = createSupabasePortalReferralApi(
        rpcClient({
          data: null,
          error: { code: databaseCode, message: CONTACT.email },
          status,
        }),
        authorization(),
      );
      const error = await captureError(() => api.listReferrals());
      expect(error).toBeInstanceOf(PortalReferralWorkflowError);
      expect((error as PortalReferralWorkflowError).code).toBe(code);
      expect(JSON.stringify(error)).not.toContain(CONTACT.email);
    },
  );

  it("fails closed with a typed unavailable error when an RPC result omits status", async () => {
    const client = unsafeRpcClient({ data: listEnvelope(), error: null });
    const api = createSupabasePortalReferralApi(client, authorization());

    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(
      "ADAPTER_UNAVAILABLE",
    );
  });

  it.each([401, 500])(
    "rejects successful data paired with HTTP status %s",
    async (status) => {
      const client = unsafeRpcClient({
        data: authorizationEnvelope(),
        error: null,
        status,
      });

      await expect(
        authorizePortalReferralSupabaseClient(client, "INTAKE"),
      ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
    },
  );

  it("does not reinterpret unknown database failures or expose their text", async () => {
    const api = createSupabasePortalReferralApi(
      rpcClient({
        data: null,
        error: {
          code: "XX000",
          message: CONTACT.email,
          details: CONTACT.phone,
        },
        status: 500,
      }),
      authorization(),
    );
    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(
      "ADAPTER_UNAVAILABLE",
    );
    expect(String(error)).not.toContain(CONTACT.email);
    expect(String(error)).not.toContain(CONTACT.phone);
  });
});

function authorizationEnvelope() {
  return {
    authorized: true,
    user_id: IDS.user,
    organization_id: IDS.organization,
    organization_type: "REFERRAL_SOURCE",
    organization_status: "ACTIVE",
    membership_role: "referral_source",
    membership_status: "ACTIVE",
  } as const;
}

function authorization(): PortalReferralAuthorization {
  return {
    userId: IDS.user,
    organizationId: IDS.organization,
    organizationType: "REFERRAL_SOURCE",
    organizationStatus: "ACTIVE",
    membershipRole: "referral_source",
    membershipStatus: "ACTIVE",
  };
}

function listItem() {
  return {
    referral_id: IDS.referral,
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function listEnvelope() {
  return { items: [listItem()] };
}

function createEnvelope() {
  return {
    referral_id: IDS.referral,
    match_id: null,
    current_status: "SUBMITTED",
    row_version: 1,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function sourceDetailEnvelope() {
  return {
    referral_id: IDS.referral,
    summary: "Adult participant needs community participation support",
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    contact: CONTACT,
    created_at: "2026-08-24T10:00:00.000+10:00",
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function createCommand() {
  return {
    summary: "Adult participant needs community participation support",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    contact: CONTACT,
  } as const;
}

function rpcSuccess(data: unknown): PortalReferralSupabaseRpcResult {
  return { data, error: null, status: 200 };
}

function rpcClient(
  ...results: PortalReferralSupabaseRpcResult[]
): PortalReferralSessionScopedSupabaseRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  const queue = [...results];
  return {
    rpc: vi.fn(async () => queue.shift() ?? rpcSuccess(null)),
  };
}

function unsafeRpcClient(
  result: unknown,
): PortalReferralSessionScopedSupabaseRpcClient & {
  rpc: ReturnType<typeof vi.fn>;
} {
  return {
    rpc: vi.fn(async () => result),
  } as unknown as PortalReferralSessionScopedSupabaseRpcClient & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function captureError(run: () => unknown) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail");
}
