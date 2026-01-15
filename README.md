# Sprite Orchestrator

A Node.js server that receives webhooks and cron triggers, evaluates declarative automation rules, and dispatches shell commands to Sprites via the Sprites.dev API.

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values (see Configuration below)

# Run locally
npm run dev

# Upload an example automation
curl http://localhost:8080/admin/automations \
  -X POST \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: text/yaml" \
  --data-binary @examples/pr-review.yaml
```

## Configuration

| Variable | Description |
|----------|-------------|
| `SPRITES_TOKEN` | Bearer token for Sprites.dev API |
| `ADMIN_TOKEN` | Shared secret for admin endpoints |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for GitHub webhook validation |
| `CF_ACCOUNT_ID` | Cloudflare account ID (32 hex chars, found in dashboard URL) |
| `CF_API_TOKEN` | Cloudflare API token with KV permissions |
| `CF_KV_NAMESPACE_ID` | KV namespace ID for automations storage |

## Example Automations

The `examples/` directory contains ready-to-use automations:

| File | Description |
|------|-------------|
| `pr-review.yaml` | AI reviews PRs and posts feedback |
| `daily-metrics.yaml` | Daily metrics collection on a schedule |
| `weekly-report.yaml` | Weekly summary reports |
| `sentry-triage.yaml` | Triage Sentry errors automatically |
| `support-ticket.yaml` | Handle support tickets |
| `customer-churn-alert.yaml` | Alert on customer churn signals |

## API Endpoints

### Health Check

```
GET /health
```

### Webhooks

```
POST /webhook/:source
```

Receives webhooks from external sources. The `:source` parameter specifies the adapter (e.g., `github`).

### Admin

All admin endpoints require the `X-Admin-Token` header.

```
GET    /admin/automations      # List all automations
GET    /admin/automations/:id  # Get a single automation
POST   /admin/automations      # Upload/update an automation (YAML body)
DELETE /admin/automations/:id  # Delete an automation
```

## Automation Schema

```yaml
id: pr-review-bot
description: Triggers code review when PR is opened

sprite:
  name: my-sprite-name
  workdir: /home/user/repo

source:
  type: github
  events:
    - pull_request

match:
  - payload.action == "opened"
  - payload.repository.full_name == "myorg/myrepo"
  - payload.pull_request.draft == false

run: |
  cd {{sprite.workdir}} && \
  git fetch origin pull/{{payload.pull_request.number}}/head:pr-{{payload.pull_request.number}} && \
  git checkout pr-{{payload.pull_request.number}} && \
  ./scripts/review.sh
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier for the automation |
| `description` | No | Human-readable description |
| `sprite.name` | Yes | Sprite name for API calls |
| `sprite.workdir` | No | Working directory, available as `{{sprite.workdir}}` |
| `source.type` | Yes | Adapter name (`github`, `cron`) |
| `source.events` | Yes* | Event types to trigger on (*not for cron) |
| `source.schedule` | Yes* | Cron expression (*only for cron) |
| `match` | No | Array of JSONPath equality expressions (AND logic) |
| `run` | Yes | Shell command with template variables |

### Cron Automations

```yaml
id: daily-cleanup

sprite:
  name: maintenance-sprite
  workdir: /home/user

source:
  type: cron
  schedule: "0 2 * * *"

run: |
  cd {{sprite.workdir}} && ./cleanup.sh
```

### Match Expressions

Match expressions use JSONPath equality (all must pass):

```yaml
match:
  - payload.action == "opened"
  - payload.repository.private == false
  - payload.sender.login == "dependabot[bot]"
```

### Template Variables

Use `{{path.to.value}}` syntax in the `run` command:

- `{{payload.x.y.z}}` - Values from webhook payload
- `{{sprite.workdir}}` - Sprite working directory

Missing values resolve to empty string.

## Deployment

### Cloudflare KV Setup

1. Log into [Cloudflare dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages** → **KV**
3. Click **Create a namespace** (e.g., `spriteswarm-automations`)
4. Copy the **Namespace ID**
5. Go to **My Profile** → **API Tokens** → **Create Token**
6. Use the **Edit Cloudflare Workers** template
7. Copy the **API Token** and **Account ID** (from the dashboard URL)

### Deploy to Fly.io

```bash
# Create the app
fly launch --no-deploy

# Set secrets
fly secrets set \
  SPRITES_TOKEN="..." \
  ADMIN_TOKEN="..." \
  GITHUB_WEBHOOK_SECRET="..." \
  CF_ACCOUNT_ID="..." \
  CF_API_TOKEN="..." \
  CF_KV_NAMESPACE_ID="..."

# Deploy
fly deploy
```

### Configure GitHub Webhook

Point your GitHub webhook to:
```
https://your-app.fly.dev/webhook/github
```

Supported events: `issue_comment`, `pull_request`, `pull_request_review`, `push`
