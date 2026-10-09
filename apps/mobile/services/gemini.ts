/**
 * Mobile Gemini boundary — mirrors the web `geminiService` adapter. All AI logic
 * lives in @clearmind/shared/ai/geminiCore (DOM-free); requests go through the
 * authenticated server proxy with the user's Firebase ID token (guests included —
 * anonymous auth), so no Gemini key ships in the APK (docs/SECURITY.md S2). Same surface/signatures as web so the ported Iris/Rant/MindMap
 * views call it identically. (DECISIONS.md D5.)
 */
import {
  generateResponse as coreGenerateResponse,
  generateIrisResponse as coreGenerateIrisResponse,
  generateIRISResponse as coreGenerateIRISResponse,
  type UserContext,
} from '@clearmind/shared/ai/geminiCore';

export { parseActionCommands, parseTaskCommands } from '@clearmind/shared/ai/geminiCore';
export type {
  ParsedTask, ParsedNote, ParsedHabit, ParsedGoal, ParsedProject, ParsedMilestone,
  ParsedEvent, ParsedApplication, ParsedLog, ParsedRant, ParsedDailyMapperEntry,
  ParsedDailyMapperUpdate, ParsedActions, UserContext,
} from '@clearmind/shared/ai/geminiCore';

import { createProxyTransport } from '@clearmind/shared/ai/transport';
import { auth, isFirebaseConfigured } from '../lib/firebase';

const transport = createProxyTransport({
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
});

export const isApiConfigured = (): boolean => isFirebaseConfigured() && !!auth?.currentUser;

export const generateResponse = (prompt: string): Promise<string> =>
  coreGenerateResponse(transport, prompt);

export const generateIrisResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  userContext?: UserContext
): Promise<string> => coreGenerateIrisResponse(transport, history, message, userContext);

export const generateIRISResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => coreGenerateIRISResponse(transport, history, message);
