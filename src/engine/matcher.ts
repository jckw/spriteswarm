/**
 * Match engine for evaluating JSONPath equality expressions
 *
 * Evaluates expressions like:
 *   payload.action == "opened"
 *   payload.repository.private == false
 *   payload.pull_request.number == 42
 */

/**
 * Get a nested value from an object using dot notation path
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Parse the right-hand side literal value
 * Supports: strings ("value" or 'value'), numbers, booleans (true/false)
 */
function parseLiteral(value: string): string | number | boolean {
  const trimmed = value.trim();

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // String literals (double or single quotes)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Number literals
  const num = Number(trimmed);
  if (!isNaN(num)) {
    return num;
  }

  // Fall back to treating as unquoted string
  return trimmed;
}

/**
 * Evaluate a single match expression
 * Format: "path.to.field == value" or "path.to.field != value"
 */
function evaluateExpression(expression: string, context: Record<string, unknown>): boolean {
  // Try != operator first (to avoid matching == inside !=)
  const neqMatch = expression.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    const [, path, literalStr] = neqMatch;
    const actualValue = getNestedValue(context, path.trim());
    const expectedValue = parseLiteral(literalStr);
    return actualValue != expectedValue;
  }

  // Try == operator
  const eqMatch = expression.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    const [, path, literalStr] = eqMatch;
    const actualValue = getNestedValue(context, path.trim());
    const expectedValue = parseLiteral(literalStr);
    return actualValue == expectedValue;
  }

  console.warn(`Invalid match expression (missing == or !=): ${expression}`);
  return false;
}

/**
 * Evaluate all match expressions against the given context
 * Returns true if ALL expressions match (AND logic)
 * Returns true if expressions array is empty or undefined
 */
export function evaluateMatches(
  expressions: string[] | undefined,
  payload: unknown
): boolean {
  // No match rules = always matches
  if (!expressions || expressions.length === 0) {
    return true;
  }

  // Create context with payload at root for JSONPath expressions
  const context: Record<string, unknown> = { payload };

  // All conditions must pass (AND logic)
  return expressions.every(expr => evaluateExpression(expr, context));
}
