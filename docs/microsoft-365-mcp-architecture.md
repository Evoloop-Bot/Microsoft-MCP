# Microsoft 365 MCP v1 Architecture and Delivery Contract

## Objective

Deliver a platform-agnostic MCP server that lets Claude and Codex access a constrained Microsoft 365 capability set through Microsoft Graph with a consistent local or hosted deployment model.

## v1 Capability Surface

The first release should support a narrow, execution-oriented slice:

1. Identity bootstrap and tenant connection health checks.
2. Read/write mail actions for a single signed-in user.
3. Calendar availability lookup and event create/update/cancel.
4. OneDrive/SharePoint file listing and file read/write within approved scopes.
5. Lightweight people/org lookup needed for email and meeting workflows.

Each capability should be exposed as stable MCP tools with explicit input schemas, scoped permissions, and predictable error categories.

## Non-Goals for v1

The first release should not attempt:

1. Multi-tenant admin dashboards.
2. Broad Exchange or SharePoint administration.
3. Teams chat, channel, or voice workloads.
4. Background sync engines or long-running webhook fanout.
5. Full document coauthoring semantics.
6. Custom per-client forks for Claude vs. Codex.

## Architecture Baseline

### Topology

Use a layered server design:

1. MCP transport layer
   - Supports stdio first for local agent runtimes.
   - Keeps transport concerns separate from Microsoft business logic.
2. Capability handlers
   - One handler module per capability domain: mail, calendar, files, people.
   - Maps MCP tool inputs to domain service calls and normalizes outputs.
3. Graph service layer
   - Wraps Microsoft Graph REST calls behind typed operations.
   - Centralizes retries, pagination, throttling backoff, and error translation.
4. Auth/session layer
   - Acquires and refreshes Microsoft access tokens.
   - Stores tokens in an adapter-backed secret store, never in plaintext config.
5. Policy/config layer
   - Enforces tenant allowlists, enabled capability flags, and path/scope constraints.

### Implementation Stack

Use TypeScript on Node.js for the first version.

Reasons:

1. MCP ecosystem support is strongest in TypeScript today.
2. It is straightforward to ship as both a local CLI package and a hosted service.
3. The team can reuse one language across transport, auth, packaging, and tests.

Suggested packages:

1. `@modelcontextprotocol/sdk` for MCP server primitives.
2. Native `fetch` or a thin HTTP client wrapper for Graph requests.
3. `zod` for config and tool schema validation.
4. `msal-node` for OAuth device code and authorization code token flows.

### Packaging Path

Ship two runtime forms from one codebase:

1. Local package
   - CLI entrypoint for stdio MCP execution by Claude/Codex hosts.
   - Configured through environment variables and a small JSON config file.
2. Hosted adapter
   - Same domain modules behind an HTTP bridge for environments that cannot run local stdio cleanly.
   - Hosted mode remains secondary until stdio is stable.

## Auth Model and Tenant Assumptions

### Initial Auth Model

Support delegated user auth first, not app-only auth.

1. Default flow: device code for local setup.
2. Secondary flow: authorization code for hosted environments if needed later.
3. Token refresh handled silently when refresh tokens are available.

### Tenant Assumptions

1. v1 targets one Microsoft Entra tenant connection at a time per configured MCP instance.
2. Each runtime instance acts on behalf of one signed-in user identity.
3. Tenant admins must pre-consent the minimal Graph scopes required for enabled tools.

### Minimum Graph Scopes by Domain

1. Mail: `Mail.Read`, `Mail.Send`, `Mail.ReadWrite` only if draft/update flows require it.
2. Calendar: `Calendars.Read`, `Calendars.ReadWrite`.
3. Files: `Files.Read` for the initial read-only bundle, adding `Files.ReadWrite` only when file mutation paths are explicitly enabled; `Sites.Read.All` or `Sites.ReadWrite.All` only when SharePoint access is explicitly enabled.
4. People: `User.Read`, `People.Read`.

Scope requests must be capability-driven so disabled domains do not request unnecessary access.

## Runtime and Deployment Constraints

1. Default deployment target is local stdio execution with no external database dependency.
2. Secrets must live in OS keychain or adapter-managed secret storage, not in repo files.
3. Request logging must redact tokens, message bodies, and file contents by default.
4. Graph throttling must produce retryable MCP errors with backoff guidance.
5. Large file transfers should use bounded streaming or chunked upload logic; do not load arbitrary file sizes into memory.
6. Timeouts must be explicit at the Graph client boundary.

## MCP Tool Contract

Each tool should follow the same contract shape:

1. Clear user-intent naming such as `mail_send`, `calendar_create_event`, `files_read`.
2. JSON-schema validated inputs.
3. Deterministic structured outputs with IDs, URLs, timestamps, and summary fields.
4. Error mapping into:
   - authentication_required
   - authorization_denied
   - not_found
   - validation_error
   - rate_limited
   - transient_upstream_error

Tool descriptions must state side effects, required scopes, and notable limits.

## Milestones and Exit Criteria

### Milestone 1: Architecture and Contract

Exit criteria:

1. Capability list, non-goals, auth model, and packaging path documented.
2. Tool naming conventions and output/error contract agreed.
3. Downstream tasks can implement against this spec without re-opening scope.

### Milestone 2: Identity and Graph Foundations

Exit criteria:

1. OAuth flow completes against a test tenant.
2. Token cache/refresh works across repeated sessions.
3. Shared Graph client handles auth headers, retries, paging, and redaction-safe logging.

### Milestone 3: First Capability Slice

Exit criteria:

1. At least one read path and one write path are live end-to-end.
2. Tool schemas are stable and covered by integration tests.
3. Errors surface as MCP-friendly structured failures.

### Milestone 4: Expanded Productivity Set

Exit criteria:

1. Mail, calendar, files, and people tools all have a minimum viable path.
2. Capability flags can disable domains cleanly.
3. Permission prompts stay aligned with enabled domains.

### Milestone 5: Integration and Release Readiness

Exit criteria:

1. Claude and Codex can both execute the server via the supported packaging path.
2. Setup documentation is complete for a new tenant/user.
3. Smoke tests validate auth, one read operation, and one mutating operation per enabled domain.

## Downstream Task Contract

This architecture sets the handoff for the queued child issues:

1. `MSM-4` should implement the auth/session layer and Graph client foundation.
2. `MSM-5` should deliver the first user-facing capability slice on top of that foundation.
3. `MSM-6` should validate host integration, docs, smoke coverage, and release readiness.
4. `MSM-7` remains the staffing and interview-loop track for hiring the engineer who can accelerate the implementation plan.

## Immediate Recommendation

Start with delegated auth plus local stdio packaging, then build mail/calendar/file capabilities on one shared Graph client. Keep hosted deployment and broader Microsoft workload coverage out of scope until the local MCP loop is stable.
