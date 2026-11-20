// Owner: Pair 2. Approval queue + audit log. All execution is SIMULATED.
import type { FastifyPluginAsync } from 'fastify';
import type { Action, ActionKind } from '@cfo/shared';
import { db, logActivity } from '../domain/store';
import { fmtPLN } from '../domain/money';
import { openCreditLine, settlePayment } from '../domain/settle';
import { isCurrentCard, runAutopilot } from '../agents/autopilot';
import { fmtFx, fmtRate, fxExposures } from '../rules/fx';
import { latestRate } from '../domain/fx';

/** Kinds that only need an activity line (today they are advice, so approve refuses them; kept for completeness). */
const NOTE: Partial<Record<ActionKind, string>> = {
  deposit: 'Simulated term deposit opened',
  pricing: 'Simulated: new price list noted',
  cost_cut: 'Simulated: cost cut noted',
  ksef_fix: 'Simulated: invoice corrected and resent to KSeF',
  ksef_revalidate: 'Simulated: invoice re-validated in KSeF',
};

/** What "doing it" means in the simulation. Pair 2: extend per action kind. */
function simulateExecution(a: Action): string {
  if ((a.kind === 'tax_payment' || a.kind === 'supplier_payment') && a.amountPLN) {
    settlePayment(a.amountPLN, a.refId);
    return `Simulated payment of ${fmtPLN(a.amountPLN)}`;
  }
  if (a.kind === 'credit_line' && a.amountPLN) {
    openCreditLine(a.amountPLN);
    return `Simulated credit line of ${fmtPLN(a.amountPLN)} opened, money available on the account`;
  }
  if (a.kind === 'fx_hedge') {
    // The card passed isCurrentCard, so today's exposure is exactly the one the card was made for.
    const currency = db.invoices.find((i) => i.id === a.refId)?.currency;
    const e = fxExposures().find((x) => x.currency === currency);
    if (e) {
      const side = e.net > 0 ? 'buy' : 'sell';
      return `Simulated forward contract: ${side} ${fmtFx(Math.abs(e.net), e.currency)} @ ${fmtRate(latestRate(e.currency))}`;
    }
  }
  if (a.kind === 'payment_reminder') {
    const name = db.invoices.find((i) => i.id === a.refId)?.counterparty.name;
    return name ? `Simulated reminder e-mail to ${name}` : 'Simulated reminder e-mail sent';
  }
  return NOTE[a.kind] ?? 'Simulated';
}

/** Golden rule 3: a card that was already approved, rejected or auto-done is answered with 409 (an unknown id: 404). */
const alreadyHandled = (a: Action) => ({ error: `This card is already ${a.status === 'auto_done' ? 'done' : a.status}.` });

const routes: FastifyPluginAsync = async (app) => {
  app.post('/autopilot/run', async () => runAutopilot());

  app.get<{ Querystring: { status?: string } }>('/actions', async (req) =>
    req.query.status ? db.actions.filter((a) => a.status === req.query.status) : db.actions,
  );

  app.post<{ Params: { id: string } }>('/actions/:id/approve', async (req, reply) => {
    const a = db.actions.find((x) => x.id === req.params.id);
    if (!a) return reply.code(404).send({ error: 'No action with this id' });
    if (a.status !== 'open') return reply.code(409).send(alreadyHandled(a));
    // Only NEEDS_APPROVAL cards are decisions. RECOMMENDED / ANALYSED cards are advice: the owner acts on them directly.
    if (a.tier !== 'NEEDS_APPROVAL') {
      return reply.code(400).send({ error: 'This card is advice only. There is nothing to approve.' });
    }
    // Check the current proposal before changing status or simulating execution.
    if (!isCurrentCard(a)) {
      return reply.code(409).send({ error: 'This proposal is out of date. Run the check again for a fresh proposal.' });
    }
    a.status = 'approved';
    logActivity('user', `Approved: ${a.title}. ${simulateExecution(a)}`, true, a.id);
    return a;
  });

  app.post<{ Params: { id: string } }>('/actions/:id/reject', async (req, reply) => {
    const a = db.actions.find((x) => x.id === req.params.id);
    if (!a) return reply.code(404).send({ error: 'No action with this id' });
    if (a.status !== 'open') return reply.code(409).send(alreadyHandled(a));
    a.status = 'rejected';
    logActivity('user', `Rejected: ${a.title}`, false, a.id);
    return a;
  });

  app.get('/activity', async () => db.activity);
};

export default routes;
