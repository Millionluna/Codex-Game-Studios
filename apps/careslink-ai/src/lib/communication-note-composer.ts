import {
  CARESLINK_V1_LOCALES,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1Locale,
} from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_COMPOSER_LOCALES = CARESLINK_V1_LOCALES;

export const COMMUNICATION_NOTE_COMPOSER_FIELDS = [
  "occurred_at",
  "contact_channel",
  "parties_by_role",
  "observable_facts",
  "action_taken",
  "stated_outcome",
  "follow_up",
] as const;

export const COMMUNICATION_NOTE_COMPOSER_REQUIRED_FIELDS = [
  "occurred_at",
  "contact_channel",
  "parties_by_role",
  "observable_facts",
  "action_taken",
] as const;

export type CommunicationNoteComposerLocale = CaresLinkV1Locale;
export type CommunicationNoteComposerField =
  (typeof COMMUNICATION_NOTE_COMPOSER_FIELDS)[number];
export type CommunicationNoteComposerRequiredField =
  (typeof COMMUNICATION_NOTE_COMPOSER_REQUIRED_FIELDS)[number];

/** Editable browser state. Optional text fields stay strings for controlled inputs. */
export type CommunicationNoteComposerDraft = {
  occurred_at: string;
  contact_channel: string;
  parties_by_role: string[];
  observable_facts: string;
  action_taken: string;
  stated_outcome: string;
  follow_up: string;
};

export type CommunicationNotePrivacyFindingKind =
  | "email"
  | "phone"
  | "ndis_number"
  | "name_label"
  | "address_label"
  | "dob_label";

/**
 * Content-free locator for an in-memory finding. Offsets are UTF-16 code-unit
 * offsets in the named field value. No matched excerpt is returned.
 */
export type CommunicationNotePrivacyFinding = Readonly<{
  kind: CommunicationNotePrivacyFindingKind;
  field: CommunicationNoteComposerField;
  fieldPath: string;
  startOffset: number;
  endOffset: number;
  replacement: string;
}>;

export type CommunicationNoteComposerValidationIssue = Readonly<{
  field: CommunicationNoteComposerField;
  code: "required" | "invalid_date_time" | "invalid_value";
}>;

export type CommunicationNoteComposerReview = Readonly<{
  locale: CommunicationNoteComposerLocale;
  sanitisedDraft: CommunicationNoteComposerDraft;
  findings: readonly CommunicationNotePrivacyFinding[];
  missingRequiredFields: readonly CommunicationNoteComposerRequiredField[];
  validationIssues: readonly CommunicationNoteComposerValidationIssue[];
  cleanedFacts?: CaresLinkV1CleanedFactsFor<"communication">;
}>;

export type CommunicationNoteComposerConfirmations = Readonly<{
  reviewedNoIdentifiers: boolean;
  processingAuthorityConfirmed: boolean;
}>;

export type CommunicationNoteComposerSubmission = Readonly<{
  sourceLocale: CommunicationNoteComposerLocale;
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">;
  privacyReview: Readonly<{
    reviewedNoIdentifiers: true;
    processingAuthorityConfirmed: true;
  }>;
}>;

export type CommunicationNoteComposerCopy = Readonly<{
  title: string;
  description: string;
  optionalLabel: string;
  reviewAction: string;
  privacyHeading: string;
  privacyBody: string;
  readyMessage: string;
  fieldLabels: Readonly<Record<CommunicationNoteComposerField, string>>;
  fieldPlaceholders: Readonly<Record<CommunicationNoteComposerField, string>>;
  findingLabels: Readonly<Record<CommunicationNotePrivacyFindingKind, string>>;
  confirmationLabels: Readonly<{
    reviewedNoIdentifiers: string;
    processingAuthorityConfirmed: string;
  }>;
  validationLabels: Readonly<{
    required: string;
    invalid_date_time: string;
    invalid_value: string;
  }>;
}>;

type DetectionRule = Readonly<{
  kind: CommunicationNotePrivacyFindingKind;
  replacement: string;
  expression: () => RegExp;
  isValid?: (match: string) => boolean;
}>;

type TextLocation = Readonly<{
  field: CommunicationNoteComposerField;
  fieldPath: string;
  value: string;
  fieldOrder: number;
  itemOrder: number;
}>;

