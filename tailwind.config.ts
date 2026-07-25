import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:       '#0A0A0A',
        surface:      '#141414',
        raised:       '#1E1E1E',
        border:       '#2A2A2A',
        primary:      '#F0F0F0',
        secondary:    '#888888',
        muted:        '#4A4A4A',
        accent:       '#F0B429',
        'accent-dim': '#7A5A14',
        correct:      '#22C55E',
        wrong:        '#EF4444',
        pending:      '#888888',
        live:         '#F0B429',
        gold:         '#F0B429',
        silver:       '#A0A0A0',
        bronze:       '#CD7F32',
      },
      fontFamily: {
        display: ['var(--font-display)', 'monospace'],
        body:    ['var(--font-body)', 'system-ui'],
      },
    },
  },
  plugins: [],
};
export default config;
