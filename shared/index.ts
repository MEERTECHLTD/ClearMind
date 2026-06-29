// @clearmind/shared — platform-agnostic core shared by the ClearMind web (Vite)
// and mobile (Expo) apps. There is ONE source of truth here; both apps import it.
//
// Populated incrementally in Phase 1 (see DECISIONS.md, D1–D6). The barrel below
// is filled as each module is extracted from services/*.

// The data model — the contract both apps share.
export * from './types';

// Applications domain helpers (option lists, colours, reminder presets, deadline rules).
export * from './applications';

// Canonical store/collection naming — single source of truth for sync.
export * from './data/collections';

// Last-write-wins merge engine.
export * from './sync/merge';

// Firestore read/write/subscribe ops (inject db + uid). Pulls in firebase.
export * from './data/firestore';

// Shared collaborative Applications workspaces (inject db; membership by email).
export * from './data/workspaces';

// Gemini AI core (inject apiKey). Pulls in @google/genai.
export * from './ai/geminiCore';
