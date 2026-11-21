// Owner: Pair 2 (Person B). Personas stay short, wear the right hat and describe the rebuild's contract (M6):
// pick ready-made points by id, write no fact, pick at most one pre-written comment by id.
import { describe, expect, it } from 'vitest';
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const cfos = Object.keys(CFOS) as CfoId[];

describe('personas', () => {
  it.each(cfos)('%s: ≤ 15 lines, its own hat, picks points, writes no fact, picks one comment by id', (cfo) => {
    const p = PERSONAS[cfo];
    expect(p.split('\n').length).toBeLessThanOrEqual(15);
    expect(p).toContain(`You are ${CFOS[cfo].name}`);
    expect(p).toContain(HATS[CFOS[cfo].hat].label.toLowerCase());
    expect(p).toContain('pick the ids');
    expect(p).toContain('Never write a fact yourself');
    expect(p).toContain('pick ONE comment by its id from COMMENTS');
    expect(p).toContain('Never write a comment yourself');
    expect(p).toContain('the owner decides');
    expect(p).not.toMatch(/Copy amounts|FACTS/); // the old free-text contract is gone
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

  it('Kasia is not asked to compare paying the supplier early (her facts have no numbers for it), nor to predict rates', () => {
    expect(PERSONAS.kasia).not.toMatch(/paying the supplier early|Compare/i);
    expect(PERSONAS.kasia).toContain('never say where a rate is going');
  });

  it('the chair wears the blue hat, picks ids, adds no numbers and decides nothing', () => {
    expect(CHAIR_PERSONA).toContain(HATS.blue.label.toLowerCase());
    expect(CHAIR_PERSONA).toContain('no new numbers');
    expect(CHAIR_PERSONA).toContain('Pick only ids from the list');
    expect(CHAIR_PERSONA).toContain('pick ONE comment by its id from COMMENTS');
    expect(CHAIR_PERSONA).toContain('the owner decides');
  });
});
