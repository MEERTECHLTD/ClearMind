/**
 * Web boundary for the Gemini AI core.
 *
 * All prompt construction, response cleaning, action-command parsing, and the
 * Gemini generateContent logic live in the platform-agnostic shared core
 * (@clearmind/shared/ai/geminiCore), which never reads the environment. The only
 * web-specific concern is resolving the API key from process.env (injected by
 * Vite at build time) and passing it into the core. The mobile app provides the
 * same surface from EXPO_PUBLIC_GEMINI_API_KEY. (See DECISIONS.md, D5.)
 *
 * Public function/type names and signatures are unchanged, so every existing
 * view import (`from '../services/geminiService'`) keeps working untouched.
 */
import {
  generateResponse as coreGenerateResponse,
  generateIrisResponse as coreGenerateIrisResponse,
  generateIRISResponse as coreGenerateIRISResponse,
  reviewApplication as coreReviewApplication,
  type UserContext,
  type ApplicationReview,
} from '@clearmind/shared/ai/geminiCore';

// Pure, key-independent surface — re-exported verbatim from the shared core.
export { parseActionCommands, parseTaskCommands } from '@clearmind/shared/ai/geminiCore';
export type {
  ParsedTask,
  ParsedNote,
  ParsedHabit,
  ParsedGoal,
  ParsedProject,
  ParsedMilestone,
  ParsedEvent,
  ParsedApplication,
  ParsedLog,
  ParsedRant,
  ParsedDailyMapperEntry,
  ParsedDailyMapperUpdate,
  ParsedActions,
  UserContext,
  ApplicationReview,
} from '@clearmind/shared/ai/geminiCore';

// Global API key from environment variable (set in Vercel / injected by Vite).
const GLOBAL_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

// Check if API is configured (for UI purposes).
export const isApiConfigured = (): boolean => {
  return !!GLOBAL_API_KEY;
};

// Key-injecting wrappers — identical signatures to the original service.
export const generateResponse = (prompt: string): Promise<string> =>
  coreGenerateResponse(GLOBAL_API_KEY, prompt);

export const generateIrisResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  userContext?: UserContext
): Promise<string> => coreGenerateIrisResponse(GLOBAL_API_KEY, history, message, userContext);

export const generateIRISResponse = (
  history: { role: string; parts: { text: string }[] }[],
  message: string
): Promise<string> => coreGenerateIRISResponse(GLOBAL_API_KEY, history, message);

// AI Application Reviewer — fetch + analyze an opportunity link into a structured review.
export const reviewApplication = (url: string, applicantBackground?: string): Promise<ApplicationReview> =>
  coreReviewApplication(GLOBAL_API_KEY, url, applicantBackground);
