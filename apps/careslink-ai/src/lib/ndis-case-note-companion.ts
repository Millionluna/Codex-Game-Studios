export type NdisCaseNoteCompanionInput = {
  supportDateTime: string;
  supportType: string;
  setting: string;
  supportDelivered: string;
  observableFacts: string;
  actionTaken: string;
  followUp?: string;
};

export type NdisCaseNoteMaterial = {
  englishCaseNoteDraft: string;
  chineseReviewVersion: string;
  missingFacts: string[];
  neutralWordingChecks: string[];
  followUpPrompts: string[];
  disclaimer: string;
};

export type NdisCaseNotePrivacyAttestation = {
  reviewedNoIdentifiers: true;
  processingAuthorityConfirmed: true;
};

export type NdisCaseNoteInputIssue = {
  field: keyof NdisCaseNoteCompanionInput | "form";
  code:
    | "required"
    | "too_long"
    | "email"
    | "phone"
    | "ndis_number"
    | "date_of_birth"
    | "name"
    | "address"
    | "subjective_language"
    | "clinical_language"
    | "risk_statement"
    | "goal_achievement"
    | "quality_assessment"
    | "indirect_identifier";
  message: string;
};

export type NdisCaseNoteInputValidation =
  | {
      ok: true;
      input: NdisCaseNoteCompanionInput;
    }
  | {
      ok: false;
      issues: NdisCaseNoteInputIssue[];
    };

export const NDIS_CASE_NOTE_DISCLAIMER =
  "User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.";

export const NDIS_CASE_NOTE_CHINESE_REVIEW_LABEL =
  "Chinese review version for factual checking only. It is not a second formal record.";

export const NDIS_CASE_NOTE_INPUT_LIMITS = {
  supportDateTime: 80,
  supportType: 120,
  setting: 180,
  supportDelivered: 800,
  observableFacts: 1200,
  actionTaken: 800,
  followUp: 800,
} as const;

export const NDIS_CASE_NOTE_REQUIRED_FIELDS = [
  "supportDateTime",
  "supportType",
  "setting",
  "supportDelivered",
  "observableFacts",
  "actionTaken",
] as const;

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const AU_MOBILE_PATTERN =
  /(?:^|[^\d])(?:\+?61[\s().-]?(?:\(0\)[\s().-]?)?4|04)(?:[\s().-]?\d){8}(?!\d)/;
const AU_LANDLINE_PATTERN =
  /(?:^|[^\d])(?:\+?61[\s.-]?\(?[2378]\)?|0[2378]|\(0[2378]\))(?:[\s().-]?\d){8}(?!\d)/;
