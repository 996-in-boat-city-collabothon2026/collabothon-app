// Chats page (Pair 1, Nara): every saved meeting and chat with the agents, opened full width and continued.
// Saved on this device only (lib/chats.ts). Wide screens: list on the left, the open chat on the right.
// Phones: the list, or one chat with a "back to all chats" link.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ChatThread from '../components/ChatThread';
import Icon from '../components/Icon';
import { PageHeader } from '../components/ui';
import { useT } from '../i18n';
import { deleteChat, getChat, listChats, newChat, saveChat, type Chat } from '../lib/chats';

export default function Chats() {
  const { t, lang } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>(listChats);
  const [current, setCurrent] = useState<Chat | undefined>(() => (id ? getChat(id) : undefined));

  useEffect(() => { setCurrent(id ? getChat(id) : undefined); }, [id]);

  function startNew() {
    const c = newChat('', 'chat');
    saveChat(c);
    setChats(listChats());
    navigate(`/chat/${c.id}`);
  }

  function changed(c: Chat) {
    setCurrent(c);
    setChats(listChats());
  }

  function remove(c: Chat) {
    deleteChat(c.id);
    setChats(listChats());
    if (current?.id === c.id) navigate('/chat');
  }

  const when = (ms: number) => new Date(ms).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const list = (
    <aside className={`surface space-y-3 p-4 ${id ? 'hidden lg:block' : ''}`} aria-label={t('chat_previous')}>
      <button onClick={startNew} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 font-bold text-white">
        <Icon name="pen" size={18} /> {t('chat_new')}
      </button>
      {chats.length === 0 && <p className="p-2 text-zinc-700">{t('chat_empty')}</p>}
      <ul className="space-y-2">
        {chats.map((c) => (
          <li key={c.id}>
            <Link to={`/chat/${c.id}`} aria-current={c.id === id ? 'page' : undefined}
              className={`block rounded-2xl px-3 py-2.5 ${c.id === id ? 'bg-accent-soft' : 'hover:bg-zinc-100'}`}>
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <Icon name={c.kind === 'meeting' ? 'users' : 'chat'} size={14} />
                {t(c.kind === 'meeting' ? 'nav_boardroom' : 'chat_kind_chat')} · {when(c.updatedAt)}
              </span>
              <span className="mt-0.5 block truncate font-medium">{c.title || t('chat_untitled')}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-2 text-sm text-zinc-600">{t('chat_saved_note')}</p>
    </aside>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t('chat_title')} />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {list}
        {id && (
          <section className="surface min-w-0 space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to="/chat" className="inline-flex min-h-10 items-center gap-1 font-semibold text-blue lg:hidden">← {t('chat_back')}</Link>
              {/* Phones: title on its own line under "All chats" / Delete; wide screens: one row */}
              <h2 className="order-last w-full min-w-0 break-words text-2xl font-semibold tracking-tight lg:order-none lg:w-auto lg:flex-1 lg:truncate">{current?.title || t('chat_untitled')}</h2>
              {current && (
                <button onClick={() => remove(current)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-zinc-300 px-3 text-sm font-semibold hover:bg-zinc-50">
                  <Icon name="x" size={16} /> {t('chat_delete')}
                </button>
              )}
            </div>
            {current
              ? <ChatThread key={current.id} chat={current} onChange={changed} autoFocus />
              : <p className="text-zinc-700">{t('chat_not_found')}</p>}
          </section>
        )}
        {!id && chats.length > 0 && (
          <section className="surface hidden items-center justify-center p-10 text-center text-lg text-zinc-700 lg:flex">{t('chat_pick')}</section>
        )}
      </div>
    </div>
  );
}
