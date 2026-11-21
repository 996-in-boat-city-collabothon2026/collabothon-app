// Advice bubble on every page: floating button → mini chat → api.ask() → answer with the CFO's avatar.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { useT } from '../i18n';
import Icon from './Icon';
import { CfoAvatar } from './ui';
import SpeakButton from './SpeakButton';

type Msg = { from: 'me' | 'cfo'; text: string; cfo?: CfoId };

const SUGGESTIONS = ['ask_s1', 'ask_s2', 'ask_s3'];

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-2 w-2 rounded-full bg-accent motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

/**
 * open/setOpen come from App: on phones and tablets the chat button sits in the header (App.tsx),
 * on desktop it is the round button at the bottom right (below). Both open the same chat.
 */
export default function AskBubble({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { from: 'me', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.ask(q);
      setMsgs((m) => [...m, { from: 'cfo', cfo: res.cfo, text: res.text }]);
    } catch {
      // A bad model reply must never break the demo.
      setMsgs((m) => [...m, { from: 'cfo', text: t('ask_error') }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <>
      {open && (
        <div role="dialog" aria-label={t('ask_title')}
          className="fixed bottom-40 right-4 z-40 flex h-[min(520px,calc(100vh-13rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden surface shadow-xl md:bottom-24">
          <header className="flex items-center gap-2 border-b border-stone-200 bg-white py-2 pl-4 pr-2">
            <span className="flex flex-1 items-center gap-2 font-semibold"><Icon name="chat" />{t('ask_title')}</span>
            <button onClick={() => setOpen(false)} aria-label={t('close')} className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-stone-100"><Icon name="close" /></button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            <p className="rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-base">{t('ask_hello')}</p>
            {msgs.map((m, i) => m.from === 'me' ? (
              <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-base text-white">{m.text}</p>
            ) : (
              <div key={i} className="flex max-w-[92%] items-end gap-2">
                {m.cfo && <CfoAvatar cfo={m.cfo} size={30} />}
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  <p className="rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-base">{m.text}</p>
                  <SpeakButton text={m.text} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex flex-col items-center gap-3 py-4" aria-live="polite">
                <div className="ai-orb flex h-32 w-32 items-center justify-center">
                  <span className="wave" aria-hidden="true">{[0, 120, 240, 120, 0].map((d, i) => <span key={i} style={{ animationDelay: `${d}ms` }} />)}</span>
                </div>
                <p className="flex items-center gap-2 text-lg font-semibold"><TypingDots /> {t('ask_typing')}</p>
              </div>
            )}
          </div>

          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {SUGGESTIONS.map((k) => (
                <button key={k} onClick={() => void send(t(k))}
                  className="min-h-10 rounded-full border border-zinc-300 px-3 text-sm hover:bg-zinc-50">{t(k)}</button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="flex gap-2 border-t border-zinc-200 p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ask_placeholder')}
              aria-label={t('ask_placeholder')} className="min-h-12 min-w-0 flex-1 rounded-xl border border-zinc-300 px-3" />
            <button disabled={busy || !input.trim()} className="min-h-12 rounded-full bg-ink px-4 font-semibold text-white disabled:opacity-40">
              {t('send')}
            </button>
          </form>
        </div>
      )}

      {/* Desktop only: on smaller screens a floating button would cover text, so the header has the chat button */}
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? t('close') : t('ask_title')}
        className="fixed bottom-24 right-4 z-40 hidden h-12 w-12 lg:flex items-center justify-center rounded-full bg-accent ring-4 ring-accent-soft text-2xl text-white shadow-md hover:bg-zinc-800 md:bottom-6">
        <Icon name={open ? 'close' : 'chat'} size={24} />
      </button>
    </>
  );
}
