export const COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT = "POINTS" as const;
export const COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE =
  "note.communication.generate" as const;

type CommunicationNotePointsRate = Readonly<{
  unit: typeof COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT;
  serviceCode: typeof COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE;
  catalogVersion: string;
  generationCostPoints: number;
}>;

export type CommunicationNotePointsPreview =
  | (CommunicationNotePointsRate &
      Readonly<{
        status: "AVAILABLE";
        availablePoints: number;
        reservedPoints: number;
        canAfford: boolean;
      }>)
  | (CommunicationNotePointsRate &
      Readonly<{
        status: "NOT_READY";
      }>)
  | Readonly<{
      status: "UNAVAILABLE";
      unit: typeof COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT;
    }>;

export const UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW = Object.freeze({
  status: "UNAVAILABLE",
  unit: COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT,
}) satisfies CommunicationNotePointsPreview;