const NDIS_NUMBER_PATTERN =
  /(?:\bndis(?:\s+participant)?(?:\s*(?:number|no\.?|id))?\s*[:#-]?\s*\d{6,12}\b|(?:NDIS|ndis)(?:号码|编号|号)?\s*(?:是|[:：#-])?\s*\d{6,12})/i;
const DATE_OF_BIRTH_PATTERN =
  /(?:\b(?:dob|date\s+of\s+birth)|出生日期|生日)\s*[:：#-]?\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/i;
const ENGLISH_NAME_PATTERN =
  /\b(?:(?:[Pp]articipant|[Cc]lient|[Pp]erson|[Nn]ame)(?:\s+name)?\s*[:：-]\s*(?:(?:[Mm]r|[Mm]rs|[Mm]s|[Mm]iss|[Dd]r)\.?\s+)?[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30})?|(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30})?)\b/;
const CHINESE_NAME_PATTERN =
  /(?:姓名|名字|参与者|服务对象)\s*[:：]\s*[\u3400-\u9fff]{2,4}|(?:她|他|其)?(?:女儿|儿子|母亲|父亲|妈妈|爸爸|姐姐|妹妹|哥哥|弟弟|配偶|丈夫|妻子)\s*[\u3400-\u9fff]{2,4}|(?:小[\u3400-\u9fff]{1,2}|[\u3400-\u9fff]{2,4})(?:护工|社工|护士|老师)|[\u3400-\u9fff]{1,3}(?:先生|女士|小姐|阿姨|叔叔)/;
const MIXED_LANGUAGE_NAME_PATTERN =
  /(?:[\u3400-\u9fff]{2,4}\s+(?:[A-Z][A-Za-z'-]{1,30}\s+){1,2}[A-Z][A-Za-z'-]{1,30}|(?:[A-Z][A-Za-z'-]{1,30}\s+){1,2}[A-Z][A-Za-z'-]{1,30}\s+[\u3400-\u9fff]{2,4})/;
const ENGLISH_ADDRESS_PATTERN =
  /\b\d{1,5}\s+[A-Za-z0-9' -]{2,40}\s(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln|Boulevard|Blvd|Place|Pl|Crescent|Cres)\b/i;
const CHINESE_ADDRESS_PATTERN =
  /(?:住址|地址)\s*[:：]\s*[^\n，。；;]{3,80}|[\u3400-\u9fffA-Za-z0-9]{2,30}(?:路|街|道|巷)\s*\d{1,5}\s*号/;
const SUBJECTIVE_LANGUAGE_PATTERN =
  /\b(?:difficult|lazy|aggressive|manipulative|attention-seeking|uncooperative|good\s+mood|bad\s+mood)\b|(?:难搞|懒惰|攻击性|操纵性|寻求关注|不配合|心情很好|心情很差)/i;
const CLINICAL_LANGUAGE_PATTERN =
  /\b(?:diagnos(?:e|ed|is|tic)|depress(?:ed|ion)|anxi(?:ous|ety)|psychotic|manic|medically unstable)\b|诊断|抑郁症?|焦虑症?|精神病|躁狂|病情恶化/i;
const RISK_STATEMENT_PATTERN =
  /\b(?:(?:high|medium|moderate|low|immediate)\s+risk|at\s+risk|unsafe|dangerous)\b|(?:高|中|低)风险|有风险|不安全|危险/i;
const GOAL_ACHIEVEMENT_PATTERN =
  /\b(?:goal(?:\s+was|\s+has\s+been)?\s+(?:achieved|met|completed)|achieved\s+(?:the\s+)?goal)\b|目标(?:已经|已)?(?:达成|完成|实现)/i;
const QUALITY_ASSESSMENT_PATTERN =
  /\b(?:worker|provider|support\s+worker)\s+(?:is|was|seemed|appeared)\s+(?:excellent|poor|professional|unprofessional|qualified|competent|incompetent|suitable|unsuitable)\b|(?:工作人员|服务商|支持人员)(?:非常|很)?(?:优秀|专业|不专业|合格|不合格|称职|不称职)/i;
const INDIRECT_IDENTIFIER_PATTERN =
  /\b(?:school|employer|workplace|hospital|clinic|service\s+name|relative'?s?\s+name)\s*[:：-]\s*[^\n,.;]{2,80}|(?:学校|雇主|工作单位|医院|诊所|机构名称|亲属姓名)\s*[:：]\s*[^\n，。；;]{2,80}|\b(?:Chatswood Chase|(?:[A-Z][A-Za-z'-]+\s+){0,3}[A-Z][A-Za-z'-]+\s+(?:Shopping Centre|Shopping Center|Mall|Hospital|Clinic|School))\b/i;

const PROHIBITED_OUTPUT_PATTERNS = [
  /\bapproved\b/i,
  /\bcompliant\b/i,
  /\bverified\b/i,
  /\bguaranteed\b/i,
  /\bcertified\b/i,
  /\bendorsed\b/i,
  /\bmeets?\s+(?:all\s+)?requirements?\b/i,
  /\bdiagnos(?:e|ed|is|tic)\b/i,
  /\b(?:high|medium|moderate|low|immediate)\s+risk\b/i,
  /\b(?:is|was|remains?)\s+at\s+risk\b/i,
  /\brisk\s+(?:level|rating|conclusion)\b/i,
  /\bgoal\s+(?:was\s+|has\s+been\s+)?(?:achieved|met|completed)\b/i,
  /\b(?:achieved|met|completed)\s+(?:the\s+)?(?:participant'?s?\s+)?goal\b/i,
  /\b(?:positive|negative|successful|unsuccessful)\s+(?:care\s+)?outcome\b/i,
  /\b(?:qualified|competent|suitable|appropriate)\s+(?:worker|provider|support)\b/i,
  /\b(?:worker|provider)\s+(?:is|was|appears?)\s+(?:qualified|competent|suitable|appropriate)\b/i,
  /(?:已批准|符合要求|合规|已验证|保证|认证|背书)/,
  /(?:诊断为|被诊断|风险等级|(?:高|中|低)风险)/,
  /目标(?:已经|已)?(?:达成|完成|实现)/,
  /(?:工作人员|服务商|支持人员)(?:非常|很)?(?:优秀|专业|不专业|合格|不合格|称职|不称职)/,
] as const;

export function validateNdisCaseNotePrivacyAttestation(
  value: unknown,
): value is NdisCaseNotePrivacyAttestation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.reviewedNoIdentifiers === true &&
    record.processingAuthorityConfirmed === true
  );
}

export function validateNdisCaseNoteCompanionInput(
  value: unknown,
): NdisCaseNoteInputValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      issues: [
        {
          field: "form",
          code: "required",
          message: "Enter the support details before generating a draft.",
        },
      ],
    };
  }

  const record = value as Record<string, unknown>;
  const input: NdisCaseNoteCompanionInput = {
    supportDateTime: getString(record.supportDateTime),
    supportType: getString(record.supportType),
    setting: getString(record.setting),
    supportDelivered: getString(record.supportDelivered),
    observableFacts: getString(record.observableFacts),
    actionTaken: getString(record.actionTaken),
    followUp: getOptionalString(record.followUp),
  };
  const issues: NdisCaseNoteInputIssue[] = [];

  NDIS_CASE_NOTE_REQUIRED_FIELDS.forEach((field) => {
    if (!input[field]) {
      issues.push({
        field,
        code: "required",
        message: "This field is required.",
      });
    }
  });

  (
    Object.keys(NDIS_CASE_NOTE_INPUT_LIMITS) as Array<
      keyof NdisCaseNoteCompanionInput
    >
  ).forEach((field) => {
    const fieldValue = input[field];
    const limit = NDIS_CASE_NOTE_INPUT_LIMITS[field];

    if (fieldValue && fieldValue.length > limit) {
      issues.push({
        field,
        code: "too_long",
        message: `Keep this field under ${limit} characters.`,
      });
    }
  });

  for (const [field, fieldValue] of Object.entries(input) as Array<
    [keyof NdisCaseNoteCompanionInput, string | undefined]
  >) {
    if (!fieldValue) {
      continue;
    }

    const identifierIssue = getObviousIdentifierIssue(field, fieldValue);

    if (identifierIssue) {
      issues.push(identifierIssue);
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, input };
}

export function parseNdisCaseNoteMaterial(
  outputText: unknown,
  options: { allowLegacy?: boolean } = {},
): NdisCaseNoteMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse NDIS case note draft");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Unable to parse NDIS case note draft");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Unable to parse NDIS case note draft");
  }

  const record = parsed as Record<string, unknown>;
  const isLegacy =
    options.allowLegacy === true &&
    typeof record.englishCaseNoteDraft !== "string" &&
    typeof record.caseNoteDraft === "string";
  const material: NdisCaseNoteMaterial = {
    englishCaseNoteDraft: getRequiredOutputString(
      isLegacy ? record.caseNoteDraft : record.englishCaseNoteDraft,
      5000,
    ),
    chineseReviewVersion: isLegacy
      ? "旧版已保存草稿未生成中文复核版本。请对照原始事实复核英文草稿。"
      : getRequiredOutputString(record.chineseReviewVersion, 5000),
    missingFacts: getOutputStringArray(record.missingFacts, 8, 260),
    neutralWordingChecks: getOutputStringArray(
      record.neutralWordingChecks,
      8,
      260,
    ),
    followUpPrompts: getOutputStringArray(record.followUpPrompts, 8, 260),
    disclaimer: getRequiredOutputString(record.disclaimer, 600),
  };

  assertNoProhibitedOutput(material);
  if (!isLegacy) {
    assertBilingualNumericFactConsistency(material);
  }

  return {
    ...material,
    disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
  };
}

