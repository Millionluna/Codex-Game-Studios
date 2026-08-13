import type {
  CaresLinkV1CleanedFactsByNoteType,
  CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

export const CARESLINK_V1_VALID_CLEANED_FACTS = {
  communication: {
    occurred_at: "2026-08-11T10:15:30+10:00",
    contact_channel: "Phone",
    parties_by_role: ["Support worker", "Family representative"],
    observable_facts: "The call lasted ten minutes.",
    action_taken: "The agreed information was recorded.",
    stated_outcome: "The caller stated that no follow-up was required.",
  },
  handover: {
    occurred_at: "2026-08-11T10:15:30+10:00",
    current_status: "The scheduled support period is complete.",
    observable_facts: "The participant attended the planned activity.",
    actions_completed: "The handover checklist was completed.",
    outstanding_items: "The next worker will confirm transport timing.",
  },
  progress: {
    occurred_at: "2026-08-11T10:15:30+10:00",
    support_type: "Community access",
    support_delivered: "Support was provided for the planned activity.",
    observable_facts: "The participant completed two planned steps.",
    action_taken: "The next step was recorded for review.",
    participant_response: "The participant asked to continue next week.",
  },
  ndis: {
    occurred_at: "2026-08-11T10:15:30+10:00",
    support_type: "Daily living",
    support_delivered: "Support was provided for the planned routine.",
    observable_facts: "The participant completed the routine as scheduled.",
    action_taken: "The completed steps were recorded.",
    provided_goal_context: "The participant provided the current goal context.",
  },
  incident_factual: {
    occurred_at: "2026-08-11T10:15:30+10:00",
    setting_category: "Community venue",
    observable_facts: "A drink container fell from the table.",
    immediate_action: "The area was cleared and dried.",
    notification_facts: "The shift lead was notified.",
  },
} satisfies CaresLinkV1CleanedFactsByNoteType;

export function createValidCaresLinkV1CleanedFacts<
  T extends CaresLinkV1NoteTypeCode,
>(noteType: T): CaresLinkV1CleanedFactsByNoteType[T] {
  return JSON.parse(
    JSON.stringify(CARESLINK_V1_VALID_CLEANED_FACTS[noteType]),
  ) as CaresLinkV1CleanedFactsByNoteType[T];
}
