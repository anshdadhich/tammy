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
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
