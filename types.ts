// The ClearMind data model is the contract shared by the web and mobile apps.
// It now lives in the platform-agnostic shared core; this file re-exports it so
// every existing web import (`'../types'`, `'@/types'`, …) keeps working with no
// edits. Edit shared/types.ts — not this file. (See DECISIONS.md, D1.)
export * from './shared/types';
