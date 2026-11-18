/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F6F7F9',
        hairline: '#E4E7EC',
        accent: { DEFAULT: '#2A78D6', soft: '#EAF2FC', ink: '#1D5BA8' },
        ink: { DEFAULT: '#1B2330', soft: '#475467', muted: '#667085', faint: '#98A2B3' },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        drawer: '-12px 0 32px rgba(16, 24, 40, 0.12)',
        pop: '0 8px 24px rgba(16, 24, 40, 0.14)',
      },
    },
  },
  plugins: [],
}
