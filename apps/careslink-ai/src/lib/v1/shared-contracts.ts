export const CARESLINK_V1_CONTRACT_VERSION = "1.0.0-shadow.1" as const;
export const CARESLINK_V1_NOTE_SCHEMA_VERSION = "2026-08-09.v1-shadow" as const;
export const CARESLINK_V1_RATE_CATALOG_VERSION =
  "2026-08-09.v1-shadow" as const;

export const CARESLINK_V1_LOCALES = ["en", "zh-Hans", "zh-Hant"] as const;
export type CaresLinkV1Locale = (typeof CARESLINK_V1_LOCALES)[number];

export const CARESLINK_V1_NOTE_TYPE_CODES = [
  "communication",
  "handover",
  "progress",
  "ndis",
  "incident_factual",
] as const;
export type CaresLinkV1NoteTypeCode =
  (typeof CARESLINK_V1_NOTE_TYPE_CODES)[number];

export const CARESLINK_V1_FIELD_KINDS = [
  "date_time",
  "short_text",
  "long_text",
  "string_list",
] as const;
export type CaresLinkV1FieldKind =
  (typeof CARESLINK_V1_FIELD_KINDS)[number];

export type CaresLinkV1NoteFieldDefinition = {
  code: string;
  kind: CaresLinkV1FieldKind;
  required: boolean;
  containsParticipantIdentifier: false;
};

export type CaresLinkV1NoteTypeDefinition = {
  code: CaresLinkV1NoteTypeCode;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  generationServiceCode: CaresLinkV1ServiceCode;
  fields: readonly CaresLinkV1NoteFieldDefinition[];
  prohibitedDecisions: readonly string[];
};

export const CARESLINK_V1_SERVICE_CODES = [
  "note.communication.generate",
  "note.handover.generate",
  "note.progress.generate",
  "note.ndis.generate",
  "note.incident_factual.generate",
  "transcription.device",
  "transcription.cloud",
  "content.explain",
  "note.regenerate.full",
  "note.rewrite.section",
] as const;
export type CaresLinkV1ServiceCode =
  (typeof CARESLINK_V1_SERVICE_CODES)[number];

export const CARESLINK_V1_NOTE_CATALOG = [
  {
    code: "communication",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    generationServiceCode: "note.communication.generate",
    fields: [
      field("occurred_at", "date_time", true),
      field("contact_channel", "short_text", true),
      field("parties_by_role", "string_list", true),
      field("observable_facts", "long_text", true),
      field("action_taken", "long_text", true),
      field("stated_outcome", "long_text", false),
      field("follow_up", "long_text", false),
    ],
    prohibitedDecisions: [
      "inferred agreement",
      "inferred commitment",
      "inferred decision",
    ],
  },
  {
    code: "handover",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    generationServiceCode: "note.handover.generate",
    fields: [
      field("occurred_at", "date_time", true),
      field("current_status", "long_text", true),
      field("observable_facts", "long_text", true),
      field("actions_completed", "long_text", true),
      field("outstanding_items", "long_text", true),
      field("follow_up", "long_text", false),
    ],
    prohibitedDecisions: [
      "invented responsibility",
      "invented risk",
      "invented follow-up arrangement",
    ],
  },
  {
    code: "progress",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    generationServiceCode: "note.progress.generate",
    fields: [
      field("occurred_at", "date_time", true),
      field("support_type", "short_text", true),
      field("support_delivered", "long_text", true),
      field("observable_facts", "long_text", true),
      field("action_taken", "long_text", true),
      field("participant_response", "long_text", false),
      field("follow_up", "long_text", false),
    ],
    prohibitedDecisions: [
      "clinical judgement",
      "service quality endorsement",
      "invented outcome",
    ],
  },
  {
    code: "ndis",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    generationServiceCode: "note.ndis.generate",
    fields: [
      field("occurred_at", "date_time", true),
      field("support_type", "short_text", true),
      field("support_delivered", "long_text", true),
      field("observable_facts", "long_text", true),
      field("action_taken", "long_text", true),
      field("participant_response", "long_text", false),
      field("provided_goal_context", "long_text", false),
      field("follow_up", "long_text", false),
    ],
    prohibitedDecisions: [
      "NDIS compliance",
      "NDIS approval",
      "invented participant goal",
      "goal achievement conclusion",
    ],
  },
  {
    code: "incident_factual",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    generationServiceCode: "note.incident_factual.generate",
    fields: [
      field("occurred_at", "date_time", true),
      field("setting_category", "short_text", true),
      field("observable_facts", "long_text", true),
      field("immediate_action", "long_text", true),
      field("notification_facts", "long_text", false),
      field("unresolved_items", "long_text", false),
    ],
    prohibitedDecisions: [
      "reportability decision",
      "safeguarding decision",
      "risk rating",
      "fault conclusion",
      "legal conclusion",
      "regulatory conclusion",
    ],
  },
] as const satisfies readonly CaresLinkV1NoteTypeDefinition[];

