/**
 * Tailwind for the WEB app (built by Vite/PostCSS — see vite.config.ts).
 * Ported 1:1 from the inline `tailwind.config` that index.html used to feed the
 * Tailwind Play CDN (same Tailwind major, v3). The mobile app has its own
 * config in apps/mobile/tailwind.config.js (NativeWind).
 *
 * `content` must cover every file that contains class names. Classes built at
 * runtime from string fragments are NOT detected — write full class names.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './shared/notes/**/*.ts',
  ],
  theme: {
    extend: {
      colors: {
        midnight: 'var(--bg-main)',
        'midnight-light': 'var(--bg-card)',
        'midnight-lighter': 'var(--bg-card-hover)',
        accent: '#3B82F6',
        'accent-hover': '#2563EB',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
};
