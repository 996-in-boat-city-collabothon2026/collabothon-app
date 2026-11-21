// "Add invoice" in 3 ways: Type (real: the model on OpenShift AI reads the sentence), Speak (real: the recording goes to
// our server and on to Whisper on OpenShift AI; if Whisper is not deployed yet, a clearly marked sample can be tried)
// and Photo (SIMULATED: fills in a sample sentence – a vision model on OpenShift AI is a later step). Then the owner checks
// everything in large type and sends it to the (simulated) KSeF with one button. The UI computes nothing.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Invoice, InvoiceLine, VatRate } from '@cfo/shared';
import { api, type ParsedInvoice } from '../api/client';
import { useT } from '../i18n';
import { normalizeNip, nipProblem } from '../lib/nip';
import Icon from './Icon';
import { Sheet, fmtDay, fmtPLN } from './ui';

type Mode = 'type' | 'speak' | 'photo';
const SAMPLE_SPEAK = 'Wymiana klocków hamulcowych dla Kurier Express Kraków, NIP 6781234568, 850 zł netto';
const SAMPLE_PHOTO = 'Wymiana rozrządu dla FlotaTrans Sp. z o.o., NIP 5211234565, 2 400 zł netto';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AddInvoice({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const { t, lang } = useT();
  const [mode, setMode] = useState<Mode>('type');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'listening' | 'transcribing' | 'reading' | 'parsing' | 'sending'>(null);
  const [whisperReady, setWhisperReady] = useState<boolean | null>(null);
  const rec = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (mode === 'speak' && whisperReady === null) api.transcribeStatus().then((s) => setWhisperReady(s.ready), () => setWhisperReady(false));
  }, [mode, whisperReady]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((tr) => tr.stop()), []);
  const [photo, setPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function read(sentence: string) {
    setError(null);
    setBusy('parsing');
    try {
      setDraft(await api.parseInvoice(sentence));
    } catch {
      setError(t('inv_read_failed'));
    } finally {
      setBusy(null);
    }
  }

  // REAL: press = start recording, press again = stop. The recording goes to our server -> Whisper on OpenShift AI.
  async function toggleRecording() {
    setError(null);
    if (rec.current && rec.current.state === 'recording') { rec.current.stop(); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t('inv_mic_denied'));
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      rec.current = null;
      setBusy('transcribing');
      try {
        const { text: heard } = await api.transcribe(new Blob(chunks, { type: r.mimeType || 'audio/webm' }), lang);
        if (!heard) { setError(t('inv_heard_nothing')); setBusy(null); return; }
        setText(heard);
        await read(heard);
      } catch {
        setError(t('inv_whisper_failed'));
        setBusy(null);
      }
    };
    r.start();
    setBusy('listening');
  }

  // SIMULATED sample (only offered while Whisper is not deployed): no audio is recorded.
  async function speak() {
    setBusy('listening');
    await wait(1800);
    setText(SAMPLE_SPEAK);
    await read(SAMPLE_SPEAK);
  }

  // SIMULATED: the photo stays in the browser (preview only); a sample invoice sentence is used.
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhoto(URL.createObjectURL(file));
    setBusy('reading');
    await wait(1500);
    setText(SAMPLE_PHOTO);
    await read(SAMPLE_PHOTO);
  }

  async function send(inv: Omit<Invoice, 'id' | 'ksef' | 'paid'>) {
    setBusy('sending');
    try {
      onCreated(await api.createInvoice(inv));
    } catch {
      setError(t('send_failed'));
      setBusy(null);
    }
  }

  return (
    <Sheet title={t('inv_add_title')} onClose={onClose}>
      {!draft ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={t('inv_add_title')}>
            {([['type', 'pen', 'inv_mode_type'], ['speak', 'mic', 'inv_mode_speak'], ['photo', 'camera', 'inv_mode_photo']] as const).map(([m, icon, label]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-base font-semibold ${mode === m ? 'border-ink bg-ink text-white' : 'border-zinc-300 bg-white text-ink'}`}>
                <Icon name={icon} size={22} />{t(label)}
              </button>
            ))}
          </div>

          {mode === 'type' && (
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) void read(text); }} className="space-y-3">
              <label className="block space-y-1 text-lg font-semibold">
                <span>{t('inv_type_label')}</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={t('inv_type_example')}
                  className="w-full rounded-xl border border-zinc-300 p-3 text-lg font-normal" />
              </label>
              <button disabled={!text.trim() || !!busy} className="min-h-14 w-full rounded-full bg-accent text-lg font-bold text-white disabled:opacity-40">
                {busy === 'parsing' ? t('inv_reading') : t('inv_read_btn')}
              </button>
              <p className="text-sm text-stone-600">{t('inv_type_note')}</p>
            </form>
          )}

          {mode === 'speak' && whisperReady !== false && (
            <div className="space-y-3 text-center">
              <button onClick={() => void toggleRecording()} disabled={whisperReady === null || (!!busy && busy !== 'listening')}
                aria-pressed={busy === 'listening'} aria-label={busy === 'listening' ? t('inv_stop_btn') : t('inv_rec_btn')}
                className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white disabled:opacity-40 ${busy === 'listening' ? 'mic-live bg-accent' : 'bg-ink'}`}>
                {busy === 'listening' ? <span className="h-8 w-8 rounded-md bg-white" aria-hidden="true" /> : <Icon name="mic" size={40} />}
              </button>
              <p className="text-lg font-semibold" aria-live="polite">
                {busy === 'listening' ? t('inv_listening_stop') : busy === 'transcribing' ? t('inv_transcribing') : busy === 'parsing' ? t('inv_reading') : t('inv_rec_btn')}
              </p>
              <p className="text-sm text-stone-600">{t('inv_whisper_note')}</p>
            </div>
          )}
          {mode === 'speak' && whisperReady === false && (
            <div className="space-y-3 text-center">
              <p className="rounded-xl border border-black/15 bg-white px-3 py-2 text-[15px]">{t('inv_whisper_off')}</p>
              <button onClick={() => void speak()} disabled={!!busy}
                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white ${busy === 'listening' ? 'mic-live bg-accent' : 'bg-zinc-500'}`}
                aria-label={t('inv_sample_btn')}>
                <Icon name="mic" size={34} />
              </button>
              <p className="text-lg font-semibold">{busy === 'listening' ? t('inv_listening') : busy === 'parsing' ? t('inv_reading') : t('inv_sample_btn')}</p>
            </div>
          )}

          {mode === 'photo' && (
            <div className="space-y-3">
              <SimTag />
              <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink text-lg font-bold text-white">
                <Icon name="camera" size={22} /> {t('inv_photo_btn')}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
              </label>
              {photo && (
                <div className="relative overflow-hidden rounded-2xl border border-zinc-300">
                  <img src={photo} alt={t('inv_photo_alt')} className="max-h-56 w-full object-contain" />
                  {busy && <div className="scan-line absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden="true" />}
                </div>
              )}
              {busy && <p className="text-lg font-semibold">{t('inv_reading')}</p>}
              <p className="text-sm text-stone-600">{t('inv_photo_note')}</p>
            </div>
          )}

          {text && mode !== 'type' && <p className="rounded-xl bg-zinc-100 p-3 text-lg"><span className="block text-sm font-semibold text-stone-600">{t('inv_heard')}</span>„{text}”</p>}
          {error && <p className="rounded-xl bg-accent-soft p-3 font-semibold text-accent-ink">{error}</p>}
        </div>
      ) : (
        <Review draft={draft} busy={busy === 'sending'} error={error} onBack={() => { setDraft(null); setPhoto(null); }} onSend={send} />
      )}
    </Sheet>
  );
}

function SimTag() {
  const { t } = useT();
  return <p className="rounded-xl border border-black/15 bg-white px-3 py-2 text-[15px]"><strong>{t('ksef_sim_badge')}:</strong> {t('inv_sim_note')}</p>;
}

/** Big, editable check before sending. The server re-checks everything when KSeF "receives" it. */
function Review({ draft, busy, error, onBack, onSend }: {
  draft: ParsedInvoice; busy: boolean; error: string | null;
  onBack: () => void; onSend: (inv: Omit<Invoice, 'id' | 'ksef' | 'paid'>) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(draft.buyerName);
  const [nip, setNip] = useState(draft.nip);
  const [lines, setLines] = useState<InvoiceLine[]>(draft.lines.length ? draft.lines : [{ name: '', kind: 'other', qty: 1, unitNet: 0, vatRate: 23 }]);
  const nipErr = nipProblem(nip);
  const linesOk = lines.every((l) => l.name.trim() && l.qty > 0 && l.unitNet > 0);
  const ok = !!name.trim() && !nipErr && linesOk;
  const input = 'min-h-12 w-full rounded-xl border border-zinc-300 px-3 text-lg font-normal';
  const set = (i: number, patch: Partial<InvoiceLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (ok) onSend({ number: draft.number, direction: 'sales', issueDate: draft.issueDate, dueDate: draft.dueDate,
        counterparty: { name: name.trim(), nip: normalizeNip(nip) }, lines: lines.map((l) => ({ ...l, name: l.name.trim() })) });
    }}>
      <p className="text-lg">
        <strong>{draft.number}</strong> · {t('inv_issue')} {fmtDay(draft.issueDate)} · {t('inv_due')} {fmtDay(draft.dueDate)}
      </p>
      <p className="text-sm text-stone-600">{t(draft.source === 'model' ? 'inv_src_model' : 'inv_src_rules')}</p>
      <label className="block space-y-1 text-lg font-semibold">
        <span>{t('buyer_name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="block space-y-1 text-lg font-semibold">
        <span>{t('buyer_nip')}</span>
        <input value={nip} onChange={(e) => setNip(e.target.value)} autoComplete="off" inputMode="numeric"
          aria-invalid={!!nipErr} className={`${input} ${nipErr ? 'border-accent bg-accent-soft' : ''}`} />
        <span className={`block text-base font-normal ${nipErr ? 'text-accent-ink' : 'text-stone-700'}`}>{nipErr ? t(nipErr) : t('nip_ok')}</span>
      </label>
      {lines.map((l, i) => (
        <fieldset key={i} className="space-y-2 rounded-2xl border border-zinc-300 p-3">
          <legend className="px-1 text-lg font-semibold">{t('inv_item')} {lines.length > 1 ? i + 1 : ''}</legend>
          <input value={l.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t('inv_item')} className={input} />
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm font-semibold">{t('inv_qty')}
              <input type="number" min={1} value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} className={input} />
            </label>
            <label className="text-sm font-semibold">{t('inv_net')}
              <input type="number" min={0} step="0.01" value={l.unitNet} onChange={(e) => set(i, { unitNet: Number(e.target.value) })} className={input} />
            </label>
            <label className="text-sm font-semibold">VAT
              <select value={l.vatRate} onChange={(e) => set(i, { vatRate: Number(e.target.value) as VatRate })} className={input}>
                {[23, 8, 5, 0].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
          </div>
          <p className="text-base text-stone-700">{t('inv_net_line')} {fmtPLN(l.unitNet)} × {l.qty}</p>
        </fieldset>
      ))}
      {error && <p className="rounded-xl bg-accent-soft p-3 font-semibold text-accent-ink">{error}</p>}
      <button disabled={!ok || busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-lg font-bold text-white disabled:opacity-40">
        <Icon name="receipt" size={22} /> {busy ? t('inv_sending') : t('inv_send_btn')}
      </button>
      <button type="button" onClick={onBack} className="min-h-12 w-full rounded-full border border-ink font-semibold">{t('inv_back')}</button>
    </form>
  );
}