export type CaresLinkV1Rate = {
  serviceCode: CaresLinkV1ServiceCode;
  catalogVersion: typeof CARESLINK_V1_RATE_CATALOG_VERSION;
  unit: "request" | "minute";
  points: number | null;
  minimumPoints?: number;
  maximumPoints?: number;
  status: "SHADOW";
  effectiveFrom: "2026-08-09T00:00:00.000Z";
};

export const CARESLINK_V1_SHADOW_RATE_CATALOG = [
  fixedRate("note.communication.generate", 20),
  fixedRate("note.handover.generate", 25),
  fixedRate("note.progress.generate", 35),
  fixedRate("note.ndis.generate", 50),
  fixedRate("note.incident_factual.generate", 60),
  fixedRate("transcription.device", 0),
  fixedRate("transcription.cloud", 10, "minute"),
  fixedRate("content.explain", 10),
  {
    serviceCode: "note.regenerate.full",
    catalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    unit: "request",
    points: null,
    minimumPoints: 20,
    maximumPoints: 40,
    status: "SHADOW",
    effectiveFrom: "2026-08-09T00:00:00.000Z",
  },
  fixedRate("note.rewrite.section", 10),
] as const satisfies readonly CaresLinkV1Rate[];

export const CARESLINK_V1_ERROR_CODES = [
  "PRODUCT_API_DISABLED",
  "VALIDATION_ERROR",
  "AUTH_REQUIRED",
  "SESSION_REVOKED",
  "FORBIDDEN",
  "NOT_FOUND",
  "NOT_IMPLEMENTED",
  "IDENTITY_LINK_CONFLICT",
  "MINIMUM_FACTS_REQUIRED",
  "PRIVACY_REVIEW_REQUIRED",
  "PRIVACY_REVIEW_STALE",
  "POINTS_INSUFFICIENT",
  "POINT_QUOTE_EXPIRED",
  "PURCHASE_PENDING",
  "STALE_REVISION",
  "RATE_LIMITED",
  "GENERATION_FAILED",
  "TRANSCRIPTION_FAILED",
  "EXPORT_FAILED",
  "EXPORT_EXPIRED",
  "CONTENT_WITHDRAWN",
  "OFFLINE_NOT_SUPPORTED",
  "MIN_CLIENT_VERSION",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_STATE_TRANSITION",
] as const;
export type CaresLinkV1ErrorCode =
  (typeof CARESLINK_V1_ERROR_CODES)[number];

export type CaresLinkV1ErrorEnvelope = {
  error: {
    code: CaresLinkV1ErrorCode;
    message: string;
    correlationId: string;
    fieldCodes?: string[];
    conflict?: {
      canonicalId: string;
      currentRevisionId: string | null;
      currentRevisionNumber: number;
    };
    /** Content-free server findings. Never add excerpts or matched text here. */
    privacyFindings?: CaresLinkV1PrivacyFindingLocator[];
  };
};

export const CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES = [
  "IN_PROGRESS",
  "COMPLETED",
  "TOMBSTONED",
  "PURGED",
] as const;
export type CaresLinkV1DocumentLifecycleStatus =
  (typeof CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES)[number];

export const CARESLINK_V1_SELF_REVIEW_STATUSES = [
  "REQUIRED",
  "CONFIRMED",
] as const;
export type CaresLinkV1SelfReviewStatus =
  (typeof CARESLINK_V1_SELF_REVIEW_STATUSES)[number];

export const CARESLINK_V1_SYNC_STATUSES = [
  "LOCAL_SAVED",
  "SYNCING",
  "SERVER_ACKNOWLEDGED",
  "PENDING_SYNC",
  "NEEDS_ATTENTION",
] as const;
export type CaresLinkV1SyncStatus =
  (typeof CARESLINK_V1_SYNC_STATUSES)[number];

export const CARESLINK_V1_GENERATION_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export type CaresLinkV1GenerationStatus =
  (typeof CARESLINK_V1_GENERATION_STATUSES)[number];

