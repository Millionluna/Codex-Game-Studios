import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES,
  PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS,
  PortalFollowUpConcurrencyHarnessError,
  assertExactBlockerRows,
  assertSingleEffectState,
  assertZeroEffectState,
  denyPortalFollowUpConcurrencyPasswordAuthentication,
} from "./portal-referral-follow-up-concurrency.mjs";

const HARNESS_URL = new URL(
  "./portal-referral-follow-up-concurrency.mjs",
  import.meta.url,
);

const FIXTURE = Object.freeze({
  referral_id: "e4100000-0000-4000-8000-000000000001",
  provider_a_id: "d4100000-0000-4000-8000-000000000001",
  expected_version: 4,
});

const EFFECT = Object.freeze({
  referralStatus: "IN_PROGRESS",
  referralVersion: 5,
  assignedProviderId: FIXTURE.provider_a_id,
  matchStatus: "ACCEPTED",
  matchVersion: 2,
  matchBStatus: "CANDIDATE",
  matchBVersion: 1,
  actorUserId: "a4100000-0000-4000-8000-000000000001",
  mutationHash: "1".repeat(64),
  payloadHash: "2".repeat(64),
  correlationHash: "3".repeat(64),
  outcome: "CONTACT_CONFIRMED",
  referralId: FIXTURE.referral_id,
  responseVersion: 5,
});

function singleEffectState() {
  const timestamp = "2026-08-26T03:04:05.678+00:00";
  return {
    referral_status: "IN_PROGRESS",
    referral_version: 5,
    assigned_provider_id: FIXTURE.provider_a_id,
    match_a_status: "ACCEPTED",
    match_a_version: 2,
    match_b_status: "CANDIDATE",
    match_b_version: 1,
    followup_count: 1,
    audit_count: 1,
    receipt_count: 1,
    followups: [
      {
        actor_user_id: EFFECT.actorUserId,
        outcome_code: EFFECT.outcome,
        next_due_at: null,
        created_at: timestamp,
      },
    ],
    audits: [
      {
        actor_user_id: EFFECT.actorUserId,
        actor_role: "provider_member",
        mutation_kind: "RECORD_FOLLOW_UP",
        from_status: "ACCEPTED",
        to_status: "IN_PROGRESS",
        mutation_id_hash: EFFECT.mutationHash,
        correlation_id_hash: EFFECT.correlationHash,
        metadata: { outcomeCode: EFFECT.outcome },
        occurred_at: timestamp,
      },
    ],
    receipts: [
      {
        actor_user_id: EFFECT.actorUserId,
        mutation_id_hash: EFFECT.mutationHash,
        mutation_kind: "RECORD_FOLLOW_UP",
        payload_hash: EFFECT.payloadHash,
        response_referral_id: EFFECT.referralId,
        response_match_id: null,
        response_status: "IN_PROGRESS",
        response_row_version: EFFECT.responseVersion,
        response_updated_at: timestamp,
        created_at: timestamp,
      },
    ],
  };
}

function zeroEffectState() {
  return {
    referral_status: "ACCEPTED",
    referral_version: 4,
    assigned_provider_id: FIXTURE.provider_a_id,
    match_a_status: "ACCEPTED",
    match_a_version: 2,
    match_b_status: "CANDIDATE",
    match_b_version: 1,
    followup_count: 0,
    audit_count: 0,
    receipt_count: 0,
    followups: [],
    audits: [],
    receipts: [],
  };
}

