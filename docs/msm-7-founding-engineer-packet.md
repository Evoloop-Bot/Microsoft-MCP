# MSM-7 Founding Engineer Hiring Packet

## Role Scope

Hire a founding engineer who can turn the Microsoft 365 MCP architecture into a working pilot while operating comfortably across product ambiguity, platform integration, and early customer feedback loops.

The role owns:

1. Building the first MCP server implementation on top of the architecture and auth foundations.
2. Shipping the initial Microsoft 365 tool bundle across mail, calendar, files, and people lookup.
3. Hardening local developer experience, observability, and release-readiness for Claude and Codex hosts.
4. Working directly with the CTO on tradeoffs around Graph permissions, host integration, and pilot scope.

## Candidate Profile

### Must-Haves

1. Strong TypeScript or similarly rigorous backend engineering experience.
2. Experience integrating with third-party APIs that require OAuth, retries, pagination, and operational safeguards.
3. Comfort owning ambiguous zero-to-one product surfaces without waiting for exhaustive specs.
4. Ability to design clean tool or API contracts and evolve them carefully.
5. Evidence of pragmatic shipping in a small team or early-stage environment.

### Nice-to-Haves

1. Experience with MCP, agent tooling, or developer platform products.
2. Prior Microsoft Graph, Microsoft 365, or enterprise SaaS integration work.
3. Familiarity with security-sensitive products, auditability, and permission scoping.
4. Experience writing internal docs and build/runbooks while shipping code.

## Scorecard

Score each category from 1 to 4. A hire-ready candidate should average at least 3 with no category below 2 on the must-have dimensions.

### 1. Technical Execution

Looks for:

1. Can decompose architecture into reliable implementation slices.
2. Understands auth/session management, retries, paging, and error boundaries.
3. Writes maintainable code under evolving requirements.

Strong signal:

1. Proposes a sensible implementation order for the MCP server without overbuilding.

Weak signal:

1. Jumps into features without addressing auth, interfaces, or operational constraints.

### 2. Product Judgment

Looks for:

1. Can narrow scope to the smallest useful pilot.
2. Understands how host UX and user intent shape tool design.
3. Makes credible tradeoffs between speed and safety.

Strong signal:

1. Explicitly identifies what to defer from v1 and why.

Weak signal:

1. Treats every possible Microsoft 365 feature as day-one scope.

### 3. Systems and Integration Thinking

Looks for:

1. Understands client/server boundaries and host integration requirements.
2. Can reason about config, packaging, observability, and rollback.
3. Communicates failure modes clearly.

Strong signal:

1. Describes how the same server should behave consistently in Claude and Codex.

Weak signal:

1. Focuses only on happy-path API calls.

### 4. Ownership and Operating Style

Looks for:

1. Moves work forward without heavy process overhead.
2. Documents decisions and leaves clean handoffs.
3. Handles ambiguity without becoming vague.

Strong signal:

1. Has examples of driving an initiative from prototype to first production users.

Weak signal:

1. Needs tightly pre-scoped tasks before making progress.

## Interview Loop

### Stage 1: CTO Screen

Owner: CTO

Goal:

1. Validate startup fit, communication quality, and product judgment.

Pass signals:

1. Candidate has shipped under ambiguity.
2. Candidate can explain when to narrow scope.
3. Candidate shows strong ownership instincts.

Fail signals:

1. Candidate is rigid, process-bound, or weak on decision-making under uncertainty.

### Stage 2: Technical Deep Dive

Owner: CTO

Goal:

1. Evaluate API integration, auth, systems thinking, and architecture decomposition.

Exercise:

1. Walk through how they would build the Microsoft 365 MCP pilot from the current architecture.

Pass signals:

1. Sensible sequencing from auth foundations to tool delivery to release gates.
2. Good reasoning about OAuth, retries, pagination, rate limits, and observability.

Fail signals:

1. Misses obvious enterprise integration risks or cannot structure the implementation plan.

### Stage 3: Practical Working Session

Owner: CTO

Goal:

1. Observe how the candidate works through a realistic implementation slice.

Exercise:

1. Design and sketch a tool contract for one mail or calendar capability, including inputs, outputs, scopes, and error handling.

Pass signals:

1. Makes interfaces concrete.
2. Accounts for edge cases and side effects.
3. Balances speed with correctness.

Fail signals:

1. Produces hand-wavy contracts or ignores validation and operational details.

### Stage 4: Founder/CEO Conversation

Owner: CEO

Goal:

1. Confirm company-building fit, communication style, and appetite for early-stage ownership.

Pass signals:

1. Candidate is energized by building with constrained resources and direct customer feedback.

Fail signals:

1. Candidate expects a mature organization with narrow execution scope only.

## Reference Questions

Ask references:

1. Did this person increase leverage in ambiguous environments?
2. How strong were they at converting architecture into shipped product?
3. How did they handle operational issues, bugs, or customer-facing failure modes?
4. Would you trust them as one of the first engineers in a company?

## 30/60/90 Day Plan

### First 30 Days

1. Set up the Microsoft 365 MCP workspace locally.
2. Validate device-code auth against a tenant.
3. Build and land the first read-only capability slice.
4. Tighten docs and setup reliability for a second operator.

### First 60 Days

1. Ship the initial mutating tools for mail send and event creation.
2. Add observability, better error mapping, and smoke coverage.
3. Run the first internal pilot across Claude and Codex.
4. Resolve the main scope/compliance questions around SharePoint access and logs.

### First 90 Days

1. Stabilize the pilot based on user feedback.
2. Improve packaging and host ergonomics.
3. Establish a repeatable release process and ownership boundaries for future contributors.
4. Help interview and onboard the next engineering hire if the pilot proves demand.
