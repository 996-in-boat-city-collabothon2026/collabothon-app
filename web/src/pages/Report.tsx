// Printable report – a calm, text-first A4 document, not a copy of the dashboard layout.
// "Print / Save as PDF" uses the browser's print dialog. Golden rule 1: every number comes from the API
// (server/src/rules). The only static text is the "Changes in the law" section (lib/lawUpdates.ts, with sources).
//
// The document is drawn ONLY when all four requests below have succeeded. While one is loading or has failed,
// the page shows that status instead (also when printed with Ctrl+P), so an incomplete report can never claim
// "The agents found nothing" or show empty numbers.
import { api, useApi } from '../api/client';
import { fmtDay, fmtPLN } from '../components/ui';
import { useT } from '../i18n';
import { LAW_CHECKED_ON, LAW_SOURCES, LAW_UPDATES } from '../lib/lawUpdates';
import { CFOS, type Action, type AppState, type ExpenseBreakdown, type Forecast, type Tier } from '@cfo/shared';

const PRIORITY: Record<Tier, number> = { NEEDS_APPROVAL: 0, RECOMMENDED: 1, ANALYSED: 2 };

export default function Report() {
  const { t } = useT();
  const state = useApi(api.state);
  const forecast = useApi(() => api.forecast(90));
  const expenses = useApi(() => api.expenses(30));
  const actions = useApi(() => api.actions('open'));

  // The report needs all four. `data` alone is not enough: after a failed retry it still holds the old answer.
  const parts = [
    { key: 'report_part_state', q: state },
    { key: 'report_part_forecast', q: forecast },
    { key: 'report_part_expenses', q: expenses },
    { key: 'report_part_actions', q: actions },
  ];
  const failed = parts.filter((p) => p.q.error !== null && !p.q.loading);
  const ready = parts.every((p) => p.q.data !== null && p.q.error === null && !p.q.loading);

  return (
    <div className="report-page mx-auto max-w-3xl pb-16">
      {/* Controls – not printed */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => window.print()} disabled={!ready} aria-disabled={!ready}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-lg font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100">
          {t('report_print')}
        </button>
        <p className="w-full text-[15px] text-stone-700">{t(ready ? 'report_print_hint' : 'report_print_wait')}</p>
      </div>

      {ready ? (
        <ReportDoc state={state.data!} forecast={forecast.data!} expenses={expenses.data!} actions={actions.data!} />
      ) : failed.length > 0 ? (
        // Printed too (no "no-print"): Ctrl+P on a broken report prints this notice, not a half-empty document.
        <div role="alert" className="report-doc rounded-2xl border border-black/10 bg-white px-8 py-10 sm:px-14">
          <h1 className="report-h2">{t('report_unavailable')}</h1>
          <ul className="report-list">
            {failed.map((p) => <li key={p.key}>{t(p.key)}</li>)}
          </ul>
          <button onClick={() => failed.forEach((p) => void p.q.reload())}
            className="no-print mt-4 min-h-12 rounded-full border border-stone-300 bg-white px-6 font-semibold hover:bg-stone-50">
            ↻ {t('retry')}
          </button>
        </div>
      ) : (
        <p role="status" className="report-doc rounded-2xl border border-black/10 bg-white px-8 py-10 text-stone-600 sm:px-14">
          {t('report_loading')}
        </p>
      )}
    </div>
  );
}