export function getNdisCaseNoteMaterialCopyText(
  material: NdisCaseNoteMaterial,
) {
  const sections = [
    formatTextSection("English case note draft", material.englishCaseNoteDraft),
    formatTextSection(
      NDIS_CASE_NOTE_CHINESE_REVIEW_LABEL,
      material.chineseReviewVersion,
    ),
    formatListSection("Missing facts to review", material.missingFacts),
    formatListSection(
      "Neutral wording checks",
      material.neutralWordingChecks,
    ),
    formatListSection("Follow-up prompts", material.followUpPrompts),
    material.disclaimer,
  ];

  return sections.filter(Boolean).join("\n\n");
}

function getObviousIdentifierIssue(
  field: keyof NdisCaseNoteCompanionInput,
  value: string,
): NdisCaseNoteInputIssue | undefined {
  if (EMAIL_PATTERN.test(value)) {
    return {
      field,
      code: "email",
      message: "Remove the email address and use a generic role or contact method.",
    };
  }

  if (AU_MOBILE_PATTERN.test(value) || AU_LANDLINE_PATTERN.test(value)) {
    return {
      field,
      code: "phone",
      message: "Remove the phone number before generating a draft.",
    };
  }

  if (NDIS_NUMBER_PATTERN.test(value)) {
    return {
      field,
      code: "ndis_number",
      message: "Remove the NDIS number and use “participant” instead.",
    };
  }

  if (DATE_OF_BIRTH_PATTERN.test(value)) {
    return {
      field,
      code: "date_of_birth",
      message: "Remove the date of birth before generating a draft.",
    };
  }

  if (
    ENGLISH_NAME_PATTERN.test(value) ||
    CHINESE_NAME_PATTERN.test(value) ||
    MIXED_LANGUAGE_NAME_PATTERN.test(value)
  ) {
    return {
      field,
      code: "name",
      message: "Remove names or title clues and use ‘participant’ instead.",
    };
  }

  if (ENGLISH_ADDRESS_PATTERN.test(value) || CHINESE_ADDRESS_PATTERN.test(value)) {
    return {
      field,
      code: "address",
      message: "Remove the exact address and use a general setting type.",
    };
  }

  const wordingIssue = getUnsafeWordingIssue(field, value);
  if (wordingIssue) {
    return wordingIssue;
  }

  return undefined;
}