type LocatedFinding = CommunicationNotePrivacyFinding &
  Readonly<{ fieldOrder: number; itemOrder: number; ruleOrder: number }>;

const DETECTION_RULES: readonly DetectionRule[] = [
  {
    kind: "ndis_number",
    replacement: "[NDIS number removed]",
    expression: () =>
      /(?:\bNDIS(?:\s+participant)?\s*(?:number|no\.?|id|#)\s*[:#=-]?\s*\d{6,12}\b|NDIS(?:号码|編號|编号|号碼|號碼|號)\s*(?:是|[:：#=-])?\s*\d{6,12})/giu,
  },
  {
    kind: "dob_label",
    replacement: "[date of birth removed]",
    expression: () =>
      /(?:\b(?:DOB|date\s+of\s+birth)\s*[:=-]\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})|(?:出生日期|生日)\s*[:：=-]\s*\d{1,4}[./年-]\d{1,2}(?:[./月-]\d{1,4}日?)?)/giu,
  },
  {
    kind: "address_label",
    replacement: "[location generalised]",
    expression: () =>
      /(?:\b(?:(?:postal|residential|home)\s+)?address\s*[:=-]\s*[^\n,;]{3,120}|(?:住址|地址)\s*[:：=-]\s*[^\n，。；;]{3,120})/giu,
  },
  {
    kind: "name_label",
    replacement: "[person by role]",
    expression: () =>
      /(?:\b(?:(?:participant|client|person)\s+name|name)\s*[:=-]\s*(?:(?:Mr|Mrs|Ms|Miss|Dr|Mx)\.?\s+)?[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}|(?:参与者姓名|參與者姓名|服务对象姓名|服務對象姓名|姓名|名字)\s*[:：=-]\s*[\p{Script=Han}]{2,4})/giu,
  },
  {
    kind: "email",
    replacement: "[email removed]",
    expression: () =>
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu,
  },
  {
    kind: "phone",
    replacement: "[phone removed]",
    expression: () => /(?:\+?61[\s().-]*|0)(?:\d[\s().-]*){8}\d/g,
    isValid: (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length === 10 ||
        (digits.startsWith("61") && digits.length === 11);
    },
  },
] as const;

const COPY: Readonly<
  Record<CommunicationNoteComposerLocale, CommunicationNoteComposerCopy>
