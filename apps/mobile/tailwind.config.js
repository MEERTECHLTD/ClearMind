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
        // Theme tokens are CSS variables (lib/theme.ts sets them per scheme via
        // NativeWind vars()), so every screen follows Light / Dark / System.
        midnight: 'rgb(var(--c-bg) / <alpha-value>)',
        'midnight-light': 'rgb(var(--c-card) / <alpha-value>)',
        'midnight-lighter': 'rgb(var(--c-card2) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-muted) / <alpha-value>)',
        // NativeWind's preset also defines `hairline` as a border WIDTH, so use
        // `line` for border colours (`border-hairline` draws a full box).
        hairline: 'rgb(var(--c-line) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
