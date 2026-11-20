// Hat conference: 4 CFOs with their thinking hats around a table. Pick a topic → the turns appear one by one
// with a typing animation → the Blue-hat chair sums up and links to approval cards you can approve right here.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CFOS, HATS, type Action, type BoardroomResult, type CfoId } from '@cfo/shared';
import { TypingDots } from '../components/AskBubble';
import { api } from '../api/client';
import { ActionCard, Card, CfoAvatar, HatAvatar, useToast } from '../components/ui';
import { useT } from '../i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // the server speaks in this order
const TOPICS = ['topic_december', 'topic_month', 'topic_fx', 'topic_margin'];
// Seats around the table (phone-friendly 2×2 + the chair at the head).
const SEAT: Record<CfoId, string> = {
  marek: 'col-start-1 row-start-2', anna: 'col-start-3 row-start-2',
  tomasz: 'col-start-1 row-start-3', kasia: 'col-start-3 row-start-3',
};

type Phase = 'idle' | 'thinking' | 'talking' | 'done' | 'error';

export default function Boardroom() {
  const { t, lang } = useT();
  const [topic, setTopic] = useState(t(TOPICS[0]));
  const [custom, setCustom] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<BoardroomResult | null>(null);
  const [shown, setShown] = useState(0); // turns visible so far
  const [typing, setTyping] = useState<CfoId | 'chair' | null>(null);
  const [decisions, setDecisions] = useState<Action[]>([]);
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});
  const { toast, showToast } = useToast();
  const run = useRef(0); // ignore an old meeting if the user starts a new one
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [shown, typing, phase]);
  useEffect(() => () => { run.current++; }, []); // stop revealing when leaving the page

  async function start(e?: FormEvent) {
    e?.preventDefault();
    const subject = custom.trim() || topic;
    const id = ++run.current;
    setPhase('thinking'); setResult(null); setShown(0); setDecisions([]); setDecided({}); setTyping(ORDER[0]);
    try {
      const r = await api.boardroom(subject);
      if (id !== run.current) return;
      setResult(r); setPhase('talking');
      for (let i = 0; i < r.turns.length; i++) {
        setTyping(r.turns[i].cfo);
        await wait(900); // short "typing…" before each turn
        if (id !== run.current) return;
        setTyping(null); setShown(i + 1);
        await wait(700);
      }
      setTyping('chair');
      const open = await api.actions('open').catch(() => [] as Action[]);
      await wait(700);
      if (id !== run.current) return;
      setDecisions(open.filter((a) => r.decisionActionIds.includes(a.id)));
      setTyping(null); setPhase('done');
    } catch {
      if (id === run.current) { setTyping(null); setPhase('error'); }
    }
  }

  async function decide(a: Action, approve: boolean) {
    try {
      await (approve ? api.approve(a.id) : api.reject(a.id));
      setDecided((d) => ({ ...d, [a.id]: approve ? 'approved' : 'rejected' }));
      showToast(`${t(approve ? 'approved_toast' : 'rejected_toast')} ${a.title}`);
    } catch {
      showToast(t('decision_failed'));
    }
  }

  const busy = phase === 'thinking' || phase === 'talking';
  const speaking = typing && typing !== 'chair' ? typing : result && shown > 0 && phase === 'talking' ? result.turns[shown - 1].cfo : null;
  const chairLabel = lang === 'pl' ? HATS.blue.labelPl : HATS.blue.label;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">👥 {t('boardroom_title')}</h1>
        <p className="text-slate-600">{t('boardroom_intro')}</p>
      </div>

      {/* Topic picker */}
      <Card title={t('topic')}>
        <form onSubmit={start} className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('topic')}>
            {TOPICS.map((k) => {
              const active = !custom.trim() && topic === t(k);
              return (
                <button type="button" key={k} role="radio" aria-checked={active} disabled={busy}
                  onClick={() => { setTopic(t(k)); setCustom(''); }}
                  className={`min-h-12 rounded-full border px-3 text-sm ${active ? 'border-[#0071e3] bg-[#0071e3] text-white' : 'border-stone-300 bg-white'}`}>
                  {t(k)}
                </button>
              );
            })}
          </div>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} disabled={busy}
            placeholder={t('topic_custom')} aria-label={t('topic_custom')}
            className="min-h-12 w-full rounded-xl border border-slate-300 px-3" />
          <button disabled={busy} className="min-h-12 w-full rounded-full bg-[#0071e3] py-3 text-lg font-semibold text-white disabled:opacity-60">
            {busy ? t('meeting_running') : `👥 ${t('start_meeting')}`}
          </button>
        </form>
      </Card>

      {/* The table */}
      <section aria-label={t('boardroom_title')} className="surface p-5">
        <div className="grid grid-cols-[1fr_1.3fr_1fr] items-center gap-y-3">
          <div className="col-span-3 row-start-1 flex flex-col items-center">
            <Seat active={typing === 'chair'} name={t('chair')} role={chairLabel}>
              <HatAvatar letter="P" color="#334155" hat="blue" label={`${t('chair')} · ${chairLabel}`} size={52} />
            </Seat>
          </div>
          <div className="col-start-2 row-span-2 row-start-2 mx-1 flex h-full min-h-28 items-center justify-center rounded-[50%] bg-amber-800/90 text-center text-sm font-semibold text-amber-50 shadow-inner">
            {phase === 'idle' ? '☕' : <span className="px-2">„{custom.trim() || topic}”</span>}
          </div>
          {ORDER.map((c) => (
            <div key={c} className={`flex flex-col items-center ${SEAT[c]}`}>
              <Seat active={speaking === c} dim={busy && speaking !== c} name={CFOS[c].name}
                role={lang === 'pl' ? CFOS[c].rolePl : CFOS[c].role}>
                <CfoAvatar cfo={c} size={52} />
              </Seat>
            </div>
          ))}
        </div>
        {phase === 'thinking' && (
          <p className="mt-4 flex items-center justify-center gap-3 text-slate-600" aria-live="polite">
            <TypingDots /> {t('cfos_thinking')}
          </p>
        )}
      </section>

      {phase === 'error' && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">⚠️ {t('meeting_failed')}</p>
      )}

      {/* Transcript */}
      {result && shown + (typing ? 1 : 0) > 0 && (
        <Card title={t('transcript')}>
          <ol className="space-y-3" aria-live="polite">
            {result.turns.slice(0, shown).map((turn, i) => {
              const hat = HATS[CFOS[turn.cfo].hat];
              return (
                <li key={i} className="flex gap-3">
                  <CfoAvatar cfo={turn.cfo} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {CFOS[turn.cfo].name}
                      <span className="rounded-full border border-slate-300 px-2 py-0.5 text-sm font-medium"
                        style={{ background: hat.color, color: ['white', 'yellow'].includes(CFOS[turn.cfo].hat) ? '#0f172a' : '#fff' }}>
                        {lang === 'pl' ? hat.labelPl : hat.label}
                      </span>
                    </p>
                    <p className="rounded-2xl rounded-tl-sm bg-slate-100 p-3">{turn.text}</p>
                  </div>
                </li>
              );
            })}
            {typing && typing !== 'chair' && phase === 'talking' && (
              <li className="flex items-center gap-3 text-sm text-stone-600">
                <CfoAvatar cfo={typing} size={40} />
                <span className="rounded-2xl bg-slate-100 px-3 py-3"><TypingDots /></span>
                {CFOS[typing].name} {t('is_typing')}
              </li>
            )}
            {typing === 'chair' && (
              <li className="flex items-center gap-3 text-sm text-stone-600">
                <HatAvatar letter="P" color="#334155" hat="blue" label={t('chair')} size={40} />
                <span className="rounded-2xl bg-blue-50 px-3 py-3"><TypingDots /></span> {t('chair_summing')}
              </li>
            )}
          </ol>
        </Card>
      )}

      {/* Blue-hat summary + decisions */}
      {phase === 'done' && result && (
        <section className="space-y-3 rounded-2xl border-2 border-blue-600 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <HatAvatar letter="P" color="#334155" hat="blue" label={`${t('chair')} · ${chairLabel}`} size={44} />
            <div>
              <p className="font-bold text-blue-900">{t('blue_summary')}</p>
              <p className="text-sm text-blue-800">{chairLabel}</p>
            </div>
          </div>
          <p className="text-lg">{result.summary}</p>
          <h2 className="pt-1 font-semibold">✋ {t('decisions_to_approve')} ({decisions.length})</h2>
          {decisions.length === 0 && <p className="text-slate-600">{t('no_decisions')}</p>}
          <div className="space-y-2">
            {decisions.map((a) => decided[a.id] ? (
              <p key={a.id} className={`rounded-xl p-3 font-medium ${decided[a.id] === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200'}`}>
                {decided[a.id] === 'approved' ? '✅' : '✖'} {a.title} · 🧪 {t(`status_${decided[a.id]}`)}
              </p>
            ) : (
              <div key={a.id} className="rounded-xl bg-white">
                <ActionCard action={a} onApprove={() => void decide(a, true)} onReject={() => void decide(a, false)} />
              </div>
            ))}
          </div>
        </section>
      )}
      <div ref={endRef} />
      {toast}
    </div>
  );
}

function Seat({ children, name, role, active = false, dim = false }: {
  children: React.ReactNode; name: string; role: string; active?: boolean; dim?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center transition ${dim ? 'opacity-50' : ''}`}>
      <div className={`rounded-full p-1 transition ${active ? 'bg-amber-300 ring-4 ring-amber-300/60 motion-safe:scale-110' : ''}`}>
        {children}
      </div>
      <p className="mt-1 text-sm font-semibold leading-tight">{name}</p>
      <p className="max-w-24 text-sm leading-tight text-stone-600">{role}</p>
    </div>
  );
}
