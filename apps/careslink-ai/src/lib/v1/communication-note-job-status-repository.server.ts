import "server-only";

import { types as nodeTypes } from "node:util";
import type { CommunicationNoteGenerationJob } from "../communication-note-generation-contract";
import { parseCommunicationNoteGenerationJob } from "../communication-note-generation-job";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";
import type { CaresLinkV1AuthenticatedPrincipal } from "./transport-contract";

export const CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_RPC_NAME =
  "get_v1_communication_note_job_status" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL =
  `select careslink_v1_generation.${CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_RPC_NAME}(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data` as const;

export type CaresLinkV1CommunicationNoteJobStatusRepository = Readonly<{
  get(input: Readonly<{ jobId: string }>): Promise<CommunicationNoteGenerationJob>;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_KEYS = [
  "jobId", "status", "noteType", "serviceCode", "attemptCount", "createdAt",
  "updatedAt", "startedAt", "finishedAt", "failureCode", "result",
] as const;

/** Injected core only: no connection, credentials, environment or write port. */
export function createCaresLinkV1CommunicationNoteJobStatusRepository(options: {
  principal: CaresLinkV1AuthenticatedPrincipal;
  query(sql: string, values: readonly unknown[]): PromiseLike<unknown>;
}): CaresLinkV1CommunicationNoteJobStatusRepository {
  const factory = exactRecord(options, ["principal", "query"]);
  const principal = exactRecord(factory.principal, ["userId", "sessionId", "transport"]);
  if (principal.transport !== "COOKIE" || typeof factory.query !== "function" ||
      nodeTypes.isProxy(factory.query)) throw unavailable();
  const ownerId = uuid(principal.userId);
  const sessionId = uuid(principal.sessionId);
  const query = factory.query as typeof options.query;

  return Object.freeze({
    async get(value: Readonly<{ jobId: string }>) {
      const jobId = uuid(exactRecord(value, ["jobId"]).jobId);
      let raw: unknown;
      try {
        raw = await query(CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL,
          Object.freeze([ownerId, sessionId, jobId,
            CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION]));
      } catch (error) {
        throw databaseError(error);
      }
      try {
        const { rows } = exactRecord(raw, ["rows"]);
        if (!Array.isArray(rows) || nodeTypes.isProxy(rows) || rows.length !== 1 ||
            Reflect.ownKeys(rows).length !== 2) throw unavailable();
        const row = own(rows, "0");
        const { data } = exactRecord(row, ["data"]);
        const envelope = exactRecord(data, ["job"]);
        const job = exactRecord(envelope.job, JOB_KEYS);
        // SQL owns this filter as well; a broken transport must never widen it.
        if (job.noteType !== "communication") throw unavailable();
        const normalized = Object.fromEntries(Object.entries(job).filter(
          ([key, item]) => item !== null ||
            !["startedAt", "finishedAt", "failureCode", "result"].includes(key),
        ));
        const parsed = parseCommunicationNoteGenerationJob(normalized);
        if (parsed.jobId !== jobId) throw unavailable();
        return parsed;
      } catch {
        throw unavailable();
      }
    },
  });
}

function databaseError(value: unknown) {
  try {
    const code = own(value, "code");
    const message = own(value, "message");
    if (code === "P0001") {
      if (message === "NOT_FOUND")
        return new CaresLinkV1ContractError("NOT_FOUND", "Communication Note job was not found");
      if (message === "SESSION_REVOKED")
        return new CaresLinkV1ContractError("SESSION_REVOKED", "The current session is unavailable");
      if (message === "MIN_CLIENT_VERSION")
        return new CaresLinkV1ContractError("MIN_CLIENT_VERSION", "The client contract is unavailable");
    }
  } catch { /* Never relay driver text or evaluate accessors. */ }
  return unavailable();
}

function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) throw unavailable();
  const field = Object.getOwnPropertyDescriptor(value, key);
  if (!field || !("value" in field)) throw unavailable();
  return field.value;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || nodeTypes.isProxy(value))
    throw unavailable();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  const fields = Reflect.ownKeys(value);
  if (fields.length !== keys.length || fields.some((key) => typeof key !== "string" || !keys.includes(key)))
    throw unavailable();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field?.enumerable || !("value" in field)) throw unavailable();
    result[key] = field.value;
  }
  return result;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw unavailable();
  return value.toLowerCase();
}

function unavailable() {
  return new CaresLinkV1ContractError("PRODUCT_API_DISABLED",
    "Communication Note job status repository is unavailable");
}
