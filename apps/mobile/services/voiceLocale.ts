/**
 * Pick the speech-recognition locale to use. iOS's SFSpeechRecognizer only knows a
 * fixed set of locales — e.g. a phone set to English (Nigeria) "en-NG" has no
 * recognizer, so asking for the device locale fails (and the availability check
 * built on it says "unavailable"). Prefer the exact device locale, then the same
 * language (en-NG → en-GB/en-US), then English. Pure; unit-tested.
 */
const norm = (l: string) => l.replace('_', '-').toLowerCase();

export function pickVoiceLocale(device: string | null | undefined, supported: string[]): string | null {
  if (!supported.length) return null;
  const byNorm = new Map(supported.map((s) => [norm(s), s]));
  const want = norm(device || 'en-US');
  if (byNorm.has(want)) return byNorm.get(want)!;
  const lang = want.split('-')[0];
  // Common, well-supported variants first for the same language.
  const preferred: Record<string, string[]> = { en: ['en-gb', 'en-us'], fr: ['fr-fr'], es: ['es-es', 'es-mx'], pt: ['pt-br', 'pt-pt'], ar: ['ar-sa'] };
  for (const p of preferred[lang] ?? []) if (byNorm.has(p)) return byNorm.get(p)!;
  const sameLang = supported.find((s) => norm(s).split('-')[0] === lang);
  if (sameLang) return sameLang;
  return byNorm.get('en-us') ?? byNorm.get('en-gb') ?? supported[0];
}
