# CLAUDE.md

File guide Claude Code (claude.ai/code) in repo.

## Commands

- `npm run check` — typecheck only (`tsc --noEmit`). Run after schema/type change.
- `npm test` — run all `src/**/*.test.ts` via Node built-in test runner through `tsx/esm`. No separate framework.
- `npm test -- --test-name-pattern="some test name"` — single test (Node test runner flag). Or point runner at one file: `node --import tsx/esm --test src/capabilities/calendar.test.ts`.
- `npm run build` — emit `dist/` via `tsc -p tsconfig.json`. Published entrypoint `dist/server.js` (exposed as `m365-mcp` bin).
- `npm start` — run built server from `dist/`. Dev iterate: run TS source direct: `node --import tsx/esm src/server.ts`.

CI run `check`, `test`, `build` in order. Reproduce local before PR.

## Architecture

Stdio MCP server expose Microsoft 365 (Graph API) capabilities. Five areas know before edit:

**1. `capabilityManifest` = single source of truth for tool names.** `src/capabilities/manifest.ts` declare every tool, domain, risk level, required Graph scopes, validation notes. `src/config.ts` build `toolNameSchema` (`z.enum`) direct from manifest. `getRequiredScopes()` / `getDefaultToolsForCapabilities()` derive runtime behavior from it. **New tool need manifest entry first** — else `config.ts` reject name at load. Scopes computed per enabled tool, so disable tool remove scope from consent ask.

**2. Two independent gating layers — capabilities and tools.** `MICROSOFT_ENABLED_CAPABILITIES` (domain: mail/calendar/files/people) and `MICROSOFT_ENABLED_TOOLS` (tool names) both honored in `server.ts`. Tool register only if name in `enabledTools`. Capability gating emit warn/info logs for partial enable. Hook for least-privilege deploy — prefer per-tool over per-capability.

**3. `GraphClient` own transport, retry, pagination — capabilities own shape.** `src/graph/client.ts` handle auth-header inject, exponential backoff on 429/5xx (`Retry-After` parse for seconds and HTTP-date), `AbortController` timeouts, `@odata.nextLink` pagination via async generator. Capability modules (`src/capabilities/*.ts`) = pure Graph-shape adapters: build path + query, call `client.request<T>()`, map response to tool output interface. No retry/auth/HTTP concerns in capability code.

**4. Tool handlers wrapped by `makeTool` in `server.ts`.** Wrapper assign `requestId`, time call, format errors uniform (special handle `GraphClientError` codes, `ZodError` validation fails), emit structured logs via `src/logger.ts`. Capability funcs throw — wrapper convert throws to MCP `isError: true` content. Logs go to **stderr only**. Stdout reserved for stdio MCP transport.

**5. Auth = MSAL device-code with persisted cache.** `src/auth/device-code-provider.ts` wrap `@azure/msal-node`, persist tokens via `@azure/msal-node-extensions` so silent refresh survive restart. `DeviceCodeTokenProvider` guard concurrent interactive prompts with single in-flight promise. Cache-extensions package dynamic `import()`ed so unit tests skip native dep. Only `device_code` supported today. `client_credentials` and `authorization_code` intentionally excluded.

## Conventions

- **Zod schemas live next to handler.** Each capability file export `{toolName}InputSchema`, `{toolName}Input` type, `{toolName}Output` interface, handler function. `server.ts` import schema and handler together. Use `.refine()` for cross-field validation with sharp error messages — messages surfaced to model verbatim.
- **ESM-only, `.js` import specifiers in source.** TS configured for `NodeNext` module resolution. Local imports must use `.js` extensions even though sources `.ts`.
- **Tests use stubbed `GraphClient`.** See `src/capabilities/calendar.test.ts` for pattern: cast `{ request: async (...) => {...} }` to `GraphClient`, capture args, assert on path/body/headers. No real network.
- **Observability markers, not payload logs.** `logger.ts` fields deliberately narrow (tool, domain, requestId, latencyMs, mutating, success). Never log access tokens, message bodies, file contents, recipient lists.
- **`src/index.ts` re-export public API** for library consumers. Keep sync when add/remove capability functions.

## Current work in progress

`docs/workbreakdown.md` track in-progress rework of mail and calendar tool surface (remove `mail_send`, add draft-only replies, constrain `calendar_create_event` to solo events, introduce `SessionState`-gated `calendar_update_event`). Read before edit mail/calendar capabilities — several design decisions locked, no reopen.

`src/session.ts` define `SessionState` and `UnseenEventIdError`. Exist to convert "model must call `calendar_list_events` before touch event" rule from tool-description contract into runtime guarantee. Destructive calendar tools must check `session.hasEventBeenSeen(eventId)` before Graph calls.