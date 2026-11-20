import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson } from './json';

const Chair = z.object({ summary: z.string(), decisionActionIds: z.array(z.string()) });

describe('extractJson', () => {
  it('reads plain JSON', () => {
    expect(extractJson('{"summary":"Pay VAT","decisionActionIds":["a1"]}', Chair)).toEqual({
      summary: 'Pay VAT',
      decisionActionIds: ['a1'],
    });
  });

  it('reads JSON inside a ```json fence with chatter around it', () => {
    const text = 'Here is the plan:\n```json\n{"summary":"x","decisionActionIds":[]}\n```\nHope it helps!';
    expect(extractJson(text, Chair)?.summary).toBe('x');
  });

  it('ignores text after the JSON, even with more braces', () => {
    const text = '{"summary":"a {tricky} one","decisionActionIds":[]} Note: {not json}';
    expect(extractJson(text, Chair)?.summary).toBe('a {tricky} one');
  });

  it('repairs trailing commas and single quotes', () => {
    const text = "{'summary': 'Chase invoices', 'decisionActionIds': ['a1', 'a2',],}";
    expect(extractJson(text, Chair)).toEqual({ summary: 'Chase invoices', decisionActionIds: ['a1', 'a2'] });
  });

  it('removes a trailing comma without touching apostrophes inside strings', () => {
    const text = `{"summary":"Kasia's figures don't match","decisionActionIds":[],}`;
    expect(extractJson(text, Chair)).toEqual({ summary: "Kasia's figures don't match", decisionActionIds: [] });
  });

  it('keeps commas and brackets that are inside strings', () => {
    const text = `{"summary":"Pay VAT, ZUS ], then PIT }",'decisionActionIds':['a1',],}`;
    expect(extractJson(text, Chair)).toEqual({ summary: 'Pay VAT, ZUS ], then PIT }', decisionActionIds: ['a1'] });
  });

  it('returns null for garbage or a wrong shape', () => {
    expect(extractJson('I think we should pay VAT.', Chair)).toBeNull();
    expect(extractJson('{"summary": 5}', Chair)).toBeNull();
    expect(extractJson('{"summary": "cut off', Chair)).toBeNull();
  });
});
