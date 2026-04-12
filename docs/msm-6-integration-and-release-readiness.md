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

## QA Ownership and Evidence

The QA function owns release evidence for pilot candidates. Engineering can build harnesses or fixtures, but QA is the release gate for whether the evidence is complete and believable.

1. Tenant-backed auth smoke ownership sits with QA for one clean-environment device-code run.
2. The required read-path smoke must exercise `mail_list_messages` because it is the narrowest user-facing phase-1 validation target in the current manifest.
3. The required mutating-path smoke must exercise either `mail_send` or `calendar_create_event` with an observable side effect and log-redaction review.
4. QA owns Claude/Codex parity validation against the same stdio command, package build, and environment-variable contract.
5. QA publishes a release recommendation that is explicit about pass, fail, or blocked status for every pilot candidate.

## Claude and Codex Parity Checks

QA should run the same candidate build through both hosts and compare behavior against one shared contract.

1. Start the same stdio MCP entrypoint in Claude and Codex with the same environment variables and enabled capability set.
2. Confirm the exposed tool inventory matches the current manifest for mail, calendar, files, and people domains.
3. Execute the auth smoke plus the selected read and mutating validations in both hosts.
4. Compare normalized error categories, required scope failures, and retry-safe behavior across both hosts.
5. Verify mutating calls emit audit-friendly markers without leaking tokens, message bodies, or file contents.

## Regression Checklist

Every pilot-candidate release needs a QA checklist that covers cross-domain regressions, even when the implementation remains intentionally narrow.

### Mail

1. `mail_list_messages` returns bounded inbox data with sender, subject, received time, and message id.
2. `mail_send` proves delivery or acceptance using a safe verification inbox and confirms body content is not leaked in default logs.

### Calendar

1. `calendar_list_events` respects bounded time windows and returns stable event metadata.
2. `calendar_create_event` confirms the created event link/id and validates that obvious bad ranges are rejected cleanly.

### Files

1. `files_list_items` is limited to approved drives or paths and rejects ambiguous item selectors.
2. `files_read`, when enabled for a candidate, enforces bounded inline content and falls back to download links for larger files.

### People

1. `people_search` rejects underspecified queries and returns stable contact metadata for valid searches.

### Cross-cutting

1. Auth-required, expired-token, throttling, and authorization-denied paths map to normalized error categories.
2. Capability and scope configuration stays aligned with the enabled manifest.
3. Operator setup steps are repeatable for a second user on a clean environment.

## Pilot Release Signoff

The pilot signoff path must be explicit before a candidate is called release-ready.

1. Engineering proposes a candidate with the exact branch, commit, or pull request under review plus setup notes for QA.
2. QA records `npm run check`, tenant-backed auth smoke, one read-path smoke, one mutating-path smoke, and host-parity results.
3. Security signs off on auth handling, scope fit, and default-log redaction before pilot approval.
4. CTO approves the candidate only after QA and security evidence both pass or explicitly waive non-blocking items.
5. If branch protection or required-check enforcement is unavailable, the release can be evaluated but not treated as a protected pilot gate.

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