function assertNoProhibitedOutput(material: NdisCaseNoteMaterial) {
  const output = [
    material.englishCaseNoteDraft,
    material.chineseReviewVersion,
    ...material.missingFacts,
    ...material.neutralWordingChecks,
    ...material.followUpPrompts,
    material.disclaimer,
  ].join("\n");

  if (PROHIBITED_OUTPUT_PATTERNS.some((pattern) => pattern.test(output))) {
    throw new Error("NDIS case note draft crossed a wording boundary");
  }

  if (
    EMAIL_PATTERN.test(output) ||
    AU_MOBILE_PATTERN.test(output) ||
    AU_LANDLINE_PATTERN.test(output) ||
    NDIS_NUMBER_PATTERN.test(output) ||
    DATE_OF_BIRTH_PATTERN.test(output)
    || ENGLISH_NAME_PATTERN.test(output)
    || CHINESE_NAME_PATTERN.test(output)
    || MIXED_LANGUAGE_NAME_PATTERN.test(output)
    || ENGLISH_ADDRESS_PATTERN.test(output)
    || CHINESE_ADDRESS_PATTERN.test(output)
  ) {
    throw new Error("NDIS case note draft contained an obvious identifier");
  }
}

function getUnsafeWordingIssue(
  field: keyof NdisCaseNoteCompanionInput,
  value: string,
): NdisCaseNoteInputIssue | undefined {
  const checks: Array<{
    pattern: RegExp;
    code: NdisCaseNoteInputIssue["code"];
    message: string;
  }> = [
    {
      pattern: SUBJECTIVE_LANGUAGE_PATTERN,
      code: "subjective_language",
      message: "Replace subjective wording with observable facts.",
    },
    {
      pattern: CLINICAL_LANGUAGE_PATTERN,
      code: "clinical_language",
      message: "Remove clinical or diagnostic conclusions and record observations only.",
    },
    {
      pattern: RISK_STATEMENT_PATTERN,
      code: "risk_statement",
      message: "Remove risk conclusions and describe the observed event only.",
    },
    {
      pattern: GOAL_ACHIEVEMENT_PATTERN,
      code: "goal_achievement",
      message: "Replace goal achievement conclusions with observed actions or responses.",
    },
    {
      pattern: QUALITY_ASSESSMENT_PATTERN,
      code: "quality_assessment",
      message: "Replace worker or provider quality judgements with factual actions.",
    },
    {
      pattern: INDIRECT_IDENTIFIER_PATTERN,
      code: "indirect_identifier",
      message: "Generalise the indirect identity clue before continuing.",
    },
  ];

  const match = checks.find((check) => check.pattern.test(value));
  return match
    ? { field, code: match.code, message: match.message }
    : undefined;
}

function assertBilingualNumericFactConsistency(material: NdisCaseNoteMaterial) {
  const englishFacts = getNumericFactTokens(material.englishCaseNoteDraft);
  const chineseFacts = getNumericFactTokens(material.chineseReviewVersion);

  if (englishFacts.join("|") !== chineseFacts.join("|")) {
    throw new Error("NDIS case note bilingual drafts did not preserve core numeric facts");
  }
}

function getNumericFactTokens(value: string) {
  return (value.match(/\d+(?:[.:/-]\d+)*/g) ?? []).sort();
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(value: unknown) {
  const normalized = getString(value);
  return normalized || undefined;
}

function getRequiredOutputString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error("Unable to parse NDIS case note draft");
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength) {
    throw new Error("Unable to parse NDIS case note draft");
  }

  return normalized;
}

function getOutputStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error("Unable to parse NDIS case note draft");
  }

  return value.map((item) => getRequiredOutputString(item, maxItemLength));
}

function formatListSection(label: string, items: string[]) {
  return items.length > 0
    ? `${label}\n${items.map((item) => `- ${item}`).join("\n")}`
    : "";
}

function formatTextSection(label: string, value: string) {
  return `${label}\n${value}`;
}
