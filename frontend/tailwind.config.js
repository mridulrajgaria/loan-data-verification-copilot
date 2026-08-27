/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F5F1',
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F0F0EC',
          inset: '#EAEAE5',
        },
        border: {
          DEFAULT: '#D8DAD4',
          subtle: '#E4E6E0',
          strong: '#BFC3BB',
        },
        content: {
          primary: '#151817',
          secondary: '#626762',
          muted: '#92968F',
        },
        brand: {
          institutional: '#163B32',
          'institutional-hover': '#102B25',
          'institutional-subtle': '#E8EFECE8',
          secondary: '#315C50',
          navy: '#19324A',
        },
        semantic: {
          verified: '#087443',
          'verified-bg': '#EDFDF4',
          'verified-border': '#AAF0C4',
          warning: '#A15C00',
          'warning-bg': '#FEFBE8',
          'warning-border': '#FEEF85',
          critical: '#B42318',
          'critical-bg': '#FEF3F2',
          'critical-border': '#FECDCA',
          ai: '#725C91',
          'ai-bg': '#F5F1FA',
          'ai-border': '#E5DEF0',
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
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'section': '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'drawer': '-4px 0 24px 0 rgba(0, 0, 0, 0.06)',
        'modal': '0 16px 32px -4px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
