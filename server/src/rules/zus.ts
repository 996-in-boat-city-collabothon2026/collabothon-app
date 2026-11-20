// Owner: Pair 2 (Person A). Marek ⚪: ZUS payment from the unpaid ZUS obligation.
import { taxPayments } from './taxDue';
import type { Rule } from './index';

export const zus: Rule = () => taxPayments('ZUS');
