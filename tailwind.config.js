/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  // lib/style.js builds class names like `bg-accent-${tone}-bg` at runtime,
  // which Tailwind's static scanner can never see — safelist every
  // combination explicitly so they survive the production build.
  safelist: ['sky', 'mint', 'rose', 'lavender', 'peach', 'teal'].flatMap((tone) => [
    `bg-accent-${tone}-bg`,
    `text-accent-${tone}-text`,
  ]),
  theme: {
    extend: {
      colors: {
        ink: '#16303A',
        paper: '#F5F4EF',
        amber: '#C98A2C',
        line: '#DEDBD0',
        accent: {
          sky: { bg: '#CFE8F3', text: '#1B5A73' },
          mint: { bg: '#D7EAD3', text: '#2F6B3A' },
          rose: { bg: '#F4D9DE', text: '#8A3B4B' },
          lavender: { bg: '#DED7F0', text: '#4C3B84' },
          peach: { bg: '#F6E1C9', text: '#8A5A22' },
          teal: { bg: '#D9E9E8', text: '#2C6763' },
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,48,58,0.04), 0 8px 20px -4px rgba(22,48,58,0.08)',
        'card-hover': '0 2px 4px rgba(22,48,58,0.05), 0 12px 28px -6px rgba(22,48,58,0.12)',
      },
    },
  },
  plugins: [],
};
