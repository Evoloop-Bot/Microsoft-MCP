# MSM-15 Pilot Candidate Validation Template

## Candidate

- Candidate PR:
- Branch:
- Commit SHA:
- Exact stdio launch command:
- Shared env contract reference:
- Enabled capability set:
- Validation date:
- QA owner:
- Engineering handoff owner:
- Security reviewer:
- CTO approver:

## Intake Check

Mark each row `Pass`, `Fail`, or `Blocked`.

| Item | Status | Notes |
| --- | --- | --- |
| PR-based candidate provided |  |  |
| Exact stdio launch command provided |  |  |
| Shared Claude/Codex env contract provided |  |  |
| Enabled capability set declared |  |  |
| Test tenant and operator provided |  |  |
| Safe mutating verification target provided |  |  |
| Known limitations and setup notes provided |  |  |
| Repo enforcement status from `MSM-13` recorded |  |  |

## Release Control Status

| Control | Status | Notes |
| --- | --- | --- |
| PR-based delivery confirmed |  |  |
| No direct push to `main` involved in candidate |  |  |
| Branch protection active for `main` |  |  |
| Required checks configured for `main` |  |  |
| Protected pilot gating blocked on `MSM-13` |  |  |

## Smoke Results

Use `Pass`, `Fail`, `Blocked`, or `Not in scope`.

| ID | Gate | Claude | Codex | Shared Notes | Evidence |
| --- | --- | --- | --- | --- | --- |
| `SMK-01` | `npm run check` | `n/a` | `n/a` |  |  |
| `SMK-02` | Clean-environment device-code auth |  |  |  |  |
| `SMK-03` | Tool inventory parity |  |  |  |  |
| `SMK-04` | `mail_list_messages` read-path smoke |  |  |  |  |
| `SMK-05` | Mutating-path smoke (`mail_send` or `calendar_create_event`) |  |  |  |  |
| `SMK-06` | Error normalization |  |  |  |  |
| `SMK-07` | Log redaction and audit markers |  |  |  |  |

## Regression Review

| Area | Status | Notes |
| --- | --- | --- |
| Mail |  |  |
| Calendar |  |  |
| Files |  |  |
| People |  |  |
| Cross-cutting auth/config/error handling |  |  |
| Packaging and host integration |  |  |

## Detailed Regression Checklist

Use `Pass`, `Fail`, `Blocked`, or `Not in scope`.

| ID | Check | Status | Notes | Evidence |
| --- | --- | --- | --- | --- |
| `REG-01` | `mail_list_messages` returns bounded inbox data with sender, subject, received time, and message id/web link. |  |  |  |
| `REG-02` | `mail_send`, if in scope, proves delivery or acceptance and keeps body content out of default logs. |  |  |  |
| `REG-03` | `calendar_list_events`, if in scope, respects bounded windows and stable event metadata. |  |  |  |
| `REG-04` | `calendar_create_event`, if in scope, returns event id/web link and rejects obvious bad ranges cleanly. |  |  |  |
| `REG-05` | `files_list_items`, if in scope, stays limited to approved drives or paths and rejects ambiguous selectors. |  |  |  |
| `REG-06` | `files_read`, if in scope, enforces bounded inline content and large-file fallback behavior. |  |  |  |
| `REG-07` | `people_search`, if in scope, rejects underspecified queries and returns stable contact metadata for valid searches. |  |  |  |
| `REG-08` | Expired-token behavior maps to the normalized auth error category. |  |  |  |
| `REG-09` | Authorization-denied behavior maps to `authorization_denied`. |  |  |  |
| `REG-10` | Throttling behavior maps to `rate_limited` with retry-safe behavior. |  |  |  |
| `REG-11` | Enabled capabilities, scopes, and allowlists stay aligned with the candidate manifest and env contract. |  |  |  |
| `REG-12` | Candidate setup is repeatable from a clean operator environment. |  |  |  |
| `REG-13` | Candidate is PR-based and repo-control gaps are explicitly tracked against `MSM-13`. |  |  |  |

## Defects and Blockers

List one row per issue.

| Severity | Status | Host | Summary | Route To | Tracking Link |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  | FoundingEngineer via CTO |  |

## QA Recommendation

- Overall result: `Pass` / `Fail` / `Blocked`
- Summary:
- Required follow-up:
- Revalidation scope:

## Evidence Attachments Required For CTO Review

- Smoke evidence bundle:
- Regression checklist evidence bundle:
- Security review link:
- Defect log or issue links:
- Repo enforcement status or `MSM-13` dependency note:

## Approvals

| Function | Status | Notes |
| --- | --- | --- |
| QA |  |  |
| Security |  |  |
| CTO |  |  |
