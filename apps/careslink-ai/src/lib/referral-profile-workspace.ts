import { getUnsafeClaimReason } from "./referral-profile-safe-copy";

export type EntityType = "individual" | "organisation";

export type ReferralDirection = "receive" | "send" | "both";

export type AccessCodeType =
  | "Provider Pilot"
  | "Referral Source Pilot"
  | "Dual Role Pilot"
  | "Internal Test"
  | "Partner Batch";

export type HealthStatus = "good" | "warning" | "high";

export type HealthBand =
  | "Communication profile not ready"
  | "Communication profile needs work"
  | "Communication profile nearly ready"
  | "Strong communication profile";

type AccessStatus = "free" | "approved" | "waitlist";

type SignalScoreState = "complete" | "partial" | "missing" | "not_applicable";

type IssuePriority = "high" | "warning";

type QueueStatus = "ready" | "locked";

type HealthSignalId =
  | "entity_type"
  | "referral_direction"
  | "service_area"
  | "languages"
  | "intake_method"
  | "response_time"
  | "capacity_status"
  | "best_fit"
  | "handover_requirements"
  | "profile_readability";

type MaterialDirection = Exclude<ReferralDirection, "both">;

interface HealthSignalAssessment {
  signal: HealthSignal;
  scoreState: SignalScoreState;
}

export interface ReferralProfile {
  id: string;
  ownerUserId: string;
  name: string;
  entityType: EntityType;
  referralDirection: ReferralDirection;
  submittedBy: "self";
  summary: string;
  serviceAreas: string[];
  languages: string[];
  bestFit: string[];
  receive?: {
    intakeMethod?: string;
    responseTime?: string;
    capacityStatus?: string;
  };
  send?: {
    handoverRequirements?: string[];
    followUpCadence?: string;
    consentReminder?: string;
  };
  updatedAt: string;
}

export interface HealthSignal {
  id: HealthSignalId;
  label: string;
  status: HealthStatus;
  points: number;
  detail: string;
}

export interface HealthIssue {
  id: string;
  label: string;
  signalId: HealthSignalId;
  priority: IssuePriority;
  recommendation: string;
  title: string;
  guidance: string;
}

export interface HealthAudit {
  profileId: string;
  score: number;
  band: HealthBand;
  summary: string;
  signals: HealthSignal[];
  issues: HealthIssue[];
  tabs: string[];
  recommendations: string[];
  note: string;
}

export interface BasicProfileSummary {
  profileId: string;
  title: string;
  entityLabel: string;
  directionLabel: string;
  serviceAreaLabel: string;
  languageLabel: string;
  description: string;
  footer: string;
}

export interface AccessState {
  userId: string;
  hasAccessCode: boolean;
  status: AccessStatus;
  codeType?: AccessCodeType;
  dailyQuota: number;
  usedToday: number;
}

export interface LockedMaterial {
  id: string;
  label: string;
  description: string;
  direction: MaterialDirection;
  locked: boolean;
  preview: string;
  lockReason?: string;
}

export interface AgentQueueItem {
  id: string;
  label: string;
  freeState: string;
  accessCodeState: string;
  status: QueueStatus;
}

export interface AccessRequest {
  id: string;
  userId: string;
  profileId: string;
  requestedCodeType: AccessCodeType;
  referralDirection: ReferralDirection;
  status: "queued" | "approved" | "declined";
  requestedAt: string;
  note: string;
}

