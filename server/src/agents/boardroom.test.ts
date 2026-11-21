// Owner: Pair 2 (Person C). "The meeting follows the topic" (docs/AGENTS-8B-PLAN.md, section 6).
// A fake model answers every call, so these tests need no GPU.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CfoId } from '@cfo/shared';
import type { ChatMessage, ChatOptions } from '../llm/provider';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { db, resetDb } from '../domain/store';
import { isCurrentCard, runAutopilot } from './autopilot';
import { CHAIR_MAX_TOKENS, NOTHING_ON_TOPIC, ORDER, ruleSummary, runBoardroom, SMALL_TALK_SUMMARY } from './boardroom';
import { cfoFacts } from './facts';

const saved = { ...config.llm };
/** What the fake model answers. `null` = the model is down (the call throws). */
let reply: ((m: ChatMessage[]) => string) | null;
const sent: { m: ChatMessage[]; o: ChatOptions }[] = [];

const isChair = (m: ChatMessage[]) => m[1].content.includes('ITEMS TO APPROVE');
const isShort = (m: ChatMessage[]) => m[1].content.includes('WHAT THE LEAD SAID');
const chairJson = (decisionActionIds: string[], summary = '') => JSON.stringify({ decisionActionIds, summary });
/** No numbers, English, one sentence: any guard accepts it. */
const MODEL_TEXT = 'The model says this in its own words.';

const current = () => db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a));
const speakers = (r: { turns: { cfo: CfoId }[] }) => r.turns.map((t) => t.cfo);

beforeEach(() => {
  resetDb();
  sent.length = 0;
  reply = (m) => (isChair(m) ? '' : MODEL_TEXT);
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m, o) => {
    sent.push({ m, o });
    if (!reply) throw new Error('model down');
    return reply(m);
  }, 'openai_compat');
});
afterEach(() => {
  setModelCallForTests(null);
  resetDb();
  Object.assign(config.llm, saved);
});

describe('the lead follows the topic', () => {
  it('"How to improve the margin?" → Tomasz first, in full; the others react in one sentence to what he said', async () => {
    const r = await runBoardroom('How to improve the margin?');
    expect(r.turns[0]).toEqual({ cfo: 'tomasz', text: MODEL_TEXT });
    const turnCalls = sent.filter((c) => !isChair(c.m));
    expect(isShort(turnCalls[0].m)).toBe(false); // the lead is asked first, for a full answer
    for (const c of turnCalls.slice(1)) {
      expect(isShort(c.m)).toBe(true);
      expect(c.m[1].content).toContain(`WHAT THE LEAD SAID: ${MODEL_TEXT}`);
    }
    // Marek, Anna and Kasia each have a critical point in the demo data, so they all react, in the fixed order.
    expect(speakers(r)).toEqual(['tomasz', 'marek', 'anna', 'kasia']);
  });

  it('"Should we lock the EUR rate?" → Kasia first', async () => {
    const r = await runBoardroom('Should we lock the EUR rate?');
    expect(r.turns[0].cfo).toBe('kasia');
  });

  it('a CFO with no critical point and no keyword match passes (no turn)', async () => {
    expect(cfoFacts('tomasz').points.some((p) => p.critical)).toBe(false); // the demo data: margins are not urgent
    const r = await runBoardroom('Should we lock the EUR rate?');
    expect(speakers(r)).toEqual(['kasia', 'marek', 'anna']);
    expect(sent.filter((c) => !isChair(c.m))).toHaveLength(3); // Tomasz is not even asked
  });

  it('a CFO with no critical point still speaks when the topic touches its area', async () => {
    const r = await runBoardroom('Should we lock the EUR rate or cut parts costs?');
    expect(r.turns[0].cfo).toBe('kasia');
    expect(speakers(r)).toContain('tomasz');
  });

  it('a reaction that only says "not my area" passes (live run on 8B: Marek and Anna in the EUR meeting)', async () => {
    reply = (m) => (isChair(m) ? '' : isShort(m) && m[0].content.includes('You are Marek') ? "That's not my area, I handle taxes." : MODEL_TEXT);
    const r = await runBoardroom('Should we lock the EUR rate?');
    expect(speakers(r)).toEqual(['kasia', 'anna']);
  });

  it('the reaction prompt asks for the urgent point, never "not my area"', async () => {
    await runBoardroom('Should we lock the EUR rate?');
    const short = sent.find((c) => isShort(c.m))!;
    expect(short.m[1].content).toContain('Never say it is not your area.');
  });

  it('two different topics give different turns', async () => {
    const margin = await runBoardroom('How to improve the margin?');
    const eur = await runBoardroom('Should we lock the EUR rate?');
    expect(speakers(margin)).not.toEqual(speakers(eur));
  });
});

