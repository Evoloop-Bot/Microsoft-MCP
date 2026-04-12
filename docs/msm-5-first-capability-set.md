# MSM-5 First Microsoft 365 MCP Capability Set

## Initial Tool Bundle

Prioritize seven tools across the four v1 domains:

1. `mail_list_messages`
2. `mail_send`
3. `calendar_list_events`
4. `calendar_create_event`
5. `files_list_items`
6. `files_read`
7. `people_search`

This bundle is intentionally narrow: it covers the everyday "read context, send a message, schedule a meeting, inspect files, find a person" loop that Claude and Codex can use immediately.

## Request and Response Pattern

1. Inputs should remain small, explicit, and JSON-schema validated.
2. Outputs should always return stable IDs, timestamps, and URLs when Graph provides them.
3. Mutating tools must make side effects obvious in both descriptions and outputs.
4. Failures should map into the normalized error set established in `MSM-4`.

## Delivery Sequencing

1. Phase 1: ship read-only tools first for inbox, events, files listing, and people search.
2. Phase 2: add low-ambiguity mutating tools for mail send and event creation.
3. Phase 3: add bounded file reading with clear size limits and fallback behavior.

## Open Questions

1. Whether file reads should inline only text formats or support a broader content-conversion layer in v1.
2. Whether tenant admins will allow SharePoint-wide scopes or require site-by-site allowlists.
3. What audit/log retention is required for mutating tools in regulated tenants.
4. Whether user-host applications expect MCP resources in addition to tools for mailbox or calendar browsing.
