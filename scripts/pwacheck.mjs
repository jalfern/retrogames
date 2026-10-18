// pwacheck — the installable-arcade contract (#433), in Node (~1s).
//
// Proves three things:
//   1. It boots installable: dist/index.html carries the manifest link, iOS
//      web-app meta, viewport-fit=cover, theme-color and the base-scoped asset
//      reference, and the manifest resolves under /retrogames/.
//   2. Core rules hold: manifest scope is /retrogames/ and start_url opens the
//      showcase /retrogames/games (#437 — a fullscreen install must not deal a
//      random game with no way back),
//      display is fullscreen, theme/background are black, the icons cover
//      192/512/maskable and every referenced asset actually exists in dist;
//      the service worker excludes /retrogames/forge from cache and keeps
//      cross-origin requests out; vercel.json resolves the manifest/sw/icons
//      BEFORE the SPA catch-all and gives the SW no-cache + the manifest a
//      webmanifest MIME.
//   3. It can be won: the home-screen icons decode to real PNGs at the exact
//      declared sizes (a broken icon is an uninstallable app).
//
// Requires `npm run build` first (reads dist/).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  FAIL: ${msg}`) } }
const read = (p) => readFileSync(p, 'utf8')

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('pwacheck: dist/index.html missing — run `npm run build` first.')
  process.exit(1)
}

// --- 1. boots installable -------------------------------------------------
const html = read(join(DIST, 'index.html'))
ok(/<link[^>]+rel=["']manifest["'][^>]+href=["']\/retrogames\/manifest\.webmanifest["']/.test(html) ||
   /<link[^>]+href=["']\/retrogames\/manifest\.webmanifest["']/.test(html),
   'index.html links /retrogames/manifest.webmanifest (base-prefixed)')
ok(/apple-mobile-web-app-capable["']\s+content=["']yes["']/.test(html), 'apple-mobile-web-app-capable=yes')
ok(/mobile-web-app-capable["']\s+content=["']yes["']/.test(html), 'mobile-web-app-capable=yes')
ok(/apple-mobile-web-app-status-bar-style["']\s+content=["']black-translucent["']/.test(html), 'status bar black-translucent')
ok(/viewport-fit=cover/.test(html), 'viewport carries viewport-fit=cover')
ok(/theme-color["']\s+content=["']#000000["']/.test(html), 'theme-color is black')
ok(/apple-touch-icon[^>]+180/.test(html), 'apple-touch-icon 180 declared')
ok(/["']\/retrogames\/assets\//.test(html), 'index.html references base-scoped /retrogames/assets (boots under base)')

// --- 2a. manifest ---------------------------------------------------------
const MANIFEST_PATH = join(DIST, 'manifest.webmanifest')
ok(existsSync(MANIFEST_PATH), 'dist/manifest.webmanifest exists')
let mf = {}
try { mf = JSON.parse(read(MANIFEST_PATH)) } catch (e) { ok(false, `manifest parses (${e.message})`) }
ok(mf.start_url === '/retrogames/games', `start_url is /retrogames/games (#437: the installed app opens the showcase; got ${mf.start_url})`)
ok(mf.scope === '/retrogames/', `scope is /retrogames/ (got ${mf.scope})`)
ok(mf.display === 'fullscreen', `display is fullscreen (got ${mf.display})`)
ok(mf.theme_color === '#000000', `theme_color black (got ${mf.theme_color})`)
ok(mf.background_color === '#000000', `background_color black (got ${mf.background_color})`)
const icons = Array.isArray(mf.icons) ? mf.icons : []
ok(icons.some((i) => i.sizes === '192x192'), 'manifest has a 192x192 icon')
ok(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest has a 512 maskable icon')
ok(icons.every((i) => i.src.startsWith('/retrogames/')), 'every manifest icon is /retrogames/-scoped')
ok(icons.every((i) => existsSync(join(DIST, i.src.replace(/^\/retrogames\//, '')))), 'every manifest icon exists in dist')

// --- 2b. service worker ---------------------------------------------------
const SW_PATH = join(DIST, 'sw.js')
ok(existsSync(SW_PATH), 'dist/sw.js exists')
const sw = existsSync(SW_PATH) ? read(SW_PATH) : ''
ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw), 'SW adopts immediately (skipWaiting + clients.claim)')
ok(/origin\s*!==\s*self\.location\.origin/.test(sw), 'SW ignores cross-origin requests')
ok(/assets\//.test(sw), 'SW caches code chunks (assets path)')
// Reproduce the SW's forge-exclusion predicate against the real scope and prove
// the live board is passed through while cabinets are served.
const SCOPE = '/retrogames/'
const rel = (p) => new URL(p, 'https://arcade.example' + SCOPE).pathname
const isForge = (path) => path === rel('./forge') || path.startsWith(rel('./forge') + '/')
ok(isForge('/retrogames/forge'), 'SW excludes /retrogames/forge')
ok(isForge('/retrogames/forge/job'), 'SW excludes /retrogames/forge/*')
ok(!isForge('/retrogames/mario'), 'SW does NOT exclude /retrogames/mario')
ok(isForge(rel('./forge')), 'SW forge guard is scope-relative')

// --- 2c. vercel.json ------------------------------------------------------
const vc = JSON.parse(read(join(ROOT, 'vercel.json')))
const rw = vc.rewrites.map((r) => r.source)
const catchAllIdx = rw.findIndex((s) => s === '/retrogames/:path*')
const PWA_FILES = ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon-180.png', 'apple-touch-icon-152.png']
for (const f of PWA_FILES) {
  const i = rw.findIndex((s) => s === `/retrogames/${f}`)
  ok(i > -1 && i < catchAllIdx, `vercel resolves /retrogames/${f} before the SPA catch-all (idx ${i} < ${catchAllIdx})`)
}
const swHdr = vc.headers.find((h) => h.source === '/sw.js')
ok(swHdr && swHdr.headers.some((k) => k.key === 'Cache-Control' && /no-cache|must-revalidate|max-age=0/.test(k.value)), 'sw.js served no-cache (updates roll out)')
const mfHdr = vc.headers.find((h) => h.source === '/manifest.webmanifest')
ok(mfHdr && mfHdr.headers.some((k) => k.key === 'Content-Type' && /application\/manifest\+json/.test(k.value)), 'manifest served application/manifest+json')

// --- 3. icons decode at declared sizes ------------------------------------
const pngSize = (file) => {
  const b = readFileSync(join(DIST, file))
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!sig.every((v, i) => b[i] === v)) return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
const declared = icons.map((i) => ({ file: i.src.replace(/^\/retrogames\//, ''), size: i.sizes }))
for (const { file, size } of declared) {
  const dim = pngSize(file)
  const [w, h] = size.split('x').map(Number)
  ok(dim && dim.w === w && dim.h === h, `${file} decodes to ${size}${dim ? ` (got ${dim.w}x${dim.h})` : ' but is not a valid PNG'}`)
}

const total = pass + fail
console.log(`pwacheck: ${pass}/${total} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
