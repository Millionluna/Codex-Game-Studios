export type CommunicationNoteLocation = Pick<Location, "replace">;

export function replaceCommunicationNoteLocation(
  href: string,
  location: CommunicationNoteLocation = window.location,
) {
  location.replace(href);
}
