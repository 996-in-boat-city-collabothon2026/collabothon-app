// Tiny PL/EN dictionary. Add keys as you go; missing keys fall back to the key itself.
import { createContext, useContext, useState, type ReactNode } from 'react';

type Lang = 'pl' | 'en';

const DICT: Record<string, { pl: string; en: string }> = {
  dashboard: { pl: 'Pulpit', en: 'Dashboard' },
  approvals: { pl: 'Do akceptacji', en: 'Approvals' },
  boardroom: { pl: 'Zarząd CFO', en: 'Boardroom' },
  ksef: { pl: 'KSeF', en: 'KSeF' },
  activity: { pl: 'Historia', en: 'Activity' },
  settings: { pl: 'Ustawienia', en: 'Settings' },
  tier_ANALYSED: { pl: 'Sprawdzone automatycznie', en: 'Checked automatically' },
  tier_RECOMMENDED: { pl: 'Rekomendacja', en: 'Recommendation' },
  tier_NEEDS_APPROVAL: { pl: 'Czeka na Twoją zgodę', en: 'Waiting for your OK' },
  simulated: { pl: 'Symulacja', en: 'Simulated' },
  permitted: { pl: 'Dozwolone', en: 'Permitted' },
  approve: { pl: 'Zatwierdź', en: 'Approve' },
  reject: { pl: 'Odrzuć', en: 'Reject' },
  why: { pl: 'Dlaczego?', en: 'Why?' },
  run_check: { pl: 'Sprawdź teraz', en: 'Run check now' },
  balance: { pl: 'Saldo', en: 'Balance' },
  lowest_30: { pl: 'Najniższe saldo (30 dni)', en: 'Lowest point (30 days)' },
  next_deadline: { pl: 'Najbliższy termin', en: 'Next deadline' },
  start_meeting: { pl: 'Rozpocznij spotkanie', en: 'Start meeting' },
  loading: { pl: 'Ładowanie…', en: 'Loading…' },
  nothing_here: { pl: 'Nic tu jeszcze nie ma', en: 'Nothing here yet' },
};

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

function initialLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'pl' ? 'pl' : 'en';
  } catch {
    return 'en';
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* private mode: ignore */
    }
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useT() {
  const { lang, setLang } = useContext(LangCtx);
  const t = (key: string) => DICT[key]?.[lang] ?? key;
  return { t, lang, setLang };
}
