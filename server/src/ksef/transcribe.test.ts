// Owner: Pair 3. Speech → text: audio goes only to the Whisper address in the cluster; no address = 503, nothing sent.
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import ksef from '../routes/ksef';
import { setFetchForTests, transcribe } from './transcribe';

const cfg = { baseUrl: 'http://whisper.cluster/v1', model: 'whisper-large-v3-turbo', apiKey: '', timeoutMs: 2000 };

describe('transcribe', () => {
  afterEach(() => { setFetchForTests(null); delete process.env.WHISPER_BASE_URL; });

  it('posts the recording to <base>/audio/transcriptions in Polish and returns the text', async () => {
    let url = ''; let form: FormData | undefined;
    setFetchForTests((async (u: string, init: RequestInit) => { url = u; form = init.body as FormData;
      return new Response(JSON.stringify({ text: ' Wymiana hamulców dla TransBud ' })); }) as unknown as typeof fetch);
    expect(await transcribe(Buffer.from('abc'), 'audio/webm', 'pl', cfg)).toBe('Wymiana hamulców dla TransBud');
    expect(url).toBe('http://whisper.cluster/v1/audio/transcriptions');
    expect(form?.get('language')).toBe('pl');
    expect(form?.get('model')).toBe('whisper-large-v3-turbo');
  });

  it('no WHISPER_BASE_URL → 503 not_configured and no request at all', async () => {
    let called = false;
    setFetchForTests((async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch);
    const app = Fastify();
    await app.register(ksef, { prefix: '/api' });
    const res = await app.inject({ method: 'POST', url: '/api/ksef/transcribe', headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('abc') });
    expect(res.statusCode).toBe(503);
    expect(called).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/ksef/transcribe/status' })).json()).toEqual({ ready: false });
  });

  it('with an address: the route returns the text', async () => {
    process.env.WHISPER_BASE_URL = 'http://whisper.cluster/v1';
    setFetchForTests((async () => new Response(JSON.stringify({ text: 'Opony dla Kurier Express' }))) as unknown as typeof fetch);
    const app = Fastify();
    await app.register(ksef, { prefix: '/api' });
    const res = await app.inject({ method: 'POST', url: '/api/ksef/transcribe', headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('abc') });
    expect(res.json()).toEqual({ text: 'Opony dla Kurier Express' });
  });
});
