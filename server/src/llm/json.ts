// Owner: Pair 1. Models often wrap JSON in text or ```json fences. This digs it out and validates it.
import type { ZodType } from 'zod';

export function extractJson<T>(text: string, schema: ZodType<T>): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const parsed = schema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