> = {
  en: {
    title: "Communication Note",
    description:
      "Structure de-identified communication facts for review before any draft is generated.",
    optionalLabel: "Optional",
    reviewAction: "Review facts and privacy",
    privacyHeading: "Privacy review",
    privacyBody:
      "Remove names, contact details, identifiers, addresses and dates of birth. Use roles instead of names.",
    readyMessage: "The cleaned facts are ready for your two confirmations.",
    fieldLabels: {
      occurred_at: "When the contact occurred",
      contact_channel: "Contact channel",
      parties_by_role: "Parties by role",
      observable_facts: "Observable facts",
      action_taken: "Action taken",
      stated_outcome: "Stated outcome",
      follow_up: "Follow-up",
    },
    fieldPlaceholders: {
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "For example, phone or email",
      parties_by_role: "For example, support worker; family representative",
      observable_facts: "Record only what was observed or stated.",
      action_taken: "Record the action that was actually taken.",
      stated_outcome: "Attribute any stated outcome to the relevant role.",
      follow_up: "Record only an agreed or requested follow-up.",
    },
    findingLabels: {
      email: "Email address",
      phone: "Phone number",
      ndis_number: "NDIS number",
      name_label: "Labelled name",
      address_label: "Labelled address",
      dob_label: "Labelled date of birth",
    },
    confirmationLabels: {
      reviewedNoIdentifiers:
        "I reviewed the cleaned facts and found no remaining personal identifiers.",
      processingAuthorityConfirmed:
        "I confirm I have authority to process these de-identified facts.",
    },
    validationLabels: {
      required: "Complete this required field.",
      invalid_date_time:
        "Enter a valid date and time with a timezone, such as 2026-09-01T14:30:00+10:00.",
      invalid_value: "Review this value before continuing.",
    },
  },
  "zh-Hans": {
    title: "沟通记录",
    description: "先整理并检查已去标识化的沟通事实，再进入任何草稿生成步骤。",
    optionalLabel: "选填",
    reviewAction: "检查事实与隐私",
    privacyHeading: "隐私检查",
    privacyBody: "请移除姓名、联系方式、编号、地址和出生日期，并以角色代替姓名。",
    readyMessage: "清理后的事实已可进行两项确认。",
    fieldLabels: {
      occurred_at: "沟通发生时间",
      contact_channel: "沟通渠道",
      parties_by_role: "参与方角色",
      observable_facts: "可观察事实",
      action_taken: "已采取的行动",
      stated_outcome: "陈述的结果",
      follow_up: "后续事项",
    },
    fieldPlaceholders: {
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "例如：电话或电子邮件",
      parties_by_role: "例如：支持人员；家庭代表",
      observable_facts: "仅记录观察到或明确陈述的事实。",
      action_taken: "记录实际采取的行动。",
      stated_outcome: "将陈述的结果归因于相应角色。",
      follow_up: "仅记录已约定或已请求的后续事项。",
    },
    findingLabels: {
      email: "电子邮件地址",
      phone: "电话号码",
      ndis_number: "NDIS 编号",
      name_label: "带标签的姓名",
      address_label: "带标签的地址",
      dob_label: "带标签的出生日期",
    },
    confirmationLabels: {
      reviewedNoIdentifiers: "我已检查清理后的事实，未发现剩余个人标识符。",
      processingAuthorityConfirmed: "我确认有权处理这些已去标识化的事实。",
    },
    validationLabels: {
      required: "请填写此必填项。",
      invalid_date_time:
        "请输入带时区的有效日期与时间，例如 2026-09-01T14:30:00+10:00。",
      invalid_value: "请检查此内容后再继续。",
    },
  },
  "zh-Hant": {
    title: "溝通記錄",
    description: "先整理並檢查已去識別化的溝通事實，再進入任何草稿產生步驟。",
    optionalLabel: "選填",
    reviewAction: "檢查事實與隱私",
    privacyHeading: "隱私檢查",
    privacyBody: "請移除姓名、聯絡方式、編號、地址和出生日期，並以角色代替姓名。",
    readyMessage: "清理後的事實已可進行兩項確認。",
    fieldLabels: {
      occurred_at: "溝通發生時間",
      contact_channel: "溝通管道",
      parties_by_role: "參與方角色",
      observable_facts: "可觀察事實",
      action_taken: "已採取的行動",
      stated_outcome: "陳述的結果",
      follow_up: "後續事項",
    },
    fieldPlaceholders: {
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "例如：電話或電子郵件",
      parties_by_role: "例如：支援人員；家庭代表",
      observable_facts: "僅記錄觀察到或明確陳述的事實。",
      action_taken: "記錄實際採取的行動。",
      stated_outcome: "將陳述的結果歸因於相應角色。",
      follow_up: "僅記錄已約定或已要求的後續事項。",
    },
    findingLabels: {
      email: "電子郵件地址",
      phone: "電話號碼",
      ndis_number: "NDIS 編號",
      name_label: "帶標籤的姓名",
      address_label: "帶標籤的地址",
      dob_label: "帶標籤的出生日期",
    },
    confirmationLabels: {
      reviewedNoIdentifiers: "我已檢查清理後的事實，未發現剩餘個人識別符。",
      processingAuthorityConfirmed: "我確認有權處理這些已去識別化的事實。",
    },
    validationLabels: {
      required: "請填寫此必填項。",
      invalid_date_time:
        "請輸入帶時區的有效日期與時間，例如 2026-09-01T14:30:00+10:00。",
      invalid_value: "請檢查此內容後再繼續。",
    },
  },
};

/** Strict parser: callers must handle unsupported locales explicitly. */
export function parseCommunicationNoteComposerLocale(
  value: unknown,
): CommunicationNoteComposerLocale {
  if (
    typeof value === "string" &&
    (COMMUNICATION_NOTE_COMPOSER_LOCALES as readonly string[]).includes(value)
  ) {
    return value as CommunicationNoteComposerLocale;
  }
  throw new Error("Unsupported Communication Note locale");
}

export function getCommunicationNoteComposerCopy(
  locale: unknown,
): CommunicationNoteComposerCopy {
  return COPY[parseCommunicationNoteComposerLocale(locale)];
}

