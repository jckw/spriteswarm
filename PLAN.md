# Sprite Orchestrator - Technical Spec

## Overview

A long-running Node.js server (Fly.io) that receives webhooks and cron triggers, evaluates declarative automation rules, and dispatches shell commands to Sprites via the Sprites.dev API.

**Key difference from PRD**: More generic than originally scoped. Not GitHub-specific—supports pluggable webhook sources with source-specific payloads and JSONPath-based matching/templating.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  GitHub/etc     │────▶│  Fly.io (Node.js + Hono)            │
│  Webhooks       │     │                                     │
└─────────────────┘     │  ┌─────────────┐  ┌──────────────┐  │
                        │  │ Source      │  │ Automation   │  │
┌─────────────────┐     │  │ Adapters    │  │ Engine       │  │
│  Cron Triggers  │────▶│  │ (GitHub,...)│  │ (match/exec) │  │
└─────────────────┘     │  └─────────────┘  └──────────────┘  │
                        │           │               │         │
                        │           ▼               ▼         │
                        │  ┌─────────────────────────────┐    │
                        │  │     Cloudflare KV           │    │
                        │  │  (automations + config)     │    │
                        │  └─────────────────────────────┘    │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                        ┌─────────────────────────────────────┐
                        │  Sprites.dev API                    │
                        │  POST /v1/sprites/{name}/exec       │
                        └─────────────────────────────────────┘
```

---

## Technology Stack

- **Runtime**: Node.js on Fly.io (long-running server)
- **Framework**: Hono
- **Cron**: node-cron (in-memory, dynamic scheduling)
- **Storage**: Cloudflare KV (via REST API)
- **Language**: TypeScript

---

## Endpoints

### `POST /webhook/:source`
Receives webhooks from external sources.

- **Path params**: `source` - adapter name (e.g., `github`, `gitlab`)
- **Headers**: Source-specific (e.g., `X-GitHub-Event`, `X-Hub-Signature-256`)
- **Body**: Raw webhook payload (JSON)
- **Response**:
  - `200` - All matched automations executed successfully
  - `500` - One or more executions failed

**Flow**:
1. Validate webhook signature (source-specific)
2. Parse payload via source adapter
3. Load automations from KV
4. Filter automations by source + event type + match rules
5. Execute all matched automations in parallel (dispatch to Sprites)
6. Return aggregate result (500 if any failed)

### `POST /admin/automations`
Upload/update automation YAML files.

- **Headers**: `X-Admin-Token` (shared secret)
- **Body**: YAML content (single automation)
- **Response**: `200` with automation ID, or `400` on validation error

### `DELETE /admin/automations/:id`
Remove an automation.

- **Headers**: `X-Admin-Token`
- **Response**: `200` or `404`

### `GET /admin/automations`
List all automations (for debugging).

- **Headers**: `X-Admin-Token`
- **Response**: JSON array of automation configs

---

## Automation YAML Schema

```yaml
# Unique identifier for this automation
id: pr-review-bot

# Optional description
description: Triggers code review when PR is opened

# Which sprite to execute on
sprite:
  name: my-sprite-name      # Sprite name (same as ID in API)
  workdir: /home/user/repo  # Optional working directory

# Event source configuration
source:
  type: github              # Adapter name
  events:                   # List of event types to match
    - pull_request
    - pull_request_review

# Match conditions (all must pass)
# Uses JSONPath-like expressions with equality operator
match:
  - payload.action == "opened"
  - payload.repository.full_name == "myorg/myrepo"
  - payload.pull_request.draft == false

# Shell command to execute
# Supports {{payload.x.y.z}} template variables
run: |
  cd {{sprite.workdir}} && \
  git fetch origin pull/{{payload.pull_request.number}}/head:pr-{{payload.pull_request.number}} && \
  git checkout pr-{{payload.pull_request.number}} && \
  ./scripts/review.sh
```

### Schema Details

**`id`** (required)
- Unique string identifier
- Used as KV key

**`sprite`** (required)
- `name`: Sprite name for API calls
- `workdir`: Optional, available as `{{sprite.workdir}}` in templates

**`source`** (required)
- `type`: Adapter name (`github`, future: `gitlab`, `slack`, etc.)
- `events`: Array of event types to trigger on

**`match`** (optional)
- Array of JSONPath equality expressions
- Format: `payload.path.to.field == "value"` or `payload.path == true`
- All conditions must pass (AND logic)
- Empty match = always matches

**`run`** (required)
- Shell command string
- Template variables: `{{payload.x.y}}`, `{{sprite.workdir}}`

---

## Cron Automations

```yaml
id: daily-cleanup

sprite:
  name: maintenance-sprite
  workdir: /home/user

source:
  type: cron
  schedule: "0 2 * * *"  # 2am daily

# No match rules for cron (no payload)
# No templating (no context)

run: |
  cd {{sprite.workdir}} && ./cleanup.sh
```

- Cron automations have no payload, so no `match` rules or `{{payload.*}}` templates
- Only `{{sprite.workdir}}` available
- Schedule uses standard cron syntax
- Executed via node-cron (in-memory scheduler, dynamically registered on startup and when automations change)

---

## Source Adapters

Each source adapter implements:

```typescript
interface SourceAdapter {
  // Adapter identifier (matches source.type in YAML)
  name: string;

  // Validate incoming webhook (signature verification)
  validate(request: Request, secret: string): Promise<boolean>;

