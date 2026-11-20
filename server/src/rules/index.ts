// Owner: Pair 2. Every rule returns draft actions. The autopilot adds ids/status and de-duplicates.
// One file per rule (+ one test file). Add new rules to RULES below.
import type { Action } from '@cfo/shared';
import { vat } from './vat';
import { zus } from './zus';
import { pit } from './pit';
import { ksef } from './ksef';
import { fx } from './fx';
import { liquidity } from './liquidity';
import { expenses } from './expenses';
import { margin } from './margin';

export type DraftAction = Omit<Action, 'id' | 'status' | 'createdAt'>;
export type Rule = () => DraftAction[];

export const RULES: Rule[] = [vat, zus, pit, ksef, liquidity, fx, expenses, margin];
