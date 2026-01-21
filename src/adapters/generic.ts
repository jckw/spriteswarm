import { timingSafeEqual } from 'node:crypto';
import type { SourceAdapter } from './types.js';

/**
 * Generic webhook adapter
 * Simple adapter for custom webhooks with basic secret validation
 */
export const genericAdapter: SourceAdapter = {
  name: 'generic',

  /**
   * Validate webhook using X-Webhook-Secret header
   * Simple direct comparison with the configured secret
   */
  async validate(request: Request, secret: string): Promise<boolean> {
    const providedSecret = request.headers.get('X-Webhook-Secret');
    if (!providedSecret) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      const secretBuffer = Buffer.from(secret);
      const providedBuffer = Buffer.from(providedSecret);

      if (secretBuffer.length !== providedBuffer.length) {
        return false;
      }

      return timingSafeEqual(secretBuffer, providedBuffer);
    } catch {
      return false;
    }
  },

  /**
   * Extract event type from X-Event-Type header
   * Defaults to "message" if not provided
   */
  getEventType(request: Request): string {
    return request.headers.get('X-Event-Type') || 'message';
  },

  /**
   * Parse JSON payload from request body
   */
  async parsePayload(request: Request): Promise<unknown> {
    const body = await request.json();
    return body;
  },
};
