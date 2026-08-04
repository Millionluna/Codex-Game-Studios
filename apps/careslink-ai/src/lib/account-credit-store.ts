import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type AccountCreditPlanCode = "free";
export type AccountCreditStatus = "active" | "suspended" | "expired";
export type AccountCreditLedgerEvent =
  | "grant"
  | "reserve"
  | "commit"
  | "release";
export type AccountCreditReservationStatus =
  | "reserved"
  | "completed"
  | "released"
  | "exhausted"
  | "unavailable"
  | "not_found";

export type AccountCreditSummary = {
  planCode: AccountCreditPlanCode;
  status: AccountCreditStatus;
  periodStart: string;
  periodEnd: string;
  creditLimit: number;
  remainingCredits: number;
  usedCredits: number;
  reservedCredits: number;
};

export type AccountCreditLedgerRecord = {
  id: string;
  feature: string;
  action: string;
  event: AccountCreditLedgerEvent;
  units: number;
  reasonCode?: string;
  model?: string;
  createdAt: string;
};

export type AccountCreditUsage = AccountCreditSummary & {
  recentUsage: AccountCreditLedgerRecord[];
};

export type AccountCreditDecision = AccountCreditSummary & {
  reservationStatus: AccountCreditReservationStatus;
  reservationId?: string;
  isNew: boolean;
  resultRef?: string;
  model?: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  reasonCode?: string;
};

export type AccountCreditStore = {
  kind: "supabase";
  getUsage(input: {
    userId: string;
    recentLimit?: number;
  }): Promise<AccountCreditUsage>;
  reserveCredit(input: {
    userId: string;
    feature: string;
    action: string;
    idempotencyKey: string;
  }): Promise<AccountCreditDecision>;
  commitCredit(input: {
    userId: string;
    reservationId: string;
    resultRef: string;
    model: string;
    inputTokenCount: number;
    outputTokenCount: number;
  }): Promise<AccountCreditDecision>;
  releaseCredit(input: {
    userId: string;
    reservationId: string;
    reasonCode: string;
  }): Promise<AccountCreditDecision>;
};

type AccountCreditStoreEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type CreditLedgerRow = {
  id: string;
  feature: string;
  action: string;
  event: string;
  units: number;
  reason_code: string | null;
  model: string | null;
  created_at: string;
};

type SupabaseAccountCreditError = { message: string } | null;
type SupabaseAccountCreditQuery = {
  select(columns: string): SupabaseAccountCreditQuery;
  eq(column: string, value: unknown): SupabaseAccountCreditQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseAccountCreditQuery;
  limit(limit: number): Promise<{
    data: unknown[] | null;
    error: SupabaseAccountCreditError;
  }>;
};
type SupabaseAccountCreditClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: SupabaseAccountCreditError }>;
  from(tableName: string): SupabaseAccountCreditQuery;
};
type SupabaseAccountCreditClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseAccountCreditClient;

const CREDIT_LEDGER_COLUMNS =
  "id,feature,action,event,units,reason_code,model,created_at";

export function getAccountCreditStore() {
  return createAccountCreditStoreFromEnv();
}

