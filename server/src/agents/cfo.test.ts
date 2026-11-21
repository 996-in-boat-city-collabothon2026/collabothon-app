// Owner: Pair 2 (Person B). "One CFO answers safely": askCfo shows the model's reply only when the guard accepts it,
// otherwise the rule summary. Fake model, no GPU.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { resetDb } from '../domain/store';
import { setModelCallForTests, type ChatMessage, type ChatOptions } from '../llm/provider';
import { askCfo, ASK_MAX_TOKENS, REACT_MAX_TOKENS } from './cfo';
import { cfoFacts } from './facts';

// The real guard (agents/guard.ts, Person A) decides; these tests check that askCfo follows it.

const saved = { ...config.llm };
let reply: () => Promise<string> = async () => '';
const sent: { m: ChatMessage[]; o: ChatOptions }[] = [];

beforeEach(() => {
  sent.length = 0;
  reply = async () => '';
  Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 20_000, budgetMs: 22_000 });
  setModelCallForTests(async (m, o) => {
    sent.push({ m, o });
    return reply();
  }, 'openai_compat');
});
afterEach(() => {
  setModelCallForTests(null);
  resetDb();
});
afterAll(() => {
  Object.assign(config.llm, saved);
  setModelCallForTests(null, 'mock');
});

/** A reply built only from Marek's rule text: the first sentence of his summary. */
const goodMarek = () => cfoFacts('marek').summary.split(/(?<=\.)\s/)[0];

describe('askCfo: the reply is shown only when the guard accepts it', () => {
  it('a good reply (rule numbers only) is shown as written', async () => {
    const good = goodMarek();
    reply = async () => good;
    expect(await askCfo('marek', 'When is VAT due?')).toEqual({ text: good, fromModel: true, note: '' });
  });

  it('a made-up number → the rule summary, and the note names the number', async () => {
    reply = async () => 'Your VAT is 99999 zł, pay it soon.';
    const r = await askCfo('marek', 'Is my VAT 99999 zł?');
    expect(r.text).toBe(cfoFacts('marek').summary);
    expect(r.text).not.toContain('99999');
    expect(r.fromModel).toBe(false);
    expect(r.note).toContain('99999');
  });

  it('the model throws → the rule summary, no exception', async () => {
    reply = async () => { throw new Error('connection refused'); };
    expect(await askCfo('anna', 'Cash?')).toEqual({ text: cfoFacts('anna').summary, fromModel: false, note: 'no reply' });
  });

  it('the model returns "" → the rule summary', async () => {
    reply = async () => '   ';
    const r = await askCfo('tomasz', 'Margin?');
    expect(r).toMatchObject({ text: cfoFacts('tomasz').summary, fromModel: false });
  });

  it('the model times out → the rule summary, quickly', async () => {
    config.llm.timeoutMs = 50;
    reply = () => new Promise(() => {}); // never answers
    const t0 = Date.now();
    const r = await askCfo('kasia', 'EUR?');
    expect(r).toMatchObject({ text: cfoFacts('kasia').summary, fromModel: false });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('askCfo: the fallback fits the question (live run on 8B: every fallback was the same summary)', () => {
  const down = () => { reply = async () => { throw new Error('connection refused'); }; };

  it('a detail question → the main point, then that detail (not the whole summary)', async () => {
    down();
    const kasia = cfoFacts('kasia');
    const r = await askCfo('kasia', 'What is the EUR rate today?');
    expect(r.fromModel).toBe(false);
    expect(r.text).not.toBe(kasia.summary);
    expect(r.text.startsWith(kasia.points.find((p) => p.core)!.text)).toBe(true); // the main advice never vanishes
    expect(r.text).toContain('4,27 zł');

    const anna = await askCfo('anna', 'How much do my customers owe me?');
    expect(anna.text).toContain('owe you 19');
    expect(anna.text.startsWith(cfoFacts('anna').points[0].text)).toBe(true);
  });

  it('a question about the conclusion, or one that matches nothing → the whole summary', async () => {
    down();
    expect((await askCfo('anna', 'Will we survive December?')).text).toBe(cfoFacts('anna').summary);
    expect((await askCfo('marek', 'Hmm, interesting?')).text).toBe(cfoFacts('marek').summary);
  });

  it('the same question always gives the same fallback (no model involved)', async () => {
    down();
    const a = await askCfo('marek', 'When do I pay ZUS?');
    const b = await askCfo('marek', 'When do I pay ZUS?');
    expect(a.text).toBe(b.text);
    expect(a.text).toContain('ZUS');
  });
});

describe('askCfo: the prompt', () => {
  it('holds the persona, every fact line, the conclusion and the question', async () => {
    await askCfo('kasia', 'Should we lock the EUR rate?');
    const [system, user] = sent[0].m;
    const facts = cfoFacts('kasia');
    expect(system.content).toContain('You are Kasia');
    for (const line of facts.lines) expect(user.content).toContain(line);
    expect(user.content).toContain(`CONCLUSION: ${facts.summary}`);
    expect(user.content).toContain('OWNER ASKS: Should we lock the EUR rate?');
    expect(user.content).not.toContain('WHAT THE LEAD SAID');
    expect(sent[0].o).toMatchObject({ maxTokens: ASK_MAX_TOKENS, mockKey: 'ask:Kasia' });
  });

  it('short: holds what the lead said and asks for one sentence', async () => {
    await askCfo('anna', 'How to improve the margin?', { short: true, heard: 'Labour is billed too low.' });
    const user = sent[0].m[1].content;
    expect(user).toContain('WHAT THE LEAD SAID: Labour is billed too low.');
    expect(user).toContain('Reply in ONE sentence');
    expect(sent[0].o.maxTokens).toBe(REACT_MAX_TOKENS);
  });

  it('history: an "EARLIER IN THIS CHAT" block before OWNER ASKS, one line per message', async () => {
    await askCfo('kasia', 'Why?', {
      history: [
        { from: 'owner', text: 'Should we lock the EUR rate?' },
        { from: 'cfo', cfo: 'kasia', text: 'Yes, lock it with a forward contract.' },
      ],
    });
    const user = sent[0].m[1].content;
    expect(user).toContain(
      'EARLIER IN THIS CHAT (context only, its numbers are not FACTS):\n' +
        'Owner: Should we lock the EUR rate?\n' +
        'Kasia: Yes, lock it with a forward contract.',
    );
    expect(user.indexOf('EARLIER IN THIS CHAT')).toBeLessThan(user.indexOf('OWNER ASKS: Why?'));
  });

  it('no history → no chat block', async () => {
    await askCfo('kasia', 'Why?');
    expect(sent[0].m[1].content).not.toContain('EARLIER IN THIS CHAT');
  });

  it('a number from the history never reaches the screen', async () => {
    reply = async () => 'Because your VAT is 99 999 zł, as you said.';
    const r = await askCfo('marek', 'Why?', { history: [{ from: 'owner', text: 'My VAT is 99 999 zł.' }] });
    expect(r.text).not.toContain('99 999');
    expect(r).toMatchObject({ fromModel: false, note: 'number not in facts: 99999' });
  });

  it('only this CFO\'s facts: Anna\'s prompt has no Kasia fact line', async () => {
    await askCfo('anna', 'Cash?');
    const user = sent[0].m[1].content;
    for (const line of cfoFacts('kasia').lines.filter((l) => !cfoFacts('anna').lines.includes(l))) {
      expect(user).not.toContain(line);
    }
  });
});
