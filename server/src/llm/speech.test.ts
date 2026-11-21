import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import voice from '../routes/voice';
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

  it('routes: status says whether Whisper is set up; errors become 503 / 502, never a crash', async () => {
    const app = Fastify();
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
