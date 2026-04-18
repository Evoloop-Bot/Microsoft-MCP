/**
 * Per-process session state for the MCP server.
 *
 * Holds transient information tied to the current stdio session rather than to
 * the Graph transport. The primary role today is enforcing that destructive
 * calendar tools (calendar_update_event, calendar_respond_event) can only act
 * on event IDs the model has actually seen via calendar_list_events in this
 * session — converting the "must list first" workflow contract from a tool
 * description into a runtime guarantee.
 */

const DEFAULT_MAX_SEEN_EVENT_IDS = 2000;

export class SessionState {
  private readonly seenEventIds = new Set<string>();
  private readonly maxSeenEventIds: number;

  constructor(options: { maxSeenEventIds?: number } = {}) {
    this.maxSeenEventIds = options.maxSeenEventIds ?? DEFAULT_MAX_SEEN_EVENT_IDS;
  }

  markEventSeen(eventId: string): void {
    if (this.seenEventIds.has(eventId)) {
      // Refresh recency so FIFO eviction keeps recently re-seen IDs.
      this.seenEventIds.delete(eventId);
    } else if (this.seenEventIds.size >= this.maxSeenEventIds) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest !== undefined) {
        this.seenEventIds.delete(oldest);
      }
    }
    this.seenEventIds.add(eventId);
  }

  hasEventBeenSeen(eventId: string): boolean {
    return this.seenEventIds.has(eventId);
  }

  get seenEventIdCount(): number {
    return this.seenEventIds.size;
  }
}

export class UnseenEventIdError extends Error {
  constructor(eventId: string) {
    super(
      `eventId "${eventId}" has not been returned by calendar_list_events in this session. ` +
        `Call calendar_list_events first to locate the event and confirm it with the user before acting on it.`
    );
    this.name = "UnseenEventIdError";
  }
}
