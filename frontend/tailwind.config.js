/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F4F0',
        surface: {
          DEFAULT: '#FCFCFA',
          secondary: '#F0F0EB',
          inset: '#EAEAE4',
        },
        border: {
          DEFAULT: '#D9D9D3',
          subtle: '#E5E5DF',
          strong: '#BFC2BB',
        },
        content: {
          primary: '#171817',
          secondary: '#6E716C',
          muted: '#949790',
        },
        brand: {
          navy: {
            DEFAULT: '#19324A',
            hover: '#122436',
            subtle: '#EBF0F5',
            border: '#C4D4E3',
          },
          blue: {
            DEFAULT: '#315C8C',
            hover: '#244569',
            subtle: '#EDF3F9',
          },
        },
        semantic: {
          verified: {
            DEFAULT: '#16734B',
            bg: '#E7F3EC',
            border: '#BBE3CD',
          },
          warning: {
            DEFAULT: '#B56A12',
            bg: '#FFF4DF',
            border: '#FDE3B2',
          },
          critical: {
            DEFAULT: '#B42318',
            bg: '#FDECEC',
            border: '#F9C8C4',
          },
          ai: {
            DEFAULT: '#6B5A8E',
            bg: '#F5F1FA',
            border: '#E5DEF0',
          },
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'panel': '0 1px 3px 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
        'drawer': '-4px 0 24px 0 rgba(0, 0, 0, 0.08)',
        'modal': '0 16px 32px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
