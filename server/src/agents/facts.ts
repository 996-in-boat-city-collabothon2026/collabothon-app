// Owner: Pair 2 (Person B). Short, human facts for ONE CFO, in the owner's language, built only from rule numbers.
// Why: the small model (Llama 3.2 3B) mixed up numbers from the big English snapshot ("the euro can fall by 20 275 zł").
// With a few clearly labelled facts plus a ready-made conclusion it only has to say the conclusion in its own words.
// `summary` is also the safe answer when the model is down or invents a number.
import type { CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { daysBetween, fmtPLN } from '../domain/money';
import { latestRate } from '../domain/fx';
import { forecast } from '../rules/cashflow';
import { creditLine, paymentReminders } from '../rules/liquidity';
import { FX_SHOCK_THRESHOLD_PLN, fxExposures } from '../rules/fx';
import { taxesDue } from '../rules/taxDue';
import { topCost } from '../rules/expenses';
import { labourGaps, lowMarkups, sumMissing } from '../rules/margin';

export type Lang = 'pl' | 'en';
export interface CfoFacts {
  lines: string[]; // "label: value" facts for the prompt
  summary: string; // 1–2 plain sentences: what the owner should know and do
  misread?: (reply: string) => boolean; // a mistake seen live on the real model (true = don't show the reply)
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/);

const LANG_PL = /[ąćęłńóśźż]|\b(czy|jak|ile|kiedy|mam|jest|co|mi|się|nie)\b/i;
export const langOf = (question: string): Lang => (LANG_PL.test(question) ? 'pl' : 'en');

/** "2026-12-20" → "20.12.2026" */
export const fmtDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(n);
const noDemo = (name: string) => name.replace(/\s*\(demo\)/g, '').trim();
const inDays = (iso: string, lang: Lang) => {
  const d = daysBetween(db.shop.today, iso);
  if (lang === 'pl') return d > 0 ? `za ${d} dni` : d === 0 ? 'dziś' : `${-d} dni po terminie`;
  return d > 0 ? `in ${d} days` : d === 0 ? 'today' : `${-d} days late`;
};
const list = (items: string[], lang: Lang) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${lang === 'pl' ? 'i' : 'and'} ${items[items.length - 1]}`;

function anna(lang: Lang): CfoFacts {
  const pl = lang === 'pl';
  const f = forecast(30);
  const low = f.lowest;
  const gap = f.bufferPLN - low.balancePLN;
  const credit = creditLine()[0]?.amountPLN;
  const late = db.invoices.filter((i) => paymentReminders().some((r) => r.refId === i.id));
  const lateText = paymentReminders().map((r) => {
    const i = late.find((x) => x.id === r.refId)!;
    return `${noDemo(i.counterparty.name)} ${fmtPLN(r.amountPLN!)} (${inDays(i.dueDate, lang)})`;
  });

  const lines = pl
    ? [
        `Saldo na koncie dziś: ${fmtPLN(db.bank.balancePLN)}`,
        `Najniższe saldo w prognozie na 30 dni (to przyszłość, nie dziś): ${fmtPLN(low.balancePLN)} w dniu ${fmtDate(low.date)}`,
        `Bufor bezpieczeństwa: ${fmtPLN(f.bufferPLN)}`,
        ...(gap > 0 ? [`Brakuje do bufora: ${fmtPLN(gap)}`] : []),
        ...(credit ? [`Proponowana linia kredytowa (symulacja): ${fmtPLN(credit)}`] : []),
        ...(lateText.length ? [`Klienci, którzy są Ci winni pieniądze i spóźniają się z zapłatą: ${list(lateText, lang)}`] : []),
      ]
    : [
        `Bank balance today: ${fmtPLN(db.bank.balancePLN)}`,
        `Lowest balance in the 30-day forecast (future, not today): ${fmtPLN(low.balancePLN)} on ${fmtDate(low.date)}`,
        `Safety buffer: ${fmtPLN(f.bufferPLN)}`,
        ...(gap > 0 ? [`Missing to the buffer: ${fmtPLN(gap)}`] : []),
        ...(credit ? [`Proposed credit line (simulated): ${fmtPLN(credit)}`] : []),
        ...(lateText.length ? [`Customers who owe you money and are late: ${list(lateText, lang)}`] : []),
      ];

  const names = list(late.map((i) => noDemo(i.counterparty.name)), lang);
  let summary: string;
  if (gap <= 0) {
    summary = pl
      ? `Gotówki wystarczy: najniższe saldo w prognozie to ${fmtPLN(low.balancePLN)} (${fmtDate(low.date)}), powyżej bufora ${fmtPLN(f.bufferPLN)}.`
      : `You have enough cash: the lowest forecast balance is ${fmtPLN(low.balancePLN)} (${fmtDate(low.date)}), above the ${fmtPLN(f.bufferPLN)} buffer.`;
  } else {
    summary = pl
      ? `Uwaga: ${fmtDate(low.date)} saldo spadnie do ${fmtPLN(low.balancePLN)}, a to ${fmtPLN(gap)} poniżej bufora.`
      : `Careful: on ${fmtDate(low.date)} the balance drops to ${fmtPLN(low.balancePLN)}, ${fmtPLN(gap)} below your buffer.`;
    if (late.length) {
      summary += pl
        ? ` Najpierw wyślij przypomnienia do klientów, którzy Ci nie zapłacili: ${names}.`
        : ` First send reminders to the customers who have not paid you: ${names}.`;
    }
    if (credit) summary += pl ? ` Jeśli to nie wystarczy, linia kredytowa ${fmtPLN(credit)}.` : ` If that is not enough, a credit line of ${fmtPLN(credit)}.`;
  }
  // Live: "zapłać FlotaTrans 12 300 zł" — but FlotaTrans owes the shop money, not the other way round.
  const customers = late.map((i) => noDemo(i.counterparty.name).split(/\s+/)[0].toLowerCase());
  const misread = (reply: string) =>
    sentencesOf(reply).some((sen) => {
      const s = sen.toLowerCase();
      const payCustomer = customers.some((c) => s.includes(c)) && /zapła|\bpay/.test(s) && !/przypom|remind|winn|\bowe|nie zapłacil|not paid|haven't paid/.test(s);
      // Live: "Jasne, to nie jest problem." / "przynajmniej nie jesteś w najgorszej sytuacji" with a 35 275 zł gap.
      const falseComfort = gap > 0 && /nie jest problem|nie ma problemu|najgorszej sytuacji|wszystko (?:jest|będzie) w porządku|no problem|you(?:'re| are) fine/.test(s);
      return payCustomer || falseComfort;
    });
  return { lines, summary, misread };
}

function kasia(lang: Lang): CfoFacts {
  const pl = lang === 'pl';
  const exposures = fxExposures();
  if (exposures.length === 0) {
    return {
      lines: [pl ? 'Brak nieopłaconych faktur w walutach obcych' : 'No unpaid foreign-currency invoices'],
      summary: pl ? 'Nie masz teraz ryzyka walutowego: wszystkie faktury są w złotówkach.' : 'You have no currency risk right now: all open invoices are in złoty.',
    };
  }
  const lines: string[] = [];
  const parts: string[] = [];
  for (const e of exposures) {
    const c = e.currency;
    const weOwe = e.net > 0;
    const amount = `${fmtNum(Math.abs(e.net))} ${c}`;
    const rate = `${fmtNum(latestRate(c), 4)} zł`;
    const { from, to, weeksUp } = e.trend;
    lines.push(
      pl
        ? `${c} ${weOwe ? 'do zapłaty' : 'do otrzymania'} (po odjęciu wpływów): ${amount} = ${fmtPLN(Math.abs(e.netPLN))} po kursie NBP ${rate}`
        : `${c} ${weOwe ? 'to pay' : 'to receive'} (net): ${amount} = ${fmtPLN(Math.abs(e.netPLN))} at the NBP rate ${rate}`,
      pl
        ? `Kurs ${c} 4 tygodnie temu: ${fmtNum(from, 4)} zł, dziś: ${rate}${weeksUp > 0 ? ` (rośnie od ${weeksUp} tygodni)` : ''}`
        : `${c} rate 4 weeks ago: ${fmtNum(from, 4)} zł, today: ${rate}${weeksUp > 0 ? ` (up ${weeksUp} weeks in a row)` : ''}`,
      pl
        ? `Strata, jeśli ${c} ${weOwe ? 'podrożeje' : 'stanieje'} o 5%: ${fmtPLN(e.shockPLN)}`
        : `Loss if ${c} ${weOwe ? 'rises' : 'falls'} 5%: ${fmtPLN(e.shockPLN)}`,
      // Spelled out: the small model said "the euro is not a problem because it is rising".
      pl
        ? weOwe
          ? `Rosnący kurs ${c} to dla Ciebie strata: za te same ${c} zapłacisz więcej złotych`
          : `Spadający kurs ${c} to dla Ciebie strata: za te same ${c} dostaniesz mniej złotych`
        : weOwe
          ? `A rising ${c} rate is bad for you: the same ${c} cost you more złoty`
          : `A falling ${c} rate is bad for you: the same ${c} bring you less złoty`,
    );
    const hedge = e.shockPLN > FX_SHOCK_THRESHOLD_PLN;
    if (hedge) {
      lines.push(pl ? `Propozycja: kontrakt terminowy na ${amount} (symulacja), kurs zostaje ${rate}` : `Proposal: a forward contract for ${amount} (simulated), the rate stays at ${rate}`);
    }
    parts.push(
      pl
        ? `Masz ${amount} ${weOwe ? 'do zapłaty' : 'do otrzymania'}. Jeśli ${c} ${weOwe ? 'podrożeje' : 'stanieje'} o 5%, stracisz ${fmtPLN(e.shockPLN)}${to > from && weOwe ? `, a kurs rośnie (z ${fmtNum(from, 4)} zł na ${rate})` : ''}. ` +
            (hedge ? `Proponuję zablokować kurs kontraktem terminowym na ${amount}.` : 'To małe ryzyko, na razie nic nie trzeba robić.')
        : `You have ${amount} ${weOwe ? 'to pay' : 'to receive'}. If ${c} ${weOwe ? 'rises' : 'falls'} 5%, you lose ${fmtPLN(e.shockPLN)}${to > from && weOwe ? `, and the rate is going up (from ${fmtNum(from, 4)} zł to ${rate})` : ''}. ` +
            (hedge ? `I suggest locking the rate with a forward contract for ${amount}.` : 'The risk is small, no action needed for now.'),
    );
  }
  // Live: "Kurs euro nie jest problemem, bo rośnie" while the shop owes euro and a hedge is proposed.
  const risky = exposures.some((e) => e.shockPLN > FX_SHOCK_THRESHOLD_PLN);
  const misread = (reply: string) => risky && /nie jest problemem|nie ma problemu|not a problem|no problem/i.test(reply);
  return { lines, summary: parts.join(' '), misread };
}

function marek(lang: Lang): CfoFacts {
  const pl = lang === 'pl';
  const taxes = taxesDue(30).obligations;
  const rejected = db.invoices.filter((i) => i.ksef.status === 'rejected');
  const lines = [
    ...taxes.map((o) =>
      pl
        ? `${o.label}: ${fmtPLN(o.amountPLN)}, termin ${fmtDate(o.dueDate)} (${inDays(o.dueDate, lang)})`
        : `${o.kind}: ${fmtPLN(o.amountPLN)}, due ${fmtDate(o.dueDate)} (${inDays(o.dueDate, lang)})`,
    ),
    ...rejected.map((i) =>
      pl
        ? `Faktura ${i.number} dla ${noDemo(i.counterparty.name)} odrzucona przez KSeF (system e-faktur). Powód: ${i.ksef.rejectionReason ?? 'brak'}`
        : `Invoice ${i.number} for ${noDemo(i.counterparty.name)} was rejected by KSeF (e-invoice system). Reason: ${i.ksef.rejectionReason ?? 'none given'}`,
    ),
  ];
  if (lines.length === 0) lines.push(pl ? 'Brak podatków do zapłaty w ciągu 30 dni i brak problemów z KSeF' : 'No taxes due in 30 days and no KSeF problems');

  const next = taxes[0];
  const bits: string[] = [];
  if (next) {
    bits.push(
      pl
        ? `Najbliższy termin: ${next.label} ${fmtPLN(next.amountPLN)} do ${fmtDate(next.dueDate)} (${inDays(next.dueDate, lang)}).`
        : `Next deadline: ${next.kind} ${fmtPLN(next.amountPLN)} by ${fmtDate(next.dueDate)} (${inDays(next.dueDate, lang)}).`,
    );
  }
  if (rejected.length) {
    const nums = list(rejected.map((i) => i.number), lang);
    bits.push(
      pl
        ? `KSeF odrzucił fakturę ${nums}, więc nie jest jeszcze wystawiona: popraw dane nabywcy i wyślij ją ponownie.`
        : `KSeF rejected invoice ${nums}, so it is not issued yet: fix the buyer data and send it again.`,
    );
  }
  return { lines, summary: bits.join(' ') || (pl ? 'Podatki i KSeF są w porządku.' : 'Taxes and KSeF are in order.') };
}

function tomasz(lang: Lang): CfoFacts {
  const pl = lang === 'pl';
  const rate = fmtPLN(db.shop.labourRatePLN);
  const labour = labourGaps();
  const markup = lowMarkups();
  const top = topCost();
  const target = `${Math.round(db.shop.partsMarkupTarget * 100)}%`;
  const CATEGORY_PL: Record<string, string> = { parts: 'części', utilities: 'media', other: 'inne koszty' };
  const CATEGORY_EN: Record<string, string> = { parts: 'parts', utilities: 'utilities', other: 'other costs' };

  const lines: string[] = [];
  if (labour.length) {
    lines.push(
      pl
        ? `Klientom policzyłeś robociznę poniżej Twojej stawki ${rate} za godzinę (to Twoje ceny, nie pensje mechaników): ${labour.length} zlecenia, brakuje razem ${fmtPLN(sumMissing(labour))}`
        : `You billed customers for labour below your ${rate} hourly rate (your prices, not your mechanics' pay): ${labour.length} orders, ${fmtPLN(sumMissing(labour))} missing in total`,
      ...labour.map(({ o, missing }) => (pl ? `- ${o.car}: brakuje ${fmtPLN(missing)}` : `- ${o.car}: ${fmtPLN(missing)} missing`)),
    );
  }
  if (markup.length) {
    lines.push(
      pl
        ? `Narzut na części poniżej ${target}: ${markup.length} zlecenia, brakuje razem ${fmtPLN(sumMissing(markup))}`
        : `Parts markup below ${target}: ${markup.length} orders, ${fmtPLN(sumMissing(markup))} missing in total`,
    );
  }
  if (top) {
    const name = (pl ? CATEGORY_PL : CATEGORY_EN)[top.category];
    lines.push(
      pl
        ? `Największy koszt, na który masz wpływ: ${name}, ${fmtPLN(top.amount)} w 30 dni (${top.sharePct}% wszystkich kosztów)`
        : `Biggest cost you can change: ${name}, ${fmtPLN(top.amount)} in 30 days (${top.sharePct}% of all costs)`,
    );
  }
  if (lines.length === 0) lines.push(pl ? 'Marże i koszty są w porządku' : 'Margins and costs are in order');

  const bits: string[] = [];
  if (labour.length) {
    const cars = list(labour.map(({ o }) => o.car), lang);
    bits.push(
      pl
        ? `Na ${labour.length} zleceniach policzyłeś klientom robociznę za tanio: brakuje ${fmtPLN(sumMissing(labour))} (${cars}). Licz pełne godziny po ${rate}.`
        : `On ${labour.length} orders you billed customers too little for labour: ${fmtPLN(sumMissing(labour))} missing (${cars}). Bill the full hours at ${rate}.`,
    );
  }
  if (markup.length) {
    bits.push(
      pl
        ? `Do tego narzut na części poniżej ${target} kosztował cię ${fmtPLN(sumMissing(markup))}.`
        : `Also, a parts markup below ${target} cost you ${fmtPLN(sumMissing(markup))}.`,
    );
  }
  if (!bits.length && top) {
    const name = (pl ? CATEGORY_PL : CATEGORY_EN)[top.category];
    bits.push(pl ? `Najwięcej wydajesz na ${name}: ${fmtPLN(top.amount)} w 30 dni. Zapytaj o ofertę innych dostawców.` : `You spend most on ${name}: ${fmtPLN(top.amount)} in 30 days. Ask other suppliers for a quote.`);
  }
  // Live: "You're paying your labourers 200 zł per hour…" — the rule is about prices for customers, not wages.
  // Live: "policzyłem klientom za tanio… kosztował mi 237,50 zł": the owner's money told as Tomasz's own.
  const misread = (reply: string) =>
    (labour.length > 0 && /pensj|wynagrodzen|wypłat|wage|salar|labourers|paying your (mechanics|workers)/i.test(reply)) ||
    /policzyłem|kosztował(?:o)? mi\b|moim klientom|moich zleceni/i.test(reply);
  return { lines, summary: bits.join(' ') || (pl ? 'Marże i koszty są w porządku.' : 'Margins and costs are in order.'), misread };
}

const BUILDERS: Record<CfoId, (lang: Lang) => CfoFacts> = { anna, kasia, marek, tomasz };

/** Facts + conclusion for one CFO. Today's date and balance are always included. */
export function cfoFacts(cfo: CfoId, lang: Lang): CfoFacts {
  const f = BUILDERS[cfo](lang);
  const today = lang === 'pl' ? `Dziś jest ${fmtDate(db.shop.today)}` : `Today is ${fmtDate(db.shop.today)}`;
  return { ...f, lines: [today, ...f.lines] };
}
