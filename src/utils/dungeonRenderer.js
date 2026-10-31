/**
 * dungeonRenderer — loads the SHARED first-person dungeon renderer (#1129) on
 * demand, the same idiom as jsdos.js: a BASE_URL-assembled URL injected at
 * runtime, never a hard <script> tag in index.html (Vite would prepend the
 * base twice and the SPA fallback would answer HTML@200 — see AGENTS.md
 * › Gotchas › js-dos is injected).
 *
 * The renderer itself lives at `public/demos/dungeon.core.js` — ONE copy for
 * the DEEP GLASS demo and every game that walks a grid maze in first person
 * (TEN-DEEP #1127, The Bard's Tale #1128, the dungeons of BRITANNIA #1128).
 * It sets `globalThis.DungeonRenderer`; `create()` returns null when WebGL2
 * is missing, so callers keep their fallback painter. The canvas it is given
 * is created by this module with `preserveDrawingBuffer: true`, so harness
 * pixel readback works (the js-dos lesson).
 */

const cache = { promise: null }

export function loadDungeonRenderer() {
    if (globalThis.DungeonRenderer) return Promise.resolve(globalThis.DungeonRenderer)
    if (!cache.promise) {
        cache.promise = new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = `${import.meta.env.BASE_URL}demos/dungeon.core.js`
            s.onload = () => (globalThis.DungeonRenderer
                ? resolve(globalThis.DungeonRenderer)
                : reject(new Error('dungeon.core.js loaded without defining DungeonRenderer')))
            s.onerror = () => reject(new Error(`failed to fetch ${s.src}`))
            document.head.appendChild(s)
        }).catch((err) => {
            cache.promise = null
            console.warn(`[dungeonRenderer] ${err.message} — games keep their fallback painters`)
            return null
        })
    }
    return cache.promise
}
