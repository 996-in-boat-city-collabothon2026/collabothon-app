// STARTER — Pair 3: typing animation, nicer table layout, "Approve decision" buttons.
import { useState } from 'react';
import { CFOS, type BoardroomResult, type CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { Card, CfoAvatar } from '../components/ui';
import { useT } from '../i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Boardroom() {
  const { t } = useT();
  const [result, setResult] = useState<BoardroomResult | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [askCfo, setAskCfo] = useState<CfoId>('anna');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  async function start() {
    setBusy(true);
    setResult(null);
    setShown(0);
    try {
      const r = await api.boardroom();
      setResult(r);
      for (let i = 1; i <= r.turns.length; i++) {
        await wait(1200); // reveal turns one by one
        setShown(i);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex justify-around">
          {(Object.keys(CFOS) as CfoId[]).map((c) => (
            <div key={c} className="text-center">
              <CfoAvatar cfo={c} size={52} />
              <p className="mt-1 text-sm font-semibold">{CFOS[c].name}</p>
              <p className="text-xs text-slate-500">{CFOS[c].role}</p>
            </div>
          ))}
        </div>
        <button onClick={start} disabled={busy} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-60">
          {busy && !result ? 'The CFOs are thinking…' : `👥 ${t('start_meeting')}`}
        </button>
      </Card>

      {result && (
        <Card>
          <div className="space-y-3">
            {result.turns.slice(0, shown).map((turn) => (
              <div key={turn.cfo} className="flex gap-3">
                <CfoAvatar cfo={turn.cfo} size={36} />
                <p className="rounded-xl bg-slate-100 p-3">{turn.text}</p>
              </div>
            ))}
          </div>
          {shown === result.turns.length && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3">
              <p className="font-semibold">Decision</p>
              <p>{result.summary}</p>
              <p className="mt-1 text-sm text-slate-600">{result.decisionActionIds.length} item(s) waiting in Approvals.</p>
            </div>
          )}
        </Card>
      )}

      <Card title="Ask a CFO">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={askCfo} onChange={(e) => setAskCfo(e.target.value as CfoId)} className="rounded-lg border p-2">
            {(Object.keys(CFOS) as CfoId[]).map((c) => <option key={c} value={c}>{CFOS[c].name}</option>)}
          </select>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Can I afford a new lift?"
            className="flex-1 rounded-lg border p-2" />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-white"
            onClick={async () => setAnswer((await api.ask(question, askCfo)).text)} disabled={!question}>Ask</button>
        </div>
        {answer && <p className="mt-3 rounded-xl bg-slate-100 p-3">{answer}</p>}
      </Card>
    </div>
  );
}
