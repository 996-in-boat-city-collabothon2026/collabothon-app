// Owner: Pair 2. Pre-written comments, one list per CFO and one for the chair. The model only PICKS one by id.
// Why: live run 1 (docs/PAIR2-REBUILD.md) showed about 12 of 49 free comments were wrong advice with no number in
// them ("consider paying early"). No check can catch that, so the model no longer writes the comment at all.
// Each comment is in the hat's voice and holds no fact: no number, date, money, name or market move.
import type { CfoId } from '@cfo/shared';

export interface CannedComment {
  id: string;
  text: string;
  calm?: boolean; // fits only when nothing is urgent: never offered or shown next to a critical point
}

export type Speaker = CfoId | 'chair';

export const COMMENTS: Record<Speaker, CannedComment[]> = {
  // ⚪ white hat: plain rules of thumb
  marek: [
    { id: 'marek-aside', text: 'Tax deadlines do not move, so put that money aside before anything else.' },
    { id: 'marek-data', text: 'Correct buyer data on every invoice saves you trouble with the tax office.' },
    { id: 'marek-calendar', text: 'Mark every tax date in your calendar so nothing surprises you.' },
    { id: 'marek-calm', text: 'Your taxes are in order, nothing to add from me.', calm: true },
  ],
  // ⚫ black hat: what can go wrong
  anna: [
    { id: 'anna-chase', text: 'Chase the money customers owe you before you think about a loan.' },
    { id: 'anna-cushion', text: 'A cash cushion is what keeps the shop open when work is slow.' },
    { id: 'anna-worst', text: 'I would rather plan for the worst case and be pleasantly surprised.' },
    { id: 'anna-calm', text: 'Your cash looks steady, so keep doing what you do.', calm: true },
  ],
  // 🟢 green hat: practical fixes
  tomasz: [
    { id: 'tomasz-bill', text: 'Every hour your team works should show up on the customer\'s bill.' },
    { id: 'tomasz-quote', text: 'A quick call to another supplier can lower a cost you pay again and again.' },
    { id: 'tomasz-small', text: 'Small fixes in your prices add up faster than you think.' },
    { id: 'tomasz-calm', text: 'Your prices and costs look right, keep them that way.', calm: true },
  ],
  // 🔴 red hat: how the risk feels
  kasia: [
    { id: 'kasia-fixed', text: 'I trust a certain price more than any guess about the market.' },
    { id: 'kasia-uneasy', text: 'Not knowing what a foreign bill will cost makes me uneasy.' },
    { id: 'kasia-sleep', text: 'Pick the option that lets you stop worrying about the rate.' },
    { id: 'kasia-calm', text: 'Your currency risk feels small to me, nothing to fear here.', calm: true },
  ],
  // 🔵 blue hat: the chair
  chair: [
    { id: 'chair-closest', text: 'Start with the decision that has the closest deadline.' },
    { id: 'chair-one', text: 'Take one decision at a time, the queue keeps the rest for you.' },
    { id: 'chair-owner', text: 'These are proposals only, the choice is yours.' },
    { id: 'chair-calm', text: 'The team sees nothing urgent for you right now.', calm: true },
  ],
};

/** The comments a speaker may pick now: no calm ones next to a critical point, none already said in this meeting. */
export const commentsFor = (who: Speaker, critical: boolean, used: Set<string> = new Set()) =>
  COMMENTS[who].filter((c) => !(critical && c.calm) && !used.has(c.id));

/** Comments for the prompt, one per line: "- anna-chase: Chase the money …". */
export const commentList = (list: CannedComment[]) => list.map((c) => `- ${c.id}: ${c.text}`).join('\n') || '-';

/** The comment text for a picked id, or '' (unknown id, another speaker's id, or not allowed now). */
export const pickComment = (id: string | undefined, allowed: CannedComment[]) => allowed.find((c) => c.id === id?.trim())?.text ?? '';
