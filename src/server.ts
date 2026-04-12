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
  mailSend,
  mailSendInputSchema
} from "./capabilities/mail.js";
import {
  calendarListEvents,
  calendarListEventsInputSchema,
  calendarCreateEvent,
  calendarCreateEventInputSchema
} from "./capabilities/calendar.js";
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
        mutating: opts.mutating
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
      logToolCall({ tool: opts.name, domain: opts.domain, requestId, latencyMs, mutating: opts.mutating });

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

  const tokenProvider = createTokenProvider(config);
  const graph = new GraphClient(config, tokenProvider);

  const server = new McpServer(
    { name: "microsoft-365-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const caps = new Set(config.enabledCapabilities);

  // ---- mail ----
  if (caps.has("mail")) {
    server.registerTool(
      "mail_list_messages",
      {
        description: "List recent inbox messages with sender, subject, received time, and message id.",
        inputSchema: mailListMessagesInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "mail_list_messages", domain: "mail", mutating: false, handler: (args) => mailListMessages(graph, args) })
    );

    server.registerTool(
      "mail_send",
      {
        description: "Send a mail message on behalf of the signed-in user. Side effect: delivers an email.",
        inputSchema: mailSendInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "mail_send", domain: "mail", mutating: true, handler: (args) => mailSend(graph, args) })
    );
  } else {
    logWarn("mail capability disabled — mail_list_messages and mail_send not registered");
  }

  // ---- calendar ----
  if (caps.has("calendar")) {
    server.registerTool(
      "calendar_list_events",
      {
        description: "List calendar events within a bounded time window (max 31 days).",
        inputSchema: calendarListEventsInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "calendar_list_events", domain: "calendar", mutating: false, handler: (args) => calendarListEvents(graph, args) })
    );

    server.registerTool(
      "calendar_create_event",
      {
        description: "Create a calendar event for the signed-in user. Side effect: creates a calendar entry.",
        inputSchema: calendarCreateEventInputSchema,
        annotations: { readOnlyHint: false, destructiveHint: false }
      },
      makeTool({ name: "calendar_create_event", domain: "calendar", mutating: true, handler: (args) => calendarCreateEvent(graph, args) })
    );
  } else {
    logWarn("calendar capability disabled — calendar_list_events and calendar_create_event not registered");
  }

  // ---- files ----
  if (caps.has("files")) {
    server.registerTool(
      "files_list_items",
      {
        description: "List files and folders in OneDrive or an approved SharePoint location.",
        inputSchema: filesListItemsInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "files_list_items", domain: "files", mutating: false, handler: (args) => filesListItems(graph, args) })
    );

    server.registerTool(
      "files_read",
      {
        description: "Read metadata and bounded inline content for a file. Large or binary files return a download URL.",
        inputSchema: filesReadInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "files_read", domain: "files", mutating: false, handler: (args) => filesRead(graph, args) })
    );
  } else {
    logWarn("files capability disabled — files_list_items and files_read not registered");
  }

  // ---- people ----
  if (caps.has("people")) {
    server.registerTool(
      "people_search",
      {
        description: "Search people relevant to the signed-in user for mail and meeting workflows.",
        inputSchema: peopleSearchInputSchema,
        annotations: { readOnlyHint: true }
      },
      makeTool({ name: "people_search", domain: "people", mutating: false, handler: (args) => peopleSearch(graph, args) })
    );
  } else {
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
