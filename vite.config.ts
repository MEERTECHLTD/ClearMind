import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // Use environment variable from loadEnv or fallback to process.env for production builds
    const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey)
      },
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
        include: ['services/**/*.test.{ts,js}'],
      }
    };
});
