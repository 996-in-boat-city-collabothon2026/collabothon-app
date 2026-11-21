// Owner: Pair 1. Speech → text for questions to the agents (llm/speech.ts).
// GET  /api/voice/status      → { whisper: true } when Whisper is set up (otherwise the web app uses the browser's speech input)
// POST /api/voice/transcribe  → raw audio body (audio/webm, audio/ogg, …) → { text }
// Whisper may be a PAID external service, so: small uploads, a per-visitor limit and a limit for everyone together.
// No sign-in check on purpose: the demo has one shared session (anyone signing out would break the mic for everyone
// during judging), and the demo login needs no password, so it would not stop anybody anyway.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { SpeechNotConfigured, speechReady, transcribe } from '../llm/speech';

/** The browser stops recording after 30 s: that is ~250 KB of Opus audio, so 1 MB leaves plenty of room. */
export const MAX_AUDIO_BYTES = 1024 * 1024;
/** At most this many transcriptions per visitor per minute (a person asks a few questions, not dozens). */
export const MAX_PER_MINUTE = 10;
/** And at most this many for everyone together per minute, so even many fake "visitors" cannot run up the bill. */
export const MAX_ALL_PER_MINUTE = 60;

const recent = new Map<string, number[]>(); // visitor → times of their recent transcriptions (in memory, demo scale)
let everyone: number[] = [];

/**
 * The visitor's address. The OpenShift router APPENDS the real client address to X-Forwarded-For, so the LAST
 * entry is the one we can trust; earlier entries come from the client and can be faked.
 */
export function visitor(req: Pick<FastifyRequest, 'headers' | 'ip'>): string {
  const fwd = req.headers['x-forwarded-for'];
  const list = (Array.isArray(fwd) ? fwd.join(',') : fwd ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list[list.length - 1] || req.ip;
}

/** True when this visitor may transcribe now (and counts this request). Old entries are removed, so memory stays small. */
export function allowTranscription(who: string, now = Date.now()): boolean {
  const fresh = (times: number[]) => times.filter((t) => now - t < 60_000);
  everyone = fresh(everyone);
  const mine = fresh(recent.get(who) ?? []);
  if (mine.length) recent.set(who, mine); else recent.delete(who);
  if (recent.size > 1000) for (const [k, v] of recent) if (!fresh(v).length) recent.delete(k);
  if (mine.length >= MAX_PER_MINUTE || everyone.length >= MAX_ALL_PER_MINUTE) return false;
  recent.set(who, [...mine, now]);
  everyone.push(now);
  return true;
}
export const resetVoiceLimitsForTests = () => { recent.clear(); everyone = []; };
export const trackedVisitorsForTests = () => recent.size;

const routes: FastifyPluginAsync = async (app) => {
  // Only inside this plugin: accept a raw audio body, at most MAX_AUDIO_BYTES (bigger → 413 before anything is read).
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_req, body, done) => done(null, body));

  app.get('/voice/status', async () => ({ whisper: speechReady() }));

  app.post<{ Querystring: { lang?: string } }>('/voice/transcribe', async (req, reply) => {
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
