# MSM-15 QA Smoke Matrix and Claude/Codex Parity Runbook

## Purpose

Turn the release-readiness requirements from `docs/msm-6-integration-and-release-readiness.md` and `docs/msm-8-engineering-org-and-delivery-plan.md` into one repeatable QA gate for pilot candidates.

QA owns validation evidence, smoke execution, parity assessment, regression control, and release recommendation. QA does not own product implementation. If a candidate is missing behavior, packaging, setup, or logging required by this runbook, route the defect to engineering through the CTO and keep the candidate in `blocked` or `fail`.

## Candidate Intake Requirements

Engineering must hand QA a pull-request-based candidate. Do not validate ad hoc local changes and never sign off on a direct push to `main`.

Required intake for every candidate:

1. Candidate PR link, source branch, and commit SHA.
2. Exact stdio MCP launch command for the candidate build.
3. Exact environment-variable contract used by both Claude and Codex.
4. Enabled capability set for the candidate.
5. Test tenant and operator identity to use for validation.
6. Safe verification target for the mutating path:
   - mail path: dedicated inbox/recipient
   - calendar path: dedicated test calendar or event namespace
7. Known limitations, waived scope, and required manual setup steps.

If any intake item is missing, mark the validation run `blocked` and return the gap to engineering through the CTO.

## Shared Host Contract

Claude and Codex must be validated against one shared contract:

1. Same candidate build or package output.
2. Same stdio launch command.
3. Same environment variables.
4. Same enabled capability set.
5. Same test tenant and operator.

