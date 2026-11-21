// Approval queue: Approve / Reject → toast, balance refreshes, decision shows in the log below.
import { useState } from 'react';
import type { Action } from '@cfo/shared';
import { api, useApi } from '../api/client';
import { ActionCard, Card, CfoAvatar, FlowStrip, Status, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';
import Icon from '../components/Icon';
import StandingAgent from '../components/StandingAgent';
import { CFOS, type CfoId } from '@cfo/shared';

export default function Approvals() {
  const { t, lang } = useT();
  const { data, loading, error, reload } = useApi(() => api.actions('open'));
  const state = useApi(api.state);
  const log = useApi(api.activity);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const queue = (data ?? []).filter((a) => a.tier === 'NEEDS_APPROVAL');

  async function decide(a: Action, approve: boolean) {
    setBusy(a.id);
    try {
      await (approve ? api.approve(a.id) : api.reject(a.id));
      showToast(`${t(approve ? 'approved_toast' : 'rejected_toast')} ${a.title}`);
    } catch {
      showToast(t('decision_failed'));
    } finally {
      setBusy(null);
      await Promise.all([reload(), state.reload(), log.reload()]); // balance + log update right away
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-gradient pb-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t('approvals')}</h1>
        {data && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm text-accent-ink">{queue.length} {t('waiting')}</span>}
      </div>

      <FlowStrip steps={[t('flow_agent'), t('flow_action'), t('flow_you')]} />

      {/* The team, standing: whoever has a proposal for you nods */}
      <section className="surface px-4 pb-4 pt-5" aria-label={t('team_stage')}>
        <h2 className="px-1 text-xl font-semibold">{t('team_stage')}</h2>
        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(Object.keys(CFOS) as CfoId[]).map((id) => {
            const n = queue.filter((a) => a.cfo === id).length;
            return (
              <li key={id} className="flex flex-col items-center text-center">
                <StandingAgent cfo={id} height={170} speaking={n > 0} />
                <span className="mt-2 text-lg font-bold leading-tight">{CFOS[id].name}</span>
                <span className="text-[15px] leading-tight text-stone-700">{lang === 'pl' ? CFOS[id].rolePl : CFOS[id].role}</span>
                <span className={`mt-2 rounded-full px-3 py-1 text-[15px] font-semibold ${n > 0 ? 'bg-ink text-white' : 'bg-zinc-100 text-stone-700'}`}>
                  {n > 0 ? `${n} ${t('to_decide')}` : t('nothing_waiting')}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div aria-live="polite" className="flex items-baseline justify-between surface px-5 py-4">
        <span className="text-stone-600">{t('balance')}</span>
        <strong className="text-xl tabular-nums">{state.data ? fmtPLN(state.data.kpis.balancePLN) : '…'}</strong>
      </div>

      <Card>
        <Status loading={loading && !data} error={error} />
        {data && queue.length === 0 && <p className="py-6 text-center text-lg text-stone-600">{t('all_done')}</p>}
        <div className="space-y-3">
          {queue.map((a) => (
            <div key={a.id} className={busy === a.id ? 'pointer-events-none opacity-60' : ''}>
              <ActionCard action={a} onApprove={() => void decide(a, true)} onReject={() => void decide(a, false)} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('recent_decisions')}>
        <Status loading={log.loading && !log.data} error={log.error} />
        {log.data && log.data.length === 0 && <p className="text-stone-600">{t('nothing_here')}</p>}
        <ul className="space-y-3">
          {(log.data ?? []).slice(0, 6).map((e) => (
            <li key={e.id} className="flex items-center gap-3 text-sm">
              {e.actor !== 'user' && e.actor !== 'system'
                ? <CfoAvatar cfo={e.actor} size={30} />
                : <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-zinc-200"><Icon name="user" size={16} /></span>}
              <span className="flex-1">{e.text}</span>
              {e.simulated && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-sm">symulacja</span>}
            </li>
          ))}
        </ul>
      </Card>
      {toast}
    </div>
  );
}
