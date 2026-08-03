import {
  NDIS_CASE_NOTE_REQUIRED_FIELDS,
  type NdisCaseNoteCompanionInput,
} from "./ndis-case-note-companion";

export type NdisCaseNoteInputMode = "structured" | "paste";

export type NdisCaseNotePrivacyFindingCategory =
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
  | "indirect_identifier"
  | "context_combination";

export type NdisCaseNotePrivacySpan = {
  start: number;
  end: number;
  text: string;
};

export type NdisCaseNotePrivacyFinding = {
  id: string;
  field: keyof NdisCaseNoteCompanionInput | "pastedNotes";
  category: NdisCaseNotePrivacyFindingCategory;
  action: "remove" | "replace" | "generalise" | "review";
  severity: "blocking" | "review";
  matchedSpans: NdisCaseNotePrivacySpan[];
  suggestedReplacement?: string;
};

export type NdisCaseNoteBrowserPrivacyReview = {
  mode: NdisCaseNoteInputMode;
  findings: NdisCaseNotePrivacyFinding[];
  proposedInput: NdisCaseNoteCompanionInput;
  originalTextByField: Partial<
    Record<keyof NdisCaseNoteCompanionInput | "pastedNotes", string>
  >;
  sanitisedPreview?: string;
};

export type NdisCaseNotePrivacyConfirmations = {
  reviewedNoIdentifiers: boolean;
  processingAuthorityConfirmed: boolean;
};

export type NdisCaseNotePrivacyResolution =
  | "removed"
  | "replaced"
  | "generalised"
  | "reviewed";

export type NdisCaseNotePrivacyResolutionMap = Record<
  string,
  NdisCaseNotePrivacyResolution | undefined
>;

export type NdisCaseNoteGenerationRequest = {
  input: NdisCaseNoteCompanionInput;
  privacyReview: {
    reviewedNoIdentifiers: true;
    processingAuthorityConfirmed: true;
  };
};

type DetectionRule = {
  category: NdisCaseNotePrivacyFindingCategory;
  action: NdisCaseNotePrivacyFinding["action"];
  severity: NdisCaseNotePrivacyFinding["severity"];
  pattern: RegExp;
  replacement?: string;
};

type PendingReplacement = NdisCaseNotePrivacySpan & {
  replacement: string;
};

const EMPTY_INPUT: NdisCaseNoteCompanionInput = {
  supportDateTime: "",
  supportType: "",
  setting: "",
  supportDelivered: "",
  observableFacts: "",
  actionTaken: "",
  followUp: "",
};

