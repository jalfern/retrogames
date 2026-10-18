/* RetroGames Arcade service worker (#433).
 *
 * Offline: the shell (index.html) and every game's code chunk are cached after
 * first play, so a cabinet you have opened once opens again on a dead connection.
 *
 * Rules:
 *   - Same-origin only, and only inside the /retrogames/ scope the registration
 *     grants (the SW lives at /retrogames/sw.js, so its scope is /retrogames/).
 *   - v2 (#437): the manifest start_url moved to /retrogames/games; the version
 *     bump purges v1 caches so an installed app never reboots into a stale
 *     manifest or start page.
 *   - The Forge board (/retrogames/forge) is live tooling — never intercepted,
 *     never cached.
 *   - Navigation is network-first (deployments roll out) with an offline shell
 *     fallback; hashed immutable assets are cache-first; everything else under
 *     scope is stale-while-revalidate.
 */

const VERSION = 'retrogames-v2'
const SHELL = `${VERSION}-shell`
const IMMUTABLE = `${VERSION}-assets`
const RUNTIME = `${VERSION}-runtime`
const CACHES = [SHELL, IMMUTABLE, RUNTIME]

const SCOPE = self.registration.scope
const rel = (p) => new URL(p, SCOPE).pathname
const SHELL_URLS = [rel('./'), rel('./index.html')]

const isForge = (path) => path === rel('./forge') || path.startsWith(rel('./forge') + '/')
// Standalone demo pages (public/demos/*.html) are not the shell: a navigation
// there must not be cached AS index.html, or the offline arcade would open a demo.
const isDemo = (path) => path.startsWith(rel('./demos/'))
const isImmutable = (path) => path.startsWith(rel('./assets/'))

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function networkFirstShell(req) {
  try {
    const res = await fetch(req)
    const copy = res.clone()
    const c = await caches.open(SHELL)
    await c.put(rel('./index.html'), copy)
    return res
  } catch (err) {
    const cached = await caches.match(req) || await caches.match(rel('./index.html'))
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res && res.ok) {
    const c = await caches.open(cacheName)
    c.put(req, res.clone())
  }
  return res
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(req)
  const network = fetch(req)
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname
  if (isForge(path) || isDemo(path)) return
  if (!path.startsWith(SCOPE.replace(/\/$/, '')) && path !== SCOPE) return
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirstShell(req))
    return
  }
  if (req.destination === 'worker') return
  if (isImmutable(path)) {
    event.respondWith(cacheFirst(req, IMMUTABLE))
    return
  }
  event.respondWith(staleWhileRevalidate(req, RUNTIME))
})
