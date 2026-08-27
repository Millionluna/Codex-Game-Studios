import "server-only";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION,
  assertCaresLinkV1CommunicationNoteNoInferredDecisionLanguage,
} from "./communication-note-provider-policy";
import { assertCaresLinkV1CommunicationNoteCriticalFactParity } from "./communication-note-fact-parity";
import {
  buildCaresLinkV1CanonicalNoteContent,
  CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
  validateCaresLinkV1NoteProviderCandidate,
  type CaresLinkV1NoteProviderCandidate,
} from "./note-generation-output";
import {
  CaresLinkV1ContractError,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1Locale,
} from "./shared-contracts";

export { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION };

export type CaresLinkV1CommunicationNoteGoldenFixture = Readonly<{
  id: string;
  sourceLocale: CaresLinkV1Locale;
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">;
  passingCandidate: CaresLinkV1NoteProviderCandidate;
  requiredMarkers: Readonly<{
    englishDraft: readonly string[];
    zhHans: readonly string[];
    zhHant: readonly string[];
  }>;
  numericTokenCounts: Readonly<Record<string, number>>;
  expectedDisclaimer: typeof CARESLINK_V1_NOTE_DRAFT_DISCLAIMER;
}>;

const FIXTURES: readonly CaresLinkV1CommunicationNoteGoldenFixture[] = [
  fixture({
    id: "communication.en.phone-duration.v1",
    sourceLocale: "en",
    cleanedFacts: {
      occurred_at: "2026-08-27T10:15:00+10:00",
      contact_channel: "Phone",
      parties_by_role: ["Support worker", "Family representative"],
      observable_facts: "The call lasted 10 minutes.",
      action_taken: "The information provided was recorded.",
      stated_outcome: "The caller stated that no follow-up was required.",
    },
    passingCandidate: {
      englishDraft:
        "At 10:15 on 2026-08-27, a support worker spoke with a family representative by phone for 10 minutes. The information provided was recorded. The caller stated that no follow-up was required.",
      reviewVersions: {
        "zh-Hans":
          "2026年8月27日10时15分，一名支持人员通过电话与家庭代表交谈了10分钟。对方提供的信息已被记录。来电者表示不需要后续跟进。",
        "zh-Hant":
          "2026年8月27日10時15分，一名支援人員透過電話與家庭代表交談了10分鐘。對方提供的資訊已被記錄。來電者表示不需要後續跟進。",
      },
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
    },
    requiredMarkers: {
      englishDraft: ["support worker", "family representative", "phone"],
      zhHans: ["支持人员", "家庭代表", "电话"],
      zhHant: ["支援人員", "家庭代表", "電話"],
    },
    numericTokenCounts: { "8": 1, "10": 2, "15": 1, "27": 1, "2026": 1 },
  }),
  fixture({
    id: "communication.zh-hans.mixed-video.v1",
    sourceLocale: "zh-Hans",
    cleanedFacts: {
      occurred_at: "2026-08-27T14:30:00+10:00",
      contact_channel: "Video call 视频通话",
      parties_by_role: ["Coordinator 协调员", "Service representative"],
      observable_facts: "双方核对了2项已提供的服务信息。",
      action_taken: "The coordinator recorded 2 requested corrections.",
      follow_up: "The service representative will provide an update in 3 days.",
    },
    passingCandidate: {
      englishDraft:
        "At 14:30 on 2026-08-27, a coordinator and a service representative used a video call to check 2 service information items. The coordinator recorded 2 requested corrections. The representative stated that an update would be provided in 3 days.",
      reviewVersions: {
        "zh-Hans":
          "2026年8月27日14时30分，协调员与服务代表通过视频通话核对了2项服务信息。协调员记录了2项更正请求。服务代表表示将在3天内提供更新。",
        "zh-Hant":
          "2026年8月27日14時30分，協調員與服務代表透過視訊通話核對了2項服務資訊。協調員記錄了2項更正請求。服務代表表示將在3天內提供更新。",
      },
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
    },
    requiredMarkers: {
      englishDraft: ["coordinator", "service representative", "video call"],
      zhHans: ["协调员", "服务代表", "视频通话"],
      zhHant: ["協調員", "服務代表", "視訊通話"],
    },
    numericTokenCounts: {
      "2": 2,
      "3": 1,
      "8": 1,
      "14": 1,
      "27": 1,
      "30": 1,
      "2026": 1,
    },
  }),
  fixture({
    id: "communication.zh-hant.in-person.v1",
    sourceLocale: "zh-Hant",
    cleanedFacts: {
      occurred_at: "2026-08-27T09:45:00+10:00",
      contact_channel: "In person 當面",
      parties_by_role: ["Care worker 照護人員", "Client representative"],
      observable_facts: "代表提出1個關於下次到訪時間的問題。",
      action_taken: "The question was recorded for the scheduling team.",
      stated_outcome: "No answer was provided during the conversation.",
      follow_up: "The scheduling team was asked to respond within 2 days.",
    },
    passingCandidate: {
      englishDraft:
        "At 09:45 on 2026-08-27, a care worker met a client representative in person. The representative asked 1 question about the next visit time. The question was recorded for the scheduling team. No answer was provided during the conversation. The scheduling team was asked to respond within 2 days.",
      reviewVersions: {
        "zh-Hans":
          "2026年8月27日09时45分，一名照护人员与客户代表当面交谈。代表提出1个关于下次到访时间的问题。该问题已记录并交给排班团队。谈话期间未提供答复。排班团队被要求在2天内回复。",
        "zh-Hant":
          "2026年8月27日09時45分，一名照護人員與客戶代表當面交談。代表提出1個關於下次到訪時間的問題。該問題已記錄並交給排班團隊。談話期間未提供答覆。排班團隊被要求在2天內回覆。",
      },
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
    },
    requiredMarkers: {
      englishDraft: ["care worker", "client representative", "in person"],
      zhHans: ["照护人员", "客户代表", "当面"],
      zhHant: ["照護人員", "客戶代表", "當面"],
    },
    numericTokenCounts: {
      "1": 1,
      "2": 1,
      "8": 1,
      "9": 1,
      "27": 1,
      "45": 1,
      "2026": 1,
    },
  }),
];

