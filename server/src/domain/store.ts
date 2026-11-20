// Owner: Pair 2. In-memory "database" loaded from seed JSON. resetDb() restores the demo.
// Cash planning rule: unpaid SALES invoices = money in; Obligations = money out.
// (Purchase invoices are mirrored as SUPPLIER obligations, so don't count them twice.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Action, ActivityEntry, BankAccount, CfoId, Expense, FxRate, Invoice, Obligation, RepairOrder, Settings, Shop,
} from '@cfo/shared';

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');
const readSeed = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8')) as T;

export interface Db {
  shop: Shop;
  bank: BankAccount;
  invoices: Invoice[];
  repairOrders: RepairOrder[];
  obligations: Obligation[];
  expenses: Expense[]; // money already spent (pie chart)
  fxRates: FxRate[];
  actions: Action[];
  activity: ActivityEntry[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  autonomy: {
    ksef_revalidate: 'auto',
    payment_reminder: 'ask',
    tax_payment: 'ask',
    supplier_payment: 'ask',
    credit_line: 'ask',
    fx_hedge: 'ask',
  },
};

function loadSeed(): Db {
  const { shop, bank } = readSeed<{ shop: Shop; bank: BankAccount }>('shop.json');
  return {
    shop,
    bank,
    invoices: readSeed<Invoice[]>('invoices.json'),
    repairOrders: readSeed<RepairOrder[]>('repair-orders.json'),
    obligations: readSeed<Obligation[]>('obligations.json'),
    expenses: readSeed<Expense[]>('expenses.json'),
    fxRates: readSeed<FxRate[]>('fx-rates.json'),
    actions: [],
    activity: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** The one shared state object. Mutate it in place; never reassign. */
export const db: Db = loadSeed();

export function resetDb(): void {
  Object.assign(db, loadSeed());
  logActivity('system', 'Demo data reset', false);
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** "Now" for the demo = shop.today at the current clock time, so dates are repeatable. */
export const nowIso = () => `${db.shop.today}T${new Date().toISOString().slice(11)}`;

export function logActivity(actor: CfoId | 'user' | 'system', text: string, simulated: boolean, actionId?: string) {
  db.activity.unshift({ id: newId('act'), at: nowIso(), actor, text, simulated, actionId });
}
