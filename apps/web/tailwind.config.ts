import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        ink: { 900: '#0b1020', 800: '#111833', 700: '#1a2347' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,0.05), 0 4px 16px rgba(16,24,40,0.06)' },
    },
  },
  plugins: [],
};
export default config;
