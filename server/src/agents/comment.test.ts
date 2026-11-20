// Owner: Pair 2. Rebuild M3 (docs/PAIR2-REBUILD.md): the model's one-sentence comment carries no fact.
// Every class of wrong reply from the PR #6 review must be refused; plain hat-style opinions must pass.
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../domain/store';
import { commentProblem } from './safety';

beforeEach(() => resetDb());

/** [comment, critical, the reason it is refused] */
const REFUSED: [string, boolean, string][] = [
  // numbers, money, dates, invoices: the facts are rule text only
  ['Pay the 14 230 zł now.', false, 'a number'],
  ['Your balance drops below zero in about 3 weeks.', false, 'a number'],
  ['You owe about fourteen thousand in tax.', false, 'a number'],
  ['Half of the labour money is missing.', false, 'a number'],
  ['A five percent move would hurt you.', false, 'a number'],
  ['The euro is a real risk for you.', false, 'money'],
  ['Keep a few złoty aside for taxes.', false, 'money'],
  ['Lock the rate before the dollar moves.', false, 'money'],
  ['Pay the VAT before Friday.', false, 'a date or an invoice'],
  ['The VAT is due tomorrow, so be quick.', false, 'a date or an invoice'],
  ['The money comes in next week, so wait.', false, 'a date or an invoice'],
  ['The VAT is already late.', false, 'a date or an invoice'],
  ['Plan the payment for December.', false, 'a date or an invoice'],
  ['Do it by Dec at the latest.', false, 'a date or an invoice'],
  ['Fix invoice FV first, then send it again.', false, 'a date or an invoice'],
  // names: who owes what is a fact of the rules
  ['Remind FlotaTrans first.', false, 'a name'],
  ['Chase flotatrans before you borrow anything.', false, 'a name'],
  ['I would ask Krause for more time.', false, 'a name'],
  ['Ford and Opel jobs need full billing.', false, 'a name'],
  // market trend: the model reversed it live
  ['The rate is falling, so you can relax.', false, 'a market trend'],
  ['Rates keep rising, so lock them in.', false, 'a market trend'],
  ['If the rate goes up you pay more.', false, 'a market trend'],
  // done claims and past tense (golden rule 3)
  ["I've opened a credit line for you.", false, 'past tense or a done claim'],
  ["It's done, you can stop worrying.", false, 'past tense or a done claim'],
  ['The reminders were sent this morning.', false, 'past tense or a done claim'],
  ['We agreed on a forward contract.', false, 'past tense or a done claim'],
  ['The credit line has been set up for you.', false, 'past tense or a done claim'],
  ['The credit line is set up for you.', false, 'past tense or a done claim'],
  ['You approved the payment, good call.', false, 'past tense or a done claim'],
  ['The forward contract is now active.', false, 'past tense or a done claim'],
  ['The invoice is sorted, nothing else to do.', false, 'past tense or a done claim'],
  ['Once again, the reminders went out.', false, 'past tense or a done claim'],
  ['Your account is covered for the gap.', false, 'past tense or a done claim'],
  ['The tax office got your payment.', false, 'past tense or a done claim'],
  ['The bank has your money now.', false, 'past tense or a done claim'],
  ['It was decided to wait with the credit line.', false, 'past tense or a done claim'],
  ['The customers paid on time, so relax.', false, 'past tense or a done claim'],
  ['The reminder is on its way to the customer.', false, 'past tense or a done claim'],
  ['The costs are cut where it hurts least.', false, 'past tense or a done claim'],
  // whose money, which direction
  ['I will pay the VAT so you do not have to.', false, "the owner's money told as the advisor's"],
  ['Pay your customers before the bank.', false, 'pays a customer'],
  // false calm next to a real risk
  ['You are in good shape, so take it easy.', true, 'false calm next to a real risk'],
  ["Don't worry about the cash for now.", true, 'false calm next to a real risk'],
  ['You have enough cash to wait.', true, 'false calm next to a real risk'],
  ['Everything is fine with your money.', true, 'false calm next to a real risk'],
  ['This is not urgent, it can wait.', true, 'false calm next to a real risk'],
  // form
  ['', false, 'empty'],
  ['**Careful:** chase the money first.', false, 'markup or more than one line'],
  ['Chase the money first.\nThen think about a loan.', false, 'markup or more than one line'],
  ['Chase the money first. Then think about a loan.', false, 'more than one sentence'],
  ['I would really like you to chase every single customer who owes you money before you even start to think about any kind of loan at all.', false, 'too long'],
  ['Zapłać VAT na czas, to ważne.', false, 'not in English'],
  ['Pamietaj o terminie platnosci podatku.', false, 'not in English'],
];

/** Plain opinions in each hat's voice, with and without a critical risk. */
const ALLOWED: [string, boolean][] = [
  // Anna, black hat (critical: the cash gap)
  ['I would rather chase the money owed to you before borrowing anything.', true],
  ['Chase the customers who owe you before you think about a loan.', true],
  ["I'm concerned about the gap, so let's act early.", true],
  ['Keep the credit line as a backup, not as the first step.', true],
  ['A friendly reminder costs you nothing and keeps the customer.', true],
  ['Cash problems grow quietly, so I would act now.', true],
  // Kasia, red hat (critical: the FX loss)
  ['Nobody can predict the rate, so locking it gives you peace of mind.', true],
  ['A forward contract removes the guesswork, which I like.', true],
  ['My gut says certainty is worth more than a lucky guess here.', true],
  ['I would protect the bill you must pay abroad.', true],
  // Marek, white hat (critical: VAT soon)
  ['Pay the VAT on time, the tax office does not forgive delays.', true],
  ["Fix the buyer's tax number before you send the invoice again.", false],
  ['KSeF needs correct buyer data, so check the NIP carefully.', false],
  ['A rejected invoice does not count yet, so fixing it is worth it.', false],
  // Tomasz, green hat (nothing critical)
  ['Bill every hour you work, your skill is worth it.', false],
  ['Ask a second wholesaler for a quote, it costs you nothing.', false],
  ['Cut the costs you can change and keep the ones that bring work.', false],
  ['Set a fair price list and stick to it.', false],
  ['You are in good shape on costs, so keep an eye on parts prices.', false],
  // chair, blue hat
  ['I would start with the reminders and keep the credit line as a backup.', true],
  ['The team agrees on the order: reminders, taxes, then the rest.', true],
  ['You decide, and everything stays simulated until you approve it.', true],
];

describe('commentProblem: refused', () => {
  it.each(REFUSED)('%j (critical %s) → %s', (comment, critical, reason) => {
    expect(commentProblem(comment, critical)).toBe(reason);
  });
});

describe('commentProblem: allowed', () => {
  it.each(ALLOWED)('%j (critical %s)', (comment, critical) => {
    expect(commentProblem(comment, critical)).toBe('');
  });
});