export function createAccountCreditStoreFromEnv(
  env: AccountCreditStoreEnv = process.env as AccountCreditStoreEnv,
  createClient: SupabaseAccountCreditClientFactory = (url, key) =>
    createSupabaseClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as SupabaseAccountCreditClient,
): AccountCreditStore {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Persistent account credit storage is required for credit-controlled generation",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey);

  return {
    kind: "supabase",
    async getUsage({ userId, recentLimit = 12 }) {
      const { data: summaryData, error: summaryError } = await client.rpc(
        "get_account_credit_summary",
        { p_user_id: userId },
      );

      if (summaryError) {
        throw new Error(
          `Unable to load account credit summary: ${summaryError.message}`,
        );
      }

      const summary = normalizeCreditSummary(summaryData);
      const { data: ledgerData, error: ledgerError } = await client
        .from("credit_ledger")
        .select(CREDIT_LEDGER_COLUMNS)
        .eq("user_id", userId)
        .eq("period_start", summary.periodStart)
        .order("created_at", { ascending: false })
        .limit(clampRecentLimit(recentLimit));

      if (ledgerError) {
        throw new Error(
          `Unable to load account credit ledger: ${ledgerError.message}`,
        );
      }

      return {
        ...summary,
        recentUsage: ((ledgerData ?? []) as CreditLedgerRow[]).map(
          mapCreditLedgerRow,
        ),
      };
    },
    async reserveCredit({ userId, feature, action, idempotencyKey }) {
      const { data, error } = await client.rpc("reserve_account_credit", {
        p_user_id: userId,
        p_feature: feature,
        p_action: action,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        throw new Error(`Unable to reserve account credit: ${error.message}`);
      }

      return normalizeCreditDecision(data);
    },
    async commitCredit({
      userId,
      reservationId,
      resultRef,
      model,
      inputTokenCount,
      outputTokenCount,
    }) {
      const { data, error } = await client.rpc("commit_account_credit", {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_result_ref: resultRef,
        p_model: model,
        p_input_token_count: inputTokenCount,
        p_output_token_count: outputTokenCount,
      });

      if (error) {
        throw new Error(`Unable to commit account credit: ${error.message}`);
      }

      return normalizeCreditDecision(data);
    },
    async releaseCredit({ userId, reservationId, reasonCode }) {
      const { data, error } = await client.rpc("release_account_credit", {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_reason_code: reasonCode,
      });

      if (error) {
        throw new Error(`Unable to release account credit: ${error.message}`);
      }

      return normalizeCreditDecision(data);
    },
  };
}

function normalizeCreditSummary(value: unknown): AccountCreditSummary {
  const record = getRecord(value);
  const planCode = record.planCode;
  const status = record.status;
  const periodStart = record.periodStart;
  const periodEnd = record.periodEnd;

  if (
    planCode !== "free" ||
    !isCreditStatus(status) ||
    typeof periodStart !== "string" ||
    typeof periodEnd !== "string"
  ) {
    throw new Error("Account credit summary is invalid");
  }

  return {
    planCode,
    status,
    periodStart,
    periodEnd,
    creditLimit: getNonNegativeInteger(record.creditLimit),
    remainingCredits: getNonNegativeInteger(record.remainingCredits),
    usedCredits: getNonNegativeInteger(record.usedCredits),
    reservedCredits: getNonNegativeInteger(record.reservedCredits),
  };
}

function normalizeCreditDecision(value: unknown): AccountCreditDecision {
  const record = getRecord(value);
  const summary = normalizeCreditSummary(record);
  const reservationStatus = record.reservationStatus;

  if (!isReservationStatus(reservationStatus)) {
    throw new Error("Account credit reservation status is invalid");
  }

  return {
    ...summary,
    reservationStatus,
    reservationId: getOptionalString(record.reservationId),
    isNew: record.isNew === true,
    resultRef: getOptionalString(record.resultRef),
    model: getOptionalString(record.model),
    inputTokenCount: getOptionalNonNegativeInteger(record.inputTokenCount),
    outputTokenCount: getOptionalNonNegativeInteger(record.outputTokenCount),
    reasonCode: getOptionalString(record.reasonCode),
  };
}

function mapCreditLedgerRow(row: CreditLedgerRow): AccountCreditLedgerRecord {
  if (!isLedgerEvent(row.event)) {
    throw new Error("Account credit ledger event is invalid");
  }

  return {
    id: row.id,
    feature: row.feature,
    action: row.action,
    event: row.event,
    units: getNonNegativeInteger(row.units),
    reasonCode: row.reason_code ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.created_at,
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Account credit response is invalid");
  }

  return value as Record<string, unknown>;
}

function getNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Account credit count is invalid");
  }

  return Math.trunc(value);
}

function getOptionalNonNegativeInteger(value: unknown) {
  return value === null || value === undefined
    ? undefined
    : getNonNegativeInteger(value);
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function isCreditStatus(value: unknown): value is AccountCreditStatus {
  return value === "active" || value === "suspended" || value === "expired";
}

function isReservationStatus(
  value: unknown,
): value is AccountCreditReservationStatus {
  return (
    value === "reserved" ||
    value === "completed" ||
    value === "released" ||
    value === "exhausted" ||
    value === "unavailable" ||
    value === "not_found"
  );
}

function isLedgerEvent(value: unknown): value is AccountCreditLedgerEvent {
  return (
    value === "grant" ||
    value === "reserve" ||
    value === "commit" ||
    value === "release"
  );
}

function clampRecentLimit(value: number) {
  return Math.max(1, Math.min(50, Math.trunc(value)));
}
