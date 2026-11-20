// Owner: Pair 1. Models often wrap JSON in text or ```json fences, add trailing commas or use 'single quotes'.
// This digs the JSON out, repairs the common mistakes and validates it. Returns null when it can't.
import type { ZodType } from 'zod';

/** The first balanced {...} block in the text (ignores braces inside strings). */
function firstObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Fixes trailing commas and 'single-quoted' keys/strings. Only used when strict JSON.parse fails. */
function repair(json: string): string {
  return json
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, s: string) => JSON.stringify(s.replace(/\\'/g, "'")));
}

function parseLoose(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(repair(candidate));
    } catch {
      return undefined;
    }
  }
}

export function extractJson<T>(text: string, schema: ZodType<T>): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : text;
  const candidate = firstObject(source);
  if (!candidate) return null;
  const parsed = schema.safeParse(parseLoose(candidate));
  return parsed.success ? parsed.data : null;
}
