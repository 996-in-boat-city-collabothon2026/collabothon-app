// KSeF answers in Polish (see server/src/ksef/nip.ts → nipError). The stored rejectionReason stays Polish,
// like the real KSeF answer; the English UI shows it through this translator.
// Each detail after the colon is a full clause, so the agents' facts can reuse it in a sentence.
const NIP = 'Invalid buyer NIP (Podmiot2)';

const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/NIP nabywcy.*?wymagane (\d+) cyfr/i, (m) => `${NIP}: it must have ${m[1]} digits`],
  [/NIP nabywcy.*?błędna suma kontrolna/i, () => `${NIP}: the checksum does not match`],
  [/NIP nabywcy.*?nieobsługiwany prefiks kraju „(.+?)”/i, (m) => `${NIP}: the country prefix "${m[1]}" is not supported`],
  [/NIP nabywcy.*?niemiecki numer VAT to DE i 9 cyfr/i, () => `${NIP}: a German VAT ID is DE and 9 digits`],
];

/** English text for a KSeF rejection reason. Unknown (or already English) reasons come back unchanged. */
export function ksefReasonEn(reason: string): string {
  for (const [re, en] of RULES) {
    const m = re.exec(reason);
    if (m) return en(m);
  }
  return reason;
}