const seedReferralProfiles: ReferralProfile[] = [
  {
    id: "profile-harbour",
    ownerUserId: "user-approved",
    name: "Harbour Community Support",
    entityType: "organisation",
    referralDirection: "both",
    submittedBy: "self",
    summary:
      "Neighbourhood aged care navigation and social support for older adults.",
    serviceAreas: ["Inner West Sydney", "Canterbury-Bankstown"],
    languages: ["English", "Mandarin", "Cantonese"],
    bestFit: ["Older adults who need community navigation"],
    receive: {
      intakeMethod: "Phone warm handover and secure web form",
      responseTime: "Usually within the week",
      capacityStatus: "Limited weekday intake places available",
    },
    send: {
      handoverRequirements: [
        "Client goals and preferred contact time",
        "Consent confirmation before introduction",
      ],
      followUpCadence: "Check referral outcome after seven days",
      consentReminder: "Confirm consent before sharing contact details",
    },
    updatedAt: "2026-06-24",
  },
  {
    id: "profile-alex-lee",
    ownerUserId: "user-free",
    name: "Alex Lee",
    entityType: "individual",
    referralDirection: "receive",
    submittedBy: "self",
    summary: "Independent care navigator accepting a small number of enquiries.",
    serviceAreas: ["Northern Sydney"],
    languages: ["English"],
    bestFit: [],
    receive: {
      intakeMethod: "Email",
    },
    updatedAt: "2026-06-24",
  },
  {
    id: "profile-carepath",
    ownerUserId: "user-waitlist",
    name: "CarePath Advisory",
    entityType: "organisation",
    referralDirection: "send",
    submittedBy: "self",
    summary:
      "CarePath Advisory prepares family referrals with plain-language context, consent prompts, and follow-up notes for community providers.",
    serviceAreas: ["Western Sydney", "South Western Sydney"],
    languages: ["English", "Arabic"],
    bestFit: [
      "Families comparing aged care support pathways",
      "Clients who need a structured provider introduction",
    ],
    send: {
      handoverRequirements: [
        "Support need summary",
        "Language preference and consent status",
      ],
      followUpCadence: "Follow up two business days after provider handover",
      consentReminder: "Record consent before provider details are shared",
    },
    updatedAt: "2026-06-24",
  },
];

const accessStates: Record<string, AccessState> = {
  "user-free": {
    userId: "user-free",
    hasAccessCode: false,
    status: "free",
    dailyQuota: 0,
    usedToday: 0,
  },
  "user-approved": {
    userId: "user-approved",
    hasAccessCode: true,
    status: "approved",
    codeType: "Dual Role Pilot",
    dailyQuota: 5,
    usedToday: 1,
  },
  "user-waitlist": {
    userId: "user-waitlist",
    hasAccessCode: false,
    status: "waitlist",
    dailyQuota: 0,
    usedToday: 0,
  },
};

const receiveMaterials = [
  {
    id: "provider_profile",
    label: "Provider profile",
    description: "A structured receive-side profile for referrers to review.",
    preview: "Service areas, languages, intake method, and availability.",
  },
  {
    id: "bilingual_intro",
    label: "Bilingual introduction",
    description: "Plain-language introduction copy for multilingual sharing.",
    preview: "Short English and community-language profile introduction.",
  },
  {
    id: "share_card",
    label: "Share card",
    description: "A compact profile card for clear referral conversations.",
    preview: "Name, fit, areas, contact path, and access disclaimer.",
  },
  {
    id: "referral_partner_message",
    label: "Referral partner message",
    description: "A guided message for introducing the profile to referrers.",
    preview: "Referral context, best-fit summary, and next-step prompt.",
  },
  {
    id: "intake_checklist",
    label: "Intake checklist",
    description: "A receive-side checklist for consistent referral intake.",
    preview: "Consent, need, urgency, language, and follow-up details.",
  },
] as const;

const sendMaterials = [
  {
    id: "referral_source_profile",
    label: "Referral source profile",
    description: "A structured send-side profile for provider introductions.",
    preview: "Referral role, client context, and communication preferences.",
  },
  {
    id: "provider_requirement_brief",
    label: "Provider requirement brief",
    description: "A concise brief of what providers need before handover.",
    preview: "Client goal, service need, timing, and language requirements.",
  },
  {
    id: "handover_template",
    label: "Handover template",
    description: "A guided template for sending complete referral context.",
    preview: "Consent status, support need, risks, and preferred next step.",
  },
  {
    id: "consent_reminder",
    label: "Consent reminder",
    description: "A reminder block for checking consent before sharing details.",
    preview: "Confirm consent scope before contacting a provider.",
  },
  {
    id: "follow_up_message",
    label: "Follow-up message",
    description: "A short follow-up prompt after a provider handover.",
    preview: "Check whether the provider accepted, declined, or needs details.",
  },
] as const;

const accessRequests: AccessRequest[] = [
  {
    id: "request-user-free",
    userId: "user-free",
    profileId: "profile-alex-lee",
    requestedCodeType: "Provider Pilot",
    referralDirection: "receive",
    status: "queued",
    requestedAt: "2026-06-24T09:00:00+10:00",
    note: "Wants guided profile actions before sharing more referral copy.",
  },
  {
    id: "request-user-approved",
    userId: "user-approved",
    profileId: "profile-harbour",
    requestedCodeType: "Dual Role Pilot",
    referralDirection: "both",
    status: "approved",
    requestedAt: "2026-06-23T14:30:00+10:00",
    note: "Access active for receive and send workflow testing.",
  },
  {
    id: "request-user-waitlist",
    userId: "user-waitlist",
    profileId: "profile-carepath",
    requestedCodeType: "Referral Source Pilot",
    referralDirection: "send",
    status: "queued",
    requestedAt: "2026-06-24T10:15:00+10:00",
    note: "Waiting for send-profile pilot capacity.",
  },
];

