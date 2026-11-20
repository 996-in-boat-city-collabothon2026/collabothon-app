// STARTER — Pair 3: friendlier labels/explanations per action kind.
import type { ActionKind, AutonomyMode } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { Card, Status } from '../components/ui';

const KINDS: { kind: ActionKind; label: string }[] = [
  { kind: 'ksef_revalidate', label: 'Re-validate rejected KSeF invoices' },
  { kind: 'payment_reminder', label: 'Send payment reminders to clients' },
  { kind: 'tax_payment', label: 'Pay VAT / ZUS / PIT' },
  { kind: 'supplier_payment', label: 'Pay suppliers' },
  { kind: 'credit_line', label: 'Apply for a credit line' },
];

export default function SettingsPage() {
  const { data, loading, error, reload } = useApi(api.settings);

  async function setMode(kind: ActionKind, mode: AutonomyMode) {
    await api.saveSettings({ autonomy: { [kind]: mode } });
    await reload();
  }

  return (
    <div className="space-y-4">
      <Card title="Autonomy: what may the CFOs do alone?">
        <Status loading={loading && !data} error={error} />
        <p className="mb-3 text-sm text-slate-600">Everything is simulated in this demo. "Ask me" means nothing happens without your click.</p>
        <div className="space-y-2">
          {KINDS.map(({ kind, label }) => {
            const mode = data?.autonomy[kind] ?? 'ask';
            return (
              <div key={kind} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                <span>{label}</span>
                <div className="flex overflow-hidden rounded-lg border">
                  {(['auto', 'ask'] as AutonomyMode[]).map((m) => (
                    <button key={m} onClick={() => setMode(kind, m)}
                      className={`px-3 py-1 text-sm ${mode === m ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                      {m === 'auto' ? 'Alone' : 'Ask me'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Demo">
        <button onClick={async () => { await api.resetDemo(); location.reload(); }} className="rounded-lg bg-rose-600 px-4 py-2 text-white">
          Reset demo data
        </button>
      </Card>
    </div>
  );
}
