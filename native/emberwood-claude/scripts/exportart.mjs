// Paints every Emberwood texture with the web game's own art.js (in system
// Chrome, via playwright-core) and writes them as PNGs into App/Art/. The art
// is drawn at runtime on the web; the app ships the same pixels. Rerun after
// any art.js change:  node scripts/exportart.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'App', 'Art')
const src = readFileSync(join(here, '../../../src/games/Emberwood/art.js'), 'utf8').replace(/^export /gm, '').replace(/^export \{[^}]*\}\s*$/gm, '')
if (/^\s*import /m.test(src)) throw new Error('art.js grew an import; inline it here')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
const tex = await page.evaluate((code) => {
    const T = new Function(code + '\nreturn makeTextures()')()
    const out = {}
    const walk = (o, p) => {
        if (o instanceof HTMLCanvasElement) { out[p] = { w: o.width, h: o.height, png: o.toDataURL('image/png') }; return }
        if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${p}_${i}`)); return }
        if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], p ? `${p}_${k}` : k)
    }
    walk(T, '')
    return out
}, src)
await browser.close()
// render.js's own canvases (npc_*, fx_*) come from scripts/webframes.mjs: keep them
const keep = {}
try {
    const old = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    for (const [k, v] of Object.entries(old)) if (/^(npc|fx)_/.test(k)) keep[k] = { v, png: readFileSync(join(out, `${k}.png`)) }
} catch {}
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const index = {}
for (const [k, { v, png }] of Object.entries(keep)) { writeFileSync(join(out, `${k}.png`), png); index[k] = v }
for (const [k, v] of Object.entries(tex)) {
    writeFileSync(join(out, `${k}.png`), Buffer.from(v.png.split(',')[1], 'base64'))
    index[k] = [v.w, v.h]
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 0) + '\n')
console.log(`exportart: ${Object.keys(tex).length} textures -> App/Art`)
