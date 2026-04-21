# Capability surface rework — work breakdown

Context for the next session. This tracks the in-progress rework of the MCP
tool surface toward the locked-in design from the April 2026 capability
discussion. Do not re-open the design questions — they are settled. This doc
is implementation scope only.

## Locked-in final surface

**Mail (5 tools)** — zero tools in this surface can send mail or permanently
destroy a message.

- `mail_list_messages` — kept as-is. Cheap inbox listing.
- `mail_search` — cross-folder search (`$search` + `$filter`), requires at least
  one of `query`/`filter`/`folderId`.
- `mail_get_message` — single message with full body + optional attachment
  metadata (never content).
- `mail_draft_reply` — reply / replyAll / forward as a **draft only** via
  Graph's `createReply` / `createReplyAll` / `createForward`. Returns
  `{ draftId, webLink }`. Never sends.
- `mail_update` — action enum: `markRead` | `markUnread` | `move` | `delete` |
  `flag` | `unflag`. `delete` is **soft delete** (`DELETE /me/messages/{id}`,
  moves to Deleted Items). Never `permanentDelete`.

**Calendar (4 tools)** — invite creation blocked at schema level.

- `calendar_list_events` — kept. Must populate `SessionState.markEventSeen`
  for every event returned.
- `calendar_create_event` — **solo events only**. No `attendees` field in the
  schema. Handler hard-codes `attendees: []`. Drop `isOnlineMeeting` entirely.
- `calendar_update_event` — action enum `update` | `cancel`. Gated by
  `SessionState.hasEventBeenSeen` — throws `UnseenEventIdError` otherwise.
  `update` requires at least one field; `cancel` forbids field changes.
  Returns `notifiedAttendees: boolean`.
- `calendar_respond_event` — `accept` | `decline` | `tentativelyAccept`.
  Also gated by `SessionState.hasEventBeenSeen`.

**Out of scope for this rework** — Files/Teams/People. Design notes exist but
we agreed to ship mail + calendar first and let real usage data drive the long
tail. Do not implement them in this pass.

## Status

### Done
- [x] Task #1 — Read existing patterns (`calendar.ts`, `config.ts`,
  `manifest.ts`, `files.ts`).
- [x] Task #2 — Removed `mail_send`:
  - `src/capabilities/manifest.ts` — entry removed.
  - `src/capabilities/mail.ts` — function + schema removed, comment explaining why.
  - `src/server.ts` — import + registration removed.
  - `src/index.ts` — re-export removed.
  - `npm run check` passes.
- [x] Task #8 — `SessionState` class implemented:
  - `src/session.ts` — `SessionState` + `UnseenEventIdError`. FIFO eviction,
    cap 2000, re-mark refreshes recency.
  - `src/session.test.ts` — 4 unit tests covering basic tracking, eviction,
    recency refresh, and error message shape.
- [x] Partial Task #11 — `manifest.ts` is fully updated for the new surface:
  all 6 new tools (`mail_search`, `mail_get_message`, `mail_draft_reply`,
  `mail_update`, `calendar_update_event`, `calendar_respond_event`) are
  registered with scopes, descriptions, and validation notes. The
  `implementationPhases` array is updated. **This means `toolNameSchema` in
  `config.ts` already accepts the new names** — do not re-edit the manifest
  unless schemas diverge during implementation.

### Done (completed in PR #2)

All remaining tasks below were implemented and merged.

#### 1. Add `mail_search` to `src/capabilities/mail.ts`

Schema from the design discussion:

```ts
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
```

Handler notes:
- Endpoint: `/me/messages` (all folders) or
  `/me/mailFolders/{folderId}/messages` when `folderId` is set.
- When `query` is set, pass Graph `$search="..."` and **drop `$orderby`** —
  Graph rejects the combination. When `query` is absent, use
  `$orderby=receivedDateTime desc`.
- `$select`: `id,subject,from,receivedDateTime,webLink` always; add
  `bodyPreview` when `includeBody` is true.
- Output mirrors `MailListMessagesOutput` plus optional `bodyPreview`.
- Output interface: `MailSearchOutput`.

#### 2. Add `mail_get_message` to `src/capabilities/mail.ts`

Schema:

