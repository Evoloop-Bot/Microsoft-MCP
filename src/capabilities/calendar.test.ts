import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphClient } from "../graph/client.js";
import { calendarCreateEvent, calendarListEvents } from "./calendar.js";

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
      end: { dateTime: "2026-04-12T17:30:00.000", timeZone: "UTC" }
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
