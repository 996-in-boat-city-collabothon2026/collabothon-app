// Printable report (daily or weekly) – a calm, text-first A4 document, not a copy of the dashboard layout.
// "Zapisz jako PDF" uses the browser's print dialog (choose "Save as PDF"). Numbers come from the API;
// fields the API does not have yet come from the clearly marked demo file (lib/kpiDemo.ts).
import { useState } from 'react';
import { api, useApi } from '../api/client';
import { fmtDay, fmtPLN } from '../components/ui';
import { useT } from '../i18n';
import { DEMO_ACTIONS, DEMO_BREAKEVEN, DEMO_MONEY_LINES, DEMO_REFS, DEMO_REVIEW, DEMO_WEEK } from '../lib/kpiDemo';
import { LAW_CHECKED_ON, LAW_SOURCES, LAW_UPDATES } from '../lib/lawUpdates';
import { CFOS } from '@cfo/shared';

type Kind = 'day' | 'week';

const TXT = {
  title: { pl: 'Raport finansowy', en: 'Financial report' },
  shop: { pl: 'Warsztat Wulkanizacyjny Marek', en: 'Marek Tyre Workshop' },
  day: { pl: 'Dzienny', en: 'Daily' },
  week: { pl: 'Tygodniowy', en: 'Weekly' },
  print: { pl: 'Drukuj / Zapisz jako PDF', en: 'Print / Save as PDF' },
  printHint: { pl: 'W oknie drukowania wybierz „Zapisz jako PDF”, jeśli chcesz plik.', en: 'In the print dialog choose “Save as PDF” to get a file.' },
  prepared: { pl: 'Przygotowano', en: 'Prepared' },
  forDay: { pl: 'za dzień', en: 'for' },
  forWeek: { pl: 'za tydzień do', en: 'for the week to' },
  inShort: { pl: 'W skrócie', en: 'In short' },
  todo: { pl: 'Co zrobić teraz', en: 'What to do now' },
  numbers: { pl: 'Najważniejsze liczby', en: 'Key numbers' },
  deadlines: { pl: 'Najbliższe terminy', en: 'Upcoming deadlines' },
  law: { pl: 'Zmiany w przepisach', en: 'Changes in the law' },
  lawNote: { pl: 'Informacja, nie porada prawna. Sprawdzono', en: 'Information, not legal advice. Checked on' },
  sources: { pl: 'Źródła', en: 'Sources' },
  cash: { pl: 'Wolna gotówka', en: 'Free cash' },
  owed: { pl: 'Nam winni / my winni', en: 'Owed to us / we owe' },
  overdue: { pl: 'Zaległe faktury flot', en: 'Overdue fleet invoices' },
  zus: { pl: 'ZUS i zaliczka PIT – do 20. dnia miesiąca', en: 'ZUS and PIT advance – by the 20th' },
  demo: { pl: 'Część liczb to dane demo (oznaczone gwiazdką *). Wszystkie płatności i wysyłki w aplikacji są symulowane.', en: 'Some numbers are demo data (marked with *). All payments and submissions in the app are simulated.' },
  owner: { pl: 'odpowiada', en: 'owner' },
  actions: { pl: 'Lista działań', en: 'Action list' },
  checkBy: { pl: 'sprawdzić do', en: 'check by' },
};

