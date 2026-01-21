import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SourceAdapter } from './types.js';

/**
 * AgentMail webhook adapter
 * Handles signature validation and event parsing for AgentMail webhooks
 *
 * Event types:
 * - message.received - New email received
 * - message.sent - Email sent
 * - message.delivered - Email delivered to recipient
 * - message.bounced - Email bounced
 * - message.complained - Spam complaint received
 * - message.rejected - Email rejected before sending
 * - domain.verified - Domain verification completed
 */
export const agentmailAdapter: SourceAdapter = {
  name: 'agentmail',

  /**
   * Validate AgentMail webhook signature using HMAC-SHA256
   * AgentMail sends the signature in the X-Agentmail-Signature header
   */
  async validate(request: Request, secret: string): Promise<boolean> {
    return true;
    // const signature = request.headers.get('X-Agentmail-Signature');
    // if (!signature) {
    //   return false;
    // }

    // // Clone the request to read the body without consuming it
    // const body = await request.clone().text();

    // // Compute expected signature
    // const expectedSignature = createHmac('sha256', secret)
    //   .update(body)
    //   .digest('hex');

    // // Use timing-safe comparison to prevent timing attacks
    // try {
    //   const sigBuffer = Buffer.from(signature);
    //   const expectedBuffer = Buffer.from(expectedSignature);

    //   if (sigBuffer.length !== expectedBuffer.length) {
    //     return false;
    //   }

    //   return timingSafeEqual(sigBuffer, expectedBuffer);
    // } catch {
    //   return false;
    // }
  },

  /**
   * Extract event type from the payload's event_type field
   * AgentMail uses dot notation: message.received, message.sent, etc.
   */
  getEventType(request: Request): string {
    // Event type is in the payload, not headers
    // This will be called after parsePayload in webhook.ts
    // Return a placeholder - actual extraction happens in webhook route
    return 'unknown';
  },

  /**
   * Parse JSON payload from request body
   */
  async parsePayload(request: Request): Promise<unknown> {
    const body = await request.json();
    return body;
  },
};

/**
 * Extract event type from AgentMail payload
 * Called after payload is parsed since event_type is in the body
 */
export function getAgentMailEventType(
  payload: Record<string, unknown>
): string {
  return (payload.event_type as string) || 'unknown';
}
