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
import { track, groundY, LAP, MUD, WATER, BOOST, nextSel, TRACK_COUNT, trackName, trackBite, buildTrack, registerCustom, customCount, TRANSIENT, setTestTrack, clearTestTrack, ownTerrain } from './levels.js'
import { TOOLS, SPAN, CUR_STEP, CUSTOM_KEY, CUSTOM_MAX, LAPS_DEFAULT, LAPS_MIN, LAPS_MAX, lapsOf, compileCustom, auditCustomData, fitsAt, stampAt, stampShape, encodeCustom, decodeCustom, NAME_MAX, NAME_WHEEL, pushName, popName, designName, lapCycle, overBookLabel, lapTipFor, LAP_TIP, LAP_TIP_KEY, badgeCompact, bikeBob, KIND_COLOR, toolLabelColor } from './custom.js'
import { plan, decide } from './planner.js'
import { PRESS, MESSAGES, demoSeats, demoSeatTrack, demoSeatName } from './attract.js'
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

// #2573 item 3 — the splash cursor is the little bike the NES catalogue put
// beside the selected track, not a typographic ▶. It bobs two frames while the
// menu idles (bikebob, index.css); colours come from the RIDE palette: red
// body, white helmet, yellow wheels. data-on lets the harness read WHICH row
// wears it — the cursor law lives in one place, provable from the DOM.
const BikeCursor = ({ on }) => (
    <svg data-bikecursor="" data-on={on ? '1' : '0'} width="16" height="12" viewBox="0 0 16 12"
        className={`inline-block align-middle ${on ? '' : 'opacity-0'}`}
        style={on ? { animation: 'bikebob 0.5s steps(1) infinite' } : undefined} aria-hidden="true">
        <circle cx="3.5" cy="8.5" r="3" fill="#101010" stroke="#ffe23f" strokeWidth="1" />
        <circle cx="12.5" cy="8.5" r="3" fill="#101010" stroke="#ffe23f" strokeWidth="1" />
        <rect x="4" y="4.5" width="8" height="2" fill={RIDE.you.body} />
        <rect x="5.5" y="1" width="4" height="4" fill={RIDE.you.body} />
        <rect x="6.5" y="0" width="3" height="2" fill={RIDE.you.hel} />
    </svg>
)

let proven = null
const provenRun = () => { if (!proven) proven = plan({ track: 0 }); return proven }

const ExcitebikeGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [gear, setGear] = useState('high')
    const [sel, setSel] = useState(0) // #2563: the splash cursor — which of the six you're riding
    const [customs, setCustoms] = useState(0) // #2576: saved EDIT TRACK slots loaded (splash grows)
    const [testing, setTesting] = useState(false) // #2573: render mirror of testRide.active — the pad's ABANDON button rides this
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const gearRef = useRef('high')
    const customsRef = useRef(0)
    const selRef = useRef(0)
    const overAtRef = useRef(0)
    const [watching, setWatching] = useState(false) // #1637 WATCH: excitecheck's rollout planner rides the gate
    const watchingRef = useRef(false)
    const [ownRide, setOwnRide] = useState(false) // #2603 riding your own design — the pad grows EXIT
    const ownRef = useRef(false)
    const [demoTrack, setDemoTrack] = useState('MOTOCROSS') // #2647 attract badge — which seat rides
    const demoTrackRef = useRef('MOTOCROSS')
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
        let demoAt = 0, demoReady = false, toast = 0, toastMsg = '', toastPrio = 0, shake = 0
        let noteAt = 0, heatBeep = 0, fxRBump = 0 // #2434 renderer-side rbump counter (vacuity probe)
        let vclock = 0 // #2576 editor pulse clock (the sim is parked in EDIT; menus still breathe)
        // #2665 paint-time receipt of the bay stamp (the probe speaks it; the
        // harness compares it against real pixels — law, paint and receipt once again agree)
        let bayPaint = { cx: -1, gy: -1, on: false, labels: [] }
        const lastContact = []
        const keys = { g: false, b: false, j: false, l: false, r: false }
        let bikeMem = { pump: 0 } // #1637 decide()'s per-seat memory (pump taps)
        const parts = []
        // #2434: the toast is ONE line. A headline (a rival PILES IN, your own
        // wreck) must not be stomped by a minor rival scuffle while it is still
        // on screen — a chain should read as one dramatic beat, not a strobe of
        // four messages. Headlines (prio 2) override anything; minors (prio 1)
        // yield to a live headline but pass freely once it has faded.
        const say = (m, p = 1) => { if (toast > 0 && p < toastPrio) return; toastMsg = m; toastPrio = p; toast = 90 }
        // #2603 seat/unseat the own-terrain pad law (the component renders the
        // pad from React state; the ref keeps the sim tick and the probe honest).
        const seatOwn = (v) => { ownRef.current = v; setOwnRide(v) }
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
                    say(e.why === 'wreck' ? 'WRECK!' : e.why === 'contact' ? 'BIKE VS BIKE!' : 'CRASH!', 2)
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
                else if (e.type === 'rub') {
                    // #2457: matched speed, same line — handlebars. The fix is
                    // steering, and the toast says so.
                    say('RUB! TAKE THE LINE')
                    audioController.playNoise(0.12, 0.06); audioController.playTone(880, 0.10, 'sawtooth', 0.05)
                    burst(scrX + 10, g2s(gs.alt) - 10, 6, '#ffe23f'); shake = 4
                    if (e.name) leans[e.name] = 10
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
                        say(e.why === 'wreck' ? e.name + ' PILES IN!' : e.name + ' DOWN!', 2)
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
                        fxRBump++ // #2434: an on-screen scuffle that would clobber the toast
                        say(e.a + ' bumps ' + e.b) // prio 1 — a minor fight, yields to a live headline
                        audioController.playNoise(0.12, 0.05); audioController.playTone(160, 0.09, 'square', 0.04)
                        burst(scrX + dd - 6, g2s(groundY(track(gs.track).ground, e.x)) - 8, 7, '#c98a3a')
                        if (leans[e.a] == null) leans[e.a] = 8
                        if (leans[e.b] == null) leans[e.b] = 12
                        if (Math.abs(dd) < 60) shake = 3
                    }
                }
                else if (e.type === 'rrub') {
                    // #2457: the pack sorting itself out at pace — sparks where
                    // two rivals separate, no toast (the pack talks quietly).
                    const dd = ((e.x - gs.x + LAP * 1.5) % LAP) - LAP / 2
                    if (dd > -104 && dd < W - 64) {
                        audioController.playNoise(0.08, 0.03)
                        burst(scrX + dd, g2s(groundY(track(gs.track).ground, e.x)) - 8, 4, '#ffe23f')
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
            // #2632 item 1: the over screen announces the book. The NES-era edit
            // runs said their distance; a custom off the house book says
            // `CUSTOM 1 · 5 LAPS`. A default-book run stays the plain line.
            const book = ownRef.current ? overBookLabel(gs.track - TRACK_COUNT + 1, gs.laps) : ''
            setEnd({ win, score: sc, rank: gs.rank, book })
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
                if (['flyby', 'bump', 'jolt', 'rub'].includes(e.type) || (e.type === 'crash' && (e.why === 'wreck' || e.why === 'contact'))) {
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
                    if (ddx > -20 && ddx < 256 + 20) burst(ddx, g2s(groundY(trk, r.d % LAP)) - 2 - laneDy(r.lane), 4, '#b5905a')
                }
            }
            // decay the juice timers (lean, pops, flashes, scars)
            if (leanYou.t > 0) leanYou.t--
            for (const k of Object.keys(leans)) { if (--leans[k] <= 0) delete leans[k] }
            for (let i = pops.length - 1; i >= 0; i--) if (++pops[i].t > 52) pops.splice(i, 1)
            for (let i = flashes.length - 1; i >= 0; i--) if (++flashes[i].t > 12) flashes.splice(i, 1)
            for (let i = scars.length - 1; i >= 0; i--) { scars[i].t++; if (scars[i].fade > 0 && ++scars[i].fade > 40) scars.splice(i, 1) }
            if (gs.end) {
                // #2647 VIEWER SEATS — the attract/splash demo is eyes-only.
                // Ground truth before this law: the MOTOCROSS replay reached its
                // finish line at ~t2561, finish(true) wrote the BOT's score into
                // excitebike.board, and the marquee froze on the over screen
                // until a key was touched. A demo submits nothing — tickDemo
                // rotates the seat on the next tick.
                const vsc = screenRef.current
                if (vsc === 'attract' || vsc === 'tracks') { /* demo end — nothing to submit */ }
                // #2587 a test lap finishing walks you back to the bay — the
                // over screen and the leaderboard are the league's, not a draft's.
                else if (testRide.active) endTestRide(gs.end === 'win' ? 'LAP DOWN — BACK TO THE BAY' : 'TIME OUT — BACK TO THE BAY')
                else finish(gs.end === 'win')
            }
        }
        // #2647 ATTRACT SEATS — MOTOCROSS keeps the memoized proven run; each
        // saved design is planned once, lazily, by the SAME autopilot (plan is
        // the attract's own source). The cache keys on the compiled terrain
        // OBJECT: re-saving a slot swaps CACHE's entry (levels.js
        // registerCustom), so an identity miss re-plans and the demo never
        // rides stale dirt. The lazy ~110 ms plan rides an idle screen, not a
        // race — one dropped frame on the marquee, once per design.
        let demoSeq = 0
        const demoCache = new Map()
        const demoRunFor = (seat) => {
            const idx = demoSeatTrack(seat, TRACK_COUNT)
            if (idx === 0) return provenRun()
            const t = track(idx)
            if (!demoCache.has(t)) demoCache.set(t, plan({ track: idx, laps: 1 }))
            return demoCache.get(t)
        }
        const saySeat = (lbl) => { if (demoTrackRef.current !== lbl) { demoTrackRef.current = lbl; setDemoTrack(lbl) } }
        const tickDemo = () => {
            if (!demoReady) return
            const seats = demoSeats(customsRef.current)
            let seat = seats[demoSeq % seats.length]
            let run = demoRunFor(seat)
            if (gs.end || demoAt >= run.script.length) {
                // #2647 rotate the seat: MOTOCROSS first, then your saved designs
                // in roster order. A design rides ONE lap of its own length — the
                // whole draft in a breath — while MOTOCROSS keeps its byte-pinned
                // proven script untouched (the contact receipts stay law).
                demoSeq = (demoSeq + 1) % seats.length
                seat = seats[demoSeq]
                run = demoRunFor(seat)
                gs = makeGame(demoSeatTrack(seat, TRACK_COUNT), { gear: 'high', ...(seat === 0 ? {} : { laps: 1 }) })
                demoAt = 0
                clearJuice()
                // #2651 the badge rides the NAME: a saved design flies under its
                // own name; unnamed/placeholder saves keep the roster grammar.
                saySeat(demoSeatName(seat, seat === 0 ? null : (track(demoSeatTrack(seat, TRACK_COUNT)) || {}).name))
            }
            doSim(run.script[demoAt++])
        }
        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract' || sc === 'tracks') { tickDemo(); return }
            if (sc !== 'play') return
            // One arrow, two truths: on the ground Up is the GAS and Down the
            // BRAKE; airborne the SAME arrows are the rider's weight — the sim
            // only reads u/d when g.air, so sending both is how the bike leans
            // without needing a second set of keys.
            // #1637 WATCH: the seat is decide() — the same rollout planner the
            // attract demo's script came from and excitecheck grades; it
            // re-decides from the live bike every tick.
            if (watchingRef.current) { doSim(decide(gs, bikeMem)); return }
            doSim({ g: keys.g, b: keys.b, j: keys.j, u: keys.g, d: keys.b, l: keys.l, r: keys.r })
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
                if (gap < 0 && gap > -150 && r.v - gs.v > 0.4 && gs.v > 1.0 && Math.abs(r.lane - gs.lane) < 0.3) { preTell = true; break }
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
        const laneDy = (lane) => (lane || 0) * 16          // #2457: a far line sits higher
        const laneSc = (lane) => 1 - (lane || 0) * 0.10    // and slightly smaller — the NES depth trick
        // #3883 stagger overlapping name labels: a tight pack stacks its riders'
        // name tags up in a small column instead of garbling them together.
        let labelStack = []
        const drawBike = (cx, cy, pitch, p, riderName, lane) => {
            const dy = laneDy(lane); const s = laneSc(lane)
            ctx.save(); ctx.translate(cx, cy - dy); ctx.scale(s, s); ctx.rotate(-pitch)
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
            if (riderName) {
                let labelY = cy - dy - 26 * s
                for (const l of labelStack) { if (Math.abs(l.cx - cx) < 34) labelY = Math.min(labelY, l.y - 9) }
                labelStack.push({ cx, y: labelY })
                ctx.fillStyle = '#f8f8f8'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText(riderName, cx, labelY); ctx.textAlign = 'left'
            }
        }
        const drawRider = (cx, cy, rot, p, lane) => {
            // a rider separated from the bike (#2387 tumble/remount theatre)
            const dy = laneDy(lane); const s = laneSc(lane)
            ctx.save(); ctx.translate(cx, cy - dy); ctx.scale(s, s); ctx.rotate(rot)
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
        // #2665 KIND_COLOR moved to custom.js — the palette identity is law now,
        // graded by excitecheck and painted here (and on the strip below).
        const drawEditor = () => {
            const tr = draft.track
            const camX = Math.max(0, Math.min(LAP - W + 1, draft.cursor - Math.floor(W / 2)))
            drawTerrain(tr, camX)
            // start/finish banner stays on the base lap — the seam is sacred
            drawStart(camX)
            // placed stamps: end ticks pinned to the surface + a kind label
            for (const st of draft.stamps) {
                const sx = st.x - camX; const ex = st.x + SPAN[st.kind] - camX
                if (ex < -4 || sx > W + 4) continue
                ctx.fillStyle = '#f8f8f8'
                ctx.fillRect(sx, g2s(groundY(tr.ground, st.x)) + 12, 2, 6)
                ctx.fillRect(ex - 2, g2s(groundY(tr.ground, Math.min(LAP, st.x + SPAN[st.kind]))) + 12, 2, 6)
                ctx.fillStyle = KIND_COLOR[st.kind] || '#f8f8f8'
                ctx.font = 'bold 7px monospace'
                ctx.fillText(st.kind, Math.max(2, Math.min(W - 30, sx + 4)), g2s(groundY(tr.ground, st.x)) - 6)
            }
            // the cursor: pulsing plumb line, footprint bracket, ghost preview
            const kind = TOOLS[draft.tool]
            const verb = kind === 'SAVE' || kind === 'EXIT' || kind === 'ERASE' || kind === 'TEST' || kind === 'LAP'
            const fits = verb || fitsAt(draft.stamps, kind, draft.cursor)
            const col = kind === 'ERASE' ? '#ff6a4a' : kind === 'SAVE' ? '#80e000' : kind === 'TEST' ? '#8fe0ff' : kind === 'LAP' ? '#ff9c00' : fits ? '#ffe23f' : '#ff2a1a'
            const cx = draft.cursor - camX
            const gy = g2s(groundY(tr.ground, draft.cursor))
            const pulse = Math.sin(vclock * 0.14) * 2
            if (SPAN[kind] !== undefined && fits && kind !== 'ERASE') {
                // ghost: the stamp's true silhouette at the cursor, half-laid
                ctx.globalAlpha = 0.55
                ctx.strokeStyle = col; ctx.lineWidth = 2
                const shp = stampShape(kind, draft.cursor)
                if (shp.length > 1) {
                    ctx.beginPath()
                    for (const [px, h] of shp) ctx.lineTo(px - camX, g2s(h))
                    ctx.stroke()
                } else {
                    for (let sx = Math.max(0, cx); sx < Math.min(W, cx + SPAN[kind]); sx += 2) {
                        ctx.fillStyle = col
                        ctx.fillRect(sx, g2s(groundY(tr.ground, draft.cursor)) + 1, 2, kind === 'BOOST' ? 4 : 6)
                    }
                }
                ctx.globalAlpha = 1
            }
            ctx.fillStyle = col
            ctx.fillRect(cx, gy - 46 + pulse, 2, 46)
            ctx.beginPath(); ctx.moveTo(cx - 4, gy - 46 + pulse); ctx.lineTo(cx + 6, gy - 40 + pulse); ctx.lineTo(cx - 4, gy - 34 + pulse); ctx.closePath(); ctx.fill()
            if (kind === 'ERASE' && SPAN[kind] === undefined) {
                ctx.strokeStyle = col; ctx.lineWidth = 1
                ctx.strokeRect(cx - 8, gy - 16, 18, 18)
                ctx.beginPath(); ctx.moveTo(cx - 6, gy - 14); ctx.lineTo(cx + 8, gy + 0); ctx.moveTo(cx + 8, gy - 14); ctx.lineTo(cx - 6, gy + 0); ctx.stroke()
            }
            // #2665 THE BAY RIDES THE STAMP — the splash cursor's little bike
            // (#2573 law), seated on the surface at the cursor and bobbing two
            // frames at the splash cadence (bikeBob lives in custom.js; 15 ticks
            // per flip = the svg's 0.5s steps(1) beat at 60fps). Identity wears
            // the RIDE palette: black tyres, yellow rims, red body, white helmet
            // — the same colours the splash BikeCursor paints. It is identity,
            // not verdict: FIT/NO stays exactly where it was (plumb, bracket,
            // ghost bar), and ERASE is the one hide — its red X owns the ground.
            const by = Math.round(gy) - bikeBob(vclock)
            bayPaint.cx = cx; bayPaint.gy = gy; bayPaint.on = kind !== 'ERASE'
            if (kind !== 'ERASE') {
                ctx.fillStyle = '#101010'
                ctx.fillRect(cx - 8, by - 6, 5, 5); ctx.fillRect(cx + 3, by - 6, 5, 5)
                ctx.fillStyle = '#ffe23f'
                ctx.fillRect(cx - 7, by - 5, 3, 3); ctx.fillRect(cx + 4, by - 5, 3, 3)
                ctx.fillStyle = RIDE.you.body
                ctx.fillRect(cx - 5, by - 9, 10, 3); ctx.fillRect(cx - 2, by - 14, 5, 5)
                ctx.fillStyle = RIDE.you.hel
                ctx.fillRect(cx - 1, by - 17, 4, 3)
            }
            // chrome: title, palette strip, status line, help
            ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, W, 18)
            ctx.fillStyle = '#e40000'; ctx.font = 'bold 10px monospace'
            ctx.fillText('EDIT TRACK', 6, 12)
            ctx.fillStyle = '#f8f8f8'; ctx.font = '8px monospace'
            ctx.fillText('OBSTACLES ' + draft.stamps.length + '/12', 84, 12)
            ctx.fillText('SAVED ' + customsRef.current + '/' + CUSTOM_MAX, 178, 12)
            ctx.fillStyle = '#8fe0ff'
            ctx.fillText('X' + draft.cursor, 250, 12)
            ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, H - 24, W, 24)
            let px = 4
            bayPaint.labels = [] // #2665 per-frame palette receipt: the colour EACH label actually painted with
            // #2651 12 labels cannot ride 8px on a 256px canvas (SAVE/EXIT ran
            // off-canvas at 11 with gutter 10 already): at 12 the strip steps
            // down to 6px with a 4px gutter — still NES-small, now all visible.
            const fsz = TOOLS.length >= 12 ? 6 : 8
            for (let i = 0; i < TOOLS.length; i++) {
                const on = i === draft.tool
                // #2625 the LAP tool's face wears its state: `LAP 3` reads the
                // designer's number without opening a panel or guessing.
                const lb = TOOLS[i] === 'LAP' ? 'LAP ' + draft.laps : TOOLS[i]
                // #2665 every label wears its kind's colour (toolLabelColor is
                // law in custom.js) — the strip was uniform grey chalk, so the
                // palette read as text only. Selection keeps its own tells: the
                // yellow wash and the bold weight; only the colour arrives new,
                // and the #2651 measured layout (font, gutter, order) is byte
                // for byte untouched.
                ctx.fillStyle = toolLabelColor(TOOLS[i])
                ctx.font = (on ? `bold ${fsz}px monospace` : `${fsz}px monospace`)
                if (on) { ctx.fillStyle = 'rgba(255,226,63,0.14)'; ctx.fillRect(px - 2, H - 22, ctx.measureText(lb).width + 8, 14); ctx.fillStyle = toolLabelColor(TOOLS[i]) }
                // #2632 item 2: the LAP cell flinches white at the ends of the
                // book — five frames of fading white over the highlight, the
                // visual half of the double-note.
                if (on && i === draft.flashCell && draft.flashT > 0) {
                    ctx.fillStyle = `rgba(255,255,255,${(0.8 * draft.flashT / 5).toFixed(2)})`
                    ctx.fillRect(px - 2, H - 22, ctx.measureText(lb).width + 8, 14)
                }
                ctx.fillText(lb, px + 4, H - 12)
                bayPaint.labels.push({ t: TOOLS[i], c: ctx.fillStyle, on }) // #2665 what actually hit the canvas
                px += ctx.measureText(lb).width + (TOOLS.length >= 12 ? 4 : 10)
            }
            if (draft.msgT > 0) {
                draft.msgT--
                ctx.globalAlpha = draft.msgT < 40 ? draft.msgT / 40 : 1
                ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
                const okMsg = draft.msg.startsWith('SAVED') || draft.msg === 'ERASED' || draft.msg.startsWith('LAPS ') || draft.msg.startsWith('NAME ')
                ctx.fillStyle = okMsg ? '#80e000' : '#ff6a4a'
                ctx.fillText(draft.msg, W / 2, 44)
                ctx.textAlign = 'left'; ctx.globalAlpha = 1
            }
            // #2632 item 2 decay (the flash outlives its own keypress); item 4:
            // the one-time LAP lesson rides under the SAVED receipt it belongs to.
            if (draft.flashT > 0) draft.flashT--
            if (draft.tipT > 0) {
                draft.tipT--
                ctx.globalAlpha = draft.tipT < 60 ? draft.tipT / 60 : 1
                ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                ctx.fillStyle = '#8fe0ff'
                ctx.fillText(draft.tip, W / 2, 56)
                ctx.textAlign = 'left'; ctx.globalAlpha = 1
            }
            ctx.fillStyle = 'rgba(143,224,255,0.75)'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
            if (kind === 'TEST') {
                ctx.fillStyle = '#8fe0ff'
                ctx.fillText('SPACE RIDES THE DRAFT UNSAVED · ESC ENDS THE TEST LAP', W / 2, H - 34)
            }
            if (kind === 'LAP') {
                ctx.fillStyle = '#ffb85c'
                ctx.fillText('SPACE SETS THE LAP COUNT ' + LAPS_MIN + '–' + LAPS_MAX + ' · YOUR TRACK, YOUR LENGTH', W / 2, H - 34)
            }
            if (kind === 'NAME') { // #2651 the naming line: the wheel, live, with the draft's name so far
                ctx.fillStyle = '#80e000'
                ctx.fillText('NAME ' + (draft.name || '—') + ' ◂' + NAME_WHEEL[draft.nameSel] + '▸ · A ADDS · B TAKES BACK', W / 2, H - 34)
            }
            ctx.fillStyle = 'rgba(143,224,255,0.75)'
            ctx.fillText('←→ MOVE · ↑↓ TOOL · SPACE SETS · 1-3 SAVE · ESC EXIT', W / 2, H - 28)
            ctx.textAlign = 'left'
        }
        const drawScene = () => {
            const scr = screenRef.current
            if (scr === 'edit') { vclock++; drawEditor(); return } // #2576 the sim stays parked; the bay breathes on vclock
            labelStack = [] // #3883 fresh stagger column per frame
            const tr = track(gs.track)
            const camX = Math.max(0, gs.x - 84)
            const sx = shake > 0 ? Math.sin(gs.tick * 3.1) * shake * 0.6 : 0
            const sy = shake > 0 ? Math.cos(gs.tick * 2.4) * shake * 0.5 : 0
            if (shake > 0) { shake *= 0.86; if (shake < 0.4) shake = 0 }
            ctx.save(); ctx.translate(Math.round(sx), Math.round(sy))
            drawTerrain(tr, camX)
            drawScars(tr, camX)
            if (camX < 400) drawStart(camX)
            // #2457: riders paint far-line first so the near bike overlaps the
            // far one — depth reads on screen, then the player joins the sort.
            const renderables = []
            for (const r of gs.rivals) {
                const rx = r.d % LAP
                const ddx = rx - camX
                if (ddx > -20 && ddx < W + 20) {
                    renderables.push({ lane: r.lane || 0, fn: () => {
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
                                drawBike(ddx + Math.sin(p * 0.5) * 3, gy - 4 - Math.abs(Math.sin(p * 0.3)) * 7, 1.15 + Math.sin(p * 0.42) * 0.45, col, null, r.lane)
                                drawRider(ddx - 4 + p * 0.35, gy - 18 - Math.abs(Math.sin(p * 0.3)) * 9, p * 0.5, col, r.lane)
                            } else if (r.down > 24) {
                                if (gs.tick % 22 < 14) drawRider(ddx + 9 - Math.sin(gs.tick * 0.12) * 3, gy - 6, Math.sin(gs.tick * 0.3) * 0.2, col, r.lane)
                                drawBike(ddx, gy - 4, 1.15, col, r.name, r.lane)
                            } else {
                                const hp = 24 - r.down
                                drawBike(ddx, gy - 4, 1.15 * Math.min(1, hp / 18), col, r.name, r.lane)
                                drawRider(ddx - 3, gy - 10 - (hp < 16 ? Math.sin((hp / 16) * Math.PI) * 12 : 0), hp < 16 ? -0.6 : 0, col, r.lane)
                            }
                            const wy = g2s(groundY(tr.ground, rx)) - 34 + Math.sin(gs.tick * 0.15) * 2 - laneDy(r.lane)
                            if (gs.tick % 24 < 16) {
                                ctx.fillStyle = '#ffb347'
                                ctx.beginPath(); ctx.moveTo(ddx, wy + 7); ctx.lineTo(ddx - 5, wy); ctx.lineTo(ddx + 5, wy); ctx.closePath(); ctx.fill()
                                ctx.fillStyle = '#101010'; ctx.fillRect(ddx - 1, wy + 2, 2, 3)
                            }
                            if (gs.tick % 6 === 0) { parts.push({ x: ddx - 8, y: g2s(groundY(tr.ground, rx)) - 4 - laneDy(r.lane), vx: -0.4, vy: -0.7, t: 0, col: '#8a5a1a' }) }
                        } else {
                            const py = g2s(r.air ? r.alt : groundY(tr.ground, rx)) - 6
                            const tilt = leans[r.name] ? Math.sin(leans[r.name] * 0.8) * leans[r.name] * 0.02 : 0
                            drawBike(ddx, py, r.pitch + tilt, col, r.name, r.lane)
                        }
                    } })
                }
            }
            if (!(gs.crash > 0 && gs.tick % 6 < 3)) {
                renderables.push({ lane: gs.lane || 0, fn: () => {
                    const jlean = leanYou.t > 0 ? Math.sin(leanYou.t * 0.9) * leanYou.t * 0.02 : 0
                    drawBike(gs.x - camX, g2s(gs.alt) - 6, gs.pitch + jlean, RIDE.you, null, gs.lane)
                    if (preTell && gs.tick % 8 < 5) {
                        // a rival is closing on your back ON YOUR LINE — amber
                        // chevrons at the rear wheel, the visual half of the
                        // engine-pitch pre-tell (#2457: cross-line riders do
                        // not warn, they just pass)
                        ctx.fillStyle = '#ffb347'
                        for (let k = 0; k < 2; k++) {
                            const bx = gs.x - camX - 16 - k * 7
                            const chy = g2s(gs.alt) - laneDy(gs.lane)
                            ctx.beginPath(); ctx.moveTo(bx + 5, chy - 12); ctx.lineTo(bx, chy - 16); ctx.lineTo(bx, chy - 8); ctx.closePath(); ctx.fill()
                        }
                    }
                } })
            }
            renderables.sort((a, b) => b.lane - a.lane)
            for (const re of renderables) re.fn()
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
            if (scr === 'play' && testRide.active) {
                // the trial badge: your own course on the clock of one lap —
                // no rank, no leaderboard, just the terrain and the throttle.
                ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W / 2 - 100, 4, 200, 11)
                ctx.fillStyle = '#8fe0ff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
                ctx.fillText('TEST TRACK · LAP 1 · ABANDON OR ESC TO BAY', W / 2, 12)
                ctx.textAlign = 'left'
            }
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
            if (toast > 0 && !pausedRef.current) { toast--; if (toast === 0) toastPrio = 0 }
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
        // #2573 item 4 — seat-rev receipts: the sweep each seating actually played.
        const revLog = []
        const startPlay = (trackIdx = 0) => {
            // #2625 your design runs on YOUR laps: a seated custom hands its
            // stored number to the engine ({laps} already rides sim.js — TEST
            // laps proved the pipe). The league (tracks 0-5) has no `laps` key,
            // gets no option, and rides the two-lap book byte-identically.
            const t0 = track(trackIdx)
            gs = makeGame(trackIdx, { gear: gearRef.current, ...(ownTerrain(trackIdx) && t0 && t0.laps ? { laps: lapsOf(t0.laps) } : {}) })
            watchingRef.current = false; setWatching(false) // #1637 a new race starts in your hands
            bikeMem = { pump: 0 }
            noteAt = gs.tick
            parts.length = 0
            lastContact.length = 0
            clearJuice()
            keys.g = keys.b = keys.j = keys.l = keys.r = false
            setMode('play')
            // #2603 your own design gives you an exit: the pad grows EXIT and Esc
            // walks out mid-race. Tracks 1-6 (the league) keep the full commitment.
            seatOwn(ownTerrain(trackIdx))
            if (ownRef.current) say('★ YOUR DESIGN — EXIT BACKS TO THE BAY')
            // #2625 when the design deviates from the two-lap book, say so —
            // the length of the race is a promise the seat makes out loud.
            if (ownRef.current && gs.laps !== CFG.laps) say(gs.laps === 1 ? 'ONE LAP — BY YOUR LAW' : gs.laps + ' LAPS — BY YOUR LAW')
            // #2573 item 4 — seat the bike with ONE engine rev before the
            // countdown's own beeps, keyed to the gear you seated in: LOW grinds
            // shorter and lower, HIGH winds further up (the same sweep the rev
            // gauge teaches: gear is a promise the sound now makes out loud).
            const [revLo, revHi] = gearRef.current === 'low' ? [160, 480] : [220, 760]
            audioController.playSweep(revLo, revHi, 0.3, 'sawtooth', 0.08)
            revLog.push([revLo, revHi, gearRef.current])
        }

        // ---- #2576 EDIT TRACK — design your own course, save it, ride it ----
        // The draft is a stamp list; custom.js compiles it into the same
        // {cps,bands} table the shipped six ride on, and auditCustomData is
        // the ONE legality law shared by the live cursor, SAVE, and the Node
        // gate. Nothing here mutates the sim — the editor is a compiler UI.
        const draft = { stamps: [], cursor: 120, tool: 0, msg: '', msgT: 0, track: null, savePtr: 0, laps: LAPS_DEFAULT, name: '', nameSel: 0, flashCell: -1, flashT: 0, tip: '', tipT: 0 }
        // #2587 TEST RIDE: seat the CURRENT draft without saving — one lap,
        // and Esc (or the line) walks you back into the bay. The draft itself
        // (stamps/cursor/tool) is untouched by the ride; the compiled copy is
        // handed to the engine under levels.js TRANSIENT, never registered in
        // CACHE, so the splash roster never sees a phantom row.
        const testRide = { active: false }
        const storedList = () => {
            try { return decodeCustom(localStorage.getItem(CUSTOM_KEY)) } catch { return [] }
        }
        const rebuildDraft = () => { draft.track = buildTrack(compileCustom(draft.stamps, 'CUSTOM')) }
        const syncCustoms = () => {
            customsRef.current = Math.max(customsRef.current, customCount())
            setCustoms(customsRef.current)
        }
        const hydrateCustoms = () => {
            const list = storedList()
            let n = 0
            for (const e of list) {
                const built = buildTrack(compileCustom(e.stamps, e.name))
                if (!auditCustomData(built, groundY).ok) continue // garbage or a stale rule — drop it, stay dense
                built.laps = lapsOf(e.laps) // #2625 stored designs re-enter the roster on their own terms
                if (registerCustom(built, n) < 0) break
                n++
            }
            customsRef.current = n
            setCustoms(n)
        }
        const openEdit = () => {
            draft.stamps = []; draft.cursor = 120; draft.tool = 0; draft.laps = LAPS_DEFAULT; draft.msg = 'DESIGN YOUR OWN TRACK'; draft.msgT = 200
            draft.name = ''; draft.nameSel = 0 // #2651 a new design starts unnamed — the badge falls back to the roster
            draft.flashCell = -1; draft.flashT = 0; draft.tipT = 0 // #2632 fresh bay, fresh tells
            rebuildDraft()
            setMode('edit')
            audioController.playSweep(330, 520, 0.18, 'square', 0.06)
        }
        const exitEdit = () => {
            setMode('tracks')
            // land the cursor on the last real course, never back on the bay
            selRef.current = Math.min(selRef.current, TRACK_COUNT + customsRef.current - 1)
            setSel(selRef.current)
            audioController.playSweep(520, 330, 0.18, 'square', 0.06)
        }
        const saveDraft = (slotHint) => {
            const built = buildTrack(compileCustom(draft.stamps, designName(draft.name))) // #2651 the draft is saved under its own name
            const a = auditCustomData(built, groundY)
            if (!a.ok) { draft.msg = a.why; draft.msgT = 200; audioController.playNoise(0.14, 0.07); audioController.playTone(140, 0.12, 'square', 0.05); return }
            const list = storedList()
            let at = slotHint != null ? Math.min(slotHint, list.length) : (list.length >= CUSTOM_MAX ? draft.savePtr++ % CUSTOM_MAX : list.length)
            list[at] = { name: built.name, laps: draft.laps, stamps: draft.stamps.map((s) => [s.kind, s.x]) }
            while (list.length > CUSTOM_MAX) list.pop()
            try { localStorage.setItem(CUSTOM_KEY, encodeCustom(list)) } catch { /* storage off: it rides this session anyway */ }
            built.laps = lapsOf(draft.laps) // #2625 the seated entry carries the designer's number too
            registerCustom(built, at)
            syncCustoms()
            draft.msg = 'SAVED ' + built.name + ' — TRACK ' + (TRACK_COUNT + at + 1) // #2651 the receipt speaks the name it stored
            draft.msgT = 200
            audioController.playSweep(440, 880, 0.25, 'square', 0.08)
            // #2632 item 4: a default-book SAVE is the moment to teach the tool
            // that sets the race length. Once per storage, then it never nags.
            let seenTip = true // storage off: the tip stays unseen rather than looping
            try { seenTip = localStorage.getItem(LAP_TIP_KEY) === '1' } catch { /* no storage */ }
            const tip = lapTipFor(draft.laps, seenTip)
            if (tip) {
                try { localStorage.setItem(LAP_TIP_KEY, '1') } catch { /* it rides this session anyway */ }
                draft.tip = tip; draft.tipT = 260
                audioController.playTone(880, 0.06, 'triangle', 0.04, 0.28)
            } else draft.tipT = 0 // the lesson belongs to the SAVE that earned it — a later receipt replaces it
        }
        const testDraft = () => {
            // ONE legality law (the same auditCustomData SAVE reads) — an
            // illegal draft refuses by name and the bay never leaves.
            const built = buildTrack(compileCustom(draft.stamps, 'CUSTOM'))
            const a = auditCustomData(built, groundY)
            if (!a.ok) { draft.msg = a.why; draft.msgT = 200; audioController.playNoise(0.14, 0.07); audioController.playTone(140, 0.12, 'square', 0.05); return }
            setTestTrack(built)
            testRide.active = true
            setTesting(true) // #2573: the pad grows ABANDON while a draft is seated
            gs = makeGame(TRANSIENT, { gear: gearRef.current, laps: 1 })
            watchingRef.current = false; setWatching(false)
            bikeMem = { pump: 0 }
            noteAt = gs.tick
            parts.length = 0
            lastContact.length = 0
            clearJuice()
            keys.g = keys.b = keys.j = keys.l = keys.r = false
            setMode('play')
            seatOwn(true) // #2603 the draft is own terrain — the pad shows EXIT
            audioController.playSweep(520, 980, 0.22, 'square', 0.07)
        }
        const endTestRide = (msg) => {
            testRide.active = false
            setTesting(false) // #2573: ABANDON leaves the pad with the seat
            clearTestTrack()
            keys.g = keys.b = keys.j = keys.l = keys.r = false
            parts.length = 0
            lastContact.length = 0
            clearJuice()
            seatOwn(false) // #2603 back in the bay, the pad returns to its plain face
            setMode('edit')
            draft.msg = msg; draft.msgT = 200
            audioController.playSweep(520, 330, 0.18, 'square', 0.06)
        }
        // #2603 ESC FROM YOUR OWN TRACK — a splash-seated custom is abandoned back
        // into the bay with the design loaded. The registry entry rides its own
        // compile output (`stamps`), so the draft that opens is byte-for-byte the
        // terrain you were just riding — no storage round trip, no reinterpretation.
        // Abandoning submits nothing: the sim stops the tick the screen leaves
        // play, and finish() (the only writer of the leaderboard) never runs.
        const abandonToBay = () => {
            const t = track(gs.track)
            const st = ((t && t.stamps) || []).map(([kind, x]) => ({ kind, x }))
            draft.stamps = st
            draft.laps = lapsOf(t && t.laps) // #2625 reload carries the number you rode, not just the terrain
            draft.name = t && t.name && t.name !== 'CUSTOM' ? t.name : '' // #2651 the name rides back too — re-saving never silently renames
            draft.nameSel = 0
            draft.cursor = 120
            draft.tool = 0
            rebuildDraft()
            keys.g = keys.b = keys.j = keys.l = keys.r = false
            parts.length = 0
            lastContact.length = 0
            clearJuice()
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
            seatOwn(false)
            setMode('edit')
            draft.msg = st.length ? 'BACK TO THE BAY — DESIGN LOADED' : 'BACK TO THE BAY — DRAW SOMETHING'
            draft.msgT = 200
            audioController.playSweep(520, 330, 0.18, 'square', 0.06)
        }
        const editExecute = () => {
            const kind = TOOLS[draft.tool]
            if (kind === 'SAVE') return saveDraft(null)
            if (kind === 'TEST') return testDraft()
            if (kind === 'EXIT') return exitEdit()
            // #2651 NAME is a SETTING like LAP — geometry untouched. A commits
            // the wheel letter; the 12-char cap refuses by name (same manner as
            // the legality audit refuses a bad stamp — the bay never lies).
            if (kind === 'NAME') {
                const next = pushName(draft.name, NAME_WHEEL[draft.nameSel])
                if (next === null) { draft.msg = NAME_MAX + ' LETTERS MAX'; draft.msgT = 90; audioController.playTone(140, 0.1, 'square', 0.05); return }
                draft.name = next
                audioController.playTone(660 + draft.name.length * 40, 0.05, 'square', 0.05)
                draft.msg = 'NAME ' + draft.name; draft.msgT = 60
                return
            }
            // #2625 LAP is a SETTING, not a stamp — it never touches the draft's
            // geometry or the fits law; it just advances the designer's number,
            // wrapping 8→1 so the whole 1–8 book is reachable by repeating A.
            if (kind === 'LAP') {
                const c = lapCycle(draft.laps) // #2625 the wheel law; #2632 names its ends
                draft.laps = c.laps
                audioController.playTone(300 + draft.laps * 55, 0.07, 'square', 0.05)
                // #2632 item 2: the top of the book and the wrap deserve tells —
                // the cell flinches white and the step tone becomes a double-note
                // (a rising fifth home, a falling drop off the wrap).
                if (c.tell) {
                    audioController.playTone(c.tell === 'top' ? 1110 : 237, 0.07, 'square', 0.05, 0.09)
                    draft.flashCell = draft.tool; draft.flashT = 5
                }
                draft.msg = 'LAPS ' + draft.laps; draft.msgT = 80
                return
            }
            if (kind === 'ERASE') {
                const i = stampAt(draft.stamps, draft.cursor)
                if (i >= 0) { draft.stamps.splice(i, 1); rebuildDraft(); audioController.playTone(200, 0.08, 'triangle', 0.05); draft.msg = 'ERASED'; draft.msgT = 90 }
                else { audioController.playTone(160, 0.07, 'square', 0.04) }
                return
            }
            if (draft.stamps.length >= 12) { draft.msg = 'FULL — 12 OBSTACLES'; draft.msgT = 140; audioController.playNoise(0.1, 0.05); return }
            if (!fitsAt(draft.stamps, kind, draft.cursor)) { draft.msg = 'NO — IT MUST FIT'; draft.msgT = 140; audioController.playTone(130, 0.12, 'square', 0.06); return }
            draft.stamps.push({ kind, x: draft.cursor })
            rebuildDraft()
            if (kind === 'RAMP' || kind === 'STEP') audioController.playTone(kind === 'RAMP' ? 240 : 180, 0.1, 'square', 0.06)
            else audioController.playTone(kind === 'WATER' ? 520 : kind === 'BOOST' ? 700 : 320, 0.08, 'triangle', 0.05)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { selRef.current = 0; setSel(0); setMode('tracks'); audioController.playTone(520, 0.08, 'square', 0.05); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            // #2563 THE SPLASH — the NES selection screen. The cursor walks the
            // six-course roster (wrap lives in levels.js `nextSel`, the same
            // law excitecheck SPLASH pins); Enter/Space/digits seat you, G
            // sets the gear the old title hint always promised, Esc steps back.
            if (sc === 'tracks') {
                // #2576: the roster of rows is 6 + saved customs + EDIT TRACK;
                // the cursor law wraps that grown n (the shipped-pin is n=6).
                const rows = TRACK_COUNT + customsRef.current
                const n = rows + 1
                const onEditRow = selRef.current >= rows
                // #1656 multi-screen contract: the one-tap ▶ WATCH lands Space
                // here first — so Y on the splash starts the run AND seats the
                // prover, same beat as the single-screen shells.
                if (isWatchKey(e)) { if (onEditRow) return openEdit(); startPlay(selRef.current); watchingRef.current = true; setWatching(true); playWatchStart(); return }
                if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { selRef.current = nextSel(selRef.current, 1, n); setSel(selRef.current); audioController.playTone(440 + selRef.current * 60, 0.05, 'square', 0.05) }
                else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { selRef.current = nextSel(selRef.current, -1, n); setSel(selRef.current); audioController.playTone(440 + selRef.current * 60, 0.05, 'square', 0.05) }
                else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { if (onEditRow) openEdit(); else startPlay(selRef.current) }
                else if (e.code === 'Digit0') openEdit() // 0 opens the design bay from anywhere on the splash
                else if (/^Digit[1-6]$/.test(e.code)) { const d = +e.code.slice(5) - 1; if (d < TRACK_COUNT) { selRef.current = d; setSel(d); startPlay(d) } }
                else if (e.code === 'KeyG') { gearRef.current = gearRef.current === 'high' ? 'low' : 'high'; setGear(gearRef.current); say('GEAR: ' + gearRef.current.toUpperCase()) }
                else if (e.code === 'Escape') setMode('attract')
                return
            }
            // #2576 EDIT TRACK keys: ←/→ walk the 40px cursor, ↑/↓ the tool
            // strip (both wrap, the same cursor law as the splash), Space/A
            // executes the tool under the cursor, 1-3 save slots, Esc exits.
            // #2651 NAME repurposes the same keys on its row: ←/→ walk the
            // 27-glyph letter wheel (A–Z + space), A/SPACE commits the letter,
            // Backspace (the pad's DEL) takes one back. One pad, no new axes.
            if (sc === 'edit') {
                if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && e.repeat) return
                const naming = TOOLS[draft.tool] === 'NAME'
                if (e.code === 'ArrowLeft') { if (naming) draft.nameSel = (draft.nameSel + NAME_WHEEL.length - 1) % NAME_WHEEL.length; else draft.cursor = (draft.cursor - CUR_STEP + LAP) % LAP; audioController.playTone(naming ? 520 + draft.nameSel * 18 : 300, 0.03, 'square', 0.03) }
                else if (e.code === 'ArrowRight') { if (naming) draft.nameSel = (draft.nameSel + 1) % NAME_WHEEL.length; else draft.cursor = (draft.cursor + CUR_STEP) % LAP; audioController.playTone(naming ? 520 + draft.nameSel * 18 : 300, 0.03, 'square', 0.03) }
                else if (e.code === 'ArrowUp') { draft.tool = nextSel(draft.tool, -1, TOOLS.length); audioController.playTone(440 + draft.tool * 40, 0.04, 'square', 0.04) }
                else if (e.code === 'ArrowDown') { draft.tool = nextSel(draft.tool, 1, TOOLS.length); audioController.playTone(440 + draft.tool * 40, 0.04, 'square', 0.04) }
                else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') editExecute()
                else if (e.code === 'Backspace') { if (naming && draft.name) { draft.name = popName(draft.name); audioController.playTone(240, 0.05, 'square', 0.04) } } // #2651 DEL — the pad's B button lands here
                else if (/^Digit[1-3]$/.test(e.code)) saveDraft(+e.code.slice(5) - 1)
                else if (e.code === 'KeyX' || e.code === 'Escape') exitEdit()
                else if (e.code === 'KeyG') { gearRef.current = gearRef.current === 'high' ? 'low' : 'high'; setGear(gearRef.current) }
                return
            }
            if (pausedRef.current || e.repeat) return
            // #2587 a TEST lap is one Esc long — straight back to the bay with
            // the draft exactly where you left it (the missing esc-to-the-bay).
            if (testRide.active && e.code === 'Escape') { endTestRide('BACK TO THE BAY'); return }
            // #2603 your own design gives you back — Esc mid-custom walks out of
            // the race into the bay, stamps loaded from the seated entry. The
            // league keeps its promise: tracks 0-5 never match ownTerrain.
            if (e.code === 'Escape' && ownTerrain(gs.track)) { abandonToBay(); return }
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
            if (e.code === 'ArrowLeft') keys.l = true    // #2457 steer OUT to the far line
            if (e.code === 'ArrowRight') keys.r = true    // #2457 back to the near line
            if (e.code === 'KeyG') { gearRef.current = gearRef.current === 'high' ? 'low' : 'high'; setGear(gearRef.current); gs.gear = gearRef.current; say('GEAR: ' + gearRef.current.toUpperCase()) }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowUp') keys.g = false
            if (e.code === 'ArrowDown') keys.b = false
            if (e.code === 'Space') keys.j = false
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
        }
        const onBlur = () => { keys.g = keys.b = keys.j = keys.l = keys.r = false }
        const onPointer = (e) => {
            const sc = screenRef.current
            // #2563: the pad zone is a STEERING surface on the splash — a push
            // there walks the cursor (its arrows do); a tap outside the pad (or
            // the A button's Space) seats the course. Without this guard the
            // stick's own pointerdown would ride you into the race mid-push.
            if (e && e.target && e.target.closest && e.target.closest('[data-vc]')) return
            // #2563: marquee → splash → race. A tap on the splash seats the
            // course the cursor is on (arrows move it; there is only one pad).
            if (sc === 'attract') { selRef.current = 0; setSel(0); setMode('tracks') }
            else if (sc === 'tracks') { if (selRef.current >= TRACK_COUNT + customsRef.current) openEdit(); else startPlay(selRef.current) }
            else if (sc === 'edit') editExecute() // one pad: its arrows steer the cursor/tool, a tap (or A) executes
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
        hydrateCustoms() // #2576 saved designs ride before you ever open the bay

        if (import.meta.env.DEV) {
            window.__bikeTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, track: gs.track, end: gs.end,
                    test: testRide.active, // #2587 riding a draft, not the league
                    own: ownRef.current, // #2603 own terrain — the pad shows EXIT
                    sel: selRef.current, tracks: TRACK_COUNT, // #2563 splash cursor + roster size
                    customs: customsRef.current, rows: TRACK_COUNT + customsRef.current + 1, // #2576 saved designs + EDIT row
                    customLaps: [...Array(customsRef.current)].map((_, k) => lapsOf((track(TRACK_COUNT + k) || {}).laps)), // #2625 each saved design's race length, in roster order
                    customPace: [...Array(customsRef.current)].map((_, k) => (track(TRACK_COUNT + k) || {}).pace ?? null), // #2642 each saved design's pack grade, in roster order
                    rev: revLog.slice(-4), // #2573 item 4 — gear-bound seat-rev receipts
                    edit: screenRef.current === 'edit' ? {
                        cursor: draft.cursor, tool: TOOLS[draft.tool], stamps: draft.stamps.map((s) => [s.kind, s.x]),
                        laps: draft.laps, // #2625 the designer's number, live in the bay
                        name: draft.name, nameSel: draft.nameSel, // #2651 the naming wheel, live
                        fits: fitsAt(draft.stamps, TOOLS[draft.tool], draft.cursor),
                        msg: draft.msgT > 0 ? draft.msg : '',
                        tip: draft.tipT > 0 ? draft.tip : '', // #2632 item 4 — the one-time lesson, live
                        flash: draft.flashT, // #2632 item 2 — the end-of-book flinch frames
                        stamp: { bob: bikeBob(vclock), cx: bayPaint.cx, gy: bayPaint.gy, on: bayPaint.on }, // #2665 paint-time receipt of the bay stamp
                        labels: bayPaint.labels, // #2665 per-label paint colours as the canvas saw them
                    } : null,
                    customNames: [...Array(customsRef.current)].map((_, k) => (track(TRACK_COUNT + k) || {}).name || ''), // #2651 the roster speaks its names
                    x: gs.x, total: gs.total, v: gs.v, alt: gs.alt, vy: gs.vy, pitch: gs.pitch,
                    air: gs.air, airT: gs.airT, crash: gs.crash, stall: gs.stall, pumpT: gs.pumpT,
                    heat: gs.heat, hot: gs.hot, gear: gs.gear, rank: gs.rank, score: gs.score,
                    lap: gs.lap, laps: gs.laps, clock: gs.clock, count: gs.count, inBand: gs.inBand,
                    lane: +gs.lane.toFixed(3),   // #2457 lateral line
                    rivals: gs.rivals.map((r) => ({ name: r.name, d: Math.round(r.d), air: r.air, down: r.down, crashes: r.crashes, tk: r.tk, held: r.held, lane: +r.lane.toFixed(2) })),
                    contact: lastContact.slice(-14),
                    toast: { msg: toastMsg, left: toast, prio: toastPrio }, // #2434 headline-vs-minor probe
                    fxRBump, // #2434 renderer-side on-screen scuffle count (vacuity)
                    juice: { pops: pops.length, flashes: flashes.length, scars: scars.length, lean: Object.keys(leans).length + (leanYou.t ? 1 : 0), preTell },
                    screenX: Math.max(0, gs.x - 84) ? 84 : gs.x, screenY: g2s(gs.alt) - 6 - laneDy(gs.lane),
                }),
                start: () => startPlay(0),
                watching: () => watchingRef.current, // #1637 watchcheck pilot drives these
                watchSfx: watchSfxLog,
                // #2647 the seat ladder + label the marquee is flying, and a
                // fast-forward to the CURRENT seat's last input — the finish tick
                // still replays through the real doSim, so the viewer guard and
                // the rotation are driven honestly; only the clock is skipped.
                demo: () => ({ seat: demoSeq % demoSeats(customsRef.current).length, seats: demoSeats(customsRef.current), label: demoTrackRef.current }),
                demoSkip: () => { const ss = demoSeats(customsRef.current); demoAt = Math.max(0, demoRunFor(ss[demoSeq % ss.length]).script.length - 1) },
                track: (i) => startPlay(i),
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.track !== undefined) { gs = makeGame(opts.track, { gear: gs.gear, count: 0 }) }
                    lastContact.length = 0
                    fxRBump = 0
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
                        ...(opts.lane !== undefined && { lane: opts.lane }),   // #2457 rigs can seat the bike on a line
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
                    `line ${gs.lane.toFixed(2)}  rivals ${gs.rivals.map((r) => `${r.name}:${r.lane.toFixed(2)}`).join(' ')}`,
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
                            for (const [name, patch] of [['gas', { g: true }], ['brake', { b: true }], ['jump', { g: true, j: true }], ['far line', { g: true, l: true }], ['near line', { g: true, r: true }], ['coast', {}]]) {
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
                <div className="absolute font-mono text-[10px] leading-tight" style={{ top: 'calc(4.75rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}>
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
                <div className="absolute flex flex-col items-center gap-1" style={{ top: 'calc(4.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
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
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(13rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    <div className="absolute inset-x-0 text-center pointer-events-none" style={{ top: 'calc(5rem + var(--sat, 0px))' }}>
                        <h1 data-wordmark className="font-black tracking-tight" style={{ color: '#e40000', fontSize: 'clamp(1.5rem, 5vh, 2.25rem)', textShadow: '2px 2px 0 #ffe23f, 4px 4px 0 #000' }}>EXCITEBIKE</h1>
                        <p className="text-white font-mono font-bold mt-3 animate-pulse">{PRESS}</p>
                        <span className="block mt-2 font-mono text-[11px] tracking-widest text-emerald-300/90">{WATCH_ATTRACT_HINT}</span>
                        <AttractMessage className="text-cyan-100/80 mt-2 px-8" messages={MESSAGES} />
                        {/* #2647 the marquee names what flies — MOTOCROSS or YOUR
                            design, so the garage sees itself from across the room.
                            A caption, not a message (#365 one-at-a-time holds). */}
                        <span data-demo-track data-demo-name={demoTrack} className="block mt-3 font-mono text-[10px] tracking-[0.35em] text-[#ffe23f]/70">DEMO · {demoTrack}</span>
                    </div>
                </>
            )}

            {/* #2563 THE SPLASH — the NES track catalogue between marquee and
                race. The proven demo keeps rolling behind the dim; a bike
                cursor walks the six-course roster. Keyboard: arrows/digits/
                Enter, G gear, Esc back. Touch: the pad (arrows + A) or tap. */}
            {screen === 'tracks' && (
                <>
                    <div className="absolute inset-0 bg-black/72 pointer-events-none" />
                    <div className="absolute inset-x-0 text-center pointer-events-none" style={{ top: 'calc(0.9rem + var(--sat, 0px))' }}>
                        {/* #2573 item 2 — at phone widths the wordmark shared the chrome row
                            and crowded ARCADE/PAUSE/the speaker; it now shrinks with the
                            viewport so it always sits clear BETWEEN the corner buttons. */}
                        <h1 data-wordmark className="font-black tracking-tight" style={{ color: '#e40000', fontSize: 'clamp(1rem, 3.5vw, 1.5rem)', textShadow: '2px 2px 0 #ffe23f, 3px 3px 0 #000' }}>EXCITEBIKE</h1>
                        <div className="mt-1 text-white/70 font-mono text-[10px] tracking-[0.4em]">TRACKS</div>
                    </div>
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none font-mono">
                        {[...Array(TRACK_COUNT + customs)].map((_, i) => {
                            // #2625 a design that breaks the two-lap book wears
                            // its number on the roster — you see the length you're
                            // about to ride before you seat it.
                            const L = i >= TRACK_COUNT ? lapsOf((track(i) || {}).laps) : LAPS_DEFAULT
                            // #2642 GRADED PACK — your design wears its pack grade
                            // (0–3 pips of the measured cap), the catalogue grammar.
                            const PK = i >= TRACK_COUNT ? Math.max(0, Math.min(3, Math.round(((track(i) || {}).pace || 0) / 0.02))) : 0
                            return (
                            <div key={i} className={`flex items-center gap-2 text-sm sm:text-base ${i === sel ? 'text-yellow-300' : 'text-white/85'}`}>
                                <span className="w-5 text-right"><BikeCursor on={i === sel} /></span>
                                <span className="w-20 sm:w-24 text-right whitespace-nowrap">{i < TRACK_COUNT ? `TRACK ${i + 1}` : `CUSTOM ${i - TRACK_COUNT + 1}`}</span>
                                <span className={`w-32 text-left font-bold ${i === sel ? '' : 'font-normal'}`}>{i < TRACK_COUNT ? trackName(i) : (trackName(i) !== 'CUSTOM' ? trackName(i) : '·  ·  ·  ·  ·')}</span>
                                {i < TRACK_COUNT ? (
                                    <span className="text-[11px] leading-none tracking-tight" style={{ textShadow: '1px 1px #000' }} aria-label={`grade ${trackBite(i)}`}>
                                        {'▰'.repeat(trackBite(i))}<span className="text-white/25">{'▱'.repeat(TRACK_COUNT - trackBite(i))}</span>
                                    </span>
                                ) : (
                                    <>
                                        {/* #2632 item 3 — the badge has two forms: the full
                                            `★ YOURS · 3 LAPS` from sm up (byte-identical), and a
                                            compact `★ 3L` under it, so the row clears the pack-pip
                                            column at 375px. One [data-custom-laps] holder either way. */}
                                        <span className="text-[11px] leading-none text-orange-300" aria-label="your own design" data-custom-laps={L}>
                                            <span className="hidden sm:inline">★ YOURS{L !== LAPS_DEFAULT ? ` · ${L} LAP${L === 1 ? '' : 'S'}` : ''}</span>
                                            <span className="sm:hidden" data-badge-compact={badgeCompact(L)}>{badgeCompact(L)}</span>
                                        </span>
                                        <span className="text-[11px] leading-none tracking-tight text-emerald-300" style={{ textShadow: '1px 1px #000' }} data-pack={PK} aria-label={`pack grade ${PK} of 3`}>{'▰'.repeat(PK)}<span className="text-white/25">{'▱'.repeat(3 - PK)}</span></span>
                                    </>
                                )}
                            </div>
                            )
                        })}
                        {/* #2576 EDIT TRACK — the original's second menu entry: last row, digit 0, or walk the cursor onto it */}
                        <div className={`flex items-center gap-2 text-sm sm:text-base ${sel >= TRACK_COUNT + customs ? 'text-yellow-300' : 'text-white/85'}`}>
                            <span className="w-5 text-right"><BikeCursor on={sel >= TRACK_COUNT + customs} /></span>
                            <span className="w-20 sm:w-24 text-right whitespace-nowrap">EDIT</span>
                            <span className="w-32 text-left font-bold">DESIGN TRACK</span>
                            <span className="text-[11px] leading-none text-cyan-300" aria-label="design your own course">✎ 0</span>
                        </div>
                        <div className="mt-3 text-[10px] text-cyan-200/90 tracking-widest animate-pulse">ENTER RIDES · 1-6 FAST · 0 EDIT · G GEAR ({gear.toUpperCase()})</div>
                        <div className="text-[10px] text-white/45 tracking-widest">↑↓ PICK COURSE · ESC BACK</div>
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
                    {/* #2632 item 1: the NES edit runs announced their distance —
                        a custom off the house book names its seat and length. */}
                    {end.book && <p className="-mt-2 mb-3 text-xs font-bold tracking-[0.25em] text-orange-300" data-over-book={end.book}>{end.book}</p>}
                    <div className="bg-black/50 border border-yellow-400/40 rounded p-3 w-72 max-w-full text-sm">
                        <div className="text-yellow-300 font-bold mb-1 tracking-widest">HALL OF FAME</div>
                        {board().map((r, i) => (<div key={i} className="flex justify-between gap-2"><span>{i + 1}.</span><span>{r.date}</span><span>{r.score}</span></div>))}
                    </div>
                    <p className="mt-4 text-xs text-cyan-100/70">gear was <b>{gear}</b> — press G on the TRACKS screen to change</p>
                    <p className="mt-2 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'EXCITEBIKE')} onResume={handleResume} />}
            {/* #2573/#2603 own terrain earns an on-screen exit: the third pad
                button rides beside the action zone and fires the exact Escape the
                esc-to-the-bay laws already honor. The TEST badge calls it ABANDON
                (#2573), a splash-seated design calls it EXIT (#2603 ownTerrain);
                the league's pad stays byte-unchanged — tracks 1-6 commit. */}
            <VirtualControls visible={(play || screen === 'tracks' || screen === 'edit') && !paused} secondAction={screen === 'edit' ? { label: 'DEL', code: 'Backspace' } : null} thirdAction={play && ownRide ? { label: testing ? 'ABANDON' : 'EXIT', code: 'Escape' } : null} />
        </div>
    )
}

export default ExcitebikeGame
