/**
 * Automation configuration schema
 * Represents a single automation rule loaded from YAML
 */
export interface Automation {
  /** Unique identifier for this automation */
  id: string;

  /** Optional description of what this automation does */
  description?: string;

  /** Sprite configuration for execution */
  sprite: SpriteConfig;

  /** Event source configuration */
  source: WebhookSource | CronSource;

  /**
   * Match conditions (all must pass)
   * Uses JSONPath equality expressions: "payload.action == \"opened\""
   */
  match?: string[];

  /** Prompt/input to send via stdin, supports {{payload.x.y}} templates */
  run: string;
}

export interface SpriteConfig {
  /** Sprite name (same as ID in Sprites.dev API) */
  name: string;

  /** Executable to run (e.g., "claude") */
  path: string;

  /** Command-line arguments (e.g., "-p" for print mode) */
  cmd?: string;

  /** Working directory on the sprite */
  workdir?: string;
}

export interface WebhookSource {
  /** Adapter name (e.g., "github", "gitlab") */
  type: string;

  /** List of event types to trigger on (e.g., ["pull_request", "push"]) */
  events: string[];
}

export interface CronSource {
  type: 'cron';

  /** Cron schedule expression (e.g., "0 2 * * *") */
  schedule: string;
}

/**
 * Type guard to check if source is a webhook source
 */
export function isWebhookSource(source: WebhookSource | CronSource): source is WebhookSource {
  return source.type !== 'cron' && 'events' in source;
}

/**
 * Type guard to check if source is a cron source
 */
export function isCronSource(source: WebhookSource | CronSource): source is CronSource {
  return source.type === 'cron' && 'schedule' in source;
}

/**
 * Template context available during command rendering
 */
export interface TemplateContext {
  payload?: Record<string, unknown>;
  sprite: SpriteConfig;
}

/**
 * Result of executing an automation
 */
export interface ExecutionResult {
  automationId: string;
  success: boolean;
  error?: string;
}
