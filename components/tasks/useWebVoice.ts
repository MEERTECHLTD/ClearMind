/**
 * Voice-to-text for the web Quick Add (Web Speech API — Chrome, Edge, Safari;
 * Firefox has none, so the mic is hidden there). Mirrors the mobile
 * useVoiceInput: live transcript streams into the task text and the
 * natural-language parser does the rest ("remind me to … tomorrow at 5pm").
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
  start(): void; stop(): void; abort(): void;
};

export const speechCtor = (w: any = typeof window !== 'undefined' ? window : undefined): (new () => Rec) | null =>
  (w && (w.SpeechRecognition || w.webkitSpeechRecognition)) || null;

/** Join a SpeechRecognition result list into one transcript. */
export const transcriptOf = (results: ArrayLike<ArrayLike<{ transcript: string }>>): string =>
  Array.from(results).map((r) => r[0]?.transcript ?? '').join('').replace(/\s+/g, ' ').trim();

export function useWebVoice(onTranscript: (text: string) => void, onError?: (msg: string) => void) {
  const Ctor = speechCtor();
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onTranscript); cb.current = onTranscript;
  const err = useRef(onError); err.current = onError;

  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => cb.current(transcriptOf(e.results));
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e?.error === 'aborted' || e?.error === 'no-speech') return;
      err.current?.(e?.error === 'not-allowed' ? 'Microphone access is blocked — allow it in the browser’s site settings.' : 'Couldn’t hear that — try again.');
    };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [Ctor]);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported: !!Ctor, listening, start, stop };
}
