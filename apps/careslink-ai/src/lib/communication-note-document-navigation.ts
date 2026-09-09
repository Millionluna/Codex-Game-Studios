export type CommunicationNoteLocation = Pick<Location, "replace">;

export function replaceCommunicationNoteLocation(
  href: string,
  location: CommunicationNoteLocation = window.location,
) {
  location.replace(href);
}

/** Keep the previous page in history for an explicitly confirmed departure. */
export function assignCommunicationNoteLocation(
  href: string,
  location: Pick<Location, "assign"> = window.location,
) {
  location.assign(href);
}
