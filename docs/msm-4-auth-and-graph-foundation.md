# MSM-4 Auth and Graph Foundation

## Auth Flows

1. `device_code` is the default for local Claude/Codex execution.
2. `authorization_code` remains reserved for a later hosted bridge where browser-based redirects are practical, and the current runtime rejects it explicitly.
3. `client_credentials` was initially scaffolded for narrow app-only workloads but is removed from the pilot surface: all shipped tools use delegated `/me/...` endpoints that require user context, making app-only tokens functionally incompatible. `authorization_code` remains reserved for a later hosted bridge.

## Consent Strategy

1. Request only capability-driven scopes, deriving the default scope set from enabled capabilities unless an explicit override is supplied.
2. Keep SharePoint-wide scopes disabled unless file capabilities explicitly require them.
3. Prefer one tenant and one signed-in user per MCP runtime instance for v1.

## Graph Client Expectations

1. Every request is authenticated through a token provider abstraction.
2. Rate limits and 5xx responses retry with bounded backoff.
3. Collection endpoints can be consumed through `@odata.nextLink` pagination.
4. Failures are normalized into MCP-friendly categories instead of leaking raw upstream errors.

## Test Strategy

1. Unit-test config parsing, scope derivation, and error mapping without a live tenant.
2. Mock Graph responses to validate retry and pagination behavior.
3. Run tenant-backed smoke tests separately for auth, token refresh, one read path, and one mutating path.
4. Treat Microsoft Graph sandbox or mocked tenants as pre-merge coverage, with a real tenant smoke environment for release readiness.
