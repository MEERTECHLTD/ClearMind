import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import { serviceWorkerPlugin } from './service-worker/vitePlugin';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), serviceWorkerPlugin()],
      css: {
        // Build-time Tailwind (replaces the Play CDN). Configured inline rather
        // than via a root postcss.config.js so nothing under apps/mobile picks it up.
        postcss: { plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') })] },
      },
      build: {
        rollupOptions: {
          output: {
            // Stable vendor chunks: app-code deploys don't change their hashes, so
            // returning visitors keep them cached (and fewer chunk URLs churn).
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
              if (/node_modules\/(@firebase|firebase|idb)\//.test(id)) return 'vendor-firebase';
              return undefined;
            },
          },
        },
      },
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
        include: ['services/**/*.test.{ts,js}', 'utils/**/*.test.ts', 'components/vault/**/*.test.ts', 'shared/**/*.test.{ts,js}', 'server/**/*.test.{ts,js}', 'apps/mobile/components/notes/**/*.test.ts', 'apps/mobile/services/**/*.test.ts', 'apps/mobile/components/projects/**/*.test.ts'],
      }
    };
});
