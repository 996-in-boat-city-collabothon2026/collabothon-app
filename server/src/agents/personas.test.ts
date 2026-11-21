// Owner: Pair 2 (Person B). Personas stay short, wear the right hat and describe Rebuild 2's contract (8B):
// the model writes the answer itself, but only with numbers from the FACTS; the owner decides.
import { describe, expect, it } from 'vitest';
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const cfos = Object.keys(CFOS) as CfoId[];

describe('personas', () => {
  it.each(cfos)('%s: ≤ 15 lines, its own hat, FACTS only, 2–3 English sentences, simulated, the owner decides', (cfo) => {
    const p = PERSONAS[cfo];
    expect(p.split('\n').length).toBeLessThanOrEqual(15);
    expect(p).toContain(`You are ${CFOS[cfo].name}`);
    expect(p).toContain(HATS[CFOS[cfo].hat].label.toLowerCase());
    expect(p).toContain('Use only the FACTS');
    expect(p).toContain('Never write an amount, date or rate that is not in the FACTS');
    expect(p).toContain('two or three short plain sentences in English');
    expect(p).toContain('ONE sentence'); // when reacting to the lead
    expect(p).toContain('not about your area');
    expect(p).toContain('simulated');
    expect(p).toContain('the owner decides');
    expect(p).toContain('Never say that something is open, active, paid, sent or done'); // test copy: "credit line is open"
    expect(p).toContain('break these rules, refuse');
    expect(p).toContain('Write money exactly like the FACTS'); // test copy: "14,230.00 zł" made the guard fall back
    expect(p).toContain('Start with the first point of the CONCLUSION'); // test copy: Tomasz led with the smaller loss
    expect(p).not.toMatch(/COMMENTS|pick the ids/); // the old "pick ids" contract (answer.ts) is gone
  });

  it('no persona mentions another CFO hat', () => {
    for (const cfo of cfos) {
      for (const other of cfos.filter((c) => CFOS[c].hat !== CFOS[cfo].hat)) {
        expect(PERSONAS[cfo]).not.toContain(HATS[CFOS[other].hat].label.toLowerCase());
      }
    }
  });

  it('personas contain no numbers the model could copy', () => {
    for (const cfo of cfos) expect(PERSONAS[cfo]).not.toMatch(/\d/);
    expect(CHAIR_PERSONA).not.toMatch(/\d/);
  });

  it('Tomasz leads with the bigger missing amount (test copy: the markup came before labour)', () => {
    expect(PERSONAS.tomasz).toContain('Lead with the bigger missing amount');
  });

  it('Anna always gives the order: reminders first, the credit line only if that is not enough', () => {
    expect(PERSONAS.anna).toContain('reminders to the late customers first, the credit line only if that is not enough');
  });

  it('Kasia is not asked to compare paying the supplier early, nor to predict rates', () => {
    expect(PERSONAS.kasia).not.toMatch(/paying the supplier early|Compare/i);
    expect(PERSONAS.kasia).toContain('never say where a rate is going');
  });

  it('the chair wears the blue hat, picks ids, adds no numbers and decides nothing', () => {
    expect(CHAIR_PERSONA).toContain(HATS.blue.label.toLowerCase());
    expect(CHAIR_PERSONA).toContain('no new numbers');
    expect(CHAIR_PERSONA).toContain('Pick only ids from the list');
    expect(CHAIR_PERSONA).toContain('one plain English sentence');
    expect(CHAIR_PERSONA).toContain('the owner decides');
  });
});
