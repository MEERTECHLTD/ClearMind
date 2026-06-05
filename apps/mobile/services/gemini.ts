/**
 * Mobile Gemini boundary — mirrors the web `geminiService` adapter exactly,
 * just reading the key from EXPO_PUBLIC_GEMINI_API_KEY instead of process.env via
 * Vite. All AI logic lives in @clearmind/shared/ai/geminiCore (DOM-free); the key
 * is injected. Same surface/signatures as web so the ported Iris/Rant/MindMap
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

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

export const isApiConfigured = (): boolean => !!GEMINI_API_KEY;

export const generateResponse = (prompt: string): Promise<string> =>
  coreGenerateResponse(GEMINI_API_KEY, prompt);

export const generateIrisResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  userContext?: UserContext
): Promise<string> => coreGenerateIrisResponse(GEMINI_API_KEY, history, message, userContext);

export const generateIRISResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => coreGenerateIRISResponse(GEMINI_API_KEY, history, message);