const directionLabels: Record<ReferralDirection, string> = {
  receive: "Receives referrals",
  send: "Sends referrals",
  both: "Receives and sends referrals",
};

const priorityRank: Record<IssuePriority, number> = {
  high: 0,
  warning: 1,
};

const SUMMARY_NEEDS_REVIEW_DESCRIPTION =
  "The self-submitted profile summary needs review before it can be displayed.";

export function getSeedReferralProfiles() {
  return seedReferralProfiles.map(cloneProfile);
}

export function getReferralProfile(profileId = "profile-harbour") {
  const profile = seedReferralProfiles.find((item) => item.id === profileId);

  if (!profile) {
    throw new Error(`Referral profile not found: ${profileId}`);
  }

  return cloneProfile(profile);
}

export function getAccessState(userId: string): AccessState {
  const accessState =
    accessStates[userId] ??
    ({
      userId,
      hasAccessCode: false,
      status: "free",
      dailyQuota: 0,
      usedToday: 0,
    } satisfies AccessState);

  return { ...accessState };
}

export function summarizeProfile(
  profile: ReferralProfile,
): BasicProfileSummary {
  return {
    profileId: profile.id,
    title: profile.name,
    entityLabel: profile.entityType === "organisation" ? "Organisation" : "Individual",
    directionLabel: directionLabels[profile.referralDirection],
    serviceAreaLabel: formatList(profile.serviceAreas),
    languageLabel: formatList(profile.languages),
    description: getSafeProfileSummaryDescription(profile.summary),
    footer:
      "Built from self-submitted information. Not a provider endorsement.",
  };
}

function getSafeProfileSummaryDescription(summary: string) {
  return getUnsafeClaimReason(summary)
    ? SUMMARY_NEEDS_REVIEW_DESCRIPTION
    : summary;
}

export function getHealthAudit(profile: ReferralProfile): HealthAudit {
  const signalAssessments = buildHealthSignals(profile);
  const signals = signalAssessments.map((assessment) => assessment.signal);
  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.points, 0),
  );
  const issues = buildHealthIssues(signalAssessments);
  const recommendations =
    issues.length > 0
      ? issues.map((issue) => issue.recommendation)
      : ["Keep referral profile details current before sharing."];

  return {
    profileId: profile.id,
    score,
    band: getScoreBand(score),
    summary:
      "This audit measures referral communication readiness only, not provider quality.",
    signals,
    issues,
    tabs: getDirectionTabs(profile.referralDirection),
    recommendations,
    note:
      "This audit measures referral communication readiness only, not provider quality.",
  };
}

export function getLockedMaterials(
  direction: ReferralDirection,
  accessState: AccessState,
): LockedMaterial[] {
  const canUse = canUseGuidedMaterials(accessState);
  const materialGroups =
    direction === "both"
      ? [
          ...buildMaterials("receive", canUse, receiveMaterials),
          ...buildMaterials("send", canUse, sendMaterials),
        ]
      : buildMaterials(
          direction,
          canUse,
          direction === "receive" ? receiveMaterials : sendMaterials,
        );

  return materialGroups;
}

export function canUseGuidedMaterials(accessState: AccessState) {
  return (
    accessState.hasAccessCode &&
    accessState.status === "approved" &&
    accessState.dailyQuota > accessState.usedToday
  );
}

export function getAgentQueue(hasAccessCode: boolean): AgentQueueItem[] {
  const canUse = canUseGuidedMaterials({
    userId: "compat",
    hasAccessCode,
    status: hasAccessCode ? "approved" : "free",
    dailyQuota: hasAccessCode ? 1 : 0,
    usedToday: 0,
  });

  return buildAgentQueue(canUse);
}

export function getAgentQueueForAccess(
  accessState: AccessState,
): AgentQueueItem[] {
  return buildAgentQueue(canUseGuidedMaterials(accessState));
}

