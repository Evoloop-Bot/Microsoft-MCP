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
    name: "mail_send",
    domain: "mail",
    riskLevel: "mutating",
    requiredScopes: ["Mail.Send"],
    description: "Send a mail message on behalf of the signed-in user.",
    inputShape: ["to: string[]", "cc?: string[]", "subject: string", "bodyText?: string", "bodyHtml?: string"],
    outputShape: ["accepted: boolean", "sentAt: string"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require at least one recipient.", "Allow either plain text or HTML body, not neither."]
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
    description: "Create a calendar event for the signed-in user.",
    inputShape: ["subject: string", "start: string", "end: string", "attendees?: string[]", "bodyText?: string", "location?: string"],
    outputShape: ["id: string", "webLink: string", "onlineMeetingUrl?: string"],
    failureModes: ["authentication_required", "authorization_denied", "validation_error", "rate_limited", "transient_upstream_error"],
    validationNotes: ["Require end after start.", "Cap attendee count for v1 to keep payloads predictable."]
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
    tools: ["mail_list_messages", "calendar_list_events", "files_list_items", "people_search"],
    validationTarget: "Read-only smoke validation with a single connected tenant and user."
  },
  {
    phase: "phase_2",
    tools: ["mail_send", "calendar_create_event"],
    validationTarget: "Mutating-path validation with explicit side-effect confirmation and audit-friendly logs."
  },
  {
    phase: "phase_3",
    tools: ["files_read"],
    validationTarget: "Bounded file-content handling and large-file fallback behavior."
  }
] as const;
