/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#fcfcfb',
        plane: '#f9f9f7',
        ink: {
          primary: '#0b0b0b',
          secondary: '#52514e',
          // Darkened from the original #898781 (3.4:1 on this app's light
          // surfaces) to #726f68 (4.8:1+) so muted captions/source-notes
          // meet WCAG 2 AA 1.4.3 for normal-size text — caught by an axe-core
          // accessibility scan during final QA (see docs/METHODOLOGY.md).
          muted: '#726f68',
        },
        line: {
          grid: '#e1e0d9',
          axis: '#c3c2b7',
        },
        series: {
          // Note: chart marks (Recharts stroke/fill props) use their own
          // literal hex constants in each page, independent of this token,
          // so this darkened value only affects Tailwind-class usage
          // (links, active nav state, accents) — the dataviz-skill-
          // validated chart palette itself is unchanged. Darkened from
          // #2a78d6 (4.3:1, fails WCAG AA at small text sizes) to #1c66c2
          // (5.5:1) after an axe-core accessibility scan flagged link text.
          1: '#1c66c2', // blue
          2: '#eb6834', // orange
          3: '#1baf7a', // aqua
          4: '#eda100', // yellow
          5: '#e87ba4', // magenta
          6: '#008300', // green
          7: '#4a3aa7', // violet
          8: '#e34948', // red
        },
        status: {
          good: '#0ca30c',
          warning: '#fab219',
          serious: '#ec835a',
          critical: '#d03b3b',
        },
        seq: {
          100: '#cde2fb', 150: '#b7d3f6', 200: '#9ec5f4', 250: '#86b6ef',
          300: '#6da7ec', 350: '#5598e7', 400: '#3987e5', 450: '#2a78d6',
          500: '#256abf', 550: '#1c5cab', 600: '#184f95', 650: '#104281',
          700: '#0d366b',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
