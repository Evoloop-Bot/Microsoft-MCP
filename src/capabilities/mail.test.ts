import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphClient } from "../graph/client.js";
import {
  mailSearch,
  mailSearchInputSchema,
  mailGetMessage,
  mailDraftReply,
  mailDraftReplyInputSchema,
  mailUpdate,
  mailUpdateInputSchema
} from "./mail.js";

describe("mail_search", () => {
  it("rejects when all of query, filter, folderId are absent", () => {
    const result = mailSearchInputSchema.safeParse({ top: 10 });
    assert.equal(result.success, false);
  });

  it("drops $orderby when query is set and adds ConsistencyLevel header", async () => {
    let seenQuery: Record<string, unknown> | undefined;
    let seenHeaders: Record<string, string> | undefined;
    const client = {
      request: async (_path: string, options?: { query?: Record<string, unknown>; headers?: Record<string, string> }) => {
        seenQuery = options?.query;
        seenHeaders = options?.headers;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { query: "budget", top: 10, includeBody: false });

    assert.ok(seenQuery);
    assert.equal(seenQuery["$search"], '"budget"');
    assert.equal(seenQuery["$orderby"], undefined);
    assert.equal(seenQuery["$count"], true);
    assert.ok(seenHeaders);
    assert.equal(seenHeaders["ConsistencyLevel"], "eventual");
  });

  it("uses $orderby when query is absent", async () => {
    let seenQuery: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { query?: Record<string, unknown> }) => {
        seenQuery = options?.query;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { filter: "isRead eq false", top: 10, includeBody: false });

    assert.ok(seenQuery);
    assert.equal(seenQuery["$orderby"], "receivedDateTime desc");
    assert.equal(seenQuery["$search"], undefined);
  });

  it("adds bodyPreview to $select when includeBody is true", async () => {
    let seenQuery: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { query?: Record<string, unknown> }) => {
        seenQuery = options?.query;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { query: "test", top: 5, includeBody: true });

    assert.ok(seenQuery);
    assert.ok((seenQuery["$select"] as string).includes("bodyPreview"));
  });

  it("routes to mailFolders endpoint when folderId is set", async () => {
    let seenPath = "";
    const client = {
      request: async (path: string) => {
        seenPath = path;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { folderId: "drafts", top: 5, includeBody: false });

    assert.ok(seenPath.includes("/me/mailFolders/drafts/messages"));
  });

  it("escapes double quotes in $search query", async () => {
    let seenQuery: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { query?: Record<string, unknown> }) => {
        seenQuery = options?.query;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { query: 'budget "Q1"', top: 5, includeBody: false });

    assert.ok(seenQuery);
    assert.equal(seenQuery["$search"], '"budget \\"Q1\\""');
  });

  it("uses /me/messages when folderId is absent", async () => {
    let seenPath = "";
    const client = {
      request: async (path: string) => {
        seenPath = path;
        return { value: [] };
      }
    } as unknown as GraphClient;

    await mailSearch(client, { query: "hello", top: 5, includeBody: false });

    assert.equal(seenPath, "/me/messages");
  });
});

describe("mail_get_message", () => {
  it("fetches message and shapes output correctly", async () => {
    const client = {
      request: async () => ({
        id: "msg-1",
        subject: "Test",
        from: { emailAddress: { address: "alice@example.com", name: "Alice" } },
        toRecipients: [{ emailAddress: { address: "bob@example.com" } }],
        ccRecipients: [],
        receivedDateTime: "2026-04-10T12:00:00Z",
        webLink: "https://example.test/msg/1",
        body: { contentType: "HTML", content: "<p>Hello</p>" }
      })
    } as unknown as GraphClient;

    const result = await mailGetMessage(client, { messageId: "msg-1", includeAttachments: false });

    assert.equal(result.id, "msg-1");
    assert.equal(result.bodyContentType, "html");
    assert.deepEqual(result.to, ["bob@example.com"]);
    assert.equal(result.attachments, undefined);
  });

  it("fetches attachment metadata without contentBytes", async () => {
    let attachmentQuery: Record<string, unknown> | undefined;
    const client = {
      request: async (path: string, options?: { query?: Record<string, unknown> }) => {
        if (path.includes("/attachments")) {
          attachmentQuery = options?.query;
          return {
            value: [{ id: "att-1", name: "file.pdf", contentType: "application/pdf", size: 12345 }]
          };
        }
        return {
          id: "msg-1",
          subject: "Test",
          from: null,
          toRecipients: [],
          ccRecipients: [],
          receivedDateTime: "2026-04-10T12:00:00Z",
          webLink: "https://example.test/msg/1",
          body: { contentType: "Text", content: "Hello" }
        };
      }
    } as unknown as GraphClient;

    const result = await mailGetMessage(client, { messageId: "msg-1", includeAttachments: true });

    assert.ok(result.attachments);
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0].name, "file.pdf");
    assert.ok(attachmentQuery);
    assert.ok(!(attachmentQuery["$select"] as string).includes("contentBytes"));
  });
});

