/**
 * Web boundary for the Gemini AI core.
 *
 * All prompt construction, response cleaning, action-command parsing, and the
 * Gemini generateContent logic live in the platform-agnostic shared core
 * (@clearmind/shared/ai/geminiCore). The web-specific part is the transport:
 * calls go to the authenticated server proxy (POST /api/v1/ai/generate) with
 * the signed-in user's Firebase ID token. No Gemini key is in the bundle
 * (docs/SECURITY.md S1). The mobile app does the same. (DECISIONS.md D5.)
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
import { createProxyTransport, DEFAULT_AI_ENDPOINT } from '@clearmind/shared/ai/transport';
import { auth, isFirebaseConfigured } from './firebase';

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

// Same-origin on the Vercel host; every other host (clearmind.expo.app, local
// dev) has no functions, so it calls the production API (CORS allows them).
const AI_ENDPOINT =
  typeof window !== 'undefined' && window.location.origin === 'https://clearmind.meertech.tech'
    ? '/api/v1/ai/generate'
    : DEFAULT_AI_ENDPOINT;

const transport = createProxyTransport({
  endpoint: AI_ENDPOINT,
  getIdToken: async () => (auth?.currentUser ? auth.currentUser.getIdToken() : null),
});

// AI needs a signed-in cloud account (the proxy authenticates and rate-limits per user).
export const isApiConfigured = (): boolean => isFirebaseConfigured() && !!auth?.currentUser;

// Key-injecting wrappers — identical signatures to the original service.
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

// AI Application Reviewer — fetch + analyze an opportunity link into a structured review.
export const reviewApplication = (url: string, applicantBackground?: string): Promise<ApplicationReview> =>
  coreReviewApplication(transport, url, applicantBackground);
