// Owner: Pair 3. KSeF invoice flow (simulated gateway).
import type { FastifyPluginAsync } from 'fastify';
import type { Invoice } from '@cfo/shared';
import { invoiceGrossPLN } from '../domain/fx';
import { invoiceGross } from '../domain/money';
import { db, logActivity, newId } from '../domain/store';
import { buildFa3Xml } from '../ksef/fa3';
import { sendToKsef } from '../ksef/mockGateway';
import { parseInvoiceText } from '../ksef/parseInvoice';
import { NotConfiguredError, transcribe, whisperConfig } from '../ksef/transcribe';
import { addDays } from '../domain/money';

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

  // Speech → text (Whisper on OpenShift AI). Raw audio body (audio/webm, audio/ogg, …), max 10 MB, only in this plugin.
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.get('/ksef/transcribe/status', async () => ({ ready: !!whisperConfig().baseUrl }));
  app.post<{ Querystring: { lang?: string } }>('/ksef/transcribe', async (req, reply) => {
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'No audio' });
    try {
      const text = await transcribe(audio, String(req.headers['content-type'] ?? 'audio/webm'), req.query.lang === 'en' ? 'en' : 'pl');
      return { text };
    } catch (e) {
      if (e instanceof NotConfiguredError) return reply.code(503).send({ error: 'not_configured' });
      req.log.warn({ err: (e as Error).message }, 'whisper failed');
      return reply.code(502).send({ error: 'whisper_failed' });
    }
  });

  // "Add invoice" from one sentence (typed or spoken): a draft to check, nothing is saved or sent yet.
  // Dates and the next number come from the server (rules), never from the model.
  app.post<{ Body: { text?: string } }>('/ksef/parse', async (req, reply) => {
    const text = (req.body?.text ?? '').trim().slice(0, 600);
    if (!text) return reply.code(400).send({ error: 'Empty text' });
    const parsed = await parseInvoiceText(text);
    const prefix = `FV/${db.shop.today.slice(0, 4)}/${db.shop.today.slice(5, 7)}/`;
    const last = Math.max(0, ...db.invoices.filter((i) => i.number.startsWith(prefix)).map((i) => Number(i.number.slice(prefix.length)) || 0));
    return {
      ...parsed,
      number: `${prefix}${String(last + 1).padStart(3, '0')}`,
      issueDate: db.shop.today,
      dueDate: addDays(db.shop.today, 14),
    };
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
