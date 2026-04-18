import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphClient } from "../graph/client.js";
import {
  calendarCreateEvent,
  calendarCreateEventInputSchema,
  calendarListEvents,
  calendarUpdateEvent,
  calendarUpdateEventInputSchema,
  calendarRespondEvent
} from "./calendar.js";
import { SessionState, UnseenEventIdError } from "../session.js";

describe("calendar capability timezone handling", () => {
  it("normalizes create-event payloads to UTC dateTimeTimeZone values", async () => {
    let seenBody: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { body?: Record<string, unknown> }) => {
        seenBody = options?.body;
        return { id: "evt-1", webLink: "https://example.test/event/1" };
      }
    } as unknown as GraphClient;

    await calendarCreateEvent(client, {
      subject: "Review",
      start: "2026-04-12T09:00:00-07:00",
      end: "2026-04-12T10:30:00-07:00"
    });

    assert.deepEqual(seenBody, {
      subject: "Review",
      start: { dateTime: "2026-04-12T16:00:00.000", timeZone: "UTC" },
      end: { dateTime: "2026-04-12T17:30:00.000", timeZone: "UTC" },
      attendees: []
    });
  });

  it("requests UTC event times and returns explicit UTC timestamps", async () => {
    let seenHeaders: Record<string, string> | undefined;
    const client = {
      request: async (_path: string, options?: { headers?: Record<string, string> }) => {
        seenHeaders = options?.headers;
        return {
          value: [{
            id: "evt-1",
            subject: "Planning",
            start: { dateTime: "2026-04-12T16:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-04-12T17:00:00.0000000", timeZone: "UTC" },
            location: { displayName: "Room 1" },
            webLink: "https://example.test/event/1"
          }]
        };
      }
    } as unknown as GraphClient;

    const result = await calendarListEvents(client, {
      start: "2026-04-12T09:00:00-07:00",
      end: "2026-04-12T10:00:00-07:00"
    });

    assert.deepEqual(seenHeaders, { Prefer: 'outlook.timezone="UTC"' });
    assert.equal(result.events[0].start, "2026-04-12T16:00:00.0000000Z");
    assert.equal(result.events[0].end, "2026-04-12T17:00:00.0000000Z");
  });
});

