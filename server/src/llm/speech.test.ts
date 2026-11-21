import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import auth from '../routes/auth';
import voice, { MAX_AUDIO_BYTES, MAX_PER_MINUTE, allowTranscription, resetVoiceLimitsForTests } from '../routes/voice';
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

  it('routes: only for the signed-in user, small uploads only, at most MAX_PER_MINUTE per visitor', async () => {
    resetVoiceLimitsForTests();
    const app = Fastify();
    await app.register(auth, { prefix: '/api' });
    await app.register(voice, { prefix: '/api' });
    Object.assign(config.speech, { baseUrl: 'http://whisper.local/v1' });
    setSpeechFetchForTests(async () => new Response(JSON.stringify({ text: 'ok' })));
    const post = (payload: Buffer, ip = '1.2.3.4') => app.inject({ method: 'POST', url: '/api/voice/transcribe',
      headers: { 'content-type': 'audio/webm', 'x-forwarded-for': ip }, payload });

    await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect((await post(audio)).statusCode).toBe(401); // signed out: no paid call

    await app.inject({ method: 'POST', url: '/api/auth/demo-login' });
    expect((await post(Buffer.alloc(MAX_AUDIO_BYTES + 1))).statusCode).toBe(413); // longer than a 30 s question

    for (let i = 0; i < MAX_PER_MINUTE; i++) expect((await post(audio)).statusCode).toBe(200);
    expect((await post(audio)).statusCode).toBe(429);               // this visitor has to wait
    expect((await post(audio, '5.6.7.8')).statusCode).toBe(200);    // another visitor is not blocked
    expect(allowTranscription('9.9.9.9', 0)).toBe(true);
    await app.close();
  });

  it('routes: status says whether Whisper is set up; errors become 503 / 502, never a crash', async () => {
    resetVoiceLimitsForTests();
    const app = Fastify();
    await app.register(auth, { prefix: '/api' });
    await app.register(voice, { prefix: '/api' });
    await app.inject({ method: 'POST', url: '/api/auth/demo-login' });
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
