// Owner: Pair 2. Approval queue + audit log. All execution is SIMULATED.
import type { FastifyPluginAsync } from 'fastify';
import type { Action } from '@cfo/shared';
import { db, logActivity } from '../domain/store';
import { fmtPLN } from '../domain/money';
import { openCreditLine, settlePayment } from '../domain/settle';
import { isCurrentCard, runAutopilot } from '../agents/autopilot';

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
  if (a.kind === 'payment_reminder') return 'Simulated reminder e-mail sent';
  return 'Simulated';
}

const routes: FastifyPluginAsync = async (app) => {
  app.post('/autopilot/run', async () => runAutopilot());

  app.get<{ Querystring: { status?: string } }>('/actions', async (req) =>
    req.query.status ? db.actions.filter((a) => a.status === req.query.status) : db.actions,
  );

  app.post<{ Params: { id: string } }>('/actions/:id/approve', async (req, reply) => {
    const a = db.actions.find((x) => x.id === req.params.id);
    if (!a || a.status !== 'open') return reply.code(404).send({ error: 'No open action with this id' });
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
    if (!a || a.status !== 'open') return reply.code(404).send({ error: 'No open action with this id' });
    a.status = 'rejected';
    logActivity('user', `Rejected: ${a.title}`, false, a.id);
    return a;
  });

  app.get('/activity', async () => db.activity);
};

export default routes;
