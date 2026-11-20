// Owner: Pair 2 (Person A). Marek ⚪: PIT advance from the unpaid PIT obligation.
import { taxPayments } from './taxDue';
import type { Rule } from './index';

export const pit: Rule = () => taxPayments('PIT');