describe("mail_draft_reply", () => {
  it("rejects when neither bodyText nor bodyHtml is provided", () => {
    const result = mailDraftReplyInputSchema.safeParse({
      messageId: "msg-1",
      mode: "reply"
    });
    assert.equal(result.success, false);
  });

  it("rejects forward without to", () => {
    const result = mailDraftReplyInputSchema.safeParse({
      messageId: "msg-1",
      mode: "forward",
      bodyText: "FYI"
    });
    assert.equal(result.success, false);
  });

  it("hits correct endpoint for each mode", async () => {
    const paths: string[] = [];
    const client = {
      request: async (path: string) => {
        paths.push(path);
        return { id: "draft-1", webLink: "https://example.test/draft/1" };
      }
    } as unknown as GraphClient;

    for (const mode of ["reply", "replyAll", "forward"] as const) {
      paths.length = 0;
      const input: Record<string, unknown> = { messageId: "msg-1", mode, bodyText: "Hello" };
      if (mode === "forward") input.to = ["bob@example.com"];
      await mailDraftReply(client, input as any);

      const endpointMap = { reply: "createReply", replyAll: "createReplyAll", forward: "createForward" };
      assert.ok(paths[0].includes(endpointMap[mode]), `Expected ${endpointMap[mode]} in ${paths[0]}`);
    }
  });

  it("uses PATCH with html body", async () => {
    let patchBody: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
        if (options?.method === "PATCH") {
          patchBody = options.body;
        }
        return { id: "draft-1", webLink: "https://example.test/draft/1" };
      }
    } as unknown as GraphClient;

    await mailDraftReply(client, { messageId: "msg-1", mode: "reply", bodyHtml: "<b>Hi</b>" });

    assert.ok(patchBody);
    assert.deepEqual(patchBody.body, { contentType: "html", content: "<b>Hi</b>" });
  });
});

describe("mail_update", () => {
  it("uses DELETE for delete action", async () => {
    let seenMethod = "";
    let seenPath = "";
    const client = {
      request: async (path: string, options?: { method?: string }) => {
        seenMethod = options?.method ?? "GET";
        seenPath = path;
        return {};
      }
    } as unknown as GraphClient;

    await mailUpdate(client, { messageId: "msg-1", action: "delete" });

    assert.equal(seenMethod, "DELETE");
    assert.equal(seenPath, "/me/messages/msg-1");
  });

  it("uses POST /move for move action", async () => {
    let seenPath = "";
    let seenBody: Record<string, unknown> | undefined;
    const client = {
      request: async (path: string, options?: { body?: Record<string, unknown> }) => {
        seenPath = path;
        seenBody = options?.body;
        return {};
      }
    } as unknown as GraphClient;

    await mailUpdate(client, { messageId: "msg-1", action: "move", destinationFolderId: "archive" });

    assert.ok(seenPath.includes("/move"));
    assert.deepEqual(seenBody, { destinationId: "archive" });
  });

  it("rejects move without destinationFolderId", () => {
    const result = mailUpdateInputSchema.safeParse({
      messageId: "msg-1",
      action: "move"
    });
    assert.equal(result.success, false);
  });

  it("patches isRead for markRead", async () => {
    let seenBody: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { body?: Record<string, unknown> }) => {
        seenBody = options?.body;
        return {};
      }
    } as unknown as GraphClient;

    await mailUpdate(client, { messageId: "msg-1", action: "markRead" });

    assert.deepEqual(seenBody, { isRead: true });
  });

  it("patches flag status for flag action", async () => {
    let seenBody: Record<string, unknown> | undefined;
    const client = {
      request: async (_path: string, options?: { body?: Record<string, unknown> }) => {
        seenBody = options?.body;
        return {};
      }
    } as unknown as GraphClient;

    await mailUpdate(client, { messageId: "msg-1", action: "flag" });

    assert.deepEqual(seenBody, { flag: { flagStatus: "flagged" } });
  });
});
