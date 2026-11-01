// COMET DRIFT HD phone check (#987) — honest gaps #0, second half.
//
// The product default is WebGPU; phones have no `navigator.gpu` and land on
// three's AUTO fallback (WebGPURenderer.getFallback -> WebGLBackend) — the
// same node-backend state the self-heal was built for (#478 item 9), but
// reached UNPINNED, and nothing here exercised that route: `?gl=webgl2` swaps
// in the classic renderer, `?gl=webgl-node` pins forceWebGL deliberately.
// Three's WebGLBackend also ignores `preserveDrawingBuffer` (its
// contextAttributes omit the flag, three r180), so the phone canvas answers
// BLACK to out-of-frame drawImage — pixel truth on that path only exists
// INSIDE the rAF callback, which is what __cometHDTest.wantProbe/frameProbe
// sample. On a real WebGPU canvas even that is null by spec: there the proof
// is a computed compositor capture (stats + motion), not an eyeball.
//
//   npm run cometdrifthdphonecheck            # gates
//   npm run cometdrifthdphonecheck -- --mutate-classify  # the fallback gates MUST go red
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plant, pull } from './lib/mutateguard.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHARD = resolve(HERE, '../src/games/CometDriftHD/index.jsx')
const args = process.argv.slice(2)

const { launch, requireDevServer, Report } = await import('./lib/harness.mjs')
const BASE = process.env.HD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/comet-drift-hd`
requireDevServer(BASE)

const R = new Report('cometdrifthdphonecheck')

// classification mutant: pretend every backend is the real WebGPU one — the
// fallback must then lose its honest naming and its refuge arming (the
// webglcontextlost listener keys off backendName), so the phone gates below
// MUST report FAILs under this run.
const CLS = "backendName = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2'"
const CLSMUT = "backendName = 'webgpu' /* classifymut */"
let classifymut = false
if (args.includes('--mutate-classify')) {
    const src = readFileSync(SHARD, 'utf8')
    if (!src.includes(CLS)) { console.error('MUTATE_CLASSIFY: classification line not found — probing stale code.'); process.exit(2) }
    plant(SHARD, src.replace(CLS, CLSMUT))
    classifymut = true
    console.log('  ..    mutated: backend always claims webgpu — the fallback gates MUST report FAILs')
    process.on('exit', () => {
        if (classifymut) {
            pull(SHARD)
            console.log('  ..    classification mutation restored')
        }
    })
}

// simulateDeviceLoss asks for this console error; it is a provoked device loss,
// not a page fault — the refuge catching it is a later gate, not a failure.
const EXPECTED_NOISE = /Device Lost|context lost|loseContext/i

async function grabShot(page) {
    const cdp = await page.context().newCDPSession(page)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await cdp.detach().catch(() => {})
    return data
}

// decode compositor PNGs inside a throwaway page (a compositor capture always
// decodes to 2D, unlike the live WebGPU canvas)
async function pngStats(browser, ...b64s) {
    const p = await browser.newPage()
    await p.goto('about:blank')
    const out = await p.evaluate(async (urls) => {
        const imgs = []
        for (const u of urls) {
            const img = new Image()
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u })
            imgs.push(img)
        }
        return imgs.map((img) => {
            const c = document.createElement('canvas')
            c.width = img.width; c.height = img.height
            const x = c.getContext('2d')
            x.drawImage(img, 0, 0)
            const d = x.getImageData(0, 0, c.width, c.height).data
            let min = 255, max = 0, sum = 0, n = 0
            const uniq = new Set()
            const luma = []
            for (let i = 0; i < d.length; i += 16) {
                const l = (d[i] + d[i + 1] + d[i + 2]) / 3
                if (l < min) min = l
                if (l > max) max = l
                sum += l; n++
                uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
                luma.push(l)
            }
            return { w: c.width, h: c.height, min, max, avg: sum / n, uniq: uniq.size, luma }
        })
    }, b64s.map((b) => 'data:image/png;base64,' + b))
    await p.close()
    return out
}

const browser = await launch()

// ---- 1. the phone: no navigator.gpu, pinned NOTHING, touch-only ----------
console.log('phone auto-fallback (390x844, no navigator.gpu, unpinned):')
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NOISE.test(m.text())) pageErrors.push(m.text()) })
    // kill WebGPU BEFORE any page script runs — the device never advertises it
    await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { get: undefined, configurable: true }) })
    await page.goto(BASE + '?lite=1', { waitUntil: 'load' })
    await page.waitForFunction(() => window.__cometHDTest && window.__cometHDTest.ready(), null, { timeout: 25000 })
    const gp = await page.evaluate(() => window.__cometHDTest.gpuProbe())
    R.check('the emulated phone never advertised WebGPU (hadGpu false)', gp.hadGpu === false)
    R.check('the AUTO fallback engages unpinned (three getFallback -> webgl2 node backend)', gp.backend === 'webgl2', gp.backend)
    R.check('the fallback stashes its live GL context (heartbeat is not blind)', gp.nodeGL === true)
    R.check('the webglcontextlost refuge is armed on the auto-fallback path', gp.lostArmed === true)
    const t0 = await page.evaluate(() => window.__cometHDTest.screen())
    await page.touchscreen.tap(97, 640)
    await page.waitForFunction(() => window.__cometHDTest.screen() !== 'attract', null, { timeout: 4000 }).catch(() => {})
    const t1 = await page.evaluate(() => window.__cometHDTest.screen())
    R.check('a single tap on the pad area starts the race', t0 === 'attract' && t1 !== 'attract', `${t0} -> ${t1}`)
    const pad = await page.evaluate(() => !!document.querySelector('[data-vc]'))
    R.check('the touch pad mounts once the race begins', pad)
    // in-frame pixel truth on the fallback canvas (out-of-frame readback is
    // BLACK there by three's own context attributes — gate that too)
    const black = await page.evaluate(() => {
        const src = document.querySelector('canvas[data-hdgl]') || document.querySelector('canvas')
        const cv = document.createElement('canvas'); cv.width = 120; cv.height = 260
        const x = cv.getContext('2d'); x.drawImage(src, 0, 0, 120, 260)
        const d = x.getImageData(0, 0, 120, 260).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
        return s
    })
    R.check('the fallback canvas answers BLACK out-of-frame (why the probe must be in-frame)', black === 0, `sum ${black}`)
    await page.evaluate(() => window.__cometHDTest.wantProbe(true))
    await page.waitForFunction(() => window.__cometHDTest.frameProbe() && window.__cometHDTest.frameProbe().readable, null, { timeout: 6000 }).catch(() => {})
    const fp = await page.evaluate(() => window.__cometHDTest.frameProbe())
    R.check('the in-frame probe reads the fallback canvas (same rAF, real pixels)', !!fp && fp.readable === true)
    R.check('the phone fallback draws a real dusk world, not black/flat',
        !!fp && fp.readable && fp.max - fp.min > 40 && fp.uniq >= 8 && fp.avg > 3,
        fp && fp.readable ? `luma ${fp.min.toFixed(0)}..${fp.max.toFixed(0)}, avg ${fp.avg.toFixed(1)}, ${fp.uniq} colors` : 'probe gave nothing readable')
    // drive the race through the contract (holds the loop; renderer keeps painting)
    const st0 = await page.evaluate(() => { window.__game.reset(7); return window.__game.state() })
    await page.evaluate(() => window.__game.step({ up: true }, 240))
    const st1 = await page.evaluate(() => { window.__game.release(); return window.__game.state() })
    R.check('the race advances on the fallback (contract-driven throttle pulls v up)', st1.tick > st0.tick + 200 && st1.v > 0.5, `tick +${st1.tick - st0.tick}, v ${st1.v}`)
    const gp2 = await page.evaluate(() => window.__cometHDTest.gpuProbe())
    R.check('nothing spuriously self-heals while the phone GPU is healthy', gp2.backend === 'webgl2', gp2.backend)
    // the state phones actually fear: GPU dies mid-race. The armed refuge must
    // catch it on the AUTO path (no ?gl=webgl-node pin) and rebuild the world.
    const sim = await page.evaluate(() => window.__cometHDTest.simulateDeviceLoss())
    R.check('WEBGL_lose_context fires on the auto-fallback canvas', sim === true)
    await page.waitForFunction(() => window.__cometHDTest.backend() === 'webgl2-legacy', null, { timeout: 15000 }).catch(() => {})
    R.check('mid-race device loss self-heals to the legacy refuge on the AUTO path (no reload)', (await page.evaluate(() => window.__cometHDTest.backend())) === 'webgl2-legacy')
    await page.waitForFunction(() => { const p = window.__cometHDTest.frameProbe(); return p && p.backend === 'webgl2-legacy' }, null, { timeout: 6000 }).catch(() => {})
    const fp2 = await page.evaluate(() => window.__cometHDTest.frameProbe())
    R.check('the refuge paints a real world again after the heal', !!fp2 && fp2.readable && fp2.max - fp2.min > 40,
        fp2 && fp2.readable ? `luma ${fp2.min.toFixed(0)}..${fp2.max.toFixed(0)}, avg ${fp2.avg.toFixed(1)}` : 'no readable probe after heal')
    R.check('zero unexpected page errors on the phone auto-fallback', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
    await page.close()
} catch (e) {
    R.check('phone auto-fallback page completed', false, e.message)
}

// ---- 2. real WebGPU here: computed compositor proof, not an eyeball ------
console.log('WebGPU compositor proof (default boot):')
try {
    const page2 = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
    await page2.goto(BASE + '?lite=1', { waitUntil: 'load' })
    await page2.waitForFunction(() => window.__cometHDTest && window.__cometHDTest.ready(), null, { timeout: 25000 })
    const b2 = await page2.evaluate(() => window.__cometHDTest.backend())
    if (b2 !== 'webgpu') {
        R.skip('the box runs the fallback by default — compositor gates only fire where WebGPU is real', `backend ${b2}`)
    } else {
        const black = await page2.evaluate(() => {
            const src = document.querySelector('canvas')
            const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90
            const x = cv.getContext('2d'); x.drawImage(src, 0, 0, 160, 90)
            const d = x.getImageData(0, 0, 160, 90).data
            let s = 0
            for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
            return s
        })
        R.check('the WebGPU canvas answers BLACK to 2D readback (the gap this check exists for)', black === 0, `sum ${black}`)
        const sA = await grabShot(page2)
        await new Promise((r) => setTimeout(r, 500))
        const sB = await grabShot(page2)
        const [A, B] = await pngStats(browser, sA, sB)
        R.check('the compositor proves the WebGPU frame is a real dusk world by the numbers',
            A.max - A.min > 60 && A.uniq >= 12 && A.avg > 4, `luma ${A.min}..${A.max}, avg ${A.avg.toFixed(1)}, ${A.uniq} colors`)
        let dsum = 0
        const n = Math.min(A.luma.length, B.luma.length)
        for (let i = 0; i < n; i++) dsum += Math.abs(A.luma[i] - B.luma[i])
        const davg = dsum / n
        R.check('the WebGPU frame moves between captures (live render, not a stuck black texture)', davg > 0.4, `mean |Δ| ${davg.toFixed(2)}`)
    }
    await page2.close()
} catch (e) {
    R.check('WebGPU compositor page completed', false, e.message)
}

if (classifymut) {
    await browser.close()
    console.log(`mutant run: ${R.failed} fallback gate(s) went red — ${R.failed > 0 ? 'as demanded' : 'WRONG: the mutant survived'}`)
    process.exit(R.failed > 0 ? 0 : 1)
}

R.exit(browser)
