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

/**
 * Fixes trailing commas and 'single-quoted' keys/strings. Only used when strict JSON.parse fails.
 * Walks the text once: "double-quoted" strings are copied untouched (so apostrophes like "Kasia's" survive),
 * 'single-quoted' strings become "double-quoted", and a comma right before } or ] outside any string is dropped.
 */
function repair(json: string): string {
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (c === '"') {
      let j = i + 1;
      while (j < json.length && json[j] !== '"') j += json[j] === '\\' ? 2 : 1;
      out += json.slice(i, j + 1);
      i = j;
    } else if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < json.length && json[j] !== "'") {
        if (json[j] === '\\' && json[j + 1] === "'") j++; // \' → '
        s += json[j++];
      }
      out += JSON.stringify(s);
      i = j;
    } else if (c === ',' && /^\s*[}\]]/.test(json.slice(i + 1))) {
      // trailing comma: skip it
    } else {
      out += c;
    }
  }
  return out;
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
