// The web half of the render-parity gate (README: "Render parity").
// Serves the repo with Vite, opens system Chrome (headless, deviceScaleFactor 1,
// GPU WebGL2), and runs src/games/Emberwood/render.js itself on the scripted
// moments in parity/scenes.json, with Math.random pinned to 0.5:
//   createSim(11) → (act2 kit) → spawnRoom(room, at) → `steps` idle ticks →
//   createRenderer(canvas 960x576 css, dpr 1) → loadTex(makeTextures()) →
//   await attachShelf() → buildScreen → `syncs` × sync(sim, t) → setFocus(hero) → draw()
// and saves each canvas as parity/web/<name>.png. It also paints render.js's
// own canvases (the three npc liveries, the sword arc, the push-block) into
// App/Art so the app ships Chrome's pixels for those too.
//
//   node scripts/webframes.mjs            # from native/emberwood-claude
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const repo = resolve(pkg, '../..')
const spec = JSON.parse(readFileSync(join(pkg, 'parity/scenes.json'), 'utf8'))
const outDir = join(pkg, 'parity/web')
mkdirSync(outDir, { recursive: true })

const server = await createServer({ root: repo, configFile: join(repo, 'vite.config.js'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const port = server.httpServer.address().port
const base = `http://127.0.0.1:${port}/retrogames/`

// GPU-backed headless Chrome: the gate compares against what a real browser
// draws (ANGLE on Metal on a Mac), not SwiftShader.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const [W, H] = spec.size
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(base + 'favicon.svg').catch(() => {})
await page.goto(base)
await page.waitForTimeout(300)

const result = await page.evaluate(async ({ spec, W, H }) => {
    const B = '/retrogames/src/games/Emberwood/'
    const { createSim, spawnRoom, stepSim } = await import(B + 'sim.js')
    const { padToInput } = await import(B + 'input.js')
    const { makeTextures, up2 } = await import(B + 'art.js')
    const R = await import(B + 'render.js')
    const { SCREENS } = await import(B + 'world.js')
    Math.random = () => 0.5
    document.body.innerHTML = ''
    document.body.style.margin = '0'
    const gl = document.createElement('canvas').getContext('webgl2')
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
    const frames = {}
    for (const sc of spec.scenes) {
        const canvas = document.createElement('canvas')
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; canvas.style.display = 'block'
        document.body.innerHTML = ''
        document.body.appendChild(canvas)
        const sim = createSim(11)
        if (sc.act2) {
            sim.flags.emberTaken = true; sim.flags.doorsOpen['dr-heart'] = true
            sim.items.bow = true; sim.items.arrows = 10; sim.items.gale = true; sim.items.bombs = 4
        }
        spawnRoom(sim, sc.room, sc.at || undefined)
        const prev = {}
        for (let i = 0; i < sc.steps; i++) stepSim(sim, padToInput({}, prev))
        sim.fx = []
        const rend = R.createRenderer(canvas, { lite: false, width: 480, height: 288 })
        rend.resize()
        rend.loadTex(makeTextures())
        await rend.attachShelf()
        rend.buildScreen(sim.screen, sim.flags, sim.cut)
        for (let i = 0; i < spec.syncs; i++) rend.sync(sim, sc.t)
        rend.setFocus(sim.hero.x, sim.hero.y)
        rend.draw()
        const info = rend.renderInfo()
        frames[sc.name] = { png: canvas.toDataURL('image/png'), w: info.bufferW, h: info.bufferH, shelf: rend.foliage().shelfAttached, hero: [sim.hero.x, sim.hero.y] }
        rend.dispose()
    }
    // render.js's own canvases → App/Art (npc liveries, sword arc, push-block)
    const npcs = {}
    for (const id of ['keeper', 'colporter', 'elder']) {
        const n = Object.values(SCREENS).flatMap((s) => s.npcs || []).find((x) => x.id === id) || { id, kind: id === 'keeper' ? 'shop' : 'talk' }
        const c = R.paintNpc(n)
        npcs[id === 'keeper' ? 'npc_keeper' : id === 'colporter' ? 'npc_colporter' : 'npc_plain'] = { png: c.toDataURL('image/png'), w: c.width, h: c.height }
    }
    const arc = document.createElement('canvas'); arc.width = 32; arc.height = 32
    {   // render.js: the sword swipe crescent (keep in step with createRenderer)
        const g = arc.getContext('2d')
        g.clearRect(0, 0, 32, 32)
        g.lineCap = 'round'
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.12, Math.PI * 1.88); g.stroke()
        g.strokeStyle = 'rgba(255,244,210,1)'; g.lineWidth = 2
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.18, Math.PI * 1.82); g.stroke()
    }
    const blk = document.createElement('canvas'); blk.width = 14; blk.height = 14
    {   // render.js: the push-block face
        const g = blk.getContext('2d')
        g.fillStyle = '#6e6a7e'; g.fillRect(1, 1, 12, 12)
        g.fillStyle = '#84809a'; g.fillRect(2, 2, 10, 4)
        g.strokeStyle = '#3f3c4c'; g.strokeRect(1.5, 1.5, 11, 11)
    }
    const blk2 = up2(blk)
    return { gpu, frames, art: { ...npcs, fx_arc: { png: arc.toDataURL('image/png'), w: 32, h: 32 }, fx_block: { png: blk2.toDataURL('image/png'), w: blk2.width, h: blk2.height } } }
}, { spec, W, H })

await browser.close()
await server.close()
const png = (d) => Buffer.from(d.split(',')[1], 'base64')
for (const [name, f] of Object.entries(result.frames)) {
    writeFileSync(join(outDir, `${name}.png`), png(f.png))
    console.log(`web ${name} ${f.w}x${f.h} shelf=${f.shelf} hero=${f.hero.map((v) => v.toFixed(1)).join(',')}`)
}
const art = join(pkg, 'App/Art')
const index = JSON.parse(readFileSync(join(art, 'index.json'), 'utf8'))
for (const [k, d] of Object.entries(result.art)) { writeFileSync(join(art, `${k}.png`), png(d.png)); index[k] = [d.w, d.h] }
writeFileSync(join(art, 'index.json'), JSON.stringify(index, null, 0) + '\n')
writeFileSync(join(outDir, 'GPU.txt'), result.gpu + '\n')
console.log(`webframes: ${Object.keys(result.frames).length} frames (GPU: ${result.gpu}), ${Object.keys(result.art).length} render.js canvases -> App/Art`)