const DETECTION_RULES: DetectionRule[] = [
  {
    category: "email",
    action: "remove",
    severity: "blocking",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "",
  },
  {
    category: "phone",
    action: "remove",
    severity: "blocking",
    pattern:
      /(?:\+?61[\s().-]?(?:\(0\)[\s().-]?)?4|04)(?:[\s().-]?\d){8}|(?:\+?61[\s.-]?\(?[2378]\)?|0[2378]|\(0[2378]\))(?:[\s().-]?\d){8}/g,
    replacement: "",
  },
  {
    category: "ndis_number",
    action: "remove",
    severity: "blocking",
    pattern:
      /(?:\bndis(?:\s+participant)?(?:\s*(?:number|no\.?|id))?\s*[:#-]?\s*\d{6,12}\b|(?:NDIS|ndis)(?:号码|编号|号)?\s*(?:是|[:：#-])?\s*\d{6,12})/gi,
    replacement: "",
  },
  {
    category: "date_of_birth",
    action: "remove",
    severity: "blocking",
    pattern:
      /(?:\b(?:dob|date\s+of\s+birth)|出生日期|生日)\s*[:：#-]?\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/gi,
    replacement: "",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:[Pp]articipant|[Cc]lient|[Pp]erson|[Nn]ame)(?:\s+name)?\s*[:：-]\s*(?:(?:[Mm]r|[Mm]rs|[Mm]s|[Mm]iss|[Dd]r)\.?\s+)?[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30})?\b/g,
    replacement: "participant",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30})?\b/g,
    replacement: "participant",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /(?:[赵钱孙李周吴郑王冯陈蒋沈韩杨朱秦许何吕张孔曹严华金魏陶姜谢邹苏潘范彭鲁马方袁柳唐薛雷罗戴宋熊纪董梁杜阮蓝季贾江郭林徐高夏蔡田胡陆程邓刘叶谭温廖曾关][\u3400-\u9fff]{1,2}\s+(?:[A-Z][A-Za-z'-]{1,30}\s+){1,2}[A-Z][A-Za-z'-]{1,30}|(?:[A-Z][A-Za-z'-]{1,30}\s+){1,2}[A-Z][A-Za-z'-]{1,30}\s+[赵钱孙李周吴郑王冯陈蒋沈韩杨朱秦许何吕张孔曹严华金魏陶姜谢邹苏潘范彭鲁马方袁柳唐薛雷罗戴宋熊纪董梁杜阮蓝季贾江郭林徐高夏蔡田胡陆程邓刘叶谭温廖曾关][\u3400-\u9fff]{1,2})/g,
    replacement: "参与者",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /(?:姓名|名字|参与者|服务对象)\s*[:：]\s*[\u3400-\u9fff]{2,4}/g,
    replacement: "参与者",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /(?:她|他|其)?(?:女儿|儿子|母亲|父亲|妈妈|爸爸|姐姐|妹妹|哥哥|弟弟|配偶|丈夫|妻子)\s*[\u3400-\u9fff]{2,3}/g,
    replacement: "家庭成员",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern: /(?:小[\u3400-\u9fff]{1,2}|[\u3400-\u9fff]{2,4})(?:护工|社工|护士|老师)/g,
    replacement: "工作人员",
  },
  {
    category: "name",
    action: "replace",
    severity: "blocking",
    pattern:
      /[赵钱孙李周吴郑王冯陈蒋沈韩杨朱秦许何吕张孔曹严华金魏陶姜谢邹苏潘范彭鲁马方袁柳唐薛雷罗戴宋熊纪董梁杜阮蓝季贾江郭林徐高夏蔡田胡陆程邓刘叶谭温廖曾关][\u3400-\u9fff]{0,2}(?:先生|女士|小姐|阿姨|叔叔)/g,
    replacement: "参与者",
  },
  {
    category: "address",
    action: "generalise",
    severity: "blocking",
    pattern:
      /\b\d{1,5}\s+[A-Za-z0-9' -]{2,40}\s(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln|Boulevard|Blvd|Place|Pl|Crescent|Cres)\b/gi,
    replacement: "community setting",
  },
  {
    category: "address",
    action: "generalise",
    severity: "blocking",
    pattern:
      /(?:住址|地址)\s*[:：]\s*[^\n，。；;]{3,80}|[\u3400-\u9fffA-Za-z0-9]{2,30}(?:路|街|道|巷)\s*\d{1,5}\s*号/g,
    replacement: "社区场景",
  },
  {
    category: "clinical_language",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:diagnos(?:e|ed|is|tic)|depress(?:ed|ion)|anxi(?:ous|ety)|psychotic|manic|medically unstable)\b|(?:说|表示)?(?:她|他|参与者)?(?:最近)?(?:很|比较|十分)?(?:焦虑症?|抑郁症?)|诊断|精神病|躁狂|病情恶化/gi,
    replacement: "",
  },
  {
    category: "risk_statement",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:(?:high|medium|moderate|low|immediate)\s+risk|at\s+risk|unsafe|dangerous)\b|(?:高|中|低)风险|有风险|不安全|危险/gi,
    replacement: "",
  },
  {
    category: "goal_achievement",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:goal(?:\s+was|\s+has\s+been)?\s+(?:achieved|met|completed)|achieved\s+(?:the\s+)?goal)\b|目标(?:已经|已)?(?:达成|完成|实现)/gi,
    replacement: "",
  },
  {
    category: "quality_assessment",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:worker|provider|support\s+worker)\s+(?:is|was|seemed|appeared)\s+(?:excellent|poor|professional|unprofessional|qualified|competent|incompetent|suitable|unsuitable)\b|(?:工作人员|服务商|支持人员)(?:非常|很)?(?:优秀|专业|不专业|合格|不合格|称职|不称职)/gi,
    replacement: "",
  },
  {
    category: "subjective_language",
    action: "replace",
    severity: "blocking",
    pattern:
      /\b(?:difficult|lazy|aggressive|manipulative|attention-seeking|uncooperative|good\s+mood|bad\s+mood)\b|(?:难搞|懒惰|攻击性|操纵性|寻求关注|不配合|心情很好|心情很差)/gi,
    replacement: "",
  },
  {
    category: "indirect_identifier",
    action: "generalise",
    severity: "review",
    pattern:
      /\b(?:school|employer|workplace|hospital|clinic|service\s+name|relative'?s?\s+name)\s*[:：-]\s*[^\n,.;]{2,80}|(?:学校|雇主|工作单位|医院|诊所|机构名称|亲属姓名)\s*[:：]\s*[^\n，。；;]{2,80}/gi,
    replacement: "一般场景",
  },
  {
    category: "indirect_identifier",
    action: "generalise",
    severity: "review",
    pattern:
      /\b(?:Chatswood Chase|(?:[A-Z][A-Za-z'-]+\s+){0,3}[A-Z][A-Za-z'-]+\s+(?:Shopping Centre|Shopping Center|Mall|Hospital|Clinic|School))\b/g,
    replacement: "社区场所",
  },
];

export function reviewStructuredNdisCaseNoteInput(
  input: NdisCaseNoteCompanionInput,
): NdisCaseNoteBrowserPrivacyReview {
  const findings: NdisCaseNotePrivacyFinding[] = [];
  const proposedInput = { ...input };
  const originalTextByField: NdisCaseNoteBrowserPrivacyReview["originalTextByField"] = {};

  for (const field of Object.keys(proposedInput) as Array<
    keyof NdisCaseNoteCompanionInput
  >) {
    const value = proposedInput[field];

    if (!value) {
      continue;
    }

    originalTextByField[field] = value;
    const reviewed = reviewText(value, field);
    proposedInput[field] = reviewed.text;
    findings.push(...reviewed.findings);
  }

  return {
    mode: "structured",
    findings: assignFindingIds(findings),
    proposedInput: normalizeInput(proposedInput),
    originalTextByField,
  };
}

export function reviewPastedChineseCaseNotes(
  pastedNotes: string,
): NdisCaseNoteBrowserPrivacyReview {
  const sourceText = pastedNotes.slice(0, 6000);
  const reviewed = reviewText(sourceText, "pastedNotes");
  const sanitisedPreview = normalizeWhitespace(reviewed.text);

  return {
    mode: "paste",
    findings: assignFindingIds(reviewed.findings),
    proposedInput: parsePastedNotesToStructuredFacts(sanitisedPreview),
    originalTextByField: { pastedNotes: sourceText },
    sanitisedPreview,
  };
}

export function getMissingNdisCaseNoteMinimumFacts(
  input: NdisCaseNoteCompanionInput,
) {
  return NDIS_CASE_NOTE_REQUIRED_FIELDS.filter(
    (field) => !normalizeWhitespace(input[field] ?? ""),
  );
}

export function areNdisCaseNotePrivacyFindingsResolved(
  review: NdisCaseNoteBrowserPrivacyReview,
  resolutions: NdisCaseNotePrivacyResolutionMap,
) {
  return review.findings.every((finding) => Boolean(resolutions[finding.id]));
}

export function buildNdisCaseNoteGenerationRequest(
  input: NdisCaseNoteCompanionInput,
  confirmations: NdisCaseNotePrivacyConfirmations,
  review: NdisCaseNoteBrowserPrivacyReview | undefined,
  resolutions: NdisCaseNotePrivacyResolutionMap,
): NdisCaseNoteGenerationRequest | undefined {
  if (
    !review ||
    !areNdisCaseNotePrivacyFindingsResolved(review, resolutions) ||
    getMissingNdisCaseNoteMinimumFacts(input).length > 0 ||
    !confirmations.reviewedNoIdentifiers ||
    !confirmations.processingAuthorityConfirmed
  ) {
    return undefined;
  }

  return {
    input: normalizeInput(input),
    privacyReview: {
      reviewedNoIdentifiers: true,
      processingAuthorityConfirmed: true,
    },
  };
}

export function getNdisCaseNotePrivacyFindingText(
  category: NdisCaseNotePrivacyFindingCategory,
  locale: "en" | "zh-Hans",
) {
  const copy = PRIVACY_FINDING_COPY[category];
  return locale === "zh-Hans" ? copy.zh : copy.en;
}

function reviewText(
  value: string,
  field: NdisCaseNotePrivacyFinding["field"],
) {
  const findings: NdisCaseNotePrivacyFinding[] = [];
  const replacements: PendingReplacement[] = [];

  for (const rule of DETECTION_RULES) {
    for (const match of getMatches(value, rule.pattern)) {
      const span = {
        start: match.index,
        end: match.index + match.text.length,
        text: match.text,
      };

      if (hasDuplicateFinding(findings, rule.category, span)) {
        continue;
      }

      findings.push({
        id: "",
        field,
        category: rule.category,
        action: rule.action,
        severity: rule.severity,
        matchedSpans: [span],
        suggestedReplacement: rule.replacement,
      });

      if (rule.replacement !== undefined) {
        replacements.push({ ...span, replacement: rule.replacement });
      }
    }
  }

  const contextFinding = getContextCombinationFinding(value, field, findings);
  if (contextFinding) {
    findings.push(contextFinding);
  }

  return {
    text: cleanupReviewedText(applyReplacements(value, replacements)),
    findings,
  };
}

function getMatches(value: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches: Array<{ index: number; text: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) !== null) {
    if (match[0]) {
      matches.push({ index: match.index, text: match[0] });
    }

    if (matcher.lastIndex === match.index) {
      matcher.lastIndex += 1;
    }
  }

  return matches;
}

