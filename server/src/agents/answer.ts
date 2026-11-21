// Owner: Pair 2. Rebuild M4/M5 (docs/PAIR2-REBUILD.md): how a CFO answers with the model.
// The model never writes a fact. It picks rule points by id (agents/facts.ts) and may add ONE comment in its hat's
// voice, which is shown only when commentProblem() finds no fact in it. Any failure → the rule conclusion.
import { z } from 'zod';
import { extractJson } from '../llm/json';
import type { CfoFacts, CfoPoint } from './facts';
import { commentProblem } from './safety';

/**
 * Switches for the demo:
 * - `enabled = false` → no model call, every CFO shows its rule conclusion;
 * - `comments = false` → the model's comment is never shown. Live run 1 (M9): about 12 of 49 shown comments were
 *   wrong advice with no number in them ("consider paying early"), which no check can catch. Rule text only.
 */
export const agentModel = { enabled: true, comments: false };

/** The model may pick this many points. Critical points are always added on top, so a risk is never left out. */
export const MAX_POINTS = 3;

/** What the model must return. A missing field counts as empty. */
const ChoiceSchema = z.object({
  points: z.array(z.string()).optional(),
  comment: z.string().optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

/** The instruction for the reply format (also read by the personas). */
export const CHOICE_FORMAT =
  'Reply ONLY with JSON: {"points": ["ids of the points that answer, most important first, at most 3"], ' +
  '"comment": "one short sentence of your own opinion with no numbers, dates, names or money, or an empty string"}';

/** Points for the prompt, one per line: "- gap (main): Careful: on December 20, 2026 …". Main = part of the conclusion. */
export const pointList = (facts: CfoFacts) => facts.points.map((p) => `- ${p.id} (${p.core ? 'main' : 'detail'}): ${p.text}`).join('\n');

/** The model's JSON (fences, trailing commas and single quotes are repaired by extractJson), or null. */
export const parseChoice = (raw: string): Choice | null => extractJson(raw, ChoiceSchema);

/** "keep it simple" → "Keep it simple." ('' stays ''). */
export const asSentence = (c: string) => (c ? c[0].toUpperCase() + c.slice(1) + (/[.!?]$/.test(c) ? '' : '.') : '');

export interface Answer {
  text: string; // what the owner sees: rule text of the shown points, then the comment if it passed
  points: string[]; // ids of the shown points, in the facts' order
  comment: string; // the shown comment ('' = none)
  note: string; // why something was left out, for the server log ('' = the model's choice was used as is)
}

/**
 * Rule text for the owner from the model's choice:
 * - unknown ids are dropped, repeats too, at most MAX_POINTS; nothing valid → the core points (the summary);
 * - every critical point is always shown ("What is my balance?" never hides the cash gap);
 * - with no core point among them, the first core point is added (the main advice never vanishes);
 * - the shown points keep the facts' order ("reminders" before "credit").
 */
export function renderAnswer(facts: CfoFacts, choice: Choice | null): Answer {
  const notes: string[] = [];
  if (!choice) notes.push('no valid JSON');
  const known = new Set(facts.points.map((p) => p.id));
  const picked = [...new Set(choice?.points ?? [])].filter((id) => known.has(id)).slice(0, MAX_POINTS);
  if (choice && picked.length < (choice.points ?? []).length) notes.push('unknown or extra ids dropped');
  const chosen = new Set(picked.length ? picked : facts.points.filter((p) => p.core).map((p) => p.id));
  if (choice && !picked.length) notes.push('no valid point → core points');
  for (const p of facts.points) if (p.critical) chosen.add(p.id);
  // Only details picked (live run 1: Tomasz showed cars, never "Bill the full hours") → add the first core point.
  const main = facts.points.find((p) => p.core);
  if (main && !facts.points.some((p) => p.core && chosen.has(p.id))) chosen.add(main.id);
  for (const p of facts.points) if (chosen.has(p.id) && p.needs) chosen.add(p.needs);
  for (const p of facts.points) if (p.sameAs && chosen.has(p.sameAs)) chosen.delete(p.id);
  const shown: CfoPoint[] = facts.points.filter((p) => chosen.has(p.id));

  let comment = (choice?.comment ?? '').trim();
  const problem = comment ? commentProblem(comment, facts.points.some((p) => p.critical)) : '';
  if (comment && !agentModel.comments) {
    notes.push('comments off');
    comment = '';
  } else if (problem) {
    notes.push(`comment refused: ${problem}`);
    comment = '';
  }
  comment = asSentence(comment);
  const text = [...shown.map((p) => p.text), comment].filter(Boolean).join(' ');
  return { text, points: shown.map((p) => p.id), comment, note: notes.join('; ') };
}
