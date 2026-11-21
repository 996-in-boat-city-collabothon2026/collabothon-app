// Owner: Pair 2 (Person A). Checks a model reply before the owner sees it (docs/AGENTS-8B-PLAN.md, section 4).
// TODO stub, Person A replaces it: the real guard (branch agents8b-guard) rejects made-up numbers, Polish, long replies.
import type { CfoFacts } from './facts';

export function checkReply(_reply: string, _facts: CfoFacts): { ok: boolean; reason: string } {
  return { ok: true, reason: '' };
}
