// Owner: Pair 1. Speech → text for questions to the agents (llm/speech.ts).
// GET  /api/voice/status      → { whisper: true } when Whisper is set up (otherwise the web app uses the browser's speech input)
// POST /api/voice/transcribe  → raw audio body (audio/webm, audio/ogg, …, max 10 MB) → { text }
import type { FastifyPluginAsync } from 'fastify';
import { SpeechNotConfigured, speechReady, transcribe } from '../llm/speech';

const routes: FastifyPluginAsync = async (app) => {
  // Only inside this plugin: accept a raw audio body.
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  app.get('/voice/status', async () => ({ whisper: speechReady() }));

  app.post<{ Querystring: { lang?: string } }>('/voice/transcribe', async (req, reply) => {
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'No audio' });
    try {
      const text = await transcribe(audio, String(req.headers['content-type'] ?? 'audio/webm'), req.query.lang === 'pl' ? 'pl' : 'en');
      return { text };
    } catch (e) {
      if (e instanceof SpeechNotConfigured) return reply.code(503).send({ error: 'not_configured' });
      req.log.warn({ err: (e as Error).message }, 'whisper failed');
      return reply.code(502).send({ error: 'whisper_failed' });
    }
  });
};

export default routes;
