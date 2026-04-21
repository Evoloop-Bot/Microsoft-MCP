import type { CapabilityContract } from "./types.js";

export const capabilityManifest: CapabilityContract[] = [
  {
    name: "mail_list_messages",
    domain: "mail",
    riskLevel: "read_only",
    requiredScopes: ["Mail.Read"],
    description: "List recent inbox messages with sender, subject, received time, and message id.",
    inputShape: ["folderId?: string", "top?: number", "filter?: string"],
    outputShape: ["messages: { id, subject, from, receivedDateTime, webLink }[]"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Cap `top` to a safe upper bound such as 50.", "Reject arbitrary server-side query expansion in v1."]
  },
  {
    name: "mail_search",
    domain: "mail",
    riskLevel: "read_only",
    requiredScopes: ["Mail.Read"],
    description: "Search mail messages by free-text query and/or OData filter across folders.",
    inputShape: ["query?: string", "folderId?: string", "filter?: string", "top?: number", "includeBody?: boolean"],
    outputShape: ["messages: { id, subject, from, receivedDateTime, webLink, bodyPreview? }[]"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require at least one of query, filter, or folderId to prevent unbounded searches.", "Cap `top` at 50."]
  },
  {
    name: "mail_get_message",
    domain: "mail",
    riskLevel: "read_only",
    requiredScopes: ["Mail.Read"],
    description: "Fetch a single mail message with full body and optional attachment metadata.",
    inputShape: ["messageId: string", "includeAttachments?: boolean"],
    outputShape: ["id, subject, from, to, cc, receivedDateTime, webLink, bodyContentType, bodyContent, attachments?"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Attachment content is never downloaded; only metadata is returned."]
  },
  {
    name: "mail_draft_reply",
    domain: "mail",
    riskLevel: "mutating",
    requiredScopes: ["Mail.ReadWrite"],
    description: "Create a draft reply, reply-all, or forward of an existing message. Does not send.",
    inputShape: ["messageId: string", "mode: reply|replyAll|forward", "to?: string[]", "cc?: string[]", "bodyText?: string", "bodyHtml?: string"],
    outputShape: ["draftId: string", "webLink: string"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require exactly one of bodyText or bodyHtml.", "Forward requires at least one recipient in `to`.", "Never sends mail — always creates a draft the user must review and send in Outlook."]
  },
  {
    name: "mail_update",
    domain: "mail",
    riskLevel: "mutating",
    requiredScopes: ["Mail.ReadWrite"],
    description: "Triage a message: mark read/unread, move to a folder, soft-delete, or flag.",
    inputShape: ["messageId: string", "action: markRead|markUnread|move|delete|flag|unflag", "destinationFolderId?: string"],
    outputShape: ["messageId: string", "action: string", "succeeded: boolean"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["`delete` is a soft delete (moves to Deleted Items); never use permanentDelete.", "move requires destinationFolderId."]
  },
  {
    name: "calendar_list_events",
    domain: "calendar",
    riskLevel: "read_only",
    requiredScopes: ["Calendars.Read"],
    description: "List calendar events within a bounded time window.",
    inputShape: ["start: string", "end: string", "calendarId?: string"],
    outputShape: ["events: { id, subject, start, end, location, webLink }[]"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require ISO timestamps.", "Reject windows larger than 31 days in v1."]
  },
  {
    name: "calendar_create_event",
    domain: "calendar",
    riskLevel: "mutating",
    requiredScopes: ["Calendars.ReadWrite"],
    description: "Create a solo calendar event on the signed-in user's own calendar. Does not invite attendees.",
    inputShape: ["subject: string", "start: string", "end: string", "bodyText?: string", "location?: string"],
    outputShape: ["id: string", "webLink: string"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require end after start.", "Attendees are not supported by design — this tool is for personal time blocking only.", "To schedule a meeting with other people, the user should do so in Outlook directly."]
  },
  {
    name: "calendar_update_event",
    domain: "calendar",
    riskLevel: "mutating",
    requiredScopes: ["Calendars.ReadWrite"],
    description: "Update or cancel an existing calendar event. Cancel may notify attendees if the event has any.",
    inputShape: ["eventId: string", "action: update|cancel", "subject?: string", "start?: string", "end?: string", "location?: string", "bodyText?: string", "cancelComment?: string"],
    outputShape: ["eventId: string", "action: string", "succeeded: boolean", "notifiedAttendees: boolean"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["eventId MUST come from a prior calendar_list_events call in the same session.", "update requires at least one field to change.", "cancel forbids field changes.", "For events with attendees, cancel sends cancellation notices that cannot be recalled."]
  },
  {
    name: "calendar_respond_event",
    domain: "calendar",
    riskLevel: "mutating",
    requiredScopes: ["Calendars.ReadWrite"],
    description: "Respond to a received meeting invite: accept, decline, or tentatively accept.",
    inputShape: ["eventId: string", "response: accept|decline|tentativelyAccept", "comment?: string", "sendResponse?: boolean"],
    outputShape: ["eventId: string", "response: string", "succeeded: boolean"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["eventId MUST come from a prior calendar_list_events call in the same session.", "sendResponse defaults to true; set false to respond silently."]
  },
  {
    name: "files_list_items",
    domain: "files",
    riskLevel: "read_only",
    requiredScopes: ["Files.Read"],
    description: "List files and folders in the signed-in user's OneDrive (pilot scope; SharePoint drives not yet supported).",
    inputShape: ["itemId?: string", "path?: string"],
    outputShape: ["items: { id, name, type, size, webUrl, lastModifiedDateTime }[]"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Reject ambiguous requests that provide both itemId and path.", "Reject path segments containing .. or . to prevent traversal."]
  },
  {
    name: "files_read",
    domain: "files",
    riskLevel: "read_only",
    requiredScopes: ["Files.Read"],
    description: "Read metadata and bounded content for a file in the signed-in user's OneDrive (pilot scope).",
    inputShape: ["itemId?: string", "path?: string", "maxBytes?: number"],
    outputShape: ["id: string", "name: string", "mimeType?: string", "contentText?: string", "downloadUrl?: string"],
    failureModes: ["authentication_required", "authorization_denied", "not_found", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Cap inline content size.", "Prefer download links for large binary files.", "Reject path segments containing .. or . to prevent traversal."]
  },
  {
    name: "people_search",
    domain: "people",
    riskLevel: "read_only",
    requiredScopes: ["People.Read"],
    description: "Search people relevant to the signed-in user for mail and meeting workflows.",
    inputShape: ["query: string", "top?: number"],
    outputShape: ["people: { displayName, emailAddresses, jobTitle, department }[]"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require at least two characters in the query.", "Cap `top` to a safe upper bound such as 20."]
  }
];

export const implementationPhases = [
  {
    phase: "phase_1",
    tools: ["mail_list_messages", "mail_search", "mail_get_message", "calendar_list_events", "files_list_items", "files_read", "people_search"],
    validationTarget: "Read-only smoke validation with a single connected tenant and user."
  },
  {
    phase: "phase_2",
    tools: ["mail_draft_reply", "mail_update", "calendar_create_event", "calendar_update_event", "calendar_respond_event"],
    validationTarget: "Mutating-path validation. No outbound mail is sent by the agent — replies are drafts only. Calendar events are solo-only; calendar_update_event is gated by session-seen eventId enforcement."
  }
] as const;
