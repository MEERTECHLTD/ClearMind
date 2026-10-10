/**
 * Voice-to-text for Quick Add (like Todoist's mic): on-device speech
 * recognition via expo-speech-recognition. Live (interim) results stream into
 * the caller's text; Quick Add's natural-language parser then turns
 * "remind me to call Sam tomorrow at 5pm p1" into a task with a date/reminder.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { logWarn } from '../../lib/logger';
import { pickVoiceLocale } from '../../services/voiceLocale';

export type VoiceState = 'idle' | 'listening' | 'unavailable';

const deviceLang = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; } catch { return 'en-US'; }
};

export function useVoiceInput(onTranscript: (text: string, isFinal: boolean) => void, onError?: (message: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const cb = useRef(onTranscript); cb.current = onTranscript;
  const err = useRef(onError); err.current = onError;
  const lang = useRef<string>(deviceLang());

  // Choose a locale the recognizer actually supports. iOS's availability check uses
  // the DEVICE locale (e.g. en-NG has no recognizer → "unavailable" → no mic), so
  // resolve the locale first and only hide the mic if nothing is supported.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        if (cancelled) return;
        if (locales.length) {
          const pick = pickVoiceLocale(deviceLang(), locales);
          if (pick) { lang.current = pick; return; }
          setState('unavailable');
          return;
        }
      } catch { /* not supported on this OS version — fall through */ }
      // Older Android returns no locale list: trust the platform availability check.
      try { if (!cancelled && !ExpoSpeechRecognitionModule.isRecognitionAvailable()) setState('unavailable'); }
      catch { if (!cancelled) setState('unavailable'); }
    })();
    return () => { cancelled = true; };
  }, []);

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('end', () => setState((s) => (s === 'unavailable' ? s : 'idle')));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results?.[0]?.transcript;
    if (t) cb.current(t, !!e.isFinal);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setState('idle');
    if (e.error === 'aborted') return;
    logWarn(`voice input: ${e.error} ${e.message ?? ''} (lang ${lang.current})`);
    const msg: Record<string, string> = {
      'not-allowed': 'Microphone or speech permission is off — enable both for ClearMind in Settings.',
      'service-not-allowed': 'Speech recognition is turned off — enable Siri & Dictation / speech recognition in Settings.',
      'language-not-supported': 'Voice input isn’t available for your language yet.',
      'network': 'Voice input needs an internet connection.',
      'audio-capture': 'Couldn’t use the microphone — close other apps using it and try again.',
      'no-speech': 'Didn’t catch anything — tap the mic and speak.',
      'speech-timeout': 'Didn’t catch anything — tap the mic and speak.',
    };
    err.current?.(msg[e.error] ?? 'Couldn’t hear that — try again.');
  });

  const start = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) { err.current?.('Microphone permission is needed for voice input.'); return; }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      ExpoSpeechRecognitionModule.start({ lang: lang.current, interimResults: true, continuous: false, addsPunctuation: false });
    } catch (e) {
      logWarn(`voice input start failed: ${String(e)}`);
      err.current?.('Voice input isn’t available on this device.');
    }
  }, []);

  const stop = useCallback(() => { try { ExpoSpeechRecognitionModule.stop(); } catch { /* not running */ } }, []);
  // Never leave the mic open when the sheet unmounts.
  useEffect(() => () => { try { ExpoSpeechRecognitionModule.abort(); } catch { /* not running */ } }, []);

  return { state, start, stop };
}
