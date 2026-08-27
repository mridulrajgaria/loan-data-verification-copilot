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
        'brand-navy': '#19324A',
        'brand-navy-hover': '#122436',
        'brand-navy-subtle': '#EBF0F5',
        'brand-navy-border': '#C4D4E3',
        'brand-blue': '#315C8C',
        'brand-blue-hover': '#244569',
        'brand-blue-subtle': '#EDF3F9',
        'semantic-verified': '#16734B',
        'semantic-verified-bg': '#E7F3EC',
        'semantic-verified-border': '#BBE3CD',
        'semantic-warning': '#B56A12',
        'semantic-warning-bg': '#FFF4DF',
        'semantic-warning-border': '#FDE3B2',
        'semantic-critical': '#B42318',
        'semantic-critical-bg': '#FDECEC',
        'semantic-critical-border': '#F9C8C4',
        'semantic-ai': '#6B5A8E',
        'semantic-ai-bg': '#F5F1FA',
        'semantic-ai-border': '#E5DEF0',
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