export default function Report() {
  const { lang } = useT();
  const L = lang === 'pl' ? 'pl' : 'en';
  const x = (k: keyof typeof TXT) => TXT[k][L];
  const [kind, setKind] = useState<Kind>('week');
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(30));
  const s = state.data;
  const k = s?.kpis;
  const f = forecast.data;
  const today = s ? fmtDay(s.shop.today) : '…';
  const items = kind === 'day' ? DEMO_REVIEW.slice(0, 2) : DEMO_REVIEW;

  return (
    <div className="report-page mx-auto max-w-3xl pb-16">
      {/* Controls – not printed */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="flex gap-1 rounded-full border border-black/10 bg-white p-1" role="group" aria-label={x('title')}>
          {(['day', 'week'] as Kind[]).map((v) => (
            <button key={v} onClick={() => setKind(v)} aria-pressed={kind === v}
              className={`min-h-12 rounded-full px-5 text-base font-semibold ${kind === v ? 'bg-ink text-white' : 'text-stone-700 hover:bg-zinc-100'}`}>
              {x(v)}
            </button>
          ))}
        </span>
        <button onClick={() => window.print()}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-lg font-bold text-white hover:brightness-95">
          {x('print')}
        </button>
        <p className="w-full text-[15px] text-stone-700">{x('printHint')}</p>
      </div>

      {/* The document */}
      <article className="report-doc rounded-2xl border border-black/10 bg-white px-8 py-10 sm:px-14">
        <header className="border-b border-black/15 pb-5">
          <p className="report-kicker">{x('shop')}</p>
          <h1 className="report-h1">{x('title')} – {x(kind).toLowerCase()}</h1>
          <p className="report-meta">
            {kind === 'day' ? `${x('forDay')} ${today}` : `${x('forWeek')} ${today}`} · {x('prepared')}: {today}, 21:00
          </p>
        </header>

        <section className="report-section">
          <h2 className="report-h2">{x('inShort')}</h2>
          <p className="report-p">
            {f && f.lowest.balancePLN < 0
              ? (L === 'pl'
                ? `Na koncie jest ${k ? fmtPLN(k.balancePLN) : '…'}. Jeśli nic się nie zmieni, ${fmtDay(f.lowest.date)} może zabraknąć ${fmtPLN(Math.abs(f.lowest.balancePLN))}. ${DEMO_REFS.runway.pl}.*`
                : `There is ${k ? fmtPLN(k.balancePLN) : '…'} in the account. If nothing changes, on ${fmtDay(f.lowest.date)} you may be short by ${fmtPLN(Math.abs(f.lowest.balancePLN))}. ${DEMO_REFS.runway.en}.*`)
              : (L === 'pl' ? `Na koncie jest ${k ? fmtPLN(k.balancePLN) : '…'}. Gotówki wystarczy na najbliższe tygodnie.` : `There is ${k ? fmtPLN(k.balancePLN) : '…'} in the account. Cash covers the coming weeks.`)}
          </p>
          <p className="report-p">{DEMO_MONEY_LINES.profit[L]}.* {DEMO_BREAKEVEN[L]}.* {DEMO_REFS.payDays[L]}.*</p>
        </section>

        <section className="report-section">
          <h2 className="report-h2">{x('todo')}</h2>
          <ol className="report-list">
            {items.map((r, i) => (
              <li key={i}>
                <strong>{r.warn ? (L === 'pl' ? 'Uwaga: ' : 'Attention: ') : ''}{r.title[L]}</strong> ({r.value[L]}*).{' '}
                {r.todo[L]} <span className="report-owner">– {x('owner')}: {CFOS[r.owner].name}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="report-section">
          <h2 className="report-h2">{x('actions')}</h2>
          <ul className="report-list">
            {DEMO_ACTIONS.map((a, i) => (
              <li key={i}><strong>{CFOS[a.owner].name}</strong>: {a.what[L]} – {x('checkBy')} {a.check}*</li>
            ))}
          </ul>
        </section>

        {kind === 'week' && (
          <section className="report-section">
            <h2 className="report-h2">{x('numbers')}</h2>
            <dl className="report-dl">
              <div><dt>{x('cash')}</dt><dd>{k ? fmtPLN(k.balancePLN) : '—'}</dd></div>
              <div><dt>{x('owed')}</dt><dd>{k ? `${fmtPLN(k.receivablesPLN)} / ${fmtPLN(k.payablesPLN)}` : '—'}</dd></div>
              <div><dt>{x('overdue')}</dt><dd>{k ? fmtPLN(k.overdueReceivablesPLN) : '—'}</dd></div>
              {DEMO_WEEK.map((d) => (
                <div key={d.id}>
                  <dt>{L === 'pl'
                    ? (d.id === 'cars' ? 'Auta w tym tygodniu' : d.id === 'avg_job' ? 'Średnia wartość zlecenia' : 'Marża na oponach i częściach')
                    : (d.id === 'cars' ? 'Cars this week' : d.id === 'avg_job' ? 'Average job value' : 'Margin on tyres and parts')}</dt>
                  <dd>{d.unit === 'pln' ? fmtPLN(d.value) : d.unit === 'pct' ? `${String(d.value).replace('.', ',')}%` : d.value}* – {d.delta.text[L].replace(/^[▲▼]\s*/, '')}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="report-section">
          <h2 className="report-h2">{x('deadlines')}</h2>
          <ul className="report-list">
            {k?.nextDeadline && <li><strong>{fmtDay(k.nextDeadline.date)}</strong> – {k.nextDeadline.label}: {fmtPLN(k.nextDeadline.amountPLN)}</li>}
            <li>{x('zus')}</li>
          </ul>
        </section>

        <section className="report-section">
          <h2 className="report-h2">{x('law')}</h2>
          {LAW_UPDATES.map((u) => (
            <p key={u.title.pl} className="report-p"><strong>{u.title[L]}.</strong> {u.body[L]}</p>
          ))}
          <p className="report-small">{x('lawNote')} {LAW_CHECKED_ON}. {x('sources')}:{' '}
            {LAW_SOURCES.map((s, i) => <span key={s.url}>{i > 0 && '; '}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}
          </p>
        </section>

        <footer className="report-small border-t border-black/15 pt-4">{x('demo')}</footer>
      </article>
    </div>
  );
}
