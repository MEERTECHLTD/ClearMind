/** @type {import('tailwindcss').Config} */
// Mirrors the web app's tailwind tokens (see index.html). Dark is the default
// theme on mobile, so the `midnight` palette uses the web's dark CSS-var values
// directly; the blue `accent` matches the web exactly. Light-mode theming via
// CSS vars is a Phase 5 refinement.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme surfaces (web --bg-main / --bg-card / --bg-card-hover).
        midnight: '#05050A',
        'midnight-light': '#0F1219',
        'midnight-lighter': '#1A1F2E',
        // Brand accent (web `accent` / `accent-hover`).
        accent: '#3B82F6',
        'accent-hover': '#2563EB',
        // Text + border tokens (web dark palette).
        'ink': '#e2e8f0',
        'ink-muted': '#9ca3af',
        'hairline': '#1f2937',
      },
    },
  },
  plugins: [],
};
