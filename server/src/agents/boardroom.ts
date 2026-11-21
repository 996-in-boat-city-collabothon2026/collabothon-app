// Owner: Pair 2 (Person A). Four CFOs speak in turn, then a "chair" call turns the debate into decisions.
// Rebuild M5 (docs/PAIR2-REBUILD.md): no free model text on stage. Each CFO picks points of its own rule facts and may
// pick one pre-written comment (agents/comments.ts); the chair picks card ids and may pick one comment too.
import { z } from 'zod';
import { CFOS, type Action, type BoardroomResult, type BoardroomTurn, type CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { cfoFacts, type CfoFacts } from './facts';
import { agentModel, CHOICE_FORMAT, commentBlock, parseChoice, pointList, renderAnswer } from './answer';
import { commentsFor, pickComment, type CannedComment } from './comments';
import { CHAIR_PERSONA, PERSONAS } from './personas';
import { allDrafts, isCurrentCard } from './autopilot';

const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // White → Black → Green → Red, the Blue chair sums up

// Live: ~36 tokens/s and a 22 s budget for 5 calls. A JSON choice (a few point ids + one comment id) fits in 120 tokens.
export const TURN_MAX_TOKENS = 120;
export const CHAIR_MAX_TOKENS = 160;

const transcriptOf = (turns: BoardroomTurn[]) => turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');

/** One CFO's turn prompt: what the others said, then this CFO's own points and comments. */
function turnPrompt(cfo: CfoId, facts: CfoFacts, subject: string, turns: BoardroomTurn[], comments: CannedComment[]): string {
  return [
    `MEETING TOPIC: ${subject}`,
    `WHAT THE OTHERS SAID:\n${transcriptOf(turns) || '(nobody has spoken yet)'}`, '',
    `YOUR POINTS, ${CFOS[cfo].name} (ready-made from the rules, each with its id):`,
    pointList(facts), '',
    commentBlock(comments), '',
    'Pick the points that matter most for the topic, and the id of one comment that fits (or none).',
    CHOICE_FORMAT,
  ].join('\n');
}

/**
 * Summary from the rules: the first 3 decisions, or, with no cards, nothing about the money (review of PR #6:
 * "Everything is under control" during a cash gap, before the first "Run check").
 */
export function ruleSummary(approvals: Action[]): string {
  if (!approvals.length) return 'Nothing is waiting for your decision right now. Run the check for fresh proposals.';
  return `For your decision: ${approvals.slice(0, 3).map((a) => a.title).join('; ')}. All proposals are in the approval queue.`;
}

/** The chair returns card ids and may pick one comment id. A missing field counts as empty. */
const ChairSchema = z.object({ decisionActionIds: z.array(z.string()).optional(), comment: z.string().optional() });
export const CHAIR_FORMAT =
  'Reply ONLY with JSON: {"decisionActionIds": ["ids from the list, most important first"], ' +
  '"comment": "the id of one comment from COMMENTS that fits, or an empty string"}';

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const subject = topic?.trim() || 'Monthly review';
  const turns: BoardroomTurn[] = [];
  let critical = false; // any CFO with a real risk: the chair may not pick a calm comment

  for (const cfo of ORDER) {
    const facts = cfoFacts(cfo);
    critical ||= facts.points.some((p) => p.critical);
    if (!agentModel.enabled) {
      turns.push({ cfo, text: facts.summary });
      continue;
    }
    // chatOr never throws: a dead, slow or empty model gives '' → no JSON → this CFO's conclusion (core points).
    const comments = commentsFor(cfo, facts.points.some((p) => p.critical));
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: turnPrompt(cfo, facts, subject, turns, comments) },
    ], { maxTokens: TURN_MAX_TOKENS, temperature: 0.1, mockKey: `boardroom:${cfo}` });
    const answer = renderAnswer(facts, parseChoice(raw), comments);
    if (answer.note) console.info(`[guard] boardroom:${cfo} ${answer.note}`);
    turns.push({ cfo, text: answer.text });
  }

  // Only cards the rules still propose: approving a stale card is refused with 409 (review of PR #6: after paying
  // Krause early the chair still offered the old forward).
  const drafts = allDrafts();
  const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a, drafts));
  if (!agentModel.enabled) return { turns, summary: ruleSummary(approvals), decisionActionIds: approvals.map((a) => a.id) };

  const items = approvals.map((a) => `- [${a.id}] ${CFOS[a.cfo].name}: ${a.title}`).join('\n') || '-';
  const chairComments = commentsFor('chair', critical);
  const chairRaw = await chatOr('', [
    { role: 'system', content: `${CHAIR_PERSONA} ${CHAIR_FORMAT}` },
    { role: 'user', content: `ITEMS TO APPROVE:\n${items}\n\nDEBATE:\n${transcriptOf(turns)}\n\n${commentBlock(chairComments)}` },
  ], { maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1, mockKey: 'boardroom:chair' });

  const chair = extractJson(chairRaw, ChairSchema);
  // Cards in the chair's order, unknown ids and repeats dropped; none valid → every current card.
  const picked = [...new Set(chair?.decisionActionIds ?? [])].map((id) => approvals.find((a) => a.id === id)).filter((a): a is Action => !!a);
  const decisions = picked.length ? picked : approvals;
  const comment = pickComment(chair?.comment, chairComments);
  if (!chair) console.info('[guard] boardroom:chair no valid JSON');
  return {
    turns,
    summary: [ruleSummary(decisions), comment].filter(Boolean).join(' '),
    decisionActionIds: decisions.map((a) => a.id),
  };
}
