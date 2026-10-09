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

export type VoiceState = 'idle' | 'listening' | 'unavailable';

const deviceLang = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; } catch { return 'en-US'; }
};

export function useVoiceInput(onTranscript: (text: string, isFinal: boolean) => void, onError?: (message: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const cb = useRef(onTranscript); cb.current = onTranscript;
  const err = useRef(onError); err.current = onError;

  useEffect(() => {
    try { if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) setState('unavailable'); }
    catch { setState('unavailable'); }
  }, []);

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('end', () => setState((s) => (s === 'unavailable' ? s : 'idle')));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results?.[0]?.transcript;
    if (t) cb.current(t, !!e.isFinal);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setState('idle');
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    logWarn(`voice input: ${e.error} ${e.message ?? ''}`);
    err.current?.(e.error === 'not-allowed' ? 'Microphone permission is off — enable it in system settings.' : 'Couldn’t hear that — try again.');
  });

  const start = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) { err.current?.('Microphone permission is needed for voice input.'); return; }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      ExpoSpeechRecognitionModule.start({ lang: deviceLang(), interimResults: true, continuous: false, addsPunctuation: false });
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
