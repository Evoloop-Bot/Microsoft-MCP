import { z } from "zod";
import type { GraphClient } from "../graph/client.js";

// ---------- Shared Graph response shapes ----------

interface MailMessage {
  id: string;
  subject: string | null;
  from: { emailAddress: { address: string; name?: string } } | null;
  receivedDateTime: string;
  webLink: string;
}

// ---------- mail_list_messages ----------

export const mailListMessagesInputSchema = z.object({
  folderId: z.string().optional().describe("Folder ID or well-known name (e.g. inbox). Defaults to inbox."),
  top: z.number().int().min(1).max(50).default(20).describe("Maximum messages to return (1-50)."),
  filter: z.string().optional().describe("OData filter expression (e.g. isRead eq false).")
});

export type MailListMessagesInput = z.infer<typeof mailListMessagesInputSchema>;

export interface MailListMessagesOutput {
  messages: {
    id: string;
    subject: string | null;
    from: string | null;
    receivedDateTime: string;
    webLink: string;
  }[];
}

export async function mailListMessages(client: GraphClient, input: MailListMessagesInput): Promise<MailListMessagesOutput> {
  const folder = input.folderId ?? "inbox";
  const query: Record<string, string | number | boolean> = {
    $select: "id,subject,from,receivedDateTime,webLink",
    $top: input.top,
    $orderby: "receivedDateTime desc"
  };

  if (input.filter) {
    query["$filter"] = input.filter;
  }

  const response = await client.request<{ value: MailMessage[] }>(`/me/mailFolders/${encodeURIComponent(folder)}/messages`, { query });

  return {
    messages: response.value.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from?.emailAddress.address ?? null,
      receivedDateTime: m.receivedDateTime,
      webLink: m.webLink
    }))
  };
}

// ---------- mail_search ----------

export const mailSearchInputSchema = z.object({
  query: z.string().min(1).optional()
    .describe("Free-text search across subject, body, and sender. Omit to list by filter only."),
  folderId: z.string().optional()
    .describe("Folder ID or well-known name (e.g. inbox). Omit to search across all folders."),
  filter: z.string().optional()
    .describe("OData filter expression (e.g. \"isRead eq false\"). Combined with query if both set."),
  top: z.number().int().min(1).max(50).default(20)
    .describe("Maximum messages to return (1-50)."),
  includeBody: z.boolean().default(false)
    .describe("Include message body preview. Costs latency; prefer false unless the body is needed.")
}).refine((v) => v.query !== undefined || v.filter !== undefined || v.folderId !== undefined, {
  message: "Provide at least one of query, filter, or folderId."
});

export type MailSearchInput = z.infer<typeof mailSearchInputSchema>;

export interface MailSearchOutput {
  messages: {
    id: string;
    subject: string | null;
    from: string | null;
    receivedDateTime: string;
    webLink: string;
    bodyPreview?: string;
  }[];
}

export async function mailSearch(client: GraphClient, input: MailSearchInput): Promise<MailSearchOutput> {
  const selectFields = "id,subject,from,receivedDateTime,webLink";
  const select = input.includeBody ? `${selectFields},bodyPreview` : selectFields;

  const query: Record<string, string | number | boolean> = { $select: select, $top: input.top };

  const headers: Record<string, string> = {};

  if (input.query) {
    const sanitized = input.query.replace(/"/g, '\\"');
    query["$search"] = `"${sanitized}"`;
    query["$count"] = true;
    headers["ConsistencyLevel"] = "eventual";
  } else {
    query["$orderby"] = "receivedDateTime desc";
  }

  if (input.filter) {
    query["$filter"] = input.filter;
  }

  const path = input.folderId
    ? `/me/mailFolders/${encodeURIComponent(input.folderId)}/messages`
    : "/me/messages";

  const response = await client.request<{ value: (MailMessage & { bodyPreview?: string })[] }>(path, { query, headers });

  return {
    messages: response.value.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from?.emailAddress.address ?? null,
      receivedDateTime: m.receivedDateTime,
      webLink: m.webLink,
      ...(input.includeBody && m.bodyPreview ? { bodyPreview: m.bodyPreview } : {})
    }))
  };
}

// ---------- mail_get_message ----------

export const mailGetMessageInputSchema = z.object({
  messageId: z.string().min(1)
    .describe("Message ID, typically obtained from mail_search or mail_list_messages."),
  includeAttachments: z.boolean().default(false)
    .describe("Include attachment metadata (name, size, contentType). Does not download content.")
});

export type MailGetMessageInput = z.infer<typeof mailGetMessageInputSchema>;

interface GraphMessageBody {
  contentType: string;
  content: string;
}

