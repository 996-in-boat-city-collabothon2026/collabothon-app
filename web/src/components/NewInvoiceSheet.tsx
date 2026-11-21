// New sales invoice draft, typed or dictated (Voice-to-Invoice).
// Voice: the browser turns speech into text (lib/listen.ts); the Invoice clerk agent on the server
// (POST /invoices/parse-voice) returns values for the EMPTY fields only. We apply them, mark them green,
// and list what is still missing, so the owner can dictate just that and press "Fill the form" again.
// No money maths here: prices are typed or come from the server, totals are shown in the list after saving.
import { useState, type FormEvent } from 'react';
import type { Currency, InvoiceLine, VatRate } from '@cfo/shared';
import { api, type ClerkForm, type InvoiceFill, type NewInvoice, type PaymentMethod } from '../api/client';
import { useT } from '../i18n';
import { canListen, useListen, type ListenLang } from '../lib/listen';
import { normalizeNip, nipProblem } from '../lib/nip';
import Icon from './Icon';
import { Sheet } from './ui';

type Payment = PaymentMethod;
interface FormLine { key: number; name: string; kind: InvoiceLine['kind']; qty: string; unitNet: string; vatRate: VatRate }

const VAT_RATES: VatRate[] = [23, 8, 5, 0];
const KINDS: InvoiceLine['kind'][] = ['part', 'labour', 'other'];
let nextKey = 1;
const blankLine = (): FormLine => ({ key: nextKey++, name: '', kind: 'part', qty: '1', unitNet: '', vatRate: 23 });
const isBlank = (l: FormLine) => !l.name.trim() && !l.unitNet.trim();
/** "61,50" → 61.5. null when it is not a number ≥ 0. */
const toNumber = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

const INPUT = 'min-h-12 w-full rounded-xl border px-3 font-normal';
const MISSING = 'border-amber-400 bg-amber-50';
const VOICE = 'border-emerald-500 ring-2 ring-emerald-500/20'; // filled by voice (accent is red = looks like an error)
const OK = 'border-zinc-300';