function buildAgentQueue(canUse: boolean): AgentQueueItem[] {
  const status = canUse ? "ready" : "locked";

  return [
    {
      id: "profile",
      label: "Profile Agent",
      freeState: "Preview basic profile structure and missing fields.",
      accessCodeState: "Guide profile wording from the submitted details.",
      status,
    },
    {
      id: "readiness",
      label: "Readiness Agent",
      freeState: "Show readiness signals and issue priorities.",
      accessCodeState: "Suggest focused edits for referral communication gaps.",
      status,
    },
    {
      id: "share-card",
      label: "Share Card Agent",
      freeState: "Preview locked share-card material.",
      accessCodeState: "Prepare a concise share card from submitted profile fields.",
      status,
    },
    {
      id: "referral-message",
      label: "Referral Message Agent",
      freeState: "Preview referral message requirements.",
      accessCodeState: "Draft a guided referral message for review.",
      status,
    },
    {
      id: "trust-copy",
      label: "Trust Copy Agent",
      freeState: "Preview trust-copy prompts and disclaimers.",
      accessCodeState: "Draft plain-language trust copy for review.",
      status,
    },
  ];
}

export function getAccessRequests() {
  return accessRequests.map((request) => ({ ...request }));
}

function cloneProfile(profile: ReferralProfile): ReferralProfile {
  return {
    ...profile,
    serviceAreas: [...profile.serviceAreas],
    languages: [...profile.languages],
    bestFit: [...profile.bestFit],
    receive: profile.receive ? { ...profile.receive } : undefined,
    send: profile.send
      ? {
          ...profile.send,
          handoverRequirements: [
            ...(profile.send.handoverRequirements ?? []),
          ],
        }
      : undefined,
  };
}

function buildHealthSignals(profile: ReferralProfile): HealthSignalAssessment[] {
  return [
    signal(
      "entity_type",
      "Entity type",
      isEntityType(profile.entityType) ? "complete" : "missing",
      "Shows whether the profile represents an individual or organisation.",
    ),
    signal(
      "referral_direction",
      "Referral direction",
      isReferralDirection(profile.referralDirection) ? "complete" : "missing",
      "Shows whether the profile receives, sends, or does both.",
    ),
    signal(
      "service_area",
      "Service area",
      listState(profile.serviceAreas, 2),
      "Explains where referrals are relevant.",
    ),
    signal(
      "languages",
      "Languages",
      listState(profile.languages, 1),
      "Sets language expectations before a referral is made.",
    ),
    signal(
      "intake_method",
      "Intake method",
      receiveState(profile, textState(profile.receive?.intakeMethod, 16)),
      "Clarifies how receive-side referrals should arrive.",
    ),
    signal(
      "response_time",
      "Response time",
      receiveState(profile, responseTimeState(profile.receive?.responseTime)),
      "Sets expectations for referral acknowledgement.",
    ),
    signal(
      "capacity_status",
      "Capacity status",
      receiveState(profile, textState(profile.receive?.capacityStatus, 8)),
      "Communicates current receive-side availability.",
    ),
    signal(
      "best_fit",
      "Best fit",
      listState(profile.bestFit, 2),
      "Explains which referrals are most appropriate.",
    ),
    signal(
      "handover_requirements",
      "Handover requirements",
      sendState(profile, listState(profile.send?.handoverRequirements ?? [], 2)),
      "Clarifies what information should travel with sent referrals.",
    ),
    signal(
      "profile_readability",
      "Profile readability",
      readabilityState(profile.summary),
      "Keeps the public profile clear without implying provider quality.",
    ),
  ];
}

function buildHealthIssues(
  assessments: HealthSignalAssessment[],
): HealthIssue[] {
  return assessments
    .filter(
      (assessment) =>
        assessment.scoreState === "missing" || assessment.scoreState === "partial",
    )
    .map(issueForSignal)
    .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]);
}

