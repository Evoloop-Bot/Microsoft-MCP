# Microsoft 365 MCP Server

This workspace contains the initial architecture, auth foundation, and first capability contract for a Microsoft 365 MCP server that is intended to run in Claude and Codex workflows.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` into your environment and fill in the Microsoft Entra application values.
3. Use `MICROSOFT_AUTH_FLOW=device_code` for local interactive development; the server now persists a user-scoped MSAL token cache so silent refresh works across restarts.
4. Prefer `MICROSOFT_ENABLED_TOOLS` for least-privilege deployments when you do not want every tool in a capability domain.
5. Run `npm run check`, `npm test`, and `npm run build` before opening implementation or release-readiness reviews.

## Current Project Artifacts

1. `docs/microsoft-365-mcp-architecture.md` defines the architecture and milestones.
2. `docs/msm-4-auth-and-graph-foundation.md` defines auth, consent, and Graph client expectations.
3. `docs/msm-5-first-capability-set.md` defines the first shippable tool bundle.
4. `docs/msm-6-integration-and-release-readiness.md` defines QA gates, release criteria, and operator docs.
5. `docs/msm-7-founding-engineer-packet.md` defines the founding engineer hiring packet.
6. `docs/msm-8-engineering-org-and-delivery-plan.md` defines staffing order, GitHub guardrails, and delivery sequencing.

## Pilot Readiness Scope

The first pilot should validate:

1. Claude and Codex can both start the server through the supported packaging path.
2. One delegated-auth flow succeeds against a real tenant.
3. At least one read tool and one mutating tool execute successfully with redaction-safe logs.
4. Setup and rollback instructions are complete enough for an internal operator.

## GitHub Workflow

- Repository: `https://github.com/Evoloop-Bot/Microsoft-MCP`
- `main` is reserved for pull-request merges only
- GitHub Actions runs `npm run check`, `npm test`, and `npm run build`
