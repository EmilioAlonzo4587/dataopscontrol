/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      colors: {
        primary: { DEFAULT: '#06b6d4', dark: '#0891b2' },
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
