// RACCOON HEIST — "can a CAREFUL player ever be unseen here?" the timing audit.
//
//   node scripts/heisttiming.mjs            # all jobs
//   node scripts/heisttiming.mjs --job 3    # one job
//
// Why this exists: every automated clear so far ends `caught: 1-2`. The chase
// economy is deliberately lethal (walk 2.75 < guard chase 3.4 < dash 5.0 — that
// is documented and stays), so a CLEAN run has to come from never being seen:
// gaps in patrol timing that fit a crossing, and cover to spend the rest of the
// cycle in. You cannot tune gaps you cannot see, and you cannot see them in a
// screenshot. So this parks the real engine's raccoon (the REAL engine — Node
// runs `engine.update` headless since the world builder became importable),
// leaves it crouched on a cell for a full patrol cycle, and asks the only
// question that matters: **does the game's own suspicion rise?** No re-implemented
// sight model — heat rising means the game itself is looking at you.
//
// For every loot pile it reports:
//   hold  — longest continuous window the engine leaves you unseen at the pile
//   cross — can you take it and walk to the cart inside that window (path metres
//           / walk speed), and how much of the window the crossing eats
// A pile whose window cannot fit its crossing is a design bug: the player is not
// failing at stealth, the map is failing at offering stealth. That is what this
// file exists to make red (exit non-zero), and what the tuning PR has to fix.

import { LEVELS, CELL, at, T, pathBetween, worldOf } from '../src/games/RaccoonHeist/levels.js'
import { buildWorld } from '../src/games/RaccoonHeist/world.js'
import { createEngine } from '../src/games/RaccoonHeist/engine.js'
import * as THREE from 'three'

const JOB = process.argv.includes('--job') ? +process.argv[process.argv.indexOf('--job') + 1] - 1 : null
const CYCLE = 140        // seconds of patrol to observe (longest plausible cycle)
const WALK = 2.75        // raccoon walk speed, m/s — the careful-but-not-crawling gait
const MARGIN = 4         // a window must beat the crossing by this many seconds

// The headless canvas stub (same contract heistcheck's ART BUILD section uses:
// three only touches GL at render; the texture painters just write pixels).
globalThis.document = globalThis.document || {
    createElement: () => ({
        width: 0, height: 0, style: {},
        getContext: () => new Proxy({}, {
            get(t, k) {
                if (k in t) return t[k]
                if (k === 'createImageData' || k === 'getImageData') return (a, b, c, d) => {
                    const w = typeof a === 'number' ? a : b, h = typeof a === 'number' ? b : c
                    return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }
                }
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} })
                return () => {}
            },
            set(t, k, v) { t[k] = v; return true },
        }),
    }),
}

const LOOT = ['$', '%', '&', '*']
const marksOf = (lvl, ...chars) => lvl.marks.filter(m => chars.includes(m.ch))
let reds = 0