export function createEmptyCommunicationNoteComposerDraft(): CommunicationNoteComposerDraft {
  return {
    occurred_at: "",
    contact_channel: "",
    parties_by_role: [],
    observable_facts: "",
    action_taken: "",
    stated_outcome: "",
    follow_up: "",
  };
}

/** Scans browser-held values synchronously and never performs I/O. */
export function scanCommunicationNoteDraft(
  draft: CommunicationNoteComposerDraft,
): readonly CommunicationNotePrivacyFinding[] {
  return scanLocations(getTextLocations(draft)).map(stripInternalFinding);
}

/**
 * Produces a de-identified structured review. The returned object contains no
 * copy of the original draft and findings contain no matched excerpts.
 */
export function reviewCommunicationNoteDraft(
  draft: CommunicationNoteComposerDraft,
  locale: unknown,
): CommunicationNoteComposerReview {
  const parsedLocale = parseCommunicationNoteComposerLocale(locale);
  const locations = getTextLocations(draft);
  const locatedFindings = scanLocations(locations);
  const sanitisedDraft = sanitiseDraft(draft, locations, locatedFindings);
  const missingRequiredFields =
    getMissingCommunicationNoteRequiredFields(sanitisedDraft);
  const validationIssues: CommunicationNoteComposerValidationIssue[] =
    missingRequiredFields.map((field) => ({ field, code: "required" }));

  let cleanedFacts: CaresLinkV1CleanedFactsFor<"communication"> | undefined;
  if (missingRequiredFields.length === 0) {
    try {
      cleanedFacts = validateCaresLinkV1CleanedFacts(
        "communication",
        toCleanedFactsCandidate(sanitisedDraft),
      );
    } catch {
      validationIssues.push({
        field: "occurred_at",
        code: "invalid_date_time",
      });
    }
  }

  return {
    locale: parsedLocale,
    sanitisedDraft,
    findings: locatedFindings.map(stripInternalFinding),
    missingRequiredFields,
    validationIssues,
    ...(cleanedFacts ? { cleanedFacts } : {}),
  };
}

export function getMissingCommunicationNoteRequiredFields(
  draft: CommunicationNoteComposerDraft,
): CommunicationNoteComposerRequiredField[] {
  return COMMUNICATION_NOTE_COMPOSER_REQUIRED_FIELDS.filter((field) => {
    if (field === "parties_by_role") {
      return draft.parties_by_role.every((value) => !value.trim());
    }
    return !draft[field].trim();
  });
}

/** Returns undefined until validated facts and both explicit gates are present. */
export function buildCommunicationNoteSubmission(
  review: CommunicationNoteComposerReview | undefined,
  confirmations: CommunicationNoteComposerConfirmations,
): CommunicationNoteComposerSubmission | undefined {
  if (
    !review?.cleanedFacts ||
    review.validationIssues.length > 0 ||
    !confirmations.reviewedNoIdentifiers ||
    !confirmations.processingAuthorityConfirmed
  ) {
    return undefined;
  }

  return {
    sourceLocale: review.locale,
    cleanedFacts: cloneCleanedFacts(review.cleanedFacts),
    privacyReview: {
      reviewedNoIdentifiers: true,
      processingAuthorityConfirmed: true,
    },
  };
}

function getTextLocations(
  draft: CommunicationNoteComposerDraft,
): TextLocation[] {
  const locations: TextLocation[] = [];
  for (const [fieldOrder, field] of COMMUNICATION_NOTE_COMPOSER_FIELDS.entries()) {
    if (field === "parties_by_role") {
      for (const [itemOrder, item] of draft.parties_by_role.entries()) {
        locations.push({
          field,
          fieldPath: `/parties_by_role/${itemOrder}`,
          value: item,
          fieldOrder,
          itemOrder,
        });
      }
    } else {
      locations.push({
        field,
        fieldPath: `/${field}`,
        value: draft[field],
        fieldOrder,
        itemOrder: 0,
      });
    }
  }
  return locations;
}

