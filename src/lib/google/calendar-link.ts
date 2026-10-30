// Opens a draft in the customer's calendar; never invites an attendee or
// exposes Edna's private Calendar event URL.
export function customerCalendarLink(input: {
  serviceName: string; bookingReference: string; startsAt: string;
  durationMinutes: number; meetUrl: string | null;
}) {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE", text: input.serviceName,
    dates: `${stamp(start)}/${stamp(end)}`, ctz: "America/Mexico_City",
    details: [`Reserva: ${input.bookingReference}`, input.meetUrl].filter(Boolean).join("\n"),
    ...(input.meetUrl ? { location: input.meetUrl } : {}),
  }).toString();
  return url.toString();
}
