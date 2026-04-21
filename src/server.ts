#!/usr/bin/env node
/**
 * Microsoft 365 MCP Server — stdio entrypoint.
 *
 * Starts the MCP server on stdin/stdout. All log output goes to stderr so it
 * never pollutes the stdio transport. Never log access tokens, message bodies,
 * or file content; observability markers use the structured logger instead.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { createTokenProvider } from "./auth/device-code-provider.js";
import { GraphClient } from "./graph/client.js";
import { GraphClientError } from "./errors.js";
import { logToolCall, logToolError, logInfo, logWarn } from "./logger.js";

import {
  mailListMessages,
  mailListMessagesInputSchema,
  mailSearch,
  mailSearchInputSchema,
  mailGetMessage,
  mailGetMessageInputSchema,
  mailDraftReply,
  mailDraftReplyInputSchema,
  mailUpdate,
  mailUpdateInputSchema
} from "./capabilities/mail.js";
import {
  calendarListEvents,
  calendarListEventsInputSchema,
  calendarCreateEvent,
  calendarCreateEventInputSchema,
  calendarUpdateEvent,
  calendarUpdateEventInputSchema,
  calendarRespondEvent,
  calendarRespondEventInputSchema
} from "./capabilities/calendar.js";
import { SessionState } from "./session.js";
import {
  filesListItems,
  filesListItemsInputSchema,
  filesRead,
  filesReadInputSchema
} from "./capabilities/files.js";
import {
  peopleSearch,
  peopleSearchInputSchema
} from "./capabilities/people.js";

// ---------- helpers ----------

type ToolHandler<T> = (args: T) => Promise<unknown>;

function makeTool<T>(opts: {
  name: string;
  domain: string;
  mutating: boolean;
  handler: ToolHandler<T>;
}) {
  return async (args: T) => {
    const requestId = crypto.randomUUID();
    const startMs = Date.now();
    try {
      const result = await opts.handler(args);
      logToolCall({
        tool: opts.name,
        domain: opts.domain,
        requestId,
        latencyMs: Date.now() - startMs,
        mutating: opts.mutating,
        success: true
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      const message =
        err instanceof GraphClientError
          ? `[${err.code}] ${err.message}`
          : err instanceof z.ZodError
            ? `[validation_error] ${err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`
            : err instanceof Error
              ? err.message
              : "Unknown error";

      logToolError({ tool: opts.name, domain: opts.domain, requestId, error: message });
      logToolCall({ tool: opts.name, domain: opts.domain, requestId, latencyMs, mutating: opts.mutating, success: false });

      return {
        content: [{ type: "text" as const, text: message }],
        isError: true
      };
    }
  };
}

// ---------- main ----------

async function main(): Promise<void> {
  const config = loadConfig();

  logInfo("microsoft-365-mcp starting", {
    authFlow: config.authFlow,
    enabledCapabilities: config.enabledCapabilities,
    graphBaseUrl: config.graphBaseUrl
  });

  const tokenProvider = await createTokenProvider(config);
  const graph = new GraphClient(config, tokenProvider);
  const session = new SessionState();

  const server = new McpServer(
    { name: "microsoft-365-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const caps = new Set(config.enabledCapabilities);
  const enabledTools = new Set(config.enabledTools);

  // ---- mail ----
  if (enabledTools.has("mail_list_messages")) {
    server.registerTool(
      "mail_list_messages",
      {
        description: "List recent inbox messages with sender, subject, received time, and message id.",
        inputSchema: mailListMessagesInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "mail_list_messages", domain: "mail", mutating: false, handler: (args) => mailListMessages(graph, args) })
    );
  }
  if (enabledTools.has("mail_search")) {
    server.registerTool(
      "mail_search",
      {
        description: "Search mail messages by free-text query and/or OData filter across folders.",
        inputSchema: mailSearchInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "mail_search", domain: "mail", mutating: false, handler: (args) => mailSearch(graph, args) })
    );
  }
  if (enabledTools.has("mail_get_message")) {
    server.registerTool(
      "mail_get_message",
      {
        description: "Fetch a single mail message with full body and optional attachment metadata.",
        inputSchema: mailGetMessageInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "mail_get_message", domain: "mail", mutating: false, handler: (args) => mailGetMessage(graph, args) })
    );
  }
  if (enabledTools.has("mail_draft_reply")) {
    server.registerTool(
      "mail_draft_reply",
      {
        description: "Create a draft reply, reply-all, or forward of an existing message. Does not send.",
        inputSchema: mailDraftReplyInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "mail_draft_reply", domain: "mail", mutating: true, handler: (args) => mailDraftReply(graph, args) })
    );
  }
  if (enabledTools.has("mail_update")) {
    server.registerTool(
      "mail_update",
      {
        description: "Triage a message: mark read/unread, move to a folder, soft-delete, or flag.",
        inputSchema: mailUpdateInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "mail_update", domain: "mail", mutating: true, handler: (args) => mailUpdate(graph, args) })
    );
  }
  if (!caps.has("mail")) {
    logWarn("mail capability disabled — mail tools not registered");
  } else {
    const mailTools = config.enabledTools.filter((tool) => tool.startsWith("mail_"));
    if (mailTools.length < 5) {
      logInfo("mail capability partially enabled", { enabledTools: mailTools });
    }
  }

  // ---- calendar ----
  if (enabledTools.has("calendar_list_events")) {
    server.registerTool(
      "calendar_list_events",
      {
        description: "List calendar events within a bounded time window (max 31 days).",
        inputSchema: calendarListEventsInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "calendar_list_events", domain: "calendar", mutating: false, handler: (args) => calendarListEvents(graph, args, session) })
    );
  }
  if (enabledTools.has("calendar_create_event")) {
    server.registerTool(
      "calendar_create_event",
      {
        description: "Create a solo calendar event on the signed-in user's own calendar. Does not invite attendees. Use this for personal time blocking. To schedule meetings with other people, the user should do so in Outlook directly.",
        inputSchema: calendarCreateEventInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "calendar_create_event", domain: "calendar", mutating: true, handler: (args) => calendarCreateEvent(graph, args) })
    );
  }
  if (enabledTools.has("calendar_update_event")) {
    server.registerTool(
      "calendar_update_event",
      {
        description: "Update or cancel an existing calendar event. Before calling this tool, you MUST first call calendar_list_events to retrieve the event and confirm with the user — by subject and time — that it is the correct event. Never call this tool with an eventId you have not seen in a prior calendar_list_events result in this conversation. For cancel: if the event has attendees, cancellation notices will be sent to all of them and cannot be recalled.",
        inputSchema: calendarUpdateEventInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: true }
      },
      makeTool({ name: "calendar_update_event", domain: "calendar", mutating: true, handler: (args) => calendarUpdateEvent(graph, args, session) })
    );
  }
  if (enabledTools.has("calendar_respond_event")) {
    server.registerTool(
      "calendar_respond_event",
      {
        description: "Respond to a received meeting invite: accept, decline, or tentatively accept.",
        inputSchema: calendarRespondEventInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "calendar_respond_event", domain: "calendar", mutating: true, handler: (args) => calendarRespondEvent(graph, args, session) })
    );
  }
  if (!caps.has("calendar")) {
    logWarn("calendar capability disabled — calendar tools not registered");
  } else {
    const calTools = config.enabledTools.filter((tool) => tool.startsWith("calendar_"));
    if (calTools.length < 4) {
      logInfo("calendar capability partially enabled", { enabledTools: calTools });
    }
  }

  // ---- files ----
  if (enabledTools.has("files_list_items")) {
    server.registerTool(
      "files_list_items",
      {
        description: "List files and folders in the signed-in user's OneDrive.",
        inputSchema: filesListItemsInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "files_list_items", domain: "files", mutating: false, handler: (args) => filesListItems(graph, args) })
    );
  }
  if (enabledTools.has("files_read")) {
    server.registerTool(
      "files_read",
      {
        description: "Read metadata and bounded inline content for a file. Large or binary files return a download URL.",
        inputSchema: filesReadInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "files_read", domain: "files", mutating: false, handler: (args) => filesRead(graph, args) })
    );
  }
  if (!caps.has("files")) {
    logWarn("files capability disabled — files_list_items and files_read not registered");
  } else if (!enabledTools.has("files_list_items") || !enabledTools.has("files_read")) {
    logInfo("files capability partially enabled", {
      enabledTools: config.enabledTools.filter((tool) => tool.startsWith("files_"))
    });
  }

  // ---- people ----
  if (enabledTools.has("people_search")) {
    server.registerTool(
      "people_search",
      {
        description: "Search people relevant to the signed-in user for mail and meeting workflows.",
        inputSchema: peopleSearchInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "people_search", domain: "people", mutating: false, handler: (args) => peopleSearch(graph, args) })
    );
  }
  if (!caps.has("people")) {
    logWarn("people capability disabled — people_search not registered");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logInfo("microsoft-365-mcp ready on stdio");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