function hasDuplicateFinding(
  findings: NdisCaseNotePrivacyFinding[],
  category: NdisCaseNotePrivacyFindingCategory,
  span: NdisCaseNotePrivacySpan,
) {
  return findings.some(
    (finding) =>
      finding.category === category &&
      finding.matchedSpans.some(
        (existing) => existing.start === span.start && existing.end === span.end,
      ),
  );
}

function getContextCombinationFinding(
  value: string,
  field: NdisCaseNotePrivacyFinding["field"],
  findings: NdisCaseNotePrivacyFinding[],
): NdisCaseNotePrivacyFinding | undefined {
  const temporal = firstMatch(
    value,
    /\d{1,2}月\d{1,2}日(?:上午|中午|下午|晚上|傍晚|早上)?|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  );
  const location = findings
    .filter((finding) => finding.category === "indirect_identifier")
    .flatMap((finding) => finding.matchedSpans)[0];
  const uniqueEvent = firstMatch(
    value,
    /(?:\d+|[一二三四五六七八九十两]+)\s*(?:次|分钟|小时)|\b\d+\s*(?:times?|minutes?|hours?)\b/i,
  );

  if (!temporal || !location || !uniqueEvent) {
    return undefined;
  }

  return {
    id: "",
    field,
    category: "context_combination",
    action: "review",
    severity: "review",
    matchedSpans: [temporal, location, uniqueEvent],
  };
}

