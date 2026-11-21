// Owner: Pair 1. Speech → text for questions to the agents (llm/speech.ts).
// GET  /api/voice/status      → { whisper: true } when Whisper is set up (otherwise the web app uses the browser's speech input)
// POST /api/voice/transcribe  → raw audio body (audio/webm, audio/ogg, …) → { text }
// Whisper may be a PAID external service, so: only for the signed-in demo user, small uploads, and a per-visitor limit.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { SpeechNotConfigured, speechReady, transcribe } from '../llm/speech';
import { isSignedIn } from './auth';

/** The browser stops recording after 30 s: that is ~250 KB of Opus audio, so 1 MB leaves plenty of room. */
export const MAX_AUDIO_BYTES = 1024 * 1024;
/** At most this many transcriptions per visitor per minute (a person asks a few questions, not dozens). */
export const MAX_PER_MINUTE = 10;

const recent = new Map<string, number[]>(); // visitor → times of their recent transcriptions (in memory, demo scale)

/** The visitor's address: behind the OpenShift router the real one is the first X-Forwarded-For entry. */
function visitor(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.ip;
}

/** True when this visitor may transcribe now (and counts this request). */
export function allowTranscription(who: string, now = Date.now()): boolean {
  const last = (recent.get(who) ?? []).filter((t) => now - t < 60_000);
  if (last.length >= MAX_PER_MINUTE) { recent.set(who, last); return false; }
  recent.set(who, [...last, now]);
  return true;
}
export const resetVoiceLimitsForTests = () => recent.clear();

const routes: FastifyPluginAsync = async (app) => {
  // Only inside this plugin: accept a raw audio body, at most MAX_AUDIO_BYTES (bigger → 413 before anything is read).
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_req, body, done) => done(null, body));

  app.get('/voice/status', async () => ({ whisper: speechReady() }));

  app.post<{ Querystring: { lang?: string } }>('/voice/transcribe', async (req, reply) => {
    if (!isSignedIn()) return reply.code(401).send({ error: 'Sign in first' });
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length === 0) return reply.code(400).send({ error: 'No audio' });
    if (!allowTranscription(visitor(req))) return reply.code(429).send({ error: 'Too many questions, wait a minute' });
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
