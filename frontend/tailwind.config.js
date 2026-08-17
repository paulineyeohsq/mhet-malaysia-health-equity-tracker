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
          // so this value only affects Tailwind-class usage (links, active
          // nav state, accents, buttons) — the dataviz-skill-validated
          // 8-hue categorical chart palette itself is unchanged (series 2-8
          // stay as-is; only the brand accent, series-1, is retheme'd).
          // Sampled from the MY-HEO logo (frontend/public/logo.png, Pillow
          // color-clustering: teal #86c0c2 was the dominant icon-fill hue)
          // then darkened along the same hue (182°) from #86c0c2 (1.98:1,
          // fails WCAG AA) to #3a7173 (5.40:1) — matches the previous
          // accent blue's own 5.49:1 contrast, same legibility, new hue.
          1: '#3a7173', // teal
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
        // Sequential intensity ramp (choropleth map only) — light teal to
        // navy, both sampled from the logo (icon teal #86c0c2, wordmark
        // navy #1c3d60), linearly interpolated across the same 11 stops
        // (100-700) the previous blue-only ramp used.
        seq: {
          100: '#e3f2f3', 150: '#d2e3e7', 200: '#c2d4da', 250: '#b1c5ce',
          300: '#a1b6c2', 350: '#90a7b6', 400: '#8098aa', 450: '#6f889d',
          500: '#5e7991', 550: '#4e6a85', 600: '#3d5b78', 650: '#2d4c6c',
          700: '#1c3d60',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