function firstMatch(value: string, pattern: RegExp): NdisCaseNotePrivacySpan | undefined {
  const match = pattern.exec(value);
  return match?.[0]
    ? { start: match.index, end: match.index + match[0].length, text: match[0] }
    : undefined;
}

function assignFindingIds(findings: NdisCaseNotePrivacyFinding[]) {
  return findings.map((finding, index) => ({
    ...finding,
    id: `${finding.field}-${finding.category}-${index + 1}`,
  }));
}

function applyReplacements(value: string, replacements: PendingReplacement[]) {
  const selected: PendingReplacement[] = [];

  for (const replacement of [...replacements].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  )) {
    if (
      selected.some(
        (existing) =>
          replacement.start < existing.end && replacement.end > existing.start,
      )
    ) {
      continue;
    }
    selected.push(replacement);
  }

  return selected
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, replacement) =>
        `${text.slice(0, replacement.start)}${replacement.replacement}${text.slice(replacement.end)}`,
      value,
    );
}

function parsePastedNotesToStructuredFacts(
  text: string,
): NdisCaseNoteCompanionInput {
  const input = { ...EMPTY_INPUT };
  const unmatchedLines: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labelled = getLabelledFact(line);

    if (labelled) {
      input[labelled.field] = appendFact(input[labelled.field], labelled.value);
    } else {
      unmatchedLines.push(line);
    }
  }

  if (unmatchedLines.length > 0) {
    const narrative = unmatchedLines.join(" ");
    input.observableFacts = appendFact(input.observableFacts, narrative);
    input.supportDateTime ||= extractApproximateSupportDateTime(narrative);
    input.setting ||= extractGeneralSetting(narrative);
    input.supportDelivered ||= extractSupportDelivered(narrative);
    input.actionTaken ||= extractActionTaken(narrative);
  }

  return normalizeInput(input);
}