export const CARESLINK_V1_EXPORT_STATUSES = [
  "REQUESTED",
  "RENDERING",
  "ARTIFACT_READY",
  "DOWNLOADED",
  "SHARED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "PURGED",
] as const;
export type CaresLinkV1ExportStatus =
  (typeof CARESLINK_V1_EXPORT_STATUSES)[number];

export const CARESLINK_V1_EXPORT_FORMATS = [
  "DOCX",
  "PDF",
  "TXT",
  "COPY",
] as const;
export type CaresLinkV1ExportFormat =
  (typeof CARESLINK_V1_EXPORT_FORMATS)[number];

export const CARESLINK_V1_POINT_EVENTS = [
  "GRANT",
  "RESERVE",
  "COMMIT",
  "RELEASE",
  "EXPIRE",
  "REVOKE",
  "ADJUSTMENT",
] as const;
export type CaresLinkV1PointEvent =
  (typeof CARESLINK_V1_POINT_EVENTS)[number];

export const CARESLINK_V1_POINT_RESERVATION_STATUSES = [
  "RESERVED",
  "COMMITTED",
  "RELEASED",
  "EXPIRED",
] as const;
export type CaresLinkV1PointReservationStatus =
  (typeof CARESLINK_V1_POINT_RESERVATION_STATUSES)[number];

export type CaresLinkV1ReviewVersions = Partial<
  Record<Exclude<CaresLinkV1Locale, "en">, string>
>;

export type CaresLinkV1JsonPrimitive = string | number | boolean | null;
export type CaresLinkV1JsonValue =
  | CaresLinkV1JsonPrimitive
  | CaresLinkV1JsonObject
  | CaresLinkV1JsonValue[];
export type CaresLinkV1JsonObject = {
  [key: string]: CaresLinkV1JsonValue;
};

type CaresLinkV1CatalogDefinition<T extends CaresLinkV1NoteTypeCode> = Extract<
  (typeof CARESLINK_V1_NOTE_CATALOG)[number],
  { code: T }
>;
type CaresLinkV1CatalogField =
  (typeof CARESLINK_V1_NOTE_CATALOG)[number]["fields"][number];
type CaresLinkV1CatalogFieldValue<T extends CaresLinkV1CatalogField> =
  T["kind"] extends "string_list"
  ? string[]
  : string;
type CaresLinkV1CleanedFactsFromDefinition<
  T extends CaresLinkV1NoteTypeCode,
> = {
  [TField in Extract<
    CaresLinkV1CatalogDefinition<T>["fields"][number],
    { required: true }
  > as TField["code"]]: CaresLinkV1CatalogFieldValue<TField>;
} & {
  [TField in Extract<
    CaresLinkV1CatalogDefinition<T>["fields"][number],
    { required: false }
  > as TField["code"]]?: CaresLinkV1CatalogFieldValue<TField>;
};

/**
 * Closed, catalog-derived cleaned structured facts for one Note type. Raw
 * pasted or transcribed source text is never a valid projection.
 */
export type CaresLinkV1CleanedFactsFor<
  T extends CaresLinkV1NoteTypeCode,
> = CaresLinkV1CleanedFactsFromDefinition<T>;

export type CaresLinkV1CleanedFactsByNoteType = {
  [T in CaresLinkV1NoteTypeCode]: CaresLinkV1CleanedFactsFor<T>;
};

export type CaresLinkV1CleanedFacts =
  CaresLinkV1CleanedFactsByNoteType[CaresLinkV1NoteTypeCode];

export type CaresLinkV1NoteContent<
  TCleanedFacts extends CaresLinkV1JsonObject = CaresLinkV1CleanedFacts,
> = {
  englishDraft: string;
  reviewVersions: CaresLinkV1ReviewVersions;
  /**
   * Canonical cleaned structured facts confirmed by the user. This must never
   * contain a raw pasted note. Privacy proofs bind to the canonical SHA-256 of
   * this object, not to generated wording such as `englishDraft`.
   */
  factsSummary: TCleanedFacts;
  missingFacts: string[];
  neutralWordingChecks: string[];
  followUpPrompts: string[];
  disclaimer: string;
};

export type CaresLinkV1Document = {
  id: string;
  ownerUserId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  lifecycleStatus: CaresLinkV1DocumentLifecycleStatus;
  currentRevisionId?: string;
  currentRevisionNumber: number;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  tombstonedAt?: string;
  purgedAt?: string;
};

