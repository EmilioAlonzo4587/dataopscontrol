/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', dark: '#4f46e5' },
        healthy:  '#10b981',
        warning:  '#f59e0b',
        critical: '#ef4444',
        surface:  '#1e293b',
        card:     '#0f172a',
      },
    },
  },
  plugins: [],
}