Minimum environment contract from the current repo:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_AUTH_FLOW=device_code`
- `MICROSOFT_GRAPH_BASE_URL`
- `MICROSOFT_GRAPH_SCOPES`
- `MICROSOFT_ENABLED_CAPABILITIES`
- `MICROSOFT_ALLOWED_SHAREPOINT_SITES`
- `MICROSOFT_HTTP_TIMEOUT_MS`
- `MICROSOFT_MAX_RETRIES`
- `MICROSOFT_RETRY_BASE_DELAY_MS`

Current repo gap:

The repository defines configuration and capability contracts, but it does not yet define a packaged stdio MCP server command or a QA smoke harness. Engineering must supply the exact candidate launch command and setup notes before a host-integrated validation run can move from `blocked` to executable.

## Smoke Matrix

Use `Pass`, `Fail`, `Blocked`, or `Not in scope` for every row.

| ID | Gate | Host Coverage | Procedure | Evidence | Release Impact |
| --- | --- | --- | --- | --- | --- |
| `SMK-01` | Static gate | Shared | Run `npm run check` on the candidate branch/commit. | Command output and commit SHA. | `Fail` blocks signoff. |
| `SMK-02` | Clean-environment auth | Shared | From a clean operator environment, start the candidate with device-code auth and complete one successful tenant-backed sign-in. | Device-code prompt capture, successful session evidence, sanitized logs. | `Fail` or `Blocked` blocks signoff. |
| `SMK-03` | Tool inventory parity | Claude and Codex | Confirm both hosts expose the same tool inventory for the candidate capability set and that it matches the manifest. | Host screenshots or transcript snippets plus manifest comparison. | `Fail` blocks signoff. |
| `SMK-04` | Required read-path smoke | Claude and Codex | Execute `mail_list_messages` with safe bounded inputs and confirm message shape includes sender, subject, received time, and message id/web link. | Sanitized response samples from both hosts. | `Fail` blocks signoff. |
| `SMK-05` | Required mutating-path smoke | Claude and Codex | Execute one mutating validation for either `mail_send` or `calendar_create_event`, then confirm the observable side effect. | Sanitized response sample plus inbox or calendar confirmation. | `Fail` blocks signoff. |
| `SMK-06` | Error normalization | Shared or controlled simulation | Exercise or simulate `authentication_required`, `authorization_denied`, `rate_limited`, and `transient_upstream_error` paths. | Error payloads showing normalized categories. | `Fail` blocks signoff. |
| `SMK-07` | Log redaction and audit markers | Shared | Review default logs from the mutating run. Confirm upstream mutation markers exist and tokens, message bodies, and file contents are not leaked. | Sanitized log excerpt. | `Fail` blocks signoff. |

## Execution Sequence

Run the gates in this order for every pilot candidate:

1. Confirm the candidate was delivered as a PR and identify the exact commit under test.
2. Record the engineering-supplied stdio command and env contract.
3. Run `SMK-01`.
4. Run `SMK-02`.
5. Launch the same candidate in Claude and Codex.
6. Run `SMK-03`, `SMK-04`, and `SMK-05` in both hosts.
7. Run or review `SMK-06`.
8. Review `SMK-07`.
9. Record overall release recommendation as `pass`, `fail`, or `blocked`.

Stop immediately and mark the candidate `blocked` when the same stdio command cannot be started in both hosts or when the environment contract differs between hosts.

## Claude/Codex Parity Procedure

Use the same prompt intent and the same test inputs in both hosts.

For each parity run, compare:

1. Tool inventory names and count against `src/capabilities/manifest.ts`.
2. Input validation behavior for the selected tool.
3. Response shape for successful read and mutating calls.
4. Error category mapping from the Graph client layer:
   - `authentication_required`
   - `authorization_denied`
   - `validation_error`
   - `not_found`
   - `rate_limited`
   - `transient_upstream_error`
5. Mutating-path audit behavior and redaction.

Parity verdicts:

- `Pass`: same behavior or only cosmetic host differences.
- `Fail`: host-specific tool mismatch, behavior drift, or redaction drift.
- `Blocked`: candidate cannot be launched the same way in both hosts.

## Regression Control Matrix

The minimum rerun set depends on the change surface in the candidate PR.

| Change Surface | Required QA Rerun |
| --- | --- |
| auth, config, token flow, scopes, retries, or logging | `SMK-01` through `SMK-07` |
| mail capability | `SMK-01`, `SMK-03`, `SMK-04`, and mutating rerun if `mail_send` is the chosen mutation |
| calendar capability | `SMK-01`, `SMK-03`, and mutating rerun if `calendar_create_event` is the chosen mutation |
| files capability | `SMK-01`, `SMK-03`, plus file-specific regression checklist review before pilot scope expansion |
| people capability | `SMK-01`, `SMK-03`, plus `people_search` regression review before pilot scope expansion |
| packaging or host integration | full Claude/Codex parity rerun |

Cross-domain regression checklist for pilot candidates:

1. Mail: `mail_list_messages` stays bounded and `mail_send` does not leak body content in logs.
2. Calendar: bounded list windows remain stable and created events reject invalid ranges cleanly.
3. Files: approved-drive/path rules remain enforced and ambiguous selectors are rejected.
4. People: underspecified queries are rejected and valid searches return stable contact metadata.
5. Cross-cutting: scope/config drift, expired-token handling, throttling, and authorization failures keep normalized error categories.

## Detailed Regression Checklist

Use this checklist during candidate validation and on any rerun triggered by the regression matrix above.

| ID | Area | Check | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| `REG-01` | Mail | Run `mail_list_messages` with bounded inputs. | Response stays bounded and includes sender, subject, received time, and message id/web link. | Sanitized response sample. |
| `REG-02` | Mail | If `mail_send` is in scope, send to the safe verification target. | Message is accepted or delivered and default logs do not expose body content. | Sanitized tool output, inbox confirmation, log excerpt. |
| `REG-03` | Calendar | If `calendar_list_events` is in scope, query a bounded window. | Response uses stable event metadata and respects the requested window. | Sanitized response sample. |
| `REG-04` | Calendar | If `calendar_create_event` is in scope, create one event and attempt one obvious bad range. | Valid event returns id/web link; invalid range is rejected with `validation_error`. | Sanitized tool output and calendar confirmation. |
| `REG-05` | Files | If `files_list_items` is in scope, query only approved drives or paths and try one ambiguous selector. | Approved location succeeds; ambiguous selector is rejected cleanly. | Sanitized response sample and error payload. |
| `REG-06` | Files | If `files_read` is in scope, read a bounded file and one large file case. | Small file stays within inline cap; large file falls back to a download link or bounded metadata response. | Sanitized response samples. |
| `REG-07` | People | If `people_search` is in scope, run one valid query and one underspecified query. | Valid query returns stable contact metadata; short query is rejected with `validation_error`. | Sanitized response sample and error payload. |
| `REG-08` | Cross-cutting auth | Exercise or simulate expired-token behavior. | Response category remains `authentication_required` or the documented normalized equivalent for token expiry. | Sanitized error payload or controlled simulation output. |
| `REG-09` | Cross-cutting authorization | Exercise a missing-scope or denied-access path. | Response category is `authorization_denied`. | Sanitized error payload. |
| `REG-10` | Cross-cutting throttling | Exercise or simulate rate limiting. | Response category is `rate_limited` with retry-safe behavior. | Sanitized error payload and retry notes. |
| `REG-11` | Cross-cutting config | Compare enabled capabilities, scopes, and allowlists against the candidate manifest and env contract. | No scope/config drift exists for the candidate capability set. | Config snapshot and comparison notes. |
| `REG-12` | Operator repeatability | Re-run setup from candidate instructions in a clean operator environment. | Candidate setup is repeatable for a second operator without undocumented steps. | Setup notes and sanitized screenshots or transcript snippets. |
| `REG-13` | Release control | Confirm the candidate came through a PR and record repo enforcement status. | Candidate is PR-based; if branch protection or required checks are absent, mark protected release gating as blocked on `MSM-13`. | PR link, branch/commit, repo-control notes. |

## Defect Triage Rules

QA owns the validation decision, not the fix.

Classify issues found during validation as follows:

- `Release blocker`: auth failure, parity mismatch, required smoke failure, log-redaction leak, missing PR-based delivery, missing shared stdio contract, or absent repo enforcement required for protected pilot gating.
- `Major`: regression outside the minimum owned smoke set but inside the candidate capability set.
- `Minor`: documentation or operator-experience issue with a clear workaround and no release-safety risk.

For every `Fail` or `Blocked` result:

1. Record the candidate PR, commit SHA, environment, host, and exact step that failed.
2. Attach sanitized evidence.
3. State expected behavior, actual behavior, and whether the issue is host-specific or shared.
4. Route implementation work back to engineering through the CTO.
5. Require a new PR-based candidate for revalidation. Do not accept direct fixes on `main`.

## Pilot Signoff Evidence Package

Before QA recommends a pilot candidate for CTO review, attach or link:

1. Candidate identity: PR link, source branch, commit SHA, and exact stdio launch command.
2. Shared host contract: the Claude/Codex environment-variable contract and enabled capability set.
3. Smoke evidence: results for `SMK-01` through `SMK-07` with sanitized output.
4. Regression evidence: completed `REG-01` through `REG-13` rows for the candidate scope.
5. Security status: auth, scope-fit, and default-log-redaction review outcome.
6. Defect log: every open fail or blocked item with owner routing back to engineering through the CTO.
7. Release-control status: whether branch protection and required checks are active, or whether protected gating remains blocked on `MSM-13`.

## Release Signoff Rules

QA recommendation levels:

- `Pass`: all required smoke rows pass and no open release blockers remain.
- `Fail`: at least one required row fails.
- `Blocked`: validation could not complete because the candidate, setup, or environment was incomplete.

Pilot signoff requires:

1. QA recommendation recorded against a PR-based candidate.
2. Security review of auth handling, scope fit, and default-log redaction.
3. CTO approval after QA and security evidence are complete.
4. Repo release controls from `MSM-13` are either active or explicitly called out as the reason protected pilot gating remains blocked.

QA may evaluate a candidate before branch protection or required checks are enforced, but QA must not describe that candidate as a protected release gate until those controls exist. If the controls are still missing, keep protected release signoff blocked on `MSM-13` even if the functional validation passes.
