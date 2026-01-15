import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SourceAdapter } from './types.js';

/**
 * Maximum age of a request timestamp (5 minutes in seconds)
 * Used to prevent replay attacks
 */
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

/**
 * Slack Events API adapter
 * Handles signature validation and event parsing for Slack webhooks
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export const slackAdapter: SourceAdapter = {
  name: 'slack',

  /**
   * Validate Slack request signature using HMAC-SHA256
   *
   * Slack sends:
   * - X-Slack-Request-Timestamp: Unix timestamp of when request was sent
   * - X-Slack-Signature: Signature in format "v0=<hex>"
   *
   * Signature is computed as: HMAC-SHA256(signing_secret, "v0:{timestamp}:{body}")
   */
  async validate(request: Request, secret: string): Promise<boolean> {
    const timestamp = request.headers.get('X-Slack-Request-Timestamp');
    const signature = request.headers.get('X-Slack-Signature');

    if (!timestamp || !signature) {
      return false;
    }

    // Verify timestamp is not too old (prevents replay attacks)
    const requestTimestamp = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (Math.abs(now - requestTimestamp) > MAX_REQUEST_AGE_SECONDS) {
      console.warn('Slack request timestamp is too old');
      return false;
    }

    // Clone the request to read the body without consuming it
    const body = await request.clone().text();

    // Compute expected signature: v0=HMAC-SHA256("v0:{timestamp}:{body}")
    const sigBaseString = `v0:${timestamp}:${body}`;
    const expectedSignature = `v0=${createHmac('sha256', secret)
      .update(sigBaseString)
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
   * Extract event type from Slack payload
   *
   * Slack event structure:
   * - type: "event_callback" for regular events
   * - event.type: The actual event type (e.g., "app_mention", "message")
   *
   * For URL verification: type is "url_verification"
   */
  getEventType(request: Request): string {
    // We need to peek at the body - this will be called after validate()
    // which already cloned, so we need to rely on cached/parsed payload
    // Return a placeholder - actual type is extracted in parsePayload
    return request.headers.get('X-Slack-Event-Type') || 'unknown';
  },

  /**
   * Parse Slack event payload
   *
   * Returns the full payload, with the event type available at:
   * - payload.type: "event_callback" | "url_verification"
   * - payload.event.type: Actual event type for event_callback
   */
  async parsePayload(request: Request): Promise<unknown> {
    const body = await request.json();
    return body;
  },
};

/**
 * Type guard to check if a payload is a URL verification challenge
 */
export function isUrlVerification(
  payload: unknown
): payload is { type: 'url_verification'; challenge: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    (payload as Record<string, unknown>).type === 'url_verification' &&
    'challenge' in payload &&
    typeof (payload as Record<string, unknown>).challenge === 'string'
  );
}

/**
 * Type guard to check if a payload is an event callback
 */
export function isEventCallback(
  payload: unknown
): payload is { type: 'event_callback'; event: { type: string } } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    (payload as Record<string, unknown>).type === 'event_callback' &&
    'event' in payload &&
    typeof (payload as Record<string, unknown>).event === 'object'
  );
}

/**
 * Extract the actual event type from a Slack payload
 */
export function getSlackEventType(payload: unknown): string {
  if (isUrlVerification(payload)) {
    return 'url_verification';
  }
  if (isEventCallback(payload)) {
    return payload.event.type;
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    typeof (payload as Record<string, unknown>).type === 'string'
  ) {
    return (payload as Record<string, unknown>).type as string;
  }
  return 'unknown';
}