```ts
export const mailGetMessageInputSchema = z.object({
  messageId: z.string().min(1)
    .describe("Message ID, typically obtained from mail_search or mail_list_messages."),
  includeAttachments: z.boolean().default(false)
    .describe("Include attachment metadata (name, size, contentType). Does not download content.")
});
```

Handler notes:
- Main call: `GET /me/messages/{id}` with `$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,webLink,body`.
- If `includeAttachments`, second call: `GET /me/messages/{id}/attachments?$select=id,name,contentType,size`.
  Do **not** request `contentBytes` — metadata only.
- Output shape: `{ id, subject, from, to[], cc[], receivedDateTime, webLink, bodyContentType: "text"|"html", bodyContent, attachments? }`.
- Normalize `body.contentType` to lowercase `"text" | "html"` — Graph returns
  `"Text"` / `"HTML"`.

#### 3. Add `mail_draft_reply` to `src/capabilities/mail.ts`

Schema:

```ts
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
```

Handler notes:
- Endpoint by mode:
  - `reply` → `POST /me/messages/{id}/createReply`
  - `replyAll` → `POST /me/messages/{id}/createReplyAll`
  - `forward` → `POST /me/messages/{id}/createForward`
- All three return a draft message. Graph pre-populates subject (`Re:` /
  `Fwd:`), quoted history, and recipients. The tool only needs to set the new
  body content on the returned draft.
- Forward: pass `toRecipients` in the POST body (Graph accepts it on
  `createForward`). Optionally pass `ccRecipients`.
- After `createReply`/`createReplyAll`, set body via a follow-up
  `PATCH /me/messages/{draftId}` with `body: { contentType, content }`. Or,
  more cleanly, use the `POST` body shape
  `{ comment: bodyText }` for reply/replyAll — this prepends the comment to
  the quoted reply. Pick one approach and stay consistent; I'd recommend the
  PATCH approach because it supports HTML bodies, not just plain text
  comments.
- Return `{ draftId: string, webLink: string }`.
- **Never call `/send`.**

#### 4. Add `mail_update` to `src/capabilities/mail.ts`

Schema:

```ts
export const mailUpdateInputSchema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["markRead", "markUnread", "move", "delete", "flag", "unflag"]),
  destinationFolderId: z.string().optional()
}).refine((v) => v.action !== "move" || v.destinationFolderId !== undefined, {
  message: "destinationFolderId is required when action is move."
});
```

Handler notes:
- `markRead` / `markUnread` → `PATCH /me/messages/{id}` with `{ isRead: true|false }`.
- `move` → `POST /me/messages/{id}/move` with `{ destinationId: folderId }`.
- `delete` → `DELETE /me/messages/{id}`. **Never `permanentDelete`** — add a
  comment at the call site explaining this is intentional.
- `flag` → `PATCH` with `{ flag: { flagStatus: "flagged" } }`.
- `unflag` → `PATCH` with `{ flag: { flagStatus: "notFlagged" } }`.
- Return `{ messageId, action, succeeded: true }`. On Graph error the
  `makeTool` wrapper in `server.ts` already surfaces the error message.

#### 5. Constrain `calendar_create_event` in `src/capabilities/calendar.ts`

Current schema has `attendees: z.array(z.string().email()).max(25).optional()`.
Remove it entirely. Also remove any `isOnlineMeeting` / `onlineMeetingUrl`
wiring — the new design explicitly drops that.

- Remove `attendees` from `calendarCreateEventInputSchema`.
- Remove the attendee-spreading block in the handler.
- Remove `onlineMeeting` from the `CalendarEvent` interface if nothing else
  needs it (leave it if `calendar_list_events` still references it — check
  first).
- Remove `onlineMeetingUrl` from `CalendarCreateEventOutput`.
- Update the tool description in `server.ts` to: "Create a solo calendar
  event on the signed-in user's own calendar. Does not invite attendees. Use
  this for personal time blocking. To schedule meetings with other people,
  the user should do so in Outlook directly."
- Existing test `calendar.test.ts` — the `normalizes create-event payloads to
  UTC dateTimeTimeZone values` test does not pass attendees and should keep
  passing. Verify.

#### 6. Wire `SessionState` through `calendar_list_events`

- Change signature: `calendarListEvents(client, input, session?: SessionState)`.
  Make `session` optional so existing tests without a session still work; in
  production, `server.ts` always passes one.
