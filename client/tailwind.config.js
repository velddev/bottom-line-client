/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Pure neutral gray — replaces the blue-tinted Tailwind default.
        gray: {
          50:  '#f7f7f7',
          100: '#e8e8e8',
          200: '#c6c6c6',
          300: '#a0a0a0',
          400: '#707070',
          500: '#525252',
          600: '#3d3d3d',
          700: '#282828',
          800: '#1a1a1a',
          900: '#0d0d0d',
          950: '#050505',
        },
        // Neutral slate — replaces blue-tinted Tailwind default.
        slate: {
          300: '#9e9e9e',
          400: '#6e6e6e',
          500: '#575757',
          600: '#404040',
          700: '#2f2f2f',
          800: '#1e1e1e',
          900: '#111111',
        },
      },
    },
  },
  plugins: [],
};
