import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import auth from '../routes/auth';
import voice, { MAX_ALL_PER_MINUTE, MAX_AUDIO_BYTES, MAX_PER_MINUTE, allowTranscription, resetVoiceLimitsForTests, trackedVisitorsForTests, visitor } from '../routes/voice';
import { SpeechNotConfigured, setSpeechFetchForTests, transcribe } from './speech';

const audio = Buffer.from('fake-webm-bytes');
const saved = { ...config.speech };
afterEach(() => { Object.assign(config.speech, saved); setSpeechFetchForTests(null); });

describe('speech → text (Whisper)', () => {
  it('not set up: throws and sends no request', async () => {
    config.speech.baseUrl = '';
    let calls = 0;
    setSpeechFetchForTests(async () => { calls++; return new Response('{}'); });
    await expect(transcribe(audio, 'audio/webm', 'en')).rejects.toBeInstanceOf(SpeechNotConfigured);
    expect(calls).toBe(0);
  });

  it('set up: posts the file, model and language to /audio/transcriptions and returns the trimmed text', async () => {
    Object.assign(config.speech, { baseUrl: 'http://whisper.local/v1', model: 'whisper-1', apiKey: 'k' });
    let seen: { url: string; auth?: string; model?: string; lang?: string; file?: string } | null = null;
    setSpeechFetchForTests(async (url, init) => {
      const form = init?.body as FormData;
      seen = { url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization,
        model: String(form.get('model')), lang: String(form.get('language')), file: (form.get('file') as File).name };
      return new Response(JSON.stringify({ text: '  Who still owes me money?  ' }));
    });
    expect(await transcribe(audio, 'audio/ogg', 'pl')).toBe('Who still owes me money?');
    expect(seen).toEqual({ url: 'http://whisper.local/v1/audio/transcriptions', auth: 'Bearer k', model: 'whisper-1', lang: 'pl', file: 'question.ogg' });
  });

  it('routes: no sign-in needed (shared demo session), small uploads only, limits per visitor and for everyone', async () => {
    resetVoiceLimitsForTests();
    const app = Fastify();
    await app.register(auth, { prefix: '/api' });
    await app.register(voice, { prefix: '/api' });
    Object.assign(config.speech, { baseUrl: 'http://whisper.local/v1' });
    setSpeechFetchForTests(async () => new Response(JSON.stringify({ text: 'ok' })));
    // The OpenShift router appends the real address at the END of X-Forwarded-For.
    const post = (payload: Buffer, fwd = '1.2.3.4') => app.inject({ method: 'POST', url: '/api/voice/transcribe',
      headers: { 'content-type': 'audio/webm', 'x-forwarded-for': fwd }, payload });

    await app.inject({ method: 'POST', url: '/api/auth/logout' }); // someone signed out somewhere
    expect((await post(audio)).statusCode).toBe(200);                      // the mic still works for everyone else
    expect((await post(Buffer.alloc(MAX_AUDIO_BYTES + 1))).statusCode).toBe(413); // longer than a 30 s question

    for (let i = 1; i < MAX_PER_MINUTE; i++) expect((await post(audio)).statusCode).toBe(200);
    expect((await post(audio)).statusCode).toBe(429);                          // this visitor has to wait
    expect((await post(audio, 'fake-' + Math.random() + ', 1.2.3.4')).statusCode).toBe(429); // a faked first entry does not help
    expect((await post(audio, '5.6.7.8')).statusCode).toBe(200);              // another real visitor is not blocked
    expect(visitor({ headers: { 'x-forwarded-for': 'spoofed, 10.0.0.7' }, ip: '127.0.0.1' })).toBe('10.0.0.7');
    expect(visitor({ headers: {}, ip: '127.0.0.1' })).toBe('127.0.0.1');
    await app.close();
  });

  it('limits: everyone together is capped, and visitors with no recent requests are forgotten', () => {
    resetVoiceLimitsForTests();
    for (let i = 0; i < MAX_ALL_PER_MINUTE; i++) expect(allowTranscription('v' + i, 1000)).toBe(true);
    expect(allowTranscription('somebody-new', 1000)).toBe(false);     // the shared cap is reached
    expect(allowTranscription('somebody-new', 62_000)).toBe(true);    // a minute later it is fine again
    allowTranscription('v0', 200_000);                                 // v0 comes back much later
    expect(trackedVisitorsForTests()).toBeLessThanOrEqual(MAX_ALL_PER_MINUTE + 1);
  });

  it('routes: status says whether Whisper is set up; errors become 503 / 502, never a crash', async () => {
    resetVoiceLimitsForTests();
    const app = Fastify();
    await app.register(auth, { prefix: '/api' });
    await app.register(voice, { prefix: '/api' });
    config.speech.baseUrl = '';
    expect((await app.inject({ url: '/api/voice/status' })).json()).toEqual({ whisper: false });
    const notSet = await app.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { 'content-type': 'audio/webm' }, payload: audio });
    expect(notSet.statusCode).toBe(503);

    config.speech.baseUrl = 'http://whisper.local/v1';
    setSpeechFetchForTests(async () => new Response('boom', { status: 500 }));
    const failed = await app.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { 'content-type': 'audio/webm' }, payload: audio });
    expect(failed.statusCode).toBe(502);

    const empty = await app.inject({ method: 'POST', url: '/api/voice/transcribe', headers: { 'content-type': 'audio/webm' }, payload: Buffer.alloc(0) });
    expect(empty.statusCode).toBe(400);
    await app.close();
  });
});
