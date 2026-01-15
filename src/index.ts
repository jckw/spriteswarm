import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { admin } from './routes/admin.js';
import { createWebhookRoutes } from './routes/webhook.js';
import { githubAdapter } from './adapters/github.js';
import { slackAdapter } from './adapters/slack.js';
import type { SourceAdapter, AdapterRegistry } from './adapters/types.js';
import { initCronScheduler, syncCronJobs } from './cron/scheduler.js';

// Initialize adapter registry
const adapters: AdapterRegistry = new Map<string, SourceAdapter>();
adapters.set('github', githubAdapter);
adapters.set('slack', slackAdapter);

const app = new Hono();

app.use('*', logger());

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Mount admin routes
app.route('/admin', admin);

// Mount webhook routes
const webhookRoutes = createWebhookRoutes(adapters);
app.route('/webhook', webhookRoutes);

const port = parseInt(process.env.PORT || '8080', 10);

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);

// Initialize cron scheduler after server starts
initCronScheduler().catch((error) => {
  console.error('Failed to initialize cron scheduler:', error);
});

export { app, adapters, syncCronJobs };