for (let li = 0; li < LEVELS.length; li++) {
    if (JOB !== null && JOB !== li) continue
    const lvl = LEVELS[li]
    const world = buildWorld(lvl)
    const eng = createEngine({ level: lvl, world, camera: new THREE.PerspectiveCamera(60, 1, .1, 100) })
    // THUNDER IS A CAMERA TRICK — and the audit must not be fooled by it. On the
    // manor the storm is on from frame one (`st.storm = 1`), `masked` opens with
    // each flash, and detection multiplies by `lightAt(...)` which bakes `flash`?
    // no — but `st.masked` kills NOISE only; sight keeps running. What DID zero
    // every window here was subtler: parked on a pile in the open with crouch
    // cover 0.55 x dark 0.5, suspicion crawls up, and the first driver's
    // "seen" detector (a heat rise) fires the moment a cone edges in. So the
    // audit measures BOTH gaits and judges the game by the careful one:
    //   walk-park  — upright, exposed: CONES ARE HERE, this is not stealth time
    //   crouch-park — the gait a clean run uses: this window must fit the crossing
    const cart = marksOf(lvl, 'S')[0]
    console.log(`\n\x1b[1mJOB ${li + 1} — ${lvl.name}\x1b[0m  (patrol cycle observed: ${CYCLE}s)`)

    for (const m of marksOf(lvl, ...LOOT)) {
        // --- walk the REAL route with the engine, and let the engine decide if it
        // sees us. A parked raccoon answers the wrong question: piles hide behind
        // walls their corridors never glance at, so "unseen window at the pile"
        // is green even on maps where every approach crosses a lit swept yard.
        // The question a careful player asks is: can I TRAVERSE, stopping at the
        // first hint of suspicion and only moving again when the cone has passed?
        // `c.det` is the engine's own accumulating suspicion — det >= 1 means the
        // game would have shouted. That is the line we do not cross.
        const routeOf = (from, to) => {
            const p = pathBetween(lvl, from, to, { walkBush: true })
            if (!p) return null
            return p.map(([x, y]) => worldOf(lvl, x, y))
        }
        const cross = (pts, crouch, label) => {
            eng.reset(); eng.start()
            const c = eng.activeCrew
            if (!pts) return { fail: `${label}: no route at all` }
            let at2 = 0, wait = 0, secs = 0
            const pos = (d) => {
                let acc = 0
                for (let i = 1; i < pts.length; i++) {
                    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
                    if (acc + seg >= d) { const k = (d - acc) / seg; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k] }
                    acc += seg
                }
                return pts[pts.length - 1]
            }
            const total = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0)
            for (let i = 0; i < 60 * 300; i++) {
                const det0 = c.det
                if (wait > 0) {
                    wait -= 1 / 60
                } else {
                    at2 += (crouch ? 1.35 : WALK) / 60
                }
                const [x, z] = pos(Math.min(at2, total))
                c.x = x; c.z = z; c.crouched = crouch
                eng.update(1 / 60, { mx: 0, my: 0, crouch, dash: false, lookX: 0, lookY: 0, actions: [], hold: false })
                secs++
                if (c.det >= 1) return { fail: `${label}: SPOTTED at (${x.toFixed(1)},${z.toFixed(1)}) t=${(secs / 60).toFixed(0)}s`, at: [x, z] }
                // suspicion rising: a careful player freezes; if standing still does not
                // cool within 25 s, this crossing cannot be made unseen from HERE.
                if (c.det > det0 + 0.001 && wait <= 0 && c.det > 0.4) { wait = 25; stuckAt = [x, z] }
                if (wait > 0 && c.det < 0.15) wait = 0
                if (at2 >= total) return { ok: secs / 60 }
            }
            return { fail: `${label}: never arrived (timeout)`, at: stuckAt }
        }
        let stuckAt = null
        const out = []
        const there = cross(routeOf([cart.x, cart.y], [m.x, m.y]), true, 'to pile')
        const back = there.ok ? cross(routeOf([m.x, m.y], [cart.x, cart.y]), true, 'loaded back') : there
        const bad = there.fail || back.fail
        const col = bad ? '\x1b[31m' : '\x1b[32m'
        const secs = (there.ok ? there.ok.toFixed(0) + 's' : '') + (back.ok ? '+' + back.ok.toFixed(0) + 's' : '')
        console.log(`  ${col}${m.ch} (${m.x},${m.y})\x1b[0m ${bad ? 'FAIL ' + (there.fail || back.fail) + (back.at || there.at ? ' at ' + (back.at || there.at).map(v => v.toFixed(1)) : '') : 'crossed unseen (' + secs + ')'}`)
        if (bad) reds++
    }
    eng.dispose?.()
}

console.log(reds
    ? `\n\x1b[31m${reds} loot position(s) cannot be robbed and escaped unseen — timing or cover bug\x1b[0m`
    : '\n\x1b[32mevery pile has an unseen window wide enough for its crossing\x1b[0m')
process.exit(reds ? 1 : 0)
