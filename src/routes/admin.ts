import { Hono } from 'hono';
import {
  getAutomation,
  putAutomation,
  deleteAutomation,
  listAutomationIds,
  loadAllAutomations,
  parseAutomationYaml,
} from '../storage/kv.js';

const admin = new Hono();

/**
 * Middleware to validate admin token
 */
admin.use('*', async (c, next) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return c.json({ error: 'Admin token not configured' }, 500);
  }

  const providedToken = c.req.header('X-Admin-Token');
  if (!providedToken || providedToken !== adminToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

/**
 * GET /admin/automations
 * List all automations
 */
admin.get('/automations', async (c) => {
  try {
    const automations = await loadAllAutomations();
    return c.json(automations);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /admin/automations/:id
 * Get a single automation by ID
 */
admin.get('/automations/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const automation = await getAutomation(id);
    if (!automation) {
      return c.json({ error: 'Automation not found' }, 404);
    }
    return c.json(automation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /admin/automations
 * Upload/update an automation from YAML
 */
admin.post('/automations', async (c) => {
  try {
    const yamlContent = await c.req.text();

    // Validate and parse YAML
    const automation = parseAutomationYaml(yamlContent);

    // Store in KV
    await putAutomation(automation.id, yamlContent);

    return c.json({ id: automation.id, message: 'Automation created/updated' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    return c.json({ error: message }, 400);
  }
});

/**
 * DELETE /admin/automations/:id
 * Delete an automation by ID
 */
admin.delete('/automations/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const deleted = await deleteAutomation(id);
    if (!deleted) {
      return c.json({ error: 'Automation not found' }, 404);
    }
    return c.json({ message: 'Automation deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export { admin };
