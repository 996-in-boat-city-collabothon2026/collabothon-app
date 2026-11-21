// A chat with the agents that you can keep going (Pair 1, Nara). Used under a finished meeting and on the
// full-screen Chats page. Every question goes to the same POST /api/ask as the advice bubble: the answer is
// built from the rules (the model only picks points), so numbers are never invented here.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CFOS, type CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { useT } from '../i18n';
import { saveChat, type Chat, type ChatMsg } from '../lib/chats';
import { TypingDots } from './AskBubble';
import Icon from './Icon';
import { CfoAvatar } from './ui';

const AGENTS: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];

export function ChatMessage({ m }: { m: ChatMsg }) {
  const { t, lang } = useT();
  if (m.from === 'me') {
    return <li className="max-w-[85%] self-end rounded-3xl rounded-br-md bg-ink px-4 py-3 text-[17px] text-white">{m.text}</li>;
  }
  if (m.from === 'chair') {
    return (
      <li className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white"><Icon name="sparkle" size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-semibold">{t('joint_recommendation')}</p>
          <p className="rounded-3xl rounded-tl-md bg-accent-soft px-4 py-3 text-[17px] leading-relaxed">{m.text}</p>
        </div>
      </li>
    );
  }
  const c = m.cfo ? CFOS[m.cfo] : undefined;
  return (
    <li className="flex items-start gap-3">
      {m.cfo ? <CfoAvatar cfo={m.cfo} size={44} /> : <span className="ai-orb h-11 w-11 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        {c && <p className="mb-1 font-semibold">{c.name} <span className="font-normal text-zinc-700">· {lang === 'pl' ? c.rolePl : c.role}</span></p>}
        <p className="rounded-3xl rounded-tl-md bg-zinc-100 px-4 py-3 text-[17px] leading-relaxed">{m.text}</p>
      </div>
    </li>
  );
}

/**
 * Shows `chat` (optionally without its first `skip` messages, when they are already on screen) and a box to ask more.
 * Every new message is saved right away, so the chat is still there after a reload.
 */
export default function ChatThread({ chat, onChange, skip = 0, autoFocus = false }: {
  chat: Chat; onChange: (c: Chat) => void; skip?: number; autoFocus?: boolean;
}) {
  const { t } = useT();
  const [input, setInput] = useState('');
  const [to, setTo] = useState<CfoId | undefined>(undefined); // undefined = the right agent is picked by topic
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.messages.length, busy]);

  function update(messages: ChatMsg[]) {
    const next = { ...chat, messages, title: chat.title || messages[0]?.text.slice(0, 60) || t('chat_untitled') };
    saveChat(next);
    onChange(next);
    return next;
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    const withQ = update([...chat.messages, { from: 'me', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.ask(q, to);
      update([...withQ.messages, { from: 'cfo', cfo: res.cfo, text: res.text }]);
    } catch {
      update([...withQ.messages, { from: 'cfo', text: t('ask_error') }]); // a bad model reply never breaks the page
    } finally {
      setBusy(false);
    }
  }

  const shown = chat.messages.slice(skip);
  return (
    <div className="space-y-4">
      {shown.length > 0 && (
        <ol className="flex flex-col gap-4" aria-live="polite">
          {shown.map((m, i) => <ChatMessage key={i} m={m} />)}
        </ol>
      )}
      {busy && (
        <p className="pop-in flex items-center gap-3 text-zinc-700">
          <span className="rounded-3xl bg-zinc-100 px-4 py-3"><TypingDots /></span>{t('ask_typing')}
        </p>
      )}

      <form onSubmit={send} className="space-y-3 rounded-3xl border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t('chat_ask_who')}>
          <span className="text-sm font-medium text-zinc-700">{t('chat_ask_who')}</span>
          {[undefined, ...AGENTS].map((id) => {
            const active = to === id;
            return (
              <button type="button" key={id ?? 'any'} role="radio" aria-checked={active} onClick={() => setTo(id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${active ? 'bg-accent text-white' : 'bg-zinc-100 text-ink hover:bg-zinc-200'}`}>
                {id && <CfoAvatar cfo={id} size={22} />}
                {id ? CFOS[id].name : t('chat_anyone')}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus={autoFocus}
            placeholder={t('chat_followup_ph')} aria-label={t('chat_followup_ph')}
            className="min-h-12 min-w-0 flex-1 rounded-full bg-zinc-100 px-5 text-base" />
          <button disabled={busy || !input.trim()} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-40">
            {t('send')} <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
      <div ref={endRef} />
    </div>
  );
}