interface GraphRecipient {
  emailAddress: { address: string; name?: string };
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface MailGetMessageOutput {
  id: string;
  subject: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  receivedDateTime: string;
  webLink: string;
  bodyContentType: "text" | "html";
  bodyContent: string;
  attachments?: { id: string; name: string; contentType: string; size: number }[];
}

export async function mailGetMessage(client: GraphClient, input: MailGetMessageInput): Promise<MailGetMessageOutput> {
  const msg = await client.request<MailMessage & { body: GraphMessageBody; toRecipients: GraphRecipient[]; ccRecipients: GraphRecipient[] }>(
    `/me/messages/${encodeURIComponent(input.messageId)}`,
    { query: { $select: "id,subject,from,toRecipients,ccRecipients,receivedDateTime,webLink,body" } }
  );

  const rawContentType = msg.body?.contentType?.toLowerCase();
  const bodyContentType: "text" | "html" = rawContentType === "html" ? "html" : "text";

  const result: MailGetMessageOutput = {
    id: msg.id,
    subject: msg.subject,
    from: msg.from?.emailAddress.address ?? null,
    to: (msg.toRecipients ?? []).map((r) => r.emailAddress.address),
    cc: (msg.ccRecipients ?? []).map((r) => r.emailAddress.address),
    receivedDateTime: msg.receivedDateTime,
    webLink: msg.webLink,
    bodyContentType,
    bodyContent: msg.body?.content ?? ""
  };

  if (input.includeAttachments) {
    const attachments = await client.request<{ value: GraphAttachment[] }>(
      `/me/messages/${encodeURIComponent(input.messageId)}/attachments`,
      { query: { $select: "id,name,contentType,size" } }
    );
    result.attachments = attachments.value.map((a) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      size: a.size
    }));
  }

  return result;
}

// ---------- mail_draft_reply ----------

export const mailDraftReplyInputSchema = z.object({
  messageId: z.string().min(1),
  mode: z.enum(["reply", "replyAll", "forward"]),
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional()
})
  .refine((v) => (v.bodyText !== undefined) !== (v.bodyHtml !== undefined), {
    message: "Exactly one of bodyText or bodyHtml must be provided."
  })
  .refine((v) => v.mode !== "forward" || (v.to !== undefined && v.to.length > 0), {
    message: "to is required when mode is forward."
  });

export type MailDraftReplyInput = z.infer<typeof mailDraftReplyInputSchema>;

export interface MailDraftReplyOutput {
  draftId: string;
  webLink: string;
}

export async function mailDraftReply(client: GraphClient, input: MailDraftReplyInput): Promise<MailDraftReplyOutput> {
  const endpointMap = {
    reply: "createReply",
    replyAll: "createReplyAll",
    forward: "createForward"
  } as const;

  const postBody: Record<string, unknown> = {};

  if (input.mode === "forward") {
    postBody.toRecipients = input.to!.map((a) => ({ emailAddress: { address: a } }));
    if (input.cc && input.cc.length > 0) {
      postBody.ccRecipients = input.cc.map((a) => ({ emailAddress: { address: a } }));
    }
  }

  const draft = await client.request<{ id: string; webLink: string }>(
    `/me/messages/${encodeURIComponent(input.messageId)}/${endpointMap[input.mode]}`,
    { method: "POST", body: postBody }
  );

  const contentType = input.bodyHtml !== undefined ? "html" : "text";
  const content = input.bodyHtml ?? input.bodyText!;

  await client.request<unknown>(
    `/me/messages/${encodeURIComponent(draft.id)}`,
    {
      method: "PATCH",
      body: { body: { contentType, content } }
    }
  );

  return { draftId: draft.id, webLink: draft.webLink };
}

// ---------- mail_update ----------

export const mailUpdateInputSchema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["markRead", "markUnread", "move", "delete", "flag", "unflag"]),
  destinationFolderId: z.string().optional()
}).refine((v) => v.action !== "move" || v.destinationFolderId !== undefined, {
  message: "destinationFolderId is required when action is move."
});

export type MailUpdateInput = z.infer<typeof mailUpdateInputSchema>;

export interface MailUpdateOutput {
  messageId: string;
  action: string;
  succeeded: boolean;
}

export async function mailUpdate(client: GraphClient, input: MailUpdateInput): Promise<MailUpdateOutput> {
  const msgPath = `/me/messages/${encodeURIComponent(input.messageId)}`;

  switch (input.action) {
    case "markRead":
      await client.request<unknown>(msgPath, { method: "PATCH", body: { isRead: true } });
      break;
    case "markUnread":
      await client.request<unknown>(msgPath, { method: "PATCH", body: { isRead: false } });
      break;
    case "move":
      await client.request<unknown>(`${msgPath}/move`, { method: "POST", body: { destinationId: input.destinationFolderId } });
      break;
    case "delete":
      // Soft delete only — moves to Deleted Items. Never permanentDelete.
      await client.request<unknown>(msgPath, { method: "DELETE" });
      break;
    case "flag":
      await client.request<unknown>(msgPath, { method: "PATCH", body: { flag: { flagStatus: "flagged" } } });
      break;
    case "unflag":
      await client.request<unknown>(msgPath, { method: "PATCH", body: { flag: { flagStatus: "notFlagged" } } });
      break;
  }

  return { messageId: input.messageId, action: input.action, succeeded: true };
}