function extractApproximateSupportDateTime(value: string) {
  return (
    value.match(
      /\d{1,2}月\d{1,2}日(?:上午|中午|下午|晚上|傍晚|早上)?|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?:\s+(?:around\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i,
    )?.[0] ?? ""
  );
}

function extractGeneralSetting(value: string) {
  const settings = ["社区场所", "社区场景", "商场", "家中", "住所", "服务机构"];
  return settings.find((setting) => value.includes(setting)) ?? "";
}

function extractSupportDelivered(value: string) {
  return splitNarrative(value)
    .filter((part) => /(?:陪同?|协助|支持|提供)/.test(part))
    .join("；");
}

function extractActionTaken(value: string) {
  const actions = splitNarrative(value).filter((part) =>
    /(?:陪同?|协助|支持|确认|联系|记录|返回|回家)/.test(part),
  );
  return actions.slice(-2).join("；");
}

function splitNarrative(value: string) {
  return value
    .split(/[。！？!?]+/)
    .map((part) => part.trim().replace(/^[，,；;]+|[，,；;]+$/g, ""))
    .filter(Boolean);
}

function getLabelledFact(
  line: string,
): { field: keyof NdisCaseNoteCompanionInput; value: string } | undefined {
  const labels: Array<{
    field: keyof NdisCaseNoteCompanionInput;
    pattern: RegExp;
  }> = [
    {
      field: "supportDateTime",
      pattern: /^(?:支持日期(?:与时间)?|日期时间|日期|时间)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "supportType",
      pattern: /^(?:支持类型|服务类型|support type)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "setting",
      pattern: /^(?:场景|地点类型|环境|setting)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "supportDelivered",
      pattern:
        /^(?:支持内容|提供的支持|实际提供|support delivered)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "observableFacts",
      pattern:
        /^(?:可观察事实|参与者反应|观察事实|事实|observable facts?)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "actionTaken",
      pattern:
        /^(?:采取的行动|工作人员行动|处理行动|action taken)\s*[:：]\s*(.+)$/i,
    },
    {
      field: "followUp",
      pattern: /^(?:后续|跟进|升级|follow[- ]?up)\s*[:：]\s*(.+)$/i,
    },
  ];

  for (const label of labels) {
    const match = line.match(label.pattern);

    if (match?.[1]?.trim()) {
      return { field: label.field, value: match[1].trim() };
    }
  }

  return undefined;
}

function normalizeInput(
  input: NdisCaseNoteCompanionInput,
): NdisCaseNoteCompanionInput {
  return {
    supportDateTime: normalizeWhitespace(input.supportDateTime ?? ""),
    supportType: normalizeWhitespace(input.supportType),
    setting: normalizeWhitespace(input.setting),
    supportDelivered: normalizeWhitespace(input.supportDelivered),
    observableFacts: normalizeWhitespace(input.observableFacts),
    actionTaken: normalizeWhitespace(input.actionTaken),
    followUp: normalizeWhitespace(input.followUp ?? "") || undefined,
  };
}

function cleanupReviewedText(value: string) {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;，。；])/g, "$1")
    .replace(/([，,；;]){2,}/g, "$1")
    .replace(/(?:说|表示)(?:她|他|参与者)?最近\s*([，。；;])/g, "$1")
    .trim();
}

