import "server-only";
import { types } from "node:util";
import { parseCommunicationNoteTaskCursor, parseCommunicationNoteTaskPage, taskListRecord,
  type CommunicationNoteTaskCursor } from "../communication-note-task-list";
import { CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION, CaresLinkV1ContractError } from "./shared-contracts";
import type { CaresLinkV1AuthenticatedPrincipal } from "./transport-contract";

export const COMMUNICATION_NOTE_JOB_LIST_SQL = `select careslink_v1_generation.list_v1_communication_note_jobs(
  $1::pg_catalog.uuid,$2::pg_catalog.uuid,$3::pg_catalog.timestamptz,$4::pg_catalog.uuid,
  $5::pg_catalog.int4,$6::pg_catalog.text,$7::pg_catalog.text) as data`;
const unavailable = () => new CaresLinkV1ContractError("PRODUCT_API_DISABLED", "Task list unavailable");
/** Injected server core, without connection, credentials, writes or activation. */
export function createCommunicationNoteJobListRepository(options: {
  principal: CaresLinkV1AuthenticatedPrincipal;
  query(sql: string, values: readonly unknown[]): PromiseLike<unknown>;
}) {
  if (types.isProxy(options)) throw unavailable();
  const factory = taskListRecord(options, ["principal", "query"]);
  if (types.isProxy(factory.principal)) throw unavailable();
  const principal = taskListRecord(factory.principal, ["userId", "sessionId", "transport"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (principal.transport !== "COOKIE" || typeof principal.userId !== "string" || !uuid.test(principal.userId) ||
    typeof principal.sessionId !== "string" || !uuid.test(principal.sessionId) || typeof factory.query !== "function" || types.isProxy(factory.query)) throw unavailable();
  const query = factory.query as typeof options.query;
  return Object.freeze({ async list(before: CommunicationNoteTaskCursor | null) {
    const cursor = parseCommunicationNoteTaskCursor(before);
    let raw: unknown;
    try {
      raw = await query(COMMUNICATION_NOTE_JOB_LIST_SQL, Object.freeze([principal.userId, principal.sessionId,
        cursor?.createdAt ?? null, cursor?.jobId ?? null, 20, CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION]));
    } catch (error) {
      if (error && typeof error === "object" && !types.isProxy(error) &&
        Object.getOwnPropertyDescriptor(error,"code")?.value === "P0001" &&
        Object.getOwnPropertyDescriptor(error,"message")?.value === "SESSION_REVOKED")
        throw new CaresLinkV1ContractError("SESSION_REVOKED", "Current session unavailable");
      throw unavailable();
    }
    try {
      if (types.isProxy(raw)) throw unavailable();
      const { rows } = taskListRecord(raw, ["rows"]);
      if (!Array.isArray(rows) || types.isProxy(rows) || rows.length !== 1 || Reflect.ownKeys(rows).length !== 2) throw unavailable();
      const row = Object.getOwnPropertyDescriptor(rows,"0")?.value;
      if (types.isProxy(row)) throw unavailable();
      const { data } = taskListRecord(row, ["data"]);
      return parseCommunicationNoteTaskPage(data, cursor);
    } catch { throw unavailable(); }
  } });
}