export const CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES =
  Object.freeze(FIXTURES);

export type CaresLinkV1CommunicationNoteGoldenEvaluation = Readonly<{
  fixtureId: string;
  passed: true;
  checks: Readonly<{
    schema: true;
    requiredFactMarkers: true;
    numericParity: true;
    safety: true;
  }>;
}>;

/**
 * Deterministic, content-free evidence for synthetic evaluation fixtures. A
 * failed check throws a stable contract error and never returns generated text.
 */
export function evaluateCaresLinkV1CommunicationNoteGoldenCandidate(
  fixtureValue: CaresLinkV1CommunicationNoteGoldenFixture,
  candidateValue: unknown,
): CaresLinkV1CommunicationNoteGoldenEvaluation {
  const fixtureDefinition = requireFixture(fixtureValue);
  const candidate = validateCaresLinkV1NoteProviderCandidate(candidateValue);
  buildCaresLinkV1CanonicalNoteContent(
    "communication",
    fixtureDefinition.cleanedFacts,
    candidate,
  );
  assertCaresLinkV1CommunicationNoteCriticalFactParity(
    fixtureDefinition.cleanedFacts,
    candidate,
  );

  const zhHans = candidate.reviewVersions["zh-Hans"];
  const zhHant = candidate.reviewVersions["zh-Hant"];
  if (!zhHans || !zhHant) throw failed();

  requireMarkers(
    candidate.englishDraft,
    fixtureDefinition.requiredMarkers.englishDraft,
  );
  requireMarkers(zhHans, fixtureDefinition.requiredMarkers.zhHans);
  requireMarkers(zhHant, fixtureDefinition.requiredMarkers.zhHant);
  requireNumericMultiset(
    candidate.englishDraft,
    fixtureDefinition.numericTokenCounts,
  );
  requireNumericMultiset(zhHans, fixtureDefinition.numericTokenCounts);
  requireNumericMultiset(zhHant, fixtureDefinition.numericTokenCounts);
  assertCaresLinkV1CommunicationNoteNoInferredDecisionLanguage(candidate);

  return Object.freeze({
    fixtureId: fixtureDefinition.id,
    passed: true,
    checks: Object.freeze({
      schema: true,
      requiredFactMarkers: true,
      numericParity: true,
      safety: true,
    }),
  });
}

function fixture(
  value: Omit<CaresLinkV1CommunicationNoteGoldenFixture, "expectedDisclaimer">,
): CaresLinkV1CommunicationNoteGoldenFixture {
  const cleanedFacts = {
    ...value.cleanedFacts,
    parties_by_role: [...value.cleanedFacts.parties_by_role],
  };
  Object.freeze(cleanedFacts.parties_by_role);
  Object.freeze(cleanedFacts);
  const passingCandidate: CaresLinkV1NoteProviderCandidate = {
    ...value.passingCandidate,
    reviewVersions: { ...value.passingCandidate.reviewVersions },
    missingFacts: [...value.passingCandidate.missingFacts],
    neutralWordingChecks: [...value.passingCandidate.neutralWordingChecks],
    followUpPrompts: [...value.passingCandidate.followUpPrompts],
  };
  Object.freeze(passingCandidate.reviewVersions);
  Object.freeze(passingCandidate.missingFacts);
  Object.freeze(passingCandidate.neutralWordingChecks);
  Object.freeze(passingCandidate.followUpPrompts);
  Object.freeze(passingCandidate);
  return Object.freeze({
    ...value,
    cleanedFacts,
    passingCandidate,
    requiredMarkers: Object.freeze({
      englishDraft: Object.freeze([...value.requiredMarkers.englishDraft]),
      zhHans: Object.freeze([...value.requiredMarkers.zhHans]),
      zhHant: Object.freeze([...value.requiredMarkers.zhHant]),
    }),
    numericTokenCounts: Object.freeze({ ...value.numericTokenCounts }),
    expectedDisclaimer: CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
  });
}

function requireFixture(
  value: CaresLinkV1CommunicationNoteGoldenFixture,
): CaresLinkV1CommunicationNoteGoldenFixture {
  const fixtureDefinition = FIXTURES.find(({ id }) => id === value.id);
  if (fixtureDefinition !== value) throw failed();
  return fixtureDefinition;
}

function requireMarkers(value: string, markers: readonly string[]) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en");
  if (
    markers.some(
      (marker) =>
        !normalized.includes(marker.normalize("NFKC").toLocaleLowerCase("en")),
    )
  ) {
    throw failed();
  }
}

function requireNumericMultiset(
  value: string,
  expected: Readonly<Record<string, number>>,
) {
  const actual: Record<string, number> = {};
  for (const rawToken of value.match(/[0-9]+/g) ?? []) {
    const token = rawToken.replace(/^0+(?=[0-9])/, "");
    actual[token] = (actual[token] ?? 0) + 1;
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    expectedKeys.some((key) => actual[key] !== expected[key])
  ) {
    throw failed();
  }
}

function failed() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Communication Note golden evaluation failed",
  );
}
