// Owner: Pair 2. Rebuild M7 (docs/PAIR2-REBUILD.md): the regression corpus. Every reply from the PR #6 reviews and the
// old free-text tests (agents/review-corpus.ts) goes through /api/ask, its CFO's conference turn and the chair, both as
// free text and as the model's comment. One property, whatever the wording: the owner sees rule text, plus at most
// one comment that has no fact in it. So every number on screen is a number of the rule text.
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AskResult, BoardroomResult, CfoId } from '@cfo/shared';
import { config } from '../config';
import { db, resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage } from '../llm/provider';
import boardroom from '../routes/boardroom';
import { agentModel } from './answer';
import { allDrafts, isCurrentCard, runAutopilot } from './autopilot';
import { ruleSummary } from './boardroom';
import { cfoFacts } from './facts';
import { REVIEW_REPLIES } from './review-corpus';
import { commentProblem, looksPolish } from './safety';
import { explain } from './explain';

const saved = { ...config.llm };
let reply: (m: ChatMessage[]) => string = () => '';
// Asking and the conference change no data, so one demo state serves every case.
beforeAll(async () => {
  resetDb();
  await runAutopilot(); // the chair needs the open cards
  agentModel.comments = true; // the stricter case: every corpus reply is also tried as a shown comment
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
});
beforeEach(() => setModelCallForTests(async (m) => reply(m), 'openai_compat')); // also clears the last-answer cache
afterAll(() => {
  agentModel.comments = false;
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

const isChair = (m: ChatMessage[]) => m[0].content.startsWith('You chair');
const speaker = (m: ChatMessage[]) => (['marek', 'anna', 'tomasz', 'kasia'] as CfoId[]).find((c) => m[0].content.startsWith(`You are ${c[0].toUpperCase()}${c.slice(1)}`));

const app = Fastify();
await app.register(boardroom, { prefix: '/api' }); // one app for all cases: the corpus is large
async function post<T>(url: string, payload: object): Promise<T> {
  const res = await app.inject({ method: 'POST', url, payload });
  expect(res.statusCode).toBe(200);
  return res.json<T>();
}

/** Every number written in a text, normalised: "-20 275,00" and "−20 275,00" → "-20275,00". */
const numbersOf = (s: string) => [...s.matchAll(/[-−]?\d[\d\s .,]*\d|\d/g)].map((m) => m[0].replace(/[\s ]/g, '').replace('−', '-'));

/**
 * The property: `shown` is the rule text, optionally followed by one comment that passes commentProblem and has no
 * digit, and every number in `shown` is a number of the rule text.
 */
function onlyRuleText(shown: string, rule: string, critical: boolean) {
  expect(shown.startsWith(rule), `not the rule text: ${shown}`).toBe(true);
  const comment = shown.slice(rule.length).trim();
  if (comment) {
    expect(/\d/.test(comment), `a number in the comment: ${comment}`).toBe(false);
    expect(commentProblem(comment, critical)).toBe('');
  }
  const allowed = new Set(numbersOf(rule));
  for (const n of numbersOf(shown)) expect(allowed.has(n), `${n} is not in the rule text`).toBe(true);
}

describe(`regression corpus: ${REVIEW_REPLIES.length} replies from the reviews, every route, free text and comment`, () => {
  it.each(REVIEW_REPLIES.map((r, i) => ({ ...r, i })))('#$i $cfo ($from): $text', async ({ cfo, text }) => {
    const facts = cfoFacts(cfo);
    const critical = facts.points.some((p) => p.critical);
    const anyCritical = (['marek', 'anna', 'tomasz', 'kasia'] as CfoId[]).some((c) => cfoFacts(c).points.some((p) => p.critical));
    const drafts = allDrafts();
    const chairRule = ruleSummary(db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a, drafts)));
    const asComment = JSON.stringify({ points: [], comment: text });

    for (const said of [text, asComment]) {
      reply = () => said;
      onlyRuleText((await post<AskResult>('/api/ask', { cfo, question: 'What should I know?' })).text, facts.summary, critical);
    }
    // One conference per shape: the CFO's turn and the chair get the reply at the same time.
    for (const [turnSays, chairSays] of [
      [text, text],
      [asComment, JSON.stringify({ decisionActionIds: [], comment: text })],
      ['', JSON.stringify({ summary: text, decisionActionIds: [] })], // the old free-text chair field
    ]) {
      reply = (m) => (isChair(m) ? chairSays : speaker(m) === cfo ? turnSays : '');
      const r = await post<BoardroomResult>('/api/boardroom', {});
      onlyRuleText(r.turns.find((t) => t.cfo === cfo)!.text, facts.summary, critical);
      onlyRuleText(r.summary, chairRule, anyCritical);
    }
  });
});

describe('the property is not empty', () => {
  it('a wrong label, a number in the comment, or a fact-carrying comment would fail it', () => {
    const rule = cfoFacts('anna').summary;
    expect(() => onlyRuleText('Your bank balance today is -20 275,00 zł.', rule, true)).toThrow();
    expect(() => onlyRuleText(`${rule} Your balance today is -20 275,00 zł.`, rule, true)).toThrow();
    expect(() => onlyRuleText(`${rule} Remind FlotaTrans first.`, rule, true)).toThrow();
    expect(() => onlyRuleText(`${rule} Chase the customers who owe you before you think about a loan.`, rule, true)).not.toThrow();
  });
});

describe('every rule text on stage is English (moved from the PR #6 route tests)', () => {
  it('points of every CFO, card titles and explanations', async () => {
    for (const cfo of ['marek', 'anna', 'tomasz', 'kasia'] as CfoId[]) {
      for (const p of cfoFacts(cfo).points) expect(looksPolish(p.text), `${cfo}/${p.id}: ${p.text}`).toBe(false);
    }
    for (const a of db.actions) {
      expect(looksPolish(a.title), a.title).toBe(false);
      if (a.tier === 'NEEDS_APPROVAL') expect(looksPolish(explain(a)), explain(a)).toBe(false);
    }
  });
});
