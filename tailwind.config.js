/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--c-base) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-dim': 'rgb(var(--c-ink-dim) / <alpha-value>)',
        'ink-mute': 'rgb(var(--c-ink-mute) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        glacier: 'rgb(var(--c-glacier) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        '3xs': ['9px', { lineHeight: '12px' }],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '5px',
      },
      boxShadow: {
        modal: '0 32px 64px -32px rgb(0 0 0 / 0.55)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'panel-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'panel-in': 'panel-in 150ms cubic-bezier(0.2, 0, 0.2, 1)',
        'toast-in': 'toast-in 160ms cubic-bezier(0.2, 0, 0.2, 1)',
        sweep: 'sweep 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
