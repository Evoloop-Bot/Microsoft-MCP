import { z } from "zod";
import type { GraphClient } from "../graph/client.js";
import { SessionState, UnseenEventIdError } from "../session.js";

const UTC_TIMEZONE = "UTC";

// ---------- Shared Graph response shapes ----------

interface CalendarEvent {
  id: string;
  subject: string | null;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location: { displayName: string } | null;
  webLink: string;
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

export async function calendarListEvents(client: GraphClient, input: CalendarListEventsInput, session?: SessionState): Promise<CalendarListEventsOutput> {
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
      $select: "id,subject,start,end,location,webLink",
      $top: 50,
      $orderby: "start/dateTime asc"
    }
  });

  for (const e of response.value) {
    session?.markEventSeen(e.id);
  }

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
  bodyText: z.string().optional().describe("Plain text body / agenda."),
  location: z.string().optional().describe("Location display name.")
}).refine((v) => Date.parse(v.end) > Date.parse(v.start), {
  message: "end must be after start."
});

export type CalendarCreateEventInput = z.infer<typeof calendarCreateEventInputSchema>;

export interface CalendarCreateEventOutput {
  id: string;
  webLink: string;
}

export async function calendarCreateEvent(client: GraphClient, input: CalendarCreateEventInput): Promise<CalendarCreateEventOutput> {
  const body: Record<string, unknown> = {
    subject: input.subject,
    start: toGraphUtcDateTime(input.start),
    end: toGraphUtcDateTime(input.end),
    attendees: [],
    ...(input.bodyText ? { body: { contentType: "text", content: input.bodyText } } : {}),
    ...(input.location ? { location: { displayName: input.location } } : {})
  };

  const event = await client.request<CalendarEvent>("/me/events", { method: "POST", body });

  return {
    id: event.id,
    webLink: event.webLink
  };
}

// ---------- calendar_update_event ----------

export const calendarUpdateEventInputSchema = z.object({
  eventId: z.string().min(1)
    .describe("ID of the event to update or cancel. MUST come from a prior calendar_list_events call in this conversation — never guess or reconstruct an ID."),
  action: z.enum(["update", "cancel"])
    .describe("update = modify fields on the event; cancel = remove the event and notify attendees if any."),
  subject: z.string().min(1).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  location: z.string().optional(),
  bodyText: z.string().optional(),
  cancelComment: z.string().optional()
})
  .refine(
    (v) => v.action !== "update" || (
      v.subject !== undefined ||
      v.start !== undefined ||
      v.end !== undefined ||
      v.location !== undefined ||
      v.bodyText !== undefined
    ),
    { message: "update action requires at least one field to change." }
  )
  .refine(
    (v) => v.action !== "cancel" || (
      v.subject === undefined &&
      v.start === undefined &&
      v.end === undefined &&
      v.location === undefined &&
      v.bodyText === undefined
    ),
    { message: "cancel action does not accept field changes — use update for that." }
  )
  .refine(
    (v) => v.start === undefined || v.end === undefined || new Date(v.end) > new Date(v.start),
    { message: "end must be after start." }
  );

export type CalendarUpdateEventInput = z.infer<typeof calendarUpdateEventInputSchema>;

export interface CalendarUpdateEventOutput {
  eventId: string;
  action: string;
  succeeded: boolean;
  notifiedAttendees: boolean;
}

export async function calendarUpdateEvent(client: GraphClient, input: CalendarUpdateEventInput, session: SessionState): Promise<CalendarUpdateEventOutput> {
  if (!session.hasEventBeenSeen(input.eventId)) {
    throw new UnseenEventIdError(input.eventId);
  }

  const eventPath = `/me/events/${encodeURIComponent(input.eventId)}`;

  if (input.action === "update") {
    const patch: Record<string, unknown> = {};
    if (input.subject !== undefined) patch.subject = input.subject;
    if (input.start !== undefined) patch.start = toGraphUtcDateTime(input.start);
    if (input.end !== undefined) patch.end = toGraphUtcDateTime(input.end);
    if (input.location !== undefined) patch.location = { displayName: input.location };
    if (input.bodyText !== undefined) patch.body = { contentType: "text", content: input.bodyText };

    await client.request<unknown>(eventPath, { method: "PATCH", body: patch });
    return { eventId: input.eventId, action: "update", succeeded: true, notifiedAttendees: false };
  }

  // cancel action
  const event = await client.request<{ attendees?: { emailAddress: { address: string } }[] }>(
    eventPath,
    { query: { $select: "attendees" } }
  );

  const hasAttendees = (event.attendees?.length ?? 0) > 0;

  if (hasAttendees) {
    await client.request<unknown>(`${eventPath}/cancel`, {
      method: "POST",
      body: { comment: input.cancelComment }
    });
  } else {
    await client.request<unknown>(eventPath, { method: "DELETE" });
  }

  return { eventId: input.eventId, action: "cancel", succeeded: true, notifiedAttendees: hasAttendees };
}

// ---------- calendar_respond_event ----------

export const calendarRespondEventInputSchema = z.object({
  eventId: z.string().min(1),
  response: z.enum(["accept", "decline", "tentativelyAccept"]),
  comment: z.string().optional(),
  sendResponse: z.boolean().default(true)
});

export type CalendarRespondEventInput = z.infer<typeof calendarRespondEventInputSchema>;

export interface CalendarRespondEventOutput {
  eventId: string;
  response: string;
  succeeded: boolean;
}

export async function calendarRespondEvent(client: GraphClient, input: CalendarRespondEventInput, session: SessionState): Promise<CalendarRespondEventOutput> {
  if (!session.hasEventBeenSeen(input.eventId)) {
    throw new UnseenEventIdError(input.eventId);
  }

  await client.request<unknown>(
    `/me/events/${encodeURIComponent(input.eventId)}/${input.response}`,
    {
      method: "POST",
      body: { comment: input.comment, sendResponse: input.sendResponse }
    }
  );

  return { eventId: input.eventId, response: input.response, succeeded: true };
}

// ---------- helpers ----------

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
