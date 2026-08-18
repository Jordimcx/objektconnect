export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  organizerEmail?: string | null;
  attendeeEmails?: string[];
  status?: "CONFIRMED" | "CANCELLED";
};

export function createIcsEvent(event: CalendarEvent) {
  const attendees = (event.attendeeEmails ?? [])
    .filter(Boolean)
    .map((email) => `ATTENDEE;RSVP=TRUE:mailto:${escapeIcs(email)}`)
    .join("\r\n");
  const organizer = event.organizerEmail
    ? `ORGANIZER:mailto:${escapeIcs(event.organizerEmail)}\r\n`
    : "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ObjektConnect//Repair Orchestration//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.uid)}@objektconnect.local`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(event.startsAt)}`,
    `DTEND:${formatIcsDate(event.endsAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `STATUS:${event.status ?? "CONFIRMED"}`,
    organizer.trimEnd(),
    attendees,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ]
    .filter(Boolean)
    .join("\r\n");
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
