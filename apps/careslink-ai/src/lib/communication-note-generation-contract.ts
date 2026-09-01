import type { CommunicationNoteComposerSubmission } from "./communication-note-composer";
import type {
  CaresLinkV1ErrorCode,
  CaresLinkV1GenerationStatus,
} from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_GENERATION_API_PATH =
  "/api/ai-documents/communication-note/generate" as const;

/** Browser-safe request body produced only after the local privacy review. */
export type CommunicationNoteGenerationRequest =
  CommunicationNoteComposerSubmission;

export const COMMUNICATION_NOTE_GENERATION_FAILURE_CODES = [
  "AUTH_REQUIRED",
  "SESSION_REVOKED",
  "PRIVACY_REVIEW_REQUIRED",
  "PRIVACY_REVIEW_STALE",
  "MINIMUM_FACTS_REQUIRED",
  "GENERATION_FAILED",
] as const;
export type CommunicationNoteGenerationFailureCode =
  (typeof COMMUNICATION_NOTE_GENERATION_FAILURE_CODES)[number];

export type CommunicationNoteGenerationResult = Readonly<{
  canonicalId: string;
  revisionId: string;
  contentHash: string;
  revisionNumber: 1;
  baseRevisionId: null;
  saveState: "SERVER_ACKNOWLEDGED";
}>;

type CommunicationNoteGenerationJobBase = Readonly<{
  jobId: string;
  noteType: "communication";
  serviceCode: "note.communication.generate";
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}>;

type CommunicationNoteGenerationQueuedJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: Extract<CaresLinkV1GenerationStatus, "QUEUED">;
    startedAt?: string;
    finishedAt?: never;
    failureCode?: never;
    result?: never;
  }
>;

type CommunicationNoteGenerationRunningJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: Extract<CaresLinkV1GenerationStatus, "RUNNING">;
    startedAt: string;
    finishedAt?: never;
    failureCode?: never;
    result?: never;
  }
>;

type CommunicationNoteGenerationSucceededJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: Extract<CaresLinkV1GenerationStatus, "SUCCEEDED">;
    startedAt: string;
    finishedAt: string;
    failureCode?: never;
    result: CommunicationNoteGenerationResult;
  }
>;

type CommunicationNoteGenerationFailedJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: Extract<CaresLinkV1GenerationStatus, "FAILED">;
    startedAt: string;
    finishedAt: string;
    failureCode: CommunicationNoteGenerationFailureCode;
    result?: never;
  }
>;

type CommunicationNoteGenerationCancelledJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: Extract<CaresLinkV1GenerationStatus, "CANCELLED">;
    startedAt?: string;
    finishedAt: string;
    failureCode?: never;
    result?: never;
  }
>;

/** Owner-safe current job view; facts, identity, proof and provider data are absent. */
export type CommunicationNoteGenerationJob =
  | CommunicationNoteGenerationQueuedJob
  | CommunicationNoteGenerationRunningJob
  | CommunicationNoteGenerationSucceededJob
  | CommunicationNoteGenerationFailedJob
  | CommunicationNoteGenerationCancelledJob;

/** A newly created durable admission has not started its first attempt. */
export type CommunicationNoteGenerationFreshJob = Readonly<
  CommunicationNoteGenerationJobBase & {
    status: "QUEUED";
    attemptCount: 0;
    startedAt?: never;
    finishedAt?: never;
    failureCode?: never;
    result?: never;
  }
>;

export type CommunicationNoteGenerationErrorResponse = Readonly<{
  error: Readonly<{
    code: CaresLinkV1ErrorCode;
    message: string;
    correlationId: string;
  }>;
}>;

/** `created=false` is an exact idempotent replay of the current durable job. */
export type CommunicationNoteGenerationAdmission =
  | Readonly<{
      created: true;
      job: CommunicationNoteGenerationFreshJob;
    }>
  | Readonly<{
      created: false;
      job: CommunicationNoteGenerationJob;
    }>;

export type CommunicationNoteGenerationResponse =
  | CommunicationNoteGenerationAdmission
  | CommunicationNoteGenerationErrorResponse;
