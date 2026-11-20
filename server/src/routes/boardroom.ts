// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { cfoFacts, langOf, type CfoFacts, type Lang } from '../agents/facts';
import { findInventedNumbers } from '../agents/numberGuard';
import { PERSONAS } from '../agents/personas';
import { tidyReply } from '../agents/reply';
import { chatOr } from '../llm/provider';

// Quick-advice bubble: pick the CFO by keywords (PL + EN, with and without Polish letters).
// Each CFO scores 1 point per matching word group; the highest score wins. Ties and no match → Anna.
// Short words use \b so "pit" doesn't match "hospital" and "vat" doesn't match "private".
const TOPICS: Record<CfoId, RegExp[]> = {
  anna: [
    /p[łl]ynno|liquid|cash|got[óo]wk|pieni[ąa]dz|money|saldo|balance|konto|stan konta/i,
    /kredyt|credit|po[żz]ycz|loan|overdraft|debet|lokat|deposit|oszcz[ęe]dz/i,
    /przetrw|survive|wyp[łl]acaln|bankrut|prognoz|forecast|bufor|buffer/i,
    /zaleg|overdue|d[łl]u[żz]nik|nie p[łl]ac|sp[óo][źz]ni|late pay|przypomn|reminder|windykac|nale[żz]no|receivabl/i,
  ],
  kasia: [
    /\beur|euro|\busd\b|dolar|dollar|walut|currenc|\bfx\b|\bnbp\b/i,
    /kurs|exchange rate|hedg|zabezpiecz|forward|termin[oó]w/i,
    /niem(iec|ieck)|german|krause|weber|zagranic|foreign|import/i,
  ],
  marek: [
    /\bvat\b|\bzus\b|\bpit\b|\bcit\b|podat|\btax|jpk|skarb|urz[ąa]d|\bus\b/i,
    /ksef|faktur|invoice|\bupo\b|\bnip\b|e-faktur|odrzuc|rejected/i,
    /termin p[łl]atno[śs]ci podat|deklarac|declarat|deadline/i,
  ],
  tomasz: [
    /koszt|cost|wydat|expens|oszcz[ęe]dno[śs]|cut|ci[ąa][ćc]/i,
    /mar[żz]|margin|zysk|profit|rentown|narzut|markup/i,
    /\bcen[aeyiąę]?\b|cennik|price|pricing|stawk|rate per hour|robocizn|roboczogodzin|labou?r/i,
    /cz[ęe][śs]ci|parts|hurtowni|wholesal|dostawc[aóy]|supplier|pr[ąa]d|media|utilities/i,
  ],
};

export function pickCfo(question: string): CfoId {
  // "Kasia, ...?" → the owner asked a CFO by name.
  const named = (Object.keys(CFOS) as CfoId[]).find((c) => new RegExp(`\\b${CFOS[c].name}`, 'i').test(question));
  if (named) return named;

  let best: CfoId = 'anna';
  let bestScore = 0;
  for (const [cfo, groups] of Object.entries(TOPICS) as [CfoId, RegExp[]][]) {
    const score = groups.filter((re) => re.test(question)).length;
    if (score > bestScore) [best, bestScore] = [cfo, score];
  }
  return best;
}

/** Safe answer without the model: this CFO's conclusion in plain words, numbers straight from the rules. */
export function ruleAnswer(cfo: CfoId, question: string): string {
  return cfoFacts(cfo, langOf(question)).summary;
}

/** The prompt for the small model: a few labelled facts, the conclusion to say, the question. */
function askPrompt(question: string, facts: CfoFacts, lang: Lang): string {
  return lang === 'pl'
    ? [
        'FAKTY (tylko tych liczb wolno Ci użyć):',
        ...facts.lines.map((l) => `- ${l}`),
        '',
        `NAJWAŻNIEJSZE (powiedz to swoimi słowami, z tymi samymi liczbami): ${facts.summary}`,
        '',
        `PYTANIE WŁAŚCICIELA: ${question}`,
        'Odpowiedz na pytanie w 2–3 krótkich zdaniach po polsku. Mów do właściciela na "Ty" (masz, zapłać, wyślij).',
      ].join('\n')
    : [
        'FACTS (the only numbers you may use):',
        ...facts.lines.map((l) => `- ${l}`),
        '',
        `KEY POINT (say it in your own words, with the same numbers): ${facts.summary}`,
        '',
        `OWNER ASKS: ${question}`,
        'Answer the question in 2–3 short sentences in English. Talk to the owner as "you".',
      ].join('\n');
}

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', async (req) => runBoardroom(req.body?.topic));

  // Quick advice bubble + "Ask a CFO". cfo is optional: without it the server picks one by topic.
  app.post<{ Body: { cfo?: CfoId; question?: string } }>('/ask', async (req, reply) => {
    const question = req.body?.question?.trim();
    if (!question) return reply.code(400).send({ error: 'question is required' });
    const named = req.body.cfo && CFOS[req.body.cfo] ? req.body.cfo : undefined;
    const cfo = named ?? pickCfo(question);
    const lang = langOf(question);
    const facts = cfoFacts(cfo, lang);
    const raw = await chatOr(facts.summary, [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: askPrompt(question, facts, lang) },
    ], { maxTokens: 160, temperature: 0.1, mockKey: `${named ? 'ask' : 'advice'}:${CFOS[cfo].name}` });

    // Clean it up in code, then golden rule 1: a number or date that is not in the facts (or the question) is never shown.
    const answer = tidyReply(raw, lang);
    const invented = findInventedNumbers(answer, [...facts.lines, facts.summary, question].join('\n'));
    if (!answer || invented.length > 0) {
      console.info(`[guard] ask:${cfo} ${answer ? `invented ${JSON.stringify(invented)}` : 'empty after tidy'} → rule answer`);
    }
    const result: AskResult = { cfo, text: answer && invented.length === 0 ? answer : facts.summary };
    return result;
  });
};

export default routes;
