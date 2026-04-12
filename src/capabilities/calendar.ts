import { z } from "zod";
import type { GraphClient } from "../graph/client.js";

const UTC_TIMEZONE = "UTC";

// ---------- Shared Graph response shapes ----------

interface CalendarEvent {
  id: string;
  subject: string | null;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location: { displayName: string } | null;
  webLink: string;
  onlineMeeting?: { joinUrl?: string } | null;
}

// ---------- calendar_list_events ----------

export const calendarListEventsInputSchema = z.object({
  start: z.string().datetime({ offset: true }).describe("ISO 8601 start of the time window."),
  end: z.string().datetime({ offset: true }).describe("ISO 8601 end of the time window."),
  calendarId: z.string().optional().describe("Calendar ID. Defaults to the primary calendar.")
}).refine((v) => {
  const windowDays = (Date.parse(v.end) - Date.parse(v.start)) / 86_400_000;
  return windowDays > 0 && windowDays <= 31;
}, { message: "Time window must be between 0 and 31 days." });

export type CalendarListEventsInput = z.infer<typeof calendarListEventsInputSchema>;

export interface CalendarListEventsOutput {
  events: {
    id: string;
    subject: string | null;
    start: string;
    end: string;
    location: string | null;
    webLink: string;
  }[];
}

export async function calendarListEvents(client: GraphClient, input: CalendarListEventsInput): Promise<CalendarListEventsOutput> {
  const path = input.calendarId
    ? `/me/calendars/${encodeURIComponent(input.calendarId)}/calendarView`
    : "/me/calendarView";

  const response = await client.request<{ value: CalendarEvent[] }>(path, {
    headers: {
      Prefer: 'outlook.timezone="UTC"'
    },
    query: {
      startDateTime: input.start,
      endDateTime: input.end,
      $select: "id,subject,start,end,location,webLink,onlineMeeting",
      $top: 50,
      $orderby: "start/dateTime asc"
    }
  });

  return {
    events: response.value.map((e) => ({
      id: e.id,
      subject: e.subject,
      start: formatCalendarDateTime(e.start),
      end: formatCalendarDateTime(e.end),
      location: e.location?.displayName ?? null,
      webLink: e.webLink
    }))
  };
}

// ---------- calendar_create_event ----------

export const calendarCreateEventInputSchema = z.object({
  subject: z.string().min(1).describe("Event subject."),
  start: z.string().datetime({ offset: true }).describe("ISO 8601 event start time."),
  end: z.string().datetime({ offset: true }).describe("ISO 8601 event end time."),
  attendees: z.array(z.string().email()).max(25).optional().describe("Attendee email addresses (max 25)."),
  bodyText: z.string().optional().describe("Plain text body / agenda."),
  location: z.string().optional().describe("Location display name.")
}).refine((v) => Date.parse(v.end) > Date.parse(v.start), {
  message: "end must be after start."
});

export type CalendarCreateEventInput = z.infer<typeof calendarCreateEventInputSchema>;

export interface CalendarCreateEventOutput {
  id: string;
  webLink: string;
  onlineMeetingUrl?: string;
}

export async function calendarCreateEvent(client: GraphClient, input: CalendarCreateEventInput): Promise<CalendarCreateEventOutput> {
  const body: Record<string, unknown> = {
    subject: input.subject,
    start: toGraphUtcDateTime(input.start),
    end: toGraphUtcDateTime(input.end),
    ...(input.bodyText ? { body: { contentType: "text", content: input.bodyText } } : {}),
    ...(input.location ? { location: { displayName: input.location } } : {}),
    ...(input.attendees && input.attendees.length > 0
      ? { attendees: input.attendees.map((a) => ({ emailAddress: { address: a }, type: "required" })) }
      : {})
  };

  const event = await client.request<CalendarEvent>("/me/events", { method: "POST", body });

  return {
    id: event.id,
    webLink: event.webLink,
    onlineMeetingUrl: event.onlineMeeting?.joinUrl
  };
}

function toGraphUtcDateTime(value: string): { dateTime: string; timeZone: string } {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid ISO timestamp "${value}".`);
  }

  return {
    dateTime: date.toISOString().replace(/Z$/, ""),
    timeZone: UTC_TIMEZONE
  };
}

function formatCalendarDateTime(value: { dateTime: string; timeZone: string }): string {
  if (value.timeZone === UTC_TIMEZONE && !/[zZ]$|[+-]\d{2}:\d{2}$/.test(value.dateTime)) {
    return `${value.dateTime}Z`;
  }

  return value.dateTime;
}
