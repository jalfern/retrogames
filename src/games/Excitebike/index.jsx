// EXCITEBIKE — the arcade shell. Everything drawn at runtime from the pure
// sim in ./sim.js and the course data in ./levels.js: the terrain is the SAME
// heightmap the Node harness audits (pixel x maps to world px through a fixed
// camera), the bikes are rotated by the sim's pitch, and the attract demo is
// the autopilot's OWN proven run replayed tick for tick through the real
// step() — the same witness scripts/excitecheck.mjs grades. The transform
// `screenY = (H-46) - (worldHeight-40)*0.95` is the one scripts/exciteplay.mjs
// samples to prove the drawn bike sits where the physics says it is.
//
// The look chases the NES cartridge: blue sky, green parallax hills, ochre
// dirt, a right-hand gauge pod with a speedometer NEEDLE and an engine HEAT
// bar, and the 1-2-3-GO light tree at the gate.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, makeGame, step, stateHash, CFG } from './sim.js'
import { track, groundY, LAP, MUD, WATER, BOOST } from './levels.js'
import { plan, decide } from './planner.js'
import { PRESS, MESSAGES } from './attract.js'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'

const SIM_MS = 1000 / 60
const g2s = (h) => (H - 46) - (h - 40) * 0.95
const PAL = {
    sky: '#5c94fc', hillFar: '#00a800', hillNear: '#1d7a2a',
    dirt: '#d07c30', dirt2: '#b5651d', edge: '#f0d080',
    mud: '#6b3f10', water: '#2050d0', waterHi: '#60a0ff',
    boost: '#ffe23f', gate: '#e40000',
}
const RIDE = {
    you: { body: '#e40000', trim: '#f8f8f8', hel: '#f8f8f8' },
    rivals: [
        { body: '#101010', trim: '#e40000', hel: '#f0d000' },
        { body: '#202020', trim: '#f0d000', hel: '#ff8800' },
        { body: '#303040', trim: '#00b0d0', hel: '#f8f8f8' },
        { body: '#402020', trim: '#c060c0', hel: '#a0e0ff' },
        { body: '#103010', trim: '#80e000', hel: '#f0f0a0' },
    ],
}

let proven = null
const provenRun = () => { if (!proven) proven = plan({ track: 0 }); return proven }

const ExcitebikeGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [gear, setGear] = useState('high')
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const gearRef = useRef('high')
    const overAtRef = useRef(0)
    const [watching, setWatching] = useState(false) // #1637 WATCH: excitecheck's rollout planner rides the gate
    const watchingRef = useRef(false)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('excitebike.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.bikeStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0, { gear: gearRef.current })
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, demoReady = false, toast = 0, toastMsg = '', shake = 0
        let noteAt = 0, heatBeep = 0
        const lastContact = []
        const keys = { g: false, b: false, j: false }
        let bikeMem = { pump: 0 } // #1637 decide()'s per-seat memory (pump taps)
        const parts = []
        const say = (m) => { toastMsg = m; toast = 90 }
        // #2387 juice layer — pops/flashes/scars are pinned to WORLD x so the
        // camera carries them with the dirt (a popup that slides past its own
        // overtake is paint lying about physics). Zero sim state touched.
        const pops = []     // { text, wx, y0, t, col } floating score/rank pops
        const flashes = []  // { wx, y, t } expanding white ring
        const scars = []    // { wx, name, t, fade } wreck dirt mound + skid mark
        const leans = {}    // rival name -> ticks of lean/tilt after a bump
        const leanYou = { t: 0 } // player lean after a jolt
        const wasAir = {}   // rival name -> air edge detector for landing dust
        let humAt = 0, preTell = false
        const pop = (text, wx, y, col) => pops.push({ text, wx, y0: y, t: 0, col })
        const camNow = () => Math.max(0, gs.x - 84)
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = 0.6 + (i % 3) * 0.7
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, t: 0, col })
            }
        }

        const handleEvents = (evts, scrX) => {
            for (const e of evts) {
                if (e.type === 'go') audioController.playSweep(440, 880, 0.2, 'square', 0.08)
                else if (e.type === 'air') { say('BIG AIR +' + e.pts); audioController.playTone(660, 0.08, 'square', 0.05) }
                else if (e.type === 'boost') { say('BOOST!'); audioController.playSweep(300, 1200, 0.4, 'sawtooth', 0.09); burst(scrX, g2s(gs.alt) - 6, 8, PAL.boost) }
                else if (e.type === 'overheat') { say('OVERHEAT!'); audioController.playTone(180, 0.25, 'sawtooth', 0.08) }
                else if (e.type === 'cooled') { say('ENGINE COOLED'); audioController.playTone(520, 0.1, 'triangle', 0.05) }
                else if (e.type === 'stall') { say('STALLED — PUMP!'); audioController.playNoise(0.2, 0.07) }
                else if (e.type === 'unstall') { say('BACK ON!'); audioController.playSweep(240, 620, 0.2, 'square', 0.06) }
                else if (e.type === 'crash') {
                    say(e.why === 'wreck' ? 'WRECK!' : e.why === 'contact' ? 'BIKE VS BIKE!' : 'CRASH!')
                    audioController.playNoise(0.3, 0.09); burst(scrX, g2s(gs.alt) - 6, 16, '#d07c30'); shake = 9
                    if (e.why === 'wreck' || e.why === 'contact') { if (scars.length > 8) scars.shift(); scars.push({ wx: gs.x % LAP, name: 'you', t: 0, fade: 0 }) }
                }
                else if (e.type === 'flyby') {
                    say('FLYBY +' + e.pts)
                    audioController.playSweep(520, 980, 0.22, 'square', 0.06)
                    burst(scrX, g2s(gs.alt) - 14, 6, '#f8f8f8')
                    // #2387: the original sells the overtake AT the rival — a
                    // gold popup and a white ring flash on their position, not
                    // just a sparkle on your own nose.
                    const q = gs.rivals.find((x) => x.name === e.name)
                    const rx = (q ? q.d % LAP : gs.x) + 0
                    pop('+' + e.pts, rx, g2s(q ? q.alt : gs.alt) - 26, '#ffe23f')
                    flashes.push({ wx: rx, y: g2s(q ? q.alt : gs.alt) - 12, t: 0 })
                    if (q) burst(rx - camNow(), g2s(q.alt) - 12, 8, '#ffe23f')
                }
                else if (e.type === 'bump') {
                    say('BUMP!')
                    audioController.playNoise(0.18, 0.08); audioController.playTone(140, 0.12, 'sawtooth', 0.06)
                    burst(scrX + 12, g2s(gs.alt) - 8, 10, '#c98a3a'); shake = 6
                    if (e.name) leans[e.name] = 12 // the pushed rider visibly tips
                }
                else if (e.type === 'jolt') {
                    say('JOLT!')
                    audioController.playTone(110, 0.14, 'sawtooth', 0.06)
                    burst(scrX - 12, g2s(gs.alt) - 8, 8, '#c98a3a'); shake = 5
                    leanYou.t = 12 // your own bike snaps a wheel when shoved
                }
                else if (e.type === 'rcrash') {
                    // a rival wiped out (#2384): dd is the lap-aware gap from
                    // the player; on screen the rival sits at 84+dd (the draw
                    // window is (-20, W+20), i.e. dd in (-104, W-64+20)).
                    const dd = ((e.x - gs.x + LAP * 1.5) % LAP) - LAP / 2
                    if (dd > -104 && dd < W - 64) {
                        say(e.why === 'wreck' ? e.name + ' PILES IN!' : e.name + ' DOWN!')
                        audioController.playNoise(0.22, 0.07); audioController.playTone(130, 0.18, 'sawtooth', 0.05)
                        burst(scrX + dd, g2s(groundY(track(gs.track).ground, e.x)) - 6, e.why === 'wreck' ? 18 : 12, '#8a5a1a')
                        if (Math.abs(dd) < 90) shake = 5
                    }
                    // #2387: the crash site TEACHES — a dirt mound and an oiled
                    // skid mark stay on the terrain while the rider walks back.
                    if (scars.length > 8) scars.shift()
                    scars.push({ wx: ((e.x % LAP) + LAP) % LAP, name: e.name, t: 0, fade: 0 })
                }
                else if (e.type === 'rup') {
                    const dd = ((e.x - gs.x + LAP * 1.5) % LAP) - LAP / 2
                    if (dd > -104 && dd < W - 64) audioController.playTone(240, 0.08, 'square', 0.04)
                    const si = scars.findIndex((s) => s.name === e.name)
                    if (si >= 0) scars[si].fade = 1 // remounted — the mark starts to dry
                }
                else if (e.type === 'rbump') {
                    // #2420: wheel-to-wheel between RIVALS. Sparks at the
                    // contact point, the pushed rider tips, a softer thud than
                    // your own bump (it is not your bike), a toast naming the
                    // fight — all only while the pair is actually on screen.
                    const dd = ((e.x - gs.x + LAP * 1.5) % LAP) - LAP / 2
                    if (dd > -104 && dd < W - 64) {
                        say(e.a + ' bumps ' + e.b)
                        audioController.playNoise(0.12, 0.05); audioController.playTone(160, 0.09, 'square', 0.04)
                        burst(scrX + dd - 6, g2s(groundY(track(gs.track).ground, e.x)) - 8, 7, '#c98a3a')
                        if (leans[e.a] == null) leans[e.a] = 8
                        if (leans[e.b] == null) leans[e.b] = 12
                        if (Math.abs(dd) < 60) shake = 3
                    }
                }
                else if (e.type === 'rhop') {
                    // the pack choosing a line: a rival commits the hop over a
                    // body — a puff off the deck and a faint tick, that's all;
                    // the arc itself sells it.
                    const dd = ((e.x - gs.x + LAP * 1.5) % LAP) - LAP / 2
                    if (dd > -104 && dd < W - 64) {
                        audioController.playTone(300, 0.05, 'square', 0.03)
                        burst(scrX + dd, g2s(groundY(track(gs.track).ground, e.x)) - 4, 4, '#b8a06a')
                    }
                }
                else if (e.type === 'slam') { say('SLAM!'); audioController.playNoise(0.14, 0.06); shake = 5 }
                else if (e.type === 'lap') { say('LAP ' + e.lap + '  +' + e.bonus + 's'); audioController.playSweep(392, 784, 0.3, 'square', 0.07) }
                else if (e.type === 'recover') {
                    audioController.playTone(300, 0.06, 'square', 0.04)
                    const yi = scars.findIndex((s) => s.name === 'you' && !s.fade)
                    if (yi >= 0) scars[yi].fade = 1 // you walked it back — the mark dries
                }
            }
        }

        const finish = (win) => {
            watchingRef.current = false; setWatching(false) // #1637 the run ends in your hands
            const sc = gs.score
            setEnd({ win, score: sc, rank: gs.rank })
            if (win) localStorage.setItem('excitebike.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }
        const doSim = (inp) => {
            const preAir = gs.air, preVy = gs.vy
            const preRival = gs.rivals.map((r) => ({ air: r.air, vy: r.vy }))
            const prev = gs.rank
            step(gs, inp)
            const scrX = 84
            const evts = gs.events.splice(0)
            for (const e of evts) {
                if (['flyby', 'bump', 'jolt'].includes(e.type) || (e.type === 'crash' && (e.why === 'wreck' || e.why === 'contact'))) {
                    lastContact.push({ t: gs.tick, type: e.type, name: e.name || '', why: e.why || '' })
                }
            }
            handleEvents(evts, scrX)
            // #2387 rank churn lands: the NES flashes the position — every
            // pass gained or lost gets a pop and a distinct tone. Guarded
            // past the gate so the 6th-slot initial rank never fires one.
            if (gs.rank !== prev && gs.tick > 60 && !gs.end && gs.count <= 0) {
                const d = prev - gs.rank
                if (d > 0) { pop('+' + d + ' POS', gs.x, g2s(gs.alt) - 34, '#80e000'); audioController.playSweep(520, 820, 0.12, 'square', 0.05) }
                else if (d > -4) { pop(d + ' POS', gs.x, g2s(gs.alt) - 34, '#ffe23f'); audioController.playTone(220, 0.12, 'square', 0.05) }
            }
            // #2387 landing dust for everyone: a firm touchdown (dropping
            // faster than a scrub) sprays the dirt — the player AND rivals.
            const trk = track(gs.track).ground
            if (preAir && !gs.air && !gs.crash && preVy < -1.4) burst(scrX, g2s(gs.alt) - 2, 5, '#b5905a')
            for (const r of gs.rivals) {
                const p0 = wasAir[r.name]
                wasAir[r.name] = r.air
                if (p0 && !r.air && r.down === 0 && (preRival[gs.rivals.indexOf(r)].vy < -1.4 || Math.abs(r.pitch) > 0.2)) {
                    const ddx = r.d % LAP - camNow()
                    if (ddx > -20 && ddx < 256 + 20) burst(ddx, g2s(groundY(trk, r.d % LAP)) - 2, 4, '#b5905a')
                }
            }
            // decay the juice timers (lean, pops, flashes, scars)
            if (leanYou.t > 0) leanYou.t--
            for (const k of Object.keys(leans)) { if (--leans[k] <= 0) delete leans[k] }
            for (let i = pops.length - 1; i >= 0; i--) if (++pops[i].t > 52) pops.splice(i, 1)
            for (let i = flashes.length - 1; i >= 0; i--) if (++flashes[i].t > 12) flashes.splice(i, 1)
            for (let i = scars.length - 1; i >= 0; i--) { scars[i].t++; if (scars[i].fade > 0 && ++scars[i].fade > 40) scars.splice(i, 1) }
            if (gs.end) finish(gs.end === 'win')
        }
        const tickDemo = () => {
            if (!demoReady) return
            const run = provenRun()
            if (gs.end || demoAt >= run.script.length) { gs = makeGame(0, { gear: 'high' }); demoAt = 0; clearJuice() }
            doSim(run.script[demoAt++])
        }
        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            // One arrow, two truths: on the ground Up is the GAS and Down the
            // BRAKE; airborne the SAME arrows are the rider's weight — the sim
            // only reads u/d when g.air, so sending both is how the bike leans
            // without needing a second set of keys.
            // #1637 WATCH: the seat is decide() — the same rollout planner the
            // attract demo's script came from and excitecheck grades; it
            // re-decides from the live bike every tick.
            if (watchingRef.current) { doSim(decide(gs, bikeMem)); return }
            doSim({ g: keys.g, b: keys.b, j: keys.j, u: keys.g, d: keys.b })
        }

        const music = () => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end || gs.count > 0 || gs.crash > 0) return
            if (gs.tick - noteAt < 3) return
            noteAt = gs.tick
            const f = 55 + gs.v * 26 + (gs.hot ? -14 : 0)
            audioController.playTone(f, 0.03, gs.hot ? 'sawtooth' : 'square', 0.018)
            if (gs.hot && gs.tick - heatBeep > 40) { heatBeep = gs.tick; audioController.playTone(220, 0.05, 'square', 0.04) }
        }

        // #2387 rivals are no longer silent. Every rival in earshot gets its
        // own engine note — volume from the probe gap, pitch from ITS speed —
        // and a rival closing on your back from behind winds the pitch up
        // before the shove lands. That rise is the jolt pre-tell; the same
        // sense flips `preTell` so the canvas can draw the chevron warning.
        const sense = () => {
            preTell = false
            if (screenRef.current !== 'play' || pausedRef.current || gs.end || gs.count > 0) return
            for (const r of gs.rivals) {
                if (r.down > 0) continue
                const gap = r.d - gs.total
                if (gap < 0 && gap > -150 && r.v - gs.v > 0.4 && gs.v > 1.0) { preTell = true; break }
            }
        }
        const rivalHum = () => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end || gs.count > 0) return
            if (gs.tick - humAt < 6) return
            humAt = gs.tick
            for (const r of gs.rivals) {
                if (r.down > 0) continue
                const gap = r.d - gs.total
                if (gap < -170 || gap > 260) continue
                const dist = Math.abs(gap)
                let vol = Math.max(0.004, 0.024 * (1 - dist / 260))
                let f = 42 + r.v * 20
                if (gap < 0 && gap > -150 && r.v - gs.v > 0.4) { f += (150 + gap) * 0.5; vol = Math.min(0.032, vol + 0.01) }
                audioController.playTone(f, 0.045, 'triangle', vol)
            }
        }

        // ---- paint --------------------------------------------------------------
        const drawTerrain = (tr, camX) => {
            // sky
            ctx.fillStyle = PAL.sky; ctx.fillRect(0, 0, W, H)
            // parallax hills (two layers, slower than the ground)
            for (const [par, col, amp, base] of [[0.3, PAL.hillFar, 26, H - 70], [0.55, PAL.hillNear, 18, H - 50]]) {
                ctx.fillStyle = col
                for (let sx = 0; sx < W; sx += 2) {
                    const wx = camX * par + sx
                    const hy = base - (Math.sin(wx * 0.02) * amp + Math.sin(wx * 0.005 + 2) * amp * 0.6)
                    ctx.fillRect(sx, hy, 2, H - hy)
                }
            }
            // ground: fill from the sampled surface to the bottom, per 2px column
            for (let sx = 0; sx < W; sx += 2) {
                const wx = ((camX + sx) % LAP + LAP) % LAP
                const gy = g2s(groundY(tr.ground, wx))
                ctx.fillStyle = PAL.dirt
                ctx.fillRect(sx, gy, 2, H - gy)
                ctx.fillStyle = PAL.edge
                ctx.fillRect(sx, gy, 2, 3)
                // surface dashes roll with the ground for a sense of speed
                if ((Math.floor(wx / 14) % 2) === 0) { ctx.fillStyle = PAL.dirt2; ctx.fillRect(sx, gy + 5, 2, 3) }
            }
            // feature bands over the ground
            for (const band of tr.bands) {
                if (band.whoops) { drawWhoops(tr, camX, band.whoops); continue }
                const [kind, x0, x1] = band
                const sx0 = x0 - camX, sx1 = x1 - camX
                if (sx1 < 0 || sx0 > W) continue
                for (let sx = Math.max(0, sx0); sx < Math.min(W, sx1); sx += 2) {
                    const wx = camX + sx
                    const gy = g2s(groundY(tr.ground, wx))
                    if (kind === MUD) {
                        ctx.fillStyle = PAL.mud; ctx.fillRect(sx, gy, 2, 7)
                        ctx.fillStyle = 'rgba(0,0,0,0.25)'; if ((sx + Math.floor(gs.x)) % 8 < 2) ctx.fillRect(sx, gy + 2, 1, 2)
                    } else if (kind === WATER) {
                        ctx.fillStyle = PAL.water; ctx.fillRect(sx, gy, 2, 10)
                        ctx.fillStyle = PAL.waterHi
                        const wy = gy + 3 + Math.sin((sx + gs.tick * 2) * 0.4) * 1.5
                        ctx.fillRect(sx, wy, 1, 1)
                    } else if (kind === BOOST) {
                        ctx.fillStyle = PAL.boost
                        const a = Math.floor((wx + gs.tick * 3) / 16) % 2
                        for (let k = 0; k < 3; k++) {
                            const ax = sx - a * 8 + k * 10
                            if (ax >= 0 && ax < W) { ctx.fillRect(ax, gy + 2, 4, 2); ctx.fillRect(ax + 2, gy + 4, 3, 2); ctx.fillRect(ax - 2, gy + 4, 3, 2) }
                        }
                    }
                }
            }
        }
        const drawWhoops = (tr, camX, [a, z, amp]) => {
            for (let sx = Math.max(0, a - camX); sx < Math.min(W, z - camX); sx += 2) {
                const wx = camX + sx
                const gy = g2s(groundY(tr.ground, wx))
                ctx.fillStyle = '#8a5a1a'; ctx.fillRect(sx, gy, 2, 4)
            }
            void amp
        }
        const drawStart = (camX) => {
            const sx = -camX
            if (sx < -40 || sx > W + 40) return
            // checkered start/finish banner
            for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
                ctx.fillStyle = (i + j) % 2 ? '#f8f8f8' : '#101010'
                ctx.fillRect(sx - 12 + i * 3, g2s(groundY(track(0).ground, 0)) - 46 + j * 5, 3, 5)
            }
            ctx.fillStyle = PAL.gate; ctx.fillRect(sx - 13, g2s(96) - 48, 3, 48); ctx.fillRect(sx + 12, g2s(96) - 48, 3, 48)
        }
        const drawBike = (cx, cy, pitch, p, riderName) => {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(-pitch)
            // wheels
            ctx.fillStyle = '#181818'
            ctx.fillRect(-9, -3, 6, 6); ctx.fillRect(3, -3, 6, 6)
            ctx.fillStyle = '#585858'; ctx.fillRect(-8, -2, 4, 4); ctx.fillRect(4, -2, 4, 4)
            // frame + body
            ctx.fillStyle = p.body
            ctx.fillRect(-8, -9, 16, 5)
            ctx.fillStyle = p.trim; ctx.fillRect(-6, -12, 9, 3)         // tank/fairing
            // rider
            ctx.fillStyle = p.body; ctx.fillRect(-3, -18, 5, 8)         // torso
            ctx.fillStyle = p.hel; ctx.fillRect(-1, -21, 5, 4)          // helmet
            ctx.fillStyle = '#e8c090'; ctx.fillRect(3, -14, 3, 2)       // arm to bars
            ctx.fillRect(5, -13, 2, 5)
            ctx.restore()
            if (riderName) { ctx.fillStyle = '#f8f8f8'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText(riderName, cx, cy - 26); ctx.textAlign = 'left' }
        }
        const drawRider = (cx, cy, rot, p) => {
            // a rider separated from the bike (#2387 tumble/remount theatre)
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot)
            ctx.fillStyle = p.body; ctx.fillRect(-2, -7, 5, 8)
            ctx.fillStyle = p.hel; ctx.fillRect(-1, -11, 5, 4)
            ctx.fillStyle = '#e8c090'; ctx.fillRect(2, -4, 3, 2)
            ctx.fillStyle = '#181818'; ctx.fillRect(-2, 1, 2, 5); ctx.fillRect(1, 1, 2, 5)
            ctx.restore()
        }
        const drawScars = (tr, camX) => {
            // #2387 crash sites stay on the terrain: an oiled skid mark riding
            // the surface plus a dirt mound — the hazard teaches without UI.
            for (const s of scars) {
                let fx = ((s.wx - camX) % LAP + LAP) % LAP
                if (fx > LAP / 2) fx -= LAP
                if (fx < -34 || fx > W + 10) continue
                ctx.globalAlpha = s.fade > 0 ? Math.max(0, 1 - s.fade / 40) : 1
                for (let k = -30; k <= 4; k += 2) {
                    const wx = (((s.wx + k) % LAP) + LAP) % LAP
                    const gy = g2s(groundY(tr.ground, wx))
                    ctx.fillStyle = '#3a2408'
                    ctx.fillRect(fx + k, gy + 1, 2, 2)
                }
                const my = g2s(groundY(tr.ground, s.wx))
                ctx.fillStyle = '#8a5a1a'
                ctx.fillRect(fx - 6, my - 3, 14, 4); ctx.fillRect(fx - 3, my - 5, 8, 3)
                ctx.fillStyle = '#b5905a'
                ctx.fillRect(fx - 2, my - 5, 5, 1)
            }
            ctx.globalAlpha = 1
        }
        const drawScene = () => {
            const scr = screenRef.current
            const tr = track(gs.track)
            const camX = Math.max(0, gs.x - 84)
            const sx = shake > 0 ? Math.sin(gs.tick * 3.1) * shake * 0.6 : 0
            const sy = shake > 0 ? Math.cos(gs.tick * 2.4) * shake * 0.5 : 0
            if (shake > 0) { shake *= 0.86; if (shake < 0.4) shake = 0 }
            ctx.save(); ctx.translate(Math.round(sx), Math.round(sy))
            drawTerrain(tr, camX)
            drawScars(tr, camX)
            if (camX < 400) drawStart(camX)
            for (const r of gs.rivals) {
                const rx = r.d % LAP
                const ddx = rx - camX
                if (ddx > -20 && ddx < W + 20) {
                    const col = RIDE.rivals[gs.rivals.indexOf(r) % 5]
                    if (r.down > 0) {
                        // wiped out (#2384). #2387 gave the flicker a story:
                        // the rider comes OFF and tumbles a few frames, the
                        // bike parks nose-in-dirt while they walk it back,
                        // then a hop and they're on. The amber chevron stays —
                        // #2391's SOLID-wreck warning must not lose its voice.
                        const gy = g2s(groundY(tr.ground, rx))
                        const p = 110 - r.down
                        if (p < 34) {
                            drawBike(ddx + Math.sin(p * 0.5) * 3, gy - 4 - Math.abs(Math.sin(p * 0.3)) * 7, 1.15 + Math.sin(p * 0.42) * 0.45, col, null)
                            drawRider(ddx - 4 + p * 0.35, gy - 18 - Math.abs(Math.sin(p * 0.3)) * 9, p * 0.5, col)
                        } else if (r.down > 24) {
                            if (gs.tick % 22 < 14) drawRider(ddx + 9 - Math.sin(gs.tick * 0.12) * 3, gy - 6, Math.sin(gs.tick * 0.3) * 0.2, col)
                            drawBike(ddx, gy - 4, 1.15, col, r.name)
                        } else {
                            const hp = 24 - r.down
                            drawBike(ddx, gy - 4, 1.15 * Math.min(1, hp / 18), col, r.name)
                            drawRider(ddx - 3, gy - 10 - (hp < 16 ? Math.sin((hp / 16) * Math.PI) * 12 : 0), hp < 16 ? -0.6 : 0, col)
                        }
                        const wy = g2s(groundY(tr.ground, rx)) - 34 + Math.sin(gs.tick * 0.15) * 2
                        if (gs.tick % 24 < 16) {
                            ctx.fillStyle = '#ffb347'
                            ctx.beginPath(); ctx.moveTo(ddx, wy + 7); ctx.lineTo(ddx - 5, wy); ctx.lineTo(ddx + 5, wy); ctx.closePath(); ctx.fill()
                            ctx.fillStyle = '#101010'; ctx.fillRect(ddx - 1, wy + 2, 2, 3)
                        }
                        if (gs.tick % 6 === 0) { parts.push({ x: ddx - 8, y: g2s(groundY(tr.ground, rx)) - 4, vx: -0.4, vy: -0.7, t: 0, col: '#8a5a1a' }) }
                    } else {
                        const py = g2s(r.air ? r.alt : groundY(tr.ground, rx)) - 6
                        const tilt = leans[r.name] ? Math.sin(leans[r.name] * 0.8) * leans[r.name] * 0.02 : 0
                        drawBike(ddx, py, r.pitch + tilt, col, r.name)
                    }
                }
            }
            if (!(gs.crash > 0 && gs.tick % 6 < 3)) {
                const jlean = leanYou.t > 0 ? Math.sin(leanYou.t * 0.9) * leanYou.t * 0.02 : 0
                drawBike(gs.x - camX, g2s(gs.alt) - 6, gs.pitch + jlean, RIDE.you)
                if (preTell && gs.tick % 8 < 5) {
                    // a rival is closing on your back — amber chevrons at the
                    // rear wheel, the visual half of the engine-pitch pre-tell
                    ctx.fillStyle = '#ffb347'
                    for (let k = 0; k < 2; k++) {
                        const bx = gs.x - camX - 16 - k * 7
                        ctx.beginPath(); ctx.moveTo(bx + 5, g2s(gs.alt) - 12); ctx.lineTo(bx, g2s(gs.alt) - 16); ctx.lineTo(bx, g2s(gs.alt) - 8); ctx.closePath(); ctx.fill()
                    }
                }
            }
            for (let i = parts.length - 1; i >= 0; i--) {
                const pa = parts[i]; pa.t++; pa.x += pa.vx; pa.y += pa.vy + 1
                if (pa.t > 22) { parts.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 22; ctx.fillStyle = pa.col; ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            // world-pinned juice: white ring flashes and floating score/rank pops
            for (const fl of flashes) {
                let fx = ((fl.wx - camX) % LAP + LAP) % LAP
                if (fx > LAP / 2) fx -= LAP
                if (fx < -14 || fx > W + 14) continue
                ctx.globalAlpha = 1 - fl.t / 12
                ctx.strokeStyle = '#f8f8f8'; ctx.lineWidth = 2
                ctx.beginPath(); ctx.arc(fx, fl.y, 5 + fl.t * 1.6, 0, Math.PI * 2); ctx.stroke()
            }
            ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
            for (const p of pops) {
                let px = ((p.wx - camX) % LAP + LAP) % LAP
                if (px > LAP / 2) px -= LAP
                if (px < -30 || px > W + 30) continue
                ctx.globalAlpha = p.t > 34 ? 1 - (p.t - 34) / 18 : 1
                ctx.fillStyle = '#101010'; ctx.fillText(p.text, px + 1, p.y0 - p.t * 0.6 + 1)
                ctx.fillStyle = p.col; ctx.fillText(p.text, px, p.y0 - p.t * 0.6)
            }
            ctx.textAlign = 'left'
            ctx.globalAlpha = 1
            ctx.restore()
            if (scr === 'play' && gs.count > 0) {
                const lit = Math.ceil(gs.count / 50)
                ctx.fillStyle = '#101010'; ctx.fillRect(W / 2 - 46, 60, 92, 34)
                ctx.strokeStyle = '#f8f8f8'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 46, 60, 92, 34)
                for (let i = 0; i < 3; i++) {
                    const on = (3 - i) <= (3 - lit) || (gs.count <= 0)
                    ctx.fillStyle = on ? '#ffe23f' : '#5a4010'
                    ctx.beginPath(); ctx.arc(W / 2 - 28 + i * 28, 74, 8, 0, Math.PI * 2); ctx.fill()
                }
                ctx.fillStyle = '#f8f8f8'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
                ctx.fillText(gs.count > 0 ? String(Math.max(1, lit)) : 'GO', W / 2, 90); ctx.textAlign = 'left'
            }
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const h = hudRef.current
            const rank = gs.rank + (['st', 'nd', 'rd'][gs.rank - 1] || 'th')
            if (h.pos) h.pos.textContent = rank
            if (h.lap) h.lap.textContent = `${gs.lap}/${gs.laps}`
            if (h.time) { const s = Math.max(0, gs.clock / 60); h.time.textContent = s.toFixed(1) }
            if (h.gear) h.gear.textContent = gs.gear.toUpperCase()
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.vbar) h.vbar.style.width = `${Math.min(100, (gs.v / CFG.boostV) * 100)}%`
            if (h.hbar) { h.hbar.style.width = `${Math.min(100, gs.heat)}%`; h.hbar.style.background = gs.hot ? '#ff2a1a' : (gs.heat > 65 ? '#ffb347' : '#39d3ff') }
            if (h.heatwarn) h.heatwarn.style.opacity = gs.hot ? '1' : '0'
            if (h.progress) h.progress.style.left = `${(gs.x / LAP) * 100}%`
            // speedometer needle via an inline svg rotation
            if (h.needle) { const frac = Math.max(0, Math.min(1, gs.v / CFG.boostV)); h.needle.setAttribute('transform', `rotate(${-120 + frac * 240} 30 30)`) }
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) { acc += ft; while (acc >= SIM_MS) { doFrameSim(); music(); sense(); rivalHum(); acc -= SIM_MS } }
            drawScene()
            syncHud()
        }

        const clearJuice = () => {
            pops.length = 0; flashes.length = 0; scars.length = 0
            for (const k of Object.keys(leans)) delete leans[k]
            leanYou.t = 0; for (const k of Object.keys(wasAir)) delete wasAir[k]
            preTell = false
        }
        const startPlay = (trackIdx = 0) => {
            gs = makeGame(trackIdx, { gear: gearRef.current })
            watchingRef.current = false; setWatching(false) // #1637 a new race starts in your hands
            bikeMem = { pump: 0 }
            noteAt = gs.tick
            parts.length = 0
            lastContact.length = 0
            clearJuice()
            keys.g = keys.b = keys.j = false
            setMode('play')
            audioController.playSweep(220, 660, 0.25, 'sawtooth', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            // #1637 WATCH: Y seats the rollout planner at any live state (it
            // re-decides from the bike every tick); any driving key takes over.
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (!gs.end) { watchingRef.current = true; setWatching(true); playWatchStart(); bikeMem = { pump: 0 } }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'ArrowUp') keys.g = true
            if (e.code === 'ArrowDown') keys.b = true
            if (e.code === 'Space') keys.j = true
            if (e.code === 'KeyG') { gearRef.current = gearRef.current === 'high' ? 'low' : 'high'; setGear(gearRef.current); gs.gear = gearRef.current; say('GEAR: ' + gearRef.current.toUpperCase()) }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowUp') keys.g = false
            if (e.code === 'ArrowDown') keys.b = false
            if (e.code === 'Space') keys.j = false
        }
        const onBlur = () => { keys.g = keys.b = keys.j = false }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') startPlay(0)
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
            // #1637 a touch on the dirt means you want the wheel (the WATCH pill
            // stopPropagations its press; the pad's keys take over too).
            else if (sc === 'play' && watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${W * sc}px`; canvas.style.height = `${H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)
        const t = setTimeout(() => { provenRun(); demoReady = true }, 60)

        if (import.meta.env.DEV) {
            window.__bikeTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, track: gs.track, end: gs.end,
                    x: gs.x, total: gs.total, v: gs.v, alt: gs.alt, vy: gs.vy, pitch: gs.pitch,
                    air: gs.air, airT: gs.airT, crash: gs.crash, stall: gs.stall, pumpT: gs.pumpT,
                    heat: gs.heat, hot: gs.hot, gear: gs.gear, rank: gs.rank, score: gs.score,
                    lap: gs.lap, laps: gs.laps, clock: gs.clock, count: gs.count, inBand: gs.inBand,
                    rivals: gs.rivals.map((r) => ({ name: r.name, d: Math.round(r.d), air: r.air, down: r.down, crashes: r.crashes, tk: r.tk, held: r.held })),
                    contact: lastContact.slice(-14),
                    juice: { pops: pops.length, flashes: flashes.length, scars: scars.length, lean: Object.keys(leans).length + (leanYou.t ? 1 : 0), preTell },
                    screenX: Math.max(0, gs.x - 84) ? 84 : gs.x, screenY: g2s(gs.alt) - 6,
                }),
                start: () => startPlay(0),
                watching: () => watchingRef.current, // #1637 watchcheck pilot drives these
                watchSfx: watchSfxLog,
                track: (i) => startPlay(i),
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.track !== undefined) { gs = makeGame(opts.track, { gear: gs.gear, count: 0 }) }
                    lastContact.length = 0
                    Object.assign(gs, {
                        ...(opts.x !== undefined && { x: opts.x }),
                        ...(opts.x !== undefined && { total: opts.x }),
                        ...(opts.alt !== undefined && { alt: opts.alt }),
                        ...(opts.v !== undefined && { v: opts.v }),
                        ...(opts.air !== undefined && { air: opts.air, onGround: !opts.air }),
                        ...(opts.vy !== undefined && { vy: opts.vy }),
                        ...(opts.pitch !== undefined && { pitch: opts.pitch }),
                        ...(opts.stall !== undefined && { stall: opts.stall }),
                        ...(opts.crash !== undefined && { crash: opts.crash }),
                        ...(opts.heat !== undefined && { heat: opts.heat }),
                        ...(opts.clock !== undefined && { clock: opts.clock }),
                    })
                    if (opts.alt === undefined) gs.alt = groundY(track(gs.track).ground, gs.x)
                    // #2391 test rigs: park rivals (downed or rolling) so the
                    // contact law can be driven in-tab with real keys.
                    if (opts.rivals) for (const [nm, pat] of Object.entries(opts.rivals)) {
                        const q = gs.rivals.find((x) => x.name === nm)
                        if (q) {
                            Object.assign(q, pat)
                            if (pat.alt === undefined && pat.d !== undefined) q.alt = groundY(track(gs.track).ground, q.d % LAP)
                        }
                    }
                    return true
                },
            }
            mountDbg({
                title: 'EXCITEBIKE',
                getState: () => [
                    `${track(gs.track).name}  ${gs.rank}${['st', 'nd', 'rd'][gs.rank - 1] || 'th'}/6  lap ${gs.lap}/${gs.laps}  ${gs.gear}  clock ${(gs.clock / 60).toFixed(1)}s`,
                    `v ${gs.v.toFixed(2)}  alt ${gs.alt.toFixed(0)}  vy ${gs.vy.toFixed(2)}  pitch ${gs.pitch.toFixed(2)}  ${gs.air ? 'AIR ' + gs.airT : 'ground'}`,
                    `heat ${gs.heat.toFixed(0)}${gs.hot ? ' BOILED' : ''}  crash ${gs.crash}  stall ${gs.stall}  band ${gs.inBand || '-'}`,
                    `league ${gs.rivals.map((r) => `${r.name}${r.down > 0 ? ' DOWN' : ''}${r.air ? ' air' : ''}${r.crashes ? `↺${r.crashes}` : ''}`).join(' ')}`,
                    `screen ${screenRef.current}  paused ${pausedRef.current}  end ${gs.end}  score ${gs.score}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const r = decide(gs, { pump: 0 })
                            const report = []
                            for (const [name, patch] of [['gas', { g: true }], ['brake', { b: true }], ['jump', { g: true, j: true }], ['coast', {}]]) {
                                const c = structuredClone(gs)
                                for (let k = 0; k < 60; k++) { step(c, name === 'jump' ? { ...patch, j: k === 0 } : patch); c.events.length = 0; if (c.end) break }
                                report.push(`${name}:v${c.v.toFixed(1)}${c.crash ? '×' : ''}${c.air ? ' air' : ''}`)
                            }
                            return `decide→${JSON.stringify(r)} | ${report.join(' ')}`
                        },
                    },
                    { label: '+15s CLOCK', run: () => { gs.clock += 15 * 60; return `clock ${(gs.clock / 60).toFixed(0)}s` } },
                    { label: 'WRECK DRILL', run: () => { const q = gs.rivals.find((r) => r.name === 'IVAN'); q.d = gs.total + 70; q.v = 0; q.down = 50; q.alt = groundY(track(gs.track).ground, q.d % LAP); return 'IVAN down 70px ahead — the lane is blocked' } },
                    { label: 'PACK AHEAD', run: () => { gs.rivals.forEach((q, ix) => { q.d = gs.total + 60 + ix * 26; q.v = 4.4; q.alt = groundY(track(gs.track).ground, q.d % LAP) }); return 'the whole pack is in front — pass on the air' } },
                    { label: 'COOL ENGINE', run: () => { gs.heat = 0; gs.hot = false; return 'cooled' } },
                    { label: 'WARP TO BOOST', run: () => { gs.x = 3950; gs.alt = groundY(track(gs.track).ground, 3950); gs.v = 6; return 'boost straight' } },
                    { label: 'WARP TO MUD', run: () => { const m = track(gs.track).bands.find((b) => b[0] === MUD); gs.x = m[1]; gs.alt = groundY(track(gs.track).ground, m[1]); return 'mud pit' } },
                    { label: 'WARP TO WATER', run: () => { const w = track(gs.track).bands.find((b) => b[0] === WATER); gs.x = w[1]; gs.alt = groundY(track(gs.track).ground, w[1]); gs.v = 2; return 'water hole (slow)' } },
                ],
            })
        }

        // #1473: production-safe feedback state, every build. Every track is a
        // fixed table (levels.js) and the rivals run a deterministic script — the
        // whole engine contains zero Math.random — so there is no per-run seed to
        // report: {tick,score,done,rank} only.
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.end != null, rank: gs.rank }))

        return () => {
            unexposeFeedbackState()
            clearTimeout(t)
            if (import.meta.env.DEV) { if (window.__bikeTest) delete window.__bikeTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {/* HUD: NES gauge pod */}
            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-1 left-1 font-mono text-[10px] leading-tight">
                    <div className="flex gap-1 items-center">
                        <span className="bg-red-700 text-white px-1 rounded-sm border border-white/40"><span ref={setHud('pos')}>1st</span></span>
                        <span className="bg-black/50 text-yellow-200 px-1 rounded-sm">LAP <span ref={setHud('lap')}>1/2</span></span>
                        <span className="bg-black/50 text-cyan-200 px-1 rounded-sm"><span ref={setHud('gear')}>HIGH</span></span>
                    </div>
                    <div className="text-white mt-0.5" style={{ textShadow: '1px 1px #000' }}>
                        TIME <span ref={setHud('time')} className="text-green-300 font-bold">0.0</span>
                    </div>
                    <div className="text-white/80 mt-0.5" style={{ textShadow: '1px 1px #000' }}>SCORE <span ref={setHud('score')}>000000</span></div>
                </div>
                {/* speed dial + heat pod (right) */}
                <div className="absolute top-1 right-1 flex flex-col items-center gap-1">
                    <svg width="60" height="46" viewBox="0 0 60 60" className="drop-shadow">
                        <circle cx="30" cy="30" r="26" fill="#0a0a12" stroke="#f8f8f8" strokeWidth="2" />
                        <text x="30" y="12" fill="#f8f8f8" fontSize="7" textAnchor="middle" fontFamily="monospace">MPH</text>
                        <g ref={setHud('needle')} transform="rotate(-120 30 30)"><line x1="30" y1="30" x2="30" y2="9" stroke="#ff3b2a" strokeWidth="2" /></g>
                        <circle cx="30" cy="30" r="3" fill="#ff3b2a" />
                    </svg>
                    <div className="text-[8px] font-mono text-white" style={{ textShadow: '1px 1px #000' }}>
                        SPEED<span className="inline-block w-14 h-1.5 ml-1 border border-white/50 align-middle"><span ref={setHud('vbar')} className="block h-full bg-green-400" style={{ width: '0%' }} /></span>
                    </div>
                    <div className="text-[8px] font-mono text-white" style={{ textShadow: '1px 1px #000' }}>
                        HEAT<span className="inline-block w-14 h-1.5 ml-1 border border-white/50 align-middle"><span ref={setHud('hbar')} className="block h-full bg-cyan-400" style={{ width: '0%' }} /></span>
                    </div>
                    <span ref={setHud('heatwarn')} className="text-red-400 text-[8px] font-bold transition-opacity animate-pulse" style={{ opacity: 0 }}>ENGINE HOT</span>
                </div>
                {/* course progress bar */}
                <div className="absolute bottom-24 inset-x-8 h-1.5 bg-black/50 border border-white/30">
                    <span ref={setHud('progress')} className="absolute -top-1 w-1.5 h-3.5 bg-red-500 border border-white" style={{ left: '0%' }} />
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-yellow-100 font-mono font-bold text-xl transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 10px #a40' }} />
            </div>

            {/* #1637 WATCH — the planner rides the gate; any input takes over.
                (pill first in the DOM: the phone contract reads the pill's
                window clean of the attract block's bottom anchor; z keeps look) */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                        <h1 className="text-4xl font-black tracking-tight" style={{ color: '#e40000', textShadow: '2px 2px 0 #ffe23f, 4px 4px 0 #000' }}>EXCITEBIKE</h1>
                        <p className="text-white font-mono font-bold mt-3 animate-pulse">{PRESS}</p>
                        <span className="block mt-2 font-mono text-[11px] tracking-widest text-emerald-300/90">{WATCH_ATTRACT_HINT}</span>
                        <AttractMessage className="text-cyan-100/80 mt-2 px-8" messages={MESSAGES} />
                    </div>
                </>
            )}

            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-yellow-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-green-300' : 'text-red-400'}`}>{end.win ? 'FIRST PLACE!' : 'GAME OVER'}</h2>
                    <p className="text-lg mb-3">{end.score} pts {end.win ? `· finished ${end.rank}${['st', 'nd', 'rd'][end.rank - 1] || 'th'}` : '· the clock ran out'}</p>
                    <div className="bg-black/50 border border-yellow-400/40 rounded p-3 w-72 max-w-full text-sm">
                        <div className="text-yellow-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (<div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>))}
                    </div>
                    <p className="mt-4 text-xs text-cyan-100/70">gear at the title was <b>{gear}</b> — press G on the title to change</p>
                    <p className="mt-2 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'EXCITEBIKE')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default ExcitebikeGame
