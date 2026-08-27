import "server-only";

import type { CaresLinkV1NoteProviderCandidate } from "./note-generation-output";
import {
  CaresLinkV1ContractError,
  type CaresLinkV1CleanedFactsFor,
} from "./shared-contracts";

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;
type ClockTime = Readonly<{
  hour: number;
  minute: number;
  second: number;
}>;
type Located<T> = Readonly<{ value: T; start: number; end: number }>;

const ENGLISH_MONTHS = Object.freeze({
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
} as const);
const ENGLISH_MONTH_PATTERN = Object.keys(ENGLISH_MONTHS).join("|");

/**
 * Deterministic minimum grounding for the Communication provider boundary.
 * It proves the local event date, hour/minute and every Arabic-number quantity
 * in non-date facts. Semantic parity for facts without numbers remains a
 * separate activation gate.
 */
export function assertCaresLinkV1CommunicationNoteCriticalFactParity(
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">,
  candidate: CaresLinkV1NoteProviderCandidate,
) {
  const occurredAt = parseOccurredAt(cleanedFacts.occurred_at);
  const expectedQuantities = collectNonDateFactNumbers(cleanedFacts);
  const zhHans = candidate.reviewVersions["zh-Hans"];
  const zhHant = candidate.reviewVersions["zh-Hant"];
  if (!zhHans || !zhHant) throw parityFailure();

  for (const output of [candidate.englishDraft, zhHans, zhHant]) {
    assertDraftParity(output, occurredAt.date, occurredAt.time, expectedQuantities);
  }

  const allowedListNumbers = new Set(Object.keys(expectedQuantities));
  for (const value of [
    ...candidate.missingFacts,
    ...candidate.neutralWordingChecks,
    ...candidate.followUpPrompts,
  ]) {
    if (numberTokens(value).some((token) => !allowedListNumbers.has(token))) {
      throw parityFailure();
    }
  }
}

function assertDraftParity(
  rawOutput: string,
  expectedDate: CalendarDate,
  expectedTime: ClockTime,
  expectedQuantities: Readonly<Record<string, number>>,
) {
  const output = rawOutput.normalize("NFKC");
  const dates = findDates(output);
  const eventDate = dates.find(({ value }) => sameDate(value, expectedDate));
  if (!eventDate) throw parityFailure();
  const withoutDate = mask(output, eventDate);
  const times = findTimes(withoutDate);
  const eventTime = times.find(({ value }) => sameTime(value, expectedTime));
  if (!eventTime) throw parityFailure();
  const withoutDateOrTime = mask(withoutDate, eventTime);
  if (!sameNumberMultiset(countNumbers(withoutDateOrTime), expectedQuantities)) {
    throw parityFailure();
  }
}

function parseOccurredAt(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/,
  );
  if (!match) throw parityFailure();
  return Object.freeze({
    date: Object.freeze({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    }),
    time: Object.freeze({
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6]),
    }),
  });
}

function findDates(value: string): Located<CalendarDate>[] {
  const found: Located<CalendarDate>[] = [];
  collectMatches(value, /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g, (match) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }), found);
  collectMatches(value, /(\d{4})年(\d{1,2})月(\d{1,2})日/gu, (match) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }), found);
  collectMatches(
    value,
    new RegExp(`\\b(\\d{1,2})\\s+(${ENGLISH_MONTH_PATTERN})\\s+(\\d{4})\\b`, "gi"),
    (match) => ({
      year: Number(match[3]),
      month: englishMonth(match[2]),
      day: Number(match[1]),
    }),
    found,
  );
  collectMatches(
    value,
    new RegExp(`\\b(${ENGLISH_MONTH_PATTERN})\\s+(\\d{1,2})(?:,)?\\s+(\\d{4})\\b`, "gi"),
    (match) => ({
      year: Number(match[3]),
      month: englishMonth(match[1]),
      day: Number(match[2]),
    }),
    found,
  );
  return found.sort((left, right) => left.start - right.start);
}

function findTimes(value: string): Located<ClockTime>[] {
  const found: Located<ClockTime>[] = [];
  collectMatches(
    value,
    /\b(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]m))?\b/gi,
    (match) => ({
      hour: normalizeMeridiemHour(Number(match[1]), match[4]),
      minute: Number(match[2]),
      second: match[3] === undefined ? -1 : Number(match[3]),
    }),
    found,
  );
  collectMatches(
    value,
    /(\d{1,2})[时時](\d{1,2})分(?:(\d{1,2})秒)?/gu,
    (match) => ({
      hour: Number(match[1]),
      minute: Number(match[2]),
      second: match[3] === undefined ? -1 : Number(match[3]),
    }),
    found,
  );
  return found.sort((left, right) => left.start - right.start);
}

function collectMatches<T>(
  value: string,
  expression: RegExp,
  project: (match: RegExpMatchArray) => T,
  target: Located<T>[],
) {
  for (const match of value.matchAll(expression)) {
    if (match.index === undefined) continue;
    target.push({
      value: project(match),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
}

function collectNonDateFactNumbers(
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">,
) {
  const counts: Record<string, number> = {};
  for (const [field, value] of Object.entries(cleanedFacts)) {
    if (field === "occurred_at") continue;
    const strings = Array.isArray(value) ? value : [value];
    for (const text of strings) {
      for (const token of numberTokens(text)) {
        counts[token] = (counts[token] ?? 0) + 1;
      }
    }
  }
  return Object.freeze(counts);
}

function countNumbers(value: string) {
  const counts: Record<string, number> = {};
  for (const token of numberTokens(value)) {
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}

function numberTokens(value: string) {
  return (value.normalize("NFKC").match(/[0-9]+/g) ?? []).map((token) =>
    token.replace(/^0+(?=[0-9])/, ""),
  );
}

function sameNumberMultiset(
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) =>
        key === expectedKeys[index] && actual[key] === expected[key],
    )
  );
}

function sameDate(actual: CalendarDate, expected: CalendarDate) {
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day
  );
}

function sameTime(actual: ClockTime, expected: ClockTime) {
  return (
    actual.hour === expected.hour &&
    actual.minute === expected.minute &&
    (actual.second === -1 || actual.second === expected.second)
  );
}

function normalizeMeridiemHour(hour: number, meridiem: string | undefined) {
  if (!meridiem) return hour;
  if (hour < 1 || hour > 12) return -1;
  const normalized = meridiem.toLocaleLowerCase("en");
  if (normalized === "am") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function englishMonth(value: string) {
  return ENGLISH_MONTHS[
    value.toLocaleLowerCase("en") as keyof typeof ENGLISH_MONTHS
  ];
}

function mask(value: string, located: Pick<Located<unknown>, "start" | "end">) {
  return `${value.slice(0, located.start)}${" ".repeat(located.end - located.start)}${value.slice(located.end)}`;
}

function parityFailure() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Communication Note critical fact parity failed",
  );
}
