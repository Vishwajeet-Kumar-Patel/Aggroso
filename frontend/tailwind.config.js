/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Light theme default
  theme: {
    extend: {
      colors: {
        // Map CSS variable tokens so Tailwind classes work alongside variables
        bg:      'var(--color-bg)',
        surface: 'var(--color-surface)',
        border:  'var(--color-border)',
        primary: 'var(--color-text)',
        muted:   'var(--color-muted)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover:   'var(--color-accent-hover)',
          soft:    'var(--color-accent-soft)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          soft:    'var(--color-success-soft)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          soft:    'var(--color-warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          soft:    'var(--color-danger-soft)',
        },
      },
      fontFamily: {
        // System font stack — no web font downloads
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
        mono: [
          'ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace',
        ],
      },
      fontSize: {
        'sm':   ['0.875rem',  { lineHeight: '1.5' }],
        'base': ['1rem',      { lineHeight: '1.6' }],
        'lg':   ['1.25rem',   { lineHeight: '1.4' }],
        'xl':   ['1.75rem',   { lineHeight: '1.3' }],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm:      '2px',
        md:      '4px',
        lg:      '4px', // Keeps rounded-lg in old code from being huge
      },
      maxWidth: {
        container: '1100px',
      },
      spacing: {
        '1':  '4px',
        '2':  '8px',
        '4':  '16px',
        '6':  '24px',
        '8':  '32px',
        '12': '48px',
      },
    },
  },
  plugins: [],
}
