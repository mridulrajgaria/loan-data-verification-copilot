/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F7F5',
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F1F2EF',
          tertiary: '#E8EAE6',
        },
        border: {
          DEFAULT: '#D9DCD6',
          subtle: '#E6E8E3',
          strong: '#B8BCB4',
        },
        content: {
          primary: '#171918',
          secondary: '#626761',
          muted: '#8A908A',
        },
        brand: {
          DEFAULT: '#14532D',
          hover: '#0F3D21',
          subtle: '#EDFDF4',
          border: '#AAF0C4',
        },
        semantic: {
          critical: {
            DEFAULT: '#B42318',
            bg: '#FEF3F2',
            border: '#FECDCA',
          },
          high: {
            DEFAULT: '#B54708',
            bg: '#FFFAEB',
            border: '#FEDF89',
          },
          warning: {
            DEFAULT: '#A15C00',
            bg: '#FEFBE8',
            border: '#FEEF85',
          },
          verified: {
            DEFAULT: '#087443',
            bg: '#EDFDF4',
            border: '#AAF0C4',
          },
          info: {
            DEFAULT: '#175CD3',
            bg: '#EFF8FF',
            border: '#B2DDFF',
          },
          ai: {
            DEFAULT: '#6941C6',
            bg: '#F9F5FF',
            border: '#E9D7FE',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
        'dropdown': '0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
