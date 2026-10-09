import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // No `define` of GEMINI_API_KEY: AI goes through the server proxy, so no key
      // is ever inlined into the public bundle (docs/SECURITY.md S1).
      resolve: {
        alias: {
          // Shared platform-agnostic core, resolved straight to TS source (see
          // DECISIONS.md D2). Order matters: the more specific alias is unused
          // because Vite does prefix replacement, but listing the package root
          // is enough — `@clearmind/shared/data/collections` -> shared/data/collections.
          '@clearmind/shared': path.resolve(__dirname, 'shared'),
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        globals: true,
        environment: 'node',
        include: ['services/**/*.test.{ts,js}', 'components/vault/**/*.test.ts', 'shared/**/*.test.{ts,js}', 'server/**/*.test.{ts,js}', 'apps/mobile/components/notes/**/*.test.ts', 'apps/mobile/services/**/*.test.ts', 'apps/mobile/components/projects/**/*.test.ts'],
      }
    };
});
