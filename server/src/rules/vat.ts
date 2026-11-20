// Owner: Pair 2 (Person A). Marek ⚪: VAT (JPK_V7M) payment from the unpaid VAT obligation.
import { taxPayments } from './taxDue';
import type { Rule } from './index';

export const vat: Rule = () => taxPayments('VAT');
