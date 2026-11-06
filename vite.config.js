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
  // #1673/#1622: worktrees that get node_modules as a COPY inherit main checkout's
  // self-referential `node_modules/node_modules` symlink (a react-peer hoist workaround).
  // Packages inside node_modules then walk it and resolve react to MAIN's copy while the
  // app imports its own — esbuild emits react twice and every page dies on "Invalid hook
  // call". dedupe pins react/react-dom to this project's root for every importer, so the
  // dep graph has exactly one react regardless of how node_modules arrived.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
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