/** The printable document. Gets only complete, successfully loaded data. */
function ReportDoc({ state: s, forecast: f, expenses: ex, actions }: {
  state: AppState;
  forecast: Forecast;
  expenses: ExpenseBreakdown;
  actions: Action[];
}) {
  const { t, lang } = useT();
  const L = lang === 'pl' ? 'pl' : 'en';
  const k = s.kpis;
  const todo = [...actions].sort((a, b) => PRIORITY[a.tier] - PRIORITY[b.tier]);
  const today = fmtDay(s.shop.today);

  return (
    <>
      {/* The document */}
      <article className="report-doc rounded-2xl border border-black/10 bg-white px-8 py-10 sm:px-14">
        <header className="border-b border-black/15 pb-5">
          <p className="report-kicker">{s.shop.name}</p>
          <h1 className="report-h1">{t('report_title')}</h1>
          <p className="report-meta">{t('report_prepared')} {today}</p>
        </header>

        <section className="report-section">
          <h2 className="report-h2">{t('report_in_short')}</h2>
          <p className="report-p">
            {t('report_balance')} {fmtPLN(k.balancePLN)}.{' '}
            {f.lowest.balancePLN < 0
              ? `${t('report_short')} ${fmtDay(f.lowest.date)}: ${fmtPLN(f.lowest.balancePLN)}.`
              : f.lowest.balancePLN < f.bufferPLN
                ? `${t('verdict_low')} ${fmtDay(f.lowest.date)}.`
                : t('status_ok_13w')}
          </p>
          {ex.byCategory[0] && (
            <p className="report-p">
              {t('report_top_cost')} {t(`cat_${ex.byCategory[0].category}`)}: {fmtPLN(ex.byCategory[0].amountPLN)} ({Math.round(ex.byCategory[0].share * 100)}%).
            </p>
          )}
        </section>

        <section className="report-section">
          <h2 className="report-h2">{t('report_todo')}</h2>
          {todo.length === 0 ? <p className="report-p">{t('report_nothing')}</p> : (
            <ol className="report-list">
              {todo.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  {a.amountPLN !== undefined && <> – {fmtPLN(a.amountPLN)}</>}
                  {a.dueDate && <>, {fmtDay(a.dueDate)}</>}.{' '}
                  {a.why[0]} <span className="report-owner">– {CFOS[a.cfo].name} · {t(`tier_${a.tier}`)} · {t('simulated')}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="report-section">
          <h2 className="report-h2">{t('report_numbers')}</h2>
          <dl className="report-dl">
            <div><dt>{t('kpi_balance')}</dt><dd>{fmtPLN(k.balancePLN)}</dd></div>
            <div><dt>{t('kpi_owed_to_you')}</dt><dd>{fmtPLN(k.receivablesPLN)}</dd></div>
            <div><dt>{t('kpi_overdue_now')}</dt><dd>{fmtPLN(k.overdueReceivablesPLN)}</dd></div>
            <div><dt>{t('kpi_you_owe')}</dt><dd>{fmtPLN(k.payablesPLN)}</dd></div>
            <div><dt>{t('kpi_fx_net')}</dt><dd>{fmtPLN(k.fxExposurePLN)}</dd></div>
            <div><dt>{t('report_lowest')}</dt><dd>{fmtPLN(f.lowest.balancePLN)} ({fmtDay(f.lowest.date)})</dd></div>
          </dl>
        </section>

        <section className="report-section">
          <h2 className="report-h2">{t('report_deadlines')}</h2>
          <ul className="report-list">
            {k.nextDeadline && <li><strong>{fmtDay(k.nextDeadline.date)}</strong> – {k.nextDeadline.label}: {fmtPLN(k.nextDeadline.amountPLN)}</li>}
            <li>{t('report_fixed_deadlines')}</li>
          </ul>
        </section>

        <section className="report-section">
          <h2 className="report-h2">{t('report_law')}</h2>
          {LAW_UPDATES.map((u) => (
            <p key={u.title.pl} className="report-p"><strong>{u.title[L]}.</strong> {u.body[L]}</p>
          ))}
          <p className="report-small">{t('report_law_note')} {LAW_CHECKED_ON}. {t('report_sources')}:{' '}
            {LAW_SOURCES.map((src, i) => <span key={src.url}>{i > 0 && '; '}<a href={src.url} target="_blank" rel="noreferrer">{src.label}</a></span>)}
          </p>
        </section>

        <footer className="report-small border-t border-black/15 pt-4">{t('report_footer')}</footer>
      </article>
    </>
  );
}
