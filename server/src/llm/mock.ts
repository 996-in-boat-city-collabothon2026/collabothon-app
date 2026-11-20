// Owner: Pair 1. Canned answers so everyone can build without a model.
// Add a key here whenever you add a new mockKey in agent code.
import type { ChatMessage } from './provider';

const CANNED: Record<string, string> = {
  'boardroom:marek':
    'VAT for last month is due on the 25th and one KSeF invoice was rejected because of a wrong buyer NIP. I re-validated it. We must pay VAT on time: the penalty interest is not worth it.',
  'boardroom:anna':
    'Paying VAT and ZUS takes us below our safety buffer in about 9 days. Two fleet invoices are overdue. I suggest reminders first, and a small credit line only as a backup.',
  'boardroom:tomasz':
    'Labour on three recent jobs was billed under our hourly rate. Fixing that alone covers a good part of the gap. Parts markup is fine.',
  'boardroom:kasia':
    'No big investments this month. Once the receivables come in, we can revisit the second diagnostic station.',
  'boardroom:chair':
    '{"summary":"Pay VAT on time, chase the overdue fleet invoices, fix labour pricing. Keep the credit line as a backup only.","decisionActionIds":[]}',
  explain: 'This needs your OK because it moves money. The numbers come from your invoices and bank balance.',
};

export function mockReply(key: string | undefined, messages: ChatMessage[]): string {
  if (key && CANNED[key]) return CANNED[key];
  if (key?.startsWith('ask:')) return `(mock) ${key.slice(4)} here. Good question, I would look at the numbers on the dashboard first.`;
  const last = messages[messages.length - 1]?.content ?? '';
  return `(mock answer) ${last.slice(0, 120)}`;
}
