/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['var(--font-geist-mono)', '"Geist Mono"', 'monospace'],
      },
      // Semantic color tokens — every value is a CSS variable defined in
      // globals.css, so dark mode flips the palette by overriding variables
      // and never by branching markup (shadcn-style semantic tokens).
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        inset: 'var(--inset)',
        ink: 'var(--ink)',
        body: 'var(--body)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        brand: {
          DEFAULT: 'var(--brand)',
          text: 'var(--brand-text)',
          soft: 'var(--brand-soft)',
          line: 'var(--brand-line)',
        },
        'on-brand': 'var(--on-brand)',
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        warn: 'var(--warn)',
      },
      // Beautiful shadows (layered, neutral): exact utilities, resolved from
      // vars so dark mode restyles elevation in one place.
      boxShadow: {
        'soft-sm': 'var(--shadow-sm)',
        'soft-md': 'var(--shadow-md)',
        'soft-lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
