// RACCOON HEIST — the fast "does a job even EXIST" gate. Seconds, not minutes.
//
//   npm run heistsmoke           # all three jobs, headless, lite pipeline
//
// Why this exists: job 2 shipped in this repo *never once rendered* — an empty
// InstancedMesh batch threw inside the mount effect and the whole component died —
// and the merge gate stayed green, because `heistcheck` audits levels.js/stealth.js
// in Node and never touches the renderer, while the browser suites that would have
// screamed are the slow manual ones. A bug that deletes a job at mount must cost
// the CI one small, boring, seconds-long job to catch. That job is this file.
//
// Per job, five claims, all of them the kind a player makes in the first two
// seconds of booting a level:
//   1. the world MOUNTS (canvas + engine exist — a throw in the mount effect kills
//      these, which is exactly the job-2 failure);
//   2. the renderer drew something REAL: pixels are sampled off the canvas and
//      must be varied and lit (a black canvas = preserveDrawingBuffer regressed,
//      an empty scene = the geometry batches died quietly);
//   3. the scene graph is populated (meshes counted, not screenshot-guessed);
//   4. the cast is visible in the scene (the lesson from heistplay: the cast once
//      passed every numeric check while never being added to the scene graph);
//   5. the player can MOVE: one second of full stick at the spawn, and the actual
//      raccoon coordinates change by a human-visible distance.
//
// It deliberately does NOT route, stealth, or play. The full play-through is
// `heistwin`, which lives in the nightly (`.github/workflows/heist-nightly.yml`)
// and is frozen — this file is the gate because it can afford to run per PR.

import { opt, openGame, launch, requireDevServer, Report } from './lib/harness.mjs'

const URL0 = opt(process.argv, '--url', process.env.HEIST_URL || 'http://localhost:5173/retrogames/raccoon-heist?pad=1')
const LITE = process.env.HEIST_LITE ? process.env.HEIST_LITE !== '0' : !!process.env.CI
const VIEW = LITE ? { width: 480, height: 320 } : { width: 800, height: 520 }
const URL = URL0 + (LITE ? (URL0.includes('?') ? '&' : '?') + 'lite=1' : '')

await requireDevServer(URL)
const browser = await launch()
const r = new Report('heistsmoke')
const t0 = Date.now()

const page = await openGame(browser, { url: URL, hook: '__heistTest', viewport: VIEW })
const api = (fn, ...args) => page.evaluate(fn, ...args)
const sleep = (ms) => new Promise(res => setTimeout(res, ms))

for (const job of [0, 1, 2]) {
    const tag = `job ${job + 1}`
    try {
    await api((j) => window.__heistTest.job(j), job)
    await sleep(700) // mount + first frames; the lite pipeline boots fast
    await api(() => window.__heistTest.press())
    await sleep(500)

    // 1. mounted
    const mounted = await api(() => {
        const t = window.__heistTest
        return {
            canvas: !!document.querySelector('canvas'),
            engine: !!t.engine(),
            phase: t.engine()?.st?.phase ?? null,
        }
    })
    r.check(`${tag} mounts: canvas + engine, phase play`, mounted.canvas && mounted.engine && mounted.phase === 'play', JSON.stringify(mounted))
    if (!mounted.canvas || !mounted.engine) continue // nothing below can be true; the mount is the failure

    // 3. scene graph populated (cheap traverse, no allocation worth mentioning)
    const scene = await api(() => {
        let meshes = 0, tris = 0
        window.__heistTest.scene().traverse(o => {
            if (o.isMesh && o.visible) {
                meshes++
                tris += (o.geometry?.index?.count || o.geometry?.attributes?.position?.count || 0) / 3
            }
        })
        return { meshes, tris: Math.round(tris) }
    })
    r.check(`${tag} scene graph is a real world (${scene.meshes} meshes / ${scene.tris} tris)`, scene.meshes > 40 && scene.tris > 5000, JSON.stringify(scene))

    // 4. the cast is IN the scene graph — heistplay's own method, copied: the crew
    // once passed every numeric check while never being added to the scene, so
    // "engine.group has a parent" and "the raccoon is a visible mesh" are the claims.
    const cast = await api(() => {
        const t = window.__heistTest
        const eng = t.engine()
        let meshes = 0
        let inScene = false
        if (eng) {
            inScene = eng.group.parent != null
            eng.group.traverse(o => { if (o.isMesh) meshes++ })
        }
        const actor = eng ? eng.activeCrew.mesh : null
        const drawn = t.info ? t.info() : { calls: -1, tris: -1 }
        return { inScene, meshes, actor: !!actor && actor.visible && !!actor.parent, calls: drawn.calls, tris: drawn.tris }
    })
    r.check(`${tag} cast is mounted in the scene graph`, cast.inScene, 'engine.group has no parent')
    r.check(`${tag} the raccoon you control is a visible mesh`, cast.actor, 'activeCrew.mesh missing/invisible')
    r.check(`${tag} geometry is actually drawn (${cast.calls} calls / ${cast.tris} tris)`, cast.calls > 20 && cast.tris > 3000, JSON.stringify(cast))

    // 2. rendered, not composited-black: sample the canvas itself
    const px = await api(() => {
        const c = document.querySelector('canvas')
        const g = document.createElement('canvas')
        g.width = 64; g.height = 40
        const x = g.getContext('2d')
        x.drawImage(c, 0, 0, 64, 40)
        const d = x.getImageData(0, 0, 64, 40).data
        let lit = 0
        const seen = new Set()
        for (let i = 0; i < d.length; i += 4) {
            const l = d[i] + d[i + 1] + d[i + 2]
            if (l > 60) lit++
            seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4))
        }
        return { lit, kinds: seen.size, n: d.length / 4 }
    })
    r.check(`${tag} renders a real frame (${px.lit}/${px.n} lit px, ${px.kinds} colour buckets)`, px.lit > px.n * 0.08 && px.kinds > 6, JSON.stringify(px))

    // 5. the player can move: the stick is the only input; real coordinates must change
    const moved = await api(async () => {
        const t = window.__heistTest
        const a = t.engine().activeCrew
        const x0 = a.x, z0 = a.z
        t.stick(0, -1)
        await new Promise(res => setTimeout(res, 1000))
        t.stick(0, 0)
        return { d: Math.hypot(a.x - x0, a.z - z0) }
    })
    r.check(`${tag} player moves on stick input (walked ${moved.d.toFixed(2)} m in 1 s)`, moved.d > 0.8, JSON.stringify(moved))
    } catch (e) {
        // A throw during mount (the job-2 pattern: React tree dies, an evaluate
        // against it rejects) must read as a red job, not as a broken harness —
        // and it must not take the OTHER jobs' verdicts down with it.
        r.check(`${tag} mounts without crashing`, false, String(e.message || e).slice(0, 160))
        // the page may be poisoned by the failed module; reload to re-arm the hook
        try { await page.reload(); await page.waitForFunction(() => window.__heistTest, null, { timeout: 15000 }) } catch { /* next job reports its own death */ }
    }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`  ..  ${secs}s wall for ${r.rows.length} checks`)
r.exit(browser)