describe("calendar_create_event constraints", () => {
  it("strips attendees field — schema has no attendees property", () => {
    const result = calendarCreateEventInputSchema.safeParse({
      subject: "Sync",
      start: "2026-04-12T09:00:00-07:00",
      end: "2026-04-12T10:00:00-07:00",
      attendees: ["alice@example.com"]
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal("attendees" in result.data, false);
    }
  });
});

describe("calendar_list_events populates SessionState", () => {
  it("marks event IDs as seen", async () => {
    const client = {
      request: async () => ({
        value: [
          {
            id: "evt-1",
            subject: "A",
            start: { dateTime: "2026-04-12T16:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-04-12T17:00:00.0000000", timeZone: "UTC" },
            location: null,
            webLink: "https://example.test/event/1"
          },
          {
            id: "evt-2",
            subject: "B",
            start: { dateTime: "2026-04-12T18:00:00.0000000", timeZone: "UTC" },
            end: { dateTime: "2026-04-12T19:00:00.0000000", timeZone: "UTC" },
            location: null,
            webLink: "https://example.test/event/2"
          }
        ]
      })
    } as unknown as GraphClient;

    const session = new SessionState();
    await calendarListEvents(client, {
      start: "2026-04-12T00:00:00Z",
      end: "2026-04-13T00:00:00Z"
    }, session);

    assert.ok(session.hasEventBeenSeen("evt-1"));
    assert.ok(session.hasEventBeenSeen("evt-2"));
  });
});

describe("calendar_update_event", () => {
  it("throws UnseenEventIdError when eventId is not in session", async () => {
    const client = { request: async () => ({}) } as unknown as GraphClient;
    const session = new SessionState();

    await assert.rejects(
      () => calendarUpdateEvent(client, { eventId: "evt-unknown", action: "update", subject: "New" }, session),
      (err: Error) => err instanceof UnseenEventIdError
    );
  });

  it("PATCHes only set fields for update action", async () => {
    let seenBody: Record<string, unknown> | undefined;
    let seenMethod = "";
    const client = {
      request: async (_path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
        seenMethod = options?.method ?? "GET";
        seenBody = options?.body;
        return {};
      }
    } as unknown as GraphClient;

    const session = new SessionState();
    session.markEventSeen("evt-1");

    await calendarUpdateEvent(client, { eventId: "evt-1", action: "update", subject: "Updated" }, session);

    assert.equal(seenMethod, "PATCH");
    assert.ok(seenBody);
    assert.equal(seenBody.subject, "Updated");
    assert.equal(seenBody.start, undefined);
    assert.equal(seenBody.location, undefined);
  });

  it("rejects empty update", () => {
    const result = calendarUpdateEventInputSchema.safeParse({
      eventId: "evt-1",
      action: "update"
    });
    assert.equal(result.success, false);
  });

  it("rejects cancel with field changes", () => {
    const result = calendarUpdateEventInputSchema.safeParse({
      eventId: "evt-1",
      action: "cancel",
      subject: "oops"
    });
    assert.equal(result.success, false);
  });

  it("uses /cancel endpoint when event has attendees", async () => {
    let seenPath = "";
    let callCount = 0;
    const client = {
      request: async (path: string) => {
        callCount++;
        seenPath = path;
        if (callCount === 1) {
          return { attendees: [{ emailAddress: { address: "alice@example.com" } }] };
        }
        return {};
      }
    } as unknown as GraphClient;

    const session = new SessionState();
    session.markEventSeen("evt-1");

    const result = await calendarUpdateEvent(client, { eventId: "evt-1", action: "cancel" }, session);

    assert.ok(seenPath.includes("/cancel"));
    assert.equal(result.notifiedAttendees, true);
  });

  it("uses DELETE when event has no attendees", async () => {
    let seenMethod = "";
    let callCount = 0;
    const client = {
      request: async (_path: string, options?: { method?: string }) => {
        callCount++;
        if (callCount === 1) {
          return { attendees: [] };
        }
        seenMethod = options?.method ?? "GET";
        return {};
      }
    } as unknown as GraphClient;

    const session = new SessionState();
    session.markEventSeen("evt-1");

    const result = await calendarUpdateEvent(client, { eventId: "evt-1", action: "cancel" }, session);

    assert.equal(seenMethod, "DELETE");
    assert.equal(result.notifiedAttendees, false);
  });
});

describe("calendar_respond_event", () => {
  it("throws UnseenEventIdError when eventId is not in session", async () => {
    const client = { request: async () => ({}) } as unknown as GraphClient;
    const session = new SessionState();

    await assert.rejects(
      () => calendarRespondEvent(client, { eventId: "evt-unknown", response: "accept", sendResponse: true }, session),
      (err: Error) => err instanceof UnseenEventIdError
    );
  });

  it("routes to correct endpoint per response value", async () => {
    const session = new SessionState();
    session.markEventSeen("evt-1");

    for (const response of ["accept", "decline", "tentativelyAccept"] as const) {
      let seenPath = "";
      let seenBody: Record<string, unknown> | undefined;
      const client = {
        request: async (path: string, options?: { body?: Record<string, unknown> }) => {
          seenPath = path;
          seenBody = options?.body;
          return {};
        }
      } as unknown as GraphClient;

      await calendarRespondEvent(client, { eventId: "evt-1", response, comment: "Thanks", sendResponse: true }, session);

      assert.ok(seenPath.endsWith(`/${response}`), `Expected path to end with /${response}, got ${seenPath}`);
      assert.ok(seenBody);
      assert.equal(seenBody.Comment, "Thanks");
      assert.equal(seenBody.SendResponse, true);
    }
  });
});
