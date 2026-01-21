/**
 * Sprites API executor
 *
 * Dispatches shell commands to Sprites via the Sprites.dev API
 * Fire-and-forget: doesn't wait for command completion
 */

import type { Automation, ExecutionResult, TemplateContext } from '../types.js';
import { render } from './template.js';

const SPRITES_API_BASE = 'https://api.sprites.dev/v1';

/**
 * Execute an automation by dispatching the rendered command to a Sprite
 *
 * @param automation The automation config to execute
 * @param payload Optional webhook payload for template rendering
 * @returns ExecutionResult indicating success or failure
 */
export async function execute(
  automation: Automation,
  payload?: Record<string, unknown>
): Promise<ExecutionResult> {
  const spritesToken = process.env.SPRITES_TOKEN;

  if (!spritesToken) {
    console.error(`[${automation.id}] SPRITES_TOKEN not configured`);
    return {
      automationId: automation.id,
      success: false,
      error: 'SPRITES_TOKEN not configured',
    };
  }

  try {
    // Build template context
    const context: TemplateContext = {
      payload,
      sprite: automation.sprite,
    };

    // Render the prompt template (sent as stdin)
    const prompt = render(automation.run, context);

    // Build Sprites API URL
    const url = new URL(`${SPRITES_API_BASE}/sprites/${encodeURIComponent(automation.sprite.name)}/exec`);

    // Set the executable path
    url.searchParams.set('path', automation.sprite.path);

    // Set command-line args if provided
    if (automation.sprite.cmd) {
      url.searchParams.set('cmd', automation.sprite.cmd);
    }

    // Set working directory if provided
    if (automation.sprite.workdir) {
      url.searchParams.set('dir', automation.sprite.workdir);
    }

    // Enable stdin mode
    url.searchParams.set('stdin', 'true');

    const workdirInfo = automation.sprite.workdir ? ` (in ${automation.sprite.workdir})` : '';
    console.log(`[${automation.id}] Executing ${automation.sprite.path} on sprite "${automation.sprite.name}"${workdirInfo}`);
    console.log(`[${automation.id}] Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${spritesToken}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: prompt,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${automation.id}] Sprites API error: ${response.status} - ${errorText}`);
      return {
        automationId: automation.id,
        success: false,
        error: `Sprites API error: ${response.status} - ${errorText}`,
      };
    }

    console.log(`[${automation.id}] Successfully dispatched to sprite`);
    return {
      automationId: automation.id,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${automation.id}] Execution failed: ${errorMessage}`);
    return {
      automationId: automation.id,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute multiple automations in parallel
 *
 * @param automations Array of automations to execute
 * @param payload Optional webhook payload for template rendering
 * @returns Array of ExecutionResults
 */
export async function executeAll(
  automations: Automation[],
  payload?: Record<string, unknown>
): Promise<ExecutionResult[]> {
  return Promise.all(
    automations.map(automation => execute(automation, payload))
  );
}
