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
        // Reference Color Family (Blocks & Anchors)
        ref: {
          teal: {
            DEFAULT: '#204E4C',
            dark: '#173C3A',
            light: '#E6EFEF',
            border: '#B2CDCB',
          },
          lime: {
            DEFAULT: '#CDE78C',
            text: '#1C3806',
            light: '#F2F9DE',
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
          pink: {
            DEFAULT: '#FFD7FA',
            text: '#4A1744',
            light: '#FDF0FB',
            border: '#E8AEDF',
          },
        },
        brand: {
          teal: '#204E4C',
          'teal-hover': '#173C3A',
          lime: '#CDE78C',
          periwinkle: '#C1D8FF',
          yellow: '#FFEB8C',
          pink: '#FFD7FA',
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
