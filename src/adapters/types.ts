/**
 * Source adapter interface
 * Each webhook source (GitHub, GitLab, etc.) implements this interface
 */
export interface SourceAdapter {
  /** Adapter identifier (matches source.type in automation YAML) */
  name: string;

  /**
   * Validate incoming webhook request
   * Typically verifies HMAC signature
   *
   * @param request - The incoming HTTP request
   * @param secret - The webhook secret for signature verification
   * @returns true if request is valid, false otherwise
   */
  validate(request: Request, secret: string): Promise<boolean>;

  /**
   * Extract event type from request
   * Source-specific (e.g., X-GitHub-Event header for GitHub)
   *
   * @param request - The incoming HTTP request
   * @returns The event type string
   */
  getEventType(request: Request): string;

  /**
   * Parse payload from request body
   *
   * @param request - The incoming HTTP request
   * @returns The parsed payload object
   */
  parsePayload(request: Request): Promise<unknown>;
}

/**
 * Registry of available source adapters
 */
export type AdapterRegistry = Map<string, SourceAdapter>;
