/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#EDF2EB', // Soft sage/warm background matching FinFox reference
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#E2E9E0',
          inset: '#D8E2D6',
        },
        border: {
          DEFAULT: '#CDD7CB',
          subtle: '#DEE6DC',
          strong: '#B4C2B1',
        },
        content: {
          primary: '#131D1B',
          secondary: '#495B56',
          muted: '#768883',
        },
        // Reference Palette Tokens (Deep Teal, Lime, Periwinkle, Yellow, Coral/Light Red)
        ref: {
          teal: {
            DEFAULT: '#204E4C',
            dark: '#163B39',
            light: '#E2ECEB',
            border: '#9BB8B6',
          },
          lime: {
            DEFAULT: '#CDE78C',
            text: '#1C3806',
            light: '#F4FAE8',
            border: '#B3D463',
          },
          periwinkle: {
            DEFAULT: '#C1D8FF',
            text: '#0D2754',
            light: '#EEF4FF',
            border: '#9DC0FB',
          },
          yellow: {
            DEFAULT: '#FFEB8C',
            text: '#453800',
            light: '#FFF9DC',
            border: '#F0D452',
          },
          coral: {
            DEFAULT: '#FEECEB',
            text: '#7A1D18',
            border: '#F9C3BF',
          },
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
        },
      },
      fontFamily: {
        sans: ['"Figtree"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        xs: '3px',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'section': '0 1px 2px 0 rgba(19, 29, 27, 0.04), 0 8px 20px -12px rgba(19, 29, 27, 0.10)',
        'drawer': '-4px 0 24px 0 rgba(0, 0, 0, 0.12)',
        'modal': '0 16px 32px -4px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
};
