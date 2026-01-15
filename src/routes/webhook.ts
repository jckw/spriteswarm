import { Hono } from 'hono';
import type { SourceAdapter, AdapterRegistry } from '../adapters/types.js';
import type { Automation } from '../types.js';
import { isWebhookSource } from '../types.js';
import { loadAllAutomations } from '../storage/kv.js';
import { evaluateMatches } from '../engine/matcher.js';
import { executeAll } from '../engine/executor.js';
import {
  isUrlVerification,
  getSlackEventType,
} from '../adapters/slack.js';

/**
 * Create webhook routes with the given adapter registry
 */
export function createWebhookRoutes(adapters: AdapterRegistry): Hono {
  const webhook = new Hono();

  /**
   * POST /webhook/:source
   * Receives webhooks from external sources (GitHub, etc.)
   */
  webhook.post('/:source', async (c) => {
    const sourceName = c.req.param('source');

    // Get the adapter for this source
    const adapter = adapters.get(sourceName);
    if (!adapter) {
      console.warn(`Unknown webhook source: ${sourceName}`);
      return c.json({ error: `Unknown source: ${sourceName}` }, 400);
    }

    // Get the webhook secret for this source
    const secretEnvKey = `${sourceName.toUpperCase()}_WEBHOOK_SECRET`;
    const secret = process.env[secretEnvKey];
    if (!secret) {
      console.error(`Webhook secret not configured: ${secretEnvKey}`);
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    // Validate the webhook signature
    const isValid = await adapter.validate(c.req.raw, secret);
    if (!isValid) {
      console.warn(`Invalid webhook signature for source: ${sourceName}`);
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse payload first (needed for Slack event type extraction)
    const payload = await adapter.parsePayload(c.req.raw) as Record<string, unknown>;

    // Handle Slack URL verification challenge
    if (sourceName === 'slack' && isUrlVerification(payload)) {
      console.log('Responding to Slack URL verification challenge');
      return c.json({ challenge: payload.challenge });
    }

    // Get event type - for Slack, extract from payload; for others, use header
    const eventType =
      sourceName === 'slack'
        ? getSlackEventType(payload)
        : adapter.getEventType(c.req.raw);
    console.log(`Received ${sourceName}/${eventType} webhook`);

    // Load all automations
    let automations: Automation[];
    try {
      automations = await loadAllAutomations();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load automations: ${message}`);
      return c.json({ error: 'Failed to load automations' }, 500);
    }

    // Filter automations that match this source and event
    const matchingAutomations = automations.filter((automation) => {
      // Must be a webhook source
      if (!isWebhookSource(automation.source)) {
        return false;
      }

      // Must match the source type
      if (automation.source.type !== sourceName) {
        return false;
      }

      // Must match the event type
      if (!automation.source.events.includes(eventType)) {
        return false;
      }

      // Must pass all match conditions
      if (!evaluateMatches(automation.match, payload)) {
        return false;
      }

      return true;
    });

    console.log(`Found ${matchingAutomations.length} matching automation(s) for ${sourceName}/${eventType}`);

    if (matchingAutomations.length === 0) {
      return c.json({ message: 'No matching automations', matched: 0 });
    }

    // Execute all matching automations in parallel
    const results = await executeAll(matchingAutomations, payload);

    // Check for failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.error(`${failures.length} automation(s) failed:`, failures);
      return c.json(
        {
          error: 'One or more automations failed',
          results,
        },
        500
      );
    }

    return c.json({
      message: 'All automations executed successfully',
      matched: matchingAutomations.length,
      results,
    });
  });

  return webhook;
}
