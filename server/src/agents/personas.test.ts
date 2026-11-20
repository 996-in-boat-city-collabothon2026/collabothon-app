// Owner: Pair 2 (Person B). Personas stay short, wear the right hat and keep the "numbers only from data" rule.
import { describe, expect, it } from 'vitest';
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const cfos = Object.keys(CFOS) as CfoId[];

describe('personas', () => {
  it.each(cfos)('%s: ≤ 15 lines, its own hat, the number rule and the word limit', (cfo) => {
    const p = PERSONAS[cfo];
    expect(p.split('\n').length).toBeLessThanOrEqual(15);
    expect(p).toContain(CFOS[cfo].name);
    expect(p).toContain(HATS[CFOS[cfo].hat].label.toUpperCase());
    expect(p).toContain('Use ONLY numbers present in the DATA');
    expect(p).toContain('Max 70 words');
  });

  it('no persona mentions another CFO hat', () => {
    for (const cfo of cfos) {
      for (const other of cfos.filter((c) => CFOS[c].hat !== CFOS[cfo].hat)) {
        expect(PERSONAS[cfo]).not.toContain(HATS[CFOS[other].hat].label.toUpperCase());
      }
    }
  });

  it('the chair wears the blue hat and adds no numbers', () => {
    expect(CHAIR_PERSONA).toContain('BLUE HAT');
    expect(CHAIR_PERSONA).toContain('no new numbers');
  });
});
