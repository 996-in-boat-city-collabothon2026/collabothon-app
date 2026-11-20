// KSeF invoices (simulated gateway): currency column, Fix & resend with NIP checksum, XML / UPO viewer.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Invoice, KsefStatus } from '@cfo/shared';
import { api, useApi, type KsefInvoiceRow } from '../api/client';
import { Card, Sheet, Status, fmtDay, fmtMoney, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';
import { normalizeNip, nipProblem } from '../lib/nip';

const CHIP: Record<KsefStatus, { icon: string; cls: string }> = {
  draft: { icon: '📝', cls: 'bg-slate-200 text-slate-800' },
  processing: { icon: '⏳', cls: 'bg-amber-100 text-amber-800' },
  accepted: { icon: '✅', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { icon: '❌', cls: 'bg-rose-100 text-rose-800' },
};

const BTN = 'min-h-12 rounded-full px-4 text-sm font-semibold';
// Desktop: one row per invoice in columns. Phone: the same cells stack into a card.
const ROW = 'grid gap-x-3 gap-y-2 md:grid-cols-[1.2fr_1.7fr_1.1fr_0.6fr_1.5fr_auto] md:items-center';

type Viewer = { kind: 'XML' | 'UPO'; inv: KsefInvoiceRow };

export default function Ksef() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi(api.invoices);
  const [fixing, setFixing] = useState<KsefInvoiceRow | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const { toast, showToast } = useToast();
  const watching = useRef(new Set<string>()); // invoices we sent and wait for KSeF's answer

  const rows = data ?? [];
  const processing = rows.some((i) => i.ksef.status === 'processing');

  // Simulated KSeF answers after ~2 s: poll while something is processing, then tell the user.
  useEffect(() => {
    for (const inv of rows) {
      if (!watching.current.has(inv.id) || inv.ksef.status === 'processing') continue;
      watching.current.delete(inv.id);
      showToast(inv.ksef.status === 'accepted'
        ? `${t('sent_accepted')} ${inv.number}`
        : `${t('sent_rejected')} ${inv.ksef.rejectionReason ?? inv.number}`);
    }
    if (!processing) return;
    const id = window.setTimeout(reload, 1000);
    return () => window.clearTimeout(id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(inv: KsefInvoiceRow, fix?: Pick<Invoice, 'counterparty'>) {
    try {
      watching.current.add(inv.id);
      await api.sendInvoice(inv.id, fix);
    } catch {
      watching.current.delete(inv.id);
      showToast(t('send_failed'));
    }
    await reload();
  }

  const sales = rows.filter((i) => i.direction === 'sales');
  const purchases = rows.filter((i) => i.direction === 'purchase');
  const toFix = sales.filter((i) => i.ksef.status === 'rejected').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">{t('ksef_title')}</h1>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-sm font-medium text-violet-800">🧪 {t('ksef_sim_badge')}</span>
      </div>
      <p className="rounded-xl bg-violet-50 px-4 py-3 text-violet-900">🧪 {t('ksef_sim_notice')}</p>

      <Status loading={loading && !data} error={error} />
      {data && rows.length === 0 && <Card><p className="text-stone-600">{t('nothing_here')}</p></Card>}

      {sales.length > 0 && (
        <Card title={
          <span className="flex flex-wrap items-center gap-2">
            {t('sales_invoices')}
            {toFix > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-sm text-rose-800">{toFix} {t('to_fix')}</span>}
          </span>
        }>
          <InvoiceTable rows={sales} onSend={(i) => void send(i)} onFix={setFixing} onView={setViewer} />
        </Card>
      )}
      {purchases.length > 0 && (
        <Card title={t('purchase_invoices')}>
          <InvoiceTable rows={purchases} onView={setViewer} />
        </Card>
      )}

      {fixing && (
        <FixSheet inv={fixing} onClose={() => setFixing(null)}
          onSubmit={(counterparty) => { const inv = fixing; setFixing(null); void send(inv, { counterparty }); }} />
      )}
      {viewer && <DocSheet viewer={viewer} onClose={() => setViewer(null)} />}
      {toast}
    </div>
  );
}

function InvoiceTable({ rows, onSend, onFix, onView }: {
  rows: KsefInvoiceRow[];
  onSend?: (inv: KsefInvoiceRow) => void;
  onFix?: (inv: KsefInvoiceRow) => void;
  onView: (v: Viewer) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-2 md:space-y-0 md:divide-y md:divide-slate-200">
      <div className={`${ROW} hidden pb-2 text-sm font-semibold uppercase text-stone-600 md:grid`}>
        <span>{t('col_invoice')}</span><span>{t('col_buyer')}</span><span className="text-right">{t('col_amount')}</span>
        <span>{t('col_currency')}</span><span>{t('col_status')}</span><span>{t('col_docs')}</span>
      </div>
      {rows.map((inv) => {
        const cur = inv.currency ?? 'PLN';
        const status = inv.ksef.status;
        const busy = status === 'processing';
        return (
          <div key={inv.id} className={`${ROW} rounded-xl border p-3 md:rounded-none md:border-0 md:px-0 md:py-3
            ${status === 'rejected' ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200'}`}>
            <div>
              <p className="font-semibold">{inv.number}</p>
              <p className="text-sm text-stone-600">{fmtDay(inv.issueDate)}</p>
            </div>
            <div className="min-w-0">
              <p className="break-words">{inv.counterparty.name}</p>
              <p className="text-sm text-stone-600">NIP {inv.counterparty.nip}</p>
            </div>
            <div className="md:text-right">
              <p className="font-semibold tabular-nums">
                {fmtMoney(inv.gross, cur)}
                <span className={`ml-2 rounded-md px-1.5 py-0.5 text-sm font-bold md:hidden ${cur === 'PLN' ? 'bg-slate-100' : 'bg-blue-100 text-blue-800'}`}>{cur}</span>
              </p>
              {cur !== 'PLN' && <p className="text-sm text-stone-600">≈ {fmtPLN(inv.grossPLN)}</p>}
            </div>
            <div className="hidden md:block">
              <span className={`rounded-md px-1.5 py-0.5 text-sm font-bold ${cur === 'PLN' ? 'bg-slate-100' : 'bg-blue-100 text-blue-800'}`}>{cur}</span>
            </div>
            <div className="min-w-0">
              <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${CHIP[status].cls}`}>
                {CHIP[status].icon} {t(`ks_${status}`)}
              </span>
              {inv.ksef.ksefNumber && <p className="mt-1 break-all font-mono text-sm text-stone-600">{inv.ksef.ksefNumber}</p>}
              {inv.ksef.rejectionReason && <p className="mt-1 text-sm text-rose-700">{inv.ksef.rejectionReason}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onView({ kind: 'XML', inv })} className={`${BTN} border border-slate-300 bg-white`}>XML</button>
              <button onClick={() => onView({ kind: 'UPO', inv })} disabled={!inv.ksef.upo}
                className={`${BTN} border border-slate-300 bg-white disabled:opacity-40`}>UPO</button>
            </div>
            {onSend && status === 'draft' && (
              <button onClick={() => onSend(inv)} className={`${BTN} bg-[#0071e3] text-white md:col-span-6 md:justify-self-end`}>
                {t('send_ksef')}
              </button>
            )}
            {onFix && (status === 'rejected' || busy) && (
              <button onClick={() => onFix(inv)} disabled={busy}
                className={`${BTN} bg-rose-600 text-white disabled:opacity-50 md:col-span-6 md:justify-self-end`}>
                {busy ? t('ks_processing') : t('fix_resend')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FixSheet({ inv, onClose, onSubmit }: {
  inv: KsefInvoiceRow;
  onClose: () => void;
  onSubmit: (counterparty: Invoice['counterparty']) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(inv.counterparty.name);
  const [nip, setNip] = useState(inv.counterparty.nip);
  const nipErr = nipProblem(nip);
  const nameErr = name.trim() ? null : 'name_empty';
  const input = 'min-h-12 w-full rounded-xl border px-3 font-normal';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (nipErr || nameErr) return;
    onSubmit({ name: name.trim(), nip: normalizeNip(nip) });
  }

  return (
    <Sheet title={`${t('fix_resend')} · ${inv.number}`} onClose={onClose}>
      {inv.ksef.rejectionReason && <p className="rounded-2xl bg-rose-50 p-3 text-rose-800">KSeF: {inv.ksef.rejectionReason}</p>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block space-y-1 font-semibold">
          <span>{t('buyer_name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameErr}
            className={`${input} ${nameErr ? 'border-rose-500' : 'border-slate-300'}`} />
          {nameErr && <span className="block text-sm font-normal text-rose-700">{t(nameErr)}</span>}
        </label>
        <label className="block space-y-1 font-semibold">
          <span>{t('buyer_nip')}</span>
          <input value={nip} onChange={(e) => setNip(e.target.value)} inputMode="numeric" autoComplete="off"
            aria-invalid={!!nipErr} aria-describedby="nip-hint"
            className={`${input} ${nipErr ? 'border-rose-500 bg-rose-50' : 'border-emerald-500'}`} />
          <span id="nip-hint" className={`block text-sm font-normal ${nipErr ? 'text-rose-700' : 'text-emerald-700'}`}>
            {nipErr ? t(nipErr) : t('nip_ok')}
          </span>
        </label>
        <button disabled={!!nipErr || !!nameErr}
          className="min-h-12 w-full rounded-full bg-[#0071e3] font-semibold text-white disabled:opacity-40">
          {t('resend_btn')}
        </button>
      </form>
    </Sheet>
  );
}

function DocSheet({ viewer, onClose }: { viewer: Viewer; onClose: () => void }) {
  const { t } = useT();
  const xml = useApi(() => (viewer.kind === 'XML' ? api.invoiceXml(viewer.inv.id) : Promise.resolve('')), [viewer]);
  const upo = viewer.inv.ksef.upo;
  return (
    <Sheet title={`${viewer.kind} · ${viewer.inv.number}`} onClose={onClose}>
      <p className="text-sm text-stone-600">{viewer.kind === 'XML' ? t('xml_hint') : t('upo_hint')} · 🧪 {t('simulated')}</p>
      {viewer.kind === 'XML' ? (
        <>
          <Status loading={xml.loading} error={xml.error} />
          {xml.data && <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm leading-relaxed text-slate-100">{xml.data}</pre>}
        </>
      ) : upo ? (
        <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {[
            [t('upo_number'), upo.ksefNumber],
            [t('upo_ref'), upo.referenceNumber],
            [t('upo_received'), new Date(upo.receivedAt).toLocaleString('pl-PL')],
          ].map(([k, v]) => (
            <div key={k} className="p-3">
              <dt className="text-sm text-stone-600">{k}</dt>
              <dd className="break-all font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-stone-600">{t('nothing_here')}</p>
      )}
    </Sheet>
  );
}
