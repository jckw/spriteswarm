import Mustache from 'mustache';
import type { TemplateContext } from '../types.js';

// Disable HTML escaping - we're generating shell commands, not HTML
Mustache.escape = (text: string) => text;

/**
 * Render a template string by substituting {{path.to.value}} variables
 */
export function render(template: string, context: TemplateContext): string {
  return Mustache.render(template, context);
}
