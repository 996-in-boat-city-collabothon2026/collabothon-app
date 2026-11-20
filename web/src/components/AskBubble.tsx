// 💬 Advice bubble on every page: floating button → mini chat → api.ask() → answer with the CFO's avatar.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CfoId } from '@cfo/shared';
import { api } from '../api/client';
import { useT } from '../i18n';
import { CfoAvatar } from './ui';

type Msg = { from: 'me' | 'cfo'; text: string; cfo?: CfoId };

const SUGGESTIONS = ['ask_s1', 'ask_s2', 'ask_s3'];

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-2 w-2 rounded-full bg-slate-400 motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

export default function AskBubble() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
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
          <header className="flex items-center gap-2 border-b border-stone-200 py-2 pl-4 pr-2">
            <span className="flex-1 font-semibold">💬 {t('ask_title')}</span>
            <button onClick={() => setOpen(false)} aria-label={t('close')} className="h-12 w-12 rounded-full hover:bg-stone-100">✕</button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            <p className="rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-base">{t('ask_hello')}</p>
            {msgs.map((m, i) => m.from === 'me' ? (
              <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-stone-900 px-3 py-2 text-base text-white">{m.text}</p>
            ) : (
              <div key={i} className="flex max-w-[92%] items-end gap-2">
                {m.cfo && <CfoAvatar cfo={m.cfo} size={30} />}
                <p className="rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-base">{m.text}</p>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-stone-600" aria-live="polite">
                <span className="rounded-2xl bg-slate-100 px-3 py-3"><TypingDots /></span> {t('ask_typing')}
              </div>
            )}
          </div>

          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
              {SUGGESTIONS.map((k) => (
                <button key={k} onClick={() => void send(t(k))}
                  className="min-h-10 rounded-full border border-slate-300 px-3 text-sm hover:bg-slate-50">{t(k)}</button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ask_placeholder')}
              aria-label={t('ask_placeholder')} className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3" />
            <button disabled={busy || !input.trim()} className="min-h-12 rounded-full bg-stone-900 px-4 font-semibold text-white disabled:opacity-40">
              {t('send')}
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? t('close') : t('ask_title')}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-2xl text-white shadow-md hover:bg-stone-700 md:bottom-6">
        {open ? '✕' : '💬'}
      </button>
    </>
  );
}
