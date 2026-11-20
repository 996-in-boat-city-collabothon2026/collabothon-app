// Owner: Pair 2 (Person B). Shapes of real replies from the live tests (Llama 3.2 3B), now English only.
import { describe, expect, it } from 'vitest';
import { tidyReply } from './reply';

describe('tidyReply', () => {
  it('removes copied [brackets]', () => {
    expect(tidyReply('VAT [14 230,00 zł] is due on [2026-11-25].')).toBe('VAT 14 230,00 zł is due on 2026-11-25.');
  });

  it('removes the preamble and list markers, keeps max 3 sentences, drops a cut-off sentence', () => {
    const live = `Here are a few ideas to help you manage cash:

- Send reminders to FlotaTrans Sp. z o.o. and Kurier Express Kraków. It may help.
- Review your costs.
- Look at your credit lin`;
    expect(tidyReply(live)).toBe('Send reminders to FlotaTrans Sp. z o.o. and Kurier Express Kraków. It may help. Review your costs.');
  });

  it('a dot inside a date or number does not split a sentence', () => {
    expect(tidyReply('Pay VAT by 25.11.2026, rate 4.27 zł. Then ZUS.')).toBe('Pay VAT by 25.11.2026, rate 4.27 zł. Then ZUS.');
  });

  it('nothing complete left → empty (caller uses the rule answer)', () => {
    expect(tidyReply('In December we have a few problems that we must')).toBe('');
  });

  it('keeps a plain English reply', () => {
    expect(tidyReply("Here's my answer: keep the safety buffer.")).toBe('Keep the safety buffer.');
  });
});

describe('tidyReply: filler from the small model', () => {
  it('drops "Sure, here is what we must do." and a leading "Sure," / "Of course:"', () => {
    expect(tidyReply('Sure, here is what we must do. Send reminders to FlotaTrans.')).toBe('Send reminders to FlotaTrans.');
    expect(tidyReply('Sure, today is November 20, 2026, pay VAT by November 25, 2026.')).toBe('Today is November 20, 2026, pay VAT by November 25, 2026.');
    expect(tidyReply('Of course: the balance drops to -20 275,00 zł.')).toBe('The balance drops to -20 275,00 zł.');
  });
});
