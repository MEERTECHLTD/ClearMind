import { describe, it, expect } from 'vitest';
import { speechCtor, transcriptOf } from './useWebVoice';

describe('web voice input', () => {
  it('detects the Web Speech API (prefixed or not) and its absence', () => {
    class R {}
    expect(speechCtor({ webkitSpeechRecognition: R })).toBe(R);
    expect(speechCtor({ SpeechRecognition: R })).toBe(R);
    expect(speechCtor({})).toBeNull();
  });
  it('joins interim result chunks into one transcript', () => {
    expect(transcriptOf([[{ transcript: 'remind me to call Sam' }], [{ transcript: '  tomorrow at 5pm' }]])).toBe('remind me to call Sam tomorrow at 5pm');
  });
});