function scanLocations(locations: readonly TextLocation[]): LocatedFinding[] {
  const findings: LocatedFinding[] = [];
  for (const location of locations) {
    const candidates: LocatedFinding[] = [];
    for (const [ruleOrder, rule] of DETECTION_RULES.entries()) {
      for (const match of location.value.matchAll(rule.expression())) {
        if (
          match.index === undefined ||
          !match[0] ||
          (rule.isValid && !rule.isValid(match[0]))
        ) {
          continue;
        }
        candidates.push({
          kind: rule.kind,
          field: location.field,
          fieldPath: location.fieldPath,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          replacement: rule.replacement,
          fieldOrder: location.fieldOrder,
          itemOrder: location.itemOrder,
          ruleOrder,
        });
      }
    }
    findings.push(...removeOverlappingFindings(candidates));
  }
  return findings.sort(compareLocatedFindings);
}

function removeOverlappingFindings(
  candidates: readonly LocatedFinding[],
): LocatedFinding[] {
  const selected: LocatedFinding[] = [];
  const ordered = [...candidates].sort(
    (left, right) =>
      left.startOffset - right.startOffset ||
      right.endOffset - left.endOffset ||
      left.ruleOrder - right.ruleOrder,
  );
  for (const candidate of ordered) {
    if (
      selected.some(
        (existing) =>
          candidate.startOffset < existing.endOffset &&
          candidate.endOffset > existing.startOffset,
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  return selected;
}

function compareLocatedFindings(
  left: LocatedFinding,
  right: LocatedFinding,
) {
  return (
    left.fieldOrder - right.fieldOrder ||
    left.itemOrder - right.itemOrder ||
    left.startOffset - right.startOffset ||
    left.ruleOrder - right.ruleOrder
  );
}

function stripInternalFinding(
  finding: LocatedFinding,
): CommunicationNotePrivacyFinding {
  return {
    kind: finding.kind,
    field: finding.field,
    fieldPath: finding.fieldPath,
    startOffset: finding.startOffset,
    endOffset: finding.endOffset,
    replacement: finding.replacement,
  };
}

function sanitiseDraft(
  draft: CommunicationNoteComposerDraft,
  locations: readonly TextLocation[],
  findings: readonly LocatedFinding[],
): CommunicationNoteComposerDraft {
  const sanitised = createEmptyCommunicationNoteComposerDraft();
  sanitised.parties_by_role = draft.parties_by_role.map(() => "");

  for (const location of locations) {
    const replacements = findings.filter(
      (finding) => finding.fieldPath === location.fieldPath,
    );
    const value = applyReplacements(location.value, replacements);
    if (location.field === "parties_by_role") {
      sanitised.parties_by_role[location.itemOrder] = value;
    } else {
      sanitised[location.field] = value;
    }
  }

  sanitised.parties_by_role = sanitised.parties_by_role.filter(Boolean);
  return sanitised;
}

function applyReplacements(
  value: string,
  findings: readonly CommunicationNotePrivacyFinding[],
) {
  let output = value;
  for (const finding of [...findings].sort(
    (left, right) => right.startOffset - left.startOffset,
  )) {
    output =
      output.slice(0, finding.startOffset) +
      finding.replacement +
      output.slice(finding.endOffset);
  }
  return normalizeText(output);
}

function toCleanedFactsCandidate(
  draft: CommunicationNoteComposerDraft,
): CaresLinkV1CleanedFactsFor<"communication"> {
  return {
    occurred_at: draft.occurred_at,
    contact_channel: draft.contact_channel,
    parties_by_role: [...draft.parties_by_role],
    observable_facts: draft.observable_facts,
    action_taken: draft.action_taken,
    ...(draft.stated_outcome
      ? { stated_outcome: draft.stated_outcome }
      : {}),
    ...(draft.follow_up ? { follow_up: draft.follow_up } : {}),
  };
}

function cloneCleanedFacts(
  facts: CaresLinkV1CleanedFactsFor<"communication">,
): CaresLinkV1CleanedFactsFor<"communication"> {
  return {
    occurred_at: facts.occurred_at,
    contact_channel: facts.contact_channel,
    parties_by_role: [...facts.parties_by_role],
    observable_facts: facts.observable_facts,
    action_taken: facts.action_taken,
    ...(facts.stated_outcome ? { stated_outcome: facts.stated_outcome } : {}),
    ...(facts.follow_up ? { follow_up: facts.follow_up } : {}),
  };
}

function normalizeText(value: string) {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
