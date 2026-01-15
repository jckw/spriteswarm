import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SourceAdapter } from './types.js';

/**
 * GitHub webhook adapter
 * Handles signature validation and event parsing for GitHub webhooks
 */
export const githubAdapter: SourceAdapter = {
  name: 'github',

  /**
   * Validate GitHub webhook signature using HMAC-SHA256
   * GitHub sends the signature in the X-Hub-Signature-256 header
   */
  async validate(request: Request, secret: string): Promise<boolean> {
    const signature = request.headers.get('X-Hub-Signature-256');
    if (!signature) {
      return false;
    }

    // Clone the request to read the body without consuming it
    const body = await request.clone().text();

    // GitHub signature format: "sha256=<hex>"
    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(body)
      .digest('hex')}`;

    // Use timing-safe comparison to prevent timing attacks
    try {
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  },

  /**
   * Extract event type from X-GitHub-Event header
   */
  getEventType(request: Request): string {
    return request.headers.get('X-GitHub-Event') || 'unknown';
  },

  /**
   * Parse JSON payload from request body
   */
  async parsePayload(request: Request): Promise<unknown> {
    const body = await request.json();
    return body;
  },
};
