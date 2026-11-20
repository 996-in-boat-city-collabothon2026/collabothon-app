// Owner: Pair 1. Registers ALL route files up front, so other pairs never need to edit this file.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { llmBudgetHook } from './llm/provider';
import health from './routes/health';
import auth from './routes/auth';
import finance from './routes/finance';
import actions from './routes/actions';
import boardroom from './routes/boardroom';
import ksef from './routes/ksef';
import settings from './routes/settings';
import demo from './routes/demo';

const app = Fastify({ logger: { level: 'info' } });

// Every request gets ONE shared LLM time budget (LLM_BUDGET_MS), so a slow model can't make the conference hang.
app.addHook('onRequest', llmBudgetHook);

for (const plugin of [health, auth, finance, actions, boardroom, ksef, settings, demo]) {
  await app.register(plugin, { prefix: '/api' });
}

// Serve the built React app (web/dist) in production. In dev, Vite serves it on :5173.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html'); // client-side routing
  });
}

app.log.info(`LLM mode: ${config.llm.mode} (model: ${config.llm.model})`);
await app.listen({ port: config.port, host: '0.0.0.0' });
