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

  const response = await client.request<{ value: MailMessage[] }>(`/me/mailFolders/${folder}/messages`, { query });

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

// ---------- mail_send ----------

export const mailSendInputSchema = z.object({
  to: z.array(z.string().email()).min(1).describe("Recipient email addresses."),
  cc: z.array(z.string().email()).optional().describe("CC email addresses."),
  subject: z.string().min(1).describe("Message subject."),
  bodyText: z.string().optional().describe("Plain text body. Provide exactly one of bodyText or bodyHtml."),
  bodyHtml: z.string().optional().describe("HTML body. Provide exactly one of bodyText or bodyHtml.")
}).refine((v) => (v.bodyText !== undefined) !== (v.bodyHtml !== undefined), {
  message: "Exactly one of bodyText or bodyHtml must be provided."
});

export type MailSendInput = z.infer<typeof mailSendInputSchema>;

export interface MailSendOutput {
  accepted: boolean;
  sentAt: string;
}

function toRecipients(addresses: string[]): { emailAddress: { address: string } }[] {
  return addresses.map((a) => ({ emailAddress: { address: a } }));
}

export async function mailSend(client: GraphClient, input: MailSendInput): Promise<MailSendOutput> {
  const body: Record<string, unknown> = {
    message: {
      subject: input.subject,
      toRecipients: toRecipients(input.to),
      ...(input.cc ? { ccRecipients: toRecipients(input.cc) } : {}),
      body: {
        contentType: input.bodyHtml !== undefined ? "html" : "text",
        content: input.bodyHtml ?? input.bodyText ?? ""
      }
    },
    saveToSentItems: true
  };

  // POST /me/sendMail returns 202 Accepted with no body
  await client.request<undefined>("/me/sendMail", { method: "POST", body });

  return { accepted: true, sentAt: new Date().toISOString() };
}
