// Owner: Pair 2 (Person B). Personas stay short, wear the right hat and keep the "numbers only from data" rule.
import { describe, expect, it } from 'vitest';
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const cfos = Object.keys(CFOS) as CfoId[];

describe('personas', () => {
  it.each(cfos)('%s: ≤ 15 lines, its own hat, the number rule and the length limit', (cfo) => {
    const p = PERSONAS[cfo];
    expect(p.split('\n').length).toBeLessThanOrEqual(15);
    expect(p).toContain(`Jesteś ${CFOS[cfo].name}`);
    expect(p).toContain(HATS[CFOS[cfo].hat].labelPl.toLowerCase());
    expect(p).toContain('Przepisuj kwoty i daty DOKŁADNIE');
    expect(p).toContain('Maks. 3 krótkie zdania');
  });

  it('no persona mentions another CFO hat', () => {
    for (const cfo of cfos) {
      for (const other of cfos.filter((c) => CFOS[c].hat !== CFOS[cfo].hat)) {
        expect(PERSONAS[cfo]).not.toContain(HATS[CFOS[other].hat].labelPl.toLowerCase());
      }
    }
  });

  it('personas contain no real numbers the model could copy (only placeholders)', () => {
    for (const cfo of cfos) expect(PERSONAS[cfo].replace(/JPK_V7M|EUR\/USD|5%|3 krótkie/g, '')).not.toMatch(/\d/);
  });

  it('the chair wears the blue hat and adds no numbers', () => {
    expect(CHAIR_PERSONA).toContain(HATS.blue.labelPl.toLowerCase());
    expect(CHAIR_PERSONA).toContain('ani nowych liczb');
  });
});
