import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// #495: recording files stamp the build commit they were captured on.
let BUILD_COMMIT = 'unknown'
try { BUILD_COMMIT = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown' } catch { /* shallow/no-git builds stay honest */ }

// https://vite.dev/config/
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  base: '/retrogames/',
  define: {
    __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
  },
  build: {
    sourcemap: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})
