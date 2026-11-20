// Owner: Pair 3. KSeF invoice flow (simulated gateway).
import type { FastifyPluginAsync } from 'fastify';
import type { Invoice } from '@cfo/shared';
import { invoiceGrossPLN } from '../domain/fx';
import { invoiceGross } from '../domain/money';
import { db, logActivity, newId } from '../domain/store';
import { buildFa3Xml } from '../ksef/fa3';
import { sendToKsef } from '../ksef/mockGateway';

// The UI never computes money: the list carries the gross (in the invoice currency) and its PLN value.
// Extra fields only – the shared Invoice type is unchanged (web reads them as KsefInvoiceRow).
const withTotals = (inv: Invoice) => ({ ...inv, gross: invoiceGross(inv), grossPLN: invoiceGrossPLN(inv) });

const routes: FastifyPluginAsync = async (app) => {
  app.get('/ksef/invoices', async () => db.invoices.map(withTotals));

  app.post<{ Body: Omit<Invoice, 'id' | 'ksef' | 'paid'> }>('/ksef/invoices', async (req) => {
    const inv: Invoice = { ...req.body, id: newId('inv'), paid: false, ksef: { status: 'draft' } };
    db.invoices.unshift(inv);
    logActivity('user', `Created invoice draft ${inv.number}`, false);
    return inv;
  });

  // Body may contain fixes, e.g. { counterparty: { name, nip } } for "Fix & resend".
  app.post<{ Params: { id: string }; Body: Partial<Pick<Invoice, 'counterparty'>> | undefined }>(
    '/ksef/invoices/:id/send',
    async (req, reply) => {
      const inv = db.invoices.find((i) => i.id === req.params.id);
      if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
      if (inv.ksef.status === 'accepted') return reply.code(409).send({ error: 'Already accepted by KSeF' });
      if (req.body?.counterparty) inv.counterparty = req.body.counterparty;
      sendToKsef(inv);
      return inv;
    },
  );

  app.get<{ Params: { id: string } }>('/ksef/invoices/:id/xml', async (req, reply) => {
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
    return reply.type('application/xml').send(buildFa3Xml(inv, db.shop));
  });

  app.get<{ Params: { id: string } }>('/ksef/invoices/:id/upo', async (req, reply) => {
    const upo = db.invoices.find((i) => i.id === req.params.id)?.ksef.upo;
    return upo ?? reply.code(404).send({ error: 'No UPO yet' });
  });
};

export default routes;
