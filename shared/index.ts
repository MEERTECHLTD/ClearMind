// @clearmind/shared — platform-agnostic core shared by the ClearMind web (Vite)
// and mobile (Expo) apps. There is ONE source of truth here; both apps import it.
//
// Populated incrementally in Phase 1 (see DECISIONS.md, D1–D6). The barrel below
// is filled as each module is extracted from services/*.

// The data model — the contract both apps share.
export * from './types';