export type CaresLinkV1DocumentRevision = {
  id: string;
  documentId: string;
  ownerUserId: string;
  revisionNumber: number;
  baseRevisionId?: string;
  privacyReviewId?: string;
  content: CaresLinkV1NoteContent;
  contentHash: string;
  mutationId: string;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: string;
  createdAt: string;
};

export type CaresLinkV1DocumentCheckpoint = {
  documentId: string;
  ownerUserId: string;
  currentStep: string;
  completedFieldCodes: string[];
  activeRevisionId?: string;
  privacyReviewId?: string;
  generationJobId?: string;
  syncStatus: CaresLinkV1SyncStatus;
  mutationId: string;
  updatedAt: string;
};

export const CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION =
  "2026-08-11.preview.1" as const;
export const CARESLINK_V1_PRIVACY_REVIEW_REVISION = 1 as const;
/** Temporary non-Production Preview TTL; not a Production product decision. */
export const CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS = 1800 as const;
export const CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH = 1024 as const;
export const CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS = 256 as const;

export const CARESLINK_V1_PRIVACY_FINDING_TYPES = [
  "email",
  "phone",
  "postal_address",
  "titled_person",
  "organisation_identifier",
  "labelled_identifier",
  "url",
] as const;
export type CaresLinkV1PrivacyFindingType =
  (typeof CARESLINK_V1_PRIVACY_FINDING_TYPES)[number];

export const CARESLINK_V1_PRIVACY_DECISIONS = [
  "REMOVED",
  "REPLACED",
  "GENERALISED",
  "RETAINED_CONFIRMED",
] as const;
export type CaresLinkV1PrivacyDecision =
  (typeof CARESLINK_V1_PRIVACY_DECISIONS)[number];

export type CaresLinkV1PrivacyFindingLocator = {
  findingType: CaresLinkV1PrivacyFindingType;
  /** RFC 6901 JSON pointer to the string value; contains no field value. */
  fieldCode: string;
  /** JavaScript/React Native UTF-16 code-unit offsets. */
  startOffset: number;
  endOffset: number;
};

export type CaresLinkV1PrivacyFindingDecision = {
  findingType: CaresLinkV1PrivacyFindingType;
  fieldCode: string;
  startOffset: number;
  endOffset: number;
  decision: CaresLinkV1PrivacyDecision;
  retentionPurposeConfirmed?: true;
};

export type CaresLinkV1PrivacyProof = {
  id: string;
  ownerUserId: string;
  noteType: CaresLinkV1NoteTypeCode;
  cleanedFactsHash: string;
  schemaVersion: string;
  status: "CONFIRMED" | "EXPIRED" | "REVOKED";
  scannerPolicyVersion: typeof CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION;
  reviewRevision: typeof CARESLINK_V1_PRIVACY_REVIEW_REVISION;
  findingDecisions: CaresLinkV1PrivacyFindingDecision[];
  confirmedAt: string;
  expiresAt: string;
};

export type CaresLinkV1GenerationJob = {
  id: string;
  ownerUserId: string;
  documentId: string;
  baseRevisionId?: string;
  serviceCode: CaresLinkV1ServiceCode;
  quoteId: string;
  reservationId: string;
  idempotencyKey: string;
  status: CaresLinkV1GenerationStatus;
  createdAt: string;
  updatedAt: string;
};

export type CaresLinkV1ExportEvent = {
  id: string;
  ownerUserId: string;
  documentId: string;
  revisionId: string;
  format: CaresLinkV1ExportFormat;
  status: CaresLinkV1ExportStatus;
  templateVersion: string;
  channel: "WEB_DOWNLOAD" | "APP_SHARE" | "APP_SAVE" | "COPY";
  createdAt: string;
};

export type CaresLinkV1PointQuote = {
  id: string;
  ownerUserId: string;
  serviceCode: CaresLinkV1ServiceCode;
  catalogVersion: typeof CARESLINK_V1_RATE_CATALOG_VERSION;
  points: number;
  quantity: number;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
};

export class CaresLinkV1ContractError extends Error {
  readonly code: CaresLinkV1ErrorCode;
  readonly privacyFindings?: CaresLinkV1PrivacyFindingLocator[];

  constructor(
    code: CaresLinkV1ErrorCode,
    message: string,
    options?: { privacyFindings?: CaresLinkV1PrivacyFindingLocator[] },
  ) {
    super(message);
    this.name = "CaresLinkV1ContractError";
    this.code = code;
    this.privacyFindings = options?.privacyFindings;
  }
}

