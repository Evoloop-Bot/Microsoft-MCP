# Phase 1 Smoke Intake Bundle — MSM-18

> **Status:** Structural bundle complete. Two items require external provisioning before QA can
> execute SMK-02 and SMK-05 (see [Provisioning Blockers](#provisioning-blockers) below).

---

## Candidate Identity

| Field | Value |
|---|---|
| Branch | `feat/msm-18-first-tenant-slice` |
| Commit SHA | `94cff49` |
| GitHub repo | `https://github.com/Evoloop-Bot/Microsoft-MCP` |
| Candidate delivery | PR-based — branch off `main`, open a PR before QA gate |

---

## Build and Launch Command

```bash
# From repo root — run once per environment
npm install
npm run build

# Stdio MCP server launch (Claude and Codex both use this command)
node dist/server.js
```

All configuration is loaded from environment variables at startup (no flags). Supply the env
contract below before running. All log output goes to **stderr**; stdio transport carries only MCP
protocol messages.

---

## Shared Environment Contract

Claude and Codex must use the **same** values for every variable below.

```bash
# ── Required ───────────────────────────────────────────────────────────────────
MICROSOFT_CLIENT_ID=<test-tenant-client-id>   # ← REQUIRES PROVISIONING (see below)
MICROSOFT_TENANT_ID=<test-tenant-id>          # ← REQUIRES PROVISIONING (see below)

# ── Auth ───────────────────────────────────────────────────────────────────────
# device_code is the only supported flow for this pilot; do not change this.
MICROSOFT_AUTH_FLOW=device_code

# ── Capabilities ───────────────────────────────────────────────────────────────
# Enable all four domains so SMK-03 tool-inventory parity covers the full set.
MICROSOFT_ENABLED_CAPABILITIES=mail,calendar,files,people

# ── Graph API ──────────────────────────────────────────────────────────────────
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
# Explicit scope list — must be admin-consented in the test tenant app registration.
MICROSOFT_GRAPH_SCOPES=User.Read,Mail.Read,Mail.Send,Calendars.Read,Calendars.ReadWrite,Files.Read,People.Read

# ── HTTP tuning (defaults; do not change for Phase 1 smoke) ────────────────────
MICROSOFT_HTTP_TIMEOUT_MS=15000
MICROSOFT_MAX_RETRIES=3
MICROSOFT_RETRY_BASE_DELAY_MS=500
```

**How to supply env vars:** Copy `.env.example` to `.env` in the repo root, fill in the two
provisioned values, and source it before launch (`export $(grep -v '^#' .env | xargs)`), or pass
vars directly in the host's MCP server config block.

---

## Auth Flow — Device Code

Auth flow: **`device_code`** (only supported flow for this pilot — enforced in `src/config.ts:7`).

Operator steps for SMK-02:
1. Set the env vars and run `node dist/server.js`.
2. The server prints a device-code URL and one-time code to **stderr** before the MCP handshake completes.
3. Open the URL in any browser, enter the code, and sign in with the test-tenant operator account.
4. Once sign-in is confirmed the server prints `microsoft-365-mcp ready on stdio` and is active.
5. Tokens are held **in memory only** — re-auth is required on each server restart. This is
   intentional: no credentials are written to disk.

---

## Enabled Capability Set and Tool Inventory

All four domains are enabled for Phase 1 smoke. SMK-03 must confirm all seven tools appear in
both Claude and Codex hosts.

| Tool | Domain | Type | Required scope |
|---|---|---|---|
| `mail_list_messages` | mail | read-only | `Mail.Read` |
| `mail_send` | mail | mutating | `Mail.Send` |
| `calendar_list_events` | calendar | read-only | `Calendars.Read` |
| `calendar_create_event` | calendar | mutating | `Calendars.ReadWrite` |
| `files_list_items` | files | read-only | `Files.Read` |
| `files_read` | files | read-only | `Files.Read` |
| `people_search` | people | read-only | `People.Read` |

Tool inventory source of truth: `src/capabilities/manifest.ts`.

**Note on mutating tools:** `mail_send` and `calendar_create_event` are registered when the
`mail` and `calendar` capabilities are enabled (which they are in this contract). SMK-05 should
use one of these two tools. See the SMK-05 entry below for both options.

---

## Safe Mutating Verification Target

### Option A — `mail_send` (requires provisioning)

A dedicated test mailbox must be provisioned on the test tenant. Recommended address:

```
msm-smoke-test@<test-tenant-domain>.onmicrosoft.com
```

This mailbox receives the SMK-05 `mail_send` call. It is isolated from any real users and can be
inspected after the smoke run to confirm delivery.

**Status:** Requires provisioning (see below).

### Option B — `calendar_create_event` (no additional mailbox required)

Use the signed-in test-tenant operator's own calendar. SMK-05 creates one test event and confirms
the returned `id` and `webLink`. No external recipient is needed.

**Recommended for Phase 1 smoke** if the dedicated mailbox is not yet provisioned: use
`calendar_create_event` as the mutating gate so QA is not blocked on the mailbox.

---

## SMK-01 Through SMK-07 Execution Notes

### SMK-01 — Static gate (shared)

```bash
npm run check
```

Expected: exits `0`, zero TypeScript errors. Branch `94cff49` passes. Evidence: record command
output and the commit SHA.

### SMK-02 — Clean-environment device-code auth (shared)

1. On a clean machine (no prior MSAL token cache): set all env vars, run `node dist/server.js`.
2. Observe the device-code prompt on stderr.
3. Complete browser auth with the test-tenant operator account.
4. Confirm `microsoft-365-mcp ready on stdio` appears on stderr and no auth errors follow.
5. Evidence: sanitized stderr capture (redact the `code` value itself, keep the URL domain).

### SMK-03 — Tool inventory parity (Claude + Codex)

Confirm the MCP tool list returned by both hosts matches the seven tools in the table above.
Compare against `src/capabilities/manifest.ts`.

Evidence: host screenshots or transcript snippets showing tool names + manifest comparison note.

### SMK-04 — Read-path smoke (Claude + Codex)

```
Tool:  mail_list_messages
Input: { "top": 5 }
Expected: array of messages with id, subject, from, receivedDateTime, webLink
```

Evidence: sanitized response sample from both hosts (redact email addresses if needed).

### SMK-05 — Mutating-path smoke (Claude + Codex)

**Preferred (Option B, no mailbox needed):**

```
Tool:  calendar_create_event
Input: {
  "subject": "SMK-05 Phase 1 smoke test",
  "start": "<tomorrow T10:00:00Z>",
  "end":   "<tomorrow T11:00:00Z>"
}
Expected: { id: "<uuid>", webLink: "https://outlook.office365.com/..." }
```

**Alternative (Option A, requires test mailbox):**

```
Tool:  mail_send
Input: {
  "to": ["msm-smoke-test@<test-tenant-domain>.onmicrosoft.com"],
  "subject": "SMK-05 Phase 1 smoke test",
  "bodyText": "Phase 1 mutating smoke validation."
}
Expected: { accepted: true, sentAt: "<iso timestamp>" }
```

Evidence: sanitized tool output + calendar event confirmation or inbox delivery confirmation.
Confirm email body is **not** present in default stderr logs.

### SMK-06 — Error normalization (shared or controlled simulation)

Simulate or exercise the following error paths and confirm normalized category labels:

| Scenario | Expected category |
|---|---|
| Expired or missing token | `authentication_required` |
| Missing scope or denied access | `authorization_denied` |
| Graph 429 throttle response | `rate_limited` |
| Graph 5xx transient | `transient_upstream_error` |

Easiest simulation: temporarily revoke consent in the Entra app registration and retry a tool
call.

Evidence: error response payloads showing the normalized `code` field.

### SMK-07 — Log redaction and audit markers (shared)

Review the stderr output from the SMK-05 mutating run. Confirm:
- No `Authorization: Bearer ...` tokens visible in any log line.
- No email body or subject content in log output.
- Mutating tool calls emit an audit marker (look for `mutating: true` in the structured log
  object emitted by `logToolCall`).

Evidence: sanitized log excerpt from the mutating run.

---

## Known Limitations and Pilot Notes

1. **No token persistence.** Re-auth is required on every server restart. This is by design for
   the pilot; persistent token storage is a post-pilot concern.
2. **Files capability scoped to signed-in user's OneDrive only.** SharePoint drive access requires
   an allowlist not yet implemented. Do not test SharePoint paths in Phase 1.
3. **No multi-tenant or app-only flows.** Only delegated single-tenant device-code auth is
   supported in this pilot slice.
4. **Codex stdio wiring.** If Codex cannot launch via `node dist/server.js` directly, wrap with
   `npx tsx src/server.ts` for development-only runs (requires `tsx` devDependency, already
   present). For CI/release use `node dist/server.js` only.

---

## Provisioning Blockers

The following two items must be supplied before QA can execute SMK-02 and beyond. Engineering is
escalating to the CTO for provisioning.

### 1. Microsoft Entra Test Tenant and App Registration

**What is needed:**
- A Microsoft 365 developer sandbox tenant (free via [Microsoft 365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)).
- An **Entra application registration** in that tenant with:
  - Public client / native app flows enabled.
  - Admin consent granted for these scopes: `User.Read`, `Mail.Read`, `Mail.Send`,
    `Calendars.Read`, `Calendars.ReadWrite`, `Files.Read`, `People.Read`.
  - At least one test-user account with an active mailbox and calendar.

**Values to hand off to QA:**
- `MICROSOFT_CLIENT_ID` — the Application (client) ID from the app registration.
- `MICROSOFT_TENANT_ID` — the Directory (tenant) ID from the Entra tenant overview.

**Secure handoff path:** Share these values via an internal credential store or a private message
to QAEngineer — do **not** commit them to the repo or post them in plain text in issue comments.

### 2. Safe `mail_send` Target (Optional — use `calendar_create_event` if not yet available)

**What is needed:**
- A dedicated test mailbox on the same test tenant: e.g., `msm-smoke-test@<tenant>.onmicrosoft.com`.
- The mailbox must be inspectable by QAEngineer to confirm delivery.

**Workaround:** QA may use `calendar_create_event` (Option B above) for SMK-05 and defer
the `mail_send` target to a follow-up run once the mailbox is provisioned.
