import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionState, UnseenEventIdError } from "./session.js";

describe("SessionState seen event IDs", () => {
  it("tracks IDs marked as seen", () => {
    const session = new SessionState();
    assert.equal(session.hasEventBeenSeen("evt-1"), false);
    session.markEventSeen("evt-1");
    assert.equal(session.hasEventBeenSeen("evt-1"), true);
    assert.equal(session.seenEventIdCount, 1);
  });

  it("does not grow beyond the configured cap and evicts oldest first", () => {
    const session = new SessionState({ maxSeenEventIds: 3 });
    session.markEventSeen("a");
    session.markEventSeen("b");
    session.markEventSeen("c");
    session.markEventSeen("d"); // should evict "a"

    assert.equal(session.hasEventBeenSeen("a"), false);
    assert.equal(session.hasEventBeenSeen("b"), true);
    assert.equal(session.hasEventBeenSeen("c"), true);
    assert.equal(session.hasEventBeenSeen("d"), true);
    assert.equal(session.seenEventIdCount, 3);
  });

  it("refreshes recency when an existing ID is re-marked", () => {
    const session = new SessionState({ maxSeenEventIds: 3 });
    session.markEventSeen("a");
    session.markEventSeen("b");
    session.markEventSeen("c");
    session.markEventSeen("a"); // refreshes "a"; "b" is now oldest
    session.markEventSeen("d"); // should evict "b", not "a"

    assert.equal(session.hasEventBeenSeen("a"), true);
    assert.equal(session.hasEventBeenSeen("b"), false);
    assert.equal(session.hasEventBeenSeen("c"), true);
    assert.equal(session.hasEventBeenSeen("d"), true);
  });

  it("UnseenEventIdError names the offending id in its message", () => {
    const err = new UnseenEventIdError("evt-xyz");
    assert.equal(err.name, "UnseenEventIdError");
    assert.match(err.message, /evt-xyz/);
    assert.match(err.message, /calendar_list_events/);
  });
});