- After the Graph call, iterate `response.value` and call
  `session?.markEventSeen(event.id)` for each.
- Update the existing test to pass a `SessionState` and assert events are
  marked. Or add a second test for this.

#### 7. Add `calendar_update_event` to `src/capabilities/calendar.ts`

Schema (from design discussion — verbatim):

```ts
export const calendarUpdateEventInputSchema = z.object({
  eventId: z.string().min(1)
    .describe("ID of the event to update or cancel. MUST come from a prior calendar_list_events call in this conversation — never guess or reconstruct an ID."),
  action: z.enum(["update", "cancel"])
    .describe("update = modify fields on the event; cancel = remove the event and notify attendees if any."),
  subject: z.string().min(1).optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
  location: z.string().optional(),
  bodyText: z.string().optional(),
  cancelComment: z.string().optional()
})
  .refine(
    (v) => v.action !== "update" || (
      v.subject !== undefined ||
      v.start !== undefined ||
      v.end !== undefined ||
      v.location !== undefined ||
      v.bodyText !== undefined
    ),
    { message: "update action requires at least one field to change." }
  )
  .refine(
    (v) => v.action !== "cancel" || (
      v.subject === undefined &&
      v.start === undefined &&
      v.end === undefined &&
      v.location === undefined &&
      v.bodyText === undefined
    ),
    { message: "cancel action does not accept field changes — use update for that." }
  )
  .refine(
    (v) => v.start === undefined || v.end === undefined || new Date(v.end) > new Date(v.start),
    { message: "end must be after start." }
  );
```

Handler notes:
- Signature: `calendarUpdateEvent(client, input, session: SessionState)`.
- **First step** — `if (!session.hasEventBeenSeen(input.eventId)) throw new UnseenEventIdError(input.eventId);`.
  This is the load-bearing security check. Do not forget it.
- `update` → `PATCH /me/events/{id}` with partial body (only fields that are
  set). Start/end go through `toGraphUtcDateTime`, same helper as create.
- `cancel`:
  - For events with attendees → `POST /me/events/{id}/cancel` with
    `{ Comment: cancelComment }`. Graph sends cancellation notices.
  - For solo events (no attendees) → `DELETE /me/events/{id}`. Nothing to
    notify. To detect: first fetch `GET /me/events/{id}?$select=attendees`;
    if `attendees.length === 0`, use DELETE; otherwise cancel.
- Return `{ eventId, action, succeeded: true, notifiedAttendees: boolean }`.
  `notifiedAttendees` is true only when `cancel` used the `/cancel` endpoint
  against an event that had attendees.
- Map `UnseenEventIdError` to a user-facing message in `makeTool` — or let it
  fall through as a generic `Error`; the error message already tells the model
  exactly what to do.

#### 8. Add `calendar_respond_event` to `src/capabilities/calendar.ts`

Schema:

```ts
export const calendarRespondEventInputSchema = z.object({
  eventId: z.string().min(1),
  response: z.enum(["accept", "decline", "tentativelyAccept"]),
  comment: z.string().optional(),
  sendResponse: z.boolean().default(true)
});
```

Handler notes:
- Signature: `calendarRespondEvent(client, input, session: SessionState)`.
- SessionState check first, same as update.
- Endpoint: `POST /me/events/{id}/{response}` where `{response}` is one of
  `accept`, `decline`, `tentativelyAccept`.
- Body: `{ Comment: input.comment, SendResponse: input.sendResponse }`.
- Return `{ eventId, response, succeeded: true }`.

#### 9. Register all new tools in `src/server.ts`

Add registrations for `mail_search`, `mail_get_message`, `mail_draft_reply`,
`mail_update`, `calendar_update_event`, `calendar_respond_event`. Pattern
matches the existing `server.registerTool` calls.

- Create a single `SessionState` instance near the top of `main()`, after
  `loadConfig`. Pass it to the calendar handlers that need it.
- `calendar_list_events` handler closure: `(args) => calendarListEvents(graph, args, session)`.
- `calendar_update_event` / `calendar_respond_event` closures: same pattern.
- Tool descriptions matter, especially for `calendar_update_event`. Use the
  description from the design discussion:

  > Update or cancel an existing calendar event. Before calling this tool,
  > you MUST first call `calendar_list_events` to retrieve the event and
  > confirm with the user — by subject, time, and attendees — that it is the
  > correct event. Never call this tool with an `eventId` you have not seen
  > in a prior `calendar_list_events` result in this conversation. For
  > `cancel`: if the event has attendees, cancellation notices will be sent
  > to all of them and cannot be recalled.