function issueForSignal(assessment: HealthSignalAssessment): HealthIssue {
  const { signal: signalItem, scoreState } = assessment;
  const isMissing = scoreState === "missing";

  if (signalItem.id === "capacity_status") {
    const recommendation = isMissing
      ? "Add a current availability note so referrers know whether to send new enquiries."
      : "Add current availability detail, such as timing, limits, or next review date.";

    return {
      id: isMissing ? "missing_capacity_status" : "partial_capacity_status",
      label: "Capacity status",
      signalId: signalItem.id,
      priority: isMissing ? "high" : "warning",
      recommendation,
      title: isMissing
        ? "Capacity status is missing"
        : "Capacity status needs detail",
      guidance: recommendation,
    };
  }

  if (signalItem.id === "intake_method") {
    return {
      id: isMissing ? "missing_intake_method" : "partial_intake_method",
      label: "Intake method",
      signalId: signalItem.id,
      priority: isMissing ? "high" : "warning",
      recommendation:
        "Describe the preferred referral entry point, such as a form, email, or warm handover.",
      title: isMissing ? "Intake method is missing" : "Intake method needs detail",
      guidance:
        "Describe the preferred referral entry point, such as a form, email, or warm handover.",
    };
  }

  if (signalItem.id === "handover_requirements") {
    return {
      id: isMissing
        ? "missing_handover_requirements"
        : "partial_handover_requirements",
      label: "Handover requirements",
      signalId: signalItem.id,
      priority: isMissing ? "high" : "warning",
      recommendation:
        "List the information needed before a referral can be introduced.",
      title: isMissing
        ? "Handover requirements are missing"
        : "Handover requirements need detail",
      guidance:
        "List the information needed before a referral can be introduced.",
    };
  }

  return {
    id: `${isMissing ? "missing" : "partial"}_${signalItem.id}`,
    label: signalItem.label,
    signalId: signalItem.id,
    priority: isMissing ? "high" : "warning",
    recommendation: signalItem.detail,
    title: isMissing
      ? `${signalItem.label} is missing`
      : `${signalItem.label} needs detail`,
    guidance: signalItem.detail,
  };
}

function signal(
  id: HealthSignalId,
  label: string,
  scoreState: SignalScoreState,
  detail: string,
): HealthSignalAssessment {
  return {
    signal: {
      id,
      label,
      status: healthStatusForScoreState(scoreState),
      points: pointsForStatus(scoreState),
      detail,
    },
    scoreState,
  };
}

function pointsForStatus(status: SignalScoreState) {
  if (status === "complete" || status === "not_applicable") {
    return 10;
  }

  if (status === "partial") {
    return 5;
  }

  return 0;
}

function healthStatusForScoreState(status: SignalScoreState): HealthStatus {
  if (status === "complete" || status === "not_applicable") {
    return "good";
  }

  if (status === "partial") {
    return "warning";
  }

  return "high";
}

export function getScoreBand(score: number): HealthBand {
  if (score <= 39) {
    return "Communication profile not ready";
  }

  if (score <= 69) {
    return "Communication profile needs work";
  }

  if (score <= 84) {
    return "Communication profile nearly ready";
  }

  return "Strong communication profile";
}

function getDirectionTabs(direction: ReferralDirection) {
  if (direction === "both") {
    return ["Receive Referrals", "Send Referrals"];
  }

  return direction === "receive" ? ["Receive Referrals"] : ["Send Referrals"];
}

function receiveState(profile: ReferralProfile, state: SignalScoreState) {
  return profile.referralDirection === "send" ? "not_applicable" : state;
}

function sendState(profile: ReferralProfile, state: SignalScoreState) {
  return profile.referralDirection === "receive" ? "not_applicable" : state;
}

function listState(
  items: readonly string[],
  completeCount: number,
): SignalScoreState {
  if (items.length >= completeCount) {
    return "complete";
  }

  if (items.length > 0) {
    return "partial";
  }

  return "missing";
}

function textState(
  value: string | undefined,
  completeLength: number,
): SignalScoreState {
  const text = value?.trim() ?? "";

  if (text.length >= completeLength) {
    return "complete";
  }

  if (text.length > 0) {
    return "partial";
  }

  return "missing";
}

function responseTimeState(value: string | undefined): SignalScoreState {
  const text = value?.trim() ?? "";

  if (!text) {
    return "missing";
  }

  if (/\b(\d+|same day|business day|hours?)\b/i.test(text)) {
    return "complete";
  }

  return "partial";
}

function readabilityState(summary: string): SignalScoreState {
  const text = summary.trim();

  if (text.length >= 120) {
    return "complete";
  }

  if (text.length >= 80) {
    return "partial";
  }

  return "missing";
}

function isEntityType(value: string): value is EntityType {
  return value === "individual" || value === "organisation";
}

function isReferralDirection(value: string): value is ReferralDirection {
  return value === "receive" || value === "send" || value === "both";
}

function buildMaterials(
  direction: MaterialDirection,
  canUse: boolean,
  materials: readonly {
    id: string;
    label: string;
    description: string;
    preview: string;
  }[],
): LockedMaterial[] {
  return materials.map((material) => ({
    id: material.id,
    label: material.label,
    description: material.description,
    direction,
    locked: !canUse,
    preview: material.preview,
    lockReason: canUse
      ? undefined
      : "Access code required for guided AI materials.",
  }));
}

function formatList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "Not yet provided";
}
