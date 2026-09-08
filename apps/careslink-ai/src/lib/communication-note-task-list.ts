/** Metadata only. The cursor is a position, never identity or authorization. */
export type CommunicationNoteTask = Readonly<{
  jobId: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  createdAt: string; updatedAt: string;
}>;
export type CommunicationNoteTaskCursor = Readonly<{ createdAt: string; jobId: string }>;
export type CommunicationNoteTaskPage = Readonly<{ tasks: readonly CommunicationNoteTask[]; nextCursor: CommunicationNoteTaskCursor | null }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const invalid = () => new Error("Task list unavailable");
export function taskListRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length) throw invalid();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !("value" in d)) throw invalid();
    result[key] = d.value;
  }
  return result;
}
function time(value: unknown): string {
  if (typeof value !== "string" || !TIME.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value.slice(0,23) + "Z") throw invalid();
  return value;
}
export function parseCommunicationNoteTaskCursor(value: unknown): CommunicationNoteTaskCursor | null {
  if (value === null) return null;
  const c = taskListRecord(value, ["jobId", "createdAt"]);
  if (typeof c.jobId !== "string" || !UUID.test(c.jobId)) throw invalid();
  return Object.freeze({ jobId: c.jobId, createdAt: time(c.createdAt) });
}
export function compareCommunicationNoteTaskPosition(a: CommunicationNoteTaskCursor, b: CommunicationNoteTaskCursor) {
  return a.createdAt === b.createdAt ? (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1;
}
export function parseCommunicationNoteTaskPage(value: unknown, before: CommunicationNoteTaskCursor | null = null): CommunicationNoteTaskPage {
  const page = taskListRecord(value, ["tasks", "nextCursor"]);
  if (!Array.isArray(page.tasks) || page.tasks.length > 20 || Reflect.ownKeys(page.tasks).length !== page.tasks.length + 1) throw invalid();
  const tasks = Array.from({ length: page.tasks.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(page.tasks, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalid();
    const value = descriptor.value;
    const t = taskListRecord(value, ["jobId", "status", "createdAt", "updatedAt"]);
    const position = parseCommunicationNoteTaskCursor({ jobId: t.jobId, createdAt: t.createdAt })!;
    if (typeof t.status !== "string" || !["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"].includes(t.status)) throw invalid();
    const updatedAt = time(t.updatedAt);
    if (updatedAt < position.createdAt) throw invalid();
    return Object.freeze({ ...position, status: t.status as CommunicationNoteTask["status"], updatedAt });
  });
  if (new Set(tasks.map(t => t.jobId)).size !== tasks.length || tasks.some((t,i) =>
    (i > 0 && compareCommunicationNoteTaskPosition(t,tasks[i-1]) >= 0) ||
    (before !== null && compareCommunicationNoteTaskPosition(t,before) >= 0))) throw invalid();
  const nextCursor = parseCommunicationNoteTaskCursor(page.nextCursor);
  if (nextCursor && (tasks.length !== 20 || compareCommunicationNoteTaskPosition(nextCursor,tasks[tasks.length-1]) !== 0)) throw invalid();
  return Object.freeze({ tasks: Object.freeze(tasks), nextCursor });
}
export function encodeCommunicationNoteTaskCursor(cursor: CommunicationNoteTaskCursor) {
  const c = parseCommunicationNoteTaskCursor(cursor)!;
  return c.createdAt + "~" + c.jobId;
}
export function decodeCommunicationNoteTaskCursor(value: string): CommunicationNoteTaskCursor {
  if (value.length !== 64) throw invalid();
  const [createdAt, jobId] = value.split("~");
  return parseCommunicationNoteTaskCursor({ createdAt, jobId })!;
}
