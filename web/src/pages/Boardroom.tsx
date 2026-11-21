// Agents' meeting: pick a topic → the 4 CFOs speak one by one (typing dots, then a bubble) →
// a joint recommendation card with the decisions you can approve or reject right here.
// The amounts and decisions come from the server (rules engine); the UI only shows them.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CFOS, type Action, type BoardroomResult, type CfoId } from '@cfo/shared';
import { TypingDots } from '../components/AskBubble';
import ChatThread from '../components/ChatThread';
import { newChat, saveChat, type Chat } from '../lib/chats';
import { api } from '../api/client';
import Icon from '../components/Icon';
import { CfoAvatar, PageHeader, fmtDay, fmtPLN, useToast } from '../components/ui';
import { useT } from '../i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // the server speaks in this order
const TOPICS = ['topic_december', 'topic_month', 'topic_fx', 'topic_margin'];

type Phase = 'idle' | 'thinking' | 'talking' | 'done' | 'error';

/** Neutral round avatar with initials; the speaker gets an accent ring. */
function Person({ cfo, size = 44, active = false }: { cfo: CfoId; size?: number; active?: boolean }) {
  return (
    <span className={`relative inline-flex shrink-0 rounded-full ${active ? 'agent-speaking ring-4 ring-accent' : ''}`}>
      <CfoAvatar cfo={cfo} size={size} />
      {active && <span className="live-dot absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-accent" />}
    </span>
  );
}

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
  const [chat, setChat] = useState<Chat | null>(null); // the finished meeting, saved so it can be continued
  const { toast, showToast } = useToast();
  const run = useRef(0); // ignore an old meeting if the user starts a new one
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [shown, typing, phase]);
  useEffect(() => () => { run.current++; }, []); // stop revealing when leaving the page

  // While the model on OpenShift AI is thinking (up to ~24 s), count the seconds so the page never looks frozen.
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (phase !== 'thinking') return;
    setSecs(0);
    const timer = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function start(e?: FormEvent) {
    e?.preventDefault();
    const subject = custom.trim() || topic;
    const id = ++run.current;
    setPhase('thinking'); setResult(null); setShown(0); setDecisions([]); setDecided({}); setChat(null); setTyping(ORDER[0]);
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
      // Save the meeting as a chat (this device only), so the owner can keep asking or reopen it later.
      const saved = newChat(subject, 'meeting', [
        ...r.turns.map((turn) => ({ from: 'cfo' as const, cfo: turn.cfo, text: turn.text })),
        { from: 'chair' as const, text: r.summary },
      ]);
      saveChat(saved);
      setChat(saved);
      setTyping(null); setPhase('done');
    } catch {
      if (id === run.current) { setTyping(null); setPhase('error'); }
    }
  }

  /** Back to the topic picker. The finished meeting stays saved under "Previous chats". */
  function newMeeting() {
    run.current++; // stop revealing a meeting that is still running
    setPhase('idle'); setResult(null); setShown(0); setTyping(null); setDecisions([]); setDecided({}); setChat(null);
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
  const speaking = typing && typing !== 'chair' ? typing : null;
  const subject = custom.trim() || topic;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Chat mode (after "Start meeting"): a compact header instead of the topic picker */}
      {phase !== 'idle' && (
        <section className="surface space-y-3 p-4 sm:p-5 lg:sticky lg:top-16 lg:z-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={newMeeting} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 font-semibold hover:bg-zinc-50">
              ← {t('chat_new_meeting')}
            </button>
            <Link to="/chat" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold text-blue hover:bg-zinc-50">
              <Icon name="chat" size={18} /> {t('chat_previous')}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ul className="flex -space-x-2" aria-label={t('topic')}>
              {ORDER.map((c) => <li key={c} className={speaking === c ? 'z-10' : busy ? 'opacity-60' : ''}><Person cfo={c} size={40} active={speaking === c} /></li>)}
            </ul>
            {/* Phones: the topic gets its own line under the avatars */}
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <h1 className="break-words text-xl font-semibold leading-tight sm:text-2xl">„{subject}”</h1>
              <p className="text-sm text-zinc-700" aria-live="polite">
                {phase === 'thinking' && <span className="ai-shimmer font-semibold">{t('cfos_thinking')} {secs > 0 && `${secs} s`}</span>}
                {phase === 'talking' && t('meeting_running')}
                {phase === 'done' && t('meeting_done')}
                {phase === 'error' && <span className="font-semibold text-accent-ink">{t('meeting_failed')}</span>}
              </p>
            </div>
            {phase === 'error' && (
              <button onClick={() => void start()} className="min-h-11 rounded-full bg-ink px-5 font-semibold text-white">{t('chat_retry')}</button>
            )}
          </div>
          {phase === 'thinking' && <p className="text-sm text-stone-600">{t('thinking_note')}</p>}
        </section>
      )}

      {phase === 'idle' && <>
      <PageHeader title={t('boardroom_title')} />
      <p className="-mt-3 text-lg text-zinc-700">{t('boardroom_intro')}</p>

      {/* AI orb + topic chips */}
      <section className="surface flex flex-col items-center p-6 text-center">
        <div className={`ai-orb flex h-28 w-28 items-center justify-center ${busy ? '' : 'motion-safe:[animation-duration:5s]'}`} aria-hidden="true">
          {busy
            ? <span className="wave">{[0, 120, 240, 120, 0].map((d, i) => <span key={i} style={{ animationDelay: `${d}ms` }} />)}</span>
            : <Icon name="users" size={34} className="text-white" />}
        </div>
        {/* Only shown before a meeting: once it starts, the chat-mode header above takes over */}
        <p className="mt-3 text-lg font-semibold">{t('pick_topic')}</p>

        <form onSubmit={start} className="mt-4 w-full space-y-3">
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label={t('topic')}>
            {TOPICS.map((k) => {
              const active = !custom.trim() && topic === t(k);
              return (
                <button type="button" key={k} role="radio" aria-checked={active} disabled={busy}
                  onClick={() => { setTopic(t(k)); setCustom(''); }}
                  className={`min-h-12 rounded-full px-4 text-base font-medium ${active ? 'bg-accent font-semibold text-white' : 'bg-zinc-100 text-ink hover:bg-zinc-200'}`}>
                  {t(k)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} disabled={busy}
              placeholder={t('topic_custom')} aria-label={t('topic_custom')}
              className="min-h-12 min-w-40 flex-1 rounded-full bg-zinc-100 px-5 text-base" />
            <button disabled={busy} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-50">
              {busy ? t('meeting_running') : t('start_meeting')} <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>

        {/* Who is at the table */}
        <ul className="mt-6 grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
          {ORDER.map((c) => (
            <li key={c} className={`flex flex-col items-center gap-2 rounded-2xl px-2 pb-3 pt-6 text-center transition ${speaking === c ? 'bg-accent-soft' : ''} ${busy && speaking !== c ? 'opacity-60' : ''}`}>
              <Person cfo={c} size={56} active={speaking === c} />
              <span className="min-w-0">
                <span className="block text-base font-bold leading-tight">{CFOS[c].name}</span>
                <span className="block text-sm leading-tight text-zinc-700">{lang === 'pl' ? CFOS[c].rolePl : CFOS[c].role}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      </>}

      {/* The conversation */}
      {result && shown + (typing ? 1 : 0) > 0 && (
        <section className="surface p-5" aria-label={t('transcript')}>
          <ol className="space-y-4" aria-live="polite">
            {result.turns.slice(0, shown).map((turn, i) => (
              <li key={i} className="turn-in flex items-start gap-3">
                <Person cfo={turn.cfo} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 font-semibold">
                    {CFOS[turn.cfo].name} <span className="font-normal text-zinc-700">· {lang === 'pl' ? CFOS[turn.cfo].rolePl : CFOS[turn.cfo].role}</span>
                  </p>
                  <p className="rounded-3xl rounded-tl-md bg-zinc-100 px-4 py-3 text-[17px] leading-relaxed">{turn.text}</p>
                </div>
              </li>
            ))}
            {typing && typing !== 'chair' && phase === 'talking' && (
              <li className="pop-in flex items-center gap-3">
                <Person cfo={typing} size={44} active />
                <span className="rounded-3xl bg-zinc-100 px-4 py-3"><TypingDots /></span>
                <span className="text-zinc-700">{CFOS[typing].name} {t('is_typing')}</span>
              </li>
            )}
            {typing === 'chair' && (
              <li className="pop-in flex items-center gap-3">
                <span className="ai-orb h-10 w-10" aria-hidden="true" />
                <span className="ai-shimmer font-semibold">{t('chair_summing')}</span>
              </li>
            )}
          </ol>
        </section>
      )}

      {/* Joint recommendation */}
      {phase === 'done' && result && (
        <section className="surface pop-in space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white"><Icon name="sparkle" size={20} /></span>
            <h2 className="text-2xl font-semibold tracking-tight">{t('joint_recommendation')}</h2>
          </div>
          <p className="text-lg leading-relaxed">{result.summary}</p>

          {decisions.length === 0 && <p className="text-zinc-700">{t('no_decisions')}</p>}
          <ul className="space-y-3">
            {decisions.map((a) => (
              <li key={a.id} className="rounded-3xl bg-zinc-100 p-4">
                <p className="text-lg font-semibold">{a.title}</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                  {a.amountPLN !== undefined && <strong className="text-3xl font-bold tabular-nums">{fmtPLN(a.amountPLN)}</strong>}
                  {a.dueDate && <span className="text-zinc-700">{t('due')} {fmtDay(a.dueDate)}</span>}
                  <span className="text-sm text-zinc-700">{t('simulated')}</span>
                </p>
                {decided[a.id] ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold">
                    <Icon name={decided[a.id] === 'approved' ? 'check' : 'x'} size={18} className={decided[a.id] === 'approved' ? 'text-accent' : ''} />
                    {t(`status_${decided[a.id]}`)}
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void decide(a, true)} className="min-h-14 flex-1 rounded-full bg-accent text-lg font-bold text-white">{t('approve')}</button>
                    <button onClick={() => void decide(a, false)} className="min-h-14 flex-1 rounded-full bg-white text-lg font-semibold text-ink">{t('reject')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Keep talking: follow-up questions to the agents, saved with the meeting */}
      {phase === 'done' && result && chat && (
        <section className="surface pop-in space-y-4 p-6" aria-label={t('chat_keep_talking')}>
          <h2 className="text-2xl font-semibold tracking-tight">{t('chat_keep_talking')}</h2>
          <ChatThread chat={chat} onChange={setChat} skip={result.turns.length + 1} />
        </section>
      )}
      <div ref={endRef} />
      {toast}
    </div>
  );
}
