/**
 * jsdos — one loader for the DOSBox emulator, used by every .jsdos title.
 *
 * WHY. index.html used to hard-require js-dos for the whole arcade:
 *
 *   <script src="/retrogames/js-dos/js-dos.js">
 *   <link rel="stylesheet" href="/retrogames/js-dos/js-dos.css">
 *
 * Two problems, one of them silent:
 *
 * 1. **Every DOS title was broken under `npm run dev`.** Vite prepends the base
 *    to absolute URLs in index.html, so the dev server was asked for
 *    `/retrogames/retrogames/js-dos/js-dos.js`, the SPA fallback answered with
 *    index.html (status 200, so nothing looks alarming in the network log), the
 *    script failed to parse as JS, and `window.Dos` stayed undefined. King's
 *    Quest and Ultima I–V therefore rendered "DOSBox emulator failed to load"
 *    in development and worked in production — which is why nobody noticed:
 *    the only checks in the repo cover Mario/IronKeep/Zork, none cover DOS.
 *    (Found by the stage-0 smoke test, not by a human hitting it.)
 * 2. Pong and Mario were downloading a ~300 KB emulator they never use.
 *
 * So: load it on demand, from a URL assembled with `import.meta.env.BASE_URL`,
 * which is correct in dev, in a preview, and under jalfern.com/retrogames.
 * Keep `vite.config.js` `base` and `App.jsx` `basename` in sync (AGENTS.md
 * › Gotchas › Base path) and this stays correct.
 */

import { installDosKeys } from './dosKeys'

const cache = { promise: null }

/**
 * Make the emulator's framebuffer readable.
 *
 * js-dos draws DOSBox's output with **WebGL**, and a WebGL canvas without
 * `preserveDrawingBuffer` is cleared the moment it is composited. The symptom is
 * nasty and silent: the game looks perfect on screen, and every pixel readback —
 * `drawImage`, `getImageData`, `toDataURL` — returns solid black. Verified on a
 * live King's Quest: an element screenshot showed the intro, `drawImage` of the
 * same canvas returned 0 lit pixels out of 64,000.
 *
 * The entire `eye` sensor arm (CGA font OCR, Graham sprite match, screen
 * fingerprints) depends on reading frames, so we force the flag on before the
 * emulator ever asks for a context. Cost is a little GPU bandwidth at 320x200 —
 * irrelevant here, and the price of a sensor that works.
 */
export function forceReadableGl() {
  if (typeof HTMLCanvasElement === 'undefined') return false
  const proto = HTMLCanvasElement.prototype
  if (proto.__jsdosReadableGl) return true
  const orig = proto.getContext
  proto.__jsdosReadableGl = orig
  proto.getContext = function patchedGetContext(type, attrs) {
    if (/^(webgl|webgl2|experimental-webgl)$/.test(String(type))) {
      attrs = { preserveDrawingBuffer: true, ...(attrs || {}) }
    }
    return orig.call(this, type, attrs)
  }
  return true
}

function injectCss(href) {
  if (document.querySelector(`link[data-jsdos]`)) return
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = href
  l.dataset.jsdos = '1'
  document.head.appendChild(l)
}

/** Resolves to `window.Dos`. Safe to call from many components; loads once. */
export function loadJsDos() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.Dos) return Promise.resolve(window.Dos)
  if (cache.promise) return cache.promise

  const base = import.meta.env.BASE_URL || '/'
  injectCss(`${base}js-dos/js-dos.css`)

  // Patch BEFORE the emulator script runs, not merely before Dos() is called:
  // js-dos may capture its own addEventListener reference while its module body
  // executes, and a patch installed afterwards would never see the keyboard
  // handler being registered. (This is why keyboard input used to be a
  // user-gesture-only affair, and why an AI loop could never press a key.)
  forceReadableGl()
  installDosKeys()

  cache.promise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `${base}js-dos/js-dos.js`
    s.dataset.jsdos = '1'
    s.onload = () => {
      if (!window.Dos) {
        cache.promise = null
        reject(new Error(`js-dos loaded from ${s.src} but window.Dos is missing`))
        return
      }
      // Where the emulator wasm + libzip live. Without this js-dos 404s for the
      // wasm and the canvas never appears — the application/wasm header in
      // vercel.json is the other half of that requirement.
      if (window.emulators) window.emulators.pathPrefix = `${base}js-dos/emulators/`
      resolve(window.Dos)
    }
    s.onerror = () => {
      cache.promise = null
      reject(new Error(`failed to load js-dos from ${s.src}`))
    }
    document.head.appendChild(s)
  })
  return cache.promise
}

/**
 * Boot a .jsdos bundle into an element.
 *
 * @param {HTMLElement} el
 * @param {string} bundleUrl path relative to the base, e.g. games/kingsquest.jsdos
 * @param {{ onReady?: ()=>void, onError?: (e:Error)=>void, before?: ()=>void }} opts
 *        `before` runs immediately before Dos() — the one place a caller can
 *        patch the emulator's keyboard wiring, which must happen before boot
 *        (see utils/dosKeys).
 * @returns {{ stop: () => void }}
 */
export function mountDos(el, bundleUrl, { onReady, onError, before } = {}) {
  let dead = false
  let instance = null

  loadJsDos()
    .then((Dos) => {
      if (dead || !el.isConnected) return
      if (before) before()
      const base = import.meta.env.BASE_URL || '/'
      instance = Dos(el, {
        url: `${base}${bundleUrl}`,
        autoStart: true,
        theme: 'dark',
        imageRendering: 'pixelated',
        renderAspect: '4/3',
        noNetworking: true,
        noCloud: true,
        kiosk: true,
        onEvent: (event) => {
          if (event === 'ci-ready' && !dead && onReady) onReady()
        },
      })
    })
    .catch((e) => {
      console.error('[js-dos]', e)
      if (!dead && onError) onError(e)
    })

  return {
    stop() {
      dead = true
      if (instance) { try { instance.stop() } catch { /* already gone */ } }
      instance = null
    },
    get instance() { return instance },
  }
}
