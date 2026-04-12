import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDefaultToolsForCapabilities, getRequiredScopes, loadConfig } from "./config.js";

describe("config scope and tool derivation", () => {
  it("derives least-privilege scopes from explicitly enabled tools", () => {
    const config = loadConfig({
      MICROSOFT_CLIENT_ID: "client-id",
      MICROSOFT_ENABLED_TOOLS: "mail_list_messages,people_search"
    });

    assert.deepEqual(config.enabledTools, ["mail_list_messages", "people_search"]);
    assert.deepEqual(config.enabledCapabilities, ["mail", "people"]);
    assert.deepEqual(config.graphScopes, ["User.Read", "Mail.Read", "People.Read"]);
  });

  it("expands capabilities to the default tool set when enabledTools is omitted", () => {
    assert.deepEqual(
      getDefaultToolsForCapabilities(["files"]),
      ["files_list_items", "files_read"]
    );
  });

  it("includes mutating scopes only for the enabled mutating tools", () => {
    assert.deepEqual(
      getRequiredScopes(["mail_list_messages", "calendar_create_event"]),
      ["User.Read", "Mail.Read", "Calendars.ReadWrite"]
    );
  });
});
