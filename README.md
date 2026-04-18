# Microsoft 365 MCP Server

This workspace contains the initial architecture, auth foundation, and first capability contract for a Microsoft 365 MCP server that is intended to run in Claude and Codex workflows.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` into your environment and fill in the Microsoft Entra application values.
3. Use `MICROSOFT_AUTH_FLOW=device_code` for local interactive development; the server now persists a user-scoped MSAL token cache so silent refresh works across restarts.
4. Prefer `MICROSOFT_ENABLED_TOOLS` for least-privilege deployments when you do not want every tool in a capability domain.
5. Run `npm run check`, `npm test`, and `npm run build` before opening implementation or release-readiness reviews.

## Tool Surface

**Mail (5 tools)**

| Tool | Description | Risk |
|------|-------------|------|
| `mail_list_messages` | List recent inbox messages | Read-only |
| `mail_search` | Cross-folder search by query/filter/folder | Read-only |
| `mail_get_message` | Fetch full message body + optional attachment metadata | Read-only |
| `mail_draft_reply` | Create draft reply/replyAll/forward (never sends) | Mutating |
| `mail_update` | Mark read/unread, move, soft-delete, flag/unflag | Mutating |

**Calendar (4 tools)**

| Tool | Description | Risk |
|------|-------------|------|
| `calendar_list_events` | List events in a time window (max 31 days) | Read-only |
| `calendar_create_event` | Create solo events only (no attendees) | Mutating |
| `calendar_update_event` | Update or cancel events (SessionState-gated) | Mutating |
| `calendar_respond_event` | Accept/decline/tentatively accept invites (SessionState-gated) | Mutating |

**Files (2 tools)**

| Tool | Description | Risk |
|------|-------------|------|
| `files_list_items` | List OneDrive files and folders | Read-only |
| `files_read` | Read file metadata and bounded content | Read-only |

**People (1 tool)**

| Tool | Description | Risk |
|------|-------------|------|
| `people_search` | Search people relevant to the signed-in user | Read-only |

### Safety constraints

- **No outbound mail.** `mail_send` is intentionally excluded. Replies and forwards are draft-only.
- **No meeting invites.** `calendar_create_event` hard-codes `attendees: []`. Meetings with others must be created in Outlook directly.
- **SessionState enforcement.** `calendar_update_event` and `calendar_respond_event` reject event IDs not seen via `calendar_list_events` in the current session.
- **Soft delete only.** `mail_update` delete action moves to Deleted Items, never uses `permanentDelete`.

## Current Project Artifacts

1. `docs/microsoft-365-mcp-architecture.md` defines the architecture and milestones.
2. `docs/msm-4-auth-and-graph-foundation.md` defines auth, consent, and Graph client expectations.
3. `docs/msm-5-first-capability-set.md` defines the first shippable tool bundle.
4. `docs/msm-6-integration-and-release-readiness.md` defines QA gates, release criteria, and operator docs.
5. `docs/msm-7-founding-engineer-packet.md` defines the founding engineer hiring packet.
6. `docs/msm-8-engineering-org-and-delivery-plan.md` defines staffing order, GitHub guardrails, and delivery sequencing.
7. `docs/workbreakdown.md` tracks the mail/calendar tool surface rework (design locked).

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
