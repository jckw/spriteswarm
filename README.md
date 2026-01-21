# Spriteswarm

A Node.js server that receives webhooks and cron triggers, evaluates declarative automation rules, and dispatches prompts to AI agents running on Sprites via the Sprites.dev API.

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
| `SLACK_WEBHOOK_SECRET` | Signing secret for Slack webhook validation |
| `AGENTMAIL_WEBHOOK_SECRET` | Secret for AgentMail webhook validation |
| `GENERIC_WEBHOOK_SECRET` | Secret for generic webhook validation |
| `CF_ACCOUNT_ID` | Cloudflare account ID (32 hex chars, found in dashboard URL) |
| `CF_API_TOKEN` | Cloudflare API token with KV permissions |
| `CF_KV_NAMESPACE_ID` | KV namespace ID for automations storage |

## Example Automations

The `examples/` directory contains ready-to-use automations:

| File | Description |
|------|-------------|
| `hello-world.yaml` | Simple example using generic webhooks |
| `pr-review.yaml` | AI reviews PRs and posts feedback |
| `slack-assistant.yaml` | Respond to Slack @mentions |
| `email-responder.yaml` | Auto-respond to emails via AgentMail |
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

Receives webhooks from external sources. The `:source` parameter specifies the adapter.

| Adapter | URL | Secret Header | Event Type |
|---------|-----|---------------|------------|
| `github` | `/webhook/github` | `X-Hub-Signature-256` (HMAC) | `X-GitHub-Event` header |
| `slack` | `/webhook/slack` | Slack signing secret | Event from payload |
| `agentmail` | `/webhook/agentmail` | `X-Agentmail-Signature` | `event_type` in payload |
| `generic` | `/webhook/generic` | `X-Webhook-Secret` | `X-Event-Type` header (default: `message`) |

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
  name: code-reviewer
  path: claude
  cmd: "-p"
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
  Review this PR and post your feedback to GitHub.

  PR #{{payload.pull_request.number}}: {{payload.pull_request.title}}
  Author: {{payload.pull_request.user.login}}

  1. Run 'git diff main' to see the changes
  2. Review for bugs, security issues, and code quality
  3. Post a review with specific line comments using the GitHub CLI
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier for the automation |
| `description` | No | Human-readable description |
| `sprite.name` | Yes | Sprite name for API calls |
| `sprite.path` | Yes | Executable to run (e.g., `claude`) |
| `sprite.cmd` | No | Command-line arguments (e.g., `-p` for print mode) |
| `sprite.workdir` | No | Working directory on the sprite |
| `source.type` | Yes | Adapter name (`github`, `slack`, `agentmail`, `generic`, `cron`) |
| `source.events` | Yes* | Event types to trigger on (*not for cron) |
| `source.schedule` | Yes* | Cron expression (*only for cron) |
| `match` | No | Array of JSONPath equality expressions (AND logic) |
| `run` | Yes | Prompt sent via stdin to the executable, supports `{{payload.x.y}}` templates |

### Cron Automations

```yaml
id: daily-metrics

sprite:
  name: analytics-agent
  path: claude
  cmd: "-p"
  workdir: /home/user

source:
  type: cron
  schedule: "0 9 * * 1-5"  # 9am weekdays

run: |
  Good morning! Time for the daily metrics check.

  1. Query the analytics API for the last 24 hours
  2. Summarize key metrics and trends
  3. Post the summary to #metrics in Slack
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

### Configure Webhooks

#### GitHub
Point your GitHub webhook to `https://your-app.fly.dev/webhook/github`

Supported events: `issue_comment`, `pull_request`, `pull_request_review`, `push`

#### Slack
1. Create a Slack app at https://api.slack.com/apps
2. Enable Event Subscriptions with URL: `https://your-app.fly.dev/webhook/slack`
3. Subscribe to events like `app_mention`, `message.channels`
4. Copy the Signing Secret to `SLACK_WEBHOOK_SECRET`

#### AgentMail
Point AgentMail webhooks to `https://your-app.fly.dev/webhook/agentmail`

Supported events: `message.received`, `message.sent`, `message.delivered`, `message.bounced`

#### Generic
For custom integrations, send POST requests to `https://your-app.fly.dev/webhook/generic` with:
- `X-Webhook-Secret`: Your configured secret
- `X-Event-Type`: Event type to match (default: `message`)
- JSON body: Your payload (accessible via `{{payload.x.y}}`)