  // Extract event type from request
  getEventType(request: Request): string;

  // Parse payload from request body
  parsePayload(request: Request): Promise<unknown>;
}
```

### GitHub Adapter (v1)

- **Validation**: HMAC-SHA256 via `X-Hub-Signature-256` header
- **Event type**: `X-GitHub-Event` header
- **Supported events** (initial):
  - `issue_comment`
  - `pull_request`
  - `pull_request_review`
  - `push`

---

## Execution

When an automation matches:

1. Render the `run` command by substituting template variables
2. Call Sprites API: `POST /v1/sprites/{name}/exec?cmd={encodedCommand}`
3. If `workdir` specified, prepend `cd {workdir} && ` to command
4. Fire-and-forget (don't wait for command completion)
5. Log success/failure

### Sprites API Call

```
POST https://api.sprites.dev/v1/sprites/{sprite.name}/exec?cmd={urlEncode(command)}
Authorization: Bearer {SPRITES_TOKEN}
```

- Returns immediately after command starts
- No stdout/stderr capture
- Failures logged to console

---

## Template Engine

Simple JSONPath-like variable substitution:

```
{{payload.repository.name}}     → extracts payload.repository.name
{{payload.pull_request.number}} → extracts payload.pull_request.number
{{sprite.workdir}}              → sprite workdir from automation config
```

- Dot notation only (no array indexing in v1)
- Missing values → empty string
- No expressions, just value extraction

---

## Match Engine

Evaluates array of equality expressions:

```
payload.action == "opened"
payload.repository.private == false
payload.sender.login == "dependabot[bot]"
```

- Left side: JSONPath to payload field
- Operator: `==` only (v1)
- Right side: string, number, boolean literal
- All conditions must pass (implicit AND)

---

## Configuration

### Environment Variables (Secrets)

| Variable | Description |
|----------|-------------|
| `SPRITES_TOKEN` | Bearer token for Sprites.dev API |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for GitHub webhook validation |
| `ADMIN_TOKEN` | Shared secret for admin endpoints |
| `CF_ACCOUNT_ID` | Cloudflare account ID for KV API |
| `CF_API_TOKEN` | Cloudflare API token with KV access |
| `CF_KV_NAMESPACE_ID` | KV namespace ID for automations storage |

### Cloudflare KV (via REST API)

Since we're running on Fly.io, we access Cloudflare KV via their REST API:

```
GET/PUT/DELETE https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}
```

- Key format: `automation:{id}`
- Value: Raw YAML string
- On startup: Load all automations, register cron jobs
- On automation change: Re-sync cron scheduler

---

## Security

1. **Webhook validation**: Each source adapter validates signatures
2. **Admin endpoints**: Protected by `X-Admin-Token` header
3. **Sprite auth**: Uses separate `SPRITES_TOKEN`, scoped per deployment
4. **No code execution**: Orchestrator only dispatches, never runs user code

---

## Error Handling

- Webhook signature invalid → `401`
- No matching automations → `200` (not an error)
- Automation YAML invalid → `400` on upload
- Sprite exec fails → `500` returned to webhook sender
- Template variable missing → empty string substitution

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Exec method | POST (fire-and-forget) |
| Idempotency | Skip for demo |
| Automation storage | KV with upload endpoint |
| Sprites config | Embedded in each automation |
| Webhook routing | Path-based (`/webhook/:source`) |
| Event schema | Source-specific (no normalization) |
| Templating | JSONPath-like for payload fields |
| Payload passing | Template only (no raw payload) |
| Match syntax | JSONPath equality expressions |
| Match operators | Equality only (`==`) |
| Error handling | Return error to webhook sender |
| Framework | Hono |
| Missing template vars | Empty string substitution |
| Multi-match behavior | Execute all in parallel |
| Cron registration | Dynamic via node-cron (no redeploy needed) |
| Hosting | Fly.io (long-running Node.js server) |

---

## File Structure

```
/
├── src/
│   ├── index.ts              # Hono app entry point + server startup
│   ├── routes/
│   │   ├── webhook.ts        # POST /webhook/:source
│   │   └── admin.ts          # Admin endpoints
│   ├── adapters/
│   │   ├── types.ts          # SourceAdapter interface
│   │   └── github.ts         # GitHub adapter
│   ├── engine/
│   │   ├── matcher.ts        # Match expression evaluator
│   │   ├── template.ts       # Template variable substitution
│   │   └── executor.ts       # Sprites API client
│   ├── cron/
│   │   └── scheduler.ts      # node-cron scheduler management
│   ├── storage/
│   │   └── kv.ts             # Cloudflare KV REST API client
│   └── types.ts              # Automation schema types
├── Dockerfile                # Fly.io deployment
├── fly.toml                  # Fly.io config
├── package.json
└── tsconfig.json
```

---

## Implementation Order

1. **Project setup**: Hono + Node.js + TypeScript + Dockerfile
2. **Types**: Automation schema, adapter interface
3. **Storage**: Cloudflare KV REST API client
4. **Admin routes**: Upload/list/delete automations
5. **Template engine**: Variable substitution
6. **Match engine**: Equality expression evaluator
7. **GitHub adapter**: Signature validation, event parsing
8. **Webhook route**: Wire it all together
9. **Executor**: Sprites API client
10. **Cron scheduler**: node-cron integration with dynamic registration
11. **Fly.io deployment**: fly.toml, secrets, deploy