- Annotations:
  - `mail_search` / `mail_get_message` → `readOnlyHint: true`
  - `mail_draft_reply` / `mail_update` → `readOnlyHint: false, destructiveHint: false`
  - `calendar_update_event` → `readOnlyHint: false, destructiveHint: true`
    (cancel can send irreversible notices)
  - `calendar_respond_event` → `readOnlyHint: false, destructiveHint: false`
- Also remember to export new functions from `src/index.ts`.

#### 10. Update `config.ts` defaults — actually no action needed

`getDefaultToolsForCapabilities` reads from `capabilityManifest`, and the
manifest is already updated. New tools will be picked up automatically. Just
double-check by running `npm test -- --grep config` (or equivalent) after
wiring is done.

#### 11. Tests

Follow the existing `calendar.test.ts` pattern: stubbed `GraphClient` with a
`request` method that captures the args and returns canned responses. Node
built-in `test` runner, `assert/strict`.

New test files:
- `src/capabilities/mail.test.ts` (doesn't exist yet — create it)
  - `mail_search`: refine rejects when all three of query/filter/folderId are
    absent; query+filter combination sets both `$search` and `$filter` and
    **does not set `$orderby`**; includeBody toggles `bodyPreview` in
    `$select`; folderId routes to `/me/mailFolders/{id}/messages`.
  - `mail_get_message`: basic fetch shapes output correctly; `includeAttachments`
    triggers a second call to `/attachments`; attachments return metadata only
    (no contentBytes in the request).
  - `mail_draft_reply`: each of reply/replyAll/forward hits the correct
    endpoint; refine rejects missing body; refine rejects forward without
    `to`; HTML vs text body wiring.
  - `mail_update`: each action routes to the correct endpoint and method;
    `delete` uses `DELETE /me/messages/{id}` (assert this explicitly — it's
    the "never permanentDelete" guarantee); `move` refine rejects missing
    `destinationFolderId`.

- Additions to `src/capabilities/calendar.test.ts`:
  - `calendar_create_event` no longer accepts attendees (Zod parse fails on
    attendee field).
  - `calendar_list_events` populates `SessionState` when one is passed.
  - `calendar_update_event` throws `UnseenEventIdError` when eventId is not in
    session.
  - `calendar_update_event` with update action: PATCH body contains only set
    fields; refine rejects empty update.
  - `calendar_update_event` with cancel action: hits `/cancel` when event has
    attendees, `DELETE` when event is solo; `notifiedAttendees` matches.
  - `calendar_update_event` cancel refine rejects field changes.
  - `calendar_respond_event` throws `UnseenEventIdError` when not in session.
  - `calendar_respond_event` routes to the correct endpoint per response
    value; body includes `SendResponse` and `Comment`.

#### 12. Final verification

- `npm run check` — typecheck.
- `npm test` — all existing + new tests pass.
- `npm run build` — emits `dist/` cleanly.
- Manual smoke: `node dist/server.js` with a fake stdio client calling
  `tools/list` should list 11 tools (kept 5 from before: list_messages,
  list_events, create_event, list_items, read, people_search — minus
  mail_send; plus 6 new: search, get_message, draft_reply, update,
  update_event, respond_event). Actual count: 5 mail + 4 calendar + 2 files +
  1 people = **12 tools**. Verify this matches the final count before
  declaring done.

## Things to NOT do

- Do not reintroduce `mail_send` or any "compose new email" capability. This
  was a deliberate design decision, not an oversight.
- Do not add `attendees` support to `calendar_create_event`. Same reason.
- Do not implement Files / Teams / People / Directory tools in this pass.
- Do not add the MCP smoke harness, linter, or Graph client retry tests now —
  those are separate items from the earlier "what could we improve" review.
- Do not weaken the `SessionState` check on calendar_update_event /
  calendar_respond_event to a warning or a tool description note. The whole
  point is that it's a runtime guarantee.

## Open questions deferred to the next session

None known. The design is fully specified. If a real ambiguity shows up
during implementation, add it here rather than guessing.