export function getCaresLinkV1NoteType(
  code: CaresLinkV1NoteTypeCode,
): CaresLinkV1NoteTypeDefinition {
  const definition = CARESLINK_V1_NOTE_CATALOG.find(
    (candidate) => candidate.code === code,
  );

  if (!definition) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      "Unsupported note type",
    );
  }

  return definition;
}

/**
 * Validates and projects the exact cleaned-facts fields frozen by the shared
 * Note catalog. Error messages contain only catalog-owned field codes and
 * never echo unknown keys or submitted values.
 */
export function validateCaresLinkV1CleanedFacts<
  T extends CaresLinkV1NoteTypeCode,
>(noteType: T, value: unknown): CaresLinkV1CleanedFactsByNoteType[T] {
  if (
    typeof noteType !== "string" ||
    !(CARESLINK_V1_NOTE_TYPE_CODES as readonly string[]).includes(noteType)
  ) {
    throw cleanedFactsValidation("cleanedFacts note type is unsupported");
  }
  if (!isPlainJsonObject(value)) {
    throw cleanedFactsValidation("cleanedFacts must be an object");
  }

  const definition = getCaresLinkV1NoteType(noteType);
  const allowedCodes = new Set(
    definition.fields.map(({ code }) => code as string),
  );
  if (Object.keys(value).some((key) => !allowedCodes.has(key))) {
    throw cleanedFactsValidation("cleanedFacts contains an unsupported field");
  }

  const projection: Record<string, string | string[]> = {};
  for (const fieldDefinition of definition.fields) {
    const hasField = Object.prototype.hasOwnProperty.call(
      value,
      fieldDefinition.code,
    );
    const fieldValue = value[fieldDefinition.code];
    if (!hasField || (fieldDefinition.required && fieldValue === undefined)) {
      if (fieldDefinition.required) {
        throw cleanedFactsMinimum(fieldDefinition.code);
      }
      continue;
    }
    projection[fieldDefinition.code] = validateCleanedFactValue(
      fieldDefinition,
      fieldValue,
    );
  }

  return projection as CaresLinkV1CleanedFactsByNoteType[T];
}

/** Read/ACK boundary for payloads whose owning document type is not adjacent. */
export function validateCaresLinkV1CleanedFactsForAnyNoteType(
  value: unknown,
): CaresLinkV1CleanedFacts {
  let minimumError: CaresLinkV1ContractError | undefined;
  for (const noteType of CARESLINK_V1_NOTE_TYPE_CODES) {
    try {
      return validateCaresLinkV1CleanedFacts(noteType, value);
    } catch (error) {
      if (!(error instanceof CaresLinkV1ContractError)) throw error;
      if (error.code === "MINIMUM_FACTS_REQUIRED" && !minimumError) {
        minimumError = error;
      }
    }
  }
  if (minimumError) throw minimumError;
  throw cleanedFactsValidation(
    "cleanedFacts does not match a supported Note schema",
  );
}

function validateCleanedFactValue(
  fieldDefinition: CaresLinkV1NoteFieldDefinition,
  value: unknown,
): string | string[] {
  if (fieldDefinition.kind === "string_list") {
    if (!Array.isArray(value)) {
      throw cleanedFactsValidation("cleanedFacts field type is invalid");
    }
    if (
      fieldDefinition.required &&
      (value.length === 0 ||
        value.every(
          (entry) => typeof entry === "string" && !entry.trim(),
        ))
    ) {
      throw cleanedFactsMinimum(fieldDefinition.code);
    }
    if (
      value.length === 0 ||
      value.some(
        (entry) =>
          typeof entry !== "string" ||
          !entry.trim() ||
          entry !== entry.trim(),
      )
    ) {
      throw cleanedFactsValidation("cleanedFacts field value is invalid");
    }
    return [...value] as string[];
  }

  if (typeof value !== "string") {
    throw cleanedFactsValidation("cleanedFacts field type is invalid");
  }
  if (!value.trim()) {
    if (fieldDefinition.required) {
      throw cleanedFactsMinimum(fieldDefinition.code);
    }
    throw cleanedFactsValidation("cleanedFacts field value is invalid");
  }
  if (value !== value.trim()) {
    throw cleanedFactsValidation("cleanedFacts field value is invalid");
  }
  if (fieldDefinition.kind === "date_time" && !isRfc3339WithTimezone(value)) {
    throw cleanedFactsValidation(
      "cleanedFacts date_time must be valid RFC3339 with a timezone",
    );
  }
  return value;
}