describe('general topic and small talk', () => {
  it('"Monthly review" → all 4 in full answers: Marek, Anna, Tomasz, Kasia', async () => {
    const r = await runBoardroom('Monthly review');
    expect(speakers(r)).toEqual(['marek', 'anna', 'tomasz', 'kasia']);
    expect(sent.filter((c) => !isChair(c.m)).some((c) => isShort(c.m))).toBe(false);
  });

  it('"Monthly review" asks all 4 at the same time; the order on screen stays fixed when replies come back out of order', async () => {
    let running = 0;
    let most = 0;
    // Marek is the slowest and Kasia the fastest, so they finish in the opposite order.
    const delay: Record<string, number> = { Marek: 40, Anna: 30, Tomasz: 20, Kasia: 10 };
    setModelCallForTests(async (m) => {
      if (isChair(m)) return '';
      const name = Object.keys(delay).find((n) => m[0].content.startsWith(`You are ${n},`)) ?? '';
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, delay[name]));
      running--;
      return `${name} says this in its own words.`;
    }, 'openai_compat');
    const r = await runBoardroom('Monthly review');
    expect(most).toBe(4);
    expect(r.turns.map((t) => t.text)).toEqual(['Marek', 'Anna', 'Tomasz', 'Kasia'].map((n) => `${n} says this in its own words.`));
  });

  it('no topic → the same general meeting', async () => {
    expect(speakers(await runBoardroom())).toEqual(ORDER);
  });

  it.each(['hello', 'Hi!', 'thanks', '?'])('"%s" → no turns, "Pick a topic", 0 model calls, no new cards', async (topic) => {
    const r = await runBoardroom(topic);
    expect(r).toEqual({ turns: [], summary: SMALL_TALK_SUMMARY, decisionActionIds: [] });
    expect(sent).toHaveLength(0);
    expect(db.actions).toHaveLength(0);
  });
});