function normalizeWhitespace(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function appendFact(current: string | undefined, value: string) {
  return [current, value].filter(Boolean).join(" ").trim();
}

const PRIVACY_FINDING_COPY: Record<
  NdisCaseNotePrivacyFindingCategory,
  { en: string; zh: string }
> = {
  email: {
    en: "Email address detected. Remove it before continuing.",
    zh: "检测到邮箱地址。继续前请删除。",
  },
  phone: {
    en: "Australian phone number detected. Remove it before continuing.",
    zh: "检测到澳洲电话号码。继续前请删除。",
  },
  ndis_number: {
    en: "NDIS number detected. Remove it and use ‘participant’.",
    zh: "检测到 NDIS 号码。请删除并改用“参与者”等通用称呼。",
  },
  date_of_birth: {
    en: "Date of birth detected. Remove it before continuing.",
    zh: "检测到出生日期。继续前请删除。",
  },
  name: {
    en: "A name or title clue may identify a person. Use a generic role instead.",
    zh: "姓名或称谓可能识别个人。请改用“参与者”“家庭成员”或“工作人员”等通用称呼。",
  },
  address: {
    en: "A precise address clue was found. Generalise it to a setting type.",
    zh: "检测到具体地址线索。请概括为场景类型。",
  },
  subjective_language: {
    en: "Subjective wording needs observable facts instead.",
    zh: "主观表述需要改写为可观察事实。",
  },
  clinical_language: {
    en: "Clinical or diagnostic wording needs factual observations instead.",
    zh: "临床或诊断性表述需要改写为事实观察。",
  },
  risk_statement: {
    en: "A risk conclusion was found. Describe the observed event without rating risk.",
    zh: "检测到风险结论。请描述可观察事件，不要进行风险评级。",
  },
  goal_achievement: {
    en: "Goal achievement wording needs the observed action or response instead.",
    zh: "目标达成结论需要改写为观察到的行动或反应。",
  },
  quality_assessment: {
    en: "Worker or provider quality wording needs a factual action instead.",
    zh: "工作人员或服务商质量评价需要改写为具体行动。",
  },
  indirect_identifier: {
    en: "A specific place or indirect identity clue needs a more general description.",
    zh: "具体地点或间接身份线索需要改成更概括的描述。",
  },
  context_combination: {
    en: "The combination of time, place and a distinctive event may identify someone. Review the generalised version.",
    zh: "时间、地点与独特事件组合后可能识别个人。请复核概括后的版本。",
  },
};
