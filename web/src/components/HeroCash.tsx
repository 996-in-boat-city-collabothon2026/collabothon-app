// Dashboard hero: the cash situation in one dark card (fintech style), readable for every age.
// Today's balance → the lowest point of the 13-week forecast, one recommended step with "Decide now",
// and the next tax deadline with the data source. All numbers come from the API (rules engine); the UI computes nothing.
// Colour means status only: red = bad (shortfall), green = good (enough cash). No emoji.
import { Link } from 'react-router-dom';
import type { Action, Forecast, Kpis } from '@cfo/shared';
import { useT } from '../i18n';
import CountUp from './CountUp';
import { fmtDay, fmtPLN } from './ui';

export default function HeroCash({ k, f90, next, today }: { k?: Kpis; f90?: Forecast; next?: Action; today?: string }) {
  const { t } = useT();
  const short = !!f90 && f90.lowest.balancePLN < 0;
  const tight = !!f90 && !short && f90.lowest.balancePLN < f90.bufferPLN;

  return (
    <section aria-live="polite"
      className="hero-in relative overflow-hidden rounded-3xl bg-[#1c1917] px-5 py-5 text-white shadow-[0_16px_40px_-24px_rgba(0,0,0,.5)] sm:px-8 sm:py-7">
      {/* soft light in the corner, decorative */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[.06] blur-2xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-semibold uppercase tracking-[0.12em] text-[#d6d3d1]">{t('hero_cash_title')}</p>
        {today && <p className="rounded-full border border-white/25 px-3 py-1 text-[15px] text-[#e7e5e4]">{t('refreshed_at')} {fmtDay(today)}</p>}
      </div>

      {k && f90 ? (
        <div className="relative mt-4 grid items-end gap-4 sm:grid-cols-[auto_auto_1fr] sm:gap-6">
          <div>
            <p className="text-lg text-[#d6d3d1]">{t('available_today')}</p>
            <p className="mt-1 font-display text-[2.2rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[2.9rem]">
              <CountUp text={fmtPLN(k.balancePLN)} />
            </p>
          </div>
          <span aria-hidden="true" className="hidden pb-2 text-3xl text-[#78716c] sm:block">→</span>
          <div>
            <p className="text-lg text-[#d6d3d1]">{t('forecast_word')} · {fmtDay(f90.lowest.date)}</p>
            <p className={`mt-1 font-display text-[2.2rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[2.9rem] ${short ? 'text-[#ff8a7a]' : tight ? 'text-white' : 'text-[#7ee2a8]'}`}>
              <CountUp text={fmtPLN(f90.lowest.balancePLN)} />
            </p>
          </div>
          <div className="sm:col-span-3">
            {short || tight ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d92d20] px-3 py-1 font-bold text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="currentColor" /><path d="M12 10v5M12 18v.5" stroke="#d92d20" strokeWidth="2.4" strokeLinecap="round" /></svg>
                  {t('attention')}
                </span>
                <span className="text-[#ff8a7a]">{short ? t('projected_shortfall') : `${t('verdict_low')} ${fmtDay(f90.lowest.date)}`}</span>
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#15803d] px-3 py-1 font-bold text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  OK
                </span>
                <span className="text-[#7ee2a8]">{t('status_ok_13w')}</span>
              </span>
            )}
          </div>
        </div>
      ) : <div className="mt-4 h-12 w-2/3 animate-pulse rounded-xl bg-white/10" />}

      {next && (
        <div className="relative mt-5 flex flex-col gap-3 rounded-2xl bg-white/[.07] p-3 sm:flex-row sm:items-center sm:px-4 sm:py-3">
          <p className="min-w-0 flex-1 text-lg leading-snug">
            <span className="text-[#d6d3d1]">{t('next_step')}</span> <strong className="font-semibold">{next.title}</strong>
          </p>
          <Link to="/approvals"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-lg font-bold text-[#1c1917] hover:bg-[#f5f5f4]">
            {t('decide_now')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}

      <div className="relative mt-4 flex flex-col gap-1 border-t border-white/15 pt-3 text-[16px] text-[#d6d3d1] sm:flex-row sm:items-center sm:justify-between">
        {k?.nextDeadline
          ? <p><strong className="text-white">{k.nextDeadline.label}</strong> · {fmtDay(k.nextDeadline.date)} · <span className="tabular-nums text-white">{fmtPLN(k.nextDeadline.amountPLN)}</span></p>
          : <span />}
        <p className="text-[15px]">{t('status_sub')}</p>
      </div>
    </section>
  );
}