export default function NewInvoiceSheet({ number: defaultNumber, today, onClose, onSaved }: {
  number: string;
  today: string;
  onClose: () => void;
  onSaved: (number: string) => void;
}) {
  const { t } = useT();
  const [number, setNumber] = useState(defaultNumber);
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [currency, setCurrency] = useState<Currency>('PLN');
  const [dueDate, setDueDate] = useState('');
  const [payment, setPayment] = useState<Payment | ''>('');
  const [lines, setLines] = useState<FormLine[]>([blankLine()]);
  const [byVoice, setByVoice] = useState<Set<string>>(new Set()); // field keys the voice filled
  const [assumed, setAssumed] = useState<Set<string>>(new Set()); // voice filled a default (qty 1, VAT 23%)
  const [badge, setBadge] = useState<{ filled: string; missing: string[]; skipped: string[] } | null>(null);
  const [checked, setChecked] = useState(false); // show yellow "still missing" marks
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const nipErr = nipProblem(nip);
  const lineErrors = lines.map((l) => ({ name: !l.name.trim(), qty: !toNumber(l.qty), unitNet: toNumber(l.unitNet) == null }));
  const invalid = !name.trim() || !!nipErr || !dueDate || !number.trim()
    || lineErrors.some((e) => e.name || e.qty || e.unitNet);

  /** Border colour for a field: yellow if still missing, accent if voice filled it, grey otherwise. */
  const cls = (key: string, missing: boolean) => (checked && missing ? MISSING : byVoice.has(key) ? VOICE : OK);
  const setLine = (key: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** What the clerk sees: the whole form, empty string = a gap. Line order = the indexes it answers with. */
  const clerkForm: ClerkForm = {
    counterparty: { name, nip }, currency, dueDate, paymentMethod: payment,
    lines: lines.map((l) => ({
      name: l.name, kind: l.kind, qty: l.qty, unitNet: l.unitNet, vatRate: l.vatRate,
      assumed: [...(assumed.has(`l${l.key}:qty`) ? ['qty' as const] : []), ...(assumed.has(`l${l.key}:vat`) ? ['vatRate' as const] : [])],
    })),
  };

  function applyFill(f: InvoiceFill) {
    const filled = new Set(byVoice);
    const guessed = new Set(assumed);
    const said: string[] = [];
    const mark = (key: string, label: string) => { filled.add(key); guessed.delete(key); said.push(label); };
    if (f.set.name) { setName(f.set.name); mark('name', t('buyer_name')); }
    if (f.set.nip) { setNip(f.set.nip); mark('nip', 'NIP'); }
    if (f.set.currency) { setCurrency(f.set.currency); mark('currency', t('col_currency')); }
    if (f.set.dueDate) { setDueDate(f.set.dueDate); mark('due', t('inv_due')); }
    if (f.set.paymentMethod) { setPayment(f.set.paymentMethod); mark('payment', t('inv_payment')); }

    // 1. Complete existing lines (indexes = the order we sent).
    const merged: FormLine[] = lines.map((l, i) => {
      const u = f.lineUpdates.find((x) => x.index === i);
      if (!u) return l;
      const k = `l${l.key}`;
      const next = { ...l };
      if (u.name != null) { next.name = u.name; mark(`${k}:name`, u.name); }
      if (u.kind != null) next.kind = u.kind;
      if (u.qty != null) { next.qty = String(u.qty); mark(`${k}:qty`, `${t('line_qty')} (${next.name})`); }
      if (u.unitNet != null) { next.unitNet = String(u.unitNet).replace('.', ','); mark(`${k}:net`, `${t('line_net')} (${next.name})`); }
      if (u.vatRate != null) { next.vatRate = u.vatRate; mark(`${k}:vat`, `VAT (${next.name})`); }
      return next;
    });
    // 2. Add new lines.
    for (const l of f.newLines) {
      const line: FormLine = { key: nextKey++, name: l.name, kind: l.kind, qty: String(l.qty), unitNet: l.unitNet == null ? '' : String(l.unitNet).replace('.', ','), vatRate: l.vatRate };
      const k = `l${line.key}`;
      filled.add(`${k}:name`);
      if (l.unitNet != null) filled.add(`${k}:net`);
      if (l.assumed.includes('qty')) guessed.add(`${k}:qty`); else filled.add(`${k}:qty`);
      if (l.assumed.includes('vatRate')) guessed.add(`${k}:vat`); else filled.add(`${k}:vat`);
      merged.push(line);
    }
    if (f.newLines.length) said.push(`${f.newLines.length} ${t('voice_lines')}`);

    // The clerk's "missing" indexes point into `merged`; read the names before dropping the empty starter line.
    const lineLabel = (i: number) => merged[i]?.name.trim() || `${t('miss_line')} ${i + 1}`;
    const missing = f.missing.map((m) =>
      'line' in m
        ? `${t(m.field === 'line.name' ? 'line_name' : m.field === 'line.qty' ? 'line_qty' : 'line_net')} – ${lineLabel(m.line)}`
        : m.field === 'name' ? t('buyer_name') : m.field === 'nip' ? 'NIP' : t('inv_due'));
    setLines(merged.length > 1 ? merged.filter((l) => !isBlank(l)) : merged);

    setByVoice(filled);
    setAssumed(guessed);
    setChecked(true);
    const prefix = f.source === 'fallback' ? `${t('voice_fallback')} ` : '';
    setBadge({
      filled: said.length ? `${prefix}${t('voice_filled')} ${said.join(', ')}` : `${prefix}${t('voice_nothing')}`,
      missing,
      skipped: f.skipped.map((x) => `${x.field} „${x.value}”: ${t(`skip_${x.reason}`)}`),
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setChecked(true);
    if (invalid) return;
    const inv: NewInvoice = {
      number: number.trim(),
      direction: 'sales',
      issueDate: today,
      dueDate,
      counterparty: { name: name.trim(), nip: normalizeNip(nip) },
      ...(currency !== 'PLN' && { currency }),
      lines: lines.map((l) => ({ name: l.name.trim(), kind: l.kind, qty: toNumber(l.qty)!, unitNet: toNumber(l.unitNet)!, vatRate: l.vatRate })),
    };
    setSaving(true);
    setSaveError(false);
    try {
      await api.createInvoice(inv);
      onSaved(inv.number);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }


  return (
    <Sheet title={t('new_invoice')} onClose={onClose}>
      <VoicePanel form={clerkForm} onFill={applyFill} />
      {badge && (
        <div role="status" className="pop-in space-y-2">
          <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            <Icon name="mic" size={18} className="mt-0.5" />{badge.filled}
          </p>
          {badge.missing.length > 0 ? (
            <div className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">{t('voice_still')} {badge.missing.join(', ')}</p>
              <p>{t('voice_still_hint')}</p>
            </div>
          ) : (
            <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{t('voice_done')}</p>
          )}
          {badge.skipped.length > 0 && (
            <details className="rounded-2xl bg-zinc-100 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold">{t('voice_skipped')} {badge.skipped.length}</summary>
              <ul className="mt-1 list-disc pl-5">{badge.skipped.map((x) => <li key={x}>{x}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block space-y-1 font-semibold">
          <span>{t('inv_number')}</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} className={`${INPUT} ${cls('number', !number.trim())}`} />
        </label>
        <label className="block space-y-1 font-semibold">
          <span>{t('buyer_name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={checked && !name.trim()}
            className={`${INPUT} ${cls('name', !name.trim())}`} />
        </label>
        <label className="block space-y-1 font-semibold">
          <span>{t('buyer_nip')}</span>
          <input value={nip} onChange={(e) => setNip(e.target.value)} autoComplete="off" inputMode="text"
            aria-invalid={checked && !!nipErr} className={`${INPUT} ${cls('nip', !!nipErr)}`} />
          {(checked || nip) && (
            <span className={`block text-sm font-normal ${nipErr ? 'text-amber-800' : 'text-accent-ink'}`}>{nipErr ? t(nipErr) : t('nip_ok')}</span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 font-semibold">
            <span>{t('inv_due')}</span>
            <input type="date" value={dueDate} min={today} onChange={(e) => setDueDate(e.target.value)}
              className={`${INPUT} ${cls('due', !dueDate)}`} />
          </label>
          <label className="block space-y-1 font-semibold">
            <span>{t('col_currency')}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={`${INPUT} bg-white ${cls('currency', false)}`}>
              {(['PLN', 'EUR', 'USD'] as Currency[]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1 font-semibold">
          <span>{t('inv_payment')}</span>
          <select value={payment} onChange={(e) => setPayment(e.target.value as Payment | '')} className={`${INPUT} bg-white ${cls('payment', false)}`}>
            <option value="">–</option>
            {(['transfer', 'cash', 'card'] as Payment[]).map((p) => <option key={p} value={p}>{t(`pay_${p}`)}</option>)}
          </select>
          <span className="block text-sm font-normal text-stone-600">{t('inv_payment_note')}</span>
        </label>

        <fieldset className="space-y-3">
          <legend className="font-semibold">{t('inv_lines')}</legend>
          {lines.map((l, i) => {
            const err = lineErrors[i];
            const k = `l${l.key}`;
            return (
              <div key={l.key} className="space-y-2 rounded-2xl border border-zinc-200 p-3">
                <div className="flex gap-2">
                  <input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} aria-label={t('line_name')}
                    placeholder={t('line_name')} className={`${INPUT} ${cls(`${k}:name`, err.name)}`} />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('line_remove')}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full hover:bg-stone-100"><Icon name="x" /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="space-y-1 text-sm font-semibold">
                    <span>{t('line_qty')}</span>
                    <input value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} inputMode="decimal"
                      className={`${INPUT} ${assumed.has(`${k}:qty`) && !(checked && err.qty) ? MISSING : cls(`${k}:qty`, err.qty)}`} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>{t('line_net')} ({currency})</span>
                    <input value={l.unitNet} onChange={(e) => setLine(l.key, { unitNet: e.target.value })} inputMode="decimal"
                      className={`${INPUT} ${cls(`${k}:net`, err.unitNet)}`} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>{t('line_vat')}</span>
                    <select value={l.vatRate} onChange={(e) => setLine(l.key, { vatRate: Number(e.target.value) as VatRate })}
                      className={`${INPUT} bg-white ${assumed.has(`${k}:vat`) ? MISSING : cls(`${k}:vat`, false)}`}>
                      {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>&nbsp;</span>
                    <select value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as InvoiceLine['kind'] })}
                      aria-label={t('line_kind')} className={`${INPUT} bg-white ${OK}`}>
                      {KINDS.map((kind) => <option key={kind} value={kind}>{t(`kind_${kind}`)}</option>)}
                    </select>
                  </label>
                </div>
                {(assumed.has(`${k}:qty`) || assumed.has(`${k}:vat`)) && (
                  <p className="text-sm text-amber-800">
                    {t('voice_assumed')}: {[assumed.has(`${k}:qty`) && `${t('line_qty')} 1`, assumed.has(`${k}:vat`) && 'VAT 23%'].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])}
            className="min-h-12 rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold">
            <Icon name="plus" size={18} className="mr-1 align-[-4px]" />{t('line_add')}
          </button>
        </fieldset>

        {checked && invalid && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('inv_check')}</p>}
        {saveError && <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-ink">{t('inv_save_failed')}</p>}
        <button disabled={saving} className="min-h-12 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40">
          {saving ? t('loading') : t('inv_save')}
        </button>
      </form>
    </Sheet>
  );
}

/** Mic toggle + live transcript + editable text. Works without a mic too: just type and press "Fill the form". */
function VoicePanel({ form, onFill }: { form: ClerkForm; onFill: (f: InvoiceFill) => void }) {
  const { t } = useT();
  const [lang, setLang] = useState<ListenLang>('pl-PL');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { listening, interim, error, start, stop } = useListen(lang, (s) => setText((prev) => (prev ? `${prev} ${s}` : s)));

  async function fill() {
    stop();
    const said = `${text} ${interim}`.trim();
    if (!said) return;
    setBusy(true);
    setFailed(false);
    try {
      onFill(await api.fillInvoiceGaps(said, form));
      setText(''); // next dictation = only what is still missing
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t('voice_title')} className="space-y-3 rounded-2xl bg-zinc-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-semibold">{t('voice_title')}</h3>
        <div role="group" aria-label={t('voice_lang')} className="flex rounded-full bg-white p-1 text-sm font-semibold">
          {(['pl-PL', 'en-US'] as ListenLang[]).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} disabled={listening} onClick={() => setLang(l)}
              className={`min-h-9 rounded-full px-3 ${lang === l ? 'bg-ink text-white' : ''}`}>{l.slice(0, 2).toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-stone-600">{t('voice_hint')}</p>

      {canListen ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={listening ? stop : start} aria-pressed={listening}
            className={`flex min-h-12 items-center gap-2 rounded-full px-5 font-semibold ${listening ? 'bg-accent text-white' : 'bg-ink text-white'}`}>
            <span className="relative flex">
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-white/60" aria-hidden="true" />}
              <Icon name="mic" size={20} className="relative" />
            </span>
            {listening ? t('voice_stop') : t('voice_start')}
          </button>
          {listening && <span role="status" className="text-sm font-medium text-accent-ink">{t('voice_listening')}</span>}
        </div>
      ) : (
        <p className="rounded-xl bg-white px-3 py-2 text-sm">{t('voice_unsupported')}</p>
      )}
      {error && <p className="text-sm text-accent-ink">{t(error === 'denied' ? 'voice_denied' : 'voice_error')}</p>}

      <label className="block space-y-1 text-sm font-semibold">
        <span>{t('voice_text')}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
          className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-base font-normal" />
      </label>
      {interim && <p aria-live="polite" className="text-sm italic text-stone-600">… {interim}</p>}
      {failed && <p className="text-sm text-accent-ink">{t('voice_failed')}</p>}
      <button type="button" onClick={() => void fill()} disabled={busy || !`${text}${interim}`.trim()}
        className="min-h-12 w-full rounded-full bg-accent font-semibold text-white disabled:opacity-40">
        {busy ? t('voice_reading') : t('voice_fill')}
      </button>
    </section>
  );
}
