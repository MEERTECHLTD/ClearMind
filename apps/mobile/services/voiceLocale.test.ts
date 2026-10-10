import { describe, it, expect } from 'vitest';
import { pickVoiceLocale } from './voiceLocale';

const IOS = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-ZA', 'fr-FR', 'fr-CA', 'es-ES', 'es-MX', 'yo-NG'];

describe('voice locale', () => {
  it('uses the device locale when the recognizer supports it', () => {
    expect(pickVoiceLocale('en-GB', IOS)).toBe('en-GB');
    expect(pickVoiceLocale('fr_CA', IOS)).toBe('fr-CA');
  });
  it('falls back to the same language when the regional variant is missing (en-NG)', () => {
    expect(pickVoiceLocale('en-NG', IOS)).toBe('en-GB');
    expect(pickVoiceLocale('fr-SN', IOS)).toBe('fr-FR');
  });
  it('falls back to English for unsupported languages, null when nothing is supported', () => {
    expect(pickVoiceLocale('ha-NG', IOS)).toBe('en-US');
    expect(pickVoiceLocale('en-US', [])).toBeNull();
  });
});