describe("Portal Referral Follow-up true-concurrency live harness", () => {
  it("pins the eight launch-relevant races and bounded waits", () => {
    expect(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS).toEqual([
      "same-key-replay",
      "same-key-changed-conflict",
      "different-key-stale",
      "same-provider-actors",
      "session-revoke-first",
      "provider-suspend-first",
      "flag-disable-first",
      "ownership-revoke-first-and-replay",
    ]);
    expect(PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES).toEqual({
      connectionMs: 3_000,
      queryMs: 9_000,
      statementMs: 8_000,
      lockMs: 7_000,
      idleTransactionMs: 10_000,
      blockerPollMs: 25,
      blockerPollRounds: 120,
    });
    expect(
      PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.blockerPollMs *
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.blockerPollRounds,
    ).toBeLessThan(
      PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.statementMs,
    );
  });

  it("accepts only exact lock waits on the intended backend", () => {
    expect(
      assertExactBlockerRows(
        [
          {
            pid: 101,
            wait_event_type: "Lock",
            wait_event: "advisory",
            blocking_pids: [303],
          },
          {
            pid: 202,
            wait_event_type: "Lock",
            wait_event: "transactionid",
            blocking_pids: [303],
          },
        ],
        { 101: [303], 202: [303] },
      ),
    ).toEqual([
      { pid: 101, blockingPids: [303] },
      { pid: 202, blockingPids: [303] },
    ]);

    expect(
      assertExactBlockerRows(
        [
          {
            pid: 101,
            wait_event_type: "Lock",
            blocking_pids: [303],
          },
          {
            pid: 202,
            wait_event_type: "Lock",
            blocking_pids: [101, 303],
          },
        ],
        { 101: [303], 202: [303] },
        [101, 202],
      ),
    ).toEqual([
      { pid: 101, blockingPids: [303] },
      { pid: 202, blockingPids: [101, 303] },
    ]);

    expect(
      assertExactBlockerRows(
        [
          {
            pid: 101,
            wait_event_type: "Lock",
            blocking_pids: [303],
          },
          {
            pid: 202,
            wait_event_type: "Lock",
            blocking_pids: [101],
          },
        ],
        { 101: [303], 202: [303] },
        [101, 202],
      ),
    ).toEqual([
      { pid: 101, blockingPids: [303] },
      { pid: 202, blockingPids: [101] },
    ]);

    for (const rows of [
      [
        {
          pid: 101,
          wait_event_type: "Lock",
          blocking_pids: [404],
        },
      ],
      [
        {
          pid: 101,
          wait_event_type: "Client",
          blocking_pids: [303],
        },
      ],
      [{ pid: 101, wait_event_type: "Lock", blocking_pids: [] }],
    ]) {
      expect(() => assertExactBlockerRows(rows, { 101: [303] })).toThrowError(
        expect.objectContaining({
          code: "PORTAL_FOLLOW_UP_CONCURRENCY_LOCK_NOT_OBSERVED",
        }),
      );
    }
  });

  it("pins the complete winner side-effect and receipt tuple", () => {
    expect(assertSingleEffectState(singleEffectState(), EFFECT)).toEqual({
      ok: true,
      effects: 1,
      actorUserId: EFFECT.actorUserId,
      mutationHash: EFFECT.mutationHash,
    });

    for (const mutate of [
      (state) => {
        state.followup_count = 2;
      },
      (state) => {
        state.audits[0].mutation_id_hash = "f".repeat(64);
      },
      (state) => {
        state.receipts[0].actor_user_id =
          "a4200000-0000-4000-8000-000000000002";
      },
      (state) => {
        state.receipts[0].response_row_version = 6;
      },
      (state) => {
        state.followups[0].created_at =
          "2026-08-26T03:04:05.679+00:00";
      },
    ]) {
      const state = structuredClone(singleEffectState());
      mutate(state);
      expect(() => assertSingleEffectState(state, EFFECT)).toThrowError(
        expect.objectContaining({
          code: "PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED",
        }),
      );
    }
  });

  it("pins zero side effects for authorization and gate losers", () => {
    expect(assertZeroEffectState(zeroEffectState(), FIXTURE)).toEqual({
      ok: true,
      effects: 0,
    });
    const leaked = structuredClone(zeroEffectState());
    leaked.receipt_count = 1;
    leaked.receipts.push({ mutation_id_hash: "f".repeat(64) });
    expect(() => assertZeroEffectState(leaked, FIXTURE)).toThrowError(
      expect.objectContaining({
        code: "PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED",
      }),
    );
  });

  it("denies any password authentication challenge with a fixed error", () => {
    expect(() =>
      denyPortalFollowUpConcurrencyPasswordAuthentication(),
    ).toThrowError(
      expect.objectContaining({
        name: "PortalFollowUpConcurrencyHarnessError",
        code: "PORTAL_FOLLOW_UP_CONCURRENCY_PASSWORD_AUTH_DENIED",
      }),
    );
    try {
      denyPortalFollowUpConcurrencyPasswordAuthentication();
    } catch (error) {
      expect(error).toBeInstanceOf(PortalFollowUpConcurrencyHarnessError);
      return;
    }
    throw new Error("Expected password authentication to be denied");
  });

  it("keeps partial-open cleanup, aggregate close and primary-error preservation", async () => {
    const source = await readFile(HARNESS_URL, "utf8");
    expect(source).toContain("Promise.allSettled(");
    expect(source).toMatch(/attempts\s*\.filter\(/);
    expect(source).toContain("await closeConnections(connections)");
    expect(source).toContain("let primaryError = null");
    expect(source).toContain("let cleanupError = null");
    expect(source).toContain("if (primaryError !== null) throw primaryError");
    expect(source).toContain("if (cleanupError !== null) throw cleanupError");
    expect(source).toContain(".blockers($1::integer[])");
    expect(source).toContain("PORTAL_IDEMPOTENCY_CONFLICT");
    expect(source).toContain("PORTAL_STALE_REFERRAL");
    expect(source).toContain("PORTAL_SESSION_REVOKED");
    expect(source).toContain("PORTAL_FORBIDDEN");
    expect(source).toContain("PORTAL_CAPABILITY_DISABLED");
    expect(source.match(/PORTAL_NOT_FOUND/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
