// Vitest config for the Firestore security-rules suite (tests/rules/), kept
// separate from the main suite because it needs the Firestore emulator:
//   npm run test:rules
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