const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function isRfc3339WithTimezone(value: string) {
  const match = value.trim().match(RFC3339_PATTERN);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth =
    year >= 1 && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;
  return (
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanedFactsMinimum(fieldCode: string) {
  return new CaresLinkV1ContractError(
    "MINIMUM_FACTS_REQUIRED",
    `Required cleaned fact is missing or empty: ${fieldCode}`,
  );
}

function cleanedFactsValidation(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

export function getCaresLinkV1Rate(
  serviceCode: CaresLinkV1ServiceCode,
): CaresLinkV1Rate {
  const rate = CARESLINK_V1_SHADOW_RATE_CATALOG.find(
    (candidate) => candidate.serviceCode === serviceCode,
  );

  if (!rate) {
    throw new CaresLinkV1ContractError(
      "POINTS_INSUFFICIENT",
      "No shadow rate is defined for the service",
    );
  }

  return rate;
}

export function isCaresLinkV1Locale(
  value: unknown,
): value is CaresLinkV1Locale {
  return CARESLINK_V1_LOCALES.includes(value as CaresLinkV1Locale);
}

export function assertCaresLinkV1IdempotencyKey(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(value)) {
    throw new CaresLinkV1ContractError(
      "IDEMPOTENCY_CONFLICT",
      "Idempotency key must be 16-128 safe characters",
    );
  }

  return value;
}

export function canTransitionDocumentLifecycle(
  from: CaresLinkV1DocumentLifecycleStatus,
  to: CaresLinkV1DocumentLifecycleStatus,
) {
  const transitions: Record<
    CaresLinkV1DocumentLifecycleStatus,
    readonly CaresLinkV1DocumentLifecycleStatus[]
  > = {
    IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "TOMBSTONED"],
    COMPLETED: ["COMPLETED", "IN_PROGRESS", "TOMBSTONED"],
    TOMBSTONED: ["TOMBSTONED", "PURGED"],
    PURGED: ["PURGED"],
  };

  return transitions[from].includes(to);
}

export function canTransitionGenerationStatus(
  from: CaresLinkV1GenerationStatus,
  to: CaresLinkV1GenerationStatus,
) {
  const transitions: Record<
    CaresLinkV1GenerationStatus,
    readonly CaresLinkV1GenerationStatus[]
  > = {
    QUEUED: ["QUEUED", "RUNNING", "FAILED", "CANCELLED"],
    RUNNING: ["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
    SUCCEEDED: ["SUCCEEDED"],
    FAILED: ["FAILED"],
    CANCELLED: ["CANCELLED"],
  };

  return transitions[from].includes(to);
}

export function canTransitionExportStatus(
  from: CaresLinkV1ExportStatus,
  to: CaresLinkV1ExportStatus,
) {
  const transitions: Record<
    CaresLinkV1ExportStatus,
    readonly CaresLinkV1ExportStatus[]
  > = {
    REQUESTED: ["REQUESTED", "RENDERING", "FAILED", "CANCELLED"],
    RENDERING: ["RENDERING", "ARTIFACT_READY", "FAILED", "CANCELLED"],
    ARTIFACT_READY: [
      "ARTIFACT_READY",
      "DOWNLOADED",
      "SHARED",
      "EXPIRED",
    ],
    DOWNLOADED: ["DOWNLOADED", "EXPIRED"],
    SHARED: ["SHARED", "EXPIRED"],
    FAILED: ["FAILED"],
    CANCELLED: ["CANCELLED"],
    EXPIRED: ["EXPIRED", "PURGED"],
    PURGED: ["PURGED"],
  };

  return transitions[from].includes(to);
}

export function assertValidStateTransition(
  allowed: boolean,
  description: string,
) {
  if (!allowed) {
    throw new CaresLinkV1ContractError(
      "INVALID_STATE_TRANSITION",
      description,
    );
  }
}

function field<
  const TCode extends string,
  const TKind extends CaresLinkV1FieldKind,
  const TRequired extends boolean,
>(
  code: TCode,
  kind: TKind,
  required: TRequired,
): {
  code: TCode;
  kind: TKind;
  required: TRequired;
  containsParticipantIdentifier: false;
} {
  return {
    code,
    kind,
    required,
    containsParticipantIdentifier: false,
  };
}

function fixedRate(
  serviceCode: CaresLinkV1ServiceCode,
  points: number,
  unit: "request" | "minute" = "request",
): CaresLinkV1Rate {
  return {
    serviceCode,
    catalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    unit,
    points,
    status: "SHADOW",
    effectiveFrom: "2026-08-09T00:00:00.000Z",
  };
}
