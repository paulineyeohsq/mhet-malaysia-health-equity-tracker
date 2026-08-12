import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base path (not an absolute "/") so the built app works when
  // served from a GitHub Pages *project* site subpath
  // (username.github.io/repo-name/) without needing to hardcode the repo
  // name here. Combined with HashRouter (see src/App.tsx) and the
  // useData() hook's relative `${import.meta.env.BASE_URL}data/...` fetch
  // path, this build is portable to any static host or subpath with no
  // further config.
  base: './',
})
