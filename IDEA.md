Below is a **tight, opinionated PRD** for this mini-project. It’s written as something you could actually hand to yourself (or another senior engineer) and build from without bikeshedding.

---

# PRD: Sprite Orchestrator (Mini)

## Summary

A minimal, declarative orchestration service that triggers **pre-created Sprites** in response to **external events** (initially GitHub webhooks and cron). Users define automations as small YAML files describing **when** something happens and **what command** should run inside a Sprite.

The orchestrator itself never executes code or touches repositories. It only evaluates rules and dispatches commands to Sprites.

---

## Goals

* Make it trivial to say:
  **“When X happens, run this command in that Sprite.”**
* Keep infrastructure minimal (single serverless service).
* Be event-source agnostic (GitHub today, others later).
* Avoid workflow engines, DAGs, or step abstractions.
* Optimize for clarity, safety, and debuggability over flexibility.

---

## Non-Goals

* Replacing GitHub Actions.
* Multi-step workflows, artifacts, or job dependencies.
* Managing secrets inside Sprites beyond passing env vars.
* Fine-grained scheduling or retries.
* Interactive agent UIs or dashboards.

---

## Users

* Individual engineers or small teams running AI agents against repos.
* Early adopters building PR bots, maintenance bots, or on-demand code agents.
* People who want persistent agent environments without owning infra.

---

## Core Concepts

### 1. Automation

A declarative YAML file describing:

* **Source**: what event triggers it (GitHub webhook or cron).
* **Match**: predicates that must hold for the automation to run.
* **Run**: which Sprite to execute and what shell command to run.

### 2. Sprite

A long-lived execution environment managed externally (Sprites.dev).

* Pre-created and identified by ID.
* Already authenticated and provisioned to act on repos.
* Executes arbitrary shell commands when invoked.

### 3. Orchestrator

A stateless service responsible for:

* Receiving events.
* Evaluating automations.
* Dispatching commands to Sprites.

---

## Functional Requirements

### Automation Definition

* Automations are defined as YAML files stored in a folder.
* Each file represents exactly one automation.
* Automations are loaded at deploy time (no dynamic discovery at runtime).

Required fields:

* `id`
* `source`
* `run`

Optional fields:

* `description`
* `match`

---

### Event Sources (v1)

#### GitHub Webhooks

* Supported events (initial):

  * `issue_comment`
  * `pull_request`
  * `pull_request_review`
* Supported actions:

  * `created`
  * `labeled`
  * `submitted`

#### Cron

* Cron expressions defined in automation YAML.
* Executed via platform scheduler (Cloudflare Workers cron).

---

### Matching Rules

Automations may specify zero or more match predicates. All predicates must pass.

Supported predicates (v1):

* Repository name
* Actor association (OWNER, MEMBER, COLLABORATOR)
* Comment body contains string
* Label equals string
* Pull-request context required
* Event not from fork

No regexes, no arbitrary expressions.

---

### Execution

* Each matched automation triggers exactly one Sprite execution.
* Execution consists of:

  * Resolving the Sprite ID
  * Rendering the shell command template
  * Calling the Sprites API to exec the command

The orchestrator does not:

* Inspect filesystem state
* Parse diffs
* Capture stdout/stderr (beyond logging failures)

---

### Template Variables

Shell commands support simple token replacement:

* `{{repo}}`
* `{{pr.number}}`
* `{{pr.head.ref}}`
* `{{comment.body}}`
* `{{sprite.workdir}}`

Only explicitly supported tokens are allowed.

---

### Idempotency

* GitHub webhooks are treated as at-least-once.
* Each delivery ID is processed once.
* Duplicate deliveries are ignored.

---

## Configuration

### Sprites Mapping

A single YAML file mapping repos to Sprite metadata.

```yaml
sprites:
  your-org/my-project:
    id: sprite_abc123
    workdir: /root/my-project
```

---

## Architecture

### Hosting

* Single Cloudflare Worker.
* No database required initially.
* Optional KV store for idempotency and config.

### Data Flow

1. Event received (webhook or cron).
2. Identify event source and context.
3. Load all automations.
4. Filter automations by source and match rules.
5. Dispatch execution requests to Sprites.
6. Return success immediately (fire-and-forget).

---

## Security Considerations

* Webhooks validated via HMAC.
* Automations can restrict actor association.
* Fork-originated events can be excluded.
* Sprite credentials scoped per repo.
* Orchestrator holds no long-lived repo credentials.

---

## UX / Developer Experience

* YAML is intentionally boring and explicit.
* One automation = one file.
* Failures are logged, not retried automatically.
* Behavior is understandable by reading a single YAML file.

---

## Success Metrics

* Time to first automation < 30 minutes.
* Adding a new automation requires no code changes.
* No accidental Sprite executions from unauthorized actors.
* Minimal operational burden (deploy once, forget).

---

## Future Extensions (Explicitly Out of Scope for v1)

* HTTP/manual triggers.
* Slack or Linear events.
* Automation grouping or composition.
* UI/dashboard.
* Execution status streaming.
* Multi-sprite fan-out.

---

## Open Questions

* Should automations be repo-local or centrally managed long-term?
* Do we need dry-run or “comment-only” modes baked in?
* How much execution metadata (if any) should be persisted?

---

If you want, next steps could be:

* a **one-page “Why this exists” doc**
* a **reference implementation plan (day-by-day)**
* or a **public-facing README** that explains this without leaking complexity

