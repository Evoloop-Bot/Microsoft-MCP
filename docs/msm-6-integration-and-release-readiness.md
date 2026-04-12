# MSM-6 Integration and Release Readiness

## Claude and Codex Workflow Model

Use one codebase with a stdio-first MCP entrypoint. Both Claude and Codex should connect to the same tool contract and config surface rather than maintaining client-specific behavior.

### Claude

1. Register the local MCP server package/command in the Claude host configuration.
2. Provide environment variables through the host's secure env mechanism.
3. Exercise read-only tools first before enabling mutating scopes.

### Codex

1. Register the same stdio package/command in the Codex MCP configuration path.
2. Reuse the same environment-variable contract as Claude.
3. Validate identical request/response behavior for the same tool inputs.

## Local Development and Packaging Requirements

1. Node.js LTS runtime.
2. TypeScript build and type-check commands.
3. `.env.example` as the canonical local config reference.
4. Device-code auth for day-one developer setup.
5. A future package/bin entrypoint that wraps the server in a host-friendly command.

## QA Gates for Initial Pilot

The pilot should not ship until all of the following are true:

1. `npm run check` passes.
2. One tenant-backed auth smoke test succeeds from a clean environment.
3. One read-only tool from phase 1 succeeds in both Claude and Codex.
4. One mutating tool succeeds with obvious side-effect confirmation and log redaction.
5. Rate-limit and expired-token paths are exercised at least once in test coverage or a controlled simulation.
6. Error responses preserve the normalized categories from the Graph client layer.

## Observability Requirements

1. Log request IDs, tool names, domain, latency, and retry count.
2. Never log access tokens, raw message bodies, or file contents by default.
3. Emit a clear marker when a tool call mutates upstream state.
4. Capture configuration warnings when enabled capabilities and requested scopes drift out of alignment.

## Release Criteria

An internal pilot is ready when:

1. Setup documentation works for a second operator, not just the original author.
2. Tenant consent steps are documented and repeatable.
3. Rollback is defined as removing the MCP registration and revoking the Entra app/user session if needed.
4. Open compliance questions for SharePoint scope breadth and log retention have named owners.

## Required Documentation Set

1. Local setup guide.
2. Tenant consent guide.
3. Tool catalog with side effects and required scopes.
4. Troubleshooting guide for auth, throttling, and mis-scoped permissions.
5. Pilot runbook with success criteria and rollback steps.