describe('cards and the chair', () => {
  it('the chair gets "[id] CFO: title" for each card, the topic and the turns; 160 tokens, temperature 0.1', async () => {
    await runAutopilot();
    await runBoardroom('Monthly review');
    const chair = sent.find((c) => isChair(c.m))!;
    for (const a of current()) expect(chair.m[1].content).toContain(`[${a.id}] `);
    expect(chair.m[1].content).toContain(`Tomasz: ${MODEL_TEXT}`);
    expect(chair.m[1].content).toContain('MEETING TOPIC: Monthly review');
    expect(chair.o).toMatchObject({ maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1 });
  });

  it('only ids of open cards, in the chair\'s order: unknown ids and repeats are dropped', async () => {
    await runAutopilot();
    const [a, b] = current();
    reply = (m) => (isChair(m) ? chairJson(['a-made-up', b.id, b.id, a.id]) : MODEL_TEXT);
    const r = await runBoardroom('Monthly review');
    expect(r.decisionActionIds).toEqual([b.id, a.id]);
  });

  it('a topic meeting decides only the lead\'s cards (live run on 8B: the EUR meeting listed VAT and the credit line)', async () => {
    await runAutopilot();
    const r = await runBoardroom('Should we lock the EUR rate?');
    const kasias = current().filter((a) => a.cfo === 'kasia').map((a) => a.id);
    expect(kasias.length).toBeGreaterThan(0);
    expect(r.decisionActionIds).toEqual(kasias); // no valid id from the chair → every card of this meeting
    const chair = sent.find((c) => isChair(c.m))!;
    for (const a of current().filter((x) => x.cfo !== 'kasia')) expect(chair.m[1].content).not.toContain(`[${a.id}] `);
    // the other cards stay open in the approval queue
    expect(current().length).toBeGreaterThan(kasias.length);
  });

  it('a topic meeting drops a card id of another CFO, even if the chair picks it', async () => {
    await runAutopilot();
    const vat = current().find((a) => a.cfo === 'marek')!;
    reply = (m) => (isChair(m) ? chairJson([vat.id]) : MODEL_TEXT);
    const r = await runBoardroom('Should we lock the EUR rate?');
    expect(r.decisionActionIds).not.toContain(vat.id);
  });

  it('a lead with no cards (Tomasz) → no chair call, no decisions, a plain sentence', async () => {
    await runAutopilot();
    const r = await runBoardroom('How to improve the margin?');
    expect(r.decisionActionIds).toEqual([]);
    expect(r.summary).toBe(NOTHING_ON_TOPIC);
    expect(sent.some((c) => isChair(c.m))).toBe(false);
  });

  it('a summary without made-up numbers is shown; one with a made-up number → the rule summary', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? chairJson([], 'Fix the labour prices first, then talk to the bank.') : MODEL_TEXT);
    expect((await runBoardroom('Monthly review')).summary).toBe('Fix the labour prices first, then talk to the bank.');

    reply = (m) => (isChair(m) ? chairJson([], 'You will save 99 999,00 zł this month.') : MODEL_TEXT);
    const r = await runBoardroom('Monthly review');
    expect(r.summary).toBe(ruleSummary(current()));
    expect(r.summary).not.toContain('99 999');
  });

  it('the chair\'s English money is shown in the app format (live run on 8B: "36,000.00 zł")', async () => {
    await runAutopilot();
    reply = (m) => (isChair(m) ? chairJson([], 'Open the credit line of 36,000.00 zł only after the reminders.') : MODEL_TEXT);
    const r = await runBoardroom('Will we survive December?');
    expect(r.summary.replace(/[  ]/g, ' ')).toBe('Open the credit line of 36 000,00 zł only after the reminders.');
  });

  it('no open cards → the meeting runs the check, the chair offers the new cards, and every card stays open', async () => {
    expect(db.actions).toHaveLength(0);
    const r = await runBoardroom('Monthly review');
    expect(r.decisionActionIds.length).toBeGreaterThan(0);
    for (const id of r.decisionActionIds) expect(db.actions.find((a) => a.id === id)!.status).toBe('open');
    expect(db.actions.filter((a) => a.tier === 'NEEDS_APPROVAL').every((a) => a.status === 'open')).toBe(true);
  });

  it('cards already open → no second check (no new cards)', async () => {
    await runAutopilot();
    const before = db.actions.length;
    await runBoardroom('Monthly review');
    expect(db.actions).toHaveLength(before);
  });
});

describe('the model is down', () => {
  it('every turn is rule text, the summary is the rule summary, and the meeting still returns', async () => {
    reply = null;
    const r = await runBoardroom('Monthly review');
    expect(r.turns).toEqual(ORDER.map((cfo) => ({ cfo, text: cfoFacts(cfo).summary })));
    expect(r.summary).toBe(ruleSummary(current()));
    expect(r.decisionActionIds).toEqual(current().map((a) => a.id));
  });

  it('with a lead too: the lead and the reactions fall back to each CFO\'s rule summary', async () => {
    reply = null;
    const r = await runBoardroom('How to improve the margin?');
    for (const t of r.turns) expect(t.text).toBe(cfoFacts(t.cfo).summary);
  });
});
