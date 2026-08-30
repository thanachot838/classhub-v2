/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#6C5CE7', soft: '#A29BFE' },
        ok: '#00B894',
        warn: '#FDCB6E',
        danger: '#FF7675',
        pending: '#74B9FF',
      },
      borderRadius: { glass: '20px' },
      boxShadow: { glass: '0 8px 30px rgba(0,0,0,.08)' },
      fontFamily: {
        sans: ['"Sarabun"', 'system-ui', 'sans-serif'],
      },
      backdropBlur: { glass: '14px' },
    },
  },
  plugins: [],
};
