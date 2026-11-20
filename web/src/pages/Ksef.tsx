// STARTER — Pair 3: "Fix & resend" form for rejected invoices, nicer XML/UPO viewers.
import { useState } from 'react';
import type { Invoice, KsefStatus } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, Status } from '../components/ui';

const CHIP: Record<KsefStatus, string> = {
  draft: 'bg-slate-200',
  processing: 'bg-sky-100 text-sky-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

export default function Ksef() {
  const { data, loading, error, reload } = useApi(api.invoices);
  const [viewer, setViewer] = useState<string | null>(null);

  async function send(inv: Invoice) {
    await api.sendInvoice(inv.id);
    await reload();
    setTimeout(reload, 2500); // simulated KSeF answers after ~2 s
  }

  return (
    <div className="space-y-4">
      <Card title="KSeF invoices · 🧪 simulated gateway">
        <Status loading={loading && !data} error={error} />
        <div className="space-y-2">
          {(data ?? []).map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{inv.number} · {inv.counterparty.name}</p>
                <p className="text-sm text-slate-500">{inv.direction} · {inv.issueDate}</p>
                {inv.ksef.rejectionReason && <p className="text-sm text-rose-700">{inv.ksef.rejectionReason}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-sm ${CHIP[inv.ksef.status]}`}>{inv.ksef.status}</span>
              {inv.direction === 'sales' && (inv.ksef.status === 'draft' || inv.ksef.status === 'rejected') && (
                <button onClick={() => send(inv)} className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white">Send to KSeF</button>
              )}
              <button onClick={async () => setViewer(await api.invoiceXml(inv.id))} className="rounded-lg bg-slate-200 px-3 py-1 text-sm">XML</button>
              {inv.ksef.upo && (
                <button onClick={() => setViewer(JSON.stringify(inv.ksef.upo, null, 2))} className="rounded-lg bg-slate-200 px-3 py-1 text-sm">UPO</button>
              )}
            </div>
          ))}
        </div>
      </Card>
      {viewer && (
        <Card title={<span className="flex justify-between">Preview <button onClick={() => setViewer(null)}>✕</button></span>}>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{viewer}</pre>
        </Card>
      )}
    </div>
  );
}
