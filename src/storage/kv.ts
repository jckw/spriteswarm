import YAML from 'yaml';
import type { Automation } from '../types.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

interface KVConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
}

interface KVListResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  result_info: { cursor?: string; count: number };
}

function getConfig(): KVConfig {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;

  if (!accountId || !apiToken || !namespaceId) {
    throw new Error(
      'Missing Cloudflare KV configuration. Required: CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID'
    );
  }

  return { accountId, apiToken, namespaceId };
}

function getKVUrl(config: KVConfig, key?: string): string {
  const base = `${CF_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`;
  if (key) {
    return `${base}/values/${encodeURIComponent(key)}`;
  }
  return `${base}/keys`;
}

function automationKey(id: string): string {
  return `automation:${id}`;
}

/**
 * Retrieve a single automation by ID
 */
export async function getAutomation(id: string): Promise<Automation | null> {
  const config = getConfig();
  const url = getKVUrl(config, automationKey(id));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to get automation ${id}: ${response.status} ${response.statusText}`);
  }

  const yamlContent = await response.text();
  return YAML.parse(yamlContent) as Automation;
}

/**
 * Store an automation (creates or updates)
 */
export async function putAutomation(id: string, yamlContent: string): Promise<void> {
  const config = getConfig();
  const url = getKVUrl(config, automationKey(id));

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'text/plain',
    },
    body: yamlContent,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to put automation ${id}: ${response.status} ${errorText}`);
  }
}

/**
 * Delete an automation by ID
 */
export async function deleteAutomation(id: string): Promise<boolean> {
  const config = getConfig();
  const url = getKVUrl(config, automationKey(id));

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`Failed to delete automation ${id}: ${response.status} ${response.statusText}`);
  }

  return true;
}

/**
 * List all automation IDs stored in KV
 */
export async function listAutomationIds(): Promise<string[]> {
  const config = getConfig();
  const ids: string[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(getKVUrl(config));
    url.searchParams.set('prefix', 'automation:');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list automations: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as KVListResponse;

    if (!data.success) {
      throw new Error(`KV API error: ${data.errors.map((e) => e.message).join(', ')}`);
    }

    for (const key of data.result) {
      // Extract ID from "automation:{id}" key format
      const id = key.name.replace(/^automation:/, '');
      ids.push(id);
    }

    cursor = data.result_info.cursor;
  } while (cursor);

  return ids;
}

/**
 * Load all automations from KV storage
 */
export async function loadAllAutomations(): Promise<Automation[]> {
  const ids = await listAutomationIds();
  const automations: Automation[] = [];

  for (const id of ids) {
    const automation = await getAutomation(id);
    if (automation) {
      automations.push(automation);
    }
  }

  return automations;
}

/**
 * Validate automation YAML and return parsed automation
 */
export function parseAutomationYaml(yamlContent: string): Automation {
  const automation = YAML.parse(yamlContent) as Automation;

  if (!automation.id || typeof automation.id !== 'string') {
    throw new Error('Automation must have a valid "id" field');
  }

  if (!automation.sprite || !automation.sprite.name) {
    throw new Error('Automation must have a "sprite.name" field');
  }

  if (!automation.source || !automation.source.type) {
    throw new Error('Automation must have a "source.type" field');
  }

  if (automation.source.type === 'cron') {
    if (!('schedule' in automation.source) || !automation.source.schedule) {
      throw new Error('Cron automation must have a "source.schedule" field');
    }
  } else {
    if (!('events' in automation.source) || !Array.isArray(automation.source.events)) {
      throw new Error('Webhook automation must have a "source.events" array');
    }
  }

  if (!automation.run || typeof automation.run !== 'string') {
    throw new Error('Automation must have a "run" command');
  }

  return automation;
}
