/** @type {import('tailwindcss').Config} */
// ─── LEDGER Design System ─────────────────────────────────────────────────────
// Warm zinc neutrals + gold accent. Dark-first. WCAG AA compliant.
// All color values use space-separated RGB channels so Tailwind opacity
// modifiers (e.g. bg-gray-200/60) work correctly with CSS variables.
// ──────────────────────────────────────────────────────────────────────────────
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Mono is the game's voice — data-dense, precise, terminal-grade.
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // ── Warm zinc — overrides Tailwind's cold blue-gray ────────────────
        // In dark mode the scale inverts (100 ≈ page bg, 900 ≈ primary text).
        // This means ALL existing gray-* usage in components adapts automatically.
        gray: {
          50:  'rgb(var(--gray-50)  / <alpha-value>)',
          100: 'rgb(var(--gray-100) / <alpha-value>)',
          200: 'rgb(var(--gray-200) / <alpha-value>)',
          300: 'rgb(var(--gray-300) / <alpha-value>)',
          400: 'rgb(var(--gray-400) / <alpha-value>)',
          500: 'rgb(var(--gray-500) / <alpha-value>)',
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          800: 'rgb(var(--gray-800) / <alpha-value>)',
          900: 'rgb(var(--gray-900) / <alpha-value>)',
          950: 'rgb(var(--gray-950) / <alpha-value>)',
        },
        // ── Gold — replaces indigo as the primary accent ────────────────────
        // Calibrated per-mode: darker in light (readability), brighter in dark.
        indigo: {
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
          900: 'rgb(var(--gold-muted) / <alpha-value>)',
        },
        // Explicit semantic gold tokens for new components
        gold: {
          DEFAULT: 'rgb(var(--gold-400)  / <alpha-value>)',
          dim:     'rgb(var(--gold-300)  / <alpha-value>)',
          mid:     'rgb(var(--gold-500)  / <alpha-value>)',
          deep:    'rgb(var(--gold-600)  / <alpha-value>)',
          muted:   'rgb(var(--gold-muted)/ <alpha-value>)',
          fg:      'rgb(var(--gold-fg)   / <alpha-value>)',
        },
        // ── Slate → warm neutral (used in event-log production badges) ──────
        slate: {
          100: 'rgb(var(--gray-200) / <alpha-value>)',
          700: 'rgb(var(--gray-600) / <alpha-value>)',
        },
      },
      // ── Sharper radii — industrial / financial, not consumer-rounded ───────
      borderRadius: {
        sm:    '2px',
        DEFAULT: '3px',
        md:    '4px',
        lg:    '6px',
        xl:    '8px',
        '2xl': '12px',
        '3xl': '16px',
        full:  '9999px',
      },
      // ── Panel shadows aware of light / dark edge color ──────────────────────
      boxShadow: {
        panel:      '0 1px 4px 0 rgb(0 0 0 / 0.08),  0 0 0 1px rgb(var(--gray-200) / 1)',
        'panel-lg': '0 4px 20px 0 rgb(0 0 0 / 0.18), 0 0 0 1px rgb(var(--gray-200) / 1)',
        overlay:    '0 8px 40px 0 rgb(0 0 0 / 0.32), 0 0 0 1px rgb(var(--gray-300) / 0.8)',
      },
    },
  },
  plugins: [],
};
