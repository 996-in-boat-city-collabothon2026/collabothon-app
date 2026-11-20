// Owner: Pair 2 (Person B). Real replies from the live test (Llama 3.2 3B) on the test instance, 2026-11-20.
import { describe, expect, it } from 'vitest';
import { tidyReply } from './reply';

describe('tidyReply', () => {
  it('removes copied [brackets]', () => {
    expect(tidyReply('VAT [14 230,00 zł] trzeba zapłacić do [2026-11-25].', 'pl')).toBe('VAT 14 230,00 zł trzeba zapłacić do 2026-11-25.');
  });

  it('removes the preamble and list markers, keeps max 3 sentences, drops a cut-off sentence', () => {
    const live = `Oto kilka propozycji, aby pomóc Ci w zarządzaniu gotówką:

- Zalej faktury z FlotaTrans Sp. z o.o. i Kurier Express Kraków. To może pomóc.
- Przeglądaj koszty i sprzedaży.
- Przyglądaj się swojej lin`;
    expect(tidyReply(live, 'pl')).toBe('Zalej faktury z FlotaTrans Sp. z o.o. i Kurier Express Kraków. To może pomóc. Przeglądaj koszty i sprzedaży.');
  });

  it('translates English words dropped into a Polish reply', () => {
    expect(tidyReply('To jest ponad naszym safety bufferem. Na koniec roku lowest point jest niski.', 'pl'))
      .toBe('To jest ponad naszym buforem bezpieczeństwa. Na koniec roku najniższy punkt jest niski.');
  });

  it('a dot inside a date or number does not split a sentence', () => {
    expect(tidyReply('Zapłać VAT do 25.11.2026, kurs 4.27 zł. Potem ZUS.', 'pl')).toBe('Zapłać VAT do 25.11.2026, kurs 4.27 zł. Potem ZUS.');
  });

  it('nothing complete left → empty (caller uses the rule answer)', () => {
    expect(tidyReply('W grudniu mamy kilka problemów, które musimy', 'pl')).toBe('');
  });

  it('does not touch English replies with the Polish glossary', () => {
    expect(tidyReply("Here's my answer: keep the safety buffer.", 'en')).toBe('keep the safety buffer.');
  });
});
