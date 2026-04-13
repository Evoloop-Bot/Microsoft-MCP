# MSM-8 Engineering Org and Delivery Plan

## Objective

Turn the existing Microsoft 365 MCP architecture work into an executable delivery program with explicit staffing, ownership boundaries, and GitHub operating rules.

## Team Shape

Stand up the team in this order:

1. Founding software engineer
2. QA engineer
3. Security engineer (red team)

### Founding Software Engineer

Primary mission:

1. Own day-to-day implementation of the Node.js/TypeScript MCP server.
2. Ship the first tenant-backed end-to-end path on top of the existing auth and capability plans.
3. Keep Claude and Codex behavior aligned through one tool contract and one packaging path.

Initial ownership:

1. `src/auth/*`
2. `src/graph/*`
3. `src/capabilities/*`
4. local packaging, setup, and smoke-test wiring

### QA Engineer

Primary mission:

1. Build the release test plan before the pilot expands beyond founder-only usage.
2. Convert the release-readiness checklist into repeatable validation.
3. Gate merges to `main` on typecheck, smoke coverage, and host-integration verification.

Initial ownership:

1. tenant-backed smoke matrix
2. Claude/Codex parity checks
3. regression checklist for mail, calendar, files, and people flows
4. release signoff for pilot candidates

Operational handoff from CTO:

1. QA is the DRI for release evidence once engineering has a candidate slice to validate.
2. The minimum owned smoke set is device-code auth plus `mail_list_messages` and one mutating path from `mail_send` or `calendar_create_event`.
3. QA decides pass, fail, or blocked for pilot-candidate validation; CTO keeps final go/no-go authority.
4. Founding engineering remains responsible for fixing product defects and supplying reproducible setup for QA runs.

### Security Engineer (Red Team)

Primary mission:

1. Review auth, consent, secret handling, and log redaction before pilot rollout.
2. Simulate misuse and over-scoping paths against the Graph integration.
3. Define required guardrails for branch protection, secret storage, and auditability.

Initial ownership:

1. Entra app and scope review
2. token handling and storage review
3. SharePoint and file-access abuse scenarios
4. release-blocking security findings for pilot approval

## Delivery Workstreams

### Workstream 1: Repository and GitHub Guardrails

Exit criteria:

1. Project is connected to a GitHub repository named `Microsoft-MCP`.
2. Agents work only on short-lived branches and open pull requests into `main`.
3. Direct pushes to `main` are blocked with branch protection.
4. Required checks include typecheck plus the minimum smoke suite once QA lands it.

Operating rules:

1. `main` is protected and never used for direct agent commits.
2. Every change starts from a feature branch named after the issue or workstream.
3. Pull requests require at least one reviewer once additional engineers exist.
4. Security-sensitive changes touching auth, scopes, or logging require security review.

### Workstream 2: Core Product Delivery

Sequence the implementation against the existing technical docs:

1. Auth and Graph foundation from `docs/msm-4-auth-and-graph-foundation.md`
2. First capability bundle from `docs/msm-5-first-capability-set.md`
3. Claude/Codex release readiness from `docs/msm-6-integration-and-release-readiness.md`

Exit criteria:

1. One tenant-backed auth flow works reliably.
2. At least one read tool and one mutating tool succeed end to end.
3. The same server package runs in both Claude and Codex.

### Workstream 3: Quality and Release Control

Exit criteria:

1. `npm run check` is required on every pull request.
2. Smoke tests cover auth plus at least one read and one mutating path.
3. Pilot runbooks, rollback steps, and troubleshooting notes are owned and current.

Release-gating ownership:

1. QA owns the smoke matrix, host-parity runbook, and regression checklist.
2. Security owns auth, scope, and log-redaction review for pilot candidates.
3. CTO is the final approver after QA and security evidence are complete.

### Workstream 4: Security and Red-Team Readiness

Exit criteria:

1. Requested Graph scopes match enabled capabilities.
2. Tokens, message content, and file contents stay redacted from default logs.
3. The pilot has a documented security review signoff path.

## Staffing Sequence and Handoffs

### Phase 0: Immediate

1. CEO provisions the GitHub repository/workspace and branch protections.
2. CEO creates the founding software engineer hire.
3. CTO hands the engineer the architecture and capability docs already in this repo.

### Phase 1: Build

1. Founding engineer implements the first end-to-end tenant-backed slice.
2. CTO reviews architecture drift and keeps milestone scope narrow.
3. QA role is hired before the first pilot candidate is declared ready.

### Phase 2: Hardening

1. QA converts the release checklist into repeatable validation.
2. Security engineer runs red-team review against auth, logging, and scope handling.
3. CTO approves the pilot only after QA and security signoff are in place.
4. Founding engineer supports QA with reproducible setup, seeded validation scenarios, and defect turnaround.

## Milestone Plan

### Milestone A: Team and Repo Setup

1. GitHub repository exists and project workspace points at it.
2. Protected-branch rules are active for `main`.
3. Founding engineer hire is active.

### Milestone B: First Executable Slice

1. Auth bootstrap works against a real tenant.
2. One read tool and one mutating tool are live behind the MCP server.
3. PR-based delivery workflow is active.

### Milestone C: Pilot Readiness

1. QA smoke suite and release checklist are running.
2. Security review is completed with tracked remediations.
3. Claude and Codex both pass the pilot acceptance path.

## Immediate Blockers

The current workspace is not connected to a Git repository, so the GitHub requirement and protected-branch rule cannot be enforced from inside this task alone.

The CTO agent also does not have agent-creation permission, so the actual hiring actions must be executed by the CEO or board.
